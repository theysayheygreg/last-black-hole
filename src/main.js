/**
 * main.js — Game loop, canvas setup, wiring.
 *
 * Architecture:
 *   - WebGL canvas: fluid sim rendering (Layer 0)
 *   - 2D canvas overlay: ship rendering (Layer 1, separate from fluid)
 *   - Fluid sim runs on GPU, ship reads fluid velocity at its position
 */

import { CONFIG } from './config.js';
import { FluidSim } from './fluid.js';
import { Ship } from './ship.js';
import { WellSystem } from './wells.js';
import { initTestAPI } from './test-api.js';

// ---- State ----
let glCanvas, gl;
let overlayCanvas, ctx;
let fluid, ship, wellSystem;
let running = true;
let totalTime = 0;
let timeScale = 1.0;
let fps = 60;
let frameCount = 0;
let fpsTimer = 0;
let lastFrameTime = 0;

// ---- Init ----

function init() {
  // WebGL canvas — fluid rendering
  glCanvas = document.getElementById('fluid-canvas');
  glCanvas.width = window.innerWidth;
  glCanvas.height = window.innerHeight;
  gl = glCanvas.getContext('webgl2', {
    alpha: false,
    antialias: false,
    preserveDrawingBuffer: false,
  });
  if (!gl) {
    console.error('WebGL 2 not supported');
    return;
  }

  // Check for float texture support
  const ext1 = gl.getExtension('EXT_color_buffer_float');
  if (!ext1) {
    console.warn('EXT_color_buffer_float not available, trying fallback');
  }
  gl.getExtension('OES_texture_float_linear');

  // 2D overlay canvas — ship rendering (separate layer)
  overlayCanvas = document.getElementById('overlay-canvas');
  overlayCanvas.width = window.innerWidth;
  overlayCanvas.height = window.innerHeight;
  ctx = overlayCanvas.getContext('2d');

  // Init fluid sim
  fluid = new FluidSim(gl);

  // Init well system — start with 1 well at center
  wellSystem = new WellSystem();
  wellSystem.addWell(0.5, 0.5, 1.0);

  // Init ship — offset from center so it's not in the well
  ship = new Ship(glCanvas.width, glCanvas.height);

  // Input handlers
  overlayCanvas.addEventListener('mousemove', (e) => {
    ship.setMouse(e.clientX, e.clientY);
  });
  overlayCanvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) ship.setThrust(true);
  });
  overlayCanvas.addEventListener('mouseup', (e) => {
    if (e.button === 0) ship.setThrust(false);
  });
  // Prevent context menu on right-click
  overlayCanvas.addEventListener('contextmenu', (e) => e.preventDefault());

  // Handle resize
  window.addEventListener('resize', () => {
    glCanvas.width = window.innerWidth;
    glCanvas.height = window.innerHeight;
    overlayCanvas.width = window.innerWidth;
    overlayCanvas.height = window.innerHeight;
    ship.canvasWidth = glCanvas.width;
    ship.canvasHeight = glCanvas.height;
  });

  // Seed initial density so the fluid is visible from the start
  seedInitialFluid();

  // Init test API
  initTestAPI(() => ({
    ship,
    fluid,
    wellSystem,
    canvasWidth: glCanvas.width,
    canvasHeight: glCanvas.height,
    fps,
    setTimeScale: (s) => { timeScale = s; },
    restart: () => { restart(); },
  }));

  // Start loop
  lastFrameTime = performance.now();
  requestAnimationFrame(gameLoop);
}

function seedInitialFluid() {
  // Inject some initial density around the well and across the field
  // so there's something visible from frame 1
  for (let i = 0; i < 20; i++) {
    const angle = (i / 20) * Math.PI * 2;
    const dist = 0.1 + Math.random() * 0.15;
    const x = 0.5 + Math.cos(angle) * dist;
    const y = 0.5 + Math.sin(angle) * dist;
    fluid.splat(
      x, y,
      Math.cos(angle) * 0.001, Math.sin(angle) * 0.001,
      0.002,
      0.2 + Math.random() * 0.3,
      0.1 + Math.random() * 0.2,
      0.05 + Math.random() * 0.1
    );
  }
  // Broader ambient density
  for (let i = 0; i < 10; i++) {
    fluid.splat(
      0.2 + Math.random() * 0.6,
      0.2 + Math.random() * 0.6,
      0, 0,
      0.01,
      0.05, 0.15, 0.2
    );
  }
}

function restart() {
  totalTime = 0;
  ship.teleport(glCanvas.width * 0.7, glCanvas.height * 0.5);
  // Re-seed fluid
  seedInitialFluid();
}

// ---- Game Loop ----

function gameLoop(now) {
  if (!running) return;

  const rawDt = (now - lastFrameTime) / 1000;
  lastFrameTime = now;

  // Clamp dt to prevent spiral of death
  const dt = Math.min(rawDt, 1 / 30) * timeScale;
  totalTime += dt;

  // FPS tracking
  frameCount++;
  fpsTimer += rawDt;
  if (fpsTimer >= 1.0) {
    fps = frameCount / fpsTimer;
    frameCount = 0;
    fpsTimer = 0;
  }

  // 1. Fluid sim step
  const simDt = 1 / 60; // fixed sim timestep for stability
  fluid.step(simDt);

  // 2. Well forces (inject into fluid)
  wellSystem.update(fluid, simDt, totalTime);

  // 3. Ship update (reads fluid, applies thrust, feels gravity)
  ship.update(dt, fluid, wellSystem);

  // 4. Render fluid (Layer 0 — WebGL canvas)
  const wellUVs = wellSystem.getUVPositions();
  fluid.render(null, wellUVs);

  // 5. Render ship overlay (Layer 1 — 2D canvas, separate from fluid)
  ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
  ship.render(ctx);

  // 6. FPS display
  if (CONFIG.debug.showFPS) {
    ctx.save();
    ctx.fillStyle = '#00ff00';
    ctx.font = '14px monospace';
    ctx.fillText(`FPS: ${fps.toFixed(0)}`, 10, 20);
    ctx.fillText(`Ship: (${ship.x.toFixed(0)}, ${ship.y.toFixed(0)})`, 10, 38);
    ctx.fillText(`Vel: (${ship.vx.toFixed(1)}, ${ship.vy.toFixed(1)})`, 10, 56);
    ctx.fillText(`Fluid: (${ship.lastFluidVel.x.toFixed(2)}, ${ship.lastFluidVel.y.toFixed(2)})`, 10, 74);
    if (ship.waveMagnetismActive) {
      ctx.fillStyle = '#00ffff';
      ctx.fillText('WAVE LOCK', 10, 92);
    }
    ctx.restore();
  }

  // 7. Debug: well radii
  if (CONFIG.debug.showWellRadii) {
    ctx.save();
    const wellData = wellSystem.getWellData(overlayCanvas.width, overlayCanvas.height);
    for (const w of wellData) {
      ctx.strokeStyle = 'rgba(255, 100, 0, 0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(w.x, w.y, 50, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(w.x, w.y, 120, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(w.x, w.y, 200, 0, Math.PI * 2);
      ctx.stroke();
      // Well center marker
      ctx.fillStyle = 'rgba(255, 50, 0, 0.5)';
      ctx.beginPath();
      ctx.arc(w.x, w.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  requestAnimationFrame(gameLoop);
}

// ---- Start ----
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
