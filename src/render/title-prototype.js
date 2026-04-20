// src/render/title-prototype.js
//
// Standalone title-screen prototype. Loaded by title-prototype.html.
//
// Drives the LBH multi-pass Composer (src/render/composer.js) end to end,
// using the existing FluidSim for physics and three Pass subclasses
// (FluidDisplayPass + BloomPass + ASCIIPass) for the display chain. Same
// Composer pattern the main game now uses — the prototype exists to let
// us iterate on title-specific passes in isolation from gameplay state.
//
// Per frame:
//   1. Step FluidSim physics (sim-core passes inside fluid.js)
//   2. WellSystem applies well forces; PlanetoidSystem injects comet wakes
//   3. Composer runs HDR chain:
//        FluidDisplayPass            writes HDR scene color
//        BloomPass                   catches highlights > 1.0, blurs, composites back
//        TonemapPass                 ACES filmic — compresses HDR to LDR
//        ColorGradePass              split-tone: cool shadows, warm highlights
//        VignettePass                radial darkening (pre-ASCII so glyph
//                                      density thins at corners)
//        ASCIIPass                   reads LDR + velocity tex, writes to FBO
//        ChromaticAberrationPass     lens fringing on the glyph buffer
//        ScanlinesPass               terminal — CRT horizontal scan texture
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
import { BloomPass } from './passes/bloom-pass.js';
import { TonemapPass } from './passes/tonemap-pass.js';
import { ColorGradePass } from './passes/color-grade-pass.js';
import { ChromaticAberrationPass } from './passes/chromatic-aberration-pass.js';
import { VignettePass } from './passes/vignette-pass.js';
import { ASCIIPass } from './passes/ascii-pass.js';
import { ScanlinesPass } from './passes/scanlines-pass.js';

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

const query = new URLSearchParams(window.location.search);
const probeMode = query.has('probe') || query.has('readback');

// --- WebGL 2 context ---
const gl = glCanvas.getContext('webgl2', {
  alpha: false,
  antialias: false,
  preserveDrawingBuffer: probeMode,
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
// HDR-aware chain: fluid display emits values > 1.0 on hot regions
// (accretion rim, event horizon glow). Bloom catches those, tonemap
// compresses back to LDR, vignette closes the frame, ASCII quantizes.
const composer = new Composer(gl);
const fluidDisplayPass = new FluidDisplayPass(fluid);
const bloomPass = new BloomPass(gl, {
  threshold: 0.8,     // HDR: only real highlights
  knee: 0.25,
  strength: 1.1,
  blurRadius: 4.5,    // wide enough that the halo spreads visibly
  scale: 0.5,
});
const tonemapPass = new TonemapPass({ exposure: 1.0 });
// Color grade now runs near-neutral because the temperature ramp is
// baked into FRAG_DISPLAY (fluid.js) — radial distance from each well
// drives the blackbody progression: violet → red → orange → white
// (hottest ring) → light blue → blue → purple → black. The grade is
// kept as a light saturation/contrast touch, not the identity driver.
const colorGradePass = new ColorGradePass({
  shadowTint: [0.95, 0.92, 1.0],
  highlightTint: [1.08, 1.0, 0.95],
  shadowStrength: 0.25,
  highlightStrength: 0.35,
});
const vignettePass = new VignettePass({ strength: 1.05, radius: 0.35, softness: 0.55 });
// ASCII writes to FBO (not screen) so post-ASCII effects can run.
const asciiPass = new ASCIIPass(gl, { rendersToScreen: false });
// Chromatic aberration runs AFTER ASCII because its RGB channel shift
// gets averaged away if ASCII's per-cell luminance sample runs afterward.
// Post-ASCII keeps the fringing visible on the glyphs themselves.
// Aberration dialed way down — was reading as an RGB pixel grid overlay,
// competing with the ASCII quantization. At 0.005 it reads as a subtle
// CRT lens artifact at the corners only, not a whole-frame effect.
const chromaticAberrationPass = new ChromaticAberrationPass({ strength: 0.005, falloff: 2.4 });
// Scanlines is the new terminal — CRT texture applied to the final frame.
const scanlinesPass = new ScanlinesPass({ intensity: 0.22, frequency: 1.5 });
composer.add(fluidDisplayPass);
composer.add(bloomPass);
composer.add(tonemapPass);
composer.add(colorGradePass);
composer.add(vignettePass);
composer.add(asciiPass);
composer.add(chromaticAberrationPass);
composer.add(scanlinesPass);

// Camera slowly drifts around world center. Small amplitude + long period
// so the title feels alive without distracting from it. Two different
// frequencies on X vs Y trace a lissajous loop, keeping the motion from
// feeling like a straight oscillation.
const CAMERA_CENTER_X = WORLD_SCALE / 2;
const CAMERA_CENTER_Y = WORLD_SCALE / 2;
const CAMERA_DRIFT_AMPLITUDE = 0.03;
const CAMERA_DRIFT_PERIOD_X = 22;
const CAMERA_DRIFT_PERIOD_Y = 17;
let camX = CAMERA_CENTER_X;
let camY = CAMERA_CENTER_Y;

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

  // --- Camera drift ---
  camX = CAMERA_CENTER_X + Math.sin((totalTime / CAMERA_DRIFT_PERIOD_X) * Math.PI * 2) * CAMERA_DRIFT_AMPLITUDE;
  camY = CAMERA_CENTER_Y + Math.cos((totalTime / CAMERA_DRIFT_PERIOD_Y) * Math.PI * 2) * CAMERA_DRIFT_AMPLITUDE;

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
  passes: { fluidDisplayPass, bloomPass, tonemapPass, colorGradePass, vignettePass, asciiPass, chromaticAberrationPass, scanlinesPass },
  get camX() { return camX; },
  get camY() { return camY; },
  get totalTime() { return totalTime; },
  probeMode,
  map: MAP_TITLE,
};
