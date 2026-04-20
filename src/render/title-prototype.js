// src/render/title-prototype.js
//
// Standalone title-screen prototype. Loaded by title-prototype.html.
//
// Drives the new LBH multi-pass Composer (src/render/composer.js) end to
// end, using the existing FluidSim for physics and two Pass subclasses
// (FluidDisplayPass + ASCIIPass) for the display chain. The main game
// (src/main.js) still uses the legacy ASCIIRenderer; it will migrate here
// once the pipeline proves out more effects.
//
// Per frame:
//   1. Step FluidSim physics (sim-core passes inside fluid.js)
//   2. WellSystem applies well forces; PlanetoidSystem injects comet wakes
//   3. Composer runs [FluidDisplayPass → ASCIIPass]:
//        FluidDisplayPass  writes scene color to composer FBO A
//        ASCIIPass         reads FBO A + velocity tex, writes to screen
//   4. 2D overlay canvas draws planetoid sprites on top
//
// Adding a new effect later = new Pass file + one line in the composer.add()
// chain. Nothing else changes.

import { CONFIG } from '../config.js';
import { FluidSim } from '../fluid.js';
import { WellSystem } from '../wells.js';
import { PlanetoidSystem } from '../planetoids.js';
import { applySceneOverrides } from '../scene-config.js';
import { WORLD_SCALE, worldToFluidUV, setWorldScale } from '../coords.js';
import { MAP as MAP_TITLE } from '../maps/title-screen.js';

import { Composer } from './composer.js';
import { FluidDisplayPass } from './passes/fluid-display-pass.js';
import { ASCIIPass } from './passes/ascii-pass.js';

// --- DOM references ---
const glCanvas = document.getElementById('render-canvas');
const overlayCanvas = document.getElementById('overlay-canvas');
const titleOverlay = document.getElementById('title-overlay');
const elFps = document.getElementById('fps-text');

// --- Canvas sizing ---
function sizeCanvases() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  glCanvas.width = w;
  glCanvas.height = h;
  overlayCanvas.width = w;
  overlayCanvas.height = h;
}
sizeCanvases();

// --- WebGL 2 context ---
const gl = glCanvas.getContext('webgl2', {
  alpha: false,
  antialias: false,
  preserveDrawingBuffer: false,
});
if (!gl) throw new Error('WebGL 2 unavailable');
// Enable half-float rendering for the fluid FBOs (RGBA16F).
if (!gl.getExtension('EXT_color_buffer_float')) {
  console.warn('EXT_color_buffer_float missing — fluid FBOs may fail to render');
}
gl.clearColor(0, 0, 0, 1);

// --- 2D overlay context for planetoids ---
const ctx2d = overlayCanvas.getContext('2d');

// --- Apply title-screen scene overrides ---
applySceneOverrides(CONFIG, MAP_TITLE.configOverrides);
setWorldScale(MAP_TITLE.worldScale);

// --- Systems ---
const fluid = new FluidSim(gl);
const wellSystem = new WellSystem();
const planetoidSystem = new PlanetoidSystem();

for (const w of MAP_TITLE.wells) {
  wellSystem.addWell(w.x, w.y, {
    mass: w.mass,
    orbitalDir: w.orbitalDir ?? 1,
    killRadius: w.killRadius,
    accretionSpinRate: w.spinRate,
    accretionPoints: w.points,
    accretionRadius: w.accretionRadius,
    accretionRate: w.accretionRate,
  });
}
for (const pd of (MAP_TITLE.planetoids || [])) {
  if (pd.type === 'orbit') {
    const well = wellSystem.wells[pd.wellIndex];
    if (well) planetoidSystem.spawnOrbit(well);
  }
}

// --- Composer + pass chain ---
const composer = new Composer(gl);
const fluidDisplayPass = new FluidDisplayPass(fluid);
const asciiPass = new ASCIIPass(gl);
composer.add(fluidDisplayPass);
composer.add(asciiPass);

// Camera locks to world center for the title screen.
const camX = WORLD_SCALE / 2;
const camY = WORLD_SCALE / 2;

// --- Resize ---
window.addEventListener('resize', () => {
  sizeCanvases();
  composer.resize(glCanvas.width, glCanvas.height);
});

// --- Input ---
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyR') {
    fluid.clear();
  } else if (e.code === 'Space') {
    titleOverlay.style.transition = 'none';
    titleOverlay.style.opacity = '0';
    requestAnimationFrame(() => {
      titleOverlay.style.transition = 'opacity 1.8s ease-out';
      titleOverlay.style.opacity = '1';
    });
    e.preventDefault();
  }
});

// --- Loop ---
let lastTime = performance.now();
let totalTime = 0;
let frameCount = 0;
let fpsTimer = 0;

const SIM_DT = 1 / CONFIG.sim.fixedHz;
let simAccumulator = 0;

function frame(now) {
  const dtRaw = Math.min(0.1, (now - lastTime) / 1000);
  lastTime = now;
  totalTime += dtRaw;

  // --- Fixed-step physics ---
  simAccumulator += dtRaw;
  let steps = 0;
  while (simAccumulator >= SIM_DT && steps < CONFIG.sim.maxStepsPerFrame) {
    const aT = CONFIG.fluid.ambientTurbulence;
    const aD = CONFIG.fluid.ambientDensity;
    if (aT > 0 || aD > 0) {
      fluid.splat(
        Math.random(), Math.random(),
        (Math.random() - 0.5) * aT,
        (Math.random() - 0.5) * aT,
        0.04,
        aD * 0.5, aD * 0.6, aD * 1.0,
      );
    }

    fluid.fadeVisualDensity(CONFIG.fluid.visualDensityFade ?? 0.92);

    wellSystem.update(fluid, SIM_DT, totalTime);
    planetoidSystem.update(SIM_DT, fluid, totalTime, wellSystem, null);

    fluid.setWellPositions(wellSystem.getUVPositions());
    fluid.step(SIM_DT);

    simAccumulator -= SIM_DT;
    steps++;
  }

  // --- Build per-frame context for the pass chain ---
  const wellUVs = wellSystem.getUVPositions();
  const wellMasses = wellSystem.getUVMasses();
  const wellShapes = wellSystem.getRenderShapes();
  const [camFU, camFV] = worldToFluidUV(camX, camY);
  const a = CONFIG.ascii;

  const frameContext = {
    fluidDisplay: {
      wellUVs, wellMasses, wellShapes,
      camFU, camFV,
      worldScale: WORLD_SCALE,
      totalTime,
      inhibitorData: null,
    },
    ascii: {
      velocityTex: fluid.velocity.read.tex,
      cellSize: a.cellSize,
      cellAspect: a.cellAspect,
      contrast: a.contrast,
      shimmer: a.shimmer,
      dirThreshold: a.dirThreshold ?? 0.01,
      glitchIntensity: 0,
      camFU, camFV,
      worldScale: WORLD_SCALE,
      totalTime,
    },
  };

  composer.render(frameContext);

  // --- 2D overlay: planetoids ---
  ctx2d.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
  planetoidSystem.render(ctx2d, camX, camY, overlayCanvas.width, overlayCanvas.height);

  // --- FPS ---
  frameCount++;
  fpsTimer += dtRaw;
  if (fpsTimer >= 0.5) {
    if (elFps) elFps.textContent = String(Math.round(frameCount / fpsTimer));
    frameCount = 0;
    fpsTimer = 0;
  }

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Probe hook.
window.__TITLE_PROTOTYPE__ = {
  gl,
  fluid,
  wellSystem,
  planetoidSystem,
  composer,
  passes: { fluidDisplayPass, asciiPass },
  get totalTime() { return totalTime; },
  camX, camY,
  map: MAP_TITLE,
};
