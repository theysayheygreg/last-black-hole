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
import { ASCIIRenderer } from './ascii-renderer.js';
import { initTestAPI } from './test-api.js';
import { initDevPanel } from './dev-panel.js';

// ---- State ----
let glCanvas, gl;
let overlayCanvas, ctx;
let fluid, ship, wellSystem, asciiRenderer;
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

  // Init ASCII post-process renderer (Layer 0 visual identity)
  asciiRenderer = new ASCIIRenderer(gl);

  // Init well system — multi-well test map
  // Different masses create different wave frequencies and pull strengths
  // Spread across the map so interference patterns form between them
  wellSystem = new WellSystem();
  wellSystem.addWell(0.35, 0.40, 1.5);  // large well, left-center — slow powerful waves
  wellSystem.addWell(0.70, 0.30, 0.8);  // medium well, upper-right — faster lighter waves
  wellSystem.addWell(0.65, 0.72, 1.2);  // medium-large, lower-right — mid waves
  wellSystem.addWell(0.20, 0.75, 0.5);  // small well, lower-left — fast ripples, weak pull

  // Stagger initial phases so waves don't all pulse in sync
  wellSystem.wells[0].phase = 0;
  wellSystem.wells[1].phase = Math.PI * 0.7;
  wellSystem.wells[2].phase = Math.PI * 1.3;
  wellSystem.wells[3].phase = Math.PI * 0.4;

  // Init ship — start in the space between wells where interference happens
  ship = new Ship(glCanvas.width, glCanvas.height);
  ship.x = glCanvas.width * 0.48;
  ship.y = glCanvas.height * 0.55;

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
    asciiRenderer.resize(glCanvas.width, glCanvas.height);
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

  // Init dev panel (toggle with ` key)
  initDevPanel();

  // Start loop
  lastFrameTime = performance.now();
  requestAnimationFrame(gameLoop);
}

function seedInitialFluid() {
  // Inject density around each well so the fluid is visible from frame 1
  for (const well of wellSystem.wells) {
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      const dist = 0.05 + Math.random() * 0.12;
      const x = well.x + Math.cos(angle) * dist;
      const y = well.y + Math.sin(angle) * dist;
      fluid.splat(
        x, y,
        Math.cos(angle) * 0.0005, Math.sin(angle) * 0.0005,
        0.003,
        0.15 + Math.random() * 0.25 * well.mass,
        0.08 + Math.random() * 0.15,
        0.03 + Math.random() * 0.08
      );
    }
  }
  // Broader ambient density scattered across the field
  for (let i = 0; i < 15; i++) {
    fluid.splat(
      0.1 + Math.random() * 0.8,
      0.1 + Math.random() * 0.8,
      0, 0,
      0.008,
      0.04, 0.12, 0.18
    );
  }
}

function restart() {
  totalTime = 0;
  ship.teleport(glCanvas.width * 0.48, glCanvas.height * 0.55);
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

  // 4. Render fluid -> ASCII post-process (Layer 0 — the fabric of spacetime)
  const wellUVs = wellSystem.getUVPositions();
  // Render fluid display colors into the ASCII renderer's scene FBO (not to screen)
  const sceneTarget = asciiRenderer.getSceneTarget();
  fluid.render(sceneTarget, wellUVs);
  // ASCII post-process: read scene FBO, render character grid to screen
  asciiRenderer.render();

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
