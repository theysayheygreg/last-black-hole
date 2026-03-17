/**
 * main.js — Game loop, canvas setup, wiring.
 *
 * V3: 3x3 world-space with camera follow. Portals + planetoids.
 *
 * Architecture:
 *   - WebGL canvas: fluid sim rendering (Layer 0)
 *   - 2D canvas overlay: ship + entities (Layer 1, separate from fluid)
 *   - Camera follows ship with smooth lerp + velocity lead-ahead
 */

import { CONFIG } from './config.js';
import { FluidSim } from './fluid.js';
import { Ship } from './ship.js';
import { WellSystem } from './wells.js';
import { StarSystem } from './stars.js';
import { LootSystem } from './loot.js';
import { WaveRingSystem } from './wave-rings.js';
import { PortalSystem } from './portals.js';
import { PlanetoidSystem } from './planetoids.js';
import { InputManager } from './input.js';
import { ASCIIRenderer } from './ascii-renderer.js';
import { initTestAPI } from './test-api.js';
import { initDevPanel } from './dev-panel.js';
import { WORLD_SCALE, CAMERA_VIEW, pxPerWorld, worldToFluidUV, worldToScreen, screenToWorld,
         worldDisplacement, screenToFluidUV, fluidVelToScreen } from './coords.js';

// ---- State ----
let glCanvas, gl;
let overlayCanvas, ctx;
let fluid, ship, wellSystem, starSystem, lootSystem, waveRings;
let portalSystem, planetoidSystem;
let inputManager, asciiRenderer;
let running = true;
let totalTime = 0;
let timeScale = 1.0;
let fps = 60;
let frameCount = 0;
let fpsTimer = 0;
let lastFrameTime = 0;
let growthTimer = 0;
let gamePhase = 'playing'; // 'playing' | 'dead' | 'escaped' | 'paused'
let deathTimer = 0;
let escapeTimer = 0;

// Camera state — world-space center of screen
let camX = 1.5;
let camY = 1.5;

// ---- Init ----

function init() {
  // WebGL canvas
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

  const ext1 = gl.getExtension('EXT_color_buffer_float');
  if (!ext1) console.warn('EXT_color_buffer_float not available');
  gl.getExtension('OES_texture_float_linear');

  // 2D overlay canvas
  overlayCanvas = document.getElementById('overlay-canvas');
  overlayCanvas.width = window.innerWidth;
  overlayCanvas.height = window.innerHeight;
  ctx = overlayCanvas.getContext('2d');

  // Init systems
  fluid = new FluidSim(gl);
  asciiRenderer = new ASCIIRenderer(gl);

  // === WELL SYSTEM — spread across 3x3 world ===
  wellSystem = new WellSystem();
  wellSystem.addWell(1.0, 1.2, {
    mass: 1.5, orbitalDir: 1, killRadius: 0.06,
    accretionSpinRate: 0.6, accretionPoints: 8,
  });
  wellSystem.addWell(2.1, 0.9, {
    mass: 0.8, orbitalDir: -1, killRadius: 0.035,
    accretionSpinRate: 1.4, accretionPoints: 4,
  });
  wellSystem.addWell(1.95, 2.16, {
    mass: 1.2, orbitalDir: 1, killRadius: 0.05,
    accretionSpinRate: 0.9, accretionPoints: 6,
  });
  wellSystem.addWell(0.6, 2.25, {
    mass: 0.5, orbitalDir: -1, killRadius: 0.03,
    accretionSpinRate: 1.8, accretionPoints: 3,
  });

  // === STAR SYSTEM ===
  starSystem = new StarSystem();
  starSystem.addStar(1.5, 1.65, { mass: 0.8, orbitalDir: 1 });
  starSystem.addStar(0.45, 0.75, { mass: 0.5, orbitalDir: -1 });

  // === LOOT SYSTEM ===
  lootSystem = new LootSystem();
  lootSystem.addLoot(1.5, 1.05);
  lootSystem.addLoot(1.35, 2.1);
  lootSystem.addLoot(2.4, 1.65);

  // === PORTAL SYSTEM — exit wormholes ===
  portalSystem = new PortalSystem();
  portalSystem.addPortal(0.3, 0.3);   // upper-left, near S1 push zone
  portalSystem.addPortal(2.7, 2.7);   // lower-right, opposite corner

  // === PLANETOID SYSTEM ===
  planetoidSystem = new PlanetoidSystem();
  // Seed initial orbiting planetoids around wells
  planetoidSystem.spawnOrbit(wellSystem.wells[0]);
  planetoidSystem.spawnOrbit(wellSystem.wells[2]);
  // Seed a figure-8 between wells 0 and 1
  if (wellSystem.wells.length >= 2) {
    planetoidSystem.spawnFigure8(wellSystem.wells[0], wellSystem.wells[1]);
  }

  // Init input manager
  inputManager = new InputManager();

  // Init wave ring system
  waveRings = new WaveRingSystem();

  // Init ship — start in safe open space (away from wells AND stars)
  ship = new Ship(glCanvas.width, glCanvas.height);
  ship.wx = 1.5;
  ship.wy = 0.45;

  // Init camera to ship position
  camX = ship.wx;
  camY = ship.wy;

  // Input handlers
  overlayCanvas.addEventListener('mousemove', (e) => {
    ship.setMouse(e.clientX, e.clientY);
  });
  overlayCanvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) {
      if (gamePhase === 'paused') return;
      if ((gamePhase === 'dead' && deathTimer > 1.0) ||
          (gamePhase === 'escaped' && escapeTimer > 1.0)) {
        restart();
      } else if (gamePhase === 'playing') {
        ship.setThrust(true);
      }
    }
  });
  overlayCanvas.addEventListener('mouseup', (e) => {
    if (e.button === 0) ship.setThrust(false);
  });
  overlayCanvas.addEventListener('contextmenu', (e) => e.preventDefault());

  // Pause menu
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (gamePhase === 'playing') {
        gamePhase = 'paused';
        ship.setThrust(false);
      } else if (gamePhase === 'paused') {
        gamePhase = 'playing';
      }
    }
  });

  // Pause menu click handler
  overlayCanvas.addEventListener('click', (e) => {
    if (gamePhase !== 'paused') return;
    const cx = overlayCanvas.width / 2;
    const cy = overlayCanvas.height / 2;
    const btnW = 200, btnH = 40;
    if (e.clientX >= cx - btnW / 2 && e.clientX <= cx + btnW / 2 &&
        e.clientY >= cy - 10 - btnH && e.clientY <= cy - 10) {
      gamePhase = 'playing';
    }
    if (e.clientX >= cx - btnW / 2 && e.clientX <= cx + btnW / 2 &&
        e.clientY >= cy + 10 && e.clientY <= cy + 10 + btnH) {
      restart();
    }
  });

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

  // Seed initial density
  seedInitialFluid();

  // Init test API
  initTestAPI(() => ({
    ship,
    fluid,
    wellSystem,
    starSystem,
    lootSystem,
    portalSystem,
    planetoidSystem,
    waveRings,
    inputManager,
    canvasWidth: glCanvas.width,
    canvasHeight: glCanvas.height,
    camX, camY,
    fps,
    setTimeScale: (s) => { timeScale = s; },
    restart: () => { restart(); },
  }));

  // Init dev panel
  initDevPanel();

  // Start loop
  lastFrameTime = performance.now();
  requestAnimationFrame(gameLoop);
}

function seedInitialFluid() {
  for (const well of wellSystem.wells) {
    const [wellFU, wellFV] = worldToFluidUV(well.wx, well.wy);
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      const dist = 0.015 + Math.random() * 0.04;
      const x = wellFU + Math.cos(angle) * dist;
      const y = wellFV + Math.sin(angle) * dist;
      fluid.splat(
        x, y,
        Math.cos(angle) * 0.0005, Math.sin(angle) * 0.0005,
        0.001,
        0.15 + Math.random() * 0.25 * well.mass,
        0.08 + Math.random() * 0.15,
        0.03 + Math.random() * 0.08
      );
    }
  }
  // Broader ambient density scattered across the fluid field
  for (let i = 0; i < 25; i++) {
    fluid.splat(
      0.05 + Math.random() * 0.9,
      0.05 + Math.random() * 0.9,
      0, 0, 0.003,
      0.04, 0.12, 0.18
    );
  }
}

const STARTING_MASSES = [1.5, 0.8, 1.2, 0.5];

function restart() {
  totalTime = 0;
  growthTimer = 0;
  gamePhase = 'playing';
  deathTimer = 0;
  escapeTimer = 0;
  waveRings.rings = [];

  // Reset well masses
  for (let i = 0; i < wellSystem.wells.length; i++) {
    wellSystem.wells[i].mass = STARTING_MASSES[i] ?? 1.0;
  }

  // Reset ship
  ship.teleport(1.5, 0.45);
  camX = ship.wx;
  camY = ship.wy;

  // Reset planetoids
  planetoidSystem.planetoids = [];
  planetoidSystem.spawnTimer = 10;
  planetoidSystem.spawnOrbit(wellSystem.wells[0]);
  planetoidSystem.spawnOrbit(wellSystem.wells[2]);
  if (wellSystem.wells.length >= 2) {
    planetoidSystem.spawnFigure8(wellSystem.wells[0], wellSystem.wells[1]);
  }

  seedInitialFluid();
}

// ---- Camera ----

function updateCamera(dt) {
  // Smooth lerp toward ship with velocity lead-ahead
  const leadAmount = 0.3; // seconds of lead
  const targetX = ship.wx + ship.vx * leadAmount;
  const targetY = ship.wy + ship.vy * leadAmount;

  // Toroidal displacement from cam to target
  const [dx, dy] = worldDisplacement(camX, camY, targetX, targetY);

  const lerpSpeed = 3.0; // higher = tighter follow
  const t = Math.min(lerpSpeed * dt, 0.5);
  camX += dx * t;
  camY += dy * t;

  // Wrap camera to [0, WORLD_SCALE]
  camX = ((camX % WORLD_SCALE) + WORLD_SCALE) % WORLD_SCALE;
  camY = ((camY % WORLD_SCALE) + WORLD_SCALE) % WORLD_SCALE;
}

// ---- Game Loop ----

function gameLoop(now) {
  if (!running) return;

  const rawDt = (now - lastFrameTime) / 1000;
  lastFrameTime = now;
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

  // === SIMULATION (frozen when paused) ===
  if (gamePhase !== 'paused') {

  // 1. Fluid sim step
  const simDt = 1 / 60;
  const wellUVsForSim = wellSystem.getUVPositions();
  const shipUV = worldToFluidUV(ship.wx, ship.wy);
  const allDensitySources = [
    ...wellUVsForSim,
    ...starSystem.getUVPositions(),
    ...lootSystem.getUVPositions(),
    ...portalSystem.getUVPositions(),
    ...planetoidSystem.getUVPositions(),
    shipUV,
  ];
  fluid.setWellPositions(allDensitySources);
  fluid.step(simDt);

  // 2. Well forces
  wellSystem.update(fluid, simDt, totalTime);

  // 2a. Star forces
  starSystem.update(fluid, simDt, totalTime);

  // 2b. Ambient turbulence
  const turbStr = CONFIG.fluid.ambientTurbulence;
  const densStr = CONFIG.fluid.ambientDensity;
  if (turbStr > 0 || densStr > 0) {
    for (let i = 0; i < 3; i++) {
      const rx = Math.random();
      const ry = Math.random();
      const angle = Math.random() * Math.PI * 2;
      const forceMag = turbStr * (0.5 + Math.random());
      fluid.splat(
        rx, ry,
        Math.cos(angle) * forceMag,
        Math.sin(angle) * forceMag,
        0.003 + Math.random() * 0.005,
        densStr * (0.3 + Math.random() * 0.7),
        densStr * (0.5 + Math.random() * 0.5),
        densStr * (0.6 + Math.random() * 0.4)
      );
    }
  }

  // 2c. Loot anchors
  lootSystem.update(fluid, simDt, totalTime);

  // 2d. Portal fluid effects
  portalSystem.update(fluid, simDt, totalTime);

  // 2e. Planetoid fluid effects + well consumption
  planetoidSystem.update(dt, fluid, totalTime, wellSystem, waveRings);

  // 3. Well growth events
  growthTimer += dt;
  if (growthTimer >= CONFIG.events.growthInterval) {
    growthTimer -= CONFIG.events.growthInterval;
    const evtCfg = CONFIG.events;
    for (const well of wellSystem.wells) {
      well.mass += evtCfg.growthAmount;
      waveRings.spawn(well.wx, well.wy, evtCfg.growthWaveAmplitude * well.mass);
    }
  }

  // 4. Wave ring propagation
  waveRings.update(dt);

  // 5. Wave ring forces on ship
  waveRings.applyToShip(ship);

  // 5b. Input
  inputManager.poll();
  inputManager.applyToShip(ship);

  // 6. Ship update
  if (gamePhase === 'playing') {
    ship.update(dt, fluid, wellSystem, camX, camY);

    // Star push on ship
    starSystem.applyToShip(ship);

    // Planetoid push on ship
    planetoidSystem.applyToShip(ship);

    // Death check
    const killingWell = wellSystem.checkDeath(ship.wx, ship.wy);
    if (killingWell) {
      gamePhase = 'dead';
      deathTimer = 0;
      ship.setThrust(false);
    }

    // Extraction check
    if (gamePhase === 'playing') {
      const portal = portalSystem.checkExtraction(ship.wx, ship.wy);
      if (portal) {
        gamePhase = 'escaped';
        escapeTimer = 0;
        ship.setThrust(false);
      }
    }
  } else if (gamePhase === 'dead') {
    deathTimer += dt;
  } else if (gamePhase === 'escaped') {
    escapeTimer += dt;
  }

  // Update camera (after ship update)
  updateCamera(dt);

  } // end paused check

  // 7. Render fluid -> ASCII (camera-aware)
  const wellUVs = wellSystem.getUVPositions();
  const sceneTarget = asciiRenderer.getSceneTarget();
  // Camera offset in fluid UV: convert camera world-space to fluid UV
  const [camFU, camFV] = worldToFluidUV(camX, camY);
  fluid.render(sceneTarget, wellUVs, camFU, camFV, WORLD_SCALE);
  asciiRenderer.render();

  // 8. Render overlay
  ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
  waveRings.render(ctx, camX, camY, overlayCanvas.width, overlayCanvas.height);
  starSystem.render(ctx, camX, camY, overlayCanvas.width, overlayCanvas.height, totalTime);
  lootSystem.render(ctx, camX, camY, overlayCanvas.width, overlayCanvas.height, totalTime);
  portalSystem.render(ctx, camX, camY, overlayCanvas.width, overlayCanvas.height, totalTime);
  planetoidSystem.render(ctx, camX, camY, overlayCanvas.width, overlayCanvas.height);
  ship.render(ctx, camX, camY);

  // 9. FPS + debug display
  if (CONFIG.debug.showFPS) {
    const ppw = pxPerWorld(overlayCanvas.width);
    ctx.save();
    ctx.fillStyle = '#00ff00';
    ctx.font = '14px monospace';
    ctx.fillText(`FPS: ${fps.toFixed(0)}`, 10, 20);
    ctx.fillText(`Ship: (${ship.wx.toFixed(2)}, ${ship.wy.toFixed(2)})`, 10, 38);
    ctx.fillText(`Vel: (${(ship.vx * ppw).toFixed(1)}, ${(ship.vy * ppw).toFixed(1)})`, 10, 56);
    ctx.fillText(`Fluid: (${ship.lastFluidVel.x.toFixed(2)}, ${ship.lastFluidVel.y.toFixed(2)})`, 10, 74);
    ctx.fillText(`Rings: ${waveRings.getActiveCount()} | Planetoids: ${planetoidSystem.planetoids.length}`, 10, 92);
    ctx.fillText(`Input: ${inputManager.usingGamepad ? 'Gamepad' : 'Mouse'}${inputManager.usingGamepad ? ` T:${inputManager.thrustIntensity.toFixed(2)} B:${inputManager.brakeIntensity.toFixed(2)}` : ''}`, 10, 110);
    ctx.fillText(`Cam: (${camX.toFixed(2)}, ${camY.toFixed(2)})`, 10, 128);
    ctx.restore();
  }

  // 9b. Fluid diagnostic overlay
  if (CONFIG.debug.showFluidDiagnostic) {
    ctx.save();
    ctx.fillStyle = '#00ff00';
    ctx.font = '11px monospace';
    let diagY = 140;

    const shipUVDiag = worldToFluidUV(ship.wx, ship.wy);
    const shipDens = fluid.readDensityAt(shipUVDiag[0], shipUVDiag[1]);
    const shipDensMag = Math.sqrt(shipDens[0] ** 2 + shipDens[1] ** 2 + shipDens[2] ** 2);
    ctx.fillText(`--- FLUID DIAG ---`, 10, diagY); diagY += 16;
    ctx.fillText(`Ship dens: ${shipDensMag.toFixed(2)}`, 10, diagY); diagY += 14;

    const wells = wellSystem.wells;
    for (let i = 0; i < wells.length; i++) {
      const w = wells[i];
      const [wfu, wfv] = worldToFluidUV(w.wx, w.wy);
      const sampleU = wfu + 0.01;
      const sampleV = wfv + 0.01;
      const dens = fluid.readDensityAt(sampleU, sampleV);
      const densMag = Math.sqrt(dens[0] ** 2 + dens[1] ** 2 + dens[2] ** 2);
      const vel = fluid.readVelocityAt(sampleU, sampleV);
      const speed = Math.sqrt(vel[0] ** 2 + vel[1] ** 2);
      ctx.fillText(`W${i} dens:${densMag.toFixed(1)} vel:${speed.toFixed(3)}`, 10, diagY); diagY += 14;
    }

    ctx.restore();
  }

  // 10. Debug: flow field arrows
  if (CONFIG.debug.showVelocityField && fluid) {
    ctx.save();
    const gridStep = 60;
    const arrowScale = 800;
    for (let px = gridStep / 2; px < overlayCanvas.width; px += gridStep) {
      for (let py = gridStep / 2; py < overlayCanvas.height; py += gridStep) {
        const [worldX, worldY] = screenToWorld(px, py, camX, camY, overlayCanvas.width, overlayCanvas.height);
        const [fuv_x, fuv_y] = worldToFluidUV(worldX, worldY);
        const [fvx, fvy] = fluid.readVelocityAt(
          Math.max(0, Math.min(1, fuv_x)),
          Math.max(0, Math.min(1, fuv_y))
        );
        const speed = Math.sqrt(fvx * fvx + fvy * fvy);
        if (speed < 0.0001) continue;

        const [svx, svy] = fluidVelToScreen(fvx, fvy);
        const len = Math.min(speed * arrowScale, gridStep * 0.8);
        const angle = Math.atan2(svy, svx);

        const alpha = Math.min(0.8, speed * 200);
        ctx.strokeStyle = `rgba(100, 255, 200, ${alpha})`;
        ctx.lineWidth = 1.5;

        const ex = px + Math.cos(angle) * len;
        const ey = py + Math.sin(angle) * len;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(ex, ey);
        ctx.stroke();

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

  // 11. Debug: coordinate diagnostic
  if (CONFIG.debug.showCoordDiagnostic) {
    for (const well of wellSystem.wells) {
      const [fu, fv] = worldToFluidUV(well.wx, well.wy);
      fluid.splat(fu, fv, 0, 0, 0.003, 0.0, 1.0, 0.0);
    }
    ctx.save();
    for (const well of wellSystem.wells) {
      const [sx, sy] = worldToScreen(well.wx, well.wy, camX, camY, overlayCanvas.width, overlayCanvas.height);
      ctx.fillStyle = '#00ff00';
      ctx.beginPath();
      ctx.arc(sx, sy, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = '12px monospace';
      ctx.fillText(`well(${well.wx.toFixed(2)}, ${well.wy.toFixed(2)})`, sx + 12, sy - 4);
    }
    ctx.restore();
  }

  // 12. Debug: well radii and labels
  if (CONFIG.debug.showWellRadii) {
    const ppw = pxPerWorld(overlayCanvas.width);
    ctx.save();
    const wellData = wellSystem.getWellData(camX, camY, overlayCanvas.width, overlayCanvas.height);
    for (let i = 0; i < wellData.length; i++) {
      const w = wellData[i];
      ctx.strokeStyle = 'rgba(255, 100, 0, 0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(w.x, w.y, 0.15 * ppw, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(w.x, w.y, 0.3 * ppw, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(w.x, w.y, 0.5 * ppw, 0, Math.PI * 2); ctx.stroke();
      // Kill radius
      ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)';
      const kr = wellSystem.wells[i].killRadius * ppw;
      ctx.beginPath(); ctx.arc(w.x, w.y, kr, 0, Math.PI * 2); ctx.stroke();
      // Label
      ctx.fillStyle = 'rgba(255, 50, 0, 0.5)';
      ctx.beginPath(); ctx.arc(w.x, w.y, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ff6633';
      ctx.font = '11px monospace';
      ctx.fillText(`W${i} m:${wellSystem.wells[i].mass.toFixed(2)}`, w.x + 8, w.y - 6);
    }

    // Stars
    for (let i = 0; i < starSystem.stars.length; i++) {
      const star = starSystem.stars[i];
      const [sx, sy] = worldToScreen(star.wx, star.wy, camX, camY, overlayCanvas.width, overlayCanvas.height);
      const pushR1 = CONFIG.stars.rayLength * WORLD_SCALE * ppw;
      ctx.strokeStyle = 'rgba(255, 255, 100, 0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(sx, sy, pushR1, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = 'rgba(255, 255, 100, 0.6)';
      ctx.beginPath(); ctx.arc(sx, sy, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffff66';
      ctx.font = '11px monospace';
      ctx.fillText(`S${i} m:${star.mass.toFixed(2)}`, sx + 8, sy - 6);
    }

    // Loot
    for (let i = 0; i < lootSystem.anchors.length; i++) {
      const loot = lootSystem.anchors[i];
      if (!loot.alive) continue;
      const [lx, ly] = worldToScreen(loot.wx, loot.wy, camX, camY, overlayCanvas.width, overlayCanvas.height);
      const glowR = CONFIG.loot.glowRadius * WORLD_SCALE * ppw; // UV → world → px
      ctx.strokeStyle = 'rgba(100, 200, 255, 0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(lx, ly, glowR, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#66ccff';
      ctx.font = '11px monospace';
      ctx.fillText(`L${i}`, lx + 8, ly - 6);
    }

    // Portals
    for (let i = 0; i < portalSystem.portals.length; i++) {
      const portal = portalSystem.portals[i];
      const [px, py] = worldToScreen(portal.wx, portal.wy, camX, camY, overlayCanvas.width, overlayCanvas.height);
      const captureR = CONFIG.portals.captureRadius * ppw;
      ctx.strokeStyle = 'rgba(180, 80, 255, 0.4)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.arc(px, py, captureR, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#b855ff';
      ctx.font = '11px monospace';
      ctx.fillText(`P${i}`, px + 8, py - 6);
    }

    ctx.restore();
  }

  // === DEATH SCREEN ===
  if (gamePhase === 'dead') {
    ctx.save();
    const fadeAlpha = Math.min(deathTimer * 0.8, 0.7);
    ctx.fillStyle = `rgba(0, 0, 0, ${fadeAlpha})`;
    ctx.fillRect(0, 0, overlayCanvas.width, overlayCanvas.height);

    if (deathTimer > 0.5) {
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

  // === ESCAPED SCREEN ===
  if (gamePhase === 'escaped') {
    ctx.save();
    const fadeAlpha = Math.min(escapeTimer * 0.6, 0.5);
    ctx.fillStyle = `rgba(10, 5, 30, ${fadeAlpha})`;
    ctx.fillRect(0, 0, overlayCanvas.width, overlayCanvas.height);

    if (escapeTimer > 0.5) {
      ctx.fillStyle = `rgba(100, 255, 255, ${Math.min((escapeTimer - 0.5) * 2, 1)})`;
      ctx.font = 'bold 48px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('ESCAPED', overlayCanvas.width / 2, overlayCanvas.height / 2 - 20);

      ctx.fillStyle = `rgba(200, 200, 220, ${Math.min((escapeTimer - 1.0) * 2, 1)})`;
      ctx.font = '20px monospace';
      ctx.fillText('Click to drop again', overlayCanvas.width / 2, overlayCanvas.height / 2 + 30);
    }
    ctx.restore();
  }

  // === PAUSE MENU ===
  if (gamePhase === 'paused') {
    const cx = overlayCanvas.width / 2;
    const cy = overlayCanvas.height / 2;
    const btnW = 200, btnH = 40;

    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(0, 0, overlayCanvas.width, overlayCanvas.height);

    ctx.fillStyle = '#88aaff';
    ctx.font = 'bold 36px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('PAUSED', cx, cy - 70);

    ctx.fillStyle = 'rgba(40, 40, 80, 0.9)';
    ctx.fillRect(cx - btnW / 2, cy - 10 - btnH, btnW, btnH);
    ctx.strokeStyle = 'rgba(100, 100, 255, 0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(cx - btnW / 2, cy - 10 - btnH, btnW, btnH);
    ctx.fillStyle = '#ccccff';
    ctx.font = '18px monospace';
    ctx.fillText('Continue', cx, cy - 10 - btnH / 2 + 6);

    ctx.fillStyle = 'rgba(40, 40, 80, 0.9)';
    ctx.fillRect(cx - btnW / 2, cy + 10, btnW, btnH);
    ctx.strokeStyle = 'rgba(100, 100, 255, 0.5)';
    ctx.strokeRect(cx - btnW / 2, cy + 10, btnW, btnH);
    ctx.fillStyle = '#ccccff';
    ctx.font = '18px monospace';
    ctx.fillText('Restart', cx, cy + 10 + btnH / 2 + 6);

    ctx.fillStyle = 'rgba(150, 150, 200, 0.6)';
    ctx.font = '13px monospace';
    ctx.fillText('ESC to resume', cx, cy + 80);

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
