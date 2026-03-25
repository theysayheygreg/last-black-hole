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
import { WreckSystem } from './wrecks.js';
import { PortalSystem } from './portals.js';
import { PlanetoidSystem } from './planetoids.js';
import { InputManager } from './input.js';
import { ASCIIRenderer } from './ascii-renderer.js';
import { initTestAPI } from './test-api.js';
import { initDevPanel } from './dev-panel.js';
import { initHUD, showHUD, hideHUD, updateHUD, showWarning, setDropCallback,
         resetInventoryCursor, inventoryCursorUp, inventoryCursorDown, inventoryConfirm } from './hud.js';
import { applyRuntimeFlags } from './runtime-flags.js';
import { ScavengerSystem } from './scavengers.js';
import { CombatSystem } from './combat.js';
import { AudioEngine } from './audio.js';
import { rollSignature, applySignatureConfig } from './signatures.js';
import { InventorySystem } from './inventory.js';
import { CATEGORY_COLORS, TIER_COLORS } from './items.js';
import { FlowField } from './sim/flow-field.js';
import { SimCore } from './sim/sim-core.js';
import { createSimState, freezeRunEnd, resetSimState } from './sim/sim-state.js';
import { loadMap } from './map-loader.js';
import { applySceneOverrides, revertSceneOverrides } from './scene-config.js';
import { MAP as MAP_TITLE } from './maps/title-screen.js';
import { MAP as MAP_SHALLOWS } from './maps/shallows-3x3.js';
import { MAP as MAP_EXPANSE } from './maps/expanse-5x5.js';
import { MAP as MAP_DEEP } from './maps/deep-field-10x10.js';
import { RENDERER_FIXTURES } from './maps/renderer-fixtures.js';
import { WORLD_SCALE, pxPerWorld, worldToFluidUV, worldToScreen, screenToWorld,
         worldDistance, worldDisplacement, uvToWorld, worldToPx, wrapWorld } from './coords.js';

const MAP_LIST = [MAP_SHALLOWS, MAP_EXPANSE, MAP_DEEP];

// ---- State ----
let glCanvas, gl;
let overlayCanvas, ctx;
let fluid, ship, wellSystem, starSystem, lootSystem, wreckSystem, waveRings;
let portalSystem, planetoidSystem;
let scavengerSystem, combatSystem, audioEngine, inventorySystem;
let flowField, simCore;
let currentSignature = null;
let inputManager, asciiRenderer;
let running = true;
let totalTime = 0;
let timeScale = 1.0;
let fps = 60;
let frameCount = 0;
let fpsTimer = 0;
let lastFrameTime = 0;
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
let currentCameraMode = 'follow';
let rendererFixtureActive = false;
const RUNTIME_FLAGS = applyRuntimeFlags(CONFIG);

// Run state
const simState = createSimState();
let inventoryOpen = false;  // Tab toggle state

// Scene transition state
let transitionActive = false;
let transitionTimer = 0;
let transitionCallback = null;  // called at midpoint to swap the scene
let transitionFired = false;
const TRANSITION_RAMP_UP = 0.6;    // seconds to reach full corruption
const TRANSITION_HOLD = 0.25;      // seconds at full corruption
const TRANSITION_RAMP_DOWN = 0.6;  // seconds to resolve into new scene
const TRANSITION_TOTAL = TRANSITION_RAMP_UP + TRANSITION_HOLD + TRANSITION_RAMP_DOWN;

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
  flowField = new FlowField(fluid);
  asciiRenderer = new ASCIIRenderer(gl);

  // Init entity systems (empty — loadScene populates them)
  wellSystem = new WellSystem();
  starSystem = new StarSystem();
  lootSystem = new LootSystem();
  wreckSystem = new WreckSystem();
  portalSystem = new PortalSystem();
  planetoidSystem = new PlanetoidSystem();
  scavengerSystem = new ScavengerSystem();
  combatSystem = new CombatSystem();
  audioEngine = new AudioEngine();
  inventorySystem = new InventorySystem();

  // Init input manager
  inputManager = new InputManager();

  // Init wave ring system
  waveRings = new WaveRingSystem();

  // Init ship
  ship = new Ship(glCanvas.width, glCanvas.height);

  simCore = new SimCore({
    fluid,
    flowField,
    wellSystem,
    starSystem,
    lootSystem,
    wreckSystem,
    portalSystem,
    planetoidSystem,
    scavengerSystem,
    combatSystem,
    waveRings,
    ship,
  });

  // Load title scene (clears everything, loads default map, seeds fluid)
  loadTitleScene();

  // Input: mouse is UI-only (menu clicks). Movement from keyboard/gamepad via InputManager.
  overlayCanvas.addEventListener('contextmenu', (e) => e.preventDefault());

  // Escape key — context-sensitive (pause during play, back in menus)
  // Actual state transitions handled in gameLoop via pausePressed/backPressed.
  // This handler just prevents default browser behavior.
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      // Edge-triggered handling is in the game loop via _prevPause.
      // ESC during play = pause. ESC during pause = resume.
      if (gamePhase === 'playing') {
        togglePause();
      } else if (gamePhase === 'paused') {
        togglePause();  // resume, not quit
      } else if (gamePhase === 'mapSelect' && !transitionActive) {
        // No transition needed — same scene (title map), just change UI
        gamePhase = 'title';
        titleTimer = 0;
      }
    }
    if (e.code === 'Space') e.preventDefault();
    if (e.code === 'Tab') e.preventDefault();
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

  if (RUNTIME_FLAGS.enableTestAPI) {
    initTestAPI(() => ({
      ship,
      fluid,
      flowField,
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
      loadTitleScene,
      loadRendererFixture,
      restart: () => { restart(); },
      currentMap,
      mapList: MAP_LIST,
      startGame,
      setMap: (map) => { startGame(map); },
      setOverlayVisible: (visible) => {
        overlayCanvas.style.opacity = visible ? '1' : '0';
      },
      setRendererView: (mode) => {
        asciiRenderer.setViewMode(mode);
      },
      getRendererView: () => asciiRenderer.getViewMode(),
      get gamePhase() { return gamePhase; },
      set gamePhase(p) { gamePhase = p; },
      inventorySystem,
      scavengerSystem,
      combatSystem,
      currentSignature,
    }));
  }

  if (RUNTIME_FLAGS.enableDevPanel) {
    initDevPanel();
  }
  initHUD();

  // Wire drop callback: dropping an item from inventory creates a mini-wreck at ship position
  setDropCallback((slotIndex) => {
    const item = inventorySystem.dropFromCargo(slotIndex);
    if (item) {
      // Eject in a random non-forward direction. Pick a random angle in the
      // rear hemisphere (90°-270° relative to ship facing) so it never drops
      // in front of you where you're headed.
      const pickupRadius = CONFIG.wrecks.pickupRadius;
      const ejectDist = pickupRadius * 2.5;  // guaranteed well outside pickup range
      const rearAngle = ship.facing + Math.PI + (Math.random() - 0.5) * Math.PI; // ±90° from behind
      const dropWX = wrapWorld(ship.wx + Math.cos(rearAngle) * ejectDist);
      const dropWY = wrapWorld(ship.wy + Math.sin(rearAngle) * ejectDist);

      // Give it ejection velocity so it drifts further away even if you're
      // moving backward (e.g., being pulled into a well while facing away).
      const ejectSpeed = 0.3;  // world-units/s — brisk shove, decays via drag in wrecks.js
      const ejectVX = Math.cos(rearAngle) * ejectSpeed;
      const ejectVY = Math.sin(rearAngle) * ejectSpeed;

      wreckSystem.addWreck(dropWX, dropWY, {
        type: 'derelict',
        tier: 1,
        size: 'scattered',
        pickupCooldown: 1.5,
        vx: ejectVX,
        vy: ejectVY,
      });
      const droppedWreck = wreckSystem.wrecks[wreckSystem.wrecks.length - 1];
      droppedWreck.loot = [item];
      droppedWreck.name = `dropped: ${item.name}`;
      showWarning(`dropped ${item.name}`, 'rgba(255, 150, 80, 0.8)', 1500);
    }
  });

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

/**
 * Full scene teardown + setup. The ONE authority for resetting state.
 * Every scene transition (title, map select, gameplay) calls this.
 * Nothing from the previous scene leaks into the next.
 */
function loadScene(map) {
  // 1. Revert previous scene's CONFIG overrides
  revertSceneOverrides();

  // 2. Apply new scene's CONFIG overrides
  applySceneOverrides(CONFIG, map.configOverrides);

  // 3. Reset ALL timers
  totalTime = 0;
  deathTimer = 0;
  escapeTimer = 0;
  resetSimState(simState);
  simCore?.reset();

  // 4. Reset gameplay state
  inventorySystem.clearCargo();
  inventoryOpen = false;
  waveRings.rings = [];
  scavengerSystem.scavengers = [];
  combatSystem.playerCooldown = 0;
  combatSystem.wellDisruptions = [];

  // 5. Clear ALL fluid buffers (velocity, density, pressure, visualDensity, etc.)
  fluid.clear();

  // 6. Load map (clears + repopulates all entity systems, sets world scale,
  //    reinitializes fluid if resolution changes)
  currentMap = map;
  currentCameraMode = map.camera ?? 'follow';
  const mapResult = loadMap(currentMap, {
    wellSystem, starSystem, lootSystem, wreckSystem, portalSystem, planetoidSystem, fluid,
  });
  startingMasses = mapResult.startingMasses;

  // 7. Reset camera — 'locked' = world center, 'follow' = ship sets it later
  camX = map.worldScale / 2;
  camY = map.worldScale / 2;

  // 8. Seed fresh fluid
  seedInitialFluid();
}

/**
 * Trigger a glitch transition. The callback fires at the midpoint
 * (full corruption) to swap the scene invisibly behind the noise.
 */
function triggerTransition(callback) {
  if (transitionActive) return;  // don't stack transitions
  transitionActive = true;
  transitionTimer = 0;
  transitionFired = false;
  transitionCallback = callback;
}

/** Get current glitch intensity (0-1) for the ASCII shader. */
function getGlitchIntensity() {
  if (!transitionActive) return 0;
  const t = transitionTimer;
  if (t < TRANSITION_RAMP_UP) {
    return t / TRANSITION_RAMP_UP;  // 0 → 1
  } else if (t < TRANSITION_RAMP_UP + TRANSITION_HOLD) {
    return 1.0;  // full corruption
  } else if (t < TRANSITION_TOTAL) {
    return 1.0 - (t - TRANSITION_RAMP_UP - TRANSITION_HOLD) / TRANSITION_RAMP_DOWN;  // 1 → 0
  }
  return 0;
}

/**
 * Load the title screen scene. Runs the title map as ambient background.
 */
function loadTitleScene() {
  rendererFixtureActive = false;
  loadScene(MAP_TITLE);
  gamePhase = 'title';
  titleTimer = 0;
  hideHUD();
}

function loadRendererFixture(name) {
  const fixture = RENDERER_FIXTURES[name];
  if (!fixture) return false;

  rendererFixtureActive = true;
  loadScene(fixture);
  camX = fixture.worldScale / 2;
  camY = fixture.worldScale / 2;
  gamePhase = 'mapSelect';
  titleTimer = 999;
  hideHUD();
  return true;
}

/** Transition to title with glitch effect. */
function transitionToTitle() {
  triggerTransition(() => loadTitleScene());
}

/**
 * Start a game on a specific map. Called from map select.
 */
function startGame(map) {
  rendererFixtureActive = false;
  loadScene(map);

  // Roll and apply cosmic signature
  currentSignature = rollSignature(map.worldScale);
  applySignatureConfig(currentSignature);

  // Reset audio for new run
  audioEngine.reset();

  // Place ship in a safe spawn
  const [spawnX, spawnY] = findSafeSpawn();
  ship.teleport(spawnX, spawnY);
  camX = ship.wx;
  camY = ship.wy;

  // Spawn scavengers at map edges
  const scavCount = CONFIG.scavengers.count;
  const vultureCount = Math.round(scavCount * CONFIG.scavengers.vultureRatio);
  for (let i = 0; i < scavCount; i++) {
    const archetype = i < vultureCount ? 'vulture' : 'drifter';
    // Spawn at random map edge positions
    const edge = Math.floor(Math.random() * 4);
    let sx, sy;
    if (edge === 0) { sx = Math.random() * WORLD_SCALE; sy = 0.1; }
    else if (edge === 1) { sx = Math.random() * WORLD_SCALE; sy = WORLD_SCALE - 0.1; }
    else if (edge === 2) { sx = 0.1; sy = Math.random() * WORLD_SCALE; }
    else { sx = WORLD_SCALE - 0.1; sy = Math.random() * WORLD_SCALE; }
    scavengerSystem.spawn(sx, sy, archetype);
  }

  gamePhase = 'playing';
  showHUD();
}

/** Transition to gameplay with glitch effect. */
function transitionToGame(map) {
  triggerTransition(() => startGame(map));
}

/**
 * Restart the current map (same map, fresh state).
 */
function restart() {
  startGame(currentMap);
}

function applySceneCamera(dt) {
  if (currentCameraMode === 'locked') {
    camX = currentMap.worldScale / 2;
    camY = currentMap.worldScale / 2;
    return;
  }
  updateCamera(dt);
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
let _prevPulse = false;
let _prevInventory = false;
let _prevConsumable1 = false;
let _prevConsumable2 = false;
let _prevPortalCount = -1;
let pauseMenuSelection = 0;  // 0 = return to game, 1 = exit to title

function togglePause() {
  if (gamePhase === 'playing') {
    gamePhase = 'paused';
    pauseMenuSelection = 0;  // default to "return to game"
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

  // Scene transition: tick timer, fire callback at midpoint, end when done
  if (transitionActive) {
    transitionTimer += rawDt;  // use rawDt, not scaled dt
    // Fire scene swap at the midpoint (full corruption — scene invisible)
    if (!transitionFired && transitionTimer >= TRANSITION_RAMP_UP) {
      transitionFired = true;
      if (transitionCallback) transitionCallback();
      transitionCallback = null;
    }
    // End transition
    if (transitionTimer >= TRANSITION_TOTAL) {
      transitionActive = false;
    }
  }

  const inMenu = gamePhase === 'title' || gamePhase === 'mapSelect' || rendererFixtureActive;

  // === SIMULATION (runs during gameplay AND menus for background ambiance, frozen when paused) ===
  if (gamePhase !== 'paused') {
    simCore.update(simState, {
      frameDt: dt,
      totalTime,
      inMenu,
    });

  } // end paused check

  // === INPUT (always polled — even during menus, for navigation) ===
  inputManager.poll();

  const confirmNow = inputManager.confirmPressed;
  const pauseNow = inputManager.pausePressed;
  const backNow = inputManager.backPressed;
  const upNow = inputManager.upPressed;
  const downNow = inputManager.downPressed;
  const pulseNow = inputManager.pulsePressed;
  const inventoryNow = inputManager.inventoryPressed;
  const consumable1Now = inputManager.consumable1Pressed;
  const consumable2Now = inputManager.consumable2Pressed;

  // --- Menu input (title, mapSelect) ---
  if (gamePhase === 'title') {
    titleTimer += dt;
    if (!transitionActive && (confirmNow && !_prevConfirm) && titleTimer > 0.5) {
      gamePhase = 'mapSelect';
    }
    applySceneCamera(dt);

  } else if (gamePhase === 'mapSelect') {
    if (upNow && !_prevUp) mapSelectIndex = (mapSelectIndex - 1 + MAP_LIST.length) % MAP_LIST.length;
    if (downNow && !_prevDown) mapSelectIndex = (mapSelectIndex + 1) % MAP_LIST.length;
    if (!transitionActive && confirmNow && !_prevConfirm) {
      audioEngine.init();  // first user gesture — create AudioContext
      transitionToGame(MAP_LIST[mapSelectIndex]);
    }
    if (!transitionActive && backNow && !_prevBack) {
      // Same scene (title map), just switch UI — no transition needed
      gamePhase = 'title';
      titleTimer = 0;
    }
    applySceneCamera(dt);

  } else if (gamePhase !== 'paused') {
    // --- Gameplay input ---
    if (pauseNow && !_prevPause) togglePause();

    if (!transitionActive && confirmNow && !_prevConfirm) {
      if ((gamePhase === 'dead' && deathTimer > 1.0) ||
          (gamePhase === 'escaped' && escapeTimer > 1.0)) {
        triggerTransition(() => {
          loadTitleScene();
          gamePhase = 'mapSelect';  // go straight to map select, not title
        });
      }
    }

    // 5. Wave ring forces on ship
    waveRings.applyToShip(ship);

    // Suppress ship input while inventory is open (don't fly into a well while sorting loot)
    if (!inventoryOpen) {
      inputManager.applyToShip(ship);
    }

    // 6. Ship update
    if (gamePhase === 'playing') {
      ship.update(dt, flowField, wellSystem, fluid);

      starSystem.applyToShip(ship);
      planetoidSystem.applyToShip(ship);

      // Force pulse (E key / Square button, edge-triggered)
      if (pulseNow && !_prevPulse) {
        if (combatSystem.playerPulse(ship, fluid, waveRings, wellSystem, scavengerSystem, planetoidSystem)) {
          audioEngine.playEvent('pulse', ship.wx, ship.wy, camX, camY, overlayCanvas.width, overlayCanvas.height);
        }
      }

      // Inventory toggle (Tab / I / Select)
      if (inventoryNow && !_prevInventory) {
        inventoryOpen = !inventoryOpen;
        if (inventoryOpen) resetInventoryCursor();
      }
      // Also close inventory with Cancel (Circle / Escape) when open
      if (inventoryOpen && backNow && !_prevBack) {
        inventoryOpen = false;
      }

      // Inventory navigation (when open, up/down/confirm drive cursor)
      if (inventoryOpen) {
        if (upNow && !_prevUp) inventoryCursorUp();
        if (downNow && !_prevDown) inventoryCursorDown();
        if (confirmNow && !_prevConfirm) inventoryConfirm(inventorySystem);
      }

      // Consumable hotkeys (d-pad left/right or 1/2) — only when inventory closed
      if (!inventoryOpen && consumable1Now && !_prevConsumable1) {
        const effect = inventorySystem.useConsumable(0);
        if (effect) showWarning(`used: ${inventorySystem.usedConsumables[0]?.name || 'consumable'}`, 'rgba(200, 160, 255, 0.9)', 2000);
      }
      if (!inventoryOpen && consumable2Now && !_prevConsumable2) {
        const effect = inventorySystem.useConsumable(1);
        if (effect) showWarning(`used: ${inventorySystem.usedConsumables[0]?.name || 'consumable'}`, 'rgba(200, 160, 255, 0.9)', 2000);
      }

      // Wreck pickup (blocked if cargo full)
      if (!inventorySystem.cargoFull) {
        const newItems = wreckSystem.checkPickup(ship.wx, ship.wy);
        if (newItems.length > 0) {
          const overflow = inventorySystem.addMultipleToCargo(newItems);
          const added = newItems.length - overflow.length;
          if (added > 0) {
            audioEngine.playEvent('loot', ship.wx, ship.wy, camX, camY, overlayCanvas.width, overlayCanvas.height);
            for (const item of newItems.slice(0, added)) {
              const color = TIER_COLORS[item.tier] || 'rgba(212, 168, 67, 0.9)';
              showWarning(`${item.name}`, color, 2000);
            }
          }
          if (overflow.length > 0) {
            showWarning(`cargo full — ${overflow.length} item(s) left behind`, 'rgba(255, 100, 80, 0.9)', 2500);
          }
        }
      } else {
        // Still check if near a wreck — show "cargo full" warning once
        const nearWreck = wreckSystem.wrecks.some(w =>
          w.alive && !w.looted && worldDistance(ship.wx, ship.wy, w.wx, w.wy) < CONFIG.wrecks.pickupRadius * 1.5
        );
        if (nearWreck && !inventorySystem._fullWarningShown) {
          showWarning('cargo full — open inventory [Tab] to drop', 'rgba(255, 100, 80, 0.9)', 3000);
          inventorySystem._fullWarningShown = true;
        }
        if (!nearWreck) inventorySystem._fullWarningShown = false;
      }

      // Wreck consumption by growing wells
      wreckSystem.checkWellConsumption(wellSystem, waveRings);

      const killingWell = wellSystem.checkDeath(ship.wx, ship.wy);
      if (killingWell) {
        gamePhase = 'dead';
        deathTimer = 0;
        freezeRunEnd(simState);
        ship.setThrust(false);
        audioEngine.playEvent('death');
      }

      if (gamePhase === 'playing') {
        const portal = portalSystem.checkExtraction(ship.wx, ship.wy);
        if (portal) {
          gamePhase = 'escaped';
          escapeTimer = 0;
          freezeRunEnd(simState);
          ship.setThrust(false);
          audioEngine.playEvent('extract');
        }
      }

      // Universe collapsed check — no active portals and no more waves
      if (gamePhase === 'playing' &&
          portalSystem.activeCount === 0 &&
          !portalSystem.hasMoreWaves &&
          simState.runElapsedTime > 60) {
        gamePhase = 'dead';
        deathTimer = 0;
        freezeRunEnd(simState);
        ship.setThrust(false);
      }
    } else if (gamePhase === 'dead') {
      deathTimer += dt;
    } else if (gamePhase === 'escaped') {
      escapeTimer += dt;
    }

    // Update camera (after ship update)
    applySceneCamera(dt);

  } else {
    // --- Paused input ---
    // Circle/back = resume game (not quit)
    if (backNow && !_prevBack) togglePause();
    // Start/options = also resume
    if (pauseNow && !_prevPause) togglePause();
    // Navigate menu
    if (upNow && !_prevUp) pauseMenuSelection = 0;
    if (downNow && !_prevDown) pauseMenuSelection = 1;
    // Confirm selection
    if (confirmNow && !_prevConfirm) {
      if (pauseMenuSelection === 0) {
        togglePause();  // return to game
      } else if (!transitionActive) {
        transitionToTitle();
      }
    }
  }

  _prevConfirm = confirmNow;
  _prevPause = pauseNow;
  _prevBack = backNow;
  _prevUp = upNow;
  _prevDown = downNow;
  _prevPulse = pulseNow;
  _prevInventory = inventoryNow;
  _prevConsumable1 = consumable1Now;
  _prevConsumable2 = consumable2Now;

  // 6b. Audio update — spatial mixing based on game state
  if (!inMenu) {
    audioEngine.update(dt, wellSystem.wells, ship, camX, camY,
      overlayCanvas.width, overlayCanvas.height, simState.runElapsedTime, CONFIG.universe.runDuration);
  }

  // 7. Render fluid -> ASCII (camera-aware)
  const wellUVs = wellSystem.getUVPositions();
  const wellMasses = wellSystem.getUVMasses();
  const wellShapes = wellSystem.getRenderShapes();
  const sceneTarget = asciiRenderer.getSceneTarget();
  // Camera offset in fluid UV: convert camera world-space to fluid UV
  const [camFU, camFV] = worldToFluidUV(camX, camY);
  fluid.render(sceneTarget, wellUVs, camFU, camFV, WORLD_SCALE, totalTime, wellMasses, wellShapes);
  asciiRenderer.render(totalTime, camFU, camFV, WORLD_SCALE, fluid.velocity.read.tex, getGlitchIntensity());

  // 8. Render overlay
  ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

  if (!inMenu) {
    // Only render game entities when playing (not on title/mapSelect)
    waveRings.render(ctx, camX, camY, overlayCanvas.width, overlayCanvas.height);
    starSystem.render(ctx, camX, camY, overlayCanvas.width, overlayCanvas.height, totalTime);
    lootSystem.render(ctx, camX, camY, overlayCanvas.width, overlayCanvas.height, totalTime);
    wreckSystem.render(ctx, camX, camY, overlayCanvas.width, overlayCanvas.height, totalTime);
    portalSystem.render(ctx, camX, camY, overlayCanvas.width, overlayCanvas.height, totalTime, simState.runElapsedTime);
    planetoidSystem.render(ctx, camX, camY, overlayCanvas.width, overlayCanvas.height);
    scavengerSystem.render(ctx, camX, camY, overlayCanvas.width, overlayCanvas.height, totalTime);
    ship.render(ctx, camX, camY);
    combatSystem.renderCooldown(ctx, ship, camX, camY, overlayCanvas.width, overlayCanvas.height);

    // Signature display — first 4 seconds of run
    if (currentSignature && simState.runElapsedTime < 4.0) {
      const cx = overlayCanvas.width / 2;
      const cy = overlayCanvas.height * 0.3;
      const fadeIn = Math.min(simState.runElapsedTime / 0.5, 1);
      const fadeOut = simState.runElapsedTime > 3.0 ? 1 - (simState.runElapsedTime - 3.0) : 1;
      const alpha = fadeIn * fadeOut;

      ctx.save();
      ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
      ctx.shadowBlur = 12;

      // Name
      ctx.fillStyle = `rgba(150, 200, 220, ${alpha * 0.9})`;
      ctx.font = '14px monospace';
      ctx.fillText(`entering: ${currentSignature.name}`, cx, cy);

      // Flavor text
      ctx.fillStyle = `rgba(120, 150, 170, ${alpha * 0.7})`;
      ctx.font = '12px monospace';
      ctx.fillText(currentSignature.flavor, cx, cy + 22);

      // Mechanical callouts
      ctx.fillStyle = `rgba(100, 130, 150, ${alpha * 0.5})`;
      ctx.font = '11px monospace';
      ctx.fillText(currentSignature.mechanical, cx, cy + 40);

      ctx.restore();
    }

    // Detect scavenger portal consumption (portal count dropped without player extracting)
    const currentPortalCount = portalSystem.activeCount;
    if (_prevPortalCount >= 0 && currentPortalCount < _prevPortalCount && gamePhase === 'playing') {
      const lost = _prevPortalCount - currentPortalCount;
      for (let i = 0; i < lost; i++) {
        showWarning('scavenger extracted — portal consumed', 'rgba(180, 120, 255, 0.9)', 3000);
      }
    }
    _prevPortalCount = currentPortalCount;

    // Update HUD during gameplay
    const cargoItems = inventorySystem.getCargoItems();
    updateHUD(simState.runElapsedTime, portalSystem, cargoItems, simState.growthTimer, {
      scavengerSystem,
      combatSystem,
      signature: currentSignature,
      inventorySystem,
      inventoryOpen,
      ship,
      camX, camY,
      canvasW: overlayCanvas.width,
      canvasH: overlayCanvas.height,
    });
  }

  // Show/hide HUD based on phase
  if (inMenu) hideHUD();
  else if (gamePhase === 'playing') showHUD();

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
      const vel = flowField.sampleUV(sampleU, sampleV);
      const speed = Math.sqrt(vel.x ** 2 + vel.y ** 2);
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
        const vel = flowField.sample(worldX, worldY);
        const speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y);
        if (speed < 0.0001) continue;
        const len = Math.min(speed * arrowScale, gridStep * 0.8);
        const angle = Math.atan2(vel.y, vel.x);

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
  if (!rendererFixtureActive && gamePhase === 'title') {
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
  if (!rendererFixtureActive && gamePhase === 'mapSelect') {
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
      const stats = `${size}  |  ${map.wells.length} wells  ${map.stars.length} stars  ${map.loot.length} loot  ${(map.wrecks || []).length} wrecks`;
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

  // === END SCREEN (shared for death, collapse, and extraction) ===
  if (!rendererFixtureActive && (gamePhase === 'dead' || gamePhase === 'escaped')) {
    const cx = overlayCanvas.width / 2;
    const cy = overlayCanvas.height / 2;
    const t = gamePhase === 'dead' ? deathTimer : escapeTimer;
    const isEscape = gamePhase === 'escaped';
    const collapsed = !isEscape && portalSystem.activeCount === 0 && !portalSystem.hasMoreWaves;

    const title = isEscape ? 'EXTRACTED' : collapsed ? 'COLLAPSED' : 'CONSUMED';
    const subtitle = isEscape ? 'out of a dying universe' : collapsed ? 'no way out' : 'the universe won';
    const titleColor = isEscape ? 'rgba(100, 255, 255,' : collapsed ? 'rgba(180, 80, 255,' : 'rgba(255, 30, 30,';
    const itemVerb = isEscape ? 'salvaged' : 'lost';
    const endItems = inventorySystem.getCargoItems();

    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
    ctx.shadowBlur = 16;
    ctx.textAlign = 'center';

    // Title
    if (t > 0.3) {
      ctx.fillStyle = `${titleColor} ${Math.min((t - 0.3) * 2, 1)})`;
      ctx.font = 'bold 48px monospace';
      ctx.fillText(title, cx, cy - 100);
    }
    // Subtitle
    if (t > 0.6) {
      ctx.fillStyle = `rgba(150, 150, 170, ${Math.min((t - 0.6) * 2, 0.7)})`;
      ctx.font = '16px monospace';
      ctx.fillText(subtitle, cx, cy - 65);
    }
    // Salvage list (items fade in one by one)
    if (t > 1.0 && endItems.length > 0) {
      ctx.font = '13px monospace';
      const maxShow = Math.min(endItems.length, 8, Math.floor((t - 1.0) / 0.15));
      let itemY = cy - 30;
      for (let i = 0; i < maxShow; i++) {
        const item = endItems[i];
        const tierColor = TIER_COLORS[item.tier] || 'rgba(200, 200, 210, 0.8)';
        const catColor = CATEGORY_COLORS[item.category] || tierColor;
        ctx.fillStyle = isEscape ? tierColor : `rgba(120, 120, 130, 0.6)`;
        ctx.fillText(`${item.name} [${item.category}]`, cx, itemY);
        itemY += 18;
      }
      if (endItems.length > 8) {
        ctx.fillStyle = 'rgba(150, 150, 170, 0.5)';
        ctx.fillText(`...and ${endItems.length - 8} more`, cx, itemY);
        itemY += 18;
      }
    }
    // Stats
    const statsT = 1.0 + Math.min(endItems.length, 8) * 0.15 + 0.3;
    if (t > statsT) {
      ctx.fillStyle = `rgba(180, 180, 200, ${Math.min((t - statsT) * 2, 0.8)})`;
      ctx.font = '14px monospace';
      const mins = Math.floor(simState.runEndTime / 60);
      const secs = Math.floor(simState.runEndTime % 60);
      const statY = cy + Math.min(endItems.length, 8) * 18 - 10;
      ctx.fillText(`${endItems.length} items ${itemVerb}  |  survived ${mins}:${String(secs).padStart(2, '0')}`, cx, statY);

      // Score (extraction only)
      if (isEscape && t > statsT + 0.3) {
        const totalValue = endItems.reduce((sum, item) => sum + (item.value || 0), 0);
        ctx.fillStyle = 'rgba(255, 255, 240, 0.9)';
        ctx.font = 'bold 28px monospace';
        const countT = Math.min((t - statsT - 0.3) / 0.5, 1);
        ctx.fillText(`${Math.floor(totalValue * countT)}`, cx, statY + 35);
      }
    }
    // Prompt
    const promptT = statsT + (isEscape ? 1.0 : 0.5);
    if (t > promptT) {
      const blink = Math.sin(totalTime * 3) > 0 ? 1 : 0.3;
      ctx.fillStyle = `rgba(200, 200, 220, ${blink * Math.min((t - promptT) * 2, 1)})`;
      ctx.font = '18px monospace';
      ctx.fillText('press space to continue', cx, cy + Math.min(endItems.length, 8) * 18 + 70);
    }
    ctx.restore();
  }

  // === PAUSE MENU ===
  if (!rendererFixtureActive && gamePhase === 'paused') {
    const cx = overlayCanvas.width / 2;
    const cy = overlayCanvas.height / 2;

    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
    ctx.shadowBlur = 12;

    // Title
    ctx.fillStyle = '#88aaff';
    ctx.font = 'bold 36px monospace';
    ctx.fillText('PAUSED', cx, cy - 120);

    // Menu buttons
    const buttons = ['return to game', 'exit to title'];
    for (let i = 0; i < buttons.length; i++) {
      const y = cy - 40 + i * 50;
      const selected = i === pauseMenuSelection;

      if (selected) {
        ctx.fillStyle = 'rgba(80, 120, 255, 0.15)';
        ctx.fillRect(cx - 160, y - 18, 320, 36);
        ctx.strokeStyle = 'rgba(100, 150, 255, 0.5)';
        ctx.lineWidth = 1;
        ctx.strokeRect(cx - 160, y - 18, 320, 36);
      }

      ctx.fillStyle = selected ? '#ffffff' : 'rgba(150, 150, 180, 0.6)';
      ctx.font = selected ? 'bold 20px monospace' : '18px monospace';
      ctx.fillText(buttons[i], cx, y + 6);
    }

    // Signature info on pause screen
    if (currentSignature) {
      ctx.fillStyle = 'rgba(120, 150, 170, 0.6)';
      ctx.font = '13px monospace';
      ctx.fillText(currentSignature.name, cx, cy + 60);
      ctx.fillStyle = 'rgba(100, 130, 150, 0.4)';
      ctx.font = '11px monospace';
      ctx.fillText(currentSignature.mechanical, cx, cy + 78);
    }

    // Controls reference (compact)
    ctx.font = '12px monospace';
    ctx.fillStyle = 'rgba(130, 130, 170, 0.5)';
    ctx.fillText('steer: stick / arrows   thrust: R2 / space   brake: L2 / ctrl   pulse: □ / E', cx, cy + 110);

    // Navigation hint
    ctx.fillStyle = 'rgba(130, 130, 170, 0.4)';
    ctx.font = '12px monospace';
    ctx.fillText('up/down to select  ·  X / space to confirm  ·  O / esc to resume', cx, cy + 130);

    ctx.restore();
  }

  requestAnimationFrame(gameLoop);
}

// ---- Error overlay (visible crash reporting) ----
window.addEventListener('error', (e) => {
  const div = document.createElement('div');
  div.style.cssText = 'position:fixed;top:0;left:0;right:0;padding:16px;background:rgba(180,0,0,0.95);color:#fff;font:14px monospace;z-index:99999;white-space:pre-wrap;';
  div.textContent = `ERROR: ${e.message}\n${e.filename}:${e.lineno}:${e.colno}`;
  document.body.appendChild(div);
});

// ---- Start ----
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
