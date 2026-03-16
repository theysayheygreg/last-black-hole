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
import { WaveRingSystem } from './wave-rings.js';
import { ASCIIRenderer } from './ascii-renderer.js';
import { initTestAPI } from './test-api.js';
import { initDevPanel } from './dev-panel.js';
import { wellToFluidUV, wellToScreen, screenToFluidUV, fluidVelToScreen } from './coords.js';

// ---- State ----
let glCanvas, gl;
let overlayCanvas, ctx;
let fluid, ship, wellSystem, waveRings, asciiRenderer;
let running = true;
let totalTime = 0;
let timeScale = 1.0;
let fps = 60;
let frameCount = 0;
let fpsTimer = 0;
let lastFrameTime = 0;
let growthTimer = 0; // timer for well growth events
let gamePhase = 'playing'; // 'playing' | 'dead'
let deathTimer = 0; // seconds since death (for showing death screen)

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
  // Different masses create different gravity strengths
  // Spread across the map so orbital currents and inter-well channels form
  wellSystem = new WellSystem();

  // Each well is a unique instance with its own personality
  wellSystem.addWell(0.35, 0.40, {
    mass: 1.5, orbitalDir: 1, killRadius: 25,
    accretionSpinRate: 0.6, accretionPoints: 8,  // big, slow, dramatic
  });
  wellSystem.addWell(0.70, 0.30, {
    mass: 0.8, orbitalDir: -1, killRadius: 15,
    accretionSpinRate: 1.4, accretionPoints: 4,  // small, fast, tight
  });
  wellSystem.addWell(0.65, 0.72, {
    mass: 1.2, orbitalDir: 1, killRadius: 20,
    accretionSpinRate: 0.9, accretionPoints: 6,  // medium, moderate
  });
  wellSystem.addWell(0.20, 0.75, {
    mass: 0.5, orbitalDir: -1, killRadius: 12,
    accretionSpinRate: 1.8, accretionPoints: 3,  // tiny, rapid, sparse
  });

  // Init wave ring system (event-driven waves)
  waveRings = new WaveRingSystem();

  // Init ship — start in the space between wells where interference happens
  ship = new Ship(glCanvas.width, glCanvas.height);
  ship.x = glCanvas.width * 0.48;
  ship.y = glCanvas.height * 0.55;

  // Input handlers
  overlayCanvas.addEventListener('mousemove', (e) => {
    ship.setMouse(e.clientX, e.clientY);
  });
  overlayCanvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) {
      if (gamePhase === 'dead' && deathTimer > 1.0) {
        // Restart
        restart();
        gamePhase = 'playing';
      } else {
        ship.setThrust(true);
      }
    }
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
    waveRings,
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
    // Convert well-space to fluid UV for splat injection
    const [wellFU, wellFV] = wellToFluidUV(well.x, well.y);
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      const dist = 0.05 + Math.random() * 0.12;
      const x = wellFU + Math.cos(angle) * dist;
      const y = wellFV + Math.sin(angle) * dist;
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
  growthTimer = 0;
  waveRings.rings = [];
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

  // 1. Fluid sim step — pass well positions for distance-based dissipation
  const simDt = 1 / 60; // fixed sim timestep for stability
  const wellUVsForSim = wellSystem.getUVPositions();
  fluid.setWellPositions(wellUVsForSim);
  fluid.step(simDt);

  // 2. Well forces (inject into fluid) — constant radial + orbital + spinning accretion disk
  wellSystem.update(fluid, simDt, totalTime);

  // 2b. Ambient turbulence — quantum fluctuation feel
  // Random small force/density splats to keep the fabric alive and textured
  const turbStr = CONFIG.fluid.ambientTurbulence;
  const densStr = CONFIG.fluid.ambientDensity;
  if (turbStr > 0 || densStr > 0) {
    // A few random splats per frame — enough for texture, not enough for chaos
    for (let i = 0; i < 3; i++) {
      const rx = Math.random();
      const ry = Math.random();
      const angle = Math.random() * Math.PI * 2;
      const forceMag = turbStr * (0.5 + Math.random());
      fluid.splat(
        rx, ry,
        Math.cos(angle) * forceMag,
        Math.sin(angle) * forceMag,
        0.005 + Math.random() * 0.01,
        densStr * (0.3 + Math.random() * 0.7),
        densStr * (0.5 + Math.random() * 0.5),
        densStr * (0.6 + Math.random() * 0.4)
      );
    }
  }

  // 3. Well growth events — periodic mass increase spawns wave rings
  growthTimer += dt;
  if (growthTimer >= CONFIG.events.growthInterval) {
    growthTimer -= CONFIG.events.growthInterval;
    const evtCfg = CONFIG.events;
    for (const well of wellSystem.wells) {
      well.mass += evtCfg.growthAmount;
      // Spawn an expanding wave ring from this well
      waveRings.spawn(well.x, well.y, evtCfg.growthWaveAmplitude * well.mass);
    }
  }

  // 4. Wave ring propagation
  waveRings.update(dt);

  // 5. Wave ring forces on ship
  waveRings.applyToShip(ship, glCanvas.width, glCanvas.height);

  // 6. Ship update (reads fluid, applies thrust, feels gravity)
  if (gamePhase === 'playing') {
    ship.update(dt, fluid, wellSystem);

    // 6b. Death check — did the ship fall into a well?
    const killingWell = wellSystem.checkDeath(
      ship.x, ship.y, glCanvas.width, glCanvas.height
    );
    if (killingWell) {
      gamePhase = 'dead';
      deathTimer = 0;
      ship.setThrust(false);
    }
  } else if (gamePhase === 'dead') {
    deathTimer += dt;
  }

  // 7. Render fluid -> ASCII post-process (Layer 0 — the fabric of spacetime)
  const wellUVs = wellSystem.getUVPositions();
  // Render fluid display colors into the ASCII renderer's scene FBO (not to screen)
  const sceneTarget = asciiRenderer.getSceneTarget();
  fluid.render(sceneTarget, wellUVs);
  // ASCII post-process: read scene FBO, render character grid to screen
  asciiRenderer.render();

  // 8. Render overlay (Layer 1/2 — 2D canvas: wave rings + ship)
  ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
  waveRings.render(ctx, overlayCanvas.width, overlayCanvas.height);
  ship.render(ctx);

  // 9. FPS display
  if (CONFIG.debug.showFPS) {
    ctx.save();
    ctx.fillStyle = '#00ff00';
    ctx.font = '14px monospace';
    ctx.fillText(`FPS: ${fps.toFixed(0)}`, 10, 20);
    ctx.fillText(`Ship: (${ship.x.toFixed(0)}, ${ship.y.toFixed(0)})`, 10, 38);
    ctx.fillText(`Vel: (${ship.vx.toFixed(1)}, ${ship.vy.toFixed(1)})`, 10, 56);
    ctx.fillText(`Fluid: (${ship.lastFluidVel.x.toFixed(2)}, ${ship.lastFluidVel.y.toFixed(2)})`, 10, 74);
    ctx.fillText(`Rings: ${waveRings.getActiveCount()}`, 10, 92);
    ctx.restore();
  }

  // 9b. Fluid diagnostic overlay — real-time density/velocity at key positions
  if (CONFIG.debug.showFluidDiagnostic) {
    ctx.save();
    ctx.fillStyle = '#00ff00';
    ctx.font = '11px monospace';
    let diagY = 116; // below existing FPS readout

    // Ship position density
    const shipUV = screenToFluidUV(ship.x, ship.y, overlayCanvas.width, overlayCanvas.height);
    const shipDens = fluid.readDensityAt(shipUV[0], shipUV[1]);
    const shipDensMag = Math.sqrt(shipDens[0] ** 2 + shipDens[1] ** 2 + shipDens[2] ** 2);
    ctx.fillText(`--- FLUID DIAG ---`, 10, diagY); diagY += 16;
    ctx.fillText(`Ship dens: ${shipDensMag.toFixed(2)} (${shipDens[0].toFixed(2)}, ${shipDens[1].toFixed(2)}, ${shipDens[2].toFixed(2)})`, 10, diagY); diagY += 14;

    // Each well center (offset slightly to avoid the void)
    const wells = wellSystem.wells;
    for (let i = 0; i < wells.length; i++) {
      const w = wells[i];
      const [wfu, wfv] = wellToFluidUV(w.x, w.y);
      // Offset by 0.03 UV to sample near the accretion zone, not the void center
      const sampleU = wfu + 0.03;
      const sampleV = wfv + 0.03;
      const dens = fluid.readDensityAt(sampleU, sampleV);
      const densMag = Math.sqrt(dens[0] ** 2 + dens[1] ** 2 + dens[2] ** 2);
      const vel = fluid.readVelocityAt(sampleU, sampleV);
      const speed = Math.sqrt(vel[0] ** 2 + vel[1] ** 2);
      ctx.fillText(`W${i} dens:${densMag.toFixed(1)} vel:${speed.toFixed(3)}`, 10, diagY); diagY += 14;
    }

    // Midpoint between the two closest wells
    if (wells.length >= 2) {
      let bestDist = Infinity, bestI = 0, bestJ = 1;
      for (let i = 0; i < wells.length; i++) {
        for (let j = i + 1; j < wells.length; j++) {
          const dx = wells[i].x - wells[j].x;
          const dy = wells[i].y - wells[j].y;
          const d = dx * dx + dy * dy;
          if (d < bestDist) { bestDist = d; bestI = i; bestJ = j; }
        }
      }
      const midX = (wells[bestI].x + wells[bestJ].x) / 2;
      const midY = (wells[bestI].y + wells[bestJ].y) / 2;
      const [mfu, mfv] = wellToFluidUV(midX, midY);
      const midDens = fluid.readDensityAt(mfu, mfv);
      const midDensMag = Math.sqrt(midDens[0] ** 2 + midDens[1] ** 2 + midDens[2] ** 2);
      const midVel = fluid.readVelocityAt(mfu, mfv);
      const midSpeed = Math.sqrt(midVel[0] ** 2 + midVel[1] ** 2);
      ctx.fillText(`Mid(${bestI}-${bestJ}) dens:${midDensMag.toFixed(1)} vel:${midSpeed.toFixed(3)}`, 10, diagY); diagY += 14;
    }

    // Min/max across a sparse 8x8 grid
    let minDens = Infinity, maxDens = 0;
    for (let gx = 0; gx < 8; gx++) {
      for (let gy = 0; gy < 8; gy++) {
        const gu = (gx + 0.5) / 8;
        const gv = (gy + 0.5) / 8;
        const gd = fluid.readDensityAt(gu, gv);
        const gdm = Math.sqrt(gd[0] ** 2 + gd[1] ** 2 + gd[2] ** 2);
        if (gdm < minDens) minDens = gdm;
        if (gdm > maxDens) maxDens = gdm;
      }
    }
    ctx.fillText(`Grid min:${minDens.toFixed(2)} max:${maxDens.toFixed(1)}`, 10, diagY); diagY += 14;

    ctx.restore();
  }

  // 10. Debug: flow field arrows
  if (CONFIG.debug.showVelocityField && fluid) {
    ctx.save();
    const gridStep = 60; // pixels between arrows
    const arrowScale = 800; // velocity to arrow length multiplier
    for (let px = gridStep / 2; px < overlayCanvas.width; px += gridStep) {
      for (let py = gridStep / 2; py < overlayCanvas.height; py += gridStep) {
        // Convert screen pixel to fluid UV via coords.js
        const [fuv_x, fuv_y] = screenToFluidUV(px, py, overlayCanvas.width, overlayCanvas.height);
        const [fvx, fvy] = fluid.readVelocityAt(fuv_x, fuv_y);
        const speed = Math.sqrt(fvx * fvx + fvy * fvy);
        if (speed < 0.0001) continue;

        // Convert fluid velocity to screen velocity via coords.js
        const [svx, svy] = fluidVelToScreen(fvx, fvy);
        const len = Math.min(speed * arrowScale, gridStep * 0.8);
        const angle = Math.atan2(svy, svx);

        // Arrow color: brighter = faster flow
        const alpha = Math.min(0.8, speed * 200);
        ctx.strokeStyle = `rgba(100, 255, 200, ${alpha})`;
        ctx.lineWidth = 1.5;

        // Draw arrow line
        const ex = px + Math.cos(angle) * len;
        const ey = py + Math.sin(angle) * len;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(ex, ey);
        ctx.stroke();

        // Arrowhead
        const headLen = Math.min(len * 0.3, 6);
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex - Math.cos(angle - 0.5) * headLen, ey - Math.sin(angle - 0.5) * headLen);
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex - Math.cos(angle + 0.5) * headLen, ey - Math.sin(angle + 0.5) * headLen);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // 11. Debug: coordinate diagnostic — bright green splats in fluid + overlay dots
  if (CONFIG.debug.showCoordDiagnostic) {
    // Inject bright green density into the fluid at each well's FLUID UV position
    // If coords are correct, these green blobs should align with the overlay dots below
    for (const well of wellSystem.wells) {
      const [fu, fv] = wellToFluidUV(well.x, well.y);
      fluid.splat(fu, fv, 0, 0, 0.008, 0.0, 1.0, 0.0);  // bright green
    }

    // Draw bright green dots on the overlay at each well's SCREEN position
    ctx.save();
    for (const well of wellSystem.wells) {
      const [sx, sy] = wellToScreen(well.x, well.y, overlayCanvas.width, overlayCanvas.height);
      ctx.fillStyle = '#00ff00';
      ctx.beginPath();
      ctx.arc(sx, sy, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = '12px monospace';
      ctx.fillText(`well(${well.x.toFixed(2)}, ${well.y.toFixed(2)})`, sx + 12, sy - 4);
    }
    ctx.restore();
  }

  // 12. Debug: well radii
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

  // === DEATH SCREEN ===
  if (gamePhase === 'dead') {
    ctx.save();
    // Darken overlay
    const fadeAlpha = Math.min(deathTimer * 0.8, 0.7);
    ctx.fillStyle = `rgba(0, 0, 0, ${fadeAlpha})`;
    ctx.fillRect(0, 0, overlayCanvas.width, overlayCanvas.height);

    if (deathTimer > 0.5) {
      // Death text
      ctx.fillStyle = `rgba(255, 30, 30, ${Math.min((deathTimer - 0.5) * 2, 1)})`;
      ctx.font = 'bold 48px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('CONSUMED', overlayCanvas.width / 2, overlayCanvas.height / 2 - 20);

      ctx.fillStyle = `rgba(200, 200, 200, ${Math.min((deathTimer - 1.0) * 2, 1)})`;
      ctx.font = '20px monospace';
      ctx.fillText('Click to drop again', overlayCanvas.width / 2, overlayCanvas.height / 2 + 30);
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
