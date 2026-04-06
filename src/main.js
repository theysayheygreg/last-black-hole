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
// loot.js removed — loot anchors replaced with stars + asteroid clusters (see FLAVOR-PASS.md)
import { WaveRingSystem } from './wave-rings.js';
import { WreckSystem } from './wrecks.js';
import { PortalSystem } from './portals.js';
import { PlanetoidSystem } from './planetoids.js';
import { InputManager } from './input.js';
import { ASCIIRenderer } from './ascii-renderer.js';
import { initTestAPI } from './test-api.js';
import { initDevPanel } from './dev-panel.js';
import { initHUD, showHUD, hideHUD, updateHUD, showWarning, setDropCallback,
         resetInventoryCursor, inventoryCursorUp, inventoryCursorDown, inventoryConfirm, getInventoryActionAtCursor } from './hud.js';
import { applyRuntimeFlags } from './runtime-flags.js';
import { ScavengerSystem } from './scavengers.js';
import { CombatSystem } from './combat.js';
import { AudioEngine } from './audio.js';
import { rollSignature, applySignatureConfig } from './signatures.js';
import { InventorySystem } from './inventory.js';
import { ProfileManager, UPGRADE_TRACKS, MAX_RANK, generatePilotName } from './profile.js';
import { CATEGORY_COLORS, TIER_COLORS } from './items.js';
import { FlowField } from './sim/flow-field.js';
import { SimCore } from './sim/sim-core.js';
import { SimClient } from './sim/sim-client.js';
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

const PLAYABLE_MAPS = [
  { id: 'shallows', map: MAP_SHALLOWS },
  { id: 'expanse', map: MAP_EXPANSE },
  { id: 'deep-field', map: MAP_DEEP },
];
const MAP_LIST = PLAYABLE_MAPS.map((entry) => entry.map);

function getPlayableMapEntryById(id) {
  return PLAYABLE_MAPS.find((entry) => entry.id === id) || PLAYABLE_MAPS[0];
}

function getPlayableMapEntryByMap(map) {
  return PLAYABLE_MAPS.find((entry) => entry.map === map) || PLAYABLE_MAPS[0];
}

// ---- State ----
let glCanvas, gl;
let overlayCanvas, ctx;
let fluid, ship, wellSystem, starSystem, wreckSystem, waveRings;
let portalSystem, planetoidSystem;
let scavengerSystem, combatSystem, audioEngine, inventorySystem;
let flowField, simCore;
let simClient = null;
let currentSignature = null;
let inputManager, asciiRenderer;
let running = true;
let totalTime = 0;
let timeScale = 1.0;
let fps = 60;
let frameCount = 0;
let fpsTimer = 0;
let lastFrameTime = 0;
let gamePhase = 'title'; // 'title' | 'profileSelect' | 'home' | 'mapSelect' | 'loading' | 'playing' | 'dead' | 'escaped' | 'meta' | 'paused'
let loadingStartTime = 0;
let loadingMapName = '';
let deathTimer = 0;
let escapeTimer = 0;
let titleTimer = 0;

// Camera state — world-space center of screen
let camX = 1.5;
let camY = 1.5;

// Map state
let currentMap = MAP_SHALLOWS;
let remoteAuthorityActive = false;
let remoteMapId = null;
let remoteSnapshot = null;
let remotePlayers = [];
let remoteLastAckSeq = 0;
let remoteLastEventSeq = 0;
let remoteInputRequestInFlight = false;
let remoteSnapshotRequestInFlight = false;
let remoteInventoryRequestInFlight = false;
let remoteSessionHealth = null;
let remoteSessionRequestInFlight = false;
let remoteSessionLastFetchedAt = 0;
let remotePendingPulse = false;
let remotePendingConsumeSlot = null;
let startingMasses = [];
let mapSelectIndex = 0;
let currentCameraMode = 'follow';
let rendererFixtureActive = false;
const RUNTIME_FLAGS = applyRuntimeFlags(CONFIG);

// Run state
const simState = createSimState();
let inventoryOpen = false;  // Tab toggle state
let shieldActive = false;   // shieldBurst consumable — survive one well contact
let timeSlowRemaining = 0;  // timeSlowLocal consumable — seconds of slow remaining
let signalLevel = 0;        // 0-1 float, read from server snapshot
let signalZone = 'ghost';   // current signal zone name
let inhibitorState = { form: 0, wx: 0, wy: 0, intensity: 0, radius: 0, localTime: 0 };
let localAbilityState = null;
let lastRunResult = null; // populated from run.result event
let remoteFauna = [];
let remoteSentries = [];
let _starFlashTimer = 0;    // dramatic flash when star consumed by well
let _starFlashColor = [255, 255, 255];
let hullGraceTimer = 0;     // hull upgrade grace period (seconds remaining in kill zone before death)
let hullGraceUsed = false;  // hull rank 2+: one free survive per run
let lastDeathTax = 0;       // EM lost on last death (for display)

// Profile + meta/home screen
const profileManager = new ProfileManager();
let metaExtractedItems = []; // items from the extraction, shown on meta screen
let metaPhaseTimer = 0;      // animation timer for meta screen
let profileCursor = 0;       // profile select cursor (0-2)
let homeTab = 0;             // home screen tab (0=ship, 1=vault, 2=upgrades, 3=launch)
let homeShipCursor = 0;      // ship subscreen cursor (0-1 equip, 2-3 consumable)
let homeVaultCursor = 0;     // vault subscreen scroll position
let homeUpgradeCursor = 0;   // upgrade subscreen cursor
let homePhaseTimer = 0;      // animation timer for home screen
let nameInputActive = false; // text input mode for new profile
let nameInputBuffer = '';    // current typed name
let deleteConfirmSlot = -1;  // which slot is pending delete confirmation (-1 = none)

// Scene transition state
let transitionActive = false;
let transitionTimer = 0;
let transitionCallback = null;  // called at midpoint to swap the scene
let transitionFired = false;
const TRANSITION_RAMP_UP = 0.6;    // seconds to reach full corruption
const TRANSITION_HOLD = 0.25;      // seconds at full corruption
const TRANSITION_RAMP_DOWN = 0.6;  // seconds to resolve into new scene
const TRANSITION_TOTAL = TRANSITION_RAMP_UP + TRANSITION_HOLD + TRANSITION_RAMP_DOWN;

function getConfiguredSimServerUrl() {
  const url = new URL(window.location.href);
  const fromQuery = url.searchParams.get('simServer');
  if (fromQuery) {
    localStorage.setItem('lbh.simServerUrl', fromQuery);
    return fromQuery;
  }
  return localStorage.getItem('lbh.simServerUrl') || '';
}

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

    wreckSystem,
    portalSystem,
    planetoidSystem,
    scavengerSystem,
    combatSystem,
    waveRings,
    ship,
  });

  const simServerUrl = getConfiguredSimServerUrl();
  if (simServerUrl) {
    simClient = new SimClient(simServerUrl);
    console.log(`[LBH] remote sim configured: ${simServerUrl}`);
  }

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
      if (gamePhase === 'playing' && inventoryOpen) {
        inventoryOpen = false;
        return;
      }
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

    // Name input for profile creation
    if (nameInputActive) {
      e.preventDefault();
      if (e.key === 'Enter') {
        profileManager.createProfile(profileCursor, nameInputBuffer);
        nameInputActive = false;
        gamePhase = 'home';
        homeTab = 0;
        homePhaseTimer = 0;
      } else if (e.key === 'Escape') {
        nameInputActive = false;
      } else if (e.key === 'Backspace') {
        nameInputBuffer = nameInputBuffer.slice(0, -1);
      } else if (e.key.length === 1 && nameInputBuffer.length < 16) {
        nameInputBuffer += e.key;
      }
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

  if (RUNTIME_FLAGS.enableTestAPI) {
    initTestAPI(() => ({
      ship,
      fluid,
      flowField,
      wellSystem,
      starSystem,
  
      wreckSystem,
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
      get inventoryOpen() { return inventoryOpen; },
      inputManager,
      scavengerSystem,
      combatSystem,
      currentSignature,
      profileManager,
      simClient,
      get remoteAuthorityActive() { return remoteAuthorityActive; },
      get remoteMapId() { return remoteMapId; },
      get remoteSnapshot() { return remoteSnapshot; },
      get remoteSessionHealth() { return remoteSessionHealth; },
      get remoteControlState() { return currentRemoteControlState(); },
      get remotePlayers() { return remotePlayers; },
      get playableMaps() { return PLAYABLE_MAPS; },
      transitionToGame,
      transitionToRemoteGame,
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
  resetLocalInventoryShape();
  inventorySystem.clearCargo();
  inventoryOpen = false;
  shieldActive = false;
  timeSlowRemaining = 0;
  _starFlashTimer = 0;
  hullGraceTimer = 0;
  hullGraceUsed = false;
  lastDeathTax = 0;
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
    wellSystem, starSystem, wreckSystem, portalSystem, planetoidSystem, fluid,
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
  remoteAuthorityActive = false;
  remoteMapId = null;
  remoteSnapshot = null;
  remoteLastAckSeq = 0;
  remoteLastEventSeq = 0;
  remoteInputRequestInFlight = false;
  remoteSnapshotRequestInFlight = false;
  remoteInventoryRequestInFlight = false;
  remotePendingPulse = false;
  remotePendingConsumeSlot = null;
  remoteFauna = [];
  remoteSentries = [];
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

  // Apply upgrade multipliers from profile to CONFIG at run start.
  // We mutate CONFIG directly (not ship properties) so all systems that read CONFIG
  // see the upgraded values. CONFIG reverts to defaults via revertSceneOverrides()
  // at the start of the next loadScene().
  //
  // Per-rank multipliers: 15% thrust per rank, 10% coupling, -12% drag (lower = less friction).
  // These are intentionally modest — rank 3 gives ~45% thrust boost, not 2×.
  const prof = profileManager.active;
  if (prof) {
    const thrustMult = 1 + prof.upgrades.thrust * 0.15;
    CONFIG.ship.thrustAccel *= thrustMult;
    const couplingMult = 1 + prof.upgrades.coupling * 0.10;
    CONFIG.ship.fluidCoupling *= couplingMult;
    const dragMult = 1 - prof.upgrades.drag * 0.12;
    CONFIG.ship.drag *= dragMult;
  }

  gamePhase = 'playing';
  audioEngine.setContext('gameplay');
  showHUD();
}

/** Transition to gameplay with glitch effect. */
function transitionToGame(map) {
  triggerTransition(() => startGame(map));
}

function resetLocalInventoryShape() {
  // Local scenes still use the shipped fixed client contract: 8 cargo,
  // 2 equipped artifacts, and 2 consumables.
  inventorySystem.cargo = new Array(8).fill(null);
  inventorySystem.equipped = new Array(2).fill(null);
  inventorySystem.consumables = new Array(2).fill(null);
}

function applyRemoteInventoryShape(localPlayer) {
  // Remote authority is allowed to define the live slot shape. The browser UI
  // mirrors what the server says exists instead of assuming the local defaults.
  if (Array.isArray(localPlayer.cargo)) {
    inventorySystem.cargo = localPlayer.cargo.map((item) => item ? { ...item } : null);
  }
  if (Array.isArray(localPlayer.equipped)) {
    inventorySystem.equipped = localPlayer.equipped.map((item) => item ? { ...item } : null);
  }
  if (Array.isArray(localPlayer.consumables)) {
    inventorySystem.consumables = localPlayer.consumables.map((item) => item ? { ...item } : null);
  }
}

function applyRemoteSnapshot(snapshot) {
  if (!snapshot) return;
  // First snapshot received — transition from loading to playing
  if (gamePhase === 'loading') {
    gamePhase = 'playing';
    audioEngine.setContext('gameplay');
    showHUD();
  }
  remoteSnapshot = snapshot;
  remoteSessionHealth = {
    ok: true,
    session: snapshot.session ?? null,
    playerCount: Array.isArray(snapshot.players) ? snapshot.players.length : 0,
    tick: snapshot.tick ?? null,
    simTime: snapshot.simTime ?? null,
  };
  simState.runElapsedTime = snapshot.simTime ?? simState.runElapsedTime;
  syncRemoteWorldState(snapshot.world);
  remotePlayers = Array.isArray(snapshot.players)
    ? snapshot.players
        .filter((player) => player.clientId !== simClient?.clientId)
        .map((player) => ({ ...player }))
    : [];

  const localPlayer = snapshot.players?.find((player) => player.clientId === simClient?.clientId);
  if (!localPlayer) return;

  ship.teleport(localPlayer.wx, localPlayer.wy);
  ship.vx = localPlayer.vx;
  ship.vy = localPlayer.vy;

  applyRemoteInventoryShape(localPlayer);
  shieldActive = Boolean(localPlayer.effectState?.shieldCharges > 0);
  timeSlowRemaining = Math.max(0, localPlayer.effectState?.timeSlowRemaining ?? 0);
  combatSystem.playerCooldown = Math.max(0, localPlayer.effectState?.pulseCooldownRemaining ?? 0);
  if (localPlayer.signal) {
    signalLevel = localPlayer.signal.level ?? 0;
    signalZone = localPlayer.signal.zone ?? 'ghost';
  }
  if (localPlayer.abilityState) {
    localAbilityState = localPlayer.abilityState;
  }
  if (snapshot.inhibitor) {
    inhibitorState = { ...snapshot.inhibitor };
  }

  if (inputManager?.facing != null) {
    ship.setFacingDirect(inputManager.facing);
  }

  if (Array.isArray(snapshot.recentEvents)) {
    applyRemoteEvents(snapshot.recentEvents);
  }

  if (gamePhase === 'dead' && localPlayer.status === 'alive') {
    gamePhase = 'playing';
    deathTimer = 0;
  } else if (gamePhase === 'playing' && localPlayer.status === 'dead') {
    gamePhase = 'dead';
    deathTimer = 0;
    freezeRunEnd(simState);
    ship.setThrust(false);
  } else if (gamePhase === 'playing' && localPlayer.status === 'escaped') {
    gamePhase = 'escaped';
    escapeTimer = 0;
    freezeRunEnd(simState);
    ship.setThrust(false);
  }
}

function currentRemoteControlState() {
  const selectedEntry = PLAYABLE_MAPS[mapSelectIndex] || PLAYABLE_MAPS[0] || null;
  const session = remoteSessionHealth?.session ?? null;
  const hasLiveSession = session?.status === 'running';
  const liveEntry = hasLiveSession ? (getPlayableMapEntryById(session.mapId) || null) : null;
  const isHost = Boolean(hasLiveSession && simClient?.clientId && session?.hostClientId === simClient.clientId);
  return {
    enabled: Boolean(simClient?.enabled),
    loading: remoteSessionRequestInFlight,
    error: remoteSessionHealth?.ok === false ? remoteSessionHealth.error || 'remote health unavailable' : null,
    hasLiveSession,
    sessionStatus: session?.status ?? 'idle',
    sessionMapId: liveEntry?.id ?? session?.mapId ?? null,
    sessionMapName: liveEntry?.name ?? session?.mapId ?? null,
    sessionPlayerCount: remoteSessionHealth?.playerCount ?? 0,
    hostClientId: session?.hostClientId ?? null,
    hostName: session?.hostName ?? null,
    isHost,
    canHostReset: Boolean(hasLiveSession && isHost),
    selectedMapId: selectedEntry?.id ?? null,
    selectedMapName: selectedEntry?.name ?? null,
    willJoinLiveRun: Boolean(hasLiveSession),
    selectedDiffersFromLive: Boolean(hasLiveSession && selectedEntry && liveEntry && selectedEntry.id !== liveEntry.id),
  };
}

async function refreshRemoteSessionHealth(force = false) {
  if (!simClient?.enabled) return null;
  const now = Date.now();
  if (remoteSessionRequestInFlight) return remoteSessionHealth;
  if (!force && remoteSessionHealth && now - remoteSessionLastFetchedAt < 500) return remoteSessionHealth;
  remoteSessionRequestInFlight = true;
  remoteSessionLastFetchedAt = now;
  try {
    const health = await simClient.getHealth();
    remoteSessionHealth = {
      ok: true,
      session: health?.session ?? null,
      playerCount: health?.playerCount ?? 0,
      tick: health?.tick ?? null,
      simTime: health?.simTime ?? null,
    };
    return remoteSessionHealth;
  } catch (err) {
    remoteSessionHealth = {
      ok: false,
      error: err.message,
      session: null,
      playerCount: 0,
      tick: null,
      simTime: null,
    };
    return remoteSessionHealth;
  } finally {
    remoteSessionRequestInFlight = false;
  }
}

function renderFauna(ctx, camX, camY, canvasW, canvasH, time) {
  if (remoteFauna.length === 0) return;
  const ppw = canvasW / WORLD_SCALE;
  ctx.save();
  for (const f of remoteFauna) {
    const [sx, sy] = worldToScreen(f.wx, f.wy, camX, camY, canvasW, canvasH);
    if (sx < -20 || sx > canvasW + 20 || sy < -20 || sy > canvasH + 20) continue;
    const ageFrac = f.age / f.lifespan;
    const fadeIn = Math.min(1, f.age * 2);
    const fadeOut = ageFrac > 0.85 ? 1 - (ageFrac - 0.85) / 0.15 : 1;
    const alpha = fadeIn * fadeOut;

    if (f.type === 'jelly') {
      const pulse = 0.3 + 0.4 * (0.5 + 0.5 * Math.sin(time * Math.PI + f.phase));
      ctx.fillStyle = `rgba(64, 224, 208, ${(pulse * alpha).toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(sx, sy, 3, 0, Math.PI * 2);
      ctx.fill();
      // Faint halo
      ctx.fillStyle = `rgba(64, 224, 208, ${(pulse * alpha * 0.2).toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(sx, sy, 6, 0, Math.PI * 2);
      ctx.fill();
    } else if (f.type === 'bloom') {
      const flicker = Math.random() > 0.3 ? 1 : 0.4;
      ctx.fillStyle = `rgba(123, 104, 238, ${(alpha * 0.7 * flicker).toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(sx, sy, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function renderSentries(ctx, camX, camY, canvasW, canvasH, time) {
  if (remoteSentries.length === 0) return;
  ctx.save();
  ctx.strokeStyle = 'rgba(0, 255, 136, 0.8)';
  ctx.fillStyle = 'rgba(0, 255, 136, 0.6)';
  ctx.lineWidth = 2;
  const segCount = 4;
  const segSize = 3;
  const segGap = 2;
  for (const s of remoteSentries) {
    const [sx, sy] = worldToScreen(s.wx, s.wy, camX, camY, canvasW, canvasH);
    if (sx < -30 || sx > canvasW + 30 || sy < -30 || sy > canvasH + 30) continue;
    // Undulation: sine wave offsets perpendicular to orbit direction
    const baseAngle = s.orbitAngle || 0;
    const brightness = s.state === 'lunge' ? 1.0 : s.state === 'recover' ? 0.5 : 0.8;
    ctx.globalAlpha = brightness;
    for (let i = 0; i < segCount; i++) {
      const along = i * (segSize + segGap);
      const wave = Math.sin(time * Math.PI * 2 + i * 1.2 + (s.orbitAngle || 0) * 3) * 3;
      const ox = Math.cos(baseAngle) * along - Math.sin(baseAngle) * wave;
      const oy = Math.sin(baseAngle) * along + Math.cos(baseAngle) * wave;
      ctx.beginPath();
      ctx.arc(sx + ox, sy + oy, segSize, 0, Math.PI * 2);
      ctx.fill();
    }
    // Faint green glow
    ctx.globalAlpha = brightness * 0.15;
    ctx.beginPath();
    ctx.arc(sx, sy, 10, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

function renderRemotePlayers(ctx, camX, camY, canvasW, canvasH) {
  if (!remoteAuthorityActive || remotePlayers.length === 0) return;
  ctx.save();
  for (let index = 0; index < remotePlayers.length; index++) {
    const player = remotePlayers[index];
    if (player.status && player.status !== 'alive') continue;
    const [sx, sy] = worldToScreen(player.wx, player.wy, camX, camY, canvasW, canvasH);
    const facing = Math.atan2(player.vy || 0, player.vx || 0);
    const size = CONFIG.ship.size * 0.85;
    // Hull-based ship colors
    const HULL_COLORS = {
      drifter:  { hull: 'rgba(100, 200, 240, 0.9)', trail: 'rgba(80, 180, 220, 0.4)' },
      breacher: { hull: 'rgba(255, 140, 60, 0.9)',  trail: 'rgba(255, 100, 40, 0.5)' },
      resonant: { hull: 'rgba(180, 120, 255, 0.9)', trail: 'rgba(160, 100, 240, 0.4)' },
      shroud:   { hull: 'rgba(140, 160, 170, 0.7)', trail: 'rgba(120, 140, 150, 0.2)' },
      hauler:   { hull: 'rgba(220, 200, 100, 0.9)', trail: 'rgba(200, 180, 80, 0.4)' },
    };
    const hc = HULL_COLORS[player.hullType] || HULL_COLORS.drifter;
    const hullColor = hc.hull;
    const trailColor = hc.trail;

    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(facing || 0);
    ctx.beginPath();
    ctx.moveTo(size, 0);
    ctx.lineTo(-size * 0.6, -size * 0.5);
    ctx.lineTo(-size * 0.3, 0);
    ctx.lineTo(-size * 0.6, size * 0.5);
    ctx.closePath();
    ctx.fillStyle = hullColor;
    ctx.fill();

    const speed = Math.hypot(player.vx || 0, player.vy || 0);
    if (speed > 0.01) {
      ctx.beginPath();
      ctx.moveTo(-size * 0.65, 0);
      ctx.lineTo(-size * 1.25, 0);
      ctx.strokeStyle = trailColor;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.restore();

    if (player.name) {
      ctx.save();
      ctx.font = '9px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(180, 210, 255, 0.7)';
      ctx.fillText(player.name, sx, sy - 14);
      ctx.restore();
    }
  }
  ctx.restore();
}

function applyRemoteEvents(events) {
  for (const event of events) {
    if (!event || event.seq <= remoteLastEventSeq) continue;
    remoteLastEventSeq = event.seq;
    const payload = event.payload || {};
    const isLocal = payload.clientId && payload.clientId === simClient?.clientId;

    switch (event.type) {
      case 'player.pulse':
        if (Number.isFinite(payload.wx) && Number.isFinite(payload.wy)) {
          combatSystem.spawnRemotePulseVisual(payload.wx, payload.wy, fluid, waveRings, wellSystem);
        }
        audioEngine.playEvent('pulse', payload.wx, payload.wy, camX, camY, overlayCanvas.width, overlayCanvas.height);
        break;
      case 'player.effectUsed':
        if (!isLocal) break;
        if (payload.effectId === 'shieldBurst') {
          showWarning('shield active — survive one well contact', 'rgba(100, 200, 255, 0.95)', 3000);
          audioEngine.playEvent('shieldActivate');
        } else if (payload.effectId === 'timeSlowLocal') {
          showWarning('time dilated — 3s', 'rgba(180, 140, 255, 0.95)', 2000);
          audioEngine.playEvent('timeSlow');
        } else if (payload.effectId === 'signalPurge') {
          showWarning('signal purged', 'rgba(100, 255, 180, 0.95)', 2000);
        } else if (payload.effectId === 'breachFlare') {
          showWarning('breach flare — portal for 15s', 'rgba(255, 200, 100, 0.95)', 3000);
          audioEngine.playEvent('breachFlare');
        }
        break;
      case 'player.effectExpired':
        if (isLocal && payload.effectId === 'timeSlowLocal') {
          audioEngine.playEvent('timeSlowEnd');
        }
        break;
      case 'player.shieldAbsorbed':
        if (isLocal) {
          showWarning('shield absorbed!', 'rgba(100, 200, 255, 0.95)', 2000);
          audioEngine.playEvent('shieldAbsorb');
        }
        break;
      case 'player.died':
        if (isLocal) {
          audioEngine.playEvent('death');
        }
        break;
      case 'run.result':
        if (isLocal) {
          lastRunResult = payload;
        }
        break;
      case 'player.inventoryAction':
        if (!isLocal || !payload.itemName) break;
        if (payload.action === 'dropCargo') {
          showWarning(`dropped ${payload.itemName}`, 'rgba(255, 150, 80, 0.8)', 1500);
        } else if (payload.action === 'equipCargo') {
          showWarning(`equipped ${payload.itemName}`, 'rgba(255, 220, 120, 0.9)', 1400);
        } else if (payload.action === 'loadConsumable') {
          showWarning(`loaded ${payload.itemName}`, 'rgba(160, 220, 255, 0.9)', 1400);
        } else if (payload.action === 'unequip' || payload.action === 'unloadConsumable') {
          showWarning(`${payload.itemName} to cargo`, 'rgba(180, 180, 200, 0.9)', 1400);
        }
        break;
      case 'star.consumed':
        if (Array.isArray(payload.starColor) && typeof payload.starName === 'string') {
          if (Number.isFinite(payload.wx) && Number.isFinite(payload.wy)) {
            waveRings.spawn(payload.wx, payload.wy, 3.0);
          }
          const [cr, cg, cb] = payload.starColor;
          showWarning(`${payload.starName} consumed — stellar remnant!`, `rgba(${cr}, ${cg}, ${cb}, 0.95)`, 4000);
          audioEngine.playEvent('starConsumed', payload.wx, payload.wy, camX, camY, overlayCanvas.width, overlayCanvas.height);
          _starFlashTimer = 0.8;
          _starFlashColor = payload.starColor;
        }
        break;
      case 'planetoid.consumed':
        if (Number.isFinite(payload.wx) && Number.isFinite(payload.wy)) {
          waveRings.spawn(payload.wx, payload.wy, 0.2);
        }
        break;
      case 'well.grew':
        if (Number.isFinite(payload.wx) && Number.isFinite(payload.wy) && Number.isFinite(payload.mass)) {
          waveRings.spawn(payload.wx, payload.wy, CONFIG.events.growthWaveAmplitude * payload.mass);
        }
        break;
      case 'scavenger.extracted':
        showWarning('scavenger extracted — portal consumed', 'rgba(180, 120, 255, 0.9)', 3000);
        break;
      case 'scavenger.consumed':
        if (payload.name) {
          const message = payload.lootCount > 0
            ? `${payload.name} destroyed — loot scattered`
            : `${payload.name} consumed`;
          showWarning(message, 'rgba(200, 140, 80, 0.9)', 3000);
        }
        if (Number.isFinite(payload.wx) && Number.isFinite(payload.wy)) {
          audioEngine.playEvent('scavDeath', payload.wx, payload.wy, camX, camY, overlayCanvas.width, overlayCanvas.height);
        }
        break;
      default:
        break;
    }
  }
}

function applyRemoteInventoryAction(action) {
  if (!remoteAuthorityActive || !simClient?.enabled || !action || remoteInventoryRequestInFlight) return;
  remoteInventoryRequestInFlight = true;
  void simClient.inventoryAction(action)
    .then((response) => {
      if (response?.snapshot) applyRemoteSnapshot(response.snapshot);
    })
    .catch((err) => {
      console.error('[LBH] remote inventory action failed:', err);
      showWarning('inventory action failed', 'rgba(255, 110, 110, 0.95)', 1800);
    })
    .finally(() => {
      remoteInventoryRequestInFlight = false;
    });
}

function syncRemoteWorldState(world) {
  if (!world) return;

  if (Array.isArray(world.wells)) {
    for (let i = 0; i < Math.min(world.wells.length, wellSystem.wells.length); i++) {
      const remote = world.wells[i];
      const local = wellSystem.wells[i];
      local.wx = remote.wx;
      local.wy = remote.wy;
      local.mass = remote.mass;
      if (remote.killRadius) local.killRadius = remote.killRadius;
      if (remote.name) local.name = remote.name;
    }
  }

  if (Array.isArray(world.stars)) {
    const previousStars = new Map(starSystem.stars.map((star) => [star.id, star]));
    starSystem.stars = world.stars.map((remote, index) => {
      const prev = previousStars.get(remote.id) || starSystem.stars[index] || {};
      return {
        ...prev,
        ...remote,
        alive: remote.alive !== false,
      };
    });
  }

  if (Array.isArray(world.wrecks)) {
    wreckSystem.wrecks = world.wrecks.map((remote) => ({
      ...remote,
      alive: remote.alive !== false,
      looted: Boolean(remote.looted),
      pickupCooldown: remote.pickupCooldown ?? 0,
      loot: Array.isArray(remote.loot) ? remote.loot.map((item) => item ? { ...item } : null) : [],
    }));
  }

  if (Array.isArray(world.planetoids)) {
    planetoidSystem.planetoids = world.planetoids.map((remote) => ({
      ...remote,
      alive: remote.alive !== false,
    }));
  }

  if (Array.isArray(world.portals)) {
    portalSystem.portals = world.portals.map((remote) => ({
      wx: remote.wx,
      wy: remote.wy,
      type: remote.type ?? 'standard',
      wave: remote.wave ?? 0,
      spawnTime: remote.spawnTime ?? 0,
      lifespan: remote.lifespan ?? 90,
      alive: remote.alive !== false,
      opacity: remote.opacity ?? 1,
      timeLeft(runTime) {
        return Math.max(0, (this.spawnTime + this.lifespan) - runTime);
      },
      isWarning(runTime) {
        return this.alive && this.timeLeft(runTime) < 15;
      },
      isCritical(runTime) {
        return this.alive && this.timeLeft(runTime) < 5;
      },
      getCaptureRadius() {
        const base = CONFIG.portals.captureRadius;
        if (this.type === 'unstable') return base * 0.5;
        if (this.type === 'rift') return base * 1.8;
        return base;
      },
    }));
    portalSystem._nextWaveIndex = world.nextPortalWaveIndex ?? portalSystem._nextWaveIndex;
  }

  if (Array.isArray(world.scavengers)) {
    scavengerSystem.scavengers = world.scavengers.map((remote) => ({
      ...remote,
      alive: remote.alive !== false,
    }));
  }

  if (Array.isArray(world.fauna)) {
    remoteFauna = world.fauna.filter(f => f.alive !== false);
  }
  if (Array.isArray(world.sentries)) {
    remoteSentries = world.sentries.filter(s => s.alive !== false);
  }
}

async function startRemoteGame(mapEntry, { forceReset = false } = {}) {
  if (!simClient?.enabled) {
    startGame(mapEntry.map);
    return;
  }

  const health = await refreshRemoteSessionHealth(true);
  const runningSession = health?.session?.status === 'running' ? health.session : null;
  const isHost = Boolean(runningSession?.hostClientId && runningSession.hostClientId === simClient.clientId);
  if (forceReset && runningSession && !isHost) {
    throw new Error('Only the host can reset the live run');
  }
  const targetMapEntry = runningSession
    ? (forceReset ? mapEntry : (getPlayableMapEntryById(runningSession.mapId) || mapEntry))
    : mapEntry;

  rendererFixtureActive = false;
  remoteAuthorityActive = true;
  remoteMapId = targetMapEntry.id;
  remoteSnapshot = null;
  remotePlayers = [];
  remoteLastAckSeq = 0;
  remoteLastEventSeq = 0;
  remoteInputRequestInFlight = false;
  remoteSnapshotRequestInFlight = false;
  remoteInventoryRequestInFlight = false;
  remotePendingPulse = false;
  remotePendingConsumeSlot = null;

  loadScene(targetMapEntry.map);
  currentSignature = rollSignature(targetMapEntry.map.worldScale);
  applySignatureConfig(currentSignature);
  audioEngine.reset();
  // Enter loading phase — transition to 'playing' when first snapshot arrives
  loadingMapName = targetMapEntry.name || targetMapEntry.id || '';
  loadingStartTime = performance.now();
  gamePhase = 'loading';
  hideHUD();

  const p = profileManager.active;
  const profileSnapshot = profileManager.exportActiveProfile?.() || null;
  if (p) {
    inventorySystem.equipped = p.loadout.equipped.map(i => i ? { ...i } : null);
    inventorySystem.consumables = p.loadout.consumables.map(i => i ? { ...i } : null);
  }

  if (!runningSession || forceReset) {
    await simClient.startSession({
      mapId: mapEntry.id,
      worldScale: mapEntry.map.worldScale,
      maxPlayers: 4,
      requesterName: profileManager.active?.name || 'Pilot',
      requesterProfileId: profileManager.active?.id || null,
      requesterProfile: profileSnapshot,
    });
    if (forceReset && runningSession) {
      showWarning(`host reset to ${mapEntry.name.toLowerCase()}`, 'rgba(255, 210, 120, 0.95)', 2600);
    }
  } else if (runningSession.mapId !== mapEntry.id) {
    showWarning(`joining live run on ${targetMapEntry.name}`, 'rgba(140, 200, 255, 0.9)', 2400);
  }
  await simClient.join({
    name: profileManager.active?.name || 'Pilot',
    profileId: profileManager.active?.id || null,
    profileSnapshot,
    equipped: inventorySystem.equipped,
    consumables: inventorySystem.consumables,
  });
  const snapshot = await simClient.pollSnapshot(true);
  applyRemoteSnapshot(snapshot);
}

function transitionToRemoteGame(mapEntry, options = {}) {
  triggerTransition(() => {
    void startRemoteGame(mapEntry, options).catch((err) => {
      console.error('[LBH] remote start failed:', err);
      showWarning(`remote sim failed: ${err.message}`, 'rgba(255, 100, 80, 0.95)', 4000);
      remoteAuthorityActive = false;
      remoteMapId = null;
      remoteSnapshot = null;
      remotePlayers = [];
      remoteSessionHealth = null;
      startGame(mapEntry.map);
    });
  });
}

async function leaveRemoteSessionToHome() {
  const activeProfileId = profileManager.active?.id || null;
  if (simClient?.enabled && remoteAuthorityActive) {
    try {
      await simClient.leave();
    } catch (err) {
      console.error('[LBH] remote leave failed:', err);
    }
  }
  if (simClient?.enabled && activeProfileId) {
    try {
      const body = await simClient.getProfile(activeProfileId);
      if (body?.profile) {
        profileManager.replaceActiveProfile(body.profile);
      }
    } catch (err) {
      console.error('[LBH] remote profile sync failed:', err);
    }
  }
  remoteAuthorityActive = false;
  remoteMapId = null;
  remoteSnapshot = null;
  remotePlayers = [];
  remoteSessionHealth = null;
  remoteLastAckSeq = 0;
  remoteLastEventSeq = 0;
  remoteInputRequestInFlight = false;
  remoteSnapshotRequestInFlight = false;
  remoteInventoryRequestInFlight = false;
  remotePendingPulse = false;
  remotePendingConsumeSlot = null;
}

async function restartRemoteSession() {
  if (!simClient?.enabled || !remoteMapId) return;
  const mapEntry = getPlayableMapEntryById(remoteMapId);
  await simClient.resetSession();
  await simClient.join({
    name: profileManager.active?.name || 'Pilot',
    equipped: inventorySystem.equipped,
    consumables: inventorySystem.consumables,
  });
  const snapshot = await simClient.pollSnapshot(true);
  remoteAuthorityActive = true;
  remotePlayers = [];
  remoteInputRequestInFlight = false;
  remoteSnapshotRequestInFlight = false;
  remoteInventoryRequestInFlight = false;
  remoteLastEventSeq = 0;
  remotePendingPulse = false;
  remotePendingConsumeSlot = null;
  applyRemoteSnapshot(snapshot);
  gamePhase = 'playing';
  deathTimer = 0;
  escapeTimer = 0;
  showHUD();
  currentMap = mapEntry.map;
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

// Button edge detection — stores previous frame's button state so we can detect
// the moment a button goes from unpressed→pressed (rising edge). Without this,
// holding a button would fire the action every frame instead of once.
// Pattern: if (buttonNow && !_prevButton) { /* fires once */ }
let _prevConfirm = false;
let _prevPause = false;
let _prevBack = false;
let _prevUp = false;
let _prevDown = false;
let _prevLeft = false;
let _prevRight = false;
let _prevTabLeft = false;
let _prevTabRight = false;
let _prevDelete = false;
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

// ---- Consumable effect dispatch ----

// ---- Terminal UI helpers ----

/** Draw subtle scanline overlay on menu/terminal screens */
function drawScanlines(ctx, w, h, alpha = 0.04) {
  ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
  for (let y = 0; y < h; y += 3) {
    ctx.fillRect(0, y, w, 1);
  }
}

/** Draw a terminal frame border with optional title */
function drawTerminalFrame(ctx, x, y, w, h, title, color = 'rgba(80, 100, 140, 0.3)') {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);
  // Corner accents
  const c = 6;
  ctx.strokeStyle = color.replace(/[\d.]+\)$/, '0.6)');
  ctx.beginPath();
  ctx.moveTo(x, y + c); ctx.lineTo(x, y); ctx.lineTo(x + c, y); // top-left
  ctx.moveTo(x + w - c, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + c); // top-right
  ctx.moveTo(x + w, y + h - c); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w - c, y + h); // bottom-right
  ctx.moveTo(x + c, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + h - c); // bottom-left
  ctx.stroke();
  if (title) {
    ctx.fillStyle = 'rgba(0, 2, 12, 0.9)';
    const tw = ctx.measureText(title).width + 16;
    ctx.fillRect(x + 12, y - 7, tw, 14);
    ctx.fillStyle = color.replace(/[\d.]+\)$/, '0.7)');
    ctx.font = '9px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(title.toUpperCase(), x + 20, y + 3);
  }
}

function applyConsumableEffect(effectId) {
  switch (effectId) {
    case 'shieldBurst':
      shieldActive = true;
      showWarning('shield active — survive one well contact', 'rgba(100, 200, 255, 0.95)', 3000);
      audioEngine.playEvent('shieldActivate');
      break;
    case 'timeSlowLocal':
      timeSlowRemaining = 3.0;
      showWarning('time dilated — 3s', 'rgba(180, 140, 255, 0.95)', 2000);
      audioEngine.playEvent('timeSlow');
      break;
    case 'signalPurge':
      // Signal system not yet built — consume item, show feedback
      showWarning('signal purged', 'rgba(100, 255, 180, 0.95)', 2000);
      break;
    case 'breachFlare': {
      // Spawn a temporary portal near the ship
      const angle = Math.random() * Math.PI * 2;
      const dist = 0.15 + Math.random() * 0.1;
      const px = wrapWorld(ship.wx + Math.cos(angle) * dist);
      const py = wrapWorld(ship.wy + Math.sin(angle) * dist);
      portalSystem.addPortal(px, py, { type: 'unstable', lifespan: 15, spawnTime: simState.runElapsedTime });
      showWarning('breach flare — portal for 15s', 'rgba(255, 200, 100, 0.95)', 3000);
      audioEngine.playEvent('breachFlare');
      break;
    }
    default:
      showWarning(`used: ${effectId}`, 'rgba(200, 160, 255, 0.9)', 2000);
  }
}

function gameLoop(now) {
  if (!running) return;

  const rawDt = (now - lastFrameTime) / 1000;
  lastFrameTime = now;
  // Cap dt to 33ms (30fps floor) — prevents physics explosion after tab-away or long GC pause.
  // Without this, a 2s pause would inject dt=2.0, launching the ship across the map.
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

  const inMenu = gamePhase === 'title' || gamePhase === 'profileSelect' || gamePhase === 'home' || gamePhase === 'mapSelect' || gamePhase === 'loading' || rendererFixtureActive;
  const remoteVisualMode = remoteAuthorityActive && (gamePhase === 'playing' || gamePhase === 'dead');

  // === SIMULATION (runs during gameplay AND menus for background ambiance, frozen when paused) ===
  if (gamePhase !== 'paused') {
    simCore.update(simState, {
      frameDt: dt,
      totalTime,
      inMenu: inMenu || remoteVisualMode,
      visualOnly: remoteVisualMode,
    });
    if (remoteVisualMode) {
      combatSystem.update(dt);
      combatSystem.applyDisruptions(fluid);
      waveRings.update(dt);
      waveRings.injectIntoFluid(fluid);
    }

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
      audioEngine.init();
      audioEngine.setContext('menu');
      audioEngine.playEvent('menuConfirm');
      gamePhase = 'profileSelect';
      profileCursor = profileManager.activeSlot >= 0 ? profileManager.activeSlot : 0;
    }
    applySceneCamera(dt);

  } else if (gamePhase === 'profileSelect') {
    if (nameInputActive) {
      if (confirmNow && !_prevConfirm) {
        profileManager.createProfile(profileCursor, nameInputBuffer);
        nameInputActive = false;
        gamePhase = 'home';
        homeTab = 0;
        homePhaseTimer = 0;
        audioEngine.playEvent('menuConfirm');
      }
      if (backNow && !_prevBack) {
        nameInputActive = false;
      }
      applySceneCamera(dt);
    } else if (deleteConfirmSlot >= 0) {
      // Delete confirmation — Y/N
      if (confirmNow && !_prevConfirm) {
        profileManager.deleteProfile(deleteConfirmSlot);
        deleteConfirmSlot = -1;
      }
      if (backNow && !_prevBack) {
        deleteConfirmSlot = -1;
      }
      applySceneCamera(dt);
    } else {
      if (upNow && !_prevUp) { profileCursor = (profileCursor - 1 + 3) % 3; audioEngine.playEvent('menuMove'); }
      if (downNow && !_prevDown) { profileCursor = (profileCursor + 1) % 3; audioEngine.playEvent('menuMove'); }
      if (!transitionActive && confirmNow && !_prevConfirm) {
        if (profileManager.hasProfile(profileCursor)) {
          profileManager.loadProfile(profileCursor);
          audioEngine.playEvent('menuConfirm');
          audioEngine.setContext('menu');
          gamePhase = 'home';
          homeTab = 0;
          homePhaseTimer = 0;
          audioEngine.setContext('menu');
        } else {
          nameInputActive = true;
          nameInputBuffer = generatePilotName();
          audioEngine.playEvent('menuConfirm');
        }
      }
      // Delete pilot (X key / triangle button)
      if (inputManager.deletePressed && !_prevDelete && profileManager.hasProfile(profileCursor)) {
        deleteConfirmSlot = profileCursor;
      }
      if (!transitionActive && backNow && !_prevBack) {
        gamePhase = 'title';
        titleTimer = 0;
      }
      applySceneCamera(dt);
    }

  } else if (gamePhase === 'home') {
    homePhaseTimer += dt;
    const tabCount = 4; // SHIP, VAULT, UPGRADES, LAUNCH
    // Tab navigation: L1/R1 (or Q/E on keyboard) — dpad/stick reserved for in-tab scrolling
    if (inputManager.tabLeftPressed && !_prevTabLeft) { homeTab = (homeTab - 1 + tabCount) % tabCount; audioEngine.playEvent('tabSwitch'); }
    if (inputManager.tabRightPressed && !_prevTabRight) { homeTab = (homeTab + 1) % tabCount; audioEngine.playEvent('tabSwitch'); }

    if (homeTab === 0) { // SHIP — loadout management
      if (upNow && !_prevUp && homeShipCursor > 0) homeShipCursor--;
      if (downNow && !_prevDown && homeShipCursor < 3) homeShipCursor++;
      if (confirmNow && !_prevConfirm) {
        const p = profileManager.active;
        if (p) {
          if (homeShipCursor < 2) {
            // Unequip artifact → vault
            const item = p.loadout.equipped[homeShipCursor];
            if (item && p.vault.length < p.vaultCapacity) {
              p.loadout.equipped[homeShipCursor] = null;
              p.vault.push(item);
              profileManager.save();
            }
          } else {
            // Remove consumable → vault
            const idx = homeShipCursor - 2;
            const item = p.loadout.consumables[idx];
            if (item && p.vault.length < p.vaultCapacity) {
              p.loadout.consumables[idx] = null;
              p.vault.push(item);
              profileManager.save();
            }
          }
        }
      }
    } else if (homeTab === 1) { // VAULT
      if (upNow && !_prevUp && homeVaultCursor > 0) homeVaultCursor--;
      const p = profileManager.active;
      const vaultLen = p ? p.vault.length : 0;
      if (downNow && !_prevDown && homeVaultCursor < vaultLen - 1) homeVaultCursor++;
      if (confirmNow && !_prevConfirm && p && p.vault[homeVaultCursor]) {
        const item = p.vault[homeVaultCursor];
        if (item.subcategory === 'equippable') {
          // Equip artifact — move from vault to first open loadout slot (or swap slot 0)
          const openSlot = p.loadout.equipped.indexOf(null);
          const targetSlot = openSlot >= 0 ? openSlot : 0;
          const prev = p.loadout.equipped[targetSlot];
          p.loadout.equipped[targetSlot] = profileManager.takeFromVault(homeVaultCursor);
          if (prev) p.vault.splice(homeVaultCursor, 0, prev); // put old item back in vault
          profileManager.save();
          audioEngine.playEvent('equipItem');
        } else if (item.subcategory === 'consumable') {
          const openSlot = p.loadout.consumables.indexOf(null);
          const targetSlot = openSlot >= 0 ? openSlot : 0;
          const prev = p.loadout.consumables[targetSlot];
          p.loadout.consumables[targetSlot] = profileManager.takeFromVault(homeVaultCursor);
          if (prev) p.vault.splice(homeVaultCursor, 0, prev);
          profileManager.save();
          audioEngine.playEvent('equipItem');
        } else {
          profileManager.sellVaultItem(homeVaultCursor);
          audioEngine.playEvent('sellItem');
        }
        if (homeVaultCursor >= p.vault.length) homeVaultCursor = Math.max(0, p.vault.length - 1);
      }
    } else if (homeTab === 2) { // UPGRADES
      const tracks = Object.keys(UPGRADE_TRACKS);
      if (upNow && !_prevUp && homeUpgradeCursor > 0) homeUpgradeCursor--;
      if (downNow && !_prevDown && homeUpgradeCursor < tracks.length - 1) homeUpgradeCursor++;
      if (confirmNow && !_prevConfirm) {
        const track = tracks[homeUpgradeCursor];
        if (profileManager.canAffordUpgrade(track)) {
          profileManager.performUpgrade(track);
          audioEngine.playEvent('upgrade');
        } else {
          audioEngine.playEvent('cantAfford');
        }
      }
    } else if (homeTab === 3) { // LAUNCH
      if (confirmNow && !_prevConfirm) {
        // Apply upgrades and go to map select
        gamePhase = 'mapSelect';
      }
    }

    if (!transitionActive && backNow && !_prevBack) {
      gamePhase = 'profileSelect';
    }
    applySceneCamera(dt);

  } else if (gamePhase === 'mapSelect') {
    if (simClient?.enabled) void refreshRemoteSessionHealth(false);
    if (upNow && !_prevUp) { mapSelectIndex = (mapSelectIndex - 1 + MAP_LIST.length) % MAP_LIST.length; audioEngine.playEvent('menuMove'); }
    if (downNow && !_prevDown) { mapSelectIndex = (mapSelectIndex + 1) % MAP_LIST.length; audioEngine.playEvent('menuMove'); }
    if (!transitionActive && confirmNow && !_prevConfirm) {
      audioEngine.init();
      audioEngine.playEvent('launch');
      // Load loadout from profile before entering run
      const p = profileManager.active;
      if (p) {
        inventorySystem.equipped = p.loadout.equipped.map(i => i ? { ...i } : null);
        inventorySystem.consumables = p.loadout.consumables.map(i => i ? { ...i } : null);
      }
      const selectedEntry = PLAYABLE_MAPS[mapSelectIndex];
      if (simClient?.enabled) transitionToRemoteGame(selectedEntry);
      else transitionToGame(selectedEntry.map);
    }
    if (!transitionActive && inputManager.deletePressed && !_prevDelete && simClient?.enabled) {
      const selectedEntry = PLAYABLE_MAPS[mapSelectIndex];
      const remoteControl = currentRemoteControlState();
      if (remoteControl.canHostReset) {
        audioEngine.init();
        audioEngine.playEvent('launch');
        const p = profileManager.active;
        if (p) {
          inventorySystem.equipped = p.loadout.equipped.map(i => i ? { ...i } : null);
          inventorySystem.consumables = p.loadout.consumables.map(i => i ? { ...i } : null);
        }
        transitionToRemoteGame(selectedEntry, { forceReset: true });
      } else if (remoteControl.hasLiveSession) {
        showWarning('only the host can reset the live run', 'rgba(255, 150, 120, 0.95)', 2400);
      }
    }
    if (!transitionActive && backNow && !_prevBack) {
      gamePhase = 'home';
    }
    applySceneCamera(dt);

  } else if (gamePhase !== 'paused') {
    // --- Gameplay input ---
    if (pauseNow && !_prevPause) togglePause();

    if (!transitionActive && confirmNow && !_prevConfirm) {
      if (gamePhase === 'dead' && deathTimer > 1.0) {
        if (remoteAuthorityActive) {
          const previousEM = profileManager.active?.exoticMatter ?? 0;
          triggerTransition(() => {
            void leaveRemoteSessionToHome().catch((err) => {
              console.error('[LBH] remote leave failed:', err);
              showWarning(`remote exit failed: ${err.message}`, 'rgba(255, 100, 80, 0.95)', 4000);
            }).finally(() => {
              lastDeathTax = Math.max(0, previousEM - (profileManager.active?.exoticMatter ?? previousEM));
              loadTitleScene();
              gamePhase = 'home';
              homeTab = 0;
              homePhaseTimer = 0;
              audioEngine.setContext('menu');
            });
          });
          _prevConfirm = confirmNow;
          _prevPause = pauseNow;
          _prevBack = backNow;
          _prevUp = upNow;
          _prevDown = downNow;
          _prevLeft = inputManager.leftPressed;
          _prevRight = inputManager.rightPressed;
          _prevTabLeft = inputManager.tabLeftPressed;
          _prevTabRight = inputManager.tabRightPressed;
          _prevDelete = inputManager.deletePressed;
          _prevPulse = pulseNow;
          _prevInventory = inventoryNow;
          _prevConsumable1 = consumable1Now;
          _prevConsumable2 = consumable2Now;
          requestAnimationFrame(gameLoop);
          return;
        }
        // Save loadout on death — consumed items stay consumed, equipment changes persist
        profileManager.setLoadout(inventorySystem.equipped, inventorySystem.consumables);
        lastDeathTax = profileManager.recordDeath();
        triggerTransition(() => {
          loadTitleScene();
          gamePhase = 'home';
          homeTab = 0;
          homePhaseTimer = 0;
          audioEngine.setContext('menu');
        });
      }
      if (gamePhase === 'escaped' && escapeTimer > 1.0) {
        // Extract cargo → profile vault, then transition to home
        metaExtractedItems = inventorySystem.extractCargo();
        if (remoteAuthorityActive) {
          triggerTransition(() => {
            void leaveRemoteSessionToHome().catch((err) => {
              console.error('[LBH] remote leave after extraction failed:', err);
            }).finally(() => {
              gamePhase = 'meta';
              metaPhaseTimer = 0;
            });
          });
        } else {
          profileManager.recordExtraction(simState.runEndTime);
          const overflow = profileManager.storeItems(metaExtractedItems.map(i => ({ ...i })));
          // Sell overflow items automatically (vault full)
          for (const item of overflow) {
            profileManager.addEM(item.value || 0);
          }
          // Save loadout
          profileManager.setLoadout(inventorySystem.equipped, inventorySystem.consumables);
          triggerTransition(() => {
            gamePhase = 'meta';
            metaPhaseTimer = 0;
          });
        }
      }
      if (gamePhase === 'meta') {
        // Go to home screen after viewing salvage report
        triggerTransition(() => {
          loadTitleScene();
          gamePhase = 'home';
          homeTab = 0;
          homePhaseTimer = 0;
          audioEngine.setContext('menu');
        });
      }
    }

    if (remoteAuthorityActive) {
      if (!inventoryOpen) {
        inputManager.applyToShip(ship);
      } else {
        ship.setThrustIntensity(0);
        ship.setBrakeIntensity(0);
      }

      if (gamePhase === 'playing') {
        if (inventoryNow && !_prevInventory) {
          inventoryOpen = !inventoryOpen;
          if (inventoryOpen) resetInventoryCursor();
        }
        if (inventoryOpen && backNow && !_prevBack) {
          inventoryOpen = false;
        }
        if (inventoryOpen) {
          if (upNow && !_prevUp) inventoryCursorUp();
          if (downNow && !_prevDown) inventoryCursorDown();
          if (confirmNow && !_prevConfirm) {
            const action = getInventoryActionAtCursor(inventorySystem);
            if (action) applyRemoteInventoryAction(action);
          }
        }

        if (!inventoryOpen && consumable1Now && !_prevConsumable1) {
          remotePendingConsumeSlot = 0;
        } else if (!inventoryOpen && consumable2Now && !_prevConsumable2) {
          remotePendingConsumeSlot = 1;
        }
        if (pulseNow && !_prevPulse) {
          remotePendingPulse = true;
        }

        if (!remoteInputRequestInFlight) {
          const facing = inputManager.facing ?? ship.facing;
          const thrust = inventoryOpen ? 0 : inputManager.thrustIntensity;
          const brake = inventoryOpen ? 0 : inputManager.brakeIntensity;
          const moveMag = thrust > 0 ? 1 : 0;
          const sentPulse = remotePendingPulse;
          const sentConsumeSlot = remotePendingConsumeSlot;
          remoteInputRequestInFlight = true;
          void simClient.sendInput({
            moveX: Math.cos(facing) * moveMag,
            moveY: Math.sin(facing) * moveMag,
            thrust,
            brake,
            pulse: sentPulse,
            ability1: inputManager.ability1 || false,
            ability2: inputManager.ability2 || false,
            consumeSlot: sentConsumeSlot,
          }).then((response) => {
            remoteLastAckSeq = response.acceptedSeq ?? remoteLastAckSeq;
            if (sentPulse) remotePendingPulse = false;
            if (sentConsumeSlot !== null && remotePendingConsumeSlot === sentConsumeSlot) {
              remotePendingConsumeSlot = null;
            }
          }).catch((err) => {
            console.error('[LBH] remote input failed:', err);
          }).finally(() => {
            remoteInputRequestInFlight = false;
          });
        }

        if (!remoteSnapshotRequestInFlight) {
          remoteSnapshotRequestInFlight = true;
          void simClient.pollSnapshot().then((snapshot) => {
            applyRemoteSnapshot(snapshot);
          }).catch((err) => {
            console.error('[LBH] remote snapshot failed:', err);
          }).finally(() => {
            remoteSnapshotRequestInFlight = false;
          });
        }
      } else if (gamePhase === 'dead') {
        deathTimer += dt;
      } else if (gamePhase === 'escaped') {
        escapeTimer += dt;
      }
    } else {
      // 5. Wave ring forces on ship
      waveRings.applyToShip(ship);

      // Suppress ship input while inventory is open (don't fly into a well while sorting loot)
      if (!inventoryOpen) {
        inputManager.applyToShip(ship);
      } else {
        ship.setThrustIntensity(0);
        ship.setBrakeIntensity(0);
      }

      // 6. Ship update
      if (gamePhase === 'playing') {
      // Time slow consumable: ship experiences 30% of normal time
      let shipDt = dt;
      if (timeSlowRemaining > 0) {
        const wasSlowed = timeSlowRemaining > 0;
        timeSlowRemaining -= dt;
        if (wasSlowed && timeSlowRemaining <= 0) audioEngine.playEvent('timeSlowEnd');
        shipDt = dt * 0.3;
      }
      // Equippable effect: reduceWellPull — 20% less well gravity on ship
      const hasReduceWellPull = inventorySystem.hasEffect('reduceWellPull');
      let _savedPull;
      if (hasReduceWellPull) {
        _savedPull = CONFIG.wells.shipPullStrength;
        CONFIG.wells.shipPullStrength *= 0.8;
      }
      ship.update(shipDt, flowField, wellSystem, fluid);
      if (hasReduceWellPull) {
        CONFIG.wells.shipPullStrength = _savedPull;
      }

      starSystem.applyToShip(ship);
      planetoidSystem.applyToShip(ship);

      // Star consumption events — dramatic flash + stellar remnant wreck
      for (const evt of starSystem.consumptionEvents) {
        const [cr, cg, cb] = evt.starColor;
        showWarning(`${evt.starName} consumed — stellar remnant!`, `rgba(${cr}, ${cg}, ${cb}, 0.95)`, 4000);
        audioEngine.playEvent('starConsumed', evt.wx, evt.wy, camX, camY, overlayCanvas.width, overlayCanvas.height);
        _starFlashTimer = 0.8;
        _starFlashColor = evt.starColor;

        // Spawn a vault-tier wreck ejected away from the well
        const angle = Math.random() * Math.PI * 2;
        const ejectDist = 0.08;
        const ejectSpeed = 0.4;
        const rwx = wrapWorld(evt.wx + Math.cos(angle) * ejectDist);
        const rwy = wrapWorld(evt.wy + Math.sin(angle) * ejectDist);
        const remnant = wreckSystem.addWreck(rwx, rwy, {
          type: 'vault', tier: 3, size: 'large',
          vx: Math.cos(angle) * ejectSpeed,
          vy: Math.sin(angle) * ejectSpeed,
          pickupCooldown: 1.0,
        });
        remnant.name = `Remnant of ${evt.starName}`;
      }
      starSystem.clearConsumptionEvents();

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
        if (effect) applyConsumableEffect(effect);
      }
      if (!inventoryOpen && consumable2Now && !_prevConsumable2) {
        const effect = inventorySystem.useConsumable(1);
        if (effect) applyConsumableEffect(effect);
      }

      // Wreck pickup (pass available slots so partial loot works correctly)
      if (!inventorySystem.cargoFull) {
        const slotsAvailable = inventorySystem.cargoMax - inventorySystem.cargoCount;
        const newItems = wreckSystem.checkPickup(ship.wx, ship.wy, slotsAvailable);
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
      const hullRank = profileManager.active?.upgrades?.hull ?? 0;
      // Hull grace period: rank 1 = 0.3s, rank 2 = 0.4s, rank 3 = 0.5s
      const hullGraceDuration = hullRank > 0 ? 0.2 + hullRank * 0.1 : 0;
      // Hull rank 2+: one free survive per run (like built-in shield)
      const hullHasFreePass = hullRank >= 2 && !hullGraceUsed;

      if (killingWell) {
        if (shieldActive) {
          // Shield burst consumable: survive one contact
          shieldActive = false;
          showWarning('shield absorbed!', 'rgba(100, 200, 255, 0.95)', 2000);
          audioEngine.playEvent('shieldAbsorb');
        } else if (hullHasFreePass && hullGraceTimer <= 0) {
          // Hull free pass: first contact this run is forgiven
          hullGraceUsed = true;
          hullGraceTimer = 0.5;
          showWarning('hull absorbed impact!', 'rgba(100, 255, 180, 0.95)', 2000);
        } else if (hullGraceDuration > 0 && hullGraceTimer <= 0) {
          // Start grace period — player has a moment to escape
          hullGraceTimer = hullGraceDuration;
        } else if (hullGraceTimer > 0) {
          // Still in grace period — count down
          hullGraceTimer -= dt;
          if (hullGraceTimer <= 0) {
            // Grace expired while still in kill zone — die
            gamePhase = 'dead';
            deathTimer = 0;
            freezeRunEnd(simState);
            ship.setThrust(false);
            audioEngine.playEvent('death');
          }
        } else {
          // No hull upgrade, no shield — instant death
          gamePhase = 'dead';
          deathTimer = 0;
          freezeRunEnd(simState);
          ship.setThrust(false);
          audioEngine.playEvent('death');
        }
      } else {
        // Left kill zone — reset grace timer
        if (hullGraceTimer > 0) {
          hullGraceTimer = 0;
          showWarning('escaped!', 'rgba(100, 255, 180, 0.9)', 1500);
        }
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
  _prevLeft = inputManager.leftPressed;
  _prevRight = inputManager.rightPressed;
  _prevTabLeft = inputManager.tabLeftPressed;
  _prevTabRight = inputManager.tabRightPressed;
  _prevDelete = inputManager.deletePressed;
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
  // Inhibitor shader data
  let inhData = null;
  if (inhibitorState.form > 0) {
    const [inhU, inhV] = worldToFluidUV(inhibitorState.wx, inhibitorState.wy);
    inhData = {
      form: inhibitorState.form,
      posU: inhU, posV: inhV,
      radius: inhibitorState.radius,
      intensity: inhibitorState.intensity,
      localTime: inhibitorState.localTime,
    };
  }
  fluid.render(sceneTarget, wellUVs, camFU, camFV, WORLD_SCALE, totalTime, wellMasses, wellShapes, inhData);
  asciiRenderer.render(totalTime, camFU, camFV, WORLD_SCALE, fluid.velocity.read.tex, getGlitchIntensity());

  // 8. Render overlay
  ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

  // Loading screen — shown between map select and first snapshot
  if (gamePhase === 'loading') {
    const elapsed = (performance.now() - loadingStartTime) / 1000;
    const w = overlayCanvas.width;
    const h = overlayCanvas.height;
    const cx = w / 2;
    const cy = h / 2;

    // Pulsing dot in center
    const pulse = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(elapsed * Math.PI * 2));
    ctx.fillStyle = `rgba(180, 200, 220, ${(pulse * 0.8).toFixed(2)})`;
    ctx.beginPath();
    ctx.arc(cx, cy, 3 + pulse * 2, 0, Math.PI * 2);
    ctx.fill();

    // Expanding ring
    const ringRadius = 10 + (elapsed % 2) * 40;
    const ringAlpha = Math.max(0, 1 - (elapsed % 2) / 2);
    ctx.strokeStyle = `rgba(140, 160, 180, ${(ringAlpha * 0.4).toFixed(2)})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, ringRadius, 0, Math.PI * 2);
    ctx.stroke();

    // Map name
    ctx.font = '11px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(140, 160, 180, 0.6)';
    ctx.fillText(loadingMapName.toLowerCase(), cx, cy + 40);

    // "dropping in" text with ellipsis animation
    const dots = '.'.repeat(1 + Math.floor(elapsed * 2) % 3);
    ctx.fillStyle = 'rgba(100, 120, 140, 0.5)';
    ctx.fillText('dropping in' + dots, cx, cy + 55);
  }

  if (!inMenu) {
    // Only render game entities when playing (not on title/mapSelect)
    waveRings.render(ctx, camX, camY, overlayCanvas.width, overlayCanvas.height);
    starSystem.render(ctx, camX, camY, overlayCanvas.width, overlayCanvas.height, totalTime);
    // lootSystem removed — loot anchors replaced with stars
    wreckSystem.render(ctx, camX, camY, overlayCanvas.width, overlayCanvas.height, totalTime);
    portalSystem.render(ctx, camX, camY, overlayCanvas.width, overlayCanvas.height, totalTime, simState.runElapsedTime);
    planetoidSystem.render(ctx, camX, camY, overlayCanvas.width, overlayCanvas.height);
    scavengerSystem.render(ctx, camX, camY, overlayCanvas.width, overlayCanvas.height, totalTime);
    renderFauna(ctx, camX, camY, overlayCanvas.width, overlayCanvas.height, totalTime);
    renderSentries(ctx, camX, camY, overlayCanvas.width, overlayCanvas.height, totalTime);
    renderRemotePlayers(ctx, camX, camY, overlayCanvas.width, overlayCanvas.height);
    ship.render(ctx, camX, camY);
    combatSystem.renderCooldown(ctx, ship, camX, camY, overlayCanvas.width, overlayCanvas.height);

    // Hull ability visual effects
    if (localAbilityState) {
      const as = localAbilityState;
      const [sx, sy] = worldToScreen(ship.wx, ship.wy, camX, camY, overlayCanvas.width, overlayCanvas.height);

      // Drifter: flow lock glow ring
      if (as.hullType === 'drifter' && as.flowLockActive) {
        const pulse = 0.5 + 0.5 * Math.sin(totalTime * Math.PI * 3);
        ctx.strokeStyle = `rgba(100, 220, 240, ${(0.3 + pulse * 0.2).toFixed(2)})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(sx, sy, 18 + pulse * 4, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Breacher: burn afterglow
      if (as.hullType === 'breacher' && as.burnActive) {
        const flicker = 0.6 + Math.random() * 0.4;
        ctx.fillStyle = `rgba(255, 120, 40, ${(0.15 * flicker).toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(sx, sy, 25, 0, Math.PI * 2);
        ctx.fill();
      }

      // Resonant: render eddies as spinning circles
      if (as.hullType === 'resonant' && as.eddies) {
        for (const eddy of as.eddies) {
          const [ex, ey] = worldToScreen(eddy.wx, eddy.wy, camX, camY, overlayCanvas.width, overlayCanvas.height);
          const ageFrac = eddy.age / 6.0;
          const alpha = Math.max(0, 0.3 * (1 - ageFrac));
          const spin = totalTime * 2 + eddy.age;
          ctx.save();
          ctx.translate(ex, ey);
          ctx.rotate(spin);
          ctx.strokeStyle = `rgba(180, 120, 255, ${alpha.toFixed(2)})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(0, 0, 12, 0, Math.PI * 1.5);
          ctx.stroke();
          ctx.restore();
        }
      }

      // Resonant: tap anchor marker
      if (as.hullType === 'resonant' && as.tapAnchor) {
        const [ax, ay] = worldToScreen(as.tapAnchor.wx, as.tapAnchor.wy, camX, camY, overlayCanvas.width, overlayCanvas.height);
        ctx.strokeStyle = 'rgba(180, 120, 255, 0.4)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.arc(ax, ay, 8, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Shroud: render decoys as fading signal dots
      if (as.hullType === 'shroud' && as.decoys) {
        for (const decoy of as.decoys) {
          const [dx, dy] = worldToScreen(decoy.wx, decoy.wy, camX, camY, overlayCanvas.width, overlayCanvas.height);
          const alpha = Math.max(0, (decoy.signal || 0) * 0.8);
          ctx.fillStyle = `rgba(200, 100, 255, ${alpha.toFixed(2)})`;
          ctx.beginPath();
          ctx.arc(dx, dy, 4, 0, Math.PI * 2);
          ctx.fill();
          // Faint signal ring
          ctx.strokeStyle = `rgba(200, 100, 255, ${(alpha * 0.3).toFixed(2)})`;
          ctx.beginPath();
          ctx.arc(dx, dy, 10 + decoy.signal * 5, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    }

    // Equippable effect: showKillRadii — draw kill zone circles during gameplay
    if (inventorySystem.hasEffect('showKillRadii')) {
      const wellData = wellSystem.getWellData(camX, camY, overlayCanvas.width, overlayCanvas.height);
      const ppw = overlayCanvas.width / WORLD_SCALE;
      ctx.save();
      ctx.setLineDash([4, 4]);
      for (let i = 0; i < wellData.length; i++) {
        const kr = wellSystem.wells[i].killRadius * ppw;
        ctx.strokeStyle = 'rgba(255, 60, 60, 0.5)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(wellData[i].x, wellData[i].y, kr, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.restore();
    }

    // Equippable effect: showFlowArrows — draw fluid velocity indicators near ship
    if (inventorySystem.hasEffect('showFlowArrows')) {
      const ppw = pxPerWorld(overlayCanvas.width);
      const shipScreen = worldToScreen(ship.wx, ship.wy, camX, camY, overlayCanvas.width, overlayCanvas.height);
      ctx.save();
      ctx.strokeStyle = 'rgba(100, 200, 255, 0.3)';
      ctx.lineWidth = 1;
      // Sample a grid of points around the ship
      const gridSize = 5;
      const spacing = 0.06;
      for (let gx = -gridSize; gx <= gridSize; gx++) {
        for (let gy = -gridSize; gy <= gridSize; gy++) {
          const wx = ship.wx + gx * spacing;
          const wy = ship.wy + gy * spacing;
          const vel = flowField.sample(wx, wy);
          const speed = Math.sqrt(vel[0] * vel[0] + vel[1] * vel[1]);
          if (speed < 0.005) continue;
          const [px, py] = worldToScreen(wx, wy, camX, camY, overlayCanvas.width, overlayCanvas.height);
          const len = Math.min(speed * ppw * 0.3, 20);
          const dx = (vel[0] / speed) * len;
          const dy = (vel[1] / speed) * len;
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(px + dx, py + dy);
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    // Equippable effect: signalDampen — signal system not yet built, effect is passive
    // when signal exists. No runtime code needed until then.

    // Shield burst indicator
    if (shieldActive) {
      const shipScreen = worldToScreen(ship.wx, ship.wy, camX, camY, overlayCanvas.width, overlayCanvas.height);
      ctx.save();
      ctx.strokeStyle = `rgba(100, 200, 255, ${0.4 + 0.3 * Math.sin(totalTime * 4)})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(shipScreen[0], shipScreen[1], 18, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // === EDGE INDICATORS — off-screen wells (red) and nearest wreck (gold) ===
    {
      ctx.save();
      const margin = 20;
      const w = overlayCanvas.width, h = overlayCanvas.height;

      function drawEdgeArrow(screenX, screenY, color, size) {
        // Clamp to screen edges
        const cx = w / 2, cy = h / 2;
        const dx = screenX - cx, dy = screenY - cy;
        const maxX = w / 2 - margin, maxY = h / 2 - margin;
        if (Math.abs(dx) < maxX && Math.abs(dy) < maxY) return; // on screen
        const scale = Math.min(maxX / Math.abs(dx || 1), maxY / Math.abs(dy || 1));
        const ax = cx + dx * scale, ay = cy + dy * scale;
        const angle = Math.atan2(dy, dx);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(ax + Math.cos(angle) * size, ay + Math.sin(angle) * size);
        ctx.lineTo(ax + Math.cos(angle + 2.5) * size * 0.5, ay + Math.sin(angle + 2.5) * size * 0.5);
        ctx.lineTo(ax + Math.cos(angle - 2.5) * size * 0.5, ay + Math.sin(angle - 2.5) * size * 0.5);
        ctx.closePath();
        ctx.fill();
      }

      // Wells — red arrows
      for (const well of wellSystem.wells) {
        const [sx, sy] = worldToScreen(well.wx, well.wy, camX, camY, w, h);
        drawEdgeArrow(sx, sy, 'rgba(255, 50, 30, 0.5)', 8);
      }

      // Nearest unlooted wreck — gold arrow
      let nearestWreck = null, nearestDist = 999;
      for (const wreck of wreckSystem.wrecks) {
        if (!wreck.alive || wreck.looted) continue;
        const dist = worldDistance(ship.wx, ship.wy, wreck.wx, wreck.wy);
        if (dist < nearestDist) { nearestDist = dist; nearestWreck = wreck; }
      }
      if (nearestWreck) {
        const [sx, sy] = worldToScreen(nearestWreck.wx, nearestWreck.wy, camX, camY, w, h);
        drawEdgeArrow(sx, sy, 'rgba(255, 200, 60, 0.5)', 7);
      }

      ctx.restore();
    }

    // === PROXIMITY FLAVOR TEXT LABELS ===
    // Fade in when close, fade out when far. Every named entity gets one.
    {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
      ctx.shadowBlur = 6;

      // Sensor upgrade extends detection range: rank 0 = 0.15/0.4, rank 3 = 0.3/0.85
      const sensorRank = profileManager.active?.upgrades?.sensor ?? 0;
      const fadeNear = 0.15 + sensorRank * 0.05;
      const fadeFar = 0.4 + sensorRank * 0.15;

      function labelAlpha(dist) {
        if (dist < fadeNear) return 1.0;
        if (dist > fadeFar) return 0.0;
        return 1.0 - (dist - fadeNear) / (fadeFar - fadeNear);
      }

      // Wells — foreboding names, dark red, allcaps, below center
      for (const well of wellSystem.wells) {
        const dist = worldDistance(ship.wx, ship.wy, well.wx, well.wy);
        const a = labelAlpha(dist);
        if (a <= 0) continue;
        const [sx, sy] = worldToScreen(well.wx, well.wy, camX, camY, overlayCanvas.width, overlayCanvas.height);
        ctx.font = 'bold 10px monospace';
        const labelY = sy + well.killRadius * pxPerWorld(overlayCanvas.width) + 18;
        // Dark outline for readability on red accretion background
        ctx.strokeStyle = `rgba(0, 0, 0, ${a * 0.9})`;
        ctx.lineWidth = 3;
        ctx.strokeText(well.name.toUpperCase(), sx, labelY);
        ctx.fillStyle = `rgba(255, 180, 160, ${a * 0.9})`;
        ctx.fillText(well.name.toUpperCase(), sx, labelY);
      }

      // Stars — scientific designation, type-colored
      for (const star of starSystem.stars) {
        if (!star.alive) continue;
        const dist = worldDistance(ship.wx, ship.wy, star.wx, star.wy);
        const a = labelAlpha(dist);
        if (a <= 0) continue;
        const [sx, sy] = worldToScreen(star.wx, star.wy, camX, camY, overlayCanvas.width, overlayCanvas.height);
        const [cr, cg, cb] = star.typeDef.color;
        ctx.font = '10px monospace';
        ctx.fillStyle = `rgba(${cr}, ${cg}, ${cb}, ${a * 0.6})`;
        const haloR = (60 + 20 * star.mass) * star.typeDef.sizeMult;
        ctx.fillText(star.name, sx, sy + haloR + 10);
      }

      // Comets — names, ice blue, trailing behind body
      for (const p of planetoidSystem.planetoids) {
        if (!p.alive) continue;
        const dist = worldDistance(ship.wx, ship.wy, p.wx, p.wy);
        const a = labelAlpha(dist);
        if (a <= 0) continue;
        const [sx, sy] = worldToScreen(p.wx, p.wy, camX, camY, overlayCanvas.width, overlayCanvas.height);
        ctx.font = '9px monospace';
        ctx.fillStyle = `rgba(180, 210, 240, ${a * 0.6})`;
        ctx.fillText(p.name, sx, sy + 16);
      }

      // Wrecks — name + item count, type-colored
      for (const wreck of wreckSystem.wrecks) {
        if (!wreck.alive) continue;
        const dist = worldDistance(ship.wx, ship.wy, wreck.wx, wreck.wy);
        const a = labelAlpha(dist);
        if (a <= 0) continue;
        const [sx, sy] = worldToScreen(wreck.wx, wreck.wy, camX, camY, overlayCanvas.width, overlayCanvas.height);
        let color;
        if (wreck.type === 'vault') color = `rgba(255, 215, 60, ${a * 0.7})`;
        else if (wreck.type === 'debris') color = `rgba(180, 140, 80, ${a * 0.6})`;
        else color = `rgba(160, 180, 200, ${a * 0.6})`;
        ctx.font = '10px monospace';
        ctx.fillStyle = color;
        const itemText = wreck.looted ? '' : ` (${wreck.loot.length})`;
        ctx.fillText(wreck.name + itemText, sx, sy + 18);
      }

      // Scavengers — faction + callsign, archetype-colored
      for (const scav of scavengerSystem.scavengers) {
        if (!scav.alive) continue;
        const dist = worldDistance(ship.wx, ship.wy, scav.wx, scav.wy);
        const a = labelAlpha(dist);
        if (a <= 0) continue;
        const [sx, sy] = worldToScreen(scav.wx, scav.wy, camX, camY, overlayCanvas.width, overlayCanvas.height);
        const color = scav.archetype === 'vulture'
          ? `rgba(212, 160, 96, ${a * 0.7})`
          : `rgba(138, 174, 196, ${a * 0.7})`;
        ctx.font = '9px monospace';
        ctx.fillStyle = color;
        ctx.fillText(scav.name, sx, sy - 14);
      }

      ctx.restore();
    }

    // Hull grace warning — red screen edge pulse when in kill zone
    if (hullGraceTimer > 0) {
      const w = overlayCanvas.width, h = overlayCanvas.height;
      const urgency = 0.5 + 0.5 * Math.sin(totalTime * 12);
      const grad = ctx.createRadialGradient(w/2, h/2, Math.min(w,h) * 0.3, w/2, h/2, Math.min(w,h) * 0.6);
      grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
      grad.addColorStop(1, `rgba(255, 30, 0, ${0.25 * urgency})`);
      ctx.save();
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }

    // Well proximity warning — subtle red vignette as ship approaches wells
    if (gamePhase === 'playing') {
      let closestWellDist = 999;
      for (const well of wellSystem.wells) {
        const dist = worldDistance(ship.wx, ship.wy, well.wx, well.wy);
        const dangerDist = well.killRadius * 4;
        if (dist < dangerDist && dist < closestWellDist) closestWellDist = dist;
      }
      if (closestWellDist < 999) {
        const nearestWell = wellSystem.wells.reduce((best, w) => {
          const d = worldDistance(ship.wx, ship.wy, w.wx, w.wy);
          return d < best.dist ? { well: w, dist: d } : best;
        }, { well: null, dist: 999 });
        const dangerZone = nearestWell.well.killRadius * 4;
        const proximity = 1 - Math.min(nearestWell.dist / dangerZone, 1);
        if (proximity > 0.1) {
          const w = overlayCanvas.width, h = overlayCanvas.height;
          const grad = ctx.createRadialGradient(w/2, h/2, Math.min(w,h) * 0.35, w/2, h/2, Math.min(w,h) * 0.65);
          grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
          grad.addColorStop(1, `rgba(180, 20, 0, ${proximity * 0.12})`);
          ctx.save();
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, w, h);
          ctx.restore();
        }
      }
    }

    // Star consumption flash — brief screen tint
    if (_starFlashTimer > 0) {
      _starFlashTimer -= dt;
      const flashAlpha = Math.max(0, _starFlashTimer / 0.8) * 0.25;
      const [fr, fg, fb] = _starFlashColor;
      ctx.save();
      ctx.fillStyle = `rgba(${fr}, ${fg}, ${fb}, ${flashAlpha})`;
      ctx.fillRect(0, 0, overlayCanvas.width, overlayCanvas.height);
      ctx.restore();
    }

    // Time slow indicator — purple vignette
    if (timeSlowRemaining > 0) {
      const fade = Math.min(timeSlowRemaining, 0.5) * 2;  // fade out in last 0.5s
      ctx.save();
      const w = overlayCanvas.width, h = overlayCanvas.height;
      const grad = ctx.createRadialGradient(w/2, h/2, Math.min(w,h) * 0.3, w/2, h/2, Math.min(w,h) * 0.7);
      grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
      grad.addColorStop(1, `rgba(120, 80, 200, ${0.15 * fade})`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }

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

    // Detect scavenger portal consumption in local mode.
    if (!remoteAuthorityActive) {
      const currentPortalCount = portalSystem.activeCount;
      if (_prevPortalCount >= 0 && currentPortalCount < _prevPortalCount && gamePhase === 'playing') {
        const lost = _prevPortalCount - currentPortalCount;
        for (let i = 0; i < lost; i++) {
          showWarning('scavenger extracted — portal consumed', 'rgba(180, 120, 255, 0.9)', 3000);
        }
      }
      _prevPortalCount = currentPortalCount;
    } else {
      _prevPortalCount = portalSystem.activeCount;
    }

    // Scavenger death drops remain local-only in local authority mode.
    if (!remoteAuthorityActive) {
      for (const drop of scavengerSystem.deathDrops) {
        for (let i = 0; i < drop.lootCount; i++) {
          const angle = Math.random() * Math.PI * 2;
          const ejectDist = 0.05 + Math.random() * 0.05;
          const ejectSpeed = 0.2 + Math.random() * 0.2;
          const wx = wrapWorld(drop.wx + Math.cos(angle) * ejectDist);
          const wy = wrapWorld(drop.wy + Math.sin(angle) * ejectDist);
          wreckSystem.addWreck(wx, wy, {
            type: 'derelict', tier: drop.tier, size: 'scattered',
            vx: Math.cos(angle) * ejectSpeed,
            vy: Math.sin(angle) * ejectSpeed,
            pickupCooldown: 0.5,
          });
        }
        showWarning(`${drop.name} destroyed — loot scattered`, 'rgba(200, 140, 80, 0.9)', 3000);
        audioEngine.playEvent('scavDeath', drop.wx, drop.wy, camX, camY, overlayCanvas.width, overlayCanvas.height);
      }
      scavengerSystem.deathDrops = [];
    }

    // Update HUD during gameplay
    const cargoItems = inventorySystem.getCargoItems();
    updateHUD(simState.runElapsedTime, portalSystem, cargoItems, simState.growthTimer, {
      scavengerSystem,
      combatSystem,
      signature: currentSignature,
      inventorySystem,
      inventoryOpen,
      signalLevel,
      signalZone,
      abilityState: localAbilityState,
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

    // Loot anchors removed — positions converted to stars

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
    const w = overlayCanvas.width, h = overlayCanvas.height;

    ctx.save();
    ctx.textAlign = 'center';

    // Subtle scanlines over the simulation backdrop
    drawScanlines(ctx, w, h, 0.03);

    // Title — bold red glow
    const titlePulse = 0.85 + 0.15 * Math.sin(totalTime * 1.5);
    ctx.shadowColor = 'rgba(255, 40, 20, 0.4)';
    ctx.shadowBlur = 30;
    ctx.fillStyle = `rgba(255, 70, 40, ${titlePulse})`;
    ctx.font = 'bold 52px monospace';
    ctx.fillText('LAST SINGULARITY', cx, cy - 50);
    ctx.fillText('LAST SINGULARITY', cx, cy - 50); // double for glow

    // Subtitle
    ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
    ctx.shadowBlur = 12;
    ctx.fillStyle = 'rgba(140, 210, 240, 0.9)';
    ctx.font = '15px monospace';
    ctx.fillText('out of a dying universe', cx, cy - 8);

    // Tagline
    ctx.fillStyle = 'rgba(200, 210, 230, 0.7)';
    ctx.font = '13px monospace';
    ctx.fillText('surf the currents. escape the void.', cx, cy + 16);

    // Prompt (fades in after 0.5s)
    if (titleTimer > 0.5) {
      const blink = Math.sin(totalTime * 3) > 0 ? 1 : 0.4;
      ctx.shadowBlur = 8;
      ctx.fillStyle = `rgba(220, 225, 240, ${blink})`;
      ctx.font = '16px monospace';
      ctx.fillText('press space to begin', cx, cy + 80);
    }

    // Version
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(100, 110, 130, 0.3)';
    ctx.font = '10px monospace';
    ctx.fillText('v0.2 — week 2 build', cx, h - 20);

    ctx.restore();
  }

  // === PROFILE SELECT SCREEN ===
  if (!rendererFixtureActive && gamePhase === 'profileSelect') {
    const cx = overlayCanvas.width / 2;
    let y = overlayCanvas.height * 0.25;

    ctx.save();
    const w = overlayCanvas.width, h = overlayCanvas.height;
    ctx.fillStyle = 'rgba(0, 2, 12, 0.88)';
    ctx.fillRect(0, 0, w, h);
    drawScanlines(ctx, w, h);
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
    ctx.shadowBlur = 8;

    // Terminal frame — title is the only label (no double)
    drawTerminalFrame(ctx, cx - 220, y - 30, 440, 290, null, 'rgba(100, 200, 220, 0.25)');

    ctx.fillStyle = 'rgba(160, 230, 245, 0.95)';
    ctx.font = 'bold 22px monospace';
    ctx.fillText('SELECT PILOT', cx, y);
    y += 45;

    for (let i = 0; i < 3; i++) {
      const selected = (profileCursor === i);
      const profile = profileManager.slots[i];
      const boxY = y;
      const boxH = 60;

      // Selection highlight
      if (selected) {
        ctx.fillStyle = 'rgba(60, 80, 120, 0.4)';
        ctx.fillRect(cx - 200, boxY - 5, 400, boxH);
        ctx.strokeStyle = 'rgba(100, 150, 255, 0.6)';
        ctx.lineWidth = 1;
        ctx.strokeRect(cx - 200, boxY - 5, 400, boxH);
      }

      if (profile) {
        ctx.fillStyle = selected ? 'rgba(230, 240, 255, 1)' : 'rgba(180, 190, 210, 0.85)';
        ctx.font = 'bold 15px monospace';
        ctx.fillText(profile.name, cx, boxY + 18);
        ctx.font = '11px monospace';
        ctx.fillStyle = selected ? 'rgba(255, 225, 110, 0.95)' : 'rgba(180, 170, 140, 0.6)';
        ctx.fillText(`${profile.exoticMatter} EM  |  ${profile.totalExtractions} extractions`, cx, boxY + 38);
      } else {
        ctx.fillStyle = selected ? 'rgba(170, 195, 220, 0.9)' : 'rgba(120, 130, 150, 0.5)';
        ctx.font = '13px monospace';
        ctx.fillText('— empty slot —', cx, boxY + 25);
      }

      y += boxH + 10;
    }

    // Name input overlay
    if (nameInputActive) {
      ctx.fillStyle = 'rgba(0, 0, 20, 0.9)';
      ctx.fillRect(cx - 200, overlayCanvas.height * 0.45, 400, 80);
      ctx.strokeStyle = 'rgba(100, 200, 255, 0.6)';
      ctx.strokeRect(cx - 200, overlayCanvas.height * 0.45, 400, 80);
      ctx.fillStyle = 'rgba(200, 200, 220, 0.7)';
      ctx.font = '12px monospace';
      ctx.fillText('type name + enter to confirm    esc to cancel', cx, overlayCanvas.height * 0.45 + 25);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.font = '18px monospace';
      const blink = Math.sin(totalTime * 6) > 0 ? '|' : '';
      ctx.fillText(nameInputBuffer + blink, cx, overlayCanvas.height * 0.45 + 55);
    }

    // Delete confirmation overlay
    if (deleteConfirmSlot >= 0) {
      ctx.fillStyle = 'rgba(0, 0, 20, 0.85)';
      ctx.fillRect(cx - 180, overlayCanvas.height * 0.45, 360, 70);
      ctx.strokeStyle = 'rgba(255, 80, 80, 0.6)';
      ctx.strokeRect(cx - 180, overlayCanvas.height * 0.45, 360, 70);
      ctx.fillStyle = 'rgba(255, 100, 80, 0.9)';
      ctx.font = '13px monospace';
      ctx.fillText(`delete "${profileManager.slots[deleteConfirmSlot]?.name}"?`, cx, overlayCanvas.height * 0.45 + 28);
      ctx.fillStyle = 'rgba(200, 200, 220, 0.7)';
      ctx.font = '11px monospace';
      ctx.fillText('space: confirm    esc: cancel', cx, overlayCanvas.height * 0.45 + 52);
    }

    // Controls hint
    ctx.fillStyle = 'rgba(120, 130, 150, 0.5)';
    ctx.font = '11px monospace';
    ctx.fillText('↑↓ select    space/A: load    X/Y: delete    esc/B: back', cx, overlayCanvas.height * 0.85);

    ctx.restore();
  }

  // === HOME SCREEN ===
  if (!rendererFixtureActive && gamePhase === 'home') {
    const cx = overlayCanvas.width / 2;
    const p = profileManager.active;

    const w = overlayCanvas.width, h = overlayCanvas.height;

    ctx.save();
    ctx.fillStyle = 'rgba(0, 2, 12, 0.90)';
    ctx.fillRect(0, 0, w, h);
    drawScanlines(ctx, w, h);
    ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
    ctx.shadowBlur = 8;

    // Terminal frame — no title label (header text inside is enough)
    drawTerminalFrame(ctx, cx - 230, 15, 460, h - 50, null, 'rgba(80, 100, 140, 0.2)');

    // Header: pilot name + EM
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(200, 210, 230, 0.8)';
    ctx.font = '12px monospace';
    ctx.fillText(`pilot: ${p?.name || '???'}`, cx, 35);
    ctx.fillStyle = 'rgba(255, 220, 100, 0.85)';
    ctx.font = 'bold 14px monospace';
    ctx.fillText(`${p?.exoticMatter || 0} EM`, cx, 55);

    // Tab bar
    const tabNames = ['SHIP', 'VAULT', 'UPGRADES', 'LAUNCH'];
    const tabWidth = 120;
    const tabStartX = cx - (tabNames.length * tabWidth) / 2;
    for (let i = 0; i < tabNames.length; i++) {
      const tx = tabStartX + i * tabWidth + tabWidth / 2;
      const active = (homeTab === i);
      ctx.fillStyle = active ? 'rgba(130, 175, 255, 1)' : 'rgba(140, 150, 170, 0.65)';
      ctx.font = active ? 'bold 13px monospace' : '12px monospace';
      ctx.fillText(tabNames[i], tx, 80);
      if (active) {
        ctx.fillStyle = 'rgba(100, 150, 255, 0.6)';
        ctx.fillRect(tx - tabWidth / 2 + 10, 85, tabWidth - 20, 2);
      }
    }

    // Subscreen content area
    const contentY = 110;
    const contentH = overlayCanvas.height - 160;
    ctx.textAlign = 'left';
    const leftMargin = cx - 180;

    if (homeTab === 0 && p) {
      // === SHIP subscreen ===
      ctx.fillStyle = 'rgba(180, 200, 220, 0.8)';
      ctx.font = 'bold 13px monospace';
      ctx.fillText('ship stats', leftMargin, contentY);
      ctx.font = '12px monospace';
      let sy = contentY + 25;
      const tracks = Object.keys(UPGRADE_TRACKS);
      for (const track of tracks) {
        if (track === 'vault') continue;
        const rank = p.upgrades[track] || 0;
        const td = UPGRADE_TRACKS[track];
        const bars = '█'.repeat(rank) + '░'.repeat(MAX_RANK - rank);
        ctx.fillStyle = rank > 0 ? 'rgba(100, 255, 180, 0.8)' : 'rgba(120, 130, 150, 0.5)';
        ctx.fillText(`${td.label.padEnd(10)} ${bars}  rank ${rank}/${MAX_RANK}`, leftMargin, sy);
        sy += 20;
      }

      // Loadout
      sy += 15;
      ctx.fillStyle = 'rgba(180, 200, 220, 0.8)';
      ctx.font = 'bold 13px monospace';
      ctx.fillText('loadout', leftMargin, sy);
      sy += 20;
      ctx.font = '12px monospace';
      for (let i = 0; i < 2; i++) {
        const eq = p.loadout.equipped[i];
        const sel = (homeShipCursor === i);
        if (sel) {
          ctx.fillStyle = 'rgba(60, 80, 120, 0.4)';
          ctx.fillRect(leftMargin - 4, sy - 12, 370, 18);
        }
        ctx.fillStyle = eq ? 'rgba(255, 200, 60, 0.8)' : 'rgba(100, 100, 120, 0.4)';
        const action = (sel && eq) ? '  [space: unequip]' : '';
        ctx.fillText(`equip ${i + 1}: ${eq ? eq.name : '— empty —'}${action}`, leftMargin, sy);
        sy += 18;
      }
      for (let i = 0; i < 2; i++) {
        const con = p.loadout.consumables[i];
        const sel = (homeShipCursor === i + 2);
        if (sel) {
          ctx.fillStyle = 'rgba(60, 80, 120, 0.4)';
          ctx.fillRect(leftMargin - 4, sy - 12, 370, 18);
        }
        ctx.fillStyle = con ? 'rgba(200, 160, 255, 0.8)' : 'rgba(100, 100, 120, 0.4)';
        const action = (sel && con) ? '  [space: remove]' : '';
        ctx.fillText(`hotbar ${i + 1}: ${con ? con.name : '— empty —'}${action}`, leftMargin, sy);
        sy += 18;
      }

    } else if (homeTab === 1 && p) {
      // === VAULT subscreen ===
      ctx.fillStyle = 'rgba(180, 200, 220, 0.8)';
      ctx.font = 'bold 13px monospace';
      ctx.fillText(`vault  ${p.vault.length}/${p.vaultCapacity}`, leftMargin, contentY);
      ctx.font = '12px monospace';
      let vy = contentY + 25;
      const maxVisible = Math.min(p.vault.length, 12);
      const scrollStart = Math.max(0, homeVaultCursor - 6);
      for (let i = scrollStart; i < Math.min(p.vault.length, scrollStart + maxVisible); i++) {
        const item = p.vault[i];
        const selected = (i === homeVaultCursor);
        if (selected) {
          ctx.fillStyle = 'rgba(60, 80, 120, 0.4)';
          ctx.fillRect(leftMargin - 4, vy - 12, 370, 18);
        }
        const tierColor = TIER_COLORS[item.tier] || 'rgba(180, 180, 190, 0.8)';
        ctx.fillStyle = tierColor;
        ctx.fillText(`${item.name}`, leftMargin, vy);
        ctx.fillStyle = 'rgba(150, 150, 170, 0.5)';
        ctx.textAlign = 'right';
        ctx.fillText(`${item.value} EM`, leftMargin + 360, vy);
        ctx.textAlign = 'left';
        if (selected) {
          let action = 'sell';
          if (item.subcategory === 'equippable') action = 'equip';
          else if (item.subcategory === 'consumable') action = 'load';
          ctx.fillStyle = 'rgba(255, 220, 100, 0.7)';
          ctx.fillText(`[space: ${action}]`, leftMargin + 240, vy);
        }
        vy += 18;
      }
      if (p.vault.length === 0) {
        ctx.fillStyle = 'rgba(100, 100, 120, 0.4)';
        ctx.fillText('— vault empty —', leftMargin, vy);
      }

      // Item description for selected vault item
      if (p.vault[homeVaultCursor]) {
        const selItem = p.vault[homeVaultCursor];
        const descY = contentY + Math.min(p.vault.length, 12) * 18 + 45;
        ctx.fillStyle = 'rgba(140, 150, 170, 0.6)';
        ctx.font = '11px monospace';
        const desc = selItem.effectDesc || selItem.useDesc || selItem.desc
          || (selItem.upgradeTarget ? `upgrade: ${selItem.upgradeTarget}` : `${selItem.category} — ${selItem.tier}`);
        ctx.fillText(desc, leftMargin, descY);
      }

    } else if (homeTab === 2 && p) {
      // === UPGRADES subscreen ===
      ctx.fillStyle = 'rgba(180, 200, 220, 0.8)';
      ctx.font = 'bold 13px monospace';
      ctx.fillText('upgrades', leftMargin, contentY);
      ctx.font = '12px monospace';
      let uy = contentY + 25;
      const tracks = Object.keys(UPGRADE_TRACKS);
      for (let ti = 0; ti < tracks.length; ti++) {
        const track = tracks[ti];
        const td = UPGRADE_TRACKS[track];
        const rank = p.upgrades[track] || 0;
        const selected = (ti === homeUpgradeCursor);
        const cost = profileManager.getUpgradeCost(track);
        const canAfford = profileManager.canAffordUpgrade(track);

        if (selected) {
          ctx.fillStyle = 'rgba(60, 80, 120, 0.4)';
          ctx.fillRect(leftMargin - 4, uy - 12, 370, 32);
        }

        const bars = '█'.repeat(rank) + '░'.repeat(MAX_RANK - rank);
        ctx.fillStyle = selected ? 'rgba(220, 230, 255, 0.9)' : 'rgba(150, 160, 180, 0.6)';
        ctx.fillText(`${td.label.padEnd(10)} ${bars}  ${td.desc}`, leftMargin, uy);

        if (cost) {
          const costText = cost.componentTarget
            ? `${cost.em} EM + ${cost.componentTarget}`
            : `${cost.em} EM`;
          ctx.fillStyle = canAfford ? 'rgba(100, 255, 150, 0.7)' : 'rgba(255, 100, 100, 0.5)';
          let preview = '';
          if (selected && td.statKey) {
            const keys = td.statKey.split('.');
            const current = CONFIG[keys[0]][keys[1]];
            const mult = 1 + (rank + 1) * td.multPerRank;
            const next = (current / (1 + rank * td.multPerRank)) * mult;
            preview = `  (${current.toFixed(2)} → ${next.toFixed(2)})`;
          }
          ctx.fillText(`  → ${costText}${preview}${selected ? '  [space: upgrade]' : ''}`, leftMargin + 20, uy + 15);
        } else {
          ctx.fillStyle = 'rgba(255, 220, 100, 0.6)';
          ctx.fillText('  MAX', leftMargin + 20, uy + 15);
        }

        uy += 38;
      }

    } else if (homeTab === 3) {
      // === LAUNCH subscreen ===
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(100, 255, 200, 0.8)';
      ctx.font = 'bold 20px monospace';
      ctx.fillText('press space to launch', cx, contentY + contentH / 2 - 20);
      ctx.fillStyle = 'rgba(120, 150, 170, 0.5)';
      ctx.font = '13px monospace';
      ctx.fillText('select your map on the next screen', cx, contentY + contentH / 2 + 10);
    }

    // Controls hint
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(120, 130, 150, 0.5)';
    ctx.font = '11px monospace';
    ctx.fillText('Q/E or L1/R1: tabs    ↑↓ select    space/A: confirm    esc/B: back', cx, overlayCanvas.height - 20);

    ctx.restore();
  }

  // === MAP SELECT SCREEN ===
  if (!rendererFixtureActive && gamePhase === 'mapSelect') {
    const remoteControl = simClient?.enabled ? currentRemoteControlState() : null;
    const cx = overlayCanvas.width / 2;
    const cy = overlayCanvas.height / 2;

    const w = overlayCanvas.width, h = overlayCanvas.height;
    ctx.save();
    ctx.fillStyle = 'rgba(0, 2, 12, 0.7)';
    ctx.fillRect(0, 0, w, h);
    drawScanlines(ctx, w, h, 0.025);
    ctx.textAlign = 'center';

    drawTerminalFrame(ctx, cx - 250, cy - 180, 500, 320, null, 'rgba(100, 150, 255, 0.2)');

    ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
    ctx.shadowBlur = 12;
    ctx.fillStyle = 'rgba(140, 175, 255, 0.95)';
    ctx.font = 'bold 24px monospace';
    ctx.fillText('SELECT DESTINATION', cx, cy - 150);

    const listTop = cy - 100;
    const itemHeight = 75;

    for (let i = 0; i < MAP_LIST.length; i++) {
      const map = MAP_LIST[i];
      const y = listTop + i * itemHeight;
      const selected = i === mapSelectIndex;

      if (selected) {
        ctx.fillStyle = 'rgba(60, 80, 140, 0.3)';
        ctx.fillRect(cx - 230, y - 18, 460, itemHeight - 8);
        ctx.strokeStyle = 'rgba(100, 150, 255, 0.5)';
        ctx.lineWidth = 1;
        ctx.strokeRect(cx - 230, y - 18, 460, itemHeight - 8);
      }

      ctx.fillStyle = selected ? 'rgba(240, 245, 255, 1)' : 'rgba(160, 170, 190, 0.7)';
      ctx.font = selected ? 'bold 20px monospace' : '18px monospace';
      ctx.fillText(map.name, cx, y + 6);

      const size = `${map.worldScale}x${map.worldScale}`;
      const stats = `${size}  |  ${map.wells.length} wells  ${map.stars.length} stars  ${(map.wrecks || []).length} wrecks`;
      ctx.fillStyle = selected ? 'rgba(180, 190, 210, 0.85)' : 'rgba(130, 140, 160, 0.5)';
      ctx.font = '12px monospace';
      ctx.fillText(stats, cx, y + 26);
    }

    let hintY = listTop + MAP_LIST.length * itemHeight + 25;
    if (remoteControl?.enabled) {
      const infoY = hintY - 36;
      ctx.font = '12px monospace';
      if (remoteControl.error) {
        ctx.fillStyle = 'rgba(255, 130, 110, 0.9)';
        ctx.fillText(`remote sim unavailable: ${remoteControl.error}`, cx, infoY);
      } else if (remoteControl.loading && !remoteControl.hasLiveSession) {
        ctx.fillStyle = 'rgba(150, 170, 210, 0.75)';
        ctx.fillText('checking live authority…', cx, infoY);
      } else if (remoteControl.hasLiveSession) {
        const hostLabel = remoteControl.hostName || 'unknown host';
        ctx.fillStyle = 'rgba(140, 200, 255, 0.85)';
        ctx.fillText(
          `live run: ${remoteControl.sessionMapName}  |  host: ${hostLabel}  |  players: ${remoteControl.sessionPlayerCount}`,
          cx,
          infoY
        );
        ctx.font = '11px monospace';
        ctx.fillStyle = remoteControl.selectedDiffersFromLive
          ? 'rgba(255, 210, 140, 0.9)'
          : 'rgba(160, 180, 210, 0.75)';
        if (remoteControl.selectedDiffersFromLive) {
          ctx.fillText(
            remoteControl.canHostReset
              ? `space/A joins ${remoteControl.sessionMapName}; X/Y resets host run to ${remoteControl.selectedMapName}`
              : `space/A joins ${remoteControl.sessionMapName}; only host can reset to ${remoteControl.selectedMapName}`,
            cx,
            infoY + 20
          );
        } else {
          ctx.fillText(
            remoteControl.canHostReset
              ? 'space/A: join live run    X/Y: host reset current run'
              : 'space/A: join live run',
            cx,
            infoY + 20
          );
        }
      } else {
        ctx.fillStyle = 'rgba(120, 220, 170, 0.8)';
        ctx.fillText('no live run detected — this client will host the selected map', cx, infoY);
      }
      hintY += 20;
    }

    ctx.fillStyle = 'rgba(150, 160, 190, 0.6)';
    ctx.font = '11px monospace';
    ctx.fillText(
      simClient?.enabled
        ? '↑↓ select    space/A: join or host    X/Y: host reset    esc/B: back'
        : '↑↓ select    space/A: launch    esc/B: back',
      cx,
      hintY
    );

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

    const w = overlayCanvas.width, h = overlayCanvas.height;
    ctx.save();

    // Dark overlay + scanlines + terminal frame
    ctx.fillStyle = 'rgba(0, 2, 12, 0.75)';
    ctx.fillRect(0, 0, w, h);
    drawScanlines(ctx, w, h, 0.025);
    const frameColor = isEscape ? 'rgba(100, 255, 255, 0.2)' : 'rgba(255, 50, 30, 0.15)';
    drawTerminalFrame(ctx, cx - 220, cy - 130, 440, 280, null, frameColor);

    ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
    ctx.shadowBlur = 16;
    ctx.textAlign = 'center';

    // Title
    if (t > 0.3) {
      ctx.fillStyle = `${titleColor} ${Math.min((t - 0.3) * 2, 1)})`;
      ctx.font = 'bold 42px monospace';
      ctx.fillText(title, cx, cy - 90);
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
    // Stats + RunResult data
    const statsT = 1.0 + Math.min(endItems.length, 8) * 0.15 + 0.3;
    if (t > statsT) {
      const rr = lastRunResult;
      ctx.fillStyle = `rgba(180, 180, 200, ${Math.min((t - statsT) * 2, 0.8)})`;
      ctx.font = '14px monospace';
      const survTime = rr?.survivalTime ?? simState.runEndTime;
      const mins = Math.floor(survTime / 60);
      const secs = Math.floor(survTime % 60);
      let statY = cy + Math.min(endItems.length, 8) * 18 - 10;
      ctx.fillText(`${endItems.length} items ${itemVerb}  |  survived ${mins}:${String(secs).padStart(2, '0')}`, cx, statY);

      // Signal peak + inhibitor form (from RunResult)
      if (rr && t > statsT + 0.2) {
        statY += 20;
        ctx.fillStyle = 'rgba(160, 160, 180, 0.6)';
        ctx.font = '11px monospace';
        const sigPeak = rr.signalPeakZone || 'ghost';
        const inhForm = rr.inhibitorFormReached || 0;
        const inhLabel = ['dormant', 'glitch', 'swarm', 'vessel'][inhForm] || 'dormant';
        ctx.fillText(`signal peak: ${sigPeak}  |  inhibitor: ${inhLabel}`, cx, statY);
      }

      // AI outcomes (from RunResult)
      if (rr?.aiOutcomes?.length > 0 && t > statsT + 0.4) {
        statY += 18;
        ctx.font = '10px monospace';
        for (const ai of rr.aiOutcomes) {
          const outcomeColor = ai.outcome === 'extracted' ? 'rgba(100, 255, 200, 0.6)' : ai.outcome === 'dead' ? 'rgba(255, 100, 80, 0.5)' : 'rgba(160, 160, 180, 0.4)';
          ctx.fillStyle = outcomeColor;
          ctx.fillText(`${ai.personality} (${ai.hullType}): ${ai.outcome}`, cx, statY);
          statY += 14;
        }
      }

      // Death cause (from RunResult)
      if (!isEscape && rr?.deathCause && t > statsT + 0.3) {
        const causeY = statY + 5;
        ctx.fillStyle = 'rgba(255, 80, 60, 0.7)';
        ctx.font = '12px monospace';
        const causeText = rr.deathEntityId ? `${rr.deathCause}: ${rr.deathEntityId}` : rr.deathCause;
        ctx.fillText(causeText, cx, causeY);
        statY = causeY;
      }

      // Death tax display
      if (!isEscape && lastDeathTax > 0 && t > statsT + 0.3) {
        ctx.fillStyle = 'rgba(255, 100, 80, 0.8)';
        ctx.font = '14px monospace';
        ctx.fillText(`-${lastDeathTax} exotic matter`, cx, statY + 20);
        statY += 20;
      }

      // EM earnings (from RunResult)
      if (rr?.emEarned != null && t > statsT + 0.5) {
        statY += 8;
        ctx.fillStyle = 'rgba(255, 255, 240, 0.9)';
        ctx.font = 'bold 24px monospace';
        const countT = Math.min((t - statsT - 0.5) / 0.5, 1);
        ctx.fillText(`+${Math.floor(rr.emEarned * countT)} em`, cx, statY + 20);
        statY += 25;
      } else if (isEscape && t > statsT + 0.3) {
        // Fallback: show cargo value if no RunResult
        const totalValue = endItems.reduce((sum, item) => sum + (item.value || 0), 0);
        ctx.fillStyle = 'rgba(255, 255, 240, 0.9)';
        ctx.font = 'bold 28px monospace';
        const countT = Math.min((t - statsT - 0.3) / 0.5, 1);
        ctx.fillText(`${Math.floor(totalValue * countT)}`, cx, statY + 35);
        statY += 35;
      }

      // Seed display
      if (rr && t > statsT + 0.8) {
        ctx.fillStyle = 'rgba(100, 110, 130, 0.4)';
        ctx.font = '9px monospace';
        ctx.fillText(`seed: ${remoteSnapshot?.session?.seed || '---'}`, cx, statY + 25);
      }
    }
    // Prompt
    const promptT = statsT + (isEscape ? 1.5 : 0.8);
    if (t > promptT) {
      const blink = Math.sin(totalTime * 3) > 0 ? 1 : 0.3;
      ctx.fillStyle = `rgba(200, 200, 220, ${blink * Math.min((t - promptT) * 2, 1)})`;
      ctx.font = '18px monospace';
      ctx.fillText('press space to continue', cx, cy + Math.min(endItems.length, 8) * 18 + 70);
    }
    ctx.restore();
  }

  // === META SCREEN (between runs) ===
  if (!rendererFixtureActive && gamePhase === 'meta') {
    metaPhaseTimer += dt;
    const cx = overlayCanvas.width / 2;
    const cy = overlayCanvas.height / 2;
    const t = metaPhaseTimer;

    const w = overlayCanvas.width, h = overlayCanvas.height;
    ctx.save();
    ctx.fillStyle = 'rgba(0, 2, 12, 0.92)';
    ctx.fillRect(0, 0, w, h);
    drawScanlines(ctx, w, h);
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
    ctx.shadowBlur = 12;

    drawTerminalFrame(ctx, cx - 200, cy - 180, 400, 340, null, 'rgba(100, 255, 255, 0.2)');

    // Title
    if (t > 0.2) {
      const a = Math.min((t - 0.2) * 2, 1);
      ctx.fillStyle = `rgba(100, 255, 255, ${a})`;
      ctx.font = 'bold 28px monospace';
      ctx.fillText('SALVAGE REPORT', cx, cy - 155);
    }

    // Extracted items
    if (t > 0.5 && metaExtractedItems.length > 0) {
      ctx.font = '13px monospace';
      const maxShow = Math.min(metaExtractedItems.length, 8);
      let itemY = cy - 120;
      for (let i = 0; i < maxShow; i++) {
        const item = metaExtractedItems[i];
        const a = Math.min((t - 0.5 - i * 0.1) * 3, 1);
        if (a <= 0) continue;
        const color = TIER_COLORS[item.tier] || 'rgba(200, 200, 210, 0.8)';
        ctx.fillStyle = color.replace(/[\d.]+\)$/, `${a})`);
        ctx.fillText(`${item.name} [${item.category}] — ${item.value}`, cx, itemY);
        itemY += 20;
      }
      if (metaExtractedItems.length > 8) {
        ctx.fillStyle = `rgba(150, 150, 170, ${Math.min((t - 1.3) * 2, 0.6)})`;
        ctx.fillText(`...and ${metaExtractedItems.length - 8} more`, cx, itemY);
        itemY += 20;
      }
    }

    // Vault summary
    const summaryT = 0.5 + Math.min(metaExtractedItems.length, 8) * 0.1 + 0.5;
    if (t > summaryT) {
      const a = Math.min((t - summaryT) * 2, 1);
      const totalValue = metaExtractedItems.reduce((sum, i) => sum + (i.value || 0), 0);
      ctx.font = '15px monospace';

      let sy = cy + 30;
      ctx.fillStyle = `rgba(255, 220, 100, ${a})`;
      ctx.fillText(`+${totalValue} exotic matter`, cx, sy);
      sy += 25;
      ctx.fillStyle = `rgba(180, 180, 200, ${a * 0.8})`;
      const prof = profileManager.active;
      ctx.fillText(`vault: ${prof?.exoticMatter ?? 0} total  |  ${prof?.totalExtractions ?? 0} extractions`, cx, sy);
      sy += 20;
      const mins = Math.floor((prof?.bestSurvivalTime ?? 0) / 60);
      const secs = Math.floor((prof?.bestSurvivalTime ?? 0) % 60);
      ctx.fillText(`best survival: ${mins}:${String(secs).padStart(2, '0')}`, cx, sy);
    }

    // Prompt
    const promptT = summaryT + 0.8;
    if (t > promptT) {
      const blink = Math.sin(totalTime * 3) > 0 ? 1 : 0.3;
      ctx.fillStyle = `rgba(200, 200, 220, ${blink * Math.min((t - promptT) * 2, 1)})`;
      ctx.font = '18px monospace';
      ctx.fillText('press space to drop back in', cx, cy + 120);
    }

    ctx.restore();
  }

  // === PAUSE MENU ===
  if (!rendererFixtureActive && gamePhase === 'paused') {
    const cx = overlayCanvas.width / 2;
    const cy = overlayCanvas.height / 2;

    const w = overlayCanvas.width, h = overlayCanvas.height;
    ctx.save();
    ctx.fillStyle = 'rgba(0, 2, 12, 0.8)';
    ctx.fillRect(0, 0, w, h);
    drawScanlines(ctx, w, h, 0.03);
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
    ctx.shadowBlur = 12;

    drawTerminalFrame(ctx, cx - 180, cy - 150, 360, 260, null, 'rgba(100, 150, 255, 0.2)');

    // Title
    ctx.fillStyle = 'rgba(140, 175, 255, 0.95)';
    ctx.font = 'bold 28px monospace';
    ctx.fillText('PAUSED', cx, cy - 110);

    // Menu buttons
    const buttons = ['return to game', 'exit to title'];
    for (let i = 0; i < buttons.length; i++) {
      const y = cy - 40 + i * 50;
      const selected = i === pauseMenuSelection;

      if (selected) {
        ctx.fillStyle = 'rgba(60, 80, 140, 0.3)';
        ctx.fillRect(cx - 150, y - 16, 300, 34);
        ctx.strokeStyle = 'rgba(100, 150, 255, 0.5)';
        ctx.lineWidth = 1;
        ctx.strokeRect(cx - 150, y - 16, 300, 34);
      }

      ctx.fillStyle = selected ? 'rgba(240, 245, 255, 1)' : 'rgba(160, 170, 195, 0.65)';
      ctx.font = selected ? 'bold 18px monospace' : '16px monospace';
      ctx.fillText(buttons[i], cx, y + 6);
    }

    // Signature info on pause screen
    if (currentSignature) {
      ctx.fillStyle = 'rgba(140, 170, 190, 0.7)';
      ctx.font = '12px monospace';
      ctx.fillText(currentSignature.name, cx, cy + 55);
      ctx.fillStyle = 'rgba(120, 150, 170, 0.5)';
      ctx.font = '10px monospace';
      ctx.fillText(currentSignature.mechanical, cx, cy + 72);
    }

    // Controls reference (compact)
    ctx.font = '11px monospace';
    ctx.fillStyle = 'rgba(150, 155, 185, 0.55)';
    ctx.fillText('steer: stick / arrows   thrust: R2 / space   brake: L2 / ctrl   pulse: □ / E   abilities: L1/R1 / Q/R', cx, cy + 110);

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
