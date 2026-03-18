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
import { loadMap } from './map-loader.js';
import { MAP as MAP_SHALLOWS } from './maps/shallows-3x3.js';
import { MAP as MAP_EXPANSE } from './maps/expanse-5x5.js';
import { MAP as MAP_DEEP } from './maps/deep-field-10x10.js';
import { WORLD_SCALE, pxPerWorld, worldToFluidUV, worldToScreen, screenToWorld,
         worldDistance, worldDisplacement, uvToWorld, worldToPx, wrapWorld,
         fluidVelToScreen } from './coords.js';

const MAP_LIST = [MAP_SHALLOWS, MAP_EXPANSE, MAP_DEEP];

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
let gamePhase = 'title'; // 'title' | 'mapSelect' | 'playing' | 'dead' | 'escaped' | 'paused'
let deathTimer = 0;
let escapeTimer = 0;
let titleTimer = 0;

// Camera state — world-space center of screen
let camX = 1.5;
let camY = 1.5;

// Map state
let currentMap = MAP_SHALLOWS;
let startingMasses = [];
let mapSelectIndex = 0;

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

  // Init entity systems (empty — map loader populates them)
  wellSystem = new WellSystem();
  starSystem = new StarSystem();
  lootSystem = new LootSystem();
  portalSystem = new PortalSystem();
  planetoidSystem = new PlanetoidSystem();

  // Load the default map
  const mapResult = loadMap(currentMap, {
    wellSystem, starSystem, lootSystem, portalSystem, planetoidSystem, fluid,
  });
  startingMasses = mapResult.startingMasses;

  // Init input manager
  inputManager = new InputManager();

  // Init wave ring system
  waveRings = new WaveRingSystem();

  // Init ship — find a safe spawn away from all objects
  ship = new Ship(glCanvas.width, glCanvas.height);
  const [initX, initY] = findSafeSpawn();
  ship.wx = initX;
  ship.wy = initY;

  // Init camera to ship position
  camX = ship.wx;
  camY = ship.wy;

  // Input: mouse is UI-only (menu clicks). Movement from keyboard/gamepad via InputManager.
  overlayCanvas.addEventListener('contextmenu', (e) => e.preventDefault());

  // Escape key — context-sensitive (pause during play, back in menus)
  // Actual state transitions handled in gameLoop via pausePressed/backPressed.
  // This handler just prevents default browser behavior.
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      // Edge-triggered handling is in the game loop via _prevPause.
      // ESC during play = pause. ESC during pause = quit to map select.
      if (gamePhase === 'playing') {
        togglePause();
      } else if (gamePhase === 'paused') {
        gamePhase = 'mapSelect';
      } else if (gamePhase === 'mapSelect') {
        gamePhase = 'title';
        titleTimer = 0;
      }
    }
    if (e.code === 'Space') e.preventDefault();
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
    currentMap,
    mapList: MAP_LIST,
    startGame,
    setMap: (map) => { startGame(map); },
    get gamePhase() { return gamePhase; },
    set gamePhase(p) { gamePhase = p; },
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

/**
 * Find a random world position that is "safe" — far enough from all wells,
 * stars, portals, and planetoids to not get immediately pulled in.
 * Tries random positions until one meets the minimum distance, with a fallback.
 */
function findSafeSpawn(minDist = 0.4) {
  const allObjects = [
    ...wellSystem.wells.map(w => ({ wx: w.wx, wy: w.wy })),
    ...starSystem.stars.map(s => ({ wx: s.wx, wy: s.wy })),
    ...portalSystem.portals.map(p => ({ wx: p.wx, wy: p.wy })),
  ];

  for (let attempt = 0; attempt < 50; attempt++) {
    const wx = Math.random() * WORLD_SCALE;
    const wy = Math.random() * WORLD_SCALE;
    let safe = true;
    for (const obj of allObjects) {
      if (worldDistance(wx, wy, obj.wx, obj.wy) < minDist) {
        safe = false;
        break;
      }
    }
    if (safe) return [wx, wy];
  }
  // Fallback: pick the best of 20 random candidates (furthest from nearest object)
  let bestDist = 0, bestX = 1.5, bestY = 0.45;
  for (let i = 0; i < 20; i++) {
    const wx = Math.random() * WORLD_SCALE;
    const wy = Math.random() * WORLD_SCALE;
    let nearest = Infinity;
    for (const obj of allObjects) {
      nearest = Math.min(nearest, worldDistance(wx, wy, obj.wx, obj.wy));
    }
    if (nearest > bestDist) {
      bestDist = nearest;
      bestX = wx;
      bestY = wy;
    }
  }
  return [bestX, bestY];
}

function restart() {
  totalTime = 0;
  growthTimer = 0;
  gamePhase = 'playing';
  deathTimer = 0;
  escapeTimer = 0;
  waveRings.rings = [];

  // Reset the fluid field itself so restart does not inherit the prior run's wakes,
  // turbulence, or accretion density.
  fluid.clear();

  // Reload the current map (resets all entities, world scale, planetoids)
  const mapResult = loadMap(currentMap, {
    wellSystem, starSystem, lootSystem, portalSystem, planetoidSystem, fluid,
  });
  startingMasses = mapResult.startingMasses;

  // Reset ship to a random safe position (away from all objects)
  const [spawnX, spawnY] = findSafeSpawn();
  ship.teleport(spawnX, spawnY);
  camX = ship.wx;
  camY = ship.wy;

  seedInitialFluid();
}

/**
 * Start a game on a specific map. Called from map select.
 */
function startGame(map) {
  currentMap = map;
  totalTime = 0;
  growthTimer = 0;
  deathTimer = 0;
  escapeTimer = 0;
  waveRings.rings = [];
  fluid.clear();

  const mapResult = loadMap(currentMap, {
    wellSystem, starSystem, lootSystem, portalSystem, planetoidSystem, fluid,
  });
  startingMasses = mapResult.startingMasses;

  const [spawnX, spawnY] = findSafeSpawn();
  ship.teleport(spawnX, spawnY);
  camX = ship.wx;
  camY = ship.wy;

  seedInitialFluid();
  gamePhase = 'playing';
}

// ---- Camera ----

function updateCamera(dt) {
  const cam = CONFIG.camera;
  const targetX = ship.wx + ship.vx * cam.leadAhead;
  const targetY = ship.wy + ship.vy * cam.leadAhead;

  const [dx, dy] = worldDisplacement(camX, camY, targetX, targetY);

  const t = Math.min(cam.lerpSpeed * dt, cam.maxLerp);
  camX += dx * t;
  camY += dy * t;

  camX = wrapWorld(camX);
  camY = wrapWorld(camY);
}

// ---- Game Loop ----

// Button edge detection (only trigger on press, not hold)
let _prevConfirm = false;
let _prevPause = false;
let _prevBack = false;
let _prevUp = false;
let _prevDown = false;

function togglePause() {
  if (gamePhase === 'playing') {
    gamePhase = 'paused';
    ship.setThrust(false);
  } else if (gamePhase === 'paused') {
    gamePhase = 'playing';
  }
}

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

  const inMenu = gamePhase === 'title' || gamePhase === 'mapSelect';

  // === SIMULATION (runs during gameplay AND menus for background ambiance, frozen when paused) ===
  if (gamePhase !== 'paused') {

  // 1. Fluid sim step
  const simDt = 1 / 60;
  const wellUVsForSim = wellSystem.getUVPositions();
  const allDensitySources = [
    ...wellUVsForSim,
    ...starSystem.getUVPositions(),
    ...lootSystem.getUVPositions(),
    ...portalSystem.getUVPositions(),
    ...planetoidSystem.getUVPositions(),
    ...(inMenu ? [] : [worldToFluidUV(ship.wx, ship.wy)]),
  ];
  fluid.setWellPositions(allDensitySources);
  fluid.step(simDt);

  // 2. Well forces (camera-culled on large maps)
  wellSystem.update(fluid, simDt, totalTime, camX, camY);

  // 2a. Star forces (camera-culled)
  starSystem.update(fluid, simDt, totalTime, camX, camY);

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

  // 2c. Loot anchors (camera-culled)
  lootSystem.update(fluid, simDt, totalTime, camX, camY);

  // 2d. Portal fluid effects (camera-culled)
  portalSystem.update(fluid, simDt, totalTime, camX, camY);

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
  waveRings.injectIntoFluid(fluid);

  } // end paused check

  // === INPUT (always polled — even during menus, for navigation) ===
  inputManager.poll();

  const confirmNow = inputManager.confirmPressed;
  const pauseNow = inputManager.pausePressed;
  const backNow = inputManager.backPressed;
  const upNow = inputManager.upPressed;
  const downNow = inputManager.downPressed;

  // --- Menu input (title, mapSelect) ---
  if (gamePhase === 'title') {
    titleTimer += dt;
    if ((confirmNow && !_prevConfirm) && titleTimer > 0.5) {
      gamePhase = 'mapSelect';
    }
    // Ambient camera drift
    camX = wrapWorld(WORLD_SCALE / 2 + Math.cos(totalTime * 0.05) * WORLD_SCALE * 0.25);
    camY = wrapWorld(WORLD_SCALE / 2 + Math.sin(totalTime * 0.035) * WORLD_SCALE * 0.25);

  } else if (gamePhase === 'mapSelect') {
    if (upNow && !_prevUp) mapSelectIndex = (mapSelectIndex - 1 + MAP_LIST.length) % MAP_LIST.length;
    if (downNow && !_prevDown) mapSelectIndex = (mapSelectIndex + 1) % MAP_LIST.length;
    if (confirmNow && !_prevConfirm) {
      startGame(MAP_LIST[mapSelectIndex]);
    }
    if (backNow && !_prevBack) {
      gamePhase = 'title';
      titleTimer = 0;
    }
    // Keep ambient camera drift
    camX = wrapWorld(WORLD_SCALE / 2 + Math.cos(totalTime * 0.05) * WORLD_SCALE * 0.25);
    camY = wrapWorld(WORLD_SCALE / 2 + Math.sin(totalTime * 0.035) * WORLD_SCALE * 0.25);

  } else if (gamePhase !== 'paused') {
    // --- Gameplay input ---
    if (pauseNow && !_prevPause) togglePause();

    if (confirmNow && !_prevConfirm) {
      if ((gamePhase === 'dead' && deathTimer > 1.0) ||
          (gamePhase === 'escaped' && escapeTimer > 1.0)) {
        gamePhase = 'mapSelect';
      }
    }

    // 5. Wave ring forces on ship
    waveRings.applyToShip(ship);

    inputManager.applyToShip(ship);

    // 6. Ship update
    if (gamePhase === 'playing') {
      ship.update(dt, fluid, wellSystem);

      starSystem.applyToShip(ship);
      planetoidSystem.applyToShip(ship);

      const killingWell = wellSystem.checkDeath(ship.wx, ship.wy);
      if (killingWell) {
        gamePhase = 'dead';
        deathTimer = 0;
        ship.setThrust(false);
      }

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

  } else {
    // --- Paused input ---
    if (pauseNow && !_prevPause) togglePause();
    if (backNow && !_prevBack) {
      gamePhase = 'mapSelect';
    }
    if (confirmNow && !_prevConfirm) {
      gamePhase = 'playing';
    }
  }

  _prevConfirm = confirmNow;
  _prevPause = pauseNow;
  _prevBack = backNow;
  _prevUp = upNow;
  _prevDown = downNow;

  // 7. Render fluid -> ASCII (camera-aware)
  const wellUVs = wellSystem.getUVPositions();
  const sceneTarget = asciiRenderer.getSceneTarget();
  // Camera offset in fluid UV: convert camera world-space to fluid UV
  const [camFU, camFV] = worldToFluidUV(camX, camY);
  fluid.render(sceneTarget, wellUVs, camFU, camFV, WORLD_SCALE, totalTime);
  asciiRenderer.render(totalTime, camFU, camFV, WORLD_SCALE);

  // 8. Render overlay
  ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

  if (!inMenu) {
    // Only render game entities when playing (not on title/mapSelect)
    waveRings.render(ctx, camX, camY, overlayCanvas.width, overlayCanvas.height);
    starSystem.render(ctx, camX, camY, overlayCanvas.width, overlayCanvas.height, totalTime);
    lootSystem.render(ctx, camX, camY, overlayCanvas.width, overlayCanvas.height, totalTime);
    portalSystem.render(ctx, camX, camY, overlayCanvas.width, overlayCanvas.height, totalTime);
    planetoidSystem.render(ctx, camX, camY, overlayCanvas.width, overlayCanvas.height);
    ship.render(ctx, camX, camY);
  }

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
    ctx.fillText(`Input: ${inputManager.lastInputSource} T:${inputManager.thrustIntensity.toFixed(2)} B:${inputManager.brakeIntensity.toFixed(2)}`, 10, 110);
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
      const pushR1 = worldToPx(uvToWorld(CONFIG.stars.rayLength), overlayCanvas.width);
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
      const glowR = worldToPx(uvToWorld(CONFIG.loot.glowRadius), overlayCanvas.width);
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

  // === TITLE SCREEN ===
  if (gamePhase === 'title') {
    const cx = overlayCanvas.width / 2;
    const cy = overlayCanvas.height / 2;

    ctx.save();
    ctx.textAlign = 'center';

    // Title — soft outer glow via shadow, no overlay veil
    const titlePulse = 0.85 + 0.15 * Math.sin(totalTime * 1.5);
    ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
    ctx.shadowBlur = 20;
    ctx.fillStyle = `rgba(255, 60, 30, ${titlePulse})`;
    ctx.font = 'bold 56px monospace';
    ctx.fillText('LAST SINGULARITY', cx, cy - 50);
    // Double-draw for stronger glow
    ctx.fillText('LAST SINGULARITY', cx, cy - 50);

    // Subtitle
    ctx.shadowBlur = 12;
    ctx.fillStyle = 'rgba(100, 180, 220, 0.8)';
    ctx.font = '16px monospace';
    ctx.fillText('out of a dying universe', cx, cy - 10);

    // Call to action
    ctx.fillStyle = 'rgba(180, 200, 220, 0.6)';
    ctx.font = '14px monospace';
    ctx.fillText('surf the currents. escape the void.', cx, cy + 16);

    // Prompt (fades in after 0.5s)
    if (titleTimer > 0.5) {
      const blink = Math.sin(totalTime * 3) > 0 ? 1 : 0.3;
      ctx.shadowBlur = 8;
      ctx.fillStyle = `rgba(200, 200, 220, ${blink})`;
      ctx.font = '18px monospace';
      ctx.fillText('press space to begin', cx, cy + 80);
    }

    ctx.restore();
  }

  // === MAP SELECT SCREEN ===
  if (gamePhase === 'mapSelect') {
    const cx = overlayCanvas.width / 2;
    const cy = overlayCanvas.height / 2;

    ctx.save();
    // Light veil — just enough to read text, fluid still visible
    ctx.fillStyle = 'rgba(0, 0, 20, 0.4)';
    ctx.fillRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    ctx.textAlign = 'center';

    // Header
    ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
    ctx.shadowBlur = 16;
    ctx.fillStyle = '#88aaff';
    ctx.font = 'bold 36px monospace';
    ctx.fillText('SELECT MAP', cx, cy - 160);

    // Map list
    const listTop = cy - 100;
    const itemHeight = 80;

    for (let i = 0; i < MAP_LIST.length; i++) {
      const map = MAP_LIST[i];
      const y = listTop + i * itemHeight;
      const selected = i === mapSelectIndex;

      // Selection highlight
      if (selected) {
        ctx.fillStyle = 'rgba(80, 120, 255, 0.15)';
        ctx.fillRect(cx - 280, y - 20, 560, itemHeight - 8);
        ctx.strokeStyle = 'rgba(100, 150, 255, 0.5)';
        ctx.lineWidth = 1;
        ctx.strokeRect(cx - 280, y - 20, 560, itemHeight - 8);
      }

      // Map name
      const nameAlpha = selected ? 1.0 : 0.5;
      ctx.fillStyle = selected ? '#ffffff' : '#888899';
      ctx.font = selected ? 'bold 22px monospace' : '20px monospace';
      ctx.fillText(map.name, cx, y + 4);

      // Map stats
      const size = `${map.worldScale}x${map.worldScale}`;
      const stats = `${size}  |  ${map.wells.length} wells  ${map.stars.length} stars  ${map.loot.length} loot  ${map.portals.length} portals`;
      ctx.fillStyle = `rgba(150, 160, 180, ${selected ? 0.8 : 0.4})`;
      ctx.font = '13px monospace';
      ctx.fillText(stats, cx, y + 26);
    }

    // Navigation hints
    const hintY = listTop + MAP_LIST.length * itemHeight + 30;
    ctx.fillStyle = 'rgba(150, 150, 200, 0.6)';
    ctx.font = '14px monospace';
    ctx.fillText('UP/DOWN to select  |  SPACE to launch  |  ESC to go back', cx, hintY);

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
      ctx.fillText('Press SPACE to continue', overlayCanvas.width / 2, overlayCanvas.height / 2 + 30);
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
      ctx.fillText('Press SPACE to continue', overlayCanvas.width / 2, overlayCanvas.height / 2 + 30);
    }
    ctx.restore();
  }

  // === PAUSE MENU ===
  if (gamePhase === 'paused') {
    const cx = overlayCanvas.width / 2;
    const cy = overlayCanvas.height / 2;

    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, overlayCanvas.width, overlayCanvas.height);

    ctx.textAlign = 'center';

    // Title
    ctx.fillStyle = '#88aaff';
    ctx.font = 'bold 36px monospace';
    ctx.fillText('PAUSED', cx, cy - 100);

    // Controls reference
    ctx.font = '14px monospace';
    ctx.fillStyle = '#8888cc';
    ctx.fillText('--- KEYBOARD ---', cx, cy - 60);
    ctx.fillStyle = '#aaaadd';
    ctx.font = '13px monospace';
    ctx.fillText('Arrow Keys / WASD .... Steer', cx, cy - 40);
    ctx.fillText('Space ................ Thrust', cx, cy - 24);
    ctx.fillText('Ctrl ................. Brake', cx, cy - 8);
    ctx.fillText('Escape ............... Pause', cx, cy + 8);

    ctx.fillStyle = '#8888cc';
    ctx.font = '14px monospace';
    ctx.fillText('--- GAMEPAD ---', cx, cy + 34);
    ctx.fillStyle = '#aaaadd';
    ctx.font = '13px monospace';
    ctx.fillText('Left Stick ........... Steer', cx, cy + 54);
    ctx.fillText('R2 / Right Trigger ... Thrust', cx, cy + 70);
    ctx.fillText('L2 / Left Trigger .... Brake', cx, cy + 86);
    ctx.fillText('Start / Options ...... Pause', cx, cy + 102);

    // Navigation hints
    ctx.fillStyle = 'rgba(150, 150, 200, 0.8)';
    ctx.font = '16px monospace';
    ctx.fillText('SPACE to resume  |  ESC to quit to map select', cx, cy + 140);

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
