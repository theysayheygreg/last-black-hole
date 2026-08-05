/**
 * main.js — Game loop, canvas setup, wiring.
 *
 * V3: canonical map-scale worlds with camera follow. Portals + planetoids.
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
import { Composer } from './render/composer.js';
import { fitViewport, RENDER_W, RENDER_H } from './render/viewport.js';
import { createRendererBackend, requestedRendererBackend, requestedRenderQuality } from './render/renderer-backend.js';
import { selectFabricWellIndices } from './render/fabric-well-budget.js';
import { createPresentationFrame } from './presentation/presentation-frame.js';
import { createPresentationSceneSource } from './presentation/scene-source.js';
import {
  projectEventWavePresentation,
  syncRemoteWellPresentation,
} from './presentation/well-wave-presentation.js';
import { sampleTitleAttractState, TitleScenePresentation } from './presentation/title-scene-presentation.js';
import { FluidDisplayPass } from './render/passes/fluid-display-pass.js';
import { GainPass } from './render/passes/gain-pass.js';
import { AccretionPass } from './render/passes/accretion-pass.js';
import { TonemapPass } from './render/passes/tonemap-pass.js';
import { ASCIIPass } from './render/passes/ascii-pass.js';
import { BloomPass } from './render/passes/bloom-pass.js';
import { ColorGradePass } from './render/passes/color-grade-pass.js';
import { VignettePass } from './render/passes/vignette-pass.js';
import { ChromaticAberrationPass } from './render/passes/chromatic-aberration-pass.js';
import { ScanlinesPass } from './render/passes/scanlines-pass.js';
import { initTestAPI } from './test-api.js';
import { drawRulerOverlay } from './ruler-overlay.js';
import { initDevPanel } from './dev-panel.js';
import { initBenchUi } from './bench/ui.js';
import { initHUD, showHUD, hideHUD, fadeHUD, updateHUD, showWarning, showInhibitorWarning, setDropCallback,
         resetInventoryCursor, inventoryCursorUp, inventoryCursorDown, inventoryConfirm, getInventoryActionAtCursor,
         getSlingshotInteractionState, isExfilPortal, clearHUDForTerminal, syncHUDPhase } from './hud.js';
import { applyRuntimeFlags } from './runtime-flags.js';
import { ScavengerSystem } from './scavengers.js';
import { CombatSystem } from './combat.js';
import { SlingshotSystem } from './slingshot.js';
import { AudioEngine } from './audio.js';
import { AudioRouter } from './audio/audio-router.js';
import { buildRunBriefing } from './run-briefing.js';
import { InventorySystem } from './inventory.js';
import { ProfileManager, generatePilotName, sanitizePilotName } from './profile.js';
import { CATEGORY_COLORS, TIER_COLORS } from './items.js';
import { buildRunResultsViewModel, drawRunResultsOverlay } from './run-results.js';
import {
  LOCKED_SECTOR_REGISTRY,
  buildLockedSurveySelection,
  buildValidSurveySelection,
  drawLockedSurveyTopology,
  drawSurveyTopology,
  projectSurveyTerminal,
  resolveTopologySignature,
  surveyScaleForMap,
} from './ui/map-select-survey.js';
import { FlowField } from './sim/flow-field.js';
import { LocalSandboxSimCore } from './sim/sim-core.js';
import { SimClient } from './sim/sim-client.js';
import {
  advanceLocalPlayerReconciliation,
  createLocalPlayerReconciliationState,
  rebaseLocalPlayerReconciliation,
} from './sim/local-player-reconciliation.js';
import {
  acceptedRemoteEvents,
  classifyRemoteSnapshot,
  projectRemoteSnapshot,
  projectRemoteWorldPatch,
  resolveClientSensorRange,
  snapshotRunId,
} from './sim/remote-snapshot-presentation.js';
import { createSimState, freezeRunEnd, resetSimState } from './sim/sim-state.js';
import {
  beginRemoteSession,
  captureRemotePendingActions,
  clearRemotePendingActions,
  createRemoteSessionState,
  queueRemoteConsumeSlot,
  queueRemoteExtractConfirm,
  queueRemotePulse,
  queueRemoteSlingshotEdge,
  resetRemoteAfterLeave,
  resetRemoteAfterLaunchFailure,
  resetRemoteForLocalGame,
  settleRemoteInputAcknowledgement,
} from './sim/remote-session-state.js';
import {
  PAUSE_LONG_AWAY_THRESHOLD_MS,
  authoritativePausePhase,
  createPauseResumeState,
  enterPause,
  markPauseInputNeutralized,
  observePauseConnection,
  observePauseEvents,
  observePauseSnapshot,
  reconcilePauseResume,
} from './pause-resume-reconcile.js';
import { loadMap } from './map-loader.js';
import { applySceneOverrides, revertSceneOverrides } from './scene-config.js';
import { MAP as MAP_TITLE } from './maps/title-screen.js';
import { DEFAULT_PLAYABLE_MAP, MAP_LIST, PLAYABLE_MAPS } from './maps/playable-map-loader.js';
import { RENDERER_FIXTURES } from './maps/renderer-fixtures.js';
import { WORLD_SCALE, GRID_WINDOW, CAMERA_VIEW, worldPixelScale, worldToFluidUV, worldToGlobalFluidUV, worldToScreen, screenToWorld,
         worldDistance, worldDisplacement, uvToWorld, worldRadiusToScreen, wrapWorld,
         setFluidCamera, getFluidCamera, fluidTextureOffsetForCameraMove } from './coords.js';
import { createRNGStreams } from './rng-stream.js';
import { CLIENT_PERF_PROFILES } from './content/session-profiles.js';
import { getMapDurationSeconds } from './content/map-scales.js';
import {
  NOISE_CONFIG,
  NOISE_IDENTIFICATION_FRACTION,
  NOISE_LAST_HEARD_FADE_SECONDS,
  NOISE_PUBLIC_SOURCE_CLASSES,
} from './content/noise.js';
import { metersToSimUnits, simUnitsToMeters } from './units.js';
import {
  prioritizeAudibleContacts,
  projectAudibleContact,
  reconcileUnobservedAudibleContacts,
} from './presentation/audible-contact-memory.js';
import { resolveHeatInstrumentState } from './presentation/heat-instrument.js';
import {
  getRulerReadoutBounds,
  getShipLocalLabelSlots,
  placePresentationLabels,
  safeObjectLabel,
} from './ui/presentation-layout.js';
import { HULL_DEFINITIONS, PUBLIC_HULL_IDS } from './content/hulls.js';
import { runEmEarned } from './content/balance.js';
import { canvasFont, waitForTypographyFonts } from './ui/typography.js';
import { drawItemIcon, drawShipSprite, preloadShipSprites } from './ui/asset-kit.js';
import {
  drawCornerFrame,
  drawKeyValueRow,
  drawSectionLabel,
  drawSegmentedGauge,
  drawSelectedRow,
  drawStatusPill,
  drawUiPanel,
  drawScanlines as drawUiScanlines,
  drawActionPrompt,
  drawActionFooter,
  fitUiText,
  roleColor,
  wrapUiText,
  withAlpha,
} from './ui/canvas-primitives.js';
import {
  advanceMotionClock,
  drawCommandButtonMotion,
  drawDirectionalWipe,
  drawTerminalWindow,
  motionProgress,
  resolveMotionSettings,
  sampleScreenTransition,
  sampleTerminalWindow,
  staggerProgress,
  typeOnText,
} from './ui/motion.js';
import { actionDescriptor, isDeckMode, promptLabel } from './ui/input-prompts.js';
import { UI_DECK_GEOMETRY, UI_IN_PLAY_TYPE, UI_INTERACTION_ROLES } from './ui/design-tokens.js';
import { deckPanelLayout, hudSurfaceLayout, interruptSurfaceLayout, itemCompoundLayout, mapSelectSurfaceLayout, profileSurfaceLayout, titleSurfaceLayout } from './ui/layout-contract.js';
import { formatHullStats, formatItemEffects, formatSlotIdentity } from './ui/loadout-presentation.js';
import { measureActionFooter } from './ui/action-footer-layout.js';
import { pauseAbandonIntent } from './ui/pause-presentation.js';
import { corruptGlyphText } from './text-corruption.js';
import { titleGlyphFaultEvent } from './render-three/vfx/vfx-events.js';

window.__LBH_BOOT_MARK__?.('main.module.evaluated', {
  href: window.location.href,
  userAgent: navigator.userAgent,
});

function reportBootFailure(message, detail) {
  const formattedDetail = detail?.stack || detail?.message || detail || '';
  window.__LBH_SHOW_BOOT_ERROR__?.(message, formattedDetail);
  console.error(`[LBH boot] ${message}`, formattedDetail);
}

const MAP_SELECT_ENTRIES = [
  ...PLAYABLE_MAPS.map((entry) => ({ ...entry, available: true })),
  ...LOCKED_SECTOR_REGISTRY,
];
function getPlayableMapEntryById(id) {
  return PLAYABLE_MAPS.find((entry) => entry.id === id) || PLAYABLE_MAPS[0];
}

function resolveClientRunDuration(mapId) {
  const duration = Number(getMapDurationSeconds(mapId));
  if (Number.isFinite(duration) && duration > 0) return duration;
  return Number(getMapDurationSeconds(DEFAULT_PLAYABLE_MAP.id));
}

function setResolvedClientRunDuration(mapId, duration = null) {
  const resolved = Number(duration);
  CONFIG.universe.runDuration = Number.isFinite(resolved) && resolved > 0
    ? resolved
    : resolveClientRunDuration(mapId);
  return CONFIG.universe.runDuration;
}

// ---- State ----
let glCanvas, threeCanvas, gl;
let overlayCanvas, ctx;
let fluid, ship, wellSystem, starSystem, wreckSystem, waveRings;
let portalSystem, planetoidSystem;
let scavengerSystem, combatSystem, audioEngine, audioRouter, inventorySystem;
let slingshotSystem;
let flowField, legacyLocalSimCore, titleScenePresentation;
let simClient = null;
let currentSignature = null;
let inputManager, composer, fluidDisplayPass, tonemapPass, asciiPass;
let rendererBackend = null;
let fluidGainPass = null;
let accretionPass = null;
let bloomPass = null;
let vignettePass = null;
let chromaticAberrationPass = null;
let scanlinesPass = null;
// Per-well [coreR, peakR, outerR] in world-space for AccretionPass.
// Recomputed whenever the scene loads. Title composition uses authored
// radii so the full temperature ramp fits the frame; gameplay uses
// zero-strength accretion so these radii never actually paint.
let sceneAccretionRadii = [];
// Title-only render tuning — matches the title-prototype. Applied every
// frame when gamePhase === 'title' and reverted to gameplay dials otherwise.
const TITLE_RENDER_TUNING = {
  fluidGain: 0.15,
  accretionStrength: 1.0,
  bloom: { threshold: 0.8, knee: 0.25, strength: 1.1, blurRadius: 4.5 },
  vignette: { strength: 1.05, radius: 0.35, softness: 0.55 },
  chromaticAberration: { strength: 0.005, falloff: 2.4 },
  scanlines: { intensity: 0.22, frequency: 1.5 },
};
const GAMEPLAY_RENDER_TUNING = {
  fluidGain: 1.0,
  // FluidDisplay owns the single gameplay well body, rim, and plume. Keep the
  // title-only radial composition in the chain but dormant during a match so
  // it cannot paint a second landmark around camera-window seam positions.
  accretionStrength: 0.0,
  bloom: { threshold: 0.90, knee: 0.3, strength: 0.75, blurRadius: 3.0 },
  vignette: { strength: 0.6, radius: 0.45, softness: 0.65 },
  chromaticAberration: { strength: 0.0, falloff: 2.8 },
  scanlines: { intensity: 0.09, frequency: 1.5 },
};
const CLIENT_PERF_PROFILE = CLIENT_PERF_PROFILES.fixedGrid;
const PERF_SMOOTHING = CLIENT_PERF_PROFILE.perfSmoothing;
// Long enough to bridge polling jitter, short enough to stop if snapshots stall.
const REMOTE_PRESENTATION_EXTRAPOLATE_LIMIT = CLIENT_PERF_PROFILE.remotePresentationExtrapolateLimit;
const perfStats = {
  frameMs: 0,
  simMs: 0,
  composerMs: 0,
  overlayMs: 0,
  rendererBackend: 'legacy',
  renderQuality: 'rich',
  visibleWellCount: 0,
  totalWellCount: 0,
  fluidResolution: 0,
  remoteInputAckRttMs: null,
  remoteInputToSnapshotMs: null,
  remoteSnapshotLagMs: null,
  remotePresentationAgeMs: null,
  remoteInputToPresentationMs: null,
  composerPasses: [],
  three: null,
};
let rulerOverlayStats = Object.freeze({ enabled: false, handlerCount: 0, geometry: Object.freeze({}) });

function recordPerfStat(key, ms) {
  const prev = perfStats[key] || 0;
  perfStats[key] = prev === 0 ? ms : prev + (ms - prev) * PERF_SMOOTHING;
}

function getVisibleWellRenderInputs(cameraX, cameraY) {
  const allUVs = wellSystem.getUVPositions();
  const allMasses = wellSystem.getUVMasses();
  const allShapes = wellSystem.getRenderShapes();
  const allProfiles = wellSystem.getRenderProfiles();

  // Filter to wells whose camera-relative position lands within the
  // fluid grid window (plus a ring-extent margin). Off-window wells
  // would have UVs outside [0, 1] which the display shader's toroidal
  // wrap would re-project into the visible region — wrong, since the
  // grid window doesn't span the full world. Their contribution comes
  // through the coarse field instead.
  const candidates = [];
  const halfWindow = GRID_WINDOW / 2;

  for (let i = 0; i < wellSystem.wells.length; i++) {
    const well = wellSystem.wells[i];
    const shape = allShapes[i] || [0.01, 0.02, 0.03, 1.0];
    const [dx, dy] = worldDisplacement(cameraX, cameraY, well.wx, well.wy);
    const ringExtent = Math.max(0.05, shape[2] * 1.4);
    if (Math.abs(dx) <= halfWindow + ringExtent && Math.abs(dy) <= halfWindow + ringExtent) {
      candidates.push({ index: i, distanceSq: dx * dx + dy * dy });
    }
  }

  const visibleIndices = selectFabricWellIndices(candidates);

  return {
    wellUVs: visibleIndices.map((index) => allUVs[index]),
    wellMasses: visibleIndices.map((index) => allMasses[index]),
    wellShapes: visibleIndices.map((index) => allShapes[index] || [0.01, 0.02, 0.03, 1.0]),
    wellProfiles: visibleIndices.map((index) => allProfiles[index] || [0, 0, 0, 0]),
    visibleIndices,
  };
}
// Title camera drift (lissajous). Small amplitude, long periods —
// subtle motion to keep the frame alive without distracting.
const TITLE_CAMERA_DRIFT_AMPLITUDE = 0.03;
const TITLE_CAMERA_DRIFT_PERIOD_X = 22;
const TITLE_CAMERA_DRIFT_PERIOD_Y = 17;
const TITLE_OPPOSITE_WELL_CAMERA_OFFSET = 0.36;
const TITLE_RIFT_ID = 'title-rift-aperture';
const TITLE_ATTRACT_LOOP_SECONDS = 11.5;
const TITLE_GLITCH_PERIOD = 2.15;
const TITLE_GLITCH_WINDOW = 0.34;
const TITLE_GLITCH_GLYPHS = 'ΨΩ∞⌁∆≈≠╳╱╲#$%@&*!?';
const TITLE_LAYOUT_DEFAULT = 'left';
const TITLE_LAYOUT_IDS = new Set(['center', 'left', 'right', 'opposite-left']);
let titleLayout = TITLE_LAYOUT_DEFAULT;
// Capture-only presentation seam: preserves the living title environment and
// its diegetic telemetry while removing foreground menu chrome for promo shots.
let titleEnvironmentCaptureOnly = false;
let running = true;
let totalTime = 0;
let timeScale = 1.0;
let fps = 60;
let frameCount = 0;
let fpsTimer = 0;
let lastFrameTime = 0;
let gamePhase = 'title'; // 'title' | 'profileSelect' | 'home' | 'mapSelect' | 'loading' | 'playing' | 'dead' | 'escaped' | 'paused' | 'recovery'
let loadingStartTime = 0;
let loadingMapName = '';
let deathTimer = 0;
let escapeTimer = 0;
let titleTimer = 0;
let uiMotionPhase = gamePhase;
let uiMotionTimer = 0;
let uiFocusKey = 'title';
let uiFocusPulseTimer = 999;

// Camera state — world-space center of screen
let camX = 1.5;
let camY = 1.5;

// Map state
let currentMap = DEFAULT_PLAYABLE_MAP;
const remoteSession = createRemoteSessionState();
let fixtureShipCandidates = [];
let pauseResumeState = createPauseResumeState();
let startingMasses = [];
let mapSelectIndex = 0;

// --- Seed preview state (map select screen) ---
// Client-side prediction: given a seed, compute the cosmic signature,
// well names, and a sample of wreck loot — all without hitting the server.
// Proof that the seeded generation layer is portable.
let previewSeed = Math.floor(Math.random() * 1e9);
let previewCache = null;

function computeSeedPreview(map, seed) {
  const mapId = map?.id || map?.name || 'unknown';
  if (previewCache && previewCache.seed === seed && previewCache.mapId === mapId) return previewCache;
  previewCache = buildRunBriefing(map, seed);
  return previewCache;
}

function currentMapSelectEntry() {
  return MAP_SELECT_ENTRIES[mapSelectIndex] || MAP_SELECT_ENTRIES[0];
}

function currentMapSelectSurvey() {
  const entry = currentMapSelectEntry();
  if (!entry?.available) return buildLockedSurveySelection(entry);
  return buildValidSurveySelection(entry, computeSeedPreview(entry.map, previewSeed), previewSeed);
}

function rerollPreviewSeed() {
  previewSeed = Math.floor(Math.random() * 1e9);
  previewCache = null;
}
let currentCameraMode = 'follow';
let rendererFixtureActive = false;
let activeRendererFixture = null;
const RUNTIME_FLAGS = applyRuntimeFlags(CONFIG);
const BENCH_REQUESTED = new URLSearchParams(window.location.search).get('bench') === '1';

// Run state
const simState = createSimState();
let inventoryOpen = false;  // Tab toggle state
let shieldActive = false;   // shieldBurst consumable — survive one well contact
const HEAT_DISPLAY_EPSILON = 0.02;
let noiseState = {
  audibleRadiusMeters: 0,
  trend: 'steady',
  currentSource: 'IDLE',
  dominantSource: 'IDLE',
  heardListenerCount: 0,
  trackedListenerCount: 0,
  lockedOnListenerCount: 0,
};
const audibleContactMemory = new Map();
let routeDiscoveryState = { runId: null, exfilHeard: false };
const noiseRipples = [];
let inhibitorState = {
  phase: 0,
  waveId: 'inhibitor:phase-0',
  scheduledTime: 0,
  waveBudget: 0,
  entities: [],
  ecology: { counts: {}, reachedKinds: [], activeCount: 0 },
};
let inhibitorWakeGlitchTimer = 0;
let localAbilityState = null;
let lastRunResult = null;  // populated from run.result event
// localAbilityState: null in local-sim mode (hull abilities are server-only).
// HUD and visual effects gracefully no-op when null.

// --- THE PHANTOM ---
// A purely client-side visual phenomenon. Sometimes, at high noise,
// something appears at the edge of sensor range and then doesn't. There
// is no server entity, no event, no snapshot field, no tooltip, no loot.
// The game will never acknowledge it happened. Greg's note: "the orb in
// Returnal is never explained. we have space for that in LBH."
//
// Behavior:
// - Only rolls when the emitted noise radius is visibly elevated
// - Seeded-deterministic: same seed + same sim time produces same phantom
// - Appears at sensor range edge, roughly opposite the player's motion
// - Lifetime ~2.5s, then fades
// - Dissolves instantly on player proximity
// - Global cooldown 45-90s between appearances
// - Rendered as a muted-red ship-like glyph cluster, deliberately almost
//   invisible against the void
let phantomState = null;          // { wx, wy, bornAt, lifespan, fading }
let phantomNextEligibleAt = 0;    // simTime after which a new phantom may spawn
let phantomRng = null;            // lazily created seeded stream
let phantomLastRollTick = -1;     // last quantized sim tick we rolled on
const PHANTOM_ROLL_QUANTUM = 0.25; // seconds per spawn roll (frame-rate independent)

// Death linger duration — the world dims before the staged results reveal.
// Shared between the render path and the continue-input gate so pressing
// confirm during the linger does nothing; the player must see the linger
// finish before they can exit.
const DEATH_LINGER_DURATION = 1.2;
let remoteFauna = [];
let remoteSentries = [];
let _starFlashTimer = 0;    // dramatic flash when star consumed by well
let _starFlashColor = [255, 255, 255];

// Profile + home screen
const profileManager = new ProfileManager();
let profileCursor = 0;       // profile select cursor (0-2)
let homeTab = 0;             // home screen tab (see HOME_TABS)
let homeShipCursor = 0;      // ship subscreen cursor (0-1 equip, 2-3 consumable)
let homeVaultCursor = 0;     // vault subscreen scroll position
let homeRigCursor = 0;       // rig subscreen cursor
let homePhaseTimer = 0;      // animation timer for home screen
let nameInputActive = false; // text input mode for new profile
let nameInputBuffer = '';    // current typed name
let deleteConfirmSlot = -1;  // which slot is pending delete confirmation (-1 = none)
let deleteConfirmChoice = 'cancel'; // destructive confirmation defaults to the safe action
let recentEchoes = [];
let homeChronicleOffset = 0;

const HOME_TABS = ['SHIP', 'VAULT', 'RIG', 'CHRONICLE', 'LAUNCH'];
const PUBLIC_HULL_COPY = Object.freeze({
  drifter: 'current-coupled route runner',
  breacher: 'high-burn salvage interceptor',
});

function formatClock(seconds = 0) {
  const safe = Math.max(0, Math.floor(Number(seconds) || 0));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

function currentPromptOptions() {
  return {
    deck: isDeckMode(),
    lastInputSource: inputManager?.lastInputSource,
  };
}

function markTerminalPresentation(outcome = 'dead') {
  if (outcome === 'dead') clearHUDForTerminal('dead');
}

function requestPackagedQuit() {
  const quit = globalThis?.lbhApp?.quit;
  if (typeof quit !== 'function') return false;
  void Promise.resolve(quit()).catch((error) => {
    console.warn('[LBH] packaged quit request failed:', error?.message || error);
  });
  return true;
}

function profileRunRecords(profile) {
  const records = Array.isArray(profile?.runRecords) ? profile.runRecords
    : Array.isArray(profile?.runs) ? profile.runs
      : Array.isArray(profile?.recentRuns) ? profile.recentRuns
        : [];
  return records.filter(Boolean);
}

function runResultToChronicleRecord(runResult, fallback = {}) {
  if (!runResult && !fallback.outcome) return null;
  const outcome = runResult?.outcome === 'escaped' ? 'extracted'
    : runResult?.outcome || fallback.outcome || 'unknown';
  const cargo = outcome === 'extracted'
    ? (Array.isArray(runResult?.cargoExtracted) ? runResult.cargoExtracted : fallback.cargo || [])
    : (Array.isArray(runResult?.cargoLost) ? runResult.cargoLost : fallback.cargo || []);
  const emEarned = Number.isFinite(Number(runResult?.emEarned))
    ? Math.max(0, Math.round(Number(runResult.emEarned)))
    : Math.max(0, Math.round(Number(fallback.emEarned) || 0));
  const survivalTime = Number.isFinite(Number(runResult?.survivalTime))
    ? Number(runResult.survivalTime)
    : Number(fallback.survivalTime) || 0;
  return {
    runId: runResult?.runId || fallback.runId || `local-${Date.now()}`,
    createdAt: runResult?.createdAt || fallback.createdAt || new Date().toISOString(),
    outcome,
    survivalTime,
    hullType: runResult?.hullType || fallback.hullType || profileManager.active?.hullType || 'drifter',
    mapId: runResult?.mapId || runResult?.mapContext?.mapId || fallback.mapId || currentMap?.id || currentMap?.name || 'local',
    seed: runResult?.seed ?? runResult?.mapContext?.seed ?? fallback.seed ?? previewSeed,
    emEarned,
    cargoCount: cargo.filter(Boolean).length,
    cargoValue: cargo.reduce((sum, item) => sum + (Number(item?.value) || 0), 0),
    noiseMaxMeters: Number(runResult?.noiseMaxMeters ?? fallback.noiseMaxMeters ?? 0) || 0,
    noiseSource: runResult?.noiseSource || fallback.noiseSource || null,
    noiseTimeHeardSeconds: Number(runResult?.noiseTimeHeardSeconds ?? fallback.noiseTimeHeardSeconds ?? 0) || 0,
    noiseTimeTrackedSeconds: Number(runResult?.noiseTimeTrackedSeconds ?? fallback.noiseTimeTrackedSeconds ?? 0) || 0,
    deathCause: runResult?.deathCause || fallback.deathCause || null,
    deathEntityId: runResult?.deathEntityId || fallback.deathEntityId || null,
    deathEntityName: runResult?.deathEntityName || fallback.deathEntityName || null,
    notable: runResult?.notables?.[0]?.description || fallback.notable || null,
  };
}

function appendProfileRunRecord(record) {
  const p = profileManager.active;
  if (!p || !record) return;
  const existing = profileRunRecords(p);
  const runId = record.runId || `local-${Date.now()}`;
  const next = [{ ...record, runId }, ...existing.filter((entry) => entry?.runId !== runId)].slice(0, 50);
  p.runRecords = next;
  profileManager.save();
}

function recordChronicleRun(runResult, fallback = {}) {
  appendProfileRunRecord(runResultToChronicleRecord(runResult, fallback));
}

function syncRecentEchoesFromProfile() {
  recentEchoes = Array.isArray(profileManager.active?.recentEchoes)
    ? profileManager.active.recentEchoes.map((echo) => ({ ...echo })).slice(0, 8)
    : [];
  homeChronicleOffset = 0;
}

function appendRecentEcho(echo) {
  const next = [echo, ...recentEchoes].filter(Boolean).slice(0, 8).map((entry) => ({ ...entry }));
  recentEchoes = profileManager.active ? profileManager.setRecentEchoes(next) : next;
}

function buildChronicleViewModel() {
  const p = profileManager.active;
  if (!p) return null;
  const existingRecords = profileRunRecords(p);
  const latestResultRecord = runResultToChronicleRecord(lastRunResult);
  const records = [
    ...(latestResultRecord ? [latestResultRecord] : []),
    ...existingRecords,
  ]
    .filter((record, index, all) => record && all.findIndex((entry) => entry.runId === record.runId) === index)
    .slice(0, 8);
  const bestSecs = Math.max(0, Number(p.bestSurvivalTime) || 0);
  const totalRuns = (Number(p.totalExtractions) || 0) + (Number(p.totalDeaths) || 0);
  return {
    name: p.name || 'Pilot',
    hullType: p.hullType || p.shipType || 'drifter',
    stats: {
      exoticMatter: Number(p.exoticMatter) || 0,
      totalExtractions: Number(p.totalExtractions) || 0,
      totalDeaths: Number(p.totalDeaths) || 0,
      totalRuns,
      bestSurvivalTime: bestSecs,
      bestSurvivalLabel: formatClock(bestSecs),
      totalExoticMatterEarned: Number(p.totalExoticMatterEarned) || 0,
      vaultCount: Array.isArray(p.vault) ? p.vault.length : 0,
      vaultCapacity: Number(p.vaultCapacity) || 0,
    },
    records: records.map((record, index) => ({
      index: existingRecords.length - index,
      runId: record.runId || null,
      outcome: record.outcome || 'unknown',
      survivalLabel: formatClock(record.survivalTime),
      survivalTime: Number(record.survivalTime) || 0,
      hullType: record.hullType || p.hullType || 'drifter',
      mapId: record.mapId || 'local',
      emEarned: Number(record.emEarned) || 0,
      cargoCount: Number(record.cargoCount) || 0,
      cargoValue: Number(record.cargoValue) || 0,
      noiseMaxMeters: Number(record.noiseMaxMeters) || 0,
      noiseSource: record.noiseSource || null,
      noiseTimeHeardSeconds: Number(record.noiseTimeHeardSeconds) || 0,
      noiseTimeTrackedSeconds: Number(record.noiseTimeTrackedSeconds) || 0,
      deathCause: record.deathEntityId ? `${record.deathCause}: ${record.deathEntityId}` : record.deathCause || null,
      notable: record.notable || null,
    })),
    echoes: recentEchoes.slice(homeChronicleOffset, homeChronicleOffset + 4),
    echoOffset: homeChronicleOffset,
  };
}

function setNameInputBuffer(value) {
  nameInputBuffer = sanitizePilotName(value, '').slice(0, 16);
}

function appendNameInput(text) {
  setNameInputBuffer(`${nameInputBuffer}${text || ''}`);
}

function currentRunResultsViewModel() {
  const fallbackCargo = inventorySystem?.getCargoItems?.() || [];
  return buildRunResultsViewModel({
    runResult: lastRunResult,
    phase: gamePhase,
    fallbackCargo,
    fallbackSurvivalTime: simState.runEndTime,
    fallbackRunDurationSeconds: CONFIG.universe.runDuration,
    fallbackEmEarned: runEmEarned({
      outcome: gamePhase === 'escaped' ? 'extracted' : gamePhase === 'dead' ? 'dead' : 'abandoned',
      survivalTime: simState.runEndTime,
    }),
    settlement: extractionSettlementPreview(),
  });
}

function extractionSettlementPreview() {
  if (gamePhase !== 'escaped') return null;
  const profile = profileManager.active;
  if (!profile) return null;
  const cargo = Array.isArray(lastRunResult?.cargoExtracted)
    ? lastRunResult.cargoExtracted.filter(Boolean)
    : (inventorySystem?.getCargoItems?.() || []).filter(Boolean);
  const vaultCount = Array.isArray(profile.vault) ? profile.vault.length : 0;
  const vaultCapacity = Math.max(0, Number(profile.vaultCapacity) || 0);
  const depositedCount = Math.max(0, Math.min(cargo.length, vaultCapacity - vaultCount));
  const overflow = cargo.slice(depositedCount);
  return {
    depositedCount,
    overflowCount: overflow.length,
    overflowValue: overflow.reduce((sum, item) => sum + (Number(item?.value) || 0), 0),
    vaultCount: vaultCount + depositedCount,
    vaultCapacity,
  };
}

function profileVaultValue(profile) {
  const vault = Array.isArray(profile?.vault) ? profile.vault : [];
  return vault.reduce((sum, item) => sum + (Number(item?.value) || 0), 0);
}

function homeTabRole(index) {
  if (index === 1 || index === 4) return 'salvage';
  if (index === 2) return 'tech';
  if (index === 3) return 'anomaly';
  return 'flow';
}

function mapRiskRole(map) {
  if (map?.mapClass === 'deep-field') return 'danger';
  if (map?.mapClass === 'expanse') return 'salvage';
  return 'flow';
}

function mapRiskLabel(map) {
  const role = mapRiskRole(map);
  if (role === 'danger') return 'severe pressure';
  if (role === 'salvage') return 'unstable route';
  return 'readable route';
}

function drawHomeShipSprite(ctx, x, y, {
  scale = 1,
  hullType = 'drifter',
  role = 'flow',
  alpha = 1,
  pulse = 0,
} = {}) {
  const size = 112 * scale;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.fillStyle = roleColor('void', 0.64);
  ctx.fillRect(x - size / 2 - 8, y - size / 2 - 8, size + 16, size + 16);
  ctx.strokeStyle = roleColor(role, 0.32 + 0.14 * pulse);
  ctx.lineWidth = 1;
  ctx.strokeRect(x - size / 2 - 8.5, y - size / 2 - 8.5, size + 17, size + 17);
  drawShipSprite(ctx, hullType, { x: x - size / 2, y: y - size / 2, w: size, h: size }, { alpha: 0.98 });
  ctx.textAlign = 'center';
  ctx.font = canvasFont(11, { weight: '700' });
  ctx.fillStyle = roleColor('muted', 0.74);
  ctx.fillText(String(hullType || 'drifter').toUpperCase(), x, y + size / 2 + 30);
  ctx.restore();
}

function currentUiMotionSettings() {
  return resolveMotionSettings(CONFIG.ui?.motion);
}

function transitionTiming() {
  const duration = currentUiMotionSettings().transitionDuration;
  return {
    duration,
    handoff: duration * 0.38,
  };
}

function profilePromptText() {
  const options = currentPromptOptions();
  if (nameInputActive) return `${promptLabel('confirm', options)} confirm    ${promptLabel('back', options)} cancel`;
  if (deleteConfirmSlot >= 0) return `${promptLabel('navigate', options)} choose    ${promptLabel('confirm', options)} ${deleteConfirmChoice}    ${promptLabel('back', options)} cancel`;
  const occupied = profileManager.hasProfile(profileCursor);
  return occupied
    ? `${promptLabel('select', options)} select    ${promptLabel('confirm', options)} load    ${promptLabel('delete', options)} delete    ${promptLabel('back', options)} back`
    : `${promptLabel('select', options)} select    ${promptLabel('confirm', options)} create    ${promptLabel('back', options)} back`;
}

function nextRemainingProfileSlot(afterSlot) {
  for (let offset = 1; offset <= 3; offset += 1) {
    const slot = (afterSlot + offset) % 3;
    if (profileManager.hasProfile(slot)) return slot;
  }
  return -1;
}

function closeDeleteConfirmation() {
  deleteConfirmSlot = -1;
  deleteConfirmChoice = 'cancel';
}

function confirmProfileDeletion() {
  if (deleteConfirmChoice !== 'delete' || deleteConfirmSlot < 0) {
    closeDeleteConfirmation();
    return;
  }
  const deletedSlot = deleteConfirmSlot;
  const deleted = profileManager.deleteProfile(deletedSlot);
  closeDeleteConfirmation();
  if (!deleted) return;
  const nextSlot = nextRemainingProfileSlot(deletedSlot);
  if (nextSlot >= 0) {
    profileCursor = nextSlot;
    return;
  }
  profileCursor = deletedSlot;
  nameInputActive = true;
  setNameInputBuffer(generatePilotName());
}

function profileActions(promptOptions = currentPromptOptions()) {
  return deleteConfirmSlot >= 0
    ? [
      { descriptor: actionDescriptor('navigate', promptOptions), verb: 'choose cancel / delete' },
      { descriptor: actionDescriptor('confirm', promptOptions), verb: deleteConfirmChoice },
      { descriptor: actionDescriptor('back', promptOptions), verb: 'cancel' },
    ]
    : [
      { descriptor: actionDescriptor('select', promptOptions), verb: 'move' },
      { descriptor: actionDescriptor('confirm', promptOptions), verb: 'load / create' },
      { descriptor: actionDescriptor('delete', promptOptions), verb: 'delete' },
      { descriptor: actionDescriptor('back', promptOptions), verb: 'back out' },
    ];
}

function homeActions(promptOptions = currentPromptOptions()) {
  return [
    { descriptor: actionDescriptor('tabs', promptOptions), verb: 'switch tabs' },
    { descriptor: actionDescriptor('select', promptOptions), verb: 'move' },
    { descriptor: actionDescriptor('confirm', promptOptions), verb: 'use' },
    { descriptor: actionDescriptor('back', promptOptions), verb: 'back out' },
  ];
}

function mapSelectActions(promptOptions = currentPromptOptions()) {
  return [
    { descriptor: actionDescriptor('select', promptOptions), verb: 'move' },
    { descriptor: actionDescriptor('reroll', promptOptions), verb: 'new survey' },
    { descriptor: actionDescriptor('back', promptOptions), verb: 'back out' },
  ];
}

function threePanelLayout(width, height, kind, viewportWidth = width, options = {}) {
  const layout = deckPanelLayout(width, height, kind, viewportWidth, options);
  return { ...layout, leftW: layout.left.w, rightW: layout.right.w, centerW: layout.center.w };
}

function currentUiFocusKey() {
  if (gamePhase === 'profileSelect') return `${gamePhase}:${profileCursor}:${nameInputActive ? 'name' : deleteConfirmSlot >= 0 ? `delete:${deleteConfirmChoice}` : 'list'}`;
  if (gamePhase === 'home') {
    if (homeTab === 0) return `${gamePhase}:${homeTab}:${homeShipCursor}`;
    if (homeTab === 1) return `${gamePhase}:${homeTab}:${homeVaultCursor}`;
    if (homeTab === 2) return `${gamePhase}:${homeTab}:${homeRigCursor}`;
    return `${gamePhase}:${homeTab}`;
  }
  if (gamePhase === 'mapSelect') return `${gamePhase}:${mapSelectIndex}:${previewSeed}`;
  if (gamePhase === 'paused') return `${gamePhase}:${pauseMenuSelection}`;
  if (gamePhase === 'dead' || gamePhase === 'escaped') return `${gamePhase}:${lastRunResult?.runId || ''}`;
  return gamePhase;
}

function setUiMotionTimeForTest(value) {
  uiMotionTimer = Math.max(0, Number(value) || 0);
  return uiMotionTimer;
}

function getUiMotionStateForTest() {
  return {
    phase: uiMotionPhase,
    focusKey: uiFocusKey,
    timer: uiMotionTimer,
    focusPulseTimer: uiFocusPulseTimer,
    settings: currentUiMotionSettings(),
    transition: { active: transitionActive, timer: transitionTimer, ...transitionTiming(), glitchIntensity: getTransitionGlitchIntensity() },
    profilePrompt: gamePhase === 'profileSelect' ? profilePromptText() : null,
    profileDelete: gamePhase === 'profileSelect' ? { slot: deleteConfirmSlot, choice: deleteConfirmChoice } : null,
    layout: (gamePhase === 'home' || gamePhase === 'mapSelect')
      ? gamePhase === 'mapSelect'
        ? mapSelectSurfaceLayout(overlayCanvas.width, overlayCanvas.height, window.innerWidth, MAP_SELECT_ENTRIES.length, mapSelectActions())
        : threePanelLayout(overlayCanvas.width, overlayCanvas.height, 'home', window.innerWidth, { rightFooterActions: homeActions(), footerGap: 10 })
      : null,
  };
}

function updateUiMotion(rawDt) {
  const nextClock = advanceMotionClock(0, rawDt);
  if (gamePhase !== uiMotionPhase) {
    uiMotionPhase = gamePhase;
    uiMotionTimer = 0;
    uiFocusKey = currentUiFocusKey();
    uiFocusPulseTimer = 0;
    return;
  }
  uiMotionTimer += nextClock;
  const nextFocusKey = currentUiFocusKey();
  if (nextFocusKey !== uiFocusKey) {
    uiFocusKey = nextFocusKey;
    uiFocusPulseTimer = 0;
  } else {
    uiFocusPulseTimer += nextClock;
  }
}

function uiContentReveal(delay = 0.1, duration = currentUiMotionSettings().textDuration) {
  const motion = currentUiMotionSettings();
  return motionProgress(uiMotionTimer, {
    delay,
    duration,
    reducedMotion: motion.reducedMotion,
  });
}

function uiFocusPulseAmount() {
  const motion = currentUiMotionSettings();
  if (motion.reducedMotion) return 0;
  return 1 - motionProgress(uiFocusPulseTimer, {
    duration: motion.commandPulse,
  });
}

// Scene transition state
let transitionActive = false;
let transitionTimer = 0;
let transitionCallback = null;  // called at midpoint to swap the scene
let transitionFired = false;
const INHIBITOR_WAKE_GLITCH_DURATION = 1.0;

function getConfiguredSimServerUrl() {
  const url = new URL(window.location.href);
  if (url.searchParams.has('localSandbox') || url.searchParams.has('noSimServer')) {
    localStorage.removeItem('lbh.simServerUrl');
    return '';
  }
  const fromQuery = url.searchParams.get('simServer');
  if (fromQuery) {
    localStorage.setItem('lbh.simServerUrl', fromQuery);
    return fromQuery;
  }
  return localStorage.getItem('lbh.simServerUrl') || '';
}

function authorityLaunchWarning(error) {
  console.error('[LBH] cycle launch detail:', error);
  return 'the cycle would not open — retry or return home';
}

// ---- Init ----

function init() {
  window.__LBH_BOOT_MARK__?.('init.start');
  // WebGL canvas
  glCanvas = document.getElementById('fluid-canvas');
  threeCanvas = document.getElementById('three-canvas');
  overlayCanvas = document.getElementById('overlay-canvas');
  if (!glCanvas || !threeCanvas || !overlayCanvas) {
    reportBootFailure('Missing one or more render canvases.', {
      fluidCanvas: Boolean(glCanvas),
      threeCanvas: Boolean(threeCanvas),
      overlayCanvas: Boolean(overlayCanvas),
    });
    return false;
  }
  // Fixed internal render resolution with aspect-preserving letterbox.
  // Black hole (and every framed visual) has a single authored shape —
  // window size only scales the whole frame, it doesn't reshape anything.
  fitViewport(glCanvas, threeCanvas, overlayCanvas);
  const renderParams = new URLSearchParams(location.search);
  titleLayout = normalizeTitleLayout(renderParams.get('titleLayout') || titleLayout);
  const preserveDrawingBuffer = renderParams.has('capture') || renderParams.has('preserveDrawingBuffer');
  gl = glCanvas.getContext('webgl2', {
    alpha: false,
    antialias: false,
    // Capture mode is for renderer fixtures and agent screenshots. Normal
    // play keeps the faster transient drawing buffer.
    preserveDrawingBuffer,
  });
  if (!gl) {
    window.__LBH_BOOT_MARK__?.('webgl2.unavailable');
    reportBootFailure(
      'WebGL 2 is not available, so the game renderer cannot start.',
      [
        `url: ${window.location.href}`,
        `userAgent: ${navigator.userAgent}`,
        `buildFlags: ${JSON.stringify(window.__LBH_BUILD_FLAGS__ || null)}`,
      ].join('\n')
    );
    return false;
  }
  const debugRendererInfo = gl.getExtension('WEBGL_debug_renderer_info');
  window.__LBH_BOOT_MARK__?.('webgl2.ready', {
    vendor: gl.getParameter(gl.VENDOR),
    renderer: gl.getParameter(gl.RENDERER),
    unmaskedVendor: debugRendererInfo ? gl.getParameter(debugRendererInfo.UNMASKED_VENDOR_WEBGL) : null,
    unmaskedRenderer: debugRendererInfo ? gl.getParameter(debugRendererInfo.UNMASKED_RENDERER_WEBGL) : null,
  });

  const ext1 = gl.getExtension('EXT_color_buffer_float');
  if (!ext1) console.warn('EXT_color_buffer_float not available');
  gl.getExtension('OES_texture_float_linear');

  // 2D overlay canvas (already sized by fitViewport above).
  ctx = overlayCanvas.getContext('2d');

  // Init systems
  fluid = new FluidSim(gl);
  flowField = new FlowField(fluid);
  // Production chain: HDR ping-pong FBOs preserve the fluid display
  // shader's naturally out-of-range highlights, then tonemap compresses
  // to LDR before ASCII quantizes. The rich default is documented in
  // docs/reference/RENDER-PIPELINE.md; ?minimalrender=1 keeps a cheap
  // baseline for 15x15/25x25 perf comparisons.
  // Gameplay render chain. Default is the rich chain (Art-Is-Product
  // identity: bloom highlights, color grade, vignette, CRT aberration
  // + scanlines). Pass ?minimalrender=1 to fall back to the bare
  // FluidDisplay → Tonemap → ASCII chain for perf comparison.
  //
  // Accretion + FluidGain are intentionally title-only — gameplay wells
  // already render their own rings via FluidDisplay's fluid shader, and
  // the title-specific composition radii don't apply to scattered
  // multi-well maps.
  // URL flags for render tuning:
  //   ?minimalrender=1       — bare FluidDisplay > Tonemap > ASCII (perf baseline)
  //   ?disable=name1,name2   — drop individual post-processing passes.
  //                            Valid names: bloom, color-grade, vignette,
  //                            chromatic-aberration, scanlines.
  //                            FluidDisplay, Tonemap, ASCII are always kept.
  const renderQuality = requestedRenderQuality();
  const useMinimalChain = renderQuality === 'minimal';
  const rendererBackendName = requestedRendererBackend();
  const disabledPasses = new Set(
    (renderParams.get('disable') || '').split(',').map((s) => s.trim()).filter(Boolean),
  );
  composer = new Composer(gl);
  fluidDisplayPass = new FluidDisplayPass(fluid);
  tonemapPass = new TonemapPass({ exposure: 1.0 });
  asciiPass = new ASCIIPass(gl);
  if (useMinimalChain) {
    composer.add(fluidDisplayPass);
    composer.add(tonemapPass);
    composer.add(asciiPass);
  } else {
    // Gameplay post-processing. Defaults match GAMEPLAY_RENDER_TUNING;
    // title phase mutates the same passes to TITLE_RENDER_TUNING each
    // frame (see applyRenderTuningForPhase). FluidGain + Accretion live
    // in the chain unconditionally — gain=1 / strength=0 during gameplay
    // makes them cheap no-ops, and flipping to title values needs no
    // chain rebuild.
    fluidGainPass = new GainPass({ gain: GAMEPLAY_RENDER_TUNING.fluidGain, name: 'fluid-gain' });
    accretionPass = new AccretionPass({ strength: GAMEPLAY_RENDER_TUNING.accretionStrength });
    bloomPass = new BloomPass(gl, {
      threshold: GAMEPLAY_RENDER_TUNING.bloom.threshold,
      knee: GAMEPLAY_RENDER_TUNING.bloom.knee,
      strength: GAMEPLAY_RENDER_TUNING.bloom.strength,
      blurRadius: GAMEPLAY_RENDER_TUNING.bloom.blurRadius,
      scale: 0.5,
    });
    const colorGradePass = new ColorGradePass({
      shadowTint: [0.95, 0.95, 1.05],
      highlightTint: [1.05, 1.0, 0.95],
      shadowStrength: 0.2,
      highlightStrength: 0.25,
    });
    // Vignette softened — gameplay needs peripheral visibility for threats.
    vignettePass = new VignettePass({
      strength: GAMEPLAY_RENDER_TUNING.vignette.strength,
      radius: GAMEPLAY_RENDER_TUNING.vignette.radius,
      softness: GAMEPLAY_RENDER_TUNING.vignette.softness,
    });
    // Aberration near-subliminal — CRT lens hint at corners only.
    chromaticAberrationPass = new ChromaticAberrationPass({
      strength: GAMEPLAY_RENDER_TUNING.chromaticAberration.strength,
      falloff: GAMEPLAY_RENDER_TUNING.chromaticAberration.falloff,
    });
    // Scanlines subtle — not over the glyphs.
    scanlinesPass = new ScanlinesPass({
      intensity: GAMEPLAY_RENDER_TUNING.scanlines.intensity,
      frequency: GAMEPLAY_RENDER_TUNING.scanlines.frequency,
    });
    // ASCII is mid-chain; last kept pass must be terminal.
    asciiPass.rendersToScreen = false;
    const fullChain = [
      { pass: fluidDisplayPass, kind: 'core' },
      { pass: fluidGainPass, kind: 'core' },
      { pass: accretionPass, kind: 'core' },
      { pass: bloomPass, kind: 'post' },
      { pass: tonemapPass, kind: 'core' },
      { pass: colorGradePass, kind: 'post' },
      { pass: vignettePass, kind: 'post' },
      { pass: asciiPass, kind: 'core' },
      { pass: chromaticAberrationPass, kind: 'post' },
      { pass: scanlinesPass, kind: 'post' },
    ];
    const activeChain = fullChain
      .filter(({ pass, kind }) => kind === 'core' || !disabledPasses.has(pass.name))
      .map((entry) => entry.pass);
    activeChain[activeChain.length - 1].rendersToScreen = true;
    for (const p of activeChain) composer.add(p);
    console.log('[render] gameplay chain:', activeChain.map((p) => p.name));
  }
  rendererBackend = createRendererBackend({
    backend: rendererBackendName,
    composer,
    asciiPass,
    gl,
    sourceCanvas: glCanvas,
    targetCanvas: threeCanvas,
    renderQuality,
  });
  perfStats.rendererBackend = rendererBackend.name;
  perfStats.renderQuality = rendererBackend.renderQuality;
  console.log(`[render] backend: ${rendererBackend.name} (${rendererBackend.renderQuality})`);

  // Init entity systems (empty — loadScene populates them)
  wellSystem = new WellSystem();
  starSystem = new StarSystem();
  wreckSystem = new WreckSystem();
  portalSystem = new PortalSystem();
  planetoidSystem = new PlanetoidSystem();
  scavengerSystem = new ScavengerSystem();
  combatSystem = new CombatSystem();
  audioEngine = new AudioEngine();
  audioRouter = new AudioRouter(audioEngine);
  inventorySystem = new InventorySystem();
  slingshotSystem = new SlingshotSystem();

  // Init input manager
  inputManager = new InputManager();

  // Init wave ring system
  waveRings = new WaveRingSystem();
  flowField.setSources({ wellSystem, starSystem, waveRings });

  // Init ship
  ship = new Ship(glCanvas.width, glCanvas.height);

  legacyLocalSimCore = new LocalSandboxSimCore({
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
  titleScenePresentation = new TitleScenePresentation({
    fluid,
    wellSystem,
    starSystem,
    wreckSystem,
    portalSystem,
    planetoidSystem,
    combatSystem,
    waveRings,
  });

  const simServerUrl = getConfiguredSimServerUrl();
  if (simServerUrl) {
    simClient = new SimClient(simServerUrl);
    console.log(`[LBH] remote sim configured: ${simServerUrl}`);
  }

  // Load title scene (clears everything, loads default map, seeds fluid)
  void preloadShipSprites().catch(() => {});
  loadTitleScene();

  // Input: mouse, keyboard, and gamepad all flow through InputManager.
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
        syncRecentEchoesFromProfile();
        nameInputActive = false;
        gamePhase = 'home';
        homeTab = 0;
        homePhaseTimer = 0;
      } else if (e.key === 'Escape') {
        nameInputActive = false;
      } else if (e.key === 'Backspace') {
        nameInputBuffer = nameInputBuffer.slice(0, -1);
      } else if (e.key.length === 1 && nameInputBuffer.length < 16) {
        appendNameInput(e.key);
      }
    }
  });

  window.addEventListener('paste', (e) => {
    if (!nameInputActive) return;
    e.preventDefault();
    appendNameInput(e.clipboardData?.getData('text') || '');
  });

  // Handle resize — backing store stays fixed at RENDER_W x RENDER_H,
  // only the CSS letterbox rect changes. Ship and composer read the
  // backing-store dims, so they see no change; only the min-window
  // overlay toggles visibility.
  const minWindowOverlay = document.getElementById('min-window-overlay');
  window.addEventListener('resize', () => {
    const { ok } = fitViewport(glCanvas, threeCanvas, overlayCanvas);
    ship.canvasWidth = glCanvas.width;
    ship.canvasHeight = glCanvas.height;
    rendererBackend?.resize(glCanvas.width, glCanvas.height);
    if (minWindowOverlay) {
      minWindowOverlay.style.display = ok ? 'none' : 'flex';
    }
  });
  // First-load state for the overlay.
  if (minWindowOverlay) {
    const { ok } = fitViewport(glCanvas, threeCanvas, overlayCanvas);
    minWindowOverlay.style.display = ok ? 'none' : 'flex';
  }

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
      perfStats,
      getRulerOverlayStatsForTest: () => rulerOverlayStats,
      audioEngine,
      getFluidGridStateForTest: () => {
        const renderInputs = getVisibleWellRenderInputs(camX, camY);
        return {
          worldScale: WORLD_SCALE,
          gridWindow: GRID_WINDOW,
          fluidCamera: { x: getFluidCamera()[0], y: getFluidCamera()[1] },
          fluidResolution: fluid?.res || 0,
          visibleWellCount: renderInputs.visibleIndices.length,
          totalWellCount: wellSystem?.wells?.length || 0,
        };
      },
      setTimeScale: (s) => { timeScale = s; },
      loadTitleScene,
      loadRendererFixture,
      restart: () => restart(),
      currentMap,
      mapList: MAP_LIST,
      mapSelectEntries: MAP_SELECT_ENTRIES.map((entry) => ({
        id: entry.id,
        available: entry.available !== false,
        label: entry.available === false ? entry.label : surveyScaleForMap(entry.id)?.label || entry.map?.name,
        scaleLabel: entry.available === false ? null : surveyScaleForMap(entry.id)?.scale.label || null,
      })),
      getMapSelectSurveyForTest: () => currentMapSelectSurvey(),
      getRunSceneForTest: () => ({
        mapId: currentMap?.id || null,
        seed: remoteSession.active ? remoteSession.launchSeed : previewSeed,
        signature: currentSignature ? { ...currentSignature } : null,
        launchSignature: remoteSession.launchSignature ? { ...remoteSession.launchSignature } : null,
      }),
      startGame,
      setMap: (map) => { startGame(map); },
      setOverlayVisible: (visible) => {
        overlayCanvas.style.opacity = visible ? '1' : '0';
      },
      setRendererView: (mode) => {
        rendererBackend?.setViewMode(mode);
      },
      getRendererView: () => rendererBackend?.getViewMode?.() || 'ascii',
      getRendererBackend: () => rendererBackend?.name || 'legacy',
      getRendererBackendStats: () => rendererBackend?.getPerfStats?.() || null,
      getThreeSceneStateForTest: () => ({
        ...collectPresentationSceneSource(),
        camera: {
          camX,
          camY,
          canvasWidth: glCanvas.width,
          canvasHeight: glCanvas.height,
          worldScale: WORLD_SCALE,
          cameraView: CAMERA_VIEW,
        },
      }),
      getRenderCanvasId: () => rendererBackend?.getCanvasId?.() || glCanvas?.id || 'fluid-canvas',
      stepFrameForTest: (dt = 1 / 60) => {
        const stepMs = Math.max(1, Math.min(100, Number(dt) * 1000 || (1000 / 60)));
        gameLoop(lastFrameTime + stepMs);
        return {
          fps,
          perfStats,
          rendererBackend: rendererBackend?.name || 'legacy',
        };
      },
      get gamePhase() { return gamePhase; },
      set gamePhase(p) { gamePhase = p; },
      get mapSelectIndex() { return mapSelectIndex; },
      get previewSeed() { return previewSeed; },
      inventorySystem,
      get lastRunResult() { return lastRunResult; },
      setLastRunResult: (result) => { lastRunResult = result ? JSON.parse(JSON.stringify(result)) : null; },
      getRunResultsViewModel: currentRunResultsViewModel,
      getEndScreenStateForTest: () => {
        const timer = gamePhase === 'dead' ? deathTimer : gamePhase === 'escaped' ? escapeTimer : 0;
        const unlockAt = DEATH_LINGER_DURATION + 1.0;
        return {
          phase: gamePhase,
          timer,
          unlockAt,
          canContinue: (gamePhase === 'dead' || gamePhase === 'escaped') && timer > unlockAt,
        };
      },
      getChronicleViewModel: buildChronicleViewModel,
      setRecentEchoes: (echoes) => {
        recentEchoes = Array.isArray(echoes) ? echoes.map((echo) => ({ ...echo })).slice(0, 8) : [];
        if (profileManager.active) recentEchoes = profileManager.setRecentEchoes(recentEchoes);
      },
      setEndScreenTimers: ({ death = deathTimer, escape = escapeTimer } = {}) => {
        deathTimer = death;
        escapeTimer = escape;
      },
      setUiMotionTimeForTest,
      getUiMotionStateForTest,
      setTitleTimerForTest: (value) => {
        titleTimer = Math.max(0, Number(value) || 0);
        return titleTimer;
      },
      setTitleLoopTimeForTest: (value) => {
        totalTime = titleLoopTime(Number(value) || 0);
        updateTitleAttractScene();
        return titleLoopTime(totalTime);
      },
      setTitleLayoutForTest: (value) => {
        titleLayout = normalizeTitleLayout(value);
        return titleLayout;
      },
      setTitleEnvironmentCaptureOnlyForTest: (enabled) => {
        titleEnvironmentCaptureOnly = Boolean(enabled);
        return titleEnvironmentCaptureOnly;
      },
      setProfileCursorForTest: (index) => {
        profileCursor = Math.max(0, Math.min(2, Math.round(Number(index) || 0)));
        return profileCursor;
      },
      setHomeTabForTest: (index) => {
        const count = HOME_TABS.length || 1;
        homeTab = ((Math.round(Number(index) || 0) % count) + count) % count;
        return homeTab;
      },
      setMapSelectIndexForTest: (index) => {
        const count = MAP_SELECT_ENTRIES.length || 1;
        mapSelectIndex = ((Math.round(Number(index) || 0) % count) + count) % count;
        return mapSelectIndex;
      },
      setPreviewSeedForTest: (seed) => {
        previewSeed = Math.max(1, Math.floor(Number(seed) || 1));
        previewCache = null;
        return previewSeed;
      },
      get inventoryOpen() { return inventoryOpen; },
      setInventoryOpenForTest: (open) => {
        inventoryOpen = Boolean(open);
        if (inventoryOpen) resetInventoryCursor();
      },
      inputManager,
      scavengerSystem,
      combatSystem,
      currentSignature,
      profileManager,
      simClient,
      get remoteAuthorityActive() { return remoteSession.active; },
      get remoteMapId() { return remoteSession.mapId; },
      get remoteSnapshot() { return remoteSession.snapshot; },
      get remotePendingSlingshotEdges() { return remoteSession.pendingSlingshotEdges; },
      get remoteSessionHealth() { return remoteSession.health; },
      get remoteControlState() { return currentRemoteControlState(); },
      get remotePlayers() { return remoteSession.players; },
      get inhibitorState() { return inhibitorState; },
      // Render-only fixture hook. Gameplay ecology truth still comes from the
      // authoritative collection snapshot path.
      setInhibitorVisualStateForTest: (state = {}) => {
        inhibitorState = {
          phase: Math.max(0, Math.min(3, Math.round(Number(state.phase) || 0))),
          waveId: state.waveId || 'fixture:ecology',
          scheduledTime: Number(state.scheduledTime) || 0,
          waveBudget: Number(state.waveBudget) || 0,
          entities: Array.isArray(state.entities) ? state.entities.map((entity) => ({ ...entity })) : [],
          ecology: state.ecology || { counts: {}, reachedKinds: [], activeCount: 0 },
        };
        inhibitorWakeGlitchTimer = state.wakeShock ? INHIBITOR_WAKE_GLITCH_DURATION : 0;
        return true;
      },
      get localAbilityState() { return localAbilityState; },
      get playableMaps() { return PLAYABLE_MAPS; },
      get homeTab() { return homeTab; },
      get homeRigCursor() { return homeRigCursor; },
      transitionToGame,
      transitionToRemoteGame,
      startRemoteGame,
      applyHullToShip,
    }));
  }

  if (RUNTIME_FLAGS.isDev && BENCH_REQUESTED) {
    void initBenchUi({
      simClient,
      overlayCanvas,
      getSnapshot: () => remoteSession.snapshot,
      screenToWorldPoint: (clientX, clientY) => {
        const rect = overlayCanvas.getBoundingClientRect();
        const px = (clientX - rect.left) * overlayCanvas.width / Math.max(1, rect.width);
        const py = (clientY - rect.top) * overlayCanvas.height / Math.max(1, rect.height);
        const [x, y] = screenToWorld(px, py, camX, camY, overlayCanvas.width, overlayCanvas.height);
        return { x, y };
      },
    });
  }

  if (RUNTIME_FLAGS.enableDevPanel && !BENCH_REQUESTED) {
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
        sessionTime: simState.runElapsedTime,
        spawnTime: simState.runElapsedTime,
        pickupCooldown: 1.5,
        vx: ejectVX,
        vy: ejectVY,
      });
      const droppedWreck = wreckSystem.wrecks[wreckSystem.wrecks.length - 1];
      droppedWreck.loot = [item];
      droppedWreck.name = `dropped: ${item.name}`;
      showWarning(`dropped ${item.name}`, 'rgba(255, 150, 80, 0.8)', 1500, { severity: 'loot' });
    }
  });

  // Start loop
  lastFrameTime = performance.now();
  requestAnimationFrame(gameLoop);
  window.__LBH_BOOT_MARK__?.('game-loop.scheduled', {
    rendererBackend: rendererBackend?.name || null,
    renderQuality: rendererBackend?.renderQuality || null,
    simServerUrl: simClient?.baseUrl || null,
  });
  return true;
}

function seedInitialFluid() {
  // Deterministic ambient dye only. Wells are always visible through their
  // analytic core/rim and authored lane deformation; the retired twelve-point
  // seed accumulated into a bright rectangular patch around every well.
  for (let i = 0; i < 25; i++) {
    fluid.visualSplat(
      0.05 + ((i * 17) % 90) / 100,
      0.05 + ((i * 29) % 90) / 100,
      0.003,
      0.04, 0.12, 0.18
    );
  }
}

function spawnClearance(obj, defaultMinDist) {
  if (obj.kind === 'well') return Math.max(defaultMinDist, (obj.killRadius || 0.04) + 0.55);
  if (obj.kind === 'star') return Math.max(defaultMinDist, 0.42 + (obj.mass || 1) * 0.06);
  if (obj.kind === 'portal') return Math.max(0.28, defaultMinDist * 0.65);
  if (obj.kind === 'planetoid') return Math.max(0.25, defaultMinDist * 0.55);
  return defaultMinDist;
}

function collectSpawnHazards(defaultMinDist) {
  return [
    ...wellSystem.wells.map(w => ({ kind: 'well', wx: w.wx, wy: w.wy, clearance: spawnClearance({ kind: 'well', ...w }, defaultMinDist) })),
    ...starSystem.stars.map(s => ({ kind: 'star', wx: s.wx, wy: s.wy, clearance: spawnClearance({ kind: 'star', ...s }, defaultMinDist) })),
    ...portalSystem.portals.filter(p => p.alive !== false).map(p => ({ kind: 'portal', wx: p.wx, wy: p.wy, clearance: spawnClearance({ kind: 'portal', ...p }, defaultMinDist) })),
    ...(planetoidSystem?.planetoids || []).filter(p => p.alive !== false).map(p => ({ kind: 'planetoid', wx: p.wx, wy: p.wy, clearance: spawnClearance({ kind: 'planetoid', ...p }, defaultMinDist) })),
  ];
}

function scoreSpawnCandidate(wx, wy, hazards) {
  if (hazards.length === 0) return Infinity;
  let score = Infinity;
  for (const hazard of hazards) {
    score = Math.min(score, worldDistance(wx, wy, hazard.wx, hazard.wy) - hazard.clearance);
  }
  return score;
}

function hasWellInCameraWindow(wx, wy) {
  const halfWindow = GRID_WINDOW / 2;
  return wellSystem.wells.some((well) => {
    const [dx, dy] = worldDisplacement(wx, wy, well.wx, well.wy);
    return Math.abs(dx) <= halfWindow && Math.abs(dy) <= halfWindow;
  });
}

/**
 * Pick a spawn that is outside each hazard's immediate pull/death envelope and
 * still frames at least one well in the first camera/fluid window when possible.
 * Random tries preserve variety; grid fallback prevents unlucky crowded maps
 * from dropping the player into an empty opening shot.
 */
function findSafeSpawn(minDist = 0.55) {
  const hazards = collectSpawnHazards(minDist);
  let best = { wx: WORLD_SCALE / 2, wy: WORLD_SCALE * 0.15, score: -Infinity };
  let bestFramed = null;
  const consider = (wx, wy) => {
    const score = scoreSpawnCandidate(wx, wy, hazards);
    const framed = hasWellInCameraWindow(wx, wy);
    if (score > best.score) best = { wx, wy, score };
    if (framed && score >= 0 && (!bestFramed || score > bestFramed.score)) bestFramed = { wx, wy, score };
    return score >= 0 && framed;
  };

  for (let attempt = 0; attempt < 90; attempt++) {
    const wx = Math.random() * WORLD_SCALE;
    const wy = Math.random() * WORLD_SCALE;
    if (consider(wx, wy)) return [wx, wy];
  }

  const steps = Math.max(5, Math.ceil(WORLD_SCALE * 2));
  for (let ix = 0; ix < steps; ix++) {
    for (let iy = 0; iy < steps; iy++) {
      const wx = ((ix + 0.5) / steps) * WORLD_SCALE;
      const wy = ((iy + 0.5) / steps) * WORLD_SCALE;
      if (consider(wx, wy)) return [wx, wy];
    }
  }

  const fallback = bestFramed || best;
  return [fallback.wx, fallback.wy];
}

/**
 * Full scene teardown + setup. The ONE authority for resetting state.
 * Every scene transition (title, map select, gameplay) calls this.
 * Nothing from the previous scene leaks into the next.
 */
function loadScene(map, { seed = 1 } = {}) {
  // 1. Revert previous scene's CONFIG overrides
  revertSceneOverrides();

  // 2. Apply new scene's CONFIG overrides
  applySceneOverrides(CONFIG, map.configOverrides);
  setResolvedClientRunDuration(map?.id);

  // 3. Reset ALL timers
  totalTime = 0;
  deathTimer = 0;
  escapeTimer = 0;
  resetSimState(simState);
  legacyLocalSimCore?.reset();
  titleScenePresentation?.reset();

  // 4. Reset gameplay state
  resetLocalInventoryShape();
  inventorySystem.clearCargo();
  inventoryOpen = false;
  shieldActive = false;
  localAbilityState = null;
  _starFlashTimer = 0;
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
  }, { seed });
  startingMasses = mapResult.startingMasses;

  // 7. Reset camera — 'locked' = world center, 'follow' = ship sets it later
  camX = map.worldScale / 2;
  camY = map.worldScale / 2;
  // Anchor the fluid grid to the new camera position. After this point all
  // worldToFluidUV() calls (entity injection, ship sampling, shader uniforms)
  // produce camera-relative UVs. The fluid texture was just cleared by
  // fluid.clear() above so there's no stale data to reconcile.
  setFluidCamera(camX, camY);

  // 8. Seed fresh fluid
  seedInitialFluid();

  // 9. Title owns the optional radial accretion composition. Gameplay keeps
  //    exactly one analytic well owner in FluidDisplay; neither visual path
  //    changes hit, gravity, current, or authority radii.
  const gameplayCoronaRadii = wellSystem.getCoronaRadii(CAMERA_VIEW);
  sceneAccretionRadii = wellSystem.wells.map((_, index) => (
    currentMap.titleAccretionRadii?.[index] || gameplayCoronaRadii[index] || [0.08, 0.16, 0.28]
  ));
}

function applyRenderTuningForPhase(isTitle) {
  if (!fluidGainPass) return;  // minimal chain — nothing to tune
  const t = isTitle ? TITLE_RENDER_TUNING : GAMEPLAY_RENDER_TUNING;
  fluidGainPass.gain = t.fluidGain;
  accretionPass.strength = t.accretionStrength;
  // The title owns the expansive blackbody spectrum. Ordinary play uses the
  // same geometry with a lower, red/orange danger treatment so it reads as a
  // hostile landmark instead of a bright scientific field plot.
  accretionPass.gameplayPalette = !isTitle && !rendererFixtureActive;
  bloomPass.threshold = t.bloom.threshold;
  bloomPass.knee = t.bloom.knee;
  bloomPass.strength = t.bloom.strength;
  bloomPass.blurRadius = t.bloom.blurRadius;
  vignettePass.strength = t.vignette.strength;
  vignettePass.radius = t.vignette.radius;
  vignettePass.softness = t.vignette.softness;
  chromaticAberrationPass.strength = t.chromaticAberration.strength;
  chromaticAberrationPass.falloff = t.chromaticAberration.falloff;
  scanlinesPass.intensity = t.scanlines.intensity;
  scanlinesPass.frequency = t.scanlines.frequency;
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

function getTransitionGlitchIntensity() {
  const motion = currentUiMotionSettings();
  if (!transitionActive || motion.reducedMotion) return 0;
  const state = sampleScreenTransition(transitionTimer, {
    duration: motion.transitionDuration,
    maxOcclusion: motion.maxOcclusion,
  });
  if (state.phase === 'depart') return 1 - state.outgoingAlpha;
  if (state.phase === 'handoff') return 1;
  return 1 - state.incomingAlpha;
}

/** Get current screenwide glitch intensity (0-1) for the ASCII shader. */
function getGlitchIntensity() {
  const wakeShock = Math.min(1, inhibitorWakeGlitchTimer / 0.3);
  return Math.max(getTransitionGlitchIntensity(), wakeShock);
}

function clearPresentationActors() {
  remoteSession.players = [];
  remoteFauna = [];
  remoteSentries = [];
  fixtureShipCandidates = [];
}

function spawnPresentationPortals(portals = []) {
  for (const portal of portals || []) {
    portalSystem.addPortal(portal.x, portal.y, {
      id: portal.id,
      type: portal.type,
      spawnTime: 0,
      lifespan: portal.lifespan ?? 120,
      finalInhibitor: portal.finalInhibitor === true,
      finalExfil: portal.finalExfil === true,
      guaranteedFinalExfil: portal.guaranteedFinalExfil === true,
    });
  }
}

/**
 * Load the title screen scene. Runs the title map as ambient background.
 */
function loadTitleScene() {
  rendererFixtureActive = false;
  activeRendererFixture = null;
  clearPresentationActors();
  loadScene(MAP_TITLE);
  spawnPresentationPortals(MAP_TITLE.fixturePortals);
  gamePhase = 'title';
  titleTimer = 0;
  hideHUD();
}

function loadRendererFixture(name) {
  const fixture = RENDERER_FIXTURES[name];
  if (!fixture) return false;

  rendererFixtureActive = true;
  activeRendererFixture = fixture;
  loadScene(fixture);
  spawnPresentationPortals(fixture.fixturePortals);
  for (const scav of fixture.fixtureScavengers || []) {
    const spawned = scavengerSystem.spawn(scav.x, scav.y, scav.archetype || 'drifter');
    spawned.facing = scav.facing ?? spawned.facing;
    spawned.vx = scav.vx ?? 0;
    spawned.vy = scav.vy ?? 0;
  }
  remoteSession.players = (fixture.fixtureRemotePlayers || []).map((player, index) => ({
    clientId: player.clientId || `fixture-remote-${index}`,
    wx: player.wx,
    wy: player.wy,
    vx: player.vx || 0,
    vy: player.vy || 0,
    status: player.status || 'alive',
    hullType: player.hullType || 'drifter',
  }));
  fixtureShipCandidates = (fixture.fixtureShipCandidates || []).map((candidate, index) => ({
    id: candidate.id || `ship-candidate-${index}`,
    wx: candidate.wx,
    wy: candidate.wy,
    vx: candidate.vx || 0,
    vy: candidate.vy || 0,
    facing: candidate.facing || 0,
    variant: candidate.variant || 'sprite-card',
    radius: candidate.radius || 0.040,
  }));
  remoteFauna = (fixture.fixtureFauna || []).map((f, index) => ({
    id: f.id || `fixture-fauna-${index}`,
    wx: f.wx,
    wy: f.wy,
    size: f.size || 2,
    kind: f.kind || f.type || 'fauna',
    type: f.type || f.kind || 'jelly',
    age: f.age || 1,
    lifespan: f.lifespan || 20,
    phase: f.phase || 0,
  }));
  remoteSentries = (fixture.fixtureSentries || []).map((s, index) => ({
    id: s.id || `fixture-sentry-${index}`,
    wx: s.wx,
    wy: s.wy,
    state: s.state || 'patrol',
    orbitAngle: s.orbitAngle || 0,
  }));
  inhibitorState = {
    phase: 0,
    waveId: 'inhibitor:phase-0',
    scheduledTime: 0,
    waveBudget: 0,
    entities: [],
    ecology: { counts: {}, reachedKinds: [], activeCount: 0 },
  };
  inhibitorWakeGlitchTimer = 0;
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

function abandonPausedRunToTitle() {
  if (pauseAbandonIntent({ remoteActive: remoteSession.active }) === 'return-title') {
    transitionToTitle();
    return;
  }
  triggerTransition(() => {
    void leaveRemoteSessionToHome().catch((error) => {
      console.error('[LBH] remote abandon failed:', error);
    }).finally(() => loadTitleScene());
  });
}

/**
 * Start a game on a specific map. Called from map select.
 */
function startGame(map, seed = null) {
  resetPhantomForNewSession();
  pauseResumeState = createPauseResumeState();
  resetRemoteForLocalGame(remoteSession);
  remoteFauna = [];
  remoteSentries = [];
  fixtureShipCandidates = [];
  rendererFixtureActive = false;
  activeRendererFixture = null;
  // Local-sim seed: use the previewed seed when one is supplied, otherwise
  // pick a fresh one. Same RNG primitives as the server so the previewed
  // signature/well names match what the local run actually uses.
  const localSeed = (seed != null && Number.isFinite(Number(seed)))
    ? Number(seed)
    : Math.floor(Math.random() * 1e9);
  const localRng = createRNGStreams(localSeed);
  loadScene(map, { seed: localSeed });

  // Local fallback presents the same seeded signature as authority would.
  currentSignature = computeSeedPreview(map, localSeed).signature;

  // Reset audio for new run
  audioRouter?.reset(`local:${localSeed}`);

  // Place ship in a safe spawn
  const [spawnX, spawnY] = findSafeSpawn();
  ship.teleport(spawnX, spawnY);
  camX = ship.wx;
  camY = ship.wy;

  // Apply hull stats (Heat and movement coefficients) + equipped-item
  // bonuses on top. Done once per run so the ship starts cool with the
  // right hull-relative propulsion profile.
  applyHullToShip();
  // Drop any leftover slingshot state from a previous run.
  if (slingshotSystem) slingshotSystem.cancel(ship);

  // Spawn scavengers at map edges (seeded)
  const scavRng = localRng.rawStream('localScavSpawn');
  const scavCount = CONFIG.scavengers.count;
  const vultureCount = Math.round(scavCount * CONFIG.scavengers.vultureRatio);
  for (let i = 0; i < scavCount; i++) {
    const archetype = i < vultureCount ? 'vulture' : 'drifter';
    const edge = Math.floor(scavRng() * 4);
    let sx, sy;
    if (edge === 0) { sx = scavRng() * WORLD_SCALE; sy = 0.1; }
    else if (edge === 1) { sx = scavRng() * WORLD_SCALE; sy = WORLD_SCALE - 0.1; }
    else if (edge === 2) { sx = 0.1; sy = scavRng() * WORLD_SCALE; }
    else { sx = WORLD_SCALE - 0.1; sy = scavRng() * WORLD_SCALE; }
    scavengerSystem.spawn(sx, sy, archetype);
  }

  gamePhase = 'playing';
  audioEngine.setContext('gameplay');
  showHUD();
}

/** Transition to gameplay with glitch effect. */
function transitionToGame(map, seed = null) {
  triggerTransition(() => startGame(map, seed));
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

function syncRemoteNetworkPerfStats() {
  const metrics = simClient?.getMetrics?.();
  if (!metrics) return;
  perfStats.remoteInputAckRttMs = metrics.lastInputAckRttMs;
  perfStats.remoteInputToSnapshotMs = metrics.lastInputToSnapshotMs;
  perfStats.remoteSnapshotLagMs = metrics.lastSnapshotLagMs;
  if (perfStats.remoteInputToSnapshotMs != null && perfStats.remotePresentationAgeMs != null) {
    perfStats.remoteInputToPresentationMs = perfStats.remoteInputToSnapshotMs + perfStats.remotePresentationAgeMs;
  }
}

function applyRemoteSnapshot(snapshot) {
  if (!snapshot) return;
  const classification = classifyRemoteSnapshot(remoteSession.snapshot, snapshot);
  if (classification.runChanged) {
    // A rematch can adopt a new run without returning through Map Select.
    // Reset presentation audio at that authority boundary so held voices and
    // ducking from the old run cannot leak into the new one.
    audioRouter?.reset(classification.incomingRunId);
    audioRouter?.setPhase('loading');
  }
  const covered = gamePhase === 'paused';
  if (covered) {
    const previousLatest = pauseResumeState.latestSnapshot;
    pauseResumeState = observePauseSnapshot(pauseResumeState, snapshot);
    if (previousLatest && previousLatest !== snapshot && pauseResumeState.latestSnapshot === previousLatest) return;
  }
  // Ability marks are presentation-only snapshot state. A missing field is a
  // clear, not permission to replay the previous remote ability indefinitely.
  localAbilityState = null;
  syncRemoteNetworkPerfStats();
  const duplicateSnapshot = classification.duplicate;
  // First snapshot received — transition from loading to playing
  if (gamePhase === 'loading') {
    gamePhase = 'playing';
    audioRouter?.setPhase('gameplay');
    showHUD();
  }
  const projected = projectRemoteSnapshot(snapshot, {
    clientId: simClient?.clientId,
    previousHealth: remoteSession.health,
    elapsedTime: simState.runElapsedTime,
  });
  const authoritativeMapId = projected.mapId;
  if (authoritativeMapId) {
    const authoritativeEntry = PLAYABLE_MAPS.find((entry) => entry.id === authoritativeMapId);
    if (!authoritativeEntry) {
      throw new Error(`Remote snapshot has unknown map id: ${authoritativeMapId}`);
    }
    const authoritativeWorldScale = projected.worldScale;
    if (Number.isFinite(authoritativeWorldScale)
      && authoritativeWorldScale !== authoritativeEntry.map.worldScale) {
      throw new Error(`Remote snapshot map scale mismatch: ${authoritativeMapId} is ${authoritativeEntry.map.worldScale}, got ${authoritativeWorldScale}`);
    }
    remoteSession.mapId = authoritativeEntry.id;
    setResolvedClientRunDuration(authoritativeMapId, projected.runDurationSeconds);
  }
  remoteSession.snapshot = snapshot;
  if (projected.cosmicSignature) {
    currentSignature = projected.cosmicSignature;
  }
  remoteSession.health = projected.health;
  simState.runElapsedTime = projected.elapsedTime;
  syncRemoteWorldState(projected.world);
  remoteSession.players = projected.remotePlayers;

  const localPlayer = projected.localPlayer;
  if (!localPlayer) return;

  if (!duplicateSnapshot) {
    updateRemoteShipTarget(localPlayer, snapshot);
  }

  applyRemoteInventoryShape(localPlayer);
  shieldActive = Boolean(localPlayer.effectState?.shieldCharges > 0);
  combatSystem.playerCooldown = Math.max(0, localPlayer.effectState?.pulseCooldownRemaining ?? 0);
  if (Number.isFinite(localPlayer.heatRatio)) {
    ship.deltaVMax = Math.max(1, Number(localPlayer.deltaVMax) || ship.deltaVMax);
    ship.setHeatRatio(localPlayer.heatRatio, {
      overheatRemaining: localPlayer.overheatRemaining,
    });
  } else if (Number.isFinite(localPlayer.deltaVMax) && Number.isFinite(localPlayer.deltaV)) {
    // Older authority snapshots are still readable during local development.
    ship.deltaVMax = localPlayer.deltaVMax;
    ship.setHeatRatio(1 - Math.max(0, Math.min(localPlayer.deltaVMax, localPlayer.deltaV)) / localPlayer.deltaVMax);
  }
  applyRemoteSlingshotState(localPlayer.slingshot);
  if (localPlayer.noise) {
    noiseState = {
      ...noiseState,
      audibleRadiusMeters: Number(localPlayer.noise.audibleRadiusMeters) || 0,
      trend: localPlayer.noise.trend || 'steady',
      currentSource: localPlayer.noise.currentSource || 'IDLE',
      dominantSource: localPlayer.noise.dominantSource || 'IDLE',
      heardListenerCount: Number(localPlayer.noise.heardListenerCount) || 0,
      trackedListenerCount: Number(localPlayer.noise.trackedListenerCount) || 0,
      lockedOnListenerCount: Number(localPlayer.noise.lockedOnListenerCount) || 0,
    };
  }
  localAbilityState = localPlayer.abilityState || null;
  if (projected.inhibitor) {
    inhibitorState = projected.inhibitor;
  }

  if (!covered && inputManager?.facing != null) {
    ship.setFacingDirect(inputManager.facing);
  }

  if (covered) {
    pauseResumeState = observePauseEvents(pauseResumeState, simClient?.consumeEvents?.() || [], {
      clientId: simClient?.clientId,
      runId: snapshotRunId(snapshot),
    });
  }

  if (!covered) {
    const liveEvents = simClient?.consumeEvents?.() || [];
    if (liveEvents.length > 0) {
      applyRemoteEvents(liveEvents);
    }
  }

  if (!covered) {
    const phase = authoritativePausePhase(snapshot, simClient?.clientId);
    if (phase === 'playing' && (gamePhase === 'dead' || gamePhase === 'loading')) {
      gamePhase = 'playing';
      deathTimer = 0;
      audioRouter?.setPhase('gameplay');
      showHUD();
    } else if (phase === 'dead' && gamePhase === 'playing') {
      gamePhase = 'dead';
      deathTimer = 0;
      freezeRunEnd(simState);
      ship.setThrust(false);
      markTerminalPresentation('dead');
      // The event stream normally owns the death cue. Snapshot phase is still
      // sufficient to stop the gameplay bed when that event was missed.
      audioRouter?.setPhase('dead');
    } else if (phase === 'escaped' && gamePhase === 'playing') {
      gamePhase = 'escaped';
      escapeTimer = 0;
      freezeRunEnd(simState);
      ship.setThrust(false);
      audioRouter?.setPhase('results');
      audioRouter?.local('results', { presentationId: `results:${performance.now()}` });
    }
  }
}

function applyRemoteSlingshotState(state) {
  if (!remoteSession.active || !state) return;
  ship.slingshotPhase = state.phase || state.telegraph?.phase || 'idle';
  ship.slingshotTelegraph = state.telegraph || null;
  ship.slingshotEngaged = Boolean(state.engaged);
  ship.slingshotEngageRadius = state.engageRadius || 0;
  ship.slingshotOrbitDir = state.orbitDir || 0;
  ship.slingshotAnchor = state.engaged ? {
    type: state.anchorType || 'well',
    wx: state.anchorWX,
    wy: state.anchorWY,
    range: state.anchorRange || 0,
    massWeight: 1,
  } : null;
}

function updateRemoteShipTarget(localPlayer, snapshot) {
  const result = rebaseLocalPlayerReconciliation(
    remoteSession.presentation || createLocalPlayerReconciliationState({
      brain: ship,
      worldScale: WORLD_SCALE,
      maxExtrapolationSeconds: REMOTE_PRESENTATION_EXTRAPOLATE_LIMIT,
    }),
    localPlayer,
    {
      runId: snapshot.runId || snapshot.session?.runId || null,
      now: performance.now(),
      brain: ship,
      worldScale: WORLD_SCALE,
      maxExtrapolationSeconds: REMOTE_PRESENTATION_EXTRAPOLATE_LIMIT,
      pendingInputs: simClient?.getPendingInputs?.() || [],
      acknowledgedSeq: localPlayer.lastInputSeq,
    },
  );
  remoteSession.presentation = result.state;
  if (result.hardReset) {
    ship.teleport(result.state.wx, result.state.wy);
    ship.vx = result.state.vx;
    ship.vy = result.state.vy;
  }
}

function updateRemoteShipPresentation(dt) {
  if (!remoteSession.active || !remoteSession.presentation) return;
  const now = performance.now();
  const elapsed = Math.min(
    REMOTE_PRESENTATION_EXTRAPOLATE_LIMIT,
    Math.max(0, (now - remoteSession.presentation.authority.receivedAt) / 1000),
  );
  perfStats.remotePresentationAgeMs = elapsed * 1000;
  syncRemoteNetworkPerfStats();
  const result = advanceLocalPlayerReconciliation(remoteSession.presentation, {
    dt,
    now,
    input: {
      moveX: inputManager.moveX,
      moveY: inputManager.moveY,
      thrust: inputManager.thrustIntensity,
      brake: inputManager.brakeIntensity,
    },
    pendingInputs: simClient?.getPendingInputs?.() || [],
    acknowledgedSeq: remoteSession.presentation.lastAcknowledgedSeq,
  });
  remoteSession.presentation = result.state;
  if (result.hardReset) ship.teleport(result.state.wx, result.state.wy);
  else {
    ship.wx = result.state.wx;
    ship.wy = result.state.wy;
  }
  ship.vx = result.state.vx;
  ship.vy = result.state.vy;
}

function currentRemoteControlState() {
  const selectedEntry = currentMapSelectEntry()?.available ? currentMapSelectEntry() : null;
  const session = remoteSession.health?.session ?? null;
  const hasLiveSession = session?.status === 'running'
    && Number(remoteSession.health?.idleState?.humanPlayerCount || 0) > 0;
  const liveEntry = hasLiveSession ? (getPlayableMapEntryById(session.mapId) || null) : null;
  const isHost = Boolean(hasLiveSession && simClient?.clientId && session?.hostClientId === simClient.clientId);
  return {
    enabled: Boolean(simClient?.enabled),
    loading: remoteSession.healthRequestInFlight,
    error: remoteSession.health?.ok === false ? remoteSession.health.error || 'remote health unavailable' : null,
    hasLiveSession,
    sessionStatus: session?.status ?? 'idle',
    sessionMapId: liveEntry?.id ?? session?.mapId ?? null,
    sessionMapName: liveEntry?.name ?? session?.mapId ?? null,
    sessionPlayerCount: remoteSession.health?.playerCount ?? 0,
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
  if (remoteSession.healthRequestInFlight) return remoteSession.health;
  if (!force && remoteSession.health && now - remoteSession.healthLastFetchedAt < 500) return remoteSession.health;
  remoteSession.healthRequestInFlight = true;
  remoteSession.healthLastFetchedAt = now;
  try {
    const health = await simClient.getHealth();
    remoteSession.health = {
      ok: true,
      session: health?.session ?? null,
      playerCount: health?.playerCount ?? 0,
      idleState: health?.idleState ?? null,
      tick: health?.tick ?? null,
      simTime: health?.simTime ?? null,
    };
    if (gamePhase === 'paused') pauseResumeState = observePauseConnection(pauseResumeState, true);
    return remoteSession.health;
  } catch (err) {
    remoteSession.health = {
      ok: false,
      error: err.message,
      session: null,
      playerCount: 0,
      idleState: null,
      tick: null,
      simTime: null,
    };
    if (gamePhase === 'paused') pauseResumeState = observePauseConnection(pauseResumeState, false);
    return remoteSession.health;
  } finally {
    remoteSession.healthRequestInFlight = false;
  }
}

function requestRemoteSnapshot() {
  if (!remoteSession.active || !simClient?.enabled || remoteSession.snapshotRequestInFlight) return;
  remoteSession.snapshotRequestInFlight = true;
  void simClient.pollSnapshot().then((snapshot) => {
    pauseResumeState = observePauseConnection(pauseResumeState, true);
    applyRemoteSnapshot(snapshot);
  }).catch((err) => {
    console.error('[LBH] remote snapshot failed:', err);
    pauseResumeState = observePauseConnection(pauseResumeState, false);
    remoteSession.health = {
      ...(remoteSession.health || {}),
      ok: false,
      error: err.message,
    };
  }).finally(() => {
    remoteSession.snapshotRequestInFlight = false;
  });
}

function renderFauna(ctx, camX, camY, canvasW, canvasH, time) {
  if (remoteFauna.length === 0) return;
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

// --- THE PHANTOM (client-only) ---
// See declaration near top of file for design notes.

function getPhantomRng() {
  if (phantomRng) return phantomRng;
  const seed = remoteSession.snapshot?.session?.seed ?? previewSeed ?? 1;
  phantomRng = createRNGStreams(seed).rawStream('phantom');
  return phantomRng;
}

function resetPhantomForNewSession() {
  phantomState = null;
  phantomNextEligibleAt = 0;
  phantomRng = null;
  phantomLastRollTick = -1;
  noiseState = {
    audibleRadiusMeters: 0,
    trend: 'steady',
    currentSource: 'IDLE',
    dominantSource: 'IDLE',
    heardListenerCount: 0,
    trackedListenerCount: 0,
    lockedOnListenerCount: 0,
  };
  audibleContactMemory.clear();
  resetRouteDiscovery();
  noiseRipples.length = 0;
}

function phantomEligibleZone(zone) {
  return Number(zone) >= NOISE_CONFIG.continuous.neutralMeters;
}

function tickPhantom(simTime, shipWX, shipWY, shipVX, shipVY, worldScale) {
  // If a phantom is already alive, age it and check proximity. Both of
  // these checks are time-based, not RNG-based, so they're safe to run
  // every frame without breaking determinism.
  if (phantomState) {
    const age = simTime - phantomState.bornAt;
    if (age >= phantomState.lifespan) {
      phantomState = null;
      // Schedule next eligibility window (45-90s, seeded)
      const rng = getPhantomRng();
      phantomNextEligibleAt = simTime + 45 + rng() * 45;
      return;
    }
    // Dissolve on player proximity (wrapped distance on the torus)
    const [pdx, pdy] = worldDisplacement(phantomState.wx, phantomState.wy, shipWX, shipWY);
    const dist = Math.hypot(pdx, pdy);
    if (dist < 0.14) {
      // The moment you look too closely, it isn't there.
      phantomState = null;
      const rng = getPhantomRng();
      phantomNextEligibleAt = simTime + 60 + rng() * 30;
      return;
    }
    return;
  }

  // No phantom alive — only ROLL on a quantized sim-time tick, not per
  // render frame. This keeps the phantom deterministic regardless of
  // display refresh rate or tab throttling. Same seed + same simTime
  // history = same phantom spawns.
  const currentTick = Math.floor(simTime / PHANTOM_ROLL_QUANTUM);
  if (currentTick === phantomLastRollTick) return;
  phantomLastRollTick = currentTick;

  if (simTime < phantomNextEligibleAt) return;
  if (!phantomEligibleZone(noiseState.audibleRadiusMeters)) return;

  // Seeded roll — advanced once per quantum.
  const rng = getPhantomRng();
  const weight = Math.min(0.015, Math.max(0,
    (noiseState.audibleRadiusMeters - NOISE_CONFIG.continuous.neutralMeters) * 0.00004));
  if (rng() > weight) return;

  // Spawn at the edge of sensor range, roughly opposite the player's motion
  const baseSensorRange = ship.brain?.sensorRange || CONFIG.ship?.sensorRange || 0.9;
  const sensorRangeMultiplier = remoteSession.active
    ? remoteSession.snapshot?.session?.sensorRangeMultiplier
    : 1;
  const sensorEdge = 0.9 * resolveClientSensorRange(baseSensorRange, {
    sensorRangeMultiplier,
  });
  const motionAngle = Math.atan2(shipVY, shipVX);
  const jitter = (rng() - 0.5) * 0.8; // ±0.4 rad
  const angle = motionAngle + Math.PI + jitter;
  const wx = (shipWX + Math.cos(angle) * sensorEdge + worldScale) % worldScale;
  const wy = (shipWY + Math.sin(angle) * sensorEdge + worldScale) % worldScale;
  const lifespan = 2.2 + rng() * 0.8; // 2.2-3.0s

  phantomState = { wx, wy, bornAt: simTime, lifespan };
}

function renderPhantom(ctx, camX, camY, canvasW, canvasH, simTime) {
  if (!phantomState) return;
  const age = simTime - phantomState.bornAt;
  const lifeFrac = age / phantomState.lifespan;
  // Fade in 0-0.25, hold 0.25-0.7, fade out 0.7-1.0
  let opacity;
  if (lifeFrac < 0.25) opacity = lifeFrac / 0.25;
  else if (lifeFrac < 0.7) opacity = 1.0;
  else opacity = Math.max(0, 1 - (lifeFrac - 0.7) / 0.3);
  if (opacity <= 0) return;

  const [sx, sy] = worldToScreen(phantomState.wx, phantomState.wy, camX, camY, canvasW, canvasH);
  if (sx < -40 || sx > canvasW + 40 || sy < -40 || sy > canvasH + 40) return;

  // Deep muted red. Deliberately close to invisible against the void.
  const base = opacity * 0.32;
  ctx.save();
  ctx.font = canvasFont(11);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Ship-like glyph cluster — 5 chars in a cross-shaped arrangement,
  // slightly drifting with a subtle bob to suggest ambient current.
  const bob = Math.sin(simTime * 0.8 + phantomState.bornAt) * 0.6;
  const cells = [
    { ch: '<', dx:  0, dy:  0 + bob },
    { ch: '=', dx: -7, dy:  0 + bob },
    { ch: '=', dx:  7, dy:  0 + bob },
    { ch: '·', dx: -4, dy: -6 + bob },
    { ch: '·', dx:  4, dy: -6 + bob },
  ];
  for (const c of cells) {
    ctx.fillStyle = `rgba(200, 60, 80, ${base.toFixed(3)})`;
    ctx.shadowColor = `rgba(200, 60, 80, ${(base * 0.7).toFixed(3)})`;
    ctx.shadowBlur = 4;
    ctx.fillText(c.ch, sx + c.dx, sy + c.dy);
  }
  ctx.restore();
}

function renderRemotePlayers(ctx, camX, camY, canvasW, canvasH) {
  if (!remoteSession.active || remoteSession.players.length === 0) return;
  ctx.save();
  for (let index = 0; index < remoteSession.players.length; index++) {
    const player = remoteSession.players[index];
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
      ctx.font = canvasFont(9);
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(180, 210, 255, 0.7)';
      ctx.fillText(player.name, sx, sy - 14);
      ctx.restore();
    }
  }
  ctx.restore();
}

function noiseCategory(source) {
  const value = String(source || 'NOISE').toUpperCase().trim();
  if (value === 'IDLE') return 'NOISE';
  if (value.startsWith('THRUST')) return value;
  if (['SALVAGE', 'IMPACT', 'PULSE', 'INHIBITOR', 'CREW', 'STATIC', 'CORRUPTION', 'EXFIL TONE', 'EXFIL', 'GLITCH', 'SWARM', 'VESSEL', 'VESSEL THRUST'].includes(value)) return value;
  return 'NOISE';
}

function contactKey(payload) {
  if (payload?.clientId) return `player:${payload.clientId}`;
  return `${noiseCategory(payload?.source)}:${Number(payload?.wx || 0).toFixed(3)}:${Number(payload?.wy || 0).toFixed(3)}`;
}

function observeAudibleContact(key, observation, nowSeconds) {
  if (!Number.isFinite(observation.wx) || !Number.isFinite(observation.wy)) return false;
  const distanceSimUnits = worldDistance(ship.wx, ship.wy, observation.wx, observation.wy);
  const [dx, dy] = worldDisplacement(ship.wx, ship.wy, observation.wx, observation.wy);
  const projection = projectAudibleContact({
    existing: audibleContactMemory.get(key),
    sourceWX: observation.wx,
    sourceWY: observation.wy,
    distanceSimUnits,
    bearingRadians: Math.atan2(dy, dx),
    emittedRadiusMeters: observation.radiusMeters,
    nowSeconds,
    category: noiseCategory(observation.source),
    sourceClass: observation.sourceClass,
    sourceKind: observation.sourceKind,
    cadenceSeconds: observation.cadenceSeconds,
    identificationFraction: NOISE_IDENTIFICATION_FRACTION,
    publicSourceClasses: NOISE_PUBLIC_SOURCE_CLASSES,
    fadeSeconds: NOISE_LAST_HEARD_FADE_SECONDS,
  });
  if (projection.contact) {
    projection.contact.id = key;
    audibleContactMemory.set(key, projection.contact);
  } else {
    audibleContactMemory.delete(key);
  }
  return true;
}

function resetRouteDiscovery(runId = null) {
  routeDiscoveryState = { runId: runId || null, exfilHeard: false };
}

function updateRouteDiscovery() {
  const runId = snapshotRunId(remoteSession.snapshot) || null;
  if (runId !== routeDiscoveryState.runId) resetRouteDiscovery(runId);
  if ([...audibleContactMemory.values()].some((contact) => contact.live
    && (contact.category === 'EXFIL TONE' || contact.category === 'EXFIL' || contact.identity === 'EXFIL'))) {
    routeDiscoveryState = { ...routeDiscoveryState, exfilHeard: true };
  }
  return routeDiscoveryState;
}

function updateAudibleContactMemory(nowSeconds) {
  const observedKeys = new Set();
  const observe = (key, observation) => {
    if (observeAudibleContact(key, observation, nowSeconds)) observedKeys.add(key);
  };
  if (remoteSession.active) {
    for (const player of remoteSession.players || []) {
      if (!player || player.clientId === simClient?.clientId) continue;
      const noise = player.noise || {};
      observe(`player:${player.clientId}`, {
        wx: player.wx,
        wy: player.wy,
        radiusMeters: noise.audibleRadiusMeters,
        source: noise.currentSource || noise.dominantSource,
        sourceClass: noise.sourceClass,
        sourceKind: 'player',
        cadenceSeconds: 0,
      });
    }
  }
  for (const emitter of remoteSession.snapshot?.world?.noiseEmitters || []) {
    observe(`world:${emitter.id}`, {
      wx: emitter.wx,
      wy: emitter.wy,
      radiusMeters: emitter.radiusMeters,
      source: emitter.source,
      sourceClass: emitter.sourceClass,
      sourceKind: emitter.sourceKind,
      cadenceSeconds: emitter.cadenceSeconds,
    });
  }
  if (!remoteSession.active) {
    const inhibitorNoise = NOISE_CONFIG.world?.inhibitor || {};
    for (const entity of inhibitorState.entities || []) {
      if (!entity || entity.lifecycle === 'expired') continue;
      const tuning = inhibitorNoise[entity.kind] || {};
      observe(`world:inhibitor:${entity.id}`, {
        wx: entity.position?.wx ?? entity.wx,
        wy: entity.position?.wy ?? entity.wy,
        radiusMeters: tuning.radiusMeters,
        source: tuning.category,
        sourceClass: tuning.sourceClass,
        sourceKind: 'inhibitor',
        cadenceSeconds: tuning.cadenceSeconds,
      });
    }
    const exfil = NOISE_CONFIG.world?.exfil || {};
    for (const portal of portalSystem?.portals || []) {
      if (!isExfilPortal(portal)) continue;
      observe(`world:exfil:${portal.id}`, {
        wx: portal.wx,
        wy: portal.wy,
        radiusMeters: exfil.radiusMeters,
        source: exfil.category,
        sourceClass: exfil.sourceClass,
        sourceKind: 'exfil',
        cadenceSeconds: exfil.cadenceSeconds,
      });
    }
  }
  reconcileUnobservedAudibleContacts(audibleContactMemory, observedKeys, nowSeconds, {
    fadeSeconds: NOISE_LAST_HEARD_FADE_SECONDS,
  });
  updateRouteDiscovery();
}

function applyRemoteEvents(events) {
  for (const event of acceptedRemoteEvents(events, remoteSession.lastEventSeq)) {
    // Advance immediately before presentation side effects. If a handler fails,
    // later events must remain recoverable from the authority event window.
    remoteSession.lastEventSeq = event.seq;
    const payload = event.payload || {};
    const isLocal = payload.clientId && payload.clientId === simClient?.clientId;
    audioRouter?.setClientId(simClient?.clientId);
    audioRouter?.authoritative(event, {
      camX,
      camY,
      canvasW: overlayCanvas.width,
      canvasH: overlayCanvas.height,
    });

    switch (event.type) {
      case 'noise.impulse':
        if (Number.isFinite(Number(payload.wx)) && Number.isFinite(Number(payload.wy))
          && Number(payload.radiusMeters) > 0) {
          noiseRipples.push({
            wx: Number(payload.wx),
            wy: Number(payload.wy),
            radiusMeters: Number(payload.radiusMeters),
            source: noiseCategory(payload.source),
            startedAt: simState.runElapsedTime,
          });
          while (noiseRipples.length > 12) noiseRipples.shift();
        }
        if (!isLocal) {
          observeAudibleContact(contactKey(payload), {
            wx: Number(payload.wx),
            wy: Number(payload.wy),
            radiusMeters: Number(payload.radiusMeters),
            source: payload.source,
            sourceClass: payload.sourceClass,
          }, simState.runElapsedTime);
        }
        break;
      case 'player.pulse':
        if (Number.isFinite(payload.wx) && Number.isFinite(payload.wy)) {
          combatSystem.spawnRemotePulseVisual(payload.wx, payload.wy, fluid, waveRings, wellSystem);
        }
        break;
      case 'player.effectUsed':
        if (!isLocal) break;
        if (payload.effectId === 'shieldBurst') {
          showWarning('shield active — survive one well contact', 'rgba(100, 200, 255, 0.95)', 3000);
        } else if (payload.effectId === 'breachFlare') {
          showWarning('breach flare — portal for 15s', 'rgba(255, 200, 100, 0.95)', 3000);
        }
        break;
      case 'player.shieldAbsorbed':
        if (isLocal) {
          showWarning('shield absorbed!', 'rgba(100, 200, 255, 0.95)', 2000);
        }
        break;
      case 'run.result':
        if (isLocal) {
          lastRunResult = payload;
        }
        break;
      case 'inhibitor.wake':
        // The Swarm is the irreversible wake. Direction still comes from
        // the edge-dim vignette, not a literal pointer.
        inhibitorWakeGlitchTimer = INHIBITOR_WAKE_GLITCH_DURATION;
        showInhibitorWarning('something is watching', 1, payload.intensity ?? 0.85, 3500);
        break;
      case 'inhibitor.glitchSpawned':
        showInhibitorWarning('STATIC CONTACT · GLITCH', 'glitch', 0.8, 2600, 'rgba(204, 26, 128, 0.88)');
        break;
      case 'inhibitor.swarmSpawned':
        showInhibitorWarning('CORRUPTION CONTACT · SWARM', 'swarm', 0.95, 3200);
        break;
      case 'inhibitor.vesselInbound':
        showInhibitorWarning('THRUST CONTACT · VESSEL', 'vessel', 1, 4000, 'rgba(255, 60, 140, 1.0)', { boost: 1.2 });
        break;
      case 'inhibitor.finalPortal':
        showWarning('final portal opened', 'rgba(255, 217, 102, 0.95)', 4000);
        break;
      case 'player.loot':
        // Echo wreck pickup — show the chronicle fragment as a warning
        // with accretion gold tint. The fragment is an unreliable voice
        // from a pilot who died in a past cycle on this seed.
        if (isLocal && payload.isEcho && payload.echoFragment) {
          const hull = payload.echoHullType || 'unknown';
          const name = payload.echoPilotName || 'unknown';
          appendRecentEcho({
            fragment: payload.echoFragment,
            pilotName: name,
            hullType: hull,
            deathCause: payload.echoDeathCause || null,
            survivalTime: payload.echoSurvivalTime || 0,
          });
          // Main fragment line
          showWarning(`"${payload.echoFragment}"`, 'rgba(255, 217, 102, 0.95)', 4200);
          // Attribution as a delayed second warning
          setTimeout(() => {
            if (gamePhase === 'playing') {
              showWarning(`— ${name}, ${hull}, cycle ended`, 'rgba(180, 160, 120, 0.7)', 2600);
            }
          }, 900);
        }
        break;
      case 'player.inventoryAction':
        if (!isLocal || !payload.itemName) break;
        if (payload.action === 'dropCargo') {
          showWarning(`dropped ${payload.itemName}`, 'rgba(255, 150, 80, 0.8)', 1500, { severity: 'loot' });
        } else if (payload.action === 'equipCargo') {
          showWarning(`equipped ${payload.itemName}`, 'rgba(255, 220, 120, 0.9)', 1400, { severity: 'loot' });
        } else if (payload.action === 'loadConsumable') {
          showWarning(`loaded ${payload.itemName}`, 'rgba(160, 220, 255, 0.9)', 1400, { severity: 'loot' });
        } else if (payload.action === 'unequip' || payload.action === 'unloadConsumable') {
          showWarning(`${payload.itemName} to cargo`, 'rgba(180, 180, 200, 0.9)', 1400, { severity: 'loot' });
        }
        break;
      case 'star.consumed':
        if (Array.isArray(payload.starColor) && typeof payload.starName === 'string') {
          const [cr, cg, cb] = payload.starColor;
          showWarning(`${payload.starName} consumed — stellar remnant!`, `rgba(${cr}, ${cg}, ${cb}, 0.95)`, 4000);
          _starFlashTimer = 0.8;
          _starFlashColor = payload.starColor;
        }
        break;
      case 'planetoid.consumed':
        break;
      case 'well.grew':
        break;
      case 'wave.announced': {
        const waveCopy = {
          'well-growth': 'gravity wave inbound',
          collapse: 'collapse wave inbound',
          inhibitor: 'inhibitor wake inbound',
        }[String(payload.cause || '')];
        if (waveCopy) showWarning(waveCopy, 'rgba(160, 236, 224, 0.94)', 1600);
        break;
      }
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
        break;
      default:
        break;
    }
  }
}

function applyRemoteInventoryAction(action) {
  if (!remoteSession.active || !simClient?.enabled || !action || remoteSession.inventoryRequestInFlight) return;
  remoteSession.inventoryRequestInFlight = true;
  void simClient.inventoryAction(action)
    .then((response) => {
      if (response?.snapshot) applyRemoteSnapshot(response.snapshot);
    })
    .catch((err) => {
      console.error('[LBH] remote inventory action failed:', err);
      showWarning('inventory action failed', 'rgba(255, 110, 110, 0.95)', 1800);
    })
    .finally(() => {
      remoteSession.inventoryRequestInFlight = false;
    });
}

function syncRemoteWorldState(world) {
  const patch = projectRemoteWorldPatch(world, {
    stars: starSystem.stars,
    scavengers: scavengerSystem.scavengers,
  });
  if (!patch) return;

  remoteSession.authoritativeField = patch.authoritativeField;

  if (Array.isArray(patch.waveRings)) {
    waveRings.rings = patch.waveRings;
  }

  if (Array.isArray(patch.wells)) {
    for (let i = 0; i < Math.min(patch.wells.length, wellSystem.wells.length); i++) {
      const remote = patch.wells[i];
      const local = wellSystem.wells[i];
      syncRemoteWellPresentation(local, remote);
    }
  }

  if (Array.isArray(patch.stars)) starSystem.stars = patch.stars;
  if (Array.isArray(patch.wrecks)) wreckSystem.wrecks = patch.wrecks;
  if (Array.isArray(patch.planetoids)) planetoidSystem.planetoids = patch.planetoids;
  if (Array.isArray(patch.portals)) {
    portalSystem.portals = patch.portals;
    portalSystem._nextWaveIndex = patch.nextPortalWaveIndex ?? portalSystem._nextWaveIndex;
  }
  if (Array.isArray(patch.scavengers)) scavengerSystem.scavengers = patch.scavengers;
  if (Array.isArray(patch.fauna)) remoteFauna = patch.fauna;
  if (Array.isArray(patch.sentries)) remoteSentries = patch.sentries;
}

async function startRemoteGame(mapEntry, { forceReset = false } = {}) {
  resetPhantomForNewSession();
  if (!simClient?.enabled) {
    if (RUNTIME_FLAGS.allowLegacySoloFallback) {
      console.warn('[LBH] legacy solo fallback enabled by explicit dev/sandbox gate');
      startGame(mapEntry.map, previewSeed);
      return;
    }
    throw new Error('local authority is required for this build');
  }

  const health = await refreshRemoteSessionHealth(true);
  const hasHumanPilot = Number(health?.idleState?.humanPlayerCount || 0) > 0;
  const runningSession = health?.session?.status === 'running' && hasHumanPilot
    ? health.session
    : null;
  const isHost = Boolean(runningSession?.hostClientId && runningSession.hostClientId === simClient.clientId);
  if (forceReset && runningSession && !isHost) {
    throw new Error('Only the host can reset the live cycle');
  }
  const targetMapEntry = runningSession
    ? (forceReset ? mapEntry : (getPlayableMapEntryById(runningSession.mapId) || mapEntry))
    : mapEntry;
  const startsFreshSelection = !runningSession || forceReset;

  rendererFixtureActive = false;
  pauseResumeState = createPauseResumeState();
  beginRemoteSession(remoteSession, targetMapEntry.id);
  fixtureShipCandidates = [];

  const briefingSeed = startsFreshSelection ? previewSeed : (runningSession?.seed ?? previewSeed);
  const briefingSignature = !startsFreshSelection && runningSession?.cosmicSignature
    ? { ...runningSession.cosmicSignature }
    : computeSeedPreview(targetMapEntry.map, briefingSeed).signature;
  remoteSession.launchSeed = briefingSeed;
  remoteSession.launchSignature = briefingSignature ? { ...briefingSignature } : null;
  loadScene(targetMapEntry.map, { seed: briefingSeed });
  currentSignature = briefingSignature;
  audioRouter?.reset(`remote:${targetMapEntry.id}:${briefingSeed}`);
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
    const startedSession = await simClient.startSession({
      mapId: mapEntry.id,
      worldScale: mapEntry.map.worldScale,
      maxPlayers: 4,
      // Pass the previewed seed so the server's initial state matches
      // what we just showed the player on map select.
      seed: previewSeed,
      requesterName: profileManager.active?.name || 'Pilot',
      requesterProfileId: profileManager.active?.id || null,
      requesterProfile: profileSnapshot,
    });
    if (startedSession?.mapId !== mapEntry.id) {
      throw new Error(`Remote session map mismatch: requested ${mapEntry.id}, got ${startedSession?.mapId || 'unknown'}`);
    }
    if (forceReset && runningSession) {
      const selectedMapName = mapEntry.map?.name || mapEntry.name || mapEntry.id;
      showWarning(`new cycle opened on ${selectedMapName.toLowerCase()}`, 'rgba(255, 210, 120, 0.95)', 2600);
    }
  } else if (runningSession.mapId !== mapEntry.id) {
    showWarning(`joining live cycle on ${targetMapEntry.name}`, 'rgba(140, 200, 255, 0.9)', 2400);
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
      resetRemoteAfterLaunchFailure(remoteSession);
      if (RUNTIME_FLAGS.allowLegacySoloFallback) {
        console.warn('[LBH] authority launch failed; using explicit dev/sandbox legacy solo fallback');
        startGame(mapEntry.map, previewSeed);
        return;
      }
      gamePhase = 'mapSelect';
      loadingMapName = '';
      showHUD();
      showWarning(authorityLaunchWarning(err), 'rgba(255, 100, 80, 0.95)', 8000);
    });
  });
}

async function leaveRemoteSessionToHome() {
  const activeProfileId = profileManager.active?.id || null;
  if (simClient?.enabled && remoteSession.active) {
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
  pauseResumeState = createPauseResumeState();
  resetRemoteAfterLeave(remoteSession);
}

async function restartRemoteSession(mapEntry = currentMapSelectEntry()) {
  const selectedEntry = mapEntry?.available
    ? mapEntry
    : getPlayableMapEntryById(remoteSession.mapId);
  if (!simClient?.enabled || !selectedEntry) return;
  // A restart is a fresh selected-route launch, not a reset of the prior
  // session configuration. startRemoteGame carries the selected map + preview
  // seed through the same authority handoff used by Map Select.
  await startRemoteGame(selectedEntry, { forceReset: true });
}

/**
 * Restart the map currently selected in the launch briefing as a fresh run.
 */
function restart() {
  const selectedEntry = currentMapSelectEntry();
  if (remoteSession.active && simClient?.enabled) {
    return restartRemoteSession(selectedEntry);
  }
  startGame(selectedEntry?.map || currentMap, previewSeed);
}

function applySceneCamera(dt) {
  if (currentCameraMode === 'locked') {
    const cx = currentMap.worldScale / 2;
    const cy = currentMap.worldScale / 2;
    // Title phase gets a subtle lissajous drift on top of the locked
    // center — traces a closed loop thanks to the two different
    // periods, keeps the frame alive without distracting from the
    // composition. Two separate sources (title vs. renderer fixture)
    // both sit on 'locked' maps, only the title actually drifts.
    if (gamePhase === 'title' && !rendererFixtureActive) {
      const layoutOffset = titleCameraOffsetForLayout();
      camX = cx + layoutOffset.x + Math.sin((totalTime / TITLE_CAMERA_DRIFT_PERIOD_X) * Math.PI * 2) * TITLE_CAMERA_DRIFT_AMPLITUDE;
      camY = cy + layoutOffset.y + Math.cos((totalTime / TITLE_CAMERA_DRIFT_PERIOD_Y) * Math.PI * 2) * TITLE_CAMERA_DRIFT_AMPLITUDE;
    } else {
      camX = cx;
      camY = cy;
    }
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
let _prevExtract = false;
let _prevPause = false;
let _prevBack = false;
let _prevUp = false;
let _prevDown = false;
let _prevLeft = false;
let _prevRight = false;
let _prevTabLeft = false;
let _prevTabRight = false;
let _prevDelete = false;
let _prevMute = false;
let _prevPulse = false;
let _prevInventory = false;
let _prevConsumable1 = false;
let _prevConsumable2 = false;
let _prevSlingshot = false;
let _prevSeedReroll = false;
let _prevPortalCount = -1;
let pauseMenuSelection = 0;  // 0 = return to game, 1 = abandon run
let pauseAbandonConfirm = false;

function neutralizeRemoteAuthorityInput() {
  if (!remoteSession.active || !simClient?.enabled || remoteSession.pauseNeutralizationInFlight) return;
  remoteSession.pauseNeutralizationInFlight = true;
  void simClient.sendInput({
    moveX: 0,
    moveY: 0,
    thrust: 0,
    brake: 0,
    slingshot: false,
    slingshotEdges: [],
    pulse: false,
    extractConfirm: false,
    ability1: false,
    ability2: false,
    consumeSlot: null,
  }).catch((err) => {
    console.error('[LBH] pause input neutralization failed:', err);
    pauseResumeState = observePauseConnection(pauseResumeState, false);
  }).finally(() => {
    remoteSession.pauseNeutralizationInFlight = false;
  });
}

function settlePausePresentationMotion() {
  transitionActive = false;
  transitionTimer = 0;
  transitionCallback = null;
  transitionFired = false;
  uiMotionPhase = gamePhase;
  uiMotionTimer = 999;
  uiFocusKey = currentUiFocusKey();
  uiFocusPulseTimer = 999;
}

function snapRemotePresentationToAuthority(snapshot) {
  const localPlayer = snapshot?.players?.find((player) => player.clientId === simClient?.clientId);
  if (!localPlayer) return false;
  const wx = Number(localPlayer.wx);
  const wy = Number(localPlayer.wy);
  if (!Number.isFinite(wx) || !Number.isFinite(wy)) return false;

  const result = rebaseLocalPlayerReconciliation(
    remoteSession.presentation || createLocalPlayerReconciliationState({
      brain: ship,
      worldScale: WORLD_SCALE,
      maxExtrapolationSeconds: REMOTE_PRESENTATION_EXTRAPOLATE_LIMIT,
    }),
    { ...localPlayer, wx, wy },
    {
      runId: snapshot.runId || snapshot.session?.runId || null,
      now: performance.now(),
      brain: ship,
      worldScale: WORLD_SCALE,
      maxExtrapolationSeconds: REMOTE_PRESENTATION_EXTRAPOLATE_LIMIT,
      pendingInputs: simClient?.getPendingInputs?.() || [],
      acknowledgedSeq: localPlayer.lastInputSeq,
      forceReset: true,
    },
  );
  remoteSession.presentation = result.state;
  ship.teleport(result.state.wx, result.state.wy);
  ship.vx = result.state.vx;
  ship.vy = result.state.vy;
  camX = wrapWorld(wx);
  camY = wrapWorld(wy);
  setFluidCamera(camX, camY);
  fluid?.clear();
  return true;
}

function applyCoveredTerminalEvents(decision) {
  const resumedRunId = decision?.snapshot?.runId || decision?.snapshot?.session?.runId || null;
  if (!resumedRunId || decision?.eventRunId !== resumedRunId) return;

  remoteSession.lastEventSeq = 0;
  const terminalRunId = decision?.terminalEvent?.runId
    || decision?.terminalEvent?.payload?.runId
    || null;
  if (terminalRunId === resumedRunId) applyRemoteEvents([decision.terminalEvent]);
  remoteSession.lastEventSeq = Math.max(remoteSession.lastEventSeq, decision?.eventWatermark || 0);
}

function applyPauseResumeDecision(decision) {
  if (decision.phase === 'dead') {
    gamePhase = 'dead';
    deathTimer = 0;
    freezeRunEnd(simState);
    ship.setThrust(false);
    markTerminalPresentation('dead');
    audioRouter?.setPhase('dead');
    return;
  }
  if (decision.phase === 'escaped') {
    gamePhase = 'escaped';
    escapeTimer = 0;
    freezeRunEnd(simState);
    ship.setThrust(false);
    audioRouter?.setPhase('results');
    audioRouter?.local('results', { presentationId: `results:${performance.now()}` });
    return;
  }
  if (decision.phase === 'recovery' || decision.rematched) {
    gamePhase = 'recovery';
    loadingMapName = 'cycle settling';
    audioRouter?.setPhase('loading');
    hideHUD();
    return;
  }

  gamePhase = 'playing';
  audioRouter?.setPhase('gameplay');
  audioRouter?.local('resume', { presentationId: `resume:${performance.now()}` });
  showHUD();
}

function resumeFromPause() {
  if (!remoteSession.active) {
    pauseResumeState = {
      ...pauseResumeState,
      covered: false,
      inputNeutralized: false,
    };
    gamePhase = 'playing';
    audioRouter?.setPhase('gameplay');
    audioRouter?.local('resume', { presentationId: `resume:${performance.now()}` });
    return;
  }

  const result = reconcilePauseResume(pauseResumeState, {
    now: performance.now(),
    snapshot: remoteSession.snapshot,
    playerId: simClient?.clientId,
    connectionOk: remoteSession.active
      ? pauseResumeState.connectionOk !== false && remoteSession.health?.ok !== false
      : true,
    longAwayThresholdMs: PAUSE_LONG_AWAY_THRESHOLD_MS,
  });
  pauseResumeState = result.state;
  const { decision } = result;

  if (remoteSession.active && decision.discardEvents) {
    applyCoveredTerminalEvents(decision);
  }
  applyPauseResumeDecision(decision);

  if (remoteSession.active && decision.longAway) {
    snapRemotePresentationToAuthority(decision.snapshot);
    inputManager.neutralizeForPause();
    settlePausePresentationMotion();
  } else if (decision.phase !== 'playing' || decision.rematched) {
    settlePausePresentationMotion();
  }
}

function togglePause() {
  if (gamePhase === 'playing') {
    pauseResumeState = enterPause(pauseResumeState, {
      now: performance.now(),
      snapshot: remoteSession.snapshot,
    });
    pauseResumeState = markPauseInputNeutralized(pauseResumeState);
    clearRemotePendingActions(remoteSession);
    inputManager.neutralizeForPause();
    neutralizeRemoteAuthorityInput();
    // UI bus stays audible while the gameplay bed attenuates.
    audioRouter?.local('pause', { presentationId: `pause:${performance.now()}` });
    gamePhase = 'paused';
    audioRouter?.setPhase('paused');
    pauseMenuSelection = 0;  // default to "return to game"
    pauseAbandonConfirm = false;
    ship.setThrust(false);
  } else if (gamePhase === 'paused') {
    pauseAbandonConfirm = false;
    resumeFromPause();
  }
}

// ---- Consumable effect dispatch ----

// ---- Terminal UI helpers ----

function titleLoopTime(time) {
  return ((time % TITLE_ATTRACT_LOOP_SECONDS) + TITLE_ATTRACT_LOOP_SECONDS) % TITLE_ATTRACT_LOOP_SECONDS;
}

function smoothstep(edge0, edge1, value) {
  const t = Math.max(0, Math.min(1, (value - edge0) / Math.max(0.0001, edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function titleNoise(value) {
  const raw = Math.sin(value * 127.1 + 311.7) * 43758.5453123;
  return raw - Math.floor(raw);
}

function titleGlitchState(time) {
  const cycle = Math.floor(time / TITLE_GLITCH_PERIOD);
  const local = time - cycle * TITLE_GLITCH_PERIOD;
  const gate = titleNoise(cycle + 0.17);
  if (gate < 0.38) return { active: 0, seed: cycle, amount: 0 };

  const offset = 0.12 + titleNoise(cycle + 2.3) * 0.72;
  const age = local - offset;
  if (age < 0 || age > TITLE_GLITCH_WINDOW) return { active: 0, seed: cycle, amount: 0 };

  const attack = smoothstep(0, 0.045, age);
  const release = 1 - smoothstep(TITLE_GLITCH_WINDOW * 0.34, TITLE_GLITCH_WINDOW, age);
  const active = attack * release;
  return {
    active,
    seed: cycle * 31,
    amount: 0.22 + active * 0.62,
  };
}

function normalizeTitleLayout(value) {
  const key = String(value || TITLE_LAYOUT_DEFAULT).trim().toLowerCase();
  return TITLE_LAYOUT_IDS.has(key) ? key : TITLE_LAYOUT_DEFAULT;
}

function titleLayoutMetrics(w, h, layoutName = titleLayout) {
  const layout = normalizeTitleLayout(layoutName);
  return titleSurfaceLayout(w, h, layout);
}

function titleCameraOffsetForLayout(layoutName = titleLayout) {
  const layout = normalizeTitleLayout(layoutName);
  // The comparison layout keeps the UI left and pans the camera left, which
  // leaves the larger title well visible on the opposite side of the frame.
  if (layout === 'opposite-left') return { x: -TITLE_OPPOSITE_WELL_CAMERA_OFFSET, y: 0.03 };
  return { x: 0, y: 0 };
}

function isTitleBackdropActive() {
  const mapName = String(currentMap?.name || '').toLowerCase();
  return gamePhase === 'title' || mapName.includes('title');
}

function titleAttractState(time) {
  return sampleTitleAttractState(titleLoopTime(time));
}

function updateTitleAttractScene() {
  if (rendererFixtureActive || gamePhase !== 'title' || !titleScenePresentation) return;
  // Menus have no gameplay clock. The presentation owner applies the authored
  // attract loop directly to its title-local portal fixture.
  titleScenePresentation.applyAttractState({
    portalId: TITLE_RIFT_ID,
    loopTime: titleLoopTime(totalTime),
  });
}

function drawTitleTextMatte(ctx, rect, alpha = 1) {
  const { x, y, w: width, h: height, align = 'center' } = rect;
  const gradient = ctx.createLinearGradient(x, 0, x + width, 0);
  if (align === 'left') {
    gradient.addColorStop(0, withAlpha('#000421', 0.82 * alpha));
    gradient.addColorStop(0.62, withAlpha('#000421', 0.82 * alpha));
    gradient.addColorStop(1, withAlpha('#000421', 0));
  } else if (align === 'right') {
    gradient.addColorStop(0, withAlpha('#000421', 0));
    gradient.addColorStop(0.38, withAlpha('#000421', 0.82 * alpha));
    gradient.addColorStop(1, withAlpha('#000421', 0.82 * alpha));
  } else {
    gradient.addColorStop(0, withAlpha('#000421', 0));
    gradient.addColorStop(0.14, withAlpha('#000421', 0.72 * alpha));
    gradient.addColorStop(0.5, withAlpha('#000421', 0.88 * alpha));
    gradient.addColorStop(0.86, withAlpha('#000421', 0.72 * alpha));
    gradient.addColorStop(1, withAlpha('#000421', 0));
  }

  ctx.save();
  ctx.fillStyle = gradient;
  ctx.fillRect(x, y, width, height);
  ctx.strokeStyle = roleColor('flow', 0.18 * alpha);
  ctx.beginPath();
  ctx.moveTo(x + width * 0.12, y);
  ctx.lineTo(x + width * 0.88, y);
  ctx.moveTo(x + width * 0.18, y + height);
  ctx.lineTo(x + width * 0.82, y + height);
  ctx.stroke();
  drawCornerFrame(ctx, { x: x + width * 0.06, y: y + 8, w: width * 0.88, h: height - 16 }, {
    role: 'flow',
    alpha: 0.28 * alpha,
    length: 26,
  });
  ctx.restore();
}

function drawTitleStatusLine(ctx, anchorX, y, width, text, role, time, { align = 'center' } = {}) {
  const pulse = 0.72 + 0.18 * Math.sin(time * 2.4);
  const x = align === 'right' ? anchorX - width : align === 'left' ? anchorX : anchorX - width / 2;
  const textX = align === 'right' ? x + width : align === 'left' ? x : x + width / 2;
  const railY = y + 13;
  ctx.save();
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.font = canvasFont(10, { weight: '700' });
  ctx.fillStyle = roleColor(role, 0.64 + 0.18 * pulse);
  ctx.shadowColor = roleColor(role, 0.42);
  ctx.shadowBlur = 8;
  ctx.fillText(fitUiText(ctx, `attractor telemetry // ${text}`.toUpperCase(), width), textX, y - 1);
  ctx.shadowBlur = 0;
  ctx.strokeStyle = roleColor(role, 0.26 * pulse);
  ctx.beginPath();
  ctx.moveTo(x, railY);
  ctx.lineTo(x + width, railY);
  ctx.stroke();
  ctx.restore();
}

function titleObjectDisplayName(source, fallback) {
  const raw = String(source?.name || source?.id || fallback || 'SIGNATURE').trim();
  return raw
    .replace(/^title[-_ ]?/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function titleObjectKindLabel(kind) {
  return String(kind || 'signature')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_]+/g, ' ')
    .trim()
    .toUpperCase();
}

function titleNavFix(wx, wy) {
  const x = Math.round((wrapWorld(wx) / WORLD_SCALE) * 999);
  const y = Math.round((wrapWorld(wy) / WORLD_SCALE) * 999);
  return `NAV ${String(x).padStart(3, '0')}:${String(y).padStart(3, '0')}`;
}

function titleTelemetryOverlapsPanel(sx, sy, layout) {
  return sx > layout.panelX - 42
    && sx < layout.panelX + layout.panelW + 42
    && sy > layout.panelY - 34
    && sy < layout.panelY + layout.panelH + 34;
}

function drawTitleTelemetryLabel(ctx, item, index, w, h, time) {
  const side = item.sx > w * 0.58 ? -1 : 1;
  const lineAlpha = item.alpha * (0.76 + 0.12 * Math.sin(time * 1.7 + index));
  const labelX = Math.max(28, Math.min(w - 28, item.sx + side * (26 + (index % 3) * 8)));
  const labelY = Math.max(34, Math.min(h - 34, item.sy + ((index % 2 === 0) ? -24 : 28)));
  const align = side < 0 ? 'right' : 'left';
  const textX = align === 'right' ? labelX - 8 : labelX + 8;
  const maxWidth = Math.min(190, Math.max(120, side < 0 ? labelX - 34 : w - labelX - 34));

  ctx.save();
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.font = canvasFont(9, { weight: '700' });
  const name = fitUiText(ctx, item.name.toUpperCase(), maxWidth);
  ctx.font = canvasFont(8);
  const meta = fitUiText(ctx, `${item.kind} // ${item.fix}`, maxWidth);
  const measured = Math.max(
    ctx.measureText(name).width,
    ctx.measureText(meta).width,
    58,
  );
  const boxW = Math.min(maxWidth + 18, measured + 20);
  const boxX = align === 'right' ? textX - boxW + 8 : textX - 8;
  const boxY = labelY - 18;

  ctx.fillStyle = withAlpha('#000421', 0.42 * item.alpha);
  ctx.fillRect(boxX, boxY, boxW, 29);
  ctx.strokeStyle = roleColor(item.role, 0.22 * item.alpha);
  ctx.strokeRect(boxX, boxY, boxW, 29);
  ctx.strokeStyle = roleColor(item.role, 0.30 * lineAlpha);
  ctx.beginPath();
  ctx.moveTo(item.sx, item.sy);
  ctx.lineTo(labelX, labelY - 7);
  ctx.stroke();
  ctx.fillStyle = roleColor(item.role, 0.88 * lineAlpha);
  ctx.beginPath();
  ctx.arc(item.sx, item.sy, 2.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = canvasFont(9, { weight: '700' });
  ctx.fillStyle = roleColor(item.role, 0.88 * item.alpha);
  ctx.fillText(name, textX, labelY - 5);
  ctx.font = canvasFont(8);
  ctx.fillStyle = roleColor('muted', 0.64 * item.alpha);
  ctx.fillText(meta, textX, labelY + 7);
  ctx.restore();
}

function drawTitleObjectTelemetry(ctx, w, h, time, layout, reveal = 1) {
  const items = [];
  const revealAlpha = Math.max(0, Math.min(1, reveal));
  const add = (wx, wy, name, kind, role, priority = 10, alpha = 0.72) => {
    if (!Number.isFinite(wx) || !Number.isFinite(wy)) return;
    const [sx, sy] = worldToScreen(wx, wy, camX, camY, w, h);
    if (sx < 22 || sx > w - 22 || sy < 22 || sy > h - 22) return;
    if (titleTelemetryOverlapsPanel(sx, sy, layout)) return;
    items.push({
      sx,
      sy,
      name,
      kind,
      role,
      priority,
      alpha: alpha * revealAlpha,
      fix: titleNavFix(wx, wy),
    });
  };

  (starSystem?.stars || [])
    .filter((star) => star.alive !== false)
    .slice(0, 4)
    .forEach((star, index) => {
      add(star.wx, star.wy, titleObjectDisplayName(star, `star ${index + 1}`), titleObjectKindLabel(star.type || 'star core'), 'salvage', 2 + index, 0.70);
    });

  (wreckSystem?.wrecks || [])
    .filter((wreck) => wreck.alive !== false)
    .slice(0, 4)
    .forEach((wreck, index) => {
      const kind = `${titleObjectKindLabel(wreck.type || 'derelict')} SIGNATURE`;
      add(wreck.wx, wreck.wy, titleObjectDisplayName(wreck, `derelict ${index + 1}`), kind, 'text', 4 + index, 0.66);
    });

  (portalSystem?.portals || [])
    .filter((portal) => portal.alive !== false && (portal.opacity ?? 1) > 0.08)
    .slice(0, 2)
    .forEach((portal, index) => {
      add(portal.wx, portal.wy, titleObjectDisplayName(portal, 'rift aperture'), 'APERTURE DECAY', 'anomaly', 1 + index, 0.82);
    });

  (planetoidSystem?.planetoids || [])
    .filter((body) => body.alive !== false)
    .slice(0, 3)
    .forEach((body, index) => {
      add(body.wx, body.wy, titleObjectDisplayName(body, `orbit body ${index + 1}`), 'ORBITAL TRACK', 'flow', 8 + index, 0.58);
    });

  const placed = [];
  for (const item of items.sort((a, b) => a.priority - b.priority)) {
    // Telemetry is environmental flavor, not a catalog. Nearby contacts share
    // one readable label instead of forming an illegible stack over the fabric.
    const crowded = placed.some((other) => (
      Math.abs(item.sx - other.sx) < 118 && Math.abs(item.sy - other.sy) < 42
    ));
    if (crowded) continue;
    placed.push(item);
    if (placed.length >= 6) break;
  }
  placed.forEach((item, index) => drawTitleTelemetryLabel(ctx, item, index, w, h, time));
}

function selectTitleFont(ctx, cleanTitle, layout) {
  let titleFontSize = layout.titleFontSize;
  do {
    ctx.font = canvasFont(titleFontSize, { role: 'display', weight: '800' });
    if (ctx.measureText(cleanTitle).width <= layout.textWidth || titleFontSize <= 44) break;
    titleFontSize -= 2;
  } while (titleFontSize > 44);
  return titleFontSize;
}

function titleTextStartX(ctx, text, layout) {
  const width = ctx.measureText(text).width;
  if (layout.align === 'right') return layout.textX - width;
  if (layout.align === 'center') return layout.textX - width / 2;
  return layout.textX;
}

function titleGlitchForVfx(time, fixtureVfx = null) {
  const titleVfx = fixtureVfx?.titleGlyphFault;
  if (titleVfx) {
    const heavy = titleVfx === 'heavy' || titleVfx.heavy === true;
    return {
      active: heavy ? 1 : 0.82,
      seed: heavy ? 9107 : 4103,
      amount: heavy ? 0.96 : 0.72,
      heavy,
      forced: true,
    };
  }
  return titleGlitchState(time);
}

function collectTitleGlyphFaultEvents(ctx, cleanTitle, corruptedTitle, layout, time, glitchState = {}) {
  const cleanGlyphs = Array.from(cleanTitle);
  const corruptedGlyphs = Array.from(corruptedTitle);
  const titleFontSize = selectTitleFont(ctx, cleanTitle, layout);
  const faultAlpha = Math.max(0, Math.min(1, glitchState.active || 0));
  const bucket = Math.floor(time * (10 + (glitchState.amount || 0) * 18));
  const events = [];
  let x = titleTextStartX(ctx, cleanTitle, layout);

  for (let i = 0; i < cleanGlyphs.length; i++) {
    const cleanGlyph = cleanGlyphs[i];
    const faultGlyph = corruptedGlyphs[i] || cleanGlyph;
    const advance = ctx.measureText(cleanGlyph).width;
    if (faultGlyph !== cleanGlyph) {
      const event = titleGlyphFaultEvent({
        eventId: `title:${glitchState.seed || 0}:${i}:${bucket}:${glitchState.heavy ? 'heavy' : 'normal'}`,
        glyph: faultGlyph,
        cleanGlyph,
        screenX: x + advance / 2,
        screenY: layout.titleY,
        glyphWidth: advance,
        glyphHeight: titleFontSize,
        intensity: faultAlpha,
        seed: `title-${glitchState.seed || 0}-${i}-${bucket}`,
        heavy: glitchState.heavy === true,
      });
      if (event) events.push(event);
    }
    x += advance;
  }

  return events;
}

function collectTitleVfxEvents(ctx, w, h, time, {
  fixtureVfx = null,
  layoutName = titleLayout,
} = {}) {
  if (currentUiMotionSettings().reducedMotion) return [];
  const glitchState = titleGlitchForVfx(time, fixtureVfx);
  if ((glitchState.active || 0) <= 0.01) return [];
  const layout = titleLayoutMetrics(w, h, layoutName);
  const cleanTitle = 'LAST SINGULARITY';
  selectTitleFont(ctx, cleanTitle, layout);
  const glitchTitle = corruptGlyphText(cleanTitle, glitchState.amount, `title-burst-${glitchState.seed}`, {
    density: glitchState.forced ? 1.0 : 0.92,
    frequencyHz: 9 + glitchState.amount * 24,
    time,
    maxChars: cleanTitle.length,
    glyphs: TITLE_GLITCH_GLYPHS,
  });
  return collectTitleGlyphFaultEvents(ctx, cleanTitle, glitchTitle, layout, time, glitchState);
}

function drawTitleCorruptionOverlay(ctx, cleanTitle, corruptedTitle, layout, time, alpha) {
  const cleanGlyphs = Array.from(cleanTitle);
  const corruptedGlyphs = Array.from(corruptedTitle);
  let x = titleTextStartX(ctx, cleanTitle, layout);
  const faultAlpha = Math.max(0, Math.min(1, alpha));

  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.shadowBlur = 10 + 14 * faultAlpha;
  ctx.shadowColor = roleColor('inhibitor', 0.7 * faultAlpha);

  for (let i = 0; i < cleanGlyphs.length; i++) {
    const cleanGlyph = cleanGlyphs[i];
    const faultGlyph = corruptedGlyphs[i] || cleanGlyph;
    const advance = ctx.measureText(cleanGlyph).width;

    if (faultGlyph !== cleanGlyph) {
      const noise = titleNoise(time * 19.7 + i * 3.91);
      const pulse = 0.62 + 0.38 * Math.sin(time * (17 + noise * 26) + i);
      const jitterX = (titleNoise(time * 43.1 + i * 5.37) - 0.5) * 3.4 * faultAlpha;
      const jitterY = (titleNoise(time * 37.9 + i * 4.19) - 0.5) * 2.4 * faultAlpha;
      ctx.fillStyle = roleColor('inhibitor', (0.46 + 0.42 * pulse) * faultAlpha);
      ctx.fillText(faultGlyph, x + jitterX, layout.titleY + jitterY);

      if (faultAlpha > 0.45 && noise > 0.56) {
        ctx.fillStyle = roleColor('flow', 0.12 * faultAlpha);
        ctx.fillText(cleanGlyph, x - jitterX * 0.7, layout.titleY + 1);
      }
    }

    x += advance;
  }

  ctx.restore();
}

function drawTitleScreenOverlay(ctx, w, h, time, readyTimer) {
  const layout = titleLayoutMetrics(w, h);
  const titleState = titleAttractState(time);
  const motion = currentUiMotionSettings();
  const matteReveal = motionProgress(readyTimer, {
    delay: 0.04,
    duration: motion.panelDuration,
    reducedMotion: motion.reducedMotion,
  });
  const titleReveal = motionProgress(readyTimer, {
    delay: 0.12,
    duration: 0.5,
    reducedMotion: motion.reducedMotion,
  });
  const textReveal = motionProgress(readyTimer, {
    delay: 0.36,
    duration: motion.textDuration,
    reducedMotion: motion.reducedMotion,
  });
  const statusReveal = motionProgress(readyTimer, {
    delay: 0.62,
    duration: 0.45,
    reducedMotion: motion.reducedMotion,
  });
  const telemetryReveal = motionProgress(readyTimer, {
    delay: 0.72,
    duration: 0.6,
    reducedMotion: motion.reducedMotion,
  });
  const readyAlpha = Math.max(0, Math.min(1, (readyTimer - 0.35) / 0.45));
  const promptPulse = 0.76 + 0.24 * (0.5 + 0.5 * Math.sin(time * 3.0));
  const cleanTitle = 'LAST SINGULARITY';
  const glitchState = titleGlitchState(time);

  ctx.save();
  ctx.textAlign = layout.align;
  ctx.textBaseline = 'alphabetic';

  drawUiScanlines(ctx, w, h, 0.018, 5);
  drawTitleObjectTelemetry(ctx, w, h, time, layout, telemetryReveal);
  if (titleEnvironmentCaptureOnly) {
    ctx.restore();
    return;
  }
  drawTitleTextMatte(ctx, {
    x: layout.panelX,
    y: layout.panelY,
    w: layout.panelW,
    h: layout.panelH,
    align: layout.align,
  }, matteReveal);

  ctx.shadowColor = roleColor('flow', 0.48);
  ctx.shadowBlur = 26;
  selectTitleFont(ctx, cleanTitle, layout);
  ctx.fillStyle = roleColor('text', 0.20 * titleReveal);
  ctx.fillText(cleanTitle, layout.textX, layout.titleY);

  const baseJitterX = glitchState.active > 0 ? Math.sin(time * 81.0) * 0.45 * glitchState.active : 0;
  const baseJitterY = glitchState.active > 0 ? Math.cos(time * 67.0) * 0.32 * glitchState.active : 0;
  ctx.fillStyle = roleColor('bone', 0.96 * titleReveal);
  ctx.fillText(cleanTitle, layout.textX + baseJitterX, layout.titleY + baseJitterY);

  if (!motion.reducedMotion && titleReveal > 0.2 && glitchState.active > 0.01) {
    const glitchTitle = corruptGlyphText(cleanTitle, glitchState.amount, `title-burst-${glitchState.seed}`, {
      density: 0.92,
      frequencyHz: 9 + glitchState.amount * 24,
      time,
      maxChars: cleanTitle.length,
      glyphs: TITLE_GLITCH_GLYPHS,
    });
    // The title text stays clean; corruption is a per-glyph UI fault overlay
    // whose unstable slots and swap rate rise with the burst intensity.
    drawTitleCorruptionOverlay(ctx, cleanTitle, glitchTitle, layout, time, glitchState.active * titleReveal);
  }

  ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
  ctx.shadowBlur = 14;
  ctx.font = canvasFont(17, { weight: '700' });
  ctx.fillStyle = roleColor('flow', 0.94 * textReveal);
  ctx.fillText(fitUiText(ctx, typeOnText('out of a dying universe', {
    time: readyTimer,
    delay: 0.42,
    duration: 0.55,
    reducedMotion: motion.reducedMotion,
  }), layout.textWidth), layout.textX, layout.titleY + 42);
  ctx.font = canvasFont(13);
  ctx.fillStyle = roleColor('text', 0.78 * textReveal);
  ctx.fillText(fitUiText(ctx, typeOnText('read the current. find an aperture.', {
    time: readyTimer,
    delay: 0.64,
    duration: 0.72,
    reducedMotion: motion.reducedMotion,
  }), layout.textWidth), layout.textX, layout.titleY + 67);

  if (statusReveal > 0) {
    ctx.save();
    ctx.globalAlpha *= statusReveal;
    drawTitleStatusLine(ctx, layout.textX, layout.titleY + 102, layout.statusW, typeOnText(titleState.story, {
      time: readyTimer,
      delay: 0.86,
      duration: 0.8,
      reducedMotion: motion.reducedMotion,
    }), titleState.role, time, {
      align: layout.align,
    });
    ctx.restore();
  }

  if (readyAlpha > 0) {
    drawCommandButtonMotion(ctx, layout.commandRect, 'select pilot', {
      // The title command owns selection; the footer retains only exit.
      action: null,
      role: 'flow',
      active: true,
      alpha: readyAlpha * promptPulse,
      progress: readyAlpha,
      pulseTime: (time % 1.45) / 1.45,
      reducedMotion: motion.reducedMotion,
      commandPulse: motion.commandPulse,
    });
    drawActionFooter(ctx, layout.footerRect.x, layout.footerRect.y, [
      { descriptor: actionDescriptor('quit', currentPromptOptions()), verb: 'exit' },
    ], { alpha: 0.86, gap: 14, maxWidth: layout.footerRect.w, backing: true, backingRole: 'flow' });
  }

  ctx.shadowBlur = 0;
  ctx.fillStyle = withAlpha('#000421', 0.42 * textReveal);
  ctx.fillRect(layout.versionRect.x, layout.versionRect.y, layout.versionRect.w, layout.versionRect.h);
  ctx.strokeStyle = roleColor('flow', 0.12 * textReveal);
  ctx.strokeRect(layout.versionRect.x, layout.versionRect.y, layout.versionRect.w, layout.versionRect.h);
  ctx.fillStyle = roleColor('muted', 0.46 * textReveal);
  ctx.font = canvasFont(10);
  ctx.textAlign = 'center';
  ctx.fillText('survey terminal v0.3', layout.versionRect.x + layout.versionRect.w / 2, layout.versionRect.y + 16);
  ctx.restore();
}

/**
 * Velocity readout drawn directly under the ship sprite. Shows current
 * speed magnitude + a tiny direction arrow. Color tier names the speed
 * class so the player has a vocabulary for "I'm cruising" vs "I'm in
 * surge territory" without needing to read exact numbers. Sits inside
 * the camera so it always tracks the ship — the ship is the reference
 * frame, the speed is its property, the readout sits with it.
 */
function renderShipVelocityReadout(ctx, ship, camX, camY, canvasW, canvasH) {
  const [sx, sy] = worldToScreen(ship.wx, ship.wy, camX, camY, canvasW, canvasH);
  const slot = getShipLocalLabelSlots({ shipX: sx, shipY: sy, canvasW, canvasH }).velocity;
  const speed = Math.hypot(ship.vx, ship.vy);
  let tierLabel;
  let color;
  if (speed < 0.2)       { tierLabel = 'drift';    color = 'rgba(120, 180, 200, 0.75)'; }
  else if (speed < 0.6)  { tierLabel = 'cruise';   color = 'rgba(220, 230, 240, 0.85)'; }
  else if (speed < 1.5)  { tierLabel = 'surge';    color = 'rgba(240, 200, 110, 0.95)'; }
  else                   { tierLabel = 'perilous'; color = 'rgba(240, 80, 80, 0.95)'; }

  ctx.save();
  ctx.font = canvasFont(11);
  ctx.textAlign = 'center';
  ctx.fillStyle = color;
  // Speed line directly below ship — far enough not to overlap the
  // ship sprite at typical sizes.
  const speedTxt = `${speed.toFixed(2)} · ${tierLabel}`;
  ctx.fillText(speedTxt, slot.textX, slot.textY);

  // Tiny direction arrow above the readout. Useful at high speed when
  // the ship icon's facing might not match velocity direction (drift,
  // post-slingshot, current pushing sideways).
  if (speed > 0.05) {
    const ang = Math.atan2(ship.vy, ship.vx);
    const arrowLen = 10;
    const aX = sx;
    const aY = slot.bounds.y + 4;
    const tipX = aX + Math.cos(ang) * arrowLen;
    const tipY = aY + Math.sin(ang) * arrowLen;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.moveTo(aX, aY);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();
    // Small arrowhead.
    const headSize = 3;
    const left = ang + Math.PI - 0.4;
    const right = ang + Math.PI + 0.4;
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(tipX + Math.cos(left) * headSize, tipY + Math.sin(left) * headSize);
    ctx.lineTo(tipX + Math.cos(right) * headSize, tipY + Math.sin(right) * headSize);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }
  ctx.restore();
}

function renderShipHeatInstrument(ctx, ship, camX, camY, canvasW, canvasH) {
  const heatState = ship?.getHeatState?.() || {};
  const display = resolveHeatInstrumentState({
    heatRatio: ship?.getHeatRatio?.(),
    overheatRemaining: heatState.overheatRemaining,
    epsilon: HEAT_DISPLAY_EPSILON,
  });
  if (!display.visible) return;
  const { ratio, overheatRemaining } = display;
  const [sx, sy] = worldToScreen(ship.wx, ship.wy, camX, camY, canvasW, canvasH);
  const slot = getShipLocalLabelSlots({ shipX: sx, shipY: sy, canvasW, canvasH }).heat;
  const width = Math.min(92, slot.barW);
  const left = slot.barX + (slot.barW - width) / 2;
  const top = slot.textY;
  const color = overheatRemaining > 0
    ? roleColor('danger', 0.95)
    : ratio >= 0.75 ? roleColor('salvage', 0.95) : roleColor('text', 0.94);
  ctx.save();
  ctx.fillStyle = roleColor('void', 0.76);
  ctx.fillRect(slot.bounds.x, slot.bounds.y, slot.bounds.w, slot.bounds.h);
  ctx.strokeStyle = roleColor('muted', 0.30);
  ctx.strokeRect(slot.bounds.x, slot.bounds.y, slot.bounds.w, slot.bounds.h);
  ctx.font = canvasFont(UI_IN_PLAY_TYPE.criticalNumber, { weight: '700' });
  ctx.textAlign = 'center';
  ctx.fillStyle = color;
  ctx.fillText(overheatRemaining > 0 ? `HEAT LOCK ${overheatRemaining.toFixed(1)}s` : `heat ${Math.round(ratio * 100)}%`, sx, top);
  ctx.fillStyle = roleColor('void', 0.76);
  ctx.fillRect(left, slot.barY, width, 6);
  ctx.fillStyle = color;
  ctx.fillRect(left, slot.barY, width * ratio, 6);
  ctx.restore();
}

function renderNoiseOverlay(ctx, ship, camX, camY, canvasW, canvasH, nowSeconds) {
  if (!ship) return;
  const [sx, sy] = worldToScreen(ship.wx, ship.wy, camX, camY, canvasW, canvasH);
  const radiusMeters = Math.max(0, Number(noiseState.audibleRadiusMeters) || 0);
  ctx.save();
  if (radiusMeters > 0) {
    const radiusPx = worldRadiusToScreen(metersToSimUnits(radiusMeters), canvasW, canvasH);
    const alpha = noiseState.trend === 'falling' ? 0.24 : 0.36;
    ctx.strokeStyle = `rgba(90, 220, 220, ${alpha})`;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 5]);
    ctx.beginPath();
    ctx.ellipse(sx, sy, radiusPx.rx, radiusPx.ry, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  for (let i = noiseRipples.length - 1; i >= 0; i--) {
    const ripple = noiseRipples[i];
    const age = Math.max(0, nowSeconds - ripple.startedAt);
    if (age > 2.5) {
      noiseRipples.splice(i, 1);
      continue;
    }
    const [rx, ry] = worldToScreen(ripple.wx, ripple.wy, camX, camY, canvasW, canvasH);
    const radiusPx = worldRadiusToScreen(
      metersToSimUnits(ripple.radiusMeters) * (0.35 + age * 0.65),
      canvasW,
      canvasH,
    );
    const alpha = Math.max(0, 0.35 * (1 - age / 2.5));
    ctx.strokeStyle = `rgba(120, 230, 230, ${alpha.toFixed(2)})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(rx, ry, radiusPx.rx, radiusPx.ry, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Slingshot color palette by anchor type. Each tier reads visually
 * distinct so a player learns the vocabulary: wells = blue (cold,
 * dangerous), stars = gold (warm, plentiful), planetoids = teal (cool,
 * incidental). The brightness matches each tier's reward magnitude.
 */
const SLINGSHOT_COLORS = {
  well:      { ring: 'rgba(120, 180, 255, 0.45)', engaged: 'rgba(160, 220, 255, 0.85)' },
  star:      { ring: 'rgba(240, 200, 110, 0.55)', engaged: 'rgba(255, 220, 140, 0.9)' },
  planetoid: { ring: 'rgba(160, 220, 200, 0.55)', engaged: 'rgba(200, 240, 220, 0.9)' },
};

/**
 * Draw the slingshot overlay: affordance ring on whatever's in snap-to
 * range, full engaged ring + ship lock-line when active. Drawn after
 * ship.render so it sits on top of the basic ship sprite.
 */
function renderSlingshotOverlay(ctx, camX, camY, canvasW, canvasH, time) {
  if (!slingshotSystem) return;
  const anchors = slingshotSystem.collectAnchors(wellSystem, starSystem, planetoidSystem);
  // Affordance: faint pulsing ring on the nearest in-range anchor.
  const aff = !ship.slingshotEngaged ? slingshotSystem.findAffordance(ship, anchors) : null;
  if (aff) {
    const a = aff.anchor;
    const [sx, sy] = worldToScreen(a.wx, a.wy, camX, camY, canvasW, canvasH);
    const radiusPx = worldRadiusToScreen(a.range, canvasW, canvasH);
    const palette = SLINGSHOT_COLORS[a.type] || SLINGSHOT_COLORS.well;
    const pulse = 0.85 + 0.15 * Math.sin(time * 4);
    ctx.save();
    ctx.strokeStyle = palette.ring;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 6]);
    ctx.lineDashOffset = -time * 30;
    ctx.globalAlpha = pulse;
    ctx.beginPath();
    ctx.ellipse(sx, sy, radiusPx.rx, radiusPx.ry, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Engaged: solid ring on the locked anchor + a tether line to the
  // ship that visualizes the orbital lock. Energy bar segment shows
  // accumulated banked velocity.
  if (ship.slingshotEngaged && ship.slingshotAnchor) {
    const a = ship.slingshotAnchor;
    const [ax, ay] = worldToScreen(a.wx, a.wy, camX, camY, canvasW, canvasH);
    const [shipX, shipY] = worldToScreen(ship.wx, ship.wy, camX, camY, canvasW, canvasH);
    const radiusPx = worldRadiusToScreen(a.range, canvasW, canvasH);
    const palette = SLINGSHOT_COLORS[a.type] || SLINGSHOT_COLORS.well;
    ctx.save();
    // Solid engaged ring.
    ctx.strokeStyle = palette.engaged;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(ax, ay, radiusPx.rx, radiusPx.ry, 0, 0, Math.PI * 2);
    ctx.stroke();
    // Tether line ship → anchor.
    ctx.strokeStyle = palette.engaged;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 4]);
    ctx.lineDashOffset = -time * 60;
    ctx.beginPath();
    ctx.moveTo(shipX, shipY);
    ctx.lineTo(ax, ay);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }
}

function collectPresentationSceneSource() {
  const authorityPlayer = remoteSession.active
    ? remoteSession.snapshot?.players?.find((player) => player.clientId === simClient?.clientId)
    : null;
  const deliveredThrust = remoteSession.active
    ? (authorityPlayer?.deliveredThrust ?? 0)
    : (ship?.lastDeliveredThrustIntensity ?? 0);
  const deliveredBrake = remoteSession.active
    ? (authorityPlayer?.deliveredBrake ?? 0)
    : (ship?.lastDeliveredBrakeIntensity ?? 0);
  const authoritySlingshot = authorityPlayer?.slingshot || null;
  const slingshotAffordance = gamePhase === 'playing' && !remoteSession.active && slingshotSystem && !ship.slingshotEngaged
    ? slingshotSystem.findAffordance(ship, slingshotSystem.collectAnchors(wellSystem, starSystem, planetoidSystem))
    : null;
  // Remote product play has a server-owned coarse field. The local analytic
  // helper omits its seeded sea, so it cannot claim semantic current truth.
  const fieldSample = remoteSession.active
    ? null
    : (flowField?.sample?.(ship.wx, ship.wy) || null);
  const runElapsedTime = simState.runElapsedTime;

  return createPresentationSceneSource({
    phase: gamePhase,
    isTitleBackdrop: isTitleBackdropActive(),
    localPlayer: {
      ship,
      hullType: profileManager.active?.hullType || profileManager.active?.shipType || 'drifter',
      authorityHeatRatio: authorityPlayer?.heatRatio,
      localHeatRatio: ship?.getHeatRatio?.(),
      authorityOverheated: authorityPlayer?.overheated,
      localOverheated: ship?.getHeatState?.().overheated,
      authorityOverheatRemaining: authorityPlayer?.overheatRemaining,
      noise: authorityPlayer?.noise || null,
      localOverheatRemaining: ship?.getHeatState?.().overheatRemaining,
      forceLedger: authorityPlayer?.forceLedger || null,
      ruler: authorityPlayer?.ruler || null,
      deliveredThrust,
      deliveredBrake,
    },
    world: {
      wells: wellSystem?.wells || [],
      stars: starSystem?.stars || [],
      wrecks: wreckSystem?.wrecks || [],
      portals: (portalSystem?.portals || []).filter((portal) => portal.alive !== false).map((portal) => ({
        id: portal.id,
        wx: portal.wx,
        wy: portal.wy,
        type: portal.type,
        opacity: portal.opacity,
        alive: portal.alive,
        captureRadius: portal.getCaptureRadius?.(),
        finalInhibitor: portal.finalInhibitor,
        finalExfil: portal.finalExfil === true,
        guaranteedFinalExfil: portal.guaranteedFinalExfil === true,
        warning: portal.isWarning?.(runElapsedTime) === true,
        critical: portal.isCritical?.(runElapsedTime) === true,
      })),
      planetoids: planetoidSystem?.planetoids || [],
      waveRings: waveRings?.rings || [],
      scavengers: scavengerSystem?.scavengers || [],
      remotePlayers: remoteSession.players || [],
      shipCandidates: fixtureShipCandidates || [],
      fauna: remoteFauna || [],
      sentries: remoteSentries || [],
      inhibitors: remoteSession.snapshot?.inhibitor?.entities || [],
      noiseEmitters: remoteSession.snapshot?.world?.noiseEmitters || [],
      collapseEpoch: remoteSession.snapshot?.world?.collapseEpoch,
      collapseEpochSchedule: remoteSession.snapshot?.world?.collapseEpochSchedule,
    },
    slingshot: {
      authority: authoritySlingshot,
      localAffordance: slingshotAffordance,
    },
    semanticFieldSample: fieldSample,
    defaults: {
      wellKillRadius: CONFIG.wells.killRadius,
      portalCaptureRadius: CONFIG.portals.captureRadius,
    },
  });
}

function collectFrameVfxEvents(ctx, w, h) {
  if (rendererFixtureActive && activeRendererFixture?.fixtureVfx) {
    return collectTitleVfxEvents(ctx, w, h, totalTime, {
      fixtureVfx: activeRendererFixture.fixtureVfx,
      layoutName: activeRendererFixture.fixtureVfx.layout || titleLayout,
    });
  }
  if (gamePhase === 'title') {
    // The clean title-environment capture removes the title wordmark, so its
    // screen-space glyph faults must not survive as orphaned presentation.
    if (titleEnvironmentCaptureOnly) return [];
    return collectTitleVfxEvents(ctx, w, h, totalTime);
  }
  return [];
}

/**
 * Apply the active profile's hull stats and equipped-item bonuses to the
 * ship. Fresh runs start cool; mid-run inventory swaps preserve the current
 * Heat ratio through the whole hull+item recompute.
 */
function applyHullToShip({ refill = true } = {}) {
  const hullType = profileManager.active?.hullType
    || profileManager.active?.shipType
    || 'drifter';
  const hullDef = HULL_DEFINITIONS[hullType] || HULL_DEFINITIONS.drifter;
  ship.setHullStats({
    deltaVMax: hullDef.deltaVMax ?? CONFIG.ship.deltaVMax,
    deltaVRegen: hullDef.deltaVRegen ?? CONFIG.ship.deltaVRegen,
    deltaVRegenBoost: hullDef.deltaVRegenBoost ?? CONFIG.ship.deltaVRegenBoost,
    deltaVBurnEff: hullDef.deltaVBurnEff ?? 1.0,
    thrustScale: hullDef.thrustScale ?? 1.0,
    dragScale: hullDef.dragScale ?? 1.0,
    currentCoupling: hullDef.currentCoupling ?? 1.0,
    wellResistScale: hullDef.wellResistScale ?? 1.0,
    refill,
  });
  ship.applyProfileDragUpgrade(profileManager.active?.upgrades?.drag);
  if (inventorySystem) {
    ship.applyMovementItemBonus(inventorySystem.getMovementStats());
    ship.applyDeltaVItemBonus(inventorySystem.getDeltaVStats());
  }
}

function applyConsumableEffect(effectId, item = null) {
  switch (effectId) {
    case 'shieldBurst':
      shieldActive = true;
      showWarning('shield active — survive one well contact', 'rgba(100, 200, 255, 0.95)', 3000);
      audioEngine.playEvent('shieldActivate');
      break;
    case 'fuelRefill': {
      // Fuel cells refill the ship's deltaV by the catalog-specified
      // amount. Tier scales the amount: T1 small, T2 medium, T3 large.
      const refillAmount = Number.isFinite(item?.amount) ? item.amount
        : (item?.tier === 3 ? 200 : item?.tier === 2 ? 80 : 35);
      const heatBefore = ship.getHeatRatio();
      ship.refillDeltaV(refillAmount);
      const heatCooled = Math.max(0, Math.round((heatBefore - ship.getHeatRatio()) * 100));
      showWarning(`heat cooled ${heatCooled}%`, 'rgba(120, 220, 140, 0.95)', 1800);
      break;
    }
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
      console.warn('[LBH] unknown consumable effect:', effectId);
  }
}

function gameLoop(now) {
  if (!running) return;
  const frameStart = performance.now();

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
    transitionTimer = advanceMotionClock(transitionTimer, rawDt, { maxStep: 1 / 15 });
    const timing = transitionTiming();
    // Fire scene swap at the midpoint (full corruption — scene invisible)
    if (!transitionFired && transitionTimer >= timing.handoff) {
      transitionFired = true;
      if (transitionCallback) transitionCallback();
      transitionCallback = null;
    }
    // End transition
    if (transitionTimer >= timing.duration) {
      transitionActive = false;
    }
  }
  if (inhibitorWakeGlitchTimer > 0) {
    inhibitorWakeGlitchTimer = Math.max(0, inhibitorWakeGlitchTimer - rawDt);
  }

  const inMenu = gamePhase === 'title' || gamePhase === 'profileSelect' || gamePhase === 'home' || gamePhase === 'mapSelect' || gamePhase === 'loading' || rendererFixtureActive;
  // A remote session owns gameplay state until it is explicitly released.
  // Results and transitions still render its final snapshot, but must never
  // resume local simulation of those server-owned entities.
  const remoteVisualMode = remoteSession.active;

  // Register the last server field before any fixed step runs. FluidSim
  // forces from this texture after each step, so visual detail cannot become
  // a second gameplay current between snapshots.
  if (fluid) {
    if (remoteSession.active && remoteSession.authoritativeField) {
      fluid.setAuthoritativeCoarseField(remoteSession.authoritativeField);
    } else {
      fluid.clearAuthoritativeCoarseField();
    }
  }

  // Local sandbox pause freezes its client simulation for debugging. A remote
  // authority pause keeps presentation and snapshot intake alive; it never
  // pauses or claims to pause the server run.
  const localSandboxPaused = gamePhase === 'paused' && !remoteSession.active;
  if (!localSandboxPaused) {
    const simStart = performance.now();
    if (gamePhase === 'title' && !rendererFixtureActive) {
      titleScenePresentation.update({ frameDt: dt, totalTime, camX, camY });
    } else {
      // Explicit legacy fallback for Bench/local play and remote visual
      // hydration. It is not product gameplay authority.
      legacyLocalSimCore.update(simState, {
        frameDt: dt,
        totalTime,
        inMenu: inMenu || remoteVisualMode,
        visualOnly: remoteVisualMode,
        camX,
        camY,
      });
    }
    if (remoteVisualMode) {
      combatSystem.update(dt);
    }
    recordPerfStat('simMs', performance.now() - simStart);

  } // end paused check

  // === INPUT (always polled — even during menus, for navigation) ===
  inputManager.poll({
    active: gamePhase === 'playing',
    ship,
    camX,
    camY,
    canvasW: overlayCanvas.width,
    canvasH: overlayCanvas.height,
  });

  const confirmNow = inputManager.confirmPressed;
  const extractNow = inputManager.extractPressed;
  const pauseNow = inputManager.pausePressed;
  const backNow = inputManager.backPressed;
  const upNow = inputManager.upPressed;
  const downNow = inputManager.downPressed;
  const leftNow = inputManager.leftPressed;
  const rightNow = inputManager.rightPressed;
  const pulseNow = inputManager.pulsePressed;
  const slingshotNow = inputManager.slingshotPressed;
  const inventoryNow = inputManager.inventoryPressed;
  const consumable1Now = inputManager.consumable1Pressed;
  const consumable2Now = inputManager.consumable2Pressed;
  const muteNow = inputManager.mutePressed;

  if (muteNow && !_prevMute) {
    audioEngine.init();
    const muted = audioEngine.toggleMute();
    showWarning(muted ? 'MUTED' : 'AUDIO ON', muted ? 'rgba(190, 190, 210, 0.95)' : 'rgba(150, 230, 190, 0.95)', 1400);
  }

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
    if (!transitionActive && backNow && !_prevBack) requestPackagedQuit();
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
      if ((leftNow && !_prevLeft) || (rightNow && !_prevRight)) {
        deleteConfirmChoice = deleteConfirmChoice === 'cancel' ? 'delete' : 'cancel';
        audioEngine.playEvent('menuMove');
      }
      if (confirmNow && !_prevConfirm) {
        confirmProfileDeletion();
      }
      if (backNow && !_prevBack) {
        closeDeleteConfirmation();
      }
      applySceneCamera(dt);
    } else {
      if (upNow && !_prevUp) { profileCursor = (profileCursor - 1 + 3) % 3; audioEngine.playEvent('menuMove'); }
      if (downNow && !_prevDown) { profileCursor = (profileCursor + 1) % 3; audioEngine.playEvent('menuMove'); }
      if (!transitionActive && confirmNow && !_prevConfirm) {
        if (profileManager.hasProfile(profileCursor)) {
          profileManager.loadProfile(profileCursor);
          syncRecentEchoesFromProfile();
          audioEngine.playEvent('menuConfirm');
          audioEngine.setContext('menu');
          gamePhase = 'home';
          homeTab = 0;
          homePhaseTimer = 0;
          audioEngine.setContext('menu');
        } else {
          nameInputActive = true;
          setNameInputBuffer(generatePilotName());
          audioEngine.playEvent('menuConfirm');
        }
      }
      // Delete pilot (X key / triangle button)
      if (inputManager.deletePressed && !_prevDelete && profileManager.hasProfile(profileCursor)) {
        deleteConfirmSlot = profileCursor;
        deleteConfirmChoice = 'cancel';
      }
      if (!transitionActive && backNow && !_prevBack) {
        gamePhase = 'title';
        titleTimer = 0;
      }
      applySceneCamera(dt);
    }

  } else if (gamePhase === 'home') {
    homePhaseTimer += dt;
    const tabCount = HOME_TABS.length;
    // Tab navigation: L1/R1 (or Q/E on keyboard) — dpad/stick reserved for in-tab scrolling
    if (inputManager.tabLeftPressed && !_prevTabLeft) { homeTab = (homeTab - 1 + tabCount) % tabCount; audioEngine.playEvent('tabSwitch'); }
    if (inputManager.tabRightPressed && !_prevTabRight) { homeTab = (homeTab + 1) % tabCount; audioEngine.playEvent('tabSwitch'); }

    if (homeTab === 0) { // SHIP — public hull selection + loadout management
      const activeProfile = profileManager.active;
      if (activeProfile && ((leftNow && !_prevLeft) || (rightNow && !_prevRight))) {
        const currentIndex = Math.max(0, PUBLIC_HULL_IDS.indexOf(activeProfile.hullType));
        const direction = rightNow && !_prevRight ? 1 : -1;
        const nextIndex = (currentIndex + direction + PUBLIC_HULL_IDS.length) % PUBLIC_HULL_IDS.length;
        profileManager.setHullType(PUBLIC_HULL_IDS[nextIndex]);
        homeRigCursor = 0;
        audioEngine.playEvent('menuMove');
      }
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
    } else if (homeTab === 2) { // RIG
      const rig = profileManager.getRigProgression();
      const tracks = rig?.tracks || [];
      if (upNow && !_prevUp && homeRigCursor > 0) homeRigCursor--;
      if (downNow && !_prevDown && homeRigCursor < tracks.length - 1) homeRigCursor++;
      if (confirmNow && !_prevConfirm) {
        if (profileManager.canAffordRigUpgrade(homeRigCursor)) {
          profileManager.performRigUpgrade(homeRigCursor);
          audioEngine.playEvent('upgrade');
        } else {
          audioEngine.playEvent('cantAfford');
        }
      }
    } else if (homeTab === 3) { // CHRONICLE
      const maxOffset = Math.max(0, recentEchoes.length - 4);
      if (upNow && !_prevUp && homeChronicleOffset > 0) {
        homeChronicleOffset--;
        audioEngine.playEvent('menuMove');
      }
      if (downNow && !_prevDown && homeChronicleOffset < maxOffset) {
        homeChronicleOffset++;
        audioEngine.playEvent('menuMove');
      }
    } else if (homeTab === 4) { // LAUNCH
      if (confirmNow && !_prevConfirm) {
        gamePhase = 'mapSelect';
      }
    }

    if (!transitionActive && backNow && !_prevBack) {
      gamePhase = 'profileSelect';
    }
    applySceneCamera(dt);

  } else if (gamePhase === 'mapSelect') {
    if (simClient?.enabled) void refreshRemoteSessionHealth(false);
    if (upNow && !_prevUp) { mapSelectIndex = (mapSelectIndex - 1 + MAP_SELECT_ENTRIES.length) % MAP_SELECT_ENTRIES.length; audioEngine.playEvent('menuMove'); }
    if (downNow && !_prevDown) { mapSelectIndex = (mapSelectIndex + 1) % MAP_SELECT_ENTRIES.length; audioEngine.playEvent('menuMove'); }
    if (inputManager.rerollPressed && !_prevSeedReroll) {
      rerollPreviewSeed();
      audioEngine.playEvent('menuMove');
    }
    _prevSeedReroll = inputManager.rerollPressed;
    if (!transitionActive && confirmNow && !_prevConfirm) {
      const selectedEntry = currentMapSelectEntry();
      if (selectedEntry?.available) {
        audioEngine.init();
        audioEngine.playEvent('launch');
        // Load loadout from profile before entering run
        const p = profileManager.active;
        if (p) {
          inventorySystem.equipped = p.loadout.equipped.map(i => i ? { ...i } : null);
          inventorySystem.consumables = p.loadout.consumables.map(i => i ? { ...i } : null);
        }
        transitionToRemoteGame(selectedEntry);
      }
    }
    if (!transitionActive && inputManager.deletePressed && !_prevDelete && simClient?.enabled) {
      const selectedEntry = currentMapSelectEntry();
      const remoteControl = currentRemoteControlState();
      if (selectedEntry?.available && remoteControl.canHostReset) {
        audioEngine.init();
        audioEngine.playEvent('launch');
        const p = profileManager.active;
        if (p) {
          inventorySystem.equipped = p.loadout.equipped.map(i => i ? { ...i } : null);
          inventorySystem.consumables = p.loadout.consumables.map(i => i ? { ...i } : null);
        }
        transitionToRemoteGame(selectedEntry, { forceReset: true });
      } else if (remoteControl.hasLiveSession) {
        showWarning('this live cycle is already underway', 'rgba(255, 150, 120, 0.95)', 2400);
      }
    }
    if (!transitionActive && backNow && !_prevBack) {
      gamePhase = 'home';
    }
    applySceneCamera(dt);

  } else if (gamePhase !== 'paused') {
    // --- Gameplay input ---
    if (pauseNow && !_prevPause) togglePause();

    if (gamePhase === 'recovery' && backNow && !_prevBack) {
      void leaveRemoteSessionToHome().finally(() => {
        loadTitleScene();
        gamePhase = 'home';
        homeTab = 0;
        homePhaseTimer = 0;
        audioEngine.setContext('menu');
      });
    } else if (!transitionActive && confirmNow && !_prevConfirm) {
      // Unlock confirm only after the linger finishes plus a beat for
      // the title to register. Matches the DEATH_LINGER_DURATION used
      // in the end-screen render block.
      const endScreenUnlock = DEATH_LINGER_DURATION + 1.0;
      if (gamePhase === 'dead' && deathTimer > endScreenUnlock) {
        if (remoteSession.active) {
          triggerTransition(() => {
            void leaveRemoteSessionToHome().catch((err) => {
              console.error('[LBH] remote leave failed:', err);
              showWarning('the cycle would not release — try again', 'rgba(255, 100, 80, 0.95)', 4000);
            }).finally(() => {
              loadTitleScene();
              gamePhase = 'home';
              homeTab = 0;
              homePhaseTimer = 0;
              audioEngine.setContext('menu');
            });
          });
          _prevConfirm = confirmNow;
          _prevExtract = extractNow;
          _prevPause = pauseNow;
          _prevBack = backNow;
          _prevUp = upNow;
          _prevDown = downNow;
          _prevLeft = inputManager.leftPressed;
          _prevRight = inputManager.rightPressed;
          _prevTabLeft = inputManager.tabLeftPressed;
          _prevTabRight = inputManager.tabRightPressed;
          _prevDelete = inputManager.deletePressed;
          _prevMute = muteNow;
          _prevPulse = pulseNow;
          _prevSlingshot = slingshotNow;
          _prevInventory = inventoryNow;
          _prevConsumable1 = consumable1Now;
          _prevConsumable2 = consumable2Now;
          requestAnimationFrame(gameLoop);
          return;
        }
        // Save loadout on death — consumed items stay consumed, equipment changes persist
        profileManager.setLoadout(inventorySystem.equipped, inventorySystem.consumables);
        const deathCredit = profileManager.recordDeath(simState.runEndTime);
        recordChronicleRun(lastRunResult, {
          outcome: 'dead',
          survivalTime: simState.runEndTime,
          emEarned: deathCredit,
          cargo: inventorySystem.getCargoItems?.() || [],
        });
        triggerTransition(() => {
          loadTitleScene();
          gamePhase = 'home';
          homeTab = 0;
          homePhaseTimer = 0;
          audioEngine.setContext('menu');
        });
      }
      if (gamePhase === 'escaped' && escapeTimer > endScreenUnlock) {
        // Extraction resolves before Home. The terminal result already shows
        // the cargo and vault outcome, so there is no second report phase.
        const extractedItems = inventorySystem.extractCargo();
        if (remoteSession.active) {
          triggerTransition(() => {
            void leaveRemoteSessionToHome().catch((err) => {
              console.error('[LBH] remote leave after extraction failed:', err);
            }).finally(() => {
              recordChronicleRun(lastRunResult, {
                outcome: 'extracted',
                survivalTime: simState.runEndTime,
                cargo: extractedItems,
              });
              loadTitleScene();
              gamePhase = 'home';
              homeTab = 0;
              homePhaseTimer = 0;
              audioEngine.setContext('menu');
            });
          });
        } else {
          const extractionCredit = profileManager.recordExtraction(simState.runEndTime);
          const overflow = profileManager.storeItems(extractedItems.map(i => ({ ...i })));
          let overflowCredit = 0;
          // Sell overflow items automatically (vault full)
          for (const item of overflow) {
            overflowCredit += profileManager.addEM(item.value || 0);
          }
          // Save loadout
          profileManager.setLoadout(inventorySystem.equipped, inventorySystem.consumables);
          recordChronicleRun({ ...(lastRunResult || {}), emEarned: extractionCredit + overflowCredit }, {
            outcome: 'extracted',
            survivalTime: simState.runEndTime,
            emEarned: extractionCredit + overflowCredit,
            cargo: extractedItems,
          });
          triggerTransition(() => {
            loadTitleScene();
            gamePhase = 'home';
            homeTab = 0;
            homePhaseTimer = 0;
            audioEngine.setContext('menu');
          });
        }
      }
    }

    if (remoteSession.active) {
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
          queueRemoteConsumeSlot(remoteSession, 0);
        } else if (!inventoryOpen && consumable2Now && !_prevConsumable2) {
          queueRemoteConsumeSlot(remoteSession, 1);
        }
        if (pulseNow && !_prevPulse) {
          queueRemotePulse(remoteSession);
        }
        if (!inventoryOpen && extractNow && !_prevExtract) {
          queueRemoteExtractConfirm(remoteSession);
        }
        if (!inventoryOpen && slingshotNow && !_prevSlingshot) {
          const authoritySlingshot = remoteSession.snapshot?.players?.find((player) => player.clientId === simClient?.clientId)?.slingshot;
          const rehookCooldownSeconds = Math.max(0, Number(authoritySlingshot?.rehookCooldownSeconds) || 0);
          if (!authoritySlingshot?.engaged && rehookCooldownSeconds > 0) {
            showWarning(`grapple cooling // re-hook in ${rehookCooldownSeconds.toFixed(1)}s`, 'rgba(120, 190, 255, 0.92)', 1200);
          } else if (!authoritySlingshot?.engaged && !authoritySlingshot?.aim) {
            showWarning('no anchor in range // move toward a ring', 'rgba(120, 190, 255, 0.92)', 1600);
          } else if (!authoritySlingshot?.engaged && authoritySlingshot?.aim?.engageEligible === false) {
            showWarning('anchor in range // start moving to grapple', 'rgba(120, 190, 255, 0.92)', 1600);
          }
          queueRemoteSlingshotEdge(remoteSession);
        }

        if (!remoteSession.inputRequestInFlight) {
          const facing = inputManager.facing ?? ship.facing;
          const thrust = inventoryOpen ? 0 : inputManager.thrustIntensity;
          const brake = inventoryOpen ? 0 : inputManager.brakeIntensity;
          const intentX = Number.isFinite(inputManager.moveX)
            ? inputManager.moveX
            : (Number.isFinite(facing) ? Math.cos(facing) : 1);
          const intentY = Number.isFinite(inputManager.moveY)
            ? inputManager.moveY
            : (Number.isFinite(facing) ? Math.sin(facing) : 0);
          const sentActions = captureRemotePendingActions(remoteSession);
          remoteSession.inputRequestInFlight = true;
          void simClient.sendInput({
            // The scalar action fields decide whether thrust/brake happens;
            // the vector is pure intent, so brake-only packets still steer.
            moveX: intentX,
            moveY: intentY,
            thrust,
            brake,
            slingshot: !inventoryOpen && slingshotNow,
            slingshotEdges: sentActions.slingshotEdges,
            pulse: sentActions.pulse,
            extractConfirm: sentActions.extractConfirm,
            ability1: inputManager.ability1 || false,
            ability2: inputManager.ability2 || false,
            consumeSlot: sentActions.consumeSlot,
          }).then((response) => {
            syncRemoteNetworkPerfStats();
            settleRemoteInputAcknowledgement(remoteSession, sentActions, response);
          }).catch((err) => {
            console.error('[LBH] remote input failed:', err);
          }).finally(() => {
            remoteSession.inputRequestInFlight = false;
          });
        }

      } else if (gamePhase === 'dead') {
        deathTimer += dt;
      } else if (gamePhase === 'escaped') {
        escapeTimer += dt;
      }
    } else {
      // Suppress ship input while inventory is open (don't fly into a well while sorting loot)
      if (!inventoryOpen) {
        inputManager.applyToShip(ship);
      } else {
        ship.setThrustIntensity(0);
        ship.setBrakeIntensity(0);
      }

      // 6. Ship update
      if (gamePhase === 'playing') {
      ship.update(dt, flowField, wellSystem, fluid);

      starSystem.applyToShip(ship, dt);
      planetoidSystem.applyToShip(ship, dt);

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
          sessionTime: simState.runElapsedTime,
          spawnTime: simState.runElapsedTime,
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
        if (confirmNow && !_prevConfirm) {
          const beforeEquipSig = inventorySystem.equipped.map((it) => it?.id ?? null).join('|');
          inventoryConfirm(inventorySystem);
          const afterEquipSig = inventorySystem.equipped.map((it) => it?.id ?? null).join('|');
          // If equipped slots changed (equip / unequip / swap), refresh
          // the ship's hull-derived stats so propulsion coefficients
          // from the new artifacts apply mid-run instead of waiting for
          // the next scene load. applyDeltaVItemBonus preserves the
          // current Heat ratio so a partially heated ship stays consistent.
          if (beforeEquipSig !== afterEquipSig) {
            applyHullToShip({ refill: false });
          }
        }
      }

      // Consumable hotkeys (d-pad left/right or 1/2) — only when inventory closed
      if (!inventoryOpen && consumable1Now && !_prevConsumable1) {
        const slot = inventorySystem.consumables[0] ? { ...inventorySystem.consumables[0] } : null;
        const effect = inventorySystem.useConsumable(0);
        if (effect) applyConsumableEffect(effect, slot);
      }
      if (!inventoryOpen && consumable2Now && !_prevConsumable2) {
        const slot = inventorySystem.consumables[1] ? { ...inventorySystem.consumables[1] } : null;
        const effect = inventorySystem.useConsumable(1);
        if (effect) applyConsumableEffect(effect, slot);
      }

      // Wreck pickup (pass available slots so partial loot works correctly)
      if (!inventorySystem.cargoFull) {
        const slotsAvailable = inventorySystem.cargoMax - inventorySystem.cargoCount;
        const newItems = wreckSystem.checkPickup(ship.wx, ship.wy, slotsAvailable, simState.runElapsedTime);
        if (newItems.length > 0) {
          const overflow = inventorySystem.addMultipleToCargo(newItems);
          const added = newItems.length - overflow.length;
          if (added > 0) {
            audioEngine.playEvent('loot', ship.wx, ship.wy, camX, camY, overlayCanvas.width, overlayCanvas.height);
            for (const item of newItems.slice(0, added)) {
              const color = TIER_COLORS[item.tier] || 'rgba(212, 168, 67, 0.9)';
              showWarning(`${item.name}`, color, 2000, { severity: 'loot' });
            }
          }
          if (overflow.length > 0) {
            showWarning(`cargo full — ${overflow.length} item(s) left behind`, 'rgba(255, 100, 80, 0.9)', 4000, { severity: 'threat' });
          }
        }
      } else {
        // Still check if near a wreck — show "cargo full" warning once
        const nearWreck = wreckSystem.wrecks.some(w =>
          w.alive && !w.looted && worldDistance(ship.wx, ship.wy, w.wx, w.wy) < CONFIG.wrecks.pickupRadius * 1.5
        );
        if (nearWreck && !inventorySystem._fullWarningShown) {
          showWarning('cargo full —', 'rgba(255, 100, 80, 0.9)', 4000, {
            severity: 'threat',
            action: actionDescriptor('inventory', currentPromptOptions()),
            actionVerb: 'inventory to drop',
          });
          inventorySystem._fullWarningShown = true;
        }
        if (!nearWreck) inventorySystem._fullWarningShown = false;
      }

      // Wreck consumption by growing wells
      wreckSystem.checkWellConsumption(wellSystem, waveRings);

      const killingWell = wellSystem.checkDeath(ship.wx, ship.wy);
      if (killingWell) {
        if (shieldActive) {
          // Shield burst consumable: survive one contact
          shieldActive = false;
          showWarning('shield absorbed!', 'rgba(100, 200, 255, 0.95)', 2000);
          audioEngine.playEvent('shieldAbsorb');
        } else {
          gamePhase = 'dead';
          deathTimer = 0;
          freezeRunEnd(simState);
          ship.setThrust(false);
          markTerminalPresentation('dead');
          audioEngine.playEvent('death');
        }
      }

      if (gamePhase === 'playing') {
        const portal = portalSystem.checkExtraction(ship.wx, ship.wy);
        if (portal && extractNow && !_prevExtract) {
          gamePhase = 'escaped';
          escapeTimer = 0;
          freezeRunEnd(simState);
          ship.setThrust(false);
          audioRouter?.setPhase('results');
          audioRouter?.local('results', { presentationId: `results:${performance.now()}` });
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
        markTerminalPresentation('dead');
        audioEngine.playEvent('death');
      }
    } else if (gamePhase === 'dead') {
        deathTimer += dt;
    } else if (gamePhase === 'escaped') {
        escapeTimer += dt;
    }
    }

    // Remote snapshots arrive at server cadence; presentation runs every
    // render frame so authoritative movement does not appear quantized.
    updateRemoteShipPresentation(dt);

    // Update camera (after ship update / remote presentation)
    applySceneCamera(dt);

  } else {
    // --- Paused input ---
    // Circle/back = resume game (not quit)
    if (backNow && !_prevBack) {
      pauseAbandonConfirm = false;
      togglePause();
    }
    // Start/options = also resume
    if (pauseNow && !_prevPause) togglePause();
    // Navigate menu
    if (upNow && !_prevUp) pauseMenuSelection = 0;
    if (downNow && !_prevDown) pauseMenuSelection = 1;
    // Confirm selection
    if (confirmNow && !_prevConfirm) {
      if (pauseMenuSelection === 0) {
        pauseAbandonConfirm = false;
        togglePause();  // return to game
      } else if (!pauseAbandonConfirm) {
        pauseAbandonConfirm = true;
      } else if (!transitionActive) {
        pauseAbandonConfirm = false;
        abandonPausedRunToTitle();
      }
    }
  }

  // Snapshot/connection intake is independent of the local command overlay.
  // One in-flight request plus SimClient's latest snapshot is the only queue.
  if (remoteSession.active) {
    requestRemoteSnapshot();
    if (gamePhase === 'paused') void refreshRemoteSessionHealth(false);
  }

  updateTitleAttractScene();
  updateUiMotion(rawDt);

  _prevConfirm = confirmNow;
  _prevExtract = extractNow;
  _prevPause = pauseNow;
  _prevBack = backNow;
  _prevUp = upNow;
  _prevDown = downNow;
  _prevLeft = leftNow;
  _prevRight = rightNow;
  _prevTabLeft = inputManager.tabLeftPressed;
  _prevTabRight = inputManager.tabRightPressed;
  _prevDelete = inputManager.deletePressed;
  _prevMute = muteNow;
  _prevPulse = pulseNow;
  _prevSlingshot = slingshotNow;
  _prevInventory = inventoryNow;
  _prevConsumable1 = consumable1Now;
  _prevConsumable2 = consumable2Now;

  // 6a. Sync the fluid camera. The authority texture is registered above,
  //     before simulation ticks, and remains world-anchored for boundary
  //     inflow when the camera scrolls.
  //
  //     Camera translation still reads the authority field for off-window
  //     inflow; it never regenerates a client-side well baseline.
  if (fluid) {
    const [prevFcamX, prevFcamY] = getFluidCamera();
    const [textureOffsetU, textureOffsetV] = fluidTextureOffsetForCameraMove(
      prevFcamX, prevFcamY, camX, camY,
    );
    if (textureOffsetU !== 0 || textureOffsetV !== 0) {
      fluid.translate(
        textureOffsetU, textureOffsetV,
        [camX, camY], GRID_WINDOW, WORLD_SCALE,
      );
      setFluidCamera(camX, camY);
    }
  }

  // 6b. Audio update — spatial mixing based on game state
  const authorityPlayer = remoteSession.active
    ? remoteSession.snapshot?.players?.find((player) => player.clientId === simClient?.clientId)
    : null;
  audioRouter?.movementState({
    active: gamePhase === 'playing' && !inventoryOpen,
    deliveredThrust: remoteSession.active
      ? (authorityPlayer?.deliveredThrust ?? 0)
      : ship.lastDeliveredThrustIntensity,
    deliveredBrake: remoteSession.active
      ? (authorityPlayer?.deliveredBrake ?? 0)
      : ship.lastDeliveredBrakeIntensity,
    speed: Math.hypot(ship.vx || 0, ship.vy || 0),
  });
  if (!inMenu) {
    audioEngine.update(dt, wellSystem.wells, ship, camX, camY,
      overlayCanvas.width, overlayCanvas.height, simState.runElapsedTime, CONFIG.universe.runDuration, inhibitorState);
  }

  // Drop slingshot engagement if we left the playing phase via any
  // path (death from gameplay, remote snapshot transition, pause, scene
  // change, etc.). Sits outside the playing branch so it always runs.
  if (slingshotSystem && ship?.slingshotEngaged && gamePhase !== 'playing') {
    slingshotSystem.cancel(ship);
  }

  // 7. Render fluid -> ASCII (camera-aware)
  const { wellUVs, wellMasses, wellShapes, wellProfiles, visibleIndices } = getVisibleWellRenderInputs(camX, camY);
  const visibleAccretionRadii = visibleIndices.map((i) => sceneAccretionRadii[i] ?? [0.07, 0.30, 0.52]);
  perfStats.visibleWellCount = wellUVs.length;
  perfStats.totalWellCount = wellSystem.wells.length;
  perfStats.fluidResolution = fluid?.res || 0;
  const backendStats = rendererBackend?.getPerfStats?.() || null;
  perfStats.rendererBackend = backendStats?.backend || rendererBackend?.name || 'legacy';
  perfStats.renderQuality = backendStats?.renderQuality || 'rich';
  perfStats.composerPasses = backendStats?.composerPasses || composer?.passes?.map((p) => p.name) || [];
  perfStats.three = backendStats?.three || null;
  // Camera offset in fluid UV: convert camera world-space to fluid UV
  const [camFU, camFV] = worldToFluidUV(camX, camY);
  const viewAspect = overlayCanvas.width / Math.max(1, overlayCanvas.height);
  // Collection-backed corruption data is bounded before it reaches either
  // shader. Three owns entity presentation; these arrays keep the ASCII and
  // fluid languages synchronized without reviving a scalar threat.
  const inhData = {
    entities: (inhibitorState.entities || []).filter((entity) => entity.lifecycle !== 'expired').slice(0, 16).map((entity) => {
      const [posU, posV] = worldToFluidUV(entity.wx, entity.wy);
      return {
        kind: entity.kind,
        posU,
        posV,
        radius: Math.max(0.001, Number(entity.radius) || 0.1),
        intensity: Math.max(0, Math.min(1, Number(entity.intensity) || 0)),
        localTime: Math.max(0, Number(entity.ageSeconds ?? entity.age) || totalTime),
      };
    }),
  };
  const a = CONFIG.ascii;
  // Renderer fixtures are render-only composition targets. They suppress menu
  // overlays, but should use the same visible well/accretion tuning as title.
  applyRenderTuningForPhase(gamePhase === 'title' || rendererFixtureActive);
  const vfxEvents = collectFrameVfxEvents(ctx, overlayCanvas.width, overlayCanvas.height);
  const presentation = createPresentationFrame({
    dt,
    camX,
    camY,
    gridWindow: GRID_WINDOW,
    cameraView: CAMERA_VIEW,
    worldScale: WORLD_SCALE,
    totalTime,
    runTime: {
      elapsedSeconds: simState.runElapsedTime,
      durationSeconds: CONFIG.universe.runDuration,
    },
    phase: gamePhase,
    runId: remoteSession.snapshot?.session?.runId || null,
    frameId: remoteSession.snapshot?.snapshotId || Math.floor(totalTime * 60),
    scene: collectPresentationSceneSource(),
    events: vfxEvents,
    vfxConfig: CONFIG.vfx,
  }, { qualityTier: rendererBackend?.renderQuality });
  const composerStart = performance.now();
  rendererBackend.render({
    presentation,
    fluidDisplay: {
      wellUVs, wellMasses, wellShapes, wellProfiles,
      wavePresentation: (waveRings?.rings || [])
        .map((ring) => projectEventWavePresentation(ring, simState.runElapsedTime))
        .filter(Boolean),
      camFU, camFV,
      worldScale: WORLD_SCALE,
      worldCameraUV: worldToGlobalFluidUV(camX, camY),
      gridWindow: GRID_WINDOW,
      cameraView: CAMERA_VIEW,
      viewAspect,
      totalTime,
      inhibitorData: inhData,
    },
    accretion: {
      wellUVs,
      wellRadii: visibleAccretionRadii,
      camFU, camFV,
      worldCameraUV: worldToGlobalFluidUV(camX, camY),
      worldScale: WORLD_SCALE,
      gridWindow: GRID_WINDOW,
      cameraView: CAMERA_VIEW,
      viewAspect,
    },
    ascii: {
      velocityTex: fluid.velocity.read.tex,
      cellSize: a.cellSize,
      cellAspect: a.cellAspect,
      contrast: a.contrast,
      shimmer: a.shimmer,
      dirThreshold: a.dirThreshold ?? 0.01,
      dirBlendRange: a.dirBlendRange ?? 0.03,
      glitchIntensity: getGlitchIntensity(),
      inhibitorData: inhData,
      camFU, camFV,
      worldCameraUV: worldToGlobalFluidUV(camX, camY),
      worldScale: WORLD_SCALE,
      gridWindow: GRID_WINDOW,
      cameraView: CAMERA_VIEW,
      viewAspect,
      totalTime,
    },
  });
  const postRenderBackendStats = rendererBackend?.getPerfStats?.() || null;
  if (postRenderBackendStats) {
    perfStats.rendererBackend = postRenderBackendStats.backend || perfStats.rendererBackend;
    perfStats.renderQuality = postRenderBackendStats.renderQuality || perfStats.renderQuality;
    perfStats.composerPasses = postRenderBackendStats.composerPasses || perfStats.composerPasses;
    perfStats.three = postRenderBackendStats.three || null;
  }
  recordPerfStat('composerMs', performance.now() - composerStart);

  // 8. Render overlay
  const overlayStart = performance.now();
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
    ctx.font = canvasFont(11);
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(140, 160, 180, 0.6)';
    ctx.fillText(loadingMapName.toLowerCase(), cx, cy + 40);

    // "dropping in" text with ellipsis animation
    const dots = '.'.repeat(1 + Math.floor(elapsed * 2) % 3);
    ctx.fillStyle = 'rgba(100, 120, 140, 0.5)';
    ctx.fillText('dropping in' + dots, cx, cy + 55);
  }

  if (!inMenu) {
    const threeOwnsWorld = rendererBackend?.name === 'three';
    if (!threeOwnsWorld) {
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
    }
    combatSystem.renderCooldown(ctx, ship, camX, camY, overlayCanvas.width, overlayCanvas.height);
    if (gamePhase === 'playing' && !threeOwnsWorld) {
      renderSlingshotOverlay(ctx, camX, camY, overlayCanvas.width, overlayCanvas.height, totalTime);
    }
    if (gamePhase === 'playing') {
      renderNoiseOverlay(ctx, ship, camX, camY, overlayCanvas.width, overlayCanvas.height, simState.runElapsedTime);
      renderShipVelocityReadout(ctx, ship, camX, camY, overlayCanvas.width, overlayCanvas.height);
      renderShipHeatInstrument(ctx, ship, camX, camY, overlayCanvas.width, overlayCanvas.height);
    }

    // THE PHANTOM — tick + render. See declaration comments for design notes.
    if (gamePhase === 'playing') {
      tickPhantom(
        simState.runElapsedTime,
        ship.wx, ship.wy,
        ship.vx || 0, ship.vy || 0,
        WORLD_SCALE
      );
      renderPhantom(ctx, camX, camY, overlayCanvas.width, overlayCanvas.height, simState.runElapsedTime);

    }

    // Hull ability visual effects
    if (gamePhase === 'playing' && localAbilityState) {
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
        const flicker = 0.7 + 0.3 * Math.sin(totalTime * 31);
        ctx.fillStyle = `rgba(255, 120, 40, ${(0.15 * flicker).toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(sx, sy, 25, 0, Math.PI * 2);
        ctx.fill();
        const fuelFrac = Math.max(0, Math.min(1, (as.burnFuel || 0) / 30));
        ctx.strokeStyle = 'rgba(255, 190, 80, 0.75)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(sx, sy, 29, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * fuelFrac);
        ctx.stroke();
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
        const pulse = 0.5 + 0.5 * Math.sin(totalTime * Math.PI * 2.5);
        ctx.strokeStyle = `rgba(180, 120, 255, ${(0.35 + pulse * 0.25).toFixed(2)})`;
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.arc(ax, ay, 8 + pulse * 3, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeStyle = `rgba(180, 120, 255, ${(0.18 + pulse * 0.16).toFixed(2)})`;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(ax, ay);
        ctx.stroke();
      }

      // Shroud: render decoys as fading noise dots
      if (as.hullType === 'shroud' && as.decoys) {
        for (const decoy of as.decoys) {
          const [dx, dy] = worldToScreen(decoy.wx, decoy.wy, camX, camY, overlayCanvas.width, overlayCanvas.height);
          const alpha = Math.max(0, Math.min(1, (decoy.noiseRadiusMeters || 0) / NOISE_CONFIG.impulses.decoyLaunchMeters) * 0.8);
          ctx.fillStyle = `rgba(200, 100, 255, ${alpha.toFixed(2)})`;
          ctx.beginPath();
          ctx.arc(dx, dy, 4, 0, Math.PI * 2);
          ctx.fill();
          // Faint noise ring
          ctx.strokeStyle = `rgba(200, 100, 255, ${(alpha * 0.3).toFixed(2)})`;
          ctx.beginPath();
          ctx.arc(dx, dy, 10 + ((decoy.noiseRadiusMeters || 0) / NOISE_CONFIG.impulses.decoyLaunchMeters) * 5, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      if (as.hullType === 'shroud' && as.ghostTrailActive) {
        const pulse = 0.5 + 0.5 * Math.sin(totalTime * Math.PI * 2);
        ctx.strokeStyle = `rgba(150, 170, 185, ${(0.12 + pulse * 0.12).toFixed(2)})`;
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 5]);
        ctx.beginPath();
        ctx.arc(sx, sy, 20 + pulse * 5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      if (as.hullType === 'hauler') {
        if ((as.salvageLockCharges || 0) > 0) {
          ctx.strokeStyle = 'rgba(220, 200, 100, 0.32)';
          ctx.lineWidth = 1;
          ctx.setLineDash([5, 4]);
          ctx.beginPath();
          ctx.arc(sx, sy, 34, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        if ((as.tractorChannelTimer || 0) > 0) {
          const channelFrac = Math.max(0, Math.min(1, (as.tractorChannelTimer || 0) / 3));
          const pulse = 0.5 + 0.5 * Math.sin(totalTime * Math.PI * 4);
          ctx.strokeStyle = `rgba(230, 220, 130, ${(0.35 + pulse * 0.25).toFixed(2)})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(sx, sy, 28 + channelFrac * 14, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * channelFrac);
          ctx.stroke();
          ctx.strokeStyle = `rgba(230, 220, 130, ${(0.12 + pulse * 0.12).toFixed(2)})`;
          ctx.setLineDash([4, 3]);
          ctx.beginPath();
          ctx.arc(sx, sy, 42 + pulse * 4, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
    }

    // Legacy signalDampen remains a data-compatible item id; Noise v1 does not
    // invent a new player receiver modifier for it.

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

    // === EDGE INDICATORS — emitter-owned audible contacts only ===
    {
      ctx.save();
      const margin = 20;
      const w = overlayCanvas.width, h = overlayCanvas.height;

      function drawEdgeArrow(screenX, screenY, color, size) {
        // Clamp to screen edges
        const cx = w / 2, cy = h / 2;
        const dx = screenX - cx, dy = screenY - cy;
        const maxX = w / 2 - margin, maxY = h / 2 - margin;
        if (Math.abs(dx) < maxX && Math.abs(dy) < maxY) return null; // on screen
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
        return { x: ax, y: ay };
      }

      const contacts = prioritizeAudibleContacts(
        [...audibleContactMemory.values()]
          .filter((contact) => contact.live || simState.runElapsedTime < contact.expiresAt),
        { limit: NOISE_CONFIG.world?.contactCap || 5 },
      );
      for (const contact of contacts) {
        const [sx, sy] = worldToScreen(contact.wx, contact.wy, camX, camY, w, h);
        const fading = !contact.live;
        const alpha = fading
          ? Math.max(0, (contact.expiresAt - simState.runElapsedTime) / NOISE_LAST_HEARD_FADE_SECONDS)
          : 0.9;
        const cadence = Math.max(0, Number(contact.cadenceSeconds) || 0);
        const pulse = cadence > 0
          ? 0.86 + 0.14 * (0.5 + 0.5 * Math.sin((simState.runElapsedTime / cadence) * Math.PI * 2))
          : 1;
        const isExfil = contact.sourceKind === 'exfil' || contact.identity === 'EXFIL' || contact.category === 'EXFIL TONE';
        const isInhibitor = contact.sourceKind === 'inhibitor'
          || ['GLITCH', 'SWARM', 'VESSEL', 'VESSEL THRUST'].includes(contact.identity);
        const edgeAlpha = Math.max(0.15, alpha * pulse * 0.8);
        const accentRole = isExfil ? 'flow' : isInhibitor ? 'inhibitor' : 'text';
        const edge = drawEdgeArrow(sx, sy, roleColor(accentRole, edgeAlpha), 7);
        if (edge) {
          const label = contact.identity || contact.category;
          ctx.font = canvasFont(12, { weight: '700' });
          ctx.textAlign = 'center';
          ctx.fillStyle = roleColor(accentRole, Math.max(0.2, alpha * pulse));
          ctx.fillText(`${label} · ${Math.round(contact.rangeMeters || 0)}m`, edge.x, edge.y - 12);
        }
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

      const fadeNear = 0.15;
      const fadeFar = 0.4;

      function labelAlpha(dist) {
        if (dist < fadeNear) return 1.0;
        if (dist > fadeFar) return 0.0;
        return 1.0 - (dist - fadeNear) / (fadeFar - fadeNear);
      }

      // World labels use one ordered stack. The ship instruments and debug
      // ruler reserve collision bounds before nearby objects claim slots.
      const labelEntries = [];
      const labelObstacles = Object.values(getShipLocalLabelSlots({
        shipX: worldToScreen(ship.wx, ship.wy, camX, camY, overlayCanvas.width, overlayCanvas.height)[0],
        shipY: worldToScreen(ship.wx, ship.wy, camX, camY, overlayCanvas.width, overlayCanvas.height)[1],
        canvasW: overlayCanvas.width,
        canvasH: overlayCanvas.height,
      })).map((slot) => slot.bounds);
      if (CONFIG.debug?.showRulerOverlay) {
        labelObstacles.push(getRulerReadoutBounds(overlayCanvas.width, overlayCanvas.height, 11));
      }
      const addLabel = ({ id, order, x, y, text, color, fontSize = 10, weight, backing = false, offsets }) => {
        ctx.font = canvasFont(fontSize, weight ? { weight } : undefined);
        const labelWidth = Math.min(240, ctx.measureText(text).width + (backing ? 14 : 4));
        labelEntries.push({
          id,
          order,
          anchorX: x,
          anchorY: y,
          width: labelWidth,
          height: backing ? 18 : 16,
          text,
          color,
          fontSize,
          weight,
          backing,
          offsets,
        });
      };

      // Wells — foreboding names, dark red, below center.
      for (let index = 0; index < wellSystem.wells.length; index++) {
        const well = wellSystem.wells[index];
        const dist = worldDistance(ship.wx, ship.wy, well.wx, well.wy);
        const a = labelAlpha(dist);
        if (a <= 0) continue;
        const [sx, sy] = worldToScreen(well.wx, well.wy, camX, camY, overlayCanvas.width, overlayCanvas.height);
        const label = safeObjectLabel(well.name, `WELL ${index + 1}`).toUpperCase();
        const labelY = sy + worldRadiusToScreen(well.killRadius, overlayCanvas.width, overlayCanvas.height).ry + 18;
        addLabel({ id: `well-${index}`, order: 10 + index, x: sx, y: labelY, text: label,
          color: `rgba(255, 180, 160, ${a * 0.9})`, weight: 'bold', offsets: [0, 22, -22, 44, -44] });
      }

      // Stars — scientific designation, type-colored.
      for (let index = 0; index < starSystem.stars.length; index++) {
        const star = starSystem.stars[index];
        if (!star.alive) continue;
        const dist = worldDistance(ship.wx, ship.wy, star.wx, star.wy);
        const a = labelAlpha(dist);
        if (a <= 0) continue;
        const [sx, sy] = worldToScreen(star.wx, star.wy, camX, camY, overlayCanvas.width, overlayCanvas.height);
        const [cr, cg, cb] = star.typeDef?.color || [220, 220, 180];
        const haloR = (60 + 20 * (Number(star.mass) || 1)) * (Number(star.typeDef?.sizeMult) || 1);
        addLabel({ id: `star-${index}`, order: 100 + index, x: sx, y: sy + haloR + 10,
          text: safeObjectLabel(star.name, `STAR ${index + 1}`), color: `rgba(${cr}, ${cg}, ${cb}, ${a * 0.6})`,
          offsets: [0, 18, -18, 36, -36] });
      }

      // Planetoids — names, ice blue, trailing behind body.
      for (let index = 0; index < planetoidSystem.planetoids.length; index++) {
        const planetoid = planetoidSystem.planetoids[index];
        if (!planetoid.alive) continue;
        const dist = worldDistance(ship.wx, ship.wy, planetoid.wx, planetoid.wy);
        const a = labelAlpha(dist);
        if (a <= 0) continue;
        const [sx, sy] = worldToScreen(planetoid.wx, planetoid.wy, camX, camY, overlayCanvas.width, overlayCanvas.height);
        addLabel({ id: `planetoid-${index}`, order: 200 + index, x: sx, y: sy + 16,
          text: safeObjectLabel(planetoid.name, `PLANETOID ${index + 1}`), color: `rgba(180, 210, 240, ${a * 0.6})`,
          fontSize: 9, offsets: [0, 18, -18, 36, -36] });
      }

      // Wrecks — dedupe nearby fragments before the shared slot pass.
      const renderedWreckLabels = [];
      for (let index = 0; index < wreckSystem.wrecks.length; index++) {
        const wreck = wreckSystem.wrecks[index];
        if (!wreck.alive) continue;
        const dist = worldDistance(ship.wx, ship.wy, wreck.wx, wreck.wy);
        const a = labelAlpha(dist);
        if (a <= 0) continue;
        const [sx, sy] = worldToScreen(wreck.wx, wreck.wy, camX, camY, overlayCanvas.width, overlayCanvas.height);
        const label = safeObjectLabel(wreck.name, wreck.isEcho ? 'echo wreck' : `${wreck.type || 'wreck'} contact`);
        const labelKey = label.toLowerCase();
        if (renderedWreckLabels.some((rendered) => rendered.key === labelKey && Math.hypot(rendered.sx - sx, rendered.sy - sy) < 170)) continue;
        renderedWreckLabels.push({ key: labelKey, sx, sy });
        const itemText = wreck.looted ? '' : ` (${Array.isArray(wreck.loot) ? wreck.loot.length : 0})`;
        const color = wreck.type === 'vault'
          ? `rgba(255, 215, 60, ${a * 0.7})`
          : wreck.type === 'debris' ? `rgba(180, 140, 80, ${a * 0.6})` : `rgba(160, 180, 200, ${a * 0.6})`;
        addLabel({ id: `wreck-${index}`, order: 300 + index, x: sx, y: sy + 18, text: label + itemText,
          color, backing: true, offsets: [0, 24, -24, 48, -48, 72, -72] });
      }

      // Scavengers — faction + callsign, archetype-colored.
      for (let index = 0; index < scavengerSystem.scavengers.length; index++) {
        const scav = scavengerSystem.scavengers[index];
        if (!scav.alive) continue;
        const dist = worldDistance(ship.wx, ship.wy, scav.wx, scav.wy);
        const a = labelAlpha(dist);
        if (a <= 0) continue;
        const [sx, sy] = worldToScreen(scav.wx, scav.wy, camX, camY, overlayCanvas.width, overlayCanvas.height);
        const color = scav.archetype === 'vulture'
          ? `rgba(212, 160, 96, ${a * 0.7})` : `rgba(138, 174, 196, ${a * 0.7})`;
        addLabel({ id: `scavenger-${index}`, order: 400 + index, x: sx, y: sy - 14,
          text: safeObjectLabel(scav.name, `SCAVENGER ${index + 1}`), color, fontSize: 9,
          offsets: [0, -18, 18, -36, 36] });
      }

      const labelLayout = placePresentationLabels(labelEntries, {
        canvasW: overlayCanvas.width,
        canvasH: overlayCanvas.height,
        obstacles: labelObstacles,
      });
      ctx.textBaseline = 'middle';
      for (const label of labelLayout.placed) {
        ctx.font = canvasFont(label.fontSize, label.weight ? { weight: label.weight } : undefined);
        if (label.backing) {
          ctx.fillStyle = 'rgba(0, 0, 8, 0.62)';
          ctx.fillRect(label.bounds.x, label.bounds.y, label.bounds.w, label.bounds.h);
          ctx.strokeStyle = label.color.replace(/,\s*[^,)]+\)$/, ', 0.28)');
          ctx.strokeRect(label.bounds.x, label.bounds.y, label.bounds.w, label.bounds.h);
        }
        ctx.fillStyle = label.color;
        ctx.fillText(label.text, label.x, label.y);
      }
      ctx.textBaseline = 'alphabetic';

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

    // Signature display — transient and edge-docked so it does not cover the well/fabric read.
    if (currentSignature && simState.runElapsedTime < 3.0) {
      const elapsed = simState.runElapsedTime;
      const fadeIn = Math.min(elapsed / 0.35, 1);
      const fadeOut = elapsed > 2.1 ? 1 - ((elapsed - 2.1) / 0.9) : 1;
      const alpha = Math.max(0, fadeIn * fadeOut);
      const margin = Math.max(28, overlayCanvas.width * 0.055);
      const panelW = Math.min(520, overlayCanvas.width - margin * 2);
      const panelX = Math.min(Math.max(286, overlayCanvas.width * 0.22), overlayCanvas.width - panelW - margin);
      const panelY = Math.max(86, overlayCanvas.height * 0.12);
      const panelH = 88;
      const textX = panelX + 18;
      const textW = panelW - 36;

      ctx.save();
      drawUiPanel(ctx, { x: panelX, y: panelY, w: panelW, h: panelH }, {
        role: 'flow',
        fillAlpha: 0.88 * alpha,
        borderAlpha: 0.22 * alpha,
        cornerLength: 22,
      });
      ctx.textAlign = 'left';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
      ctx.shadowBlur = 12;

      ctx.fillStyle = `rgba(150, 200, 220, ${alpha * 0.9})`;
      ctx.font = canvasFont(13, { weight: '700' });
      ctx.fillText(fitUiText(ctx, `signature lock // ${currentSignature.name}`.toUpperCase(), textW), textX, panelY + 27);

      ctx.fillStyle = `rgba(120, 150, 170, ${alpha * 0.7})`;
      ctx.font = canvasFont(11);
      ctx.fillText(fitUiText(ctx, currentSignature.flavor, textW), textX, panelY + 51);

      ctx.fillStyle = `rgba(100, 130, 150, ${alpha * 0.5})`;
      ctx.font = canvasFont(11);
      ctx.fillText(fitUiText(ctx, currentSignature.mechanical, textW), textX, panelY + 69);

      ctx.restore();
    }

    // Detect scavenger portal consumption in local mode.
    if (!remoteSession.active) {
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
    if (!remoteSession.active) {
      for (const drop of scavengerSystem.deathDrops) {
        for (let i = 0; i < drop.lootCount; i++) {
          const angle = Math.random() * Math.PI * 2;
          const ejectDist = 0.05 + Math.random() * 0.05;
          const ejectSpeed = 0.2 + Math.random() * 0.2;
          const wx = wrapWorld(drop.wx + Math.cos(angle) * ejectDist);
          const wy = wrapWorld(drop.wy + Math.sin(angle) * ejectDist);
          wreckSystem.addWreck(wx, wy, {
            type: 'derelict', tier: drop.tier, size: 'scattered',
            sessionTime: simState.runElapsedTime,
            spawnTime: simState.runElapsedTime,
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

    if (gamePhase === 'playing') {
      // Refresh contact memory before the route rail reads its run-scoped
      // EXFIL discovery latch.
      updateAudibleContactMemory(simState.runElapsedTime);
      audioEngine.updateAudibleContacts([...audibleContactMemory.values()], {
        nowSeconds: simState.runElapsedTime,
      });
    }

    // Update HUD during gameplay
    const cargoItems = inventorySystem.getCargoItems();
    const authoritativePlayer = remoteSession.active
      ? remoteSession.snapshot?.players?.find((player) => player.clientId === simClient?.clientId)
      : null;
    const portalInteraction = authoritativePlayer?.portalInteraction || (() => {
      if (remoteSession.active) return null;
      const portal = portalSystem.checkExtraction(ship.wx, ship.wy);
      return portal ? { portalId: portal.id, portalType: portal.type, ready: true } : null;
    })();
    const slingshotInteraction = getSlingshotInteractionState(
      authoritativePlayer?.slingshot || (remoteSession.active ? null : {
        engaged: ship.slingshotEngaged,
        affordance: !ship.slingshotEngaged
          ? slingshotSystem?.findAffordance(ship, slingshotSystem.collectAnchors(wellSystem, starSystem, planetoidSystem))?.anchor
          : null,
      }),
    );
    if (gamePhase === 'playing') updateHUD(simState.runElapsedTime, portalSystem, cargoItems,
      remoteSession.active ? (remoteSession.snapshot?.world?.growthTimer ?? 0) : simState.growthTimer, {
      terminal: gamePhase === 'dead' || gamePhase === 'escaped' || authoritativePlayer?.status === 'escaped'
        || authoritativePlayer?.status === 'dead' || ship.status === 'dead',
      scavengerSystem,
      combatSystem,
      signature: currentSignature,
      inventorySystem,
      inventoryOpen,
      noise: noiseState,
      routeDiscovery: { ...routeDiscoveryState, portalInteraction },
      abilityState: localAbilityState,
      inhibitorState,
      ship,
      hullState: authoritativePlayer ? {
        status: authoritativePlayer.status,
        shieldCharges: authoritativePlayer.effectState?.shieldCharges || 0,
        graceRemaining: authoritativePlayer.effectState?.hullGraceRemaining || 0,
        ratio: authoritativePlayer.status === 'dead' ? 0 : 1,
      } : { status: ship.status || 'alive', ratio: ship.status === 'dead' ? 0 : 1 },
      interaction: portalInteraction?.ready ? {
        action: 'extract',
        label: 'confirm extraction',
        detail: 'remain inside cyan aperture',
        verb: 'extract',
      } : slingshotInteraction,
      portalSchedule: remoteSession.active ? remoteSession.snapshot?.portalSchedule : null,
      runDurationSeconds: remoteSession.active ? remoteSession.snapshot?.session?.runDurationSeconds : null,
      wellCount: wellSystem?.wells?.length || 1,
      deckMode: isDeckMode(),
      lastInputSource: inputManager.lastInputSource,
      camX, camY,
      canvasW: overlayCanvas.width,
      canvasH: overlayCanvas.height,
    });
  }

  // One idempotent owner covers every non-terminal phase, including pause and
  // direct recovery paths. Results retain their accepted terminal fade.
  syncHUDPhase(gamePhase);

  rulerOverlayStats = drawRulerOverlay(ctx, {
    presentation,
    canvasW: overlayCanvas.width,
    canvasH: overlayCanvas.height,
    reducedMotion: currentUiMotionSettings().reducedMotion,
  });

  // 9. FPS + debug display
  if (CONFIG.debug.showFPS) {
    const pixelScale = worldPixelScale(overlayCanvas.width, overlayCanvas.height);
    ctx.save();
    ctx.fillStyle = '#00ff00';
    ctx.font = canvasFont(14);
    ctx.fillText(`FPS: ${fps.toFixed(0)}`, 10, 20);
    ctx.fillText(`Ship: (${ship.wx.toFixed(2)}, ${ship.wy.toFixed(2)})`, 10, 38);
    ctx.fillText(`Vel px: (${(ship.vx * pixelScale.x).toFixed(1)}, ${(ship.vy * pixelScale.y).toFixed(1)})`, 10, 56);
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
    ctx.font = canvasFont(11);
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
  if (CONFIG.debug.showCoordDiagnostic && !isTitleBackdropActive()) {
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
      ctx.font = canvasFont(12);
      ctx.fillText(`well(${well.wx.toFixed(2)}, ${well.wy.toFixed(2)})`, sx + 12, sy - 4);
    }
    ctx.restore();
  }

  // 12. Debug: well radii and labels
  if (CONFIG.debug.showWellRadii && !isTitleBackdropActive()) {
    const drawWorldRadius = (x, y, radius) => {
      const r = worldRadiusToScreen(radius, overlayCanvas.width, overlayCanvas.height);
      ctx.beginPath();
      ctx.ellipse(x, y, r.rx, r.ry, 0, 0, Math.PI * 2);
      ctx.stroke();
    };
    ctx.save();
    const wellData = wellSystem.getWellData(camX, camY, overlayCanvas.width, overlayCanvas.height);
    for (let i = 0; i < wellData.length; i++) {
      const w = wellData[i];
      ctx.strokeStyle = 'rgba(255, 100, 0, 0.3)';
      ctx.lineWidth = 1;
      drawWorldRadius(w.x, w.y, 0.15);
      drawWorldRadius(w.x, w.y, 0.3);
      drawWorldRadius(w.x, w.y, 0.5);
      // Kill radius
      ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)';
      drawWorldRadius(w.x, w.y, wellSystem.wells[i].killRadius);
      // Label
      ctx.fillStyle = 'rgba(255, 50, 0, 0.5)';
      ctx.beginPath(); ctx.arc(w.x, w.y, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ff6633';
      ctx.font = canvasFont(11);
      ctx.fillText(`W${i} m:${wellSystem.wells[i].mass.toFixed(2)}`, w.x + 8, w.y - 6);
    }

    // Stars
    for (let i = 0; i < starSystem.stars.length; i++) {
      const star = starSystem.stars[i];
      const [sx, sy] = worldToScreen(star.wx, star.wy, camX, camY, overlayCanvas.width, overlayCanvas.height);
      ctx.strokeStyle = 'rgba(255, 255, 100, 0.3)';
      ctx.lineWidth = 1;
      drawWorldRadius(sx, sy, uvToWorld(CONFIG.stars.rayLength));
      ctx.fillStyle = 'rgba(255, 255, 100, 0.6)';
      ctx.beginPath(); ctx.arc(sx, sy, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffff66';
      ctx.font = canvasFont(11);
      ctx.fillText(`S${i} m:${star.mass.toFixed(2)}`, sx + 8, sy - 6);
    }

    // Loot anchors removed — positions converted to stars

    // Portals
    for (let i = 0; i < portalSystem.portals.length; i++) {
      const portal = portalSystem.portals[i];
      const [px, py] = worldToScreen(portal.wx, portal.wy, camX, camY, overlayCanvas.width, overlayCanvas.height);
      const captureR = worldRadiusToScreen(CONFIG.portals.captureRadius, overlayCanvas.width, overlayCanvas.height);
      ctx.strokeStyle = 'rgba(180, 80, 255, 0.4)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.ellipse(px, py, captureR.rx, captureR.ry, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#b855ff';
      ctx.font = canvasFont(11);
      ctx.fillText(`P${i}`, px + 8, py - 6);
    }

    ctx.restore();
  }

  // === TITLE SCREEN ===
  if (!rendererFixtureActive && gamePhase === 'title') {
    const w = overlayCanvas.width, h = overlayCanvas.height;
    drawTitleScreenOverlay(ctx, w, h, totalTime, titleTimer);
  }

  // === PROFILE SELECT SCREEN ===
  if (!rendererFixtureActive && gamePhase === 'profileSelect') {
    const cx = overlayCanvas.width / 2;
    const profileFooterActions = profileActions();
    const profileLayout = profileSurfaceLayout(overlayCanvas.width, overlayCanvas.height, profileFooterActions);

    ctx.save();
    const w = overlayCanvas.width, h = overlayCanvas.height;
    ctx.fillStyle = 'rgba(0, 2, 12, 0.80)';
    ctx.fillRect(0, 0, w, h);
    drawUiScanlines(ctx, w, h, currentUiMotionSettings().reducedMotion ? 0 : 0.025, 4);
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
    ctx.shadowBlur = 8;

    // Terminal frame — title is the only label (no double)
    const motion = currentUiMotionSettings();
    const windowState = sampleTerminalWindow(uiMotionTimer, {
      duration: motion.windowDuration,
      reducedMotion: motion.reducedMotion,
    });
    const focusPulse = uiFocusPulseAmount();
    const panelRect = profileLayout.panel;
    drawTerminalWindow(ctx, panelRect, {
      state: windowState,
      origin: 'top-left',
      role: 'flow',
      fillAlpha: 0.88,
      borderAlpha: 0.34,
      cornerLength: 34,
    });
    ctx.globalAlpha *= windowState.content;

    ctx.fillStyle = 'rgba(160, 230, 245, 0.95)';
    ctx.font = canvasFont(22, { role: 'display', weight: '700' });
    ctx.fillText('SELECT PILOT', cx, profileLayout.heading.y + 24);

    for (let i = 0; i < 3; i++) {
      const selected = (profileCursor === i);
      const profile = profileManager.slots[i];
      const row = profileLayout.rows[i];
      const rowReveal = staggerProgress(uiMotionTimer, i, {
        delay: 0.22,
        stagger: motion.rowStagger,
        reducedMotion: motion.reducedMotion,
      });
      ctx.save();
      ctx.globalAlpha *= rowReveal;

      // Selection highlight
      if (selected) {
        ctx.fillStyle = `rgba(60, 80, 120, ${(0.4 + 0.12 * focusPulse).toFixed(3)})`;
        ctx.fillRect(row.x, row.y, row.w, row.h);
        ctx.strokeStyle = `rgba(100, 150, 255, ${(0.6 + 0.25 * focusPulse).toFixed(3)})`;
        ctx.lineWidth = 1;
        ctx.strokeRect(row.x, row.y, row.w, row.h);
      }

      if (profile) {
        ctx.fillStyle = selected ? 'rgba(230, 240, 255, 1)' : 'rgba(180, 190, 210, 0.85)';
        ctx.font = canvasFont(18, { weight: 'bold' });
        ctx.fillText(fitUiText(ctx, profile.name, row.w - UI_DECK_GEOMETRY.listRow.paddingX * 2), cx, row.y + 30);
        ctx.font = canvasFont(14);
        ctx.fillStyle = selected ? 'rgba(255, 225, 110, 0.95)' : 'rgba(180, 170, 140, 0.6)';
        ctx.fillText(fitUiText(ctx, `${profile.exoticMatter} EM  |  ${profile.totalExtractions} extractions`, row.w - UI_DECK_GEOMETRY.listRow.paddingX * 2), cx, row.y + 55);
      } else {
        ctx.fillStyle = selected ? 'rgba(170, 195, 220, 0.9)' : 'rgba(120, 130, 150, 0.5)';
        ctx.font = canvasFont(16);
        ctx.fillText('— empty slot —', cx, row.y + 35);
      }

      ctx.restore();
    }

    // Name input overlay
    if (nameInputActive) {
      drawUiPanel(ctx, profileLayout.nameOverlay, {
        role: 'flow', fillAlpha: 0.86, borderAlpha: 0.62, cornerLength: 22,
      });
      ctx.fillStyle = 'rgba(200, 200, 220, 0.7)';
      ctx.font = canvasFont(12);
      ctx.fillText('type pilot name', cx, profileLayout.nameOverlay.y + 25);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.font = canvasFont(18);
      const blink = Math.sin(totalTime * 6) > 0 ? '|' : '';
      ctx.fillText(nameInputBuffer + blink, cx, profileLayout.nameOverlay.y + 55);
    }

    // Delete confirmation overlay
    if (deleteConfirmSlot >= 0) {
      drawUiPanel(ctx, profileLayout.deleteOverlay, {
        role: 'danger', fillAlpha: 0.86, borderAlpha: 0.64, cornerLength: 22,
      });
      ctx.fillStyle = 'rgba(255, 100, 80, 0.9)';
      ctx.font = canvasFont(13);
      ctx.fillText(`delete "${profileManager.slots[deleteConfirmSlot]?.name}"?`, cx, profileLayout.deleteOverlay.y + 28);
      ctx.font = canvasFont(12);
      ctx.fillStyle = deleteConfirmChoice === 'cancel' ? 'rgba(255, 255, 255, 0.98)' : 'rgba(180, 180, 200, 0.62)';
      ctx.fillText('[ CANCEL ]', cx - 74, profileLayout.deleteOverlay.y + 54);
      ctx.fillStyle = deleteConfirmChoice === 'delete' ? 'rgba(255, 150, 120, 0.98)' : 'rgba(180, 180, 200, 0.62)';
      ctx.fillText('[ DELETE ]', cx + 74, profileLayout.deleteOverlay.y + 54);
    }

    // Controls hint: glyphs remain separate from the selected action label.
    drawActionFooter(ctx, profileLayout.footer.drawX, profileLayout.footer.drawY, profileFooterActions, {
      alpha: 0.76,
      maxWidth: profileLayout.footer.contentWidth,
      backing: true,
      backingRole: 'flow',
    });

    ctx.restore();
  }

  // === HOME SCREEN ===
  if (!rendererFixtureActive && gamePhase === 'home') {
    const p = profileManager.active;
    const w = overlayCanvas.width, h = overlayCanvas.height;

    ctx.save();
    ctx.fillStyle = 'rgba(0, 2, 12, 0.74)';
    ctx.fillRect(0, 0, w, h);
    drawUiScanlines(ctx, w, h, 0.025, 4);
    ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
    ctx.shadowBlur = 8;

    const motion = currentUiMotionSettings();
    const contentReveal = uiContentReveal(0.1);
    const focusPulse = uiFocusPulseAmount();
    const homePromptOptions = currentPromptOptions();
    const homeFooterActions = homeActions(homePromptOptions);
    const panelLayout = threePanelLayout(w, h, 'home', window.innerWidth, {
      rightFooterActions: homeFooterActions,
      footerGap: 10,
    });
    const { gap, panelH } = panelLayout;
    const { left: leftPanel, center: centerPanel, right: rightPanel } = panelLayout;

    drawTerminalWindow(ctx, leftPanel, {
      state: sampleTerminalWindow(uiMotionTimer, { duration: motion.windowDuration, reducedMotion: motion.reducedMotion }),
      origin: 'top-left', role: 'flow', fillAlpha: 0.88, borderAlpha: 0.30, cornerLength: 34,
    });
    drawTerminalWindow(ctx, centerPanel, {
      state: sampleTerminalWindow(uiMotionTimer, { delay: 0.05, duration: motion.windowDuration, reducedMotion: motion.reducedMotion }),
      origin: 'top-left', role: homeTabRole(homeTab), fillAlpha: 0.86, borderAlpha: 0.26, cornerLength: 42,
    });
    drawTerminalWindow(ctx, rightPanel, {
      state: sampleTerminalWindow(uiMotionTimer, { delay: 0.10, duration: motion.windowDuration, reducedMotion: motion.reducedMotion }),
      origin: 'top-right', role: 'salvage', fillAlpha: 0.88, borderAlpha: 0.34, cornerLength: 34,
    });
    ctx.globalAlpha *= contentReveal;

    const pilotName = p?.name || 'unclaimed pilot';
    const hullType = p?.hullType || p?.shipType || 'drifter';
    const hullName = String(hullType).toUpperCase();
    const bestSecs = Math.max(0, Math.floor(p?.bestSurvivalTime || 0));
    const bestLabel = formatClock(bestSecs);
    const vaultCount = Array.isArray(p?.vault) ? p.vault.length : 0;
    const vaultCapacity = Number(p?.vaultCapacity) || 0;
    const equippedCount = p?.loadout?.equipped?.filter(Boolean).length || 0;
    const consumableCount = p?.loadout?.consumables?.filter(Boolean).length || 0;
    const totalRuns = (Number(p?.totalExtractions) || 0) + (Number(p?.totalDeaths) || 0);

    ctx.textAlign = 'left';
    ctx.font = canvasFont(18, { weight: '700' });
    ctx.fillStyle = roleColor('text', 0.94);
    ctx.fillText(fitUiText(ctx, pilotName.toUpperCase(), leftPanel.w - 34), leftPanel.x + 18, leftPanel.y + 52);
    ctx.font = canvasFont(12);
    ctx.fillStyle = roleColor('muted', 0.78);
    ctx.fillText(`${hullName} // ${totalRuns} cycles`, leftPanel.x + 18, leftPanel.y + 74);

    const tabY = leftPanel.y + 104;
    for (let i = 0; i < HOME_TABS.length; i++) {
      const role = homeTabRole(i);
      const row = { x: leftPanel.x + UI_DECK_GEOMETRY.panel.paddingX, y: tabY + i * (UI_DECK_GEOMETRY.listRow.minHeight + UI_DECK_GEOMETRY.separation), w: leftPanel.w - UI_DECK_GEOMETRY.panel.paddingX * 2, h: UI_DECK_GEOMETRY.listRow.minHeight };
      const active = homeTab === i;
      drawSelectedRow(ctx, row, {
        role,
        active: true,
        alpha: active ? 0.96 : 0.42,
        fillAlpha: active ? 0.20 + focusPulse * 0.06 : 0.045,
        borderAlpha: active ? 0.70 + focusPulse * 0.12 : 0.14,
        railWidth: active ? 5 : 2,
      });
      ctx.font = canvasFont(active ? 16 : 14, { weight: active ? '700' : '500' });
      ctx.fillStyle = active ? roleColor('text', 0.95) : roleColor('muted', 0.72);
      ctx.fillText(HOME_TABS[i], row.x + UI_DECK_GEOMETRY.listRow.paddingX, row.y + 23);
      ctx.font = canvasFont(11);
      ctx.fillStyle = roleColor(role, active ? 0.75 : 0.36);
      const tabCopy = i === 0 ? 'loadout / hull'
        : i === 1 ? 'salvage hold'
          : i === 2 ? 'rig tuning'
            : i === 3 ? 'records / echoes'
              : 'route commit';
      ctx.fillText(fitUiText(ctx, tabCopy.toUpperCase(), row.w - UI_DECK_GEOMETRY.listRow.paddingX * 2), row.x + UI_DECK_GEOMETRY.listRow.paddingX, row.y + 42);
    }

    ctx.textAlign = 'left';
    const centerX = centerPanel.x + UI_DECK_GEOMETRY.panel.paddingX;
    const centerY = centerPanel.y + 54;
    const centerTextW = centerPanel.w - UI_DECK_GEOMETRY.panel.paddingX * 2;
    drawSectionLabel(ctx, HOME_TABS[homeTab], centerX, centerPanel.y + 32, { role: homeTabRole(homeTab), alpha: 0.94 });
    if (p) {
      if (homeTab === 0) {
      // === SHIP subscreen ===
      const HULL_LABEL_COLORS = {
        DRIFTER: 'rgba(100, 200, 240, 0.9)', BREACHER: 'rgba(255, 140, 60, 0.9)',
        RESONANT: 'rgba(180, 120, 255, 0.9)', SHROUD: 'rgba(140, 160, 170, 0.8)',
        HAULER: 'rgba(220, 200, 100, 0.9)',
      };
      ctx.fillStyle = HULL_LABEL_COLORS[hullName] || roleColor('flow', 0.86);
      ctx.font = canvasFont(20, { role: 'display', weight: '700' });
      ctx.fillText(hullName, centerX, centerY);
      const movementStats = inventorySystem?.getMovementStats?.() || {};
      const deltaVStats = inventorySystem?.getDeltaVStats?.() || {};
      const hullDefinition = HULL_DEFINITIONS[hullType] || HULL_DEFINITIONS.drifter;
      const hullStats = formatHullStats(hullDefinition, {
        thrustScale: (hullDefinition.thrustScale || 1) * (movementStats.thrustScale || 1),
        dragScale: (hullDefinition.dragScale || 1) * (movementStats.dragScale || 1),
        currentCoupling: (hullDefinition.currentCoupling || 1) * (movementStats.currentCoupling || 1),
        deltaVMax: (hullDefinition.deltaVMax || 0) * (deltaVStats.deltaVCapacityMult || 1),
      });
      const compactStatStrip = centerPanel.w < 460;
      const shipPreviewScale = compactStatStrip ? 0.84 : 1.08;
      const shipPreviewX = centerPanel.x + centerPanel.w * 0.71;
      // The portrait owns the right third of this panel at Deck width.  Keep
      // stats inside the remaining rail; compact labels preserve the actual
      // values instead of letting a fitted sentence disappear under the art.
      const hullStatWidth = Math.max(120, Math.min(
        centerTextW * 0.58,
        shipPreviewX - centerX - (112 * shipPreviewScale / 2) - 18,
      ));
      for (const [index, stat] of hullStats.entries()) {
        drawKeyValueRow(ctx, stat.label, `${stat.base} → ${stat.fitted}`, centerX, centerY + 27 + index * 17, {
          rowWidth: hullStatWidth,
          valueRole: stat.base === stat.fitted ? 'text' : 'salvage',
        });
      }
      drawHomeShipSprite(ctx, shipPreviewX, centerPanel.y + 142, {
        scale: shipPreviewScale,
        hullType,
        role: 'flow',
        alpha: 0.98,
        pulse: focusPulse,
      });

      ctx.textAlign = 'left';
      // This dense strip has three independent text bands. Measure the hull
      // control footer before continuing so its glyphs cannot sit on the rig
      // tracks or loadout heading.
      let sy = centerY + 88;
      drawSectionLabel(ctx, 'flight hull', centerX, sy, { role: 'flow', alpha: 0.86 });
      sy += 24;
      for (const publicHullId of PUBLIC_HULL_IDS) {
        const selected = publicHullId === hullType;
        const definition = HULL_DEFINITIONS[publicHullId];
        ctx.font = canvasFont(12, { weight: selected ? '700' : '500' });
        ctx.fillStyle = selected ? roleColor('text', 0.96) : roleColor('muted', 0.55);
        ctx.fillText(`${selected ? '>' : ' '} ${String(definition?.name || publicHullId).toUpperCase()}`, centerX, sy);
        ctx.fillStyle = selected ? roleColor('flow', 0.8) : roleColor('muted', 0.4);
        ctx.font = canvasFont(10);
        ctx.fillText(
          fitUiText(ctx, String(PUBLIC_HULL_COPY[publicHullId] || 'flight-ready hull').toUpperCase(), 220),
          centerX + 100,
          sy
        );
        sy += 20;
      }
      const hullActions = [
        { descriptor: actionDescriptor('hullPrev', currentPromptOptions()), verb: 'previous hull' },
        { descriptor: actionDescriptor('hullNext', currentPromptOptions()), verb: 'next hull' },
      ];
      const hullFooterWidth = centerTextW * 0.72;
      const hullFooterY = sy + 4;
      const hullFooter = measureActionFooter(hullActions, { gap: 10, maxWidth: hullFooterWidth });
      drawActionFooter(ctx, centerX, hullFooterY, hullActions,
        { alpha: 0.64, gap: 10, maxWidth: hullFooterWidth });
      sy = hullFooterY + hullFooter.height + 16;

      const shipRigTracks = profileManager.getRigProgression()?.tracks || [];
      const rigCellW = (centerTextW * 0.72) / Math.max(1, shipRigTracks.length);
      shipRigTracks.forEach((track, index) => {
        drawKeyValueRow(ctx, String(track.label).toLowerCase(), `${track.level || 0}/${track.maxLevel}`, centerX + index * rigCellW, sy, {
          labelWidth: Math.max(68, rigCellW - 34),
          valueWidth: 32,
          valueRole: 'ecology',
        });
      });
      sy += 22;

      drawSectionLabel(ctx, 'loadout', centerX, sy, { role: 'salvage', alpha: 0.86 });
      sy += 24;
      const loadoutRowH = Math.max(
        UI_DECK_GEOMETRY.listRow.minHeight,
        UI_DECK_GEOMETRY.iconCell.minHeight + UI_DECK_GEOMETRY.listRow.paddingY * 2,
      );
      const loadoutRowGap = UI_DECK_GEOMETRY.separation;
      ctx.font = canvasFont(12);
      for (let i = 0; i < 2; i++) {
        const eq = p.loadout.equipped[i];
        const sel = (homeShipCursor === i);
        const row = { x: centerX - 6, y: sy, w: centerTextW * 0.72, h: loadoutRowH };
        drawSelectedRow(ctx, row, {
          role: 'salvage',
          active: true,
          alpha: sel ? 0.82 + focusPulse * 0.18 : 0.28,
          fillAlpha: sel ? 0.18 : 0.04,
          borderAlpha: sel ? 0.58 : 0.12,
          railWidth: sel ? 4 : 2,
        });
        ctx.fillStyle = eq ? roleColor('salvage', 0.9) : roleColor('muted', 0.48);
        const action = sel && eq ? { descriptor: actionDescriptor('confirm', currentPromptOptions()), verb: 'unequip' } : null;
        if (eq) drawItemIcon(ctx, eq, { x: centerX, y: sy + 4, w: UI_DECK_GEOMETRY.iconCell.minWidth, h: UI_DECK_GEOMETRY.iconCell.minHeight }, { state: 'equipped', selected: sel });
        const actionX = row.x + row.w - 94;
        ctx.fillText(fitUiText(ctx, `equip ${i + 1}: ${eq ? eq.name : '- empty -'}`, Math.max(48, (action ? actionX : row.x + row.w) - (centerX + 54) - 8)), centerX + 54, sy + 29);
        if (action) drawActionPrompt(ctx, { x: actionX, y: sy + 10, w: 90, h: UI_DECK_GEOMETRY.actionGlyph.minHeight }, action.descriptor, { verb: action.verb, alpha: 0.82, color: roleColor('salvage') });
        sy += loadoutRowH + loadoutRowGap;
      }
      for (let i = 0; i < 2; i++) {
        const con = p.loadout.consumables[i];
        const sel = (homeShipCursor === i + 2);
        const row = { x: centerX - 6, y: sy, w: centerTextW * 0.72, h: loadoutRowH };
        drawSelectedRow(ctx, row, {
          role: 'anomaly',
          active: true,
          alpha: sel ? 0.82 + focusPulse * 0.18 : 0.26,
          fillAlpha: sel ? 0.16 : 0.04,
          borderAlpha: sel ? 0.56 : 0.12,
          railWidth: sel ? 4 : 2,
        });
        ctx.fillStyle = con ? roleColor('anomaly', 0.86) : roleColor('muted', 0.48);
        const action = sel && con ? { descriptor: actionDescriptor('confirm', currentPromptOptions()), verb: 'remove' } : null;
        if (con) drawItemIcon(ctx, con, { x: centerX, y: sy + 4, w: UI_DECK_GEOMETRY.iconCell.minWidth, h: UI_DECK_GEOMETRY.iconCell.minHeight }, { state: 'consumable', selected: sel });
        const actionX = row.x + row.w - 94;
        ctx.fillText(fitUiText(ctx, `hotbar ${i + 1}: ${con ? con.name : '- empty -'}`, Math.max(48, (action ? actionX : row.x + row.w) - (centerX + 54) - 8)), centerX + 54, sy + 29);
        if (action) drawActionPrompt(ctx, { x: actionX, y: sy + 10, w: 90, h: UI_DECK_GEOMETRY.actionGlyph.minHeight }, action.descriptor, { verb: action.verb, alpha: 0.82, color: roleColor('anomaly') });
        sy += loadoutRowH + loadoutRowGap;
      }

    } else if (homeTab === 1 && p) {
      // === VAULT subscreen ===
      ctx.fillStyle = roleColor('salvage', 0.92);
      ctx.font = canvasFont(18, { weight: '700' });
      ctx.fillText(`VAULT ${p.vault.length}/${p.vaultCapacity}`, centerX, centerY);
      ctx.font = canvasFont(12);
      let vy = centerY + 34;
      const vaultRowH = Math.max(UI_DECK_GEOMETRY.listRow.minHeight, UI_DECK_GEOMETRY.valueBlock.minHeight + 6);
      const maxVisible = Math.min(p.vault.length, Math.max(4, Math.floor((centerPanel.h - 220) / (vaultRowH + UI_DECK_GEOMETRY.separation))));
      const scrollStart = Math.max(0, homeVaultCursor - 6);
      for (let i = scrollStart; i < Math.min(p.vault.length, scrollStart + maxVisible); i++) {
        const item = p.vault[i];
        const selected = (i === homeVaultCursor);
        const row = { x: centerX - 6, y: vy - 6, w: centerTextW, h: vaultRowH };
        drawSelectedRow(ctx, row, {
          role: 'salvage',
          active: true,
          alpha: selected ? 0.82 + focusPulse * 0.18 : 0.26,
          fillAlpha: selected ? 0.16 : 0.035,
          borderAlpha: selected ? 0.56 : 0.10,
          railWidth: selected ? 4 : 2,
        });
        const tierColor = TIER_COLORS[item.tier] || 'rgba(180, 180, 190, 0.8)';
        drawItemIcon(ctx, item, { x: centerX, y: row.y + 4, w: UI_DECK_GEOMETRY.iconCell.minWidth, h: UI_DECK_GEOMETRY.iconCell.minHeight }, { state: 'vault', selected });
        ctx.fillStyle = tierColor;
        const tierLabel = typeof item.tier === 'number' ? `T${item.tier} ` : '';
        const affinityTag = item.affinity ? ` [${item.affinity}]` : '';
        const slotTag = formatSlotIdentity(item).toUpperCase();
        ctx.fillText(fitUiText(ctx, `${tierLabel}${item.name}${affinityTag}`, centerTextW - 184), centerX + 56, vy + 18);
        ctx.fillStyle = roleColor('muted', 0.72);
        ctx.font = canvasFont(10);
        ctx.fillText(slotTag, centerX + 56, vy + 36);
        ctx.textAlign = 'right';
        ctx.font = canvasFont(11);
        ctx.fillText(`${item.value || '?'} EM`, centerX + centerTextW - 12, vy + 24);
        ctx.textAlign = 'left';
        vy += vaultRowH + UI_DECK_GEOMETRY.separation;
      }
      if (p.vault.length === 0) {
        ctx.fillStyle = roleColor('muted', 0.48);
        ctx.fillText('- vault empty -', centerX, vy);
      }

      // Item description for selected vault item
      if (p.vault[homeVaultCursor]) {
        const selItem = p.vault[homeVaultCursor];
        const detailRect = {
          x: centerX - 6,
          y: centerPanel.y + centerPanel.h - 148,
          w: centerTextW,
          h: 82,
        };
        drawSelectedRow(ctx, detailRect, {
          role: selItem.subcategory === 'consumable' ? 'anomaly' : 'salvage',
          active: true,
          alpha: 0.82,
          fillAlpha: 0.12,
          borderAlpha: 0.30,
          railWidth: 3,
        });
        ctx.fillStyle = roleColor('text', 0.94);
        ctx.font = canvasFont(12, { weight: '700' });
        ctx.fillText(fitUiText(ctx, String(selItem.name || 'selected item').toUpperCase(), detailRect.w - 132), detailRect.x + 12, detailRect.y + 22);
        ctx.fillStyle = roleColor('muted', 0.78);
        ctx.font = canvasFont(10);
        ctx.fillText(`${formatSlotIdentity(selItem).toUpperCase()} // ${selItem.affinity ? `${selItem.affinity} HULL` : 'GENERAL FIT'}`, detailRect.x + 12, detailRect.y + 39);
        const effects = formatItemEffects(selItem).join('  //  ');
        ctx.fillStyle = roleColor('salvage', 0.90);
        ctx.font = canvasFont(11, { weight: '700' });
        ctx.fillText(fitUiText(ctx, effects, detailRect.w - 132), detailRect.x + 12, detailRect.y + 60);
        let action = 'sell';
        if (selItem.subcategory === 'equippable') action = 'equip';
        else if (selItem.subcategory === 'consumable') action = 'load';
        drawActionPrompt(ctx, {
          x: detailRect.x + detailRect.w - 106,
          y: detailRect.y + 24,
          w: 92,
          h: UI_DECK_GEOMETRY.actionGlyph.minHeight,
        }, actionDescriptor('confirm', currentPromptOptions()), { verb: action, alpha: 0.90, color: roleColor('salvage') });
      }

    } else if (homeTab === 2 && p) {
      // === RIG subscreen ===
      const rig = profileManager.getRigProgression();
      const tracks = rig?.tracks || [];
      ctx.fillStyle = roleColor('flow', 0.92);
      ctx.font = canvasFont(18, { weight: '700' });
      ctx.fillText(`RIG: ${String(rig?.hullType || p.hullType || 'drifter').toUpperCase()}`, centerX, centerY);
      ctx.font = canvasFont(12);
      let uy = centerY + 34;
      for (let ti = 0; ti < tracks.length; ti++) {
        const track = tracks[ti];
        const rank = track.level || 0;
        const maxLevel = Math.max(0, Number(track.maxLevel) || 0);
        const selected = (ti === homeRigCursor);
        const cost = profileManager.getRigUpgradeCost(ti);
        const canAfford = profileManager.canAffordRigUpgrade(ti);

        drawSelectedRow(ctx, { x: centerX - 6, y: uy - 17, w: centerTextW, h: 52 }, {
          role: canAfford ? 'flow' : 'muted',
          active: true,
          alpha: selected ? 0.82 + focusPulse * 0.18 : 0.24,
          fillAlpha: selected ? 0.15 : 0.035,
          borderAlpha: selected ? 0.52 : 0.10,
          railWidth: selected ? 4 : 2,
        });

        ctx.fillStyle = selected ? roleColor('text', 0.92) : roleColor('muted', 0.70);
        ctx.fillText(String(track.label).toLowerCase(), centerX + 4, uy);
        ctx.textAlign = 'right';
        ctx.fillText(`${Math.min(rank, maxLevel)}/${maxLevel}`, centerX + centerTextW - 8, uy);
        ctx.textAlign = 'left';
        drawSegmentedGauge(ctx, { x: centerX + 4, y: uy + 7, w: 132, h: 12 }, {
          value: rank, max: maxLevel, segments: Math.max(1, maxLevel), role: 'flow', alpha: 0.86,
        });
        ctx.fillStyle = roleColor('muted', 0.74);
        ctx.fillText(fitUiText(ctx, track.focus, centerTextW - 180), centerX + 152, uy + 17);

        if (cost) {
          ctx.fillStyle = canAfford ? roleColor('muted', 0.78) : roleColor('danger', 0.76);
          const action = selected && canAfford ? { descriptor: actionDescriptor('confirm', currentPromptOptions()), verb: 'buy' } : null;
          const actionX = centerX + centerTextW - 98;
          ctx.fillText(fitUiText(ctx, `next: ${cost.nextEffect || track.nextEffect || 'rig tuning'}  cost: ${cost.em} EM`, Math.max(56, (action ? actionX : centerX + centerTextW) - (centerX + 22) - 8)), centerX + 22, uy + 31);
          if (action) drawActionPrompt(ctx, { x: actionX, y: uy + 3, w: 90, h: UI_DECK_GEOMETRY.actionGlyph.minHeight }, action.descriptor, { verb: action.verb, alpha: 0.82, color: roleColor('flow') });
        } else {
          ctx.fillStyle = roleColor('muted', 0.72);
          ctx.fillText('max', centerX + 22, uy + 31);
        }

        uy += 60;
      }

    } else if (homeTab === 3 && p) {
      // === CHRONICLE subscreen ===
      const chronicle = buildChronicleViewModel();
      ctx.fillStyle = roleColor('anomaly', 0.88);
      ctx.font = canvasFont(18, { weight: '700' });
      ctx.fillText('CHRONICLE', centerX, centerY);
      ctx.textAlign = 'right';
      ctx.fillStyle = roleColor('muted', 0.78);
      ctx.font = canvasFont(11);
      ctx.fillText(`${chronicle.stats.totalRuns} cycles  ${chronicle.stats.totalExoticMatterEarned} EM earned`, centerX + centerTextW, centerY);
      ctx.textAlign = 'left';

      const statY = centerY + 34;
      drawSelectedRow(ctx, { x: centerX - 6, y: statY - 17, w: centerTextW, h: 46 }, {
        role: 'anomaly',
        active: true,
        alpha: 0.34,
        fillAlpha: 0.10,
        borderAlpha: 0.18,
      });
      ctx.fillStyle = roleColor('text', 0.82);
      ctx.font = canvasFont(12);
      ctx.fillText(`best survival ${chronicle.stats.bestSurvivalLabel}`, centerX + 8, statY);
      ctx.fillText(`extract/death ${chronicle.stats.totalExtractions}/${chronicle.stats.totalDeaths}`, centerX + 242, statY);
      ctx.fillStyle = roleColor('salvage', 0.78);
      ctx.fillText(`${chronicle.stats.exoticMatter} EM now`, centerX + 8, statY + 18);
      ctx.fillStyle = roleColor('muted', 0.72);
      ctx.fillText(`vault ${chronicle.stats.vaultCount}/${chronicle.stats.vaultCapacity}`, centerX + 242, statY + 18);

      let cyLine = centerY + 96;
      drawSectionLabel(ctx, 'recent cycles', centerX, cyLine, { role: 'flow', alpha: 0.84 });
      cyLine += 20;
      ctx.font = canvasFont(11);
      if (chronicle.records.length === 0) {
        ctx.fillStyle = roleColor('muted', 0.48);
        ctx.fillText('- no recorded cycles yet -', centerX, cyLine);
        cyLine += 18;
      } else {
        for (const record of chronicle.records.slice(0, 5)) {
          const extracted = record.outcome === 'extracted';
          ctx.fillStyle = extracted ? roleColor('ecology', 0.82) : roleColor('danger', 0.76);
          const outcome = extracted ? 'extracted' : record.outcome;
          const cue = record.notable || record.deathCause || record.noiseSource || '';
          const line = `${outcome.padEnd(9)} ${record.survivalLabel}  ${record.hullType}  ${record.mapId}  +${record.emEarned} EM  cargo ${record.cargoCount}`;
          ctx.fillText(fitUiText(ctx, line, centerTextW), centerX, cyLine);
          if (cue) {
            ctx.fillStyle = roleColor('muted', 0.60);
            ctx.fillText(fitUiText(ctx, String(cue), centerTextW - 18), centerX + 18, cyLine + 13);
            cyLine += 31;
          } else {
            cyLine += 18;
          }
        }
      }

      cyLine += 8;
      drawSectionLabel(ctx, 'echoes recovered', centerX, cyLine, { role: 'salvage', alpha: 0.84 });
      if (recentEchoes.length > 4) {
        ctx.textAlign = 'right';
        ctx.fillStyle = roleColor('muted', 0.68);
        ctx.font = canvasFont(10);
        const start = homeChronicleOffset + 1;
        const end = Math.min(recentEchoes.length, homeChronicleOffset + 4);
        ctx.fillText(`${start}-${end}/${recentEchoes.length}  ↑↓ SCROLL`, centerX + centerTextW, cyLine);
        ctx.textAlign = 'left';
      }
      cyLine += 20;
      ctx.font = canvasFont(11);
      if (chronicle.echoes.length === 0) {
        ctx.fillStyle = roleColor('muted', 0.48);
        ctx.fillText('- no echo fragments in this session -', centerX, cyLine);
      } else {
        for (const echo of chronicle.echoes.slice(0, 3)) {
          const name = echo.pilotName || 'unknown';
          const hull = echo.hullType || 'unknown';
          ctx.fillStyle = roleColor('salvage', 0.74);
          ctx.fillText(fitUiText(ctx, `"${String(echo.fragment || '')}"`, centerTextW), centerX, cyLine);
          ctx.fillStyle = roleColor('muted', 0.62);
          ctx.fillText(`- ${name}, ${hull}`, centerX + 18, cyLine + 13);
          cyLine += 31;
        }
      }

    } else if (homeTab === 4) {
      // === LAUNCH subscreen ===
      const launchEntry = currentMapSelectEntry();
      const launchSelection = launchEntry?.available ? currentMapSelectSurvey() : null;
      const launchTerminal = launchSelection ? projectSurveyTerminal(launchSelection.surveyPreview, {
        seed: previewSeed,
        mapClass: launchEntry.id,
        cycle: totalRuns + 1,
      }) : null;
      ctx.textAlign = 'center';
      drawHomeShipSprite(ctx, centerPanel.x + centerPanel.w / 2, centerPanel.y + centerPanel.h / 2 - 92, {
        scale: 1.2,
        hullType,
        role: 'salvage',
        alpha: 0.96,
        pulse: focusPulse,
      });
      ctx.fillStyle = roleColor('text', 0.94);
      ctx.font = canvasFont(24, { role: 'display', weight: '800' });
      ctx.fillText(String(launchEntry?.label || launchEntry?.map?.name || 'route unresolved').toLowerCase(), centerPanel.x + centerPanel.w / 2, centerPanel.y + centerPanel.h / 2 + 38);
      ctx.fillStyle = roleColor('muted', 0.76);
      ctx.font = canvasFont(12);
      ctx.fillText(`seed ${launchTerminal?.chrome.seedSerial || 'unresolved'} · ${hullType} hull`, centerPanel.x + centerPanel.w / 2, centerPanel.y + centerPanel.h / 2 + 66);
      ctx.fillText(`loadout ${equippedCount + consumableCount}/4 · ${launchEntry?.available ? 'route ready for survey' : 'route withheld'}`, centerPanel.x + centerPanel.w / 2, centerPanel.y + centerPanel.h / 2 + 88);
      }
    } else {
      ctx.textAlign = 'center';
      ctx.fillStyle = roleColor('muted', 0.65);
      ctx.font = canvasFont(15);
      ctx.fillText('no active profile', centerPanel.x + centerPanel.w / 2, centerPanel.y + centerPanel.h / 2);
    }

    // Launch's center composition leaves the canvas aligned to center. The
    // right rail is a left-anchored instrument column, so reset explicitly
    // before drawing its measured values and supporting copy.
    ctx.textAlign = 'left';
    const sidebarX = rightPanel.x + UI_DECK_GEOMETRY.panel.paddingX;
    const sidebarW = rightPanel.w - UI_DECK_GEOMETRY.panel.paddingX * 2;
    let sideY = rightPanel.y + 58;
    const launchActive = homeTab === 4;
    if (launchActive) {
      drawCommandButtonMotion(ctx, {
        x: rightPanel.x + 18,
        y: sideY,
        w: rightPanel.w - 36,
        h: UI_DECK_GEOMETRY.button.minHeight,
      }, 'select route', {
        action: actionDescriptor('confirm', currentPromptOptions()),
        role: UI_INTERACTION_ROLES.command,
        active: true,
        alpha: 0.96,
        progress: contentReveal,
        pulseTime: (totalTime % 1.5) / 1.5,
        reducedMotion: motion.reducedMotion,
        commandPulse: motion.commandPulse,
      });
    } else {
      drawSectionLabel(ctx, 'next operation', sidebarX, sideY + 8, { role: 'salvage', alpha: 0.82 });
      drawActionFooter(ctx, sidebarX, sideY + 18, [
        { descriptor: actionDescriptor('tabs', homePromptOptions), verb: 'launch when ready' },
      ], { alpha: 0.78, maxWidth: sidebarW, backingRole: 'salvage' });
    }
    // Command glyphs render below their action face. Reserve that support rail
    // before the operation facts begin so neither read gets clipped or merged.
    sideY += launchActive
      ? UI_DECK_GEOMETRY.button.minHeight + UI_DECK_GEOMETRY.button.gap + UI_DECK_GEOMETRY.actionGlyph.minHeight + 18
      : 82;
    const affordableRigLevel = Boolean(profileManager.getRigProgression()?.tracks?.some((track) => (
      track.level < track.maxLevel && profileManager.canAffordRigUpgrade(track.index)
    )));
    drawKeyValueRow(ctx, 'exotic matter', `${p?.exoticMatter || 0} EM · ${affordableRigLevel ? 'rig level affordable' : 'next rig held'}`, sidebarX, sideY, { rowWidth: sidebarW, valueRole: 'salvage' });
    sideY += 24;
    drawKeyValueRow(ctx, 'vault value', `${profileVaultValue(p)} EM`, sidebarX, sideY, { rowWidth: sidebarW, valueRole: 'salvage' });
    sideY += 24;
    drawKeyValueRow(ctx, 'best survival', bestLabel, sidebarX, sideY, { rowWidth: sidebarW, valueRole: 'flow' });
    sideY += 24;
    drawKeyValueRow(ctx, 'extractions', String(p?.totalExtractions || 0), sidebarX, sideY, { rowWidth: sidebarW, valueRole: 'ecology' });
    sideY += 36;
    drawSectionLabel(ctx, 'readiness', sidebarX, sideY, { role: 'flow', alpha: 0.84 });
    sideY += 24;
    drawSegmentedGauge(ctx, { x: sidebarX, y: sideY, w: sidebarW, h: 13 }, {
      value: equippedCount + consumableCount,
      max: 4,
      segments: 4,
      role: equippedCount + consumableCount >= 2 ? 'ecology' : 'salvage',
      label: 'loadout',
      alpha: 0.9,
    });
    sideY += 52;
    if (launchActive) {
      ctx.font = canvasFont(11);
      ctx.fillStyle = roleColor('muted', 0.74);
      ctx.fillText(fitUiText(ctx, 'map briefing opens on confirm', sidebarW), sidebarX, sideY);
    }
    drawActionFooter(ctx, panelLayout.rightFooter.drawX, panelLayout.rightFooter.drawY, homeFooterActions,
      { alpha: 0.72, gap: 10, maxWidth: panelLayout.rightFooter.contentWidth, backing: true, backingRole: 'flow' });

    ctx.restore();
  }

  // === MAP SELECT SCREEN ===
  if (!rendererFixtureActive && gamePhase === 'mapSelect') {
    const remoteControl = simClient?.enabled ? currentRemoteControlState() : null;
    const w = overlayCanvas.width, h = overlayCanvas.height;
    const selection = currentMapSelectSurvey();
    const preview = selection.surveyPreview;
    const locked = selection.state === 'locked';
    const surveyTerminal = locked ? null : projectSurveyTerminal(preview, {
      seed: previewSeed,
      mapClass: selection.entry.id,
      cycle: (Number(profileManager.active?.totalExtractions) || 0) + (Number(profileManager.active?.totalDeaths) || 0) + 1,
    });
    const surveyRole = locked ? 'danger' : preview.riskBand === 'HIGH' ? 'danger' : preview.riskBand === 'MEDIUM' ? 'salvage' : 'flow';
    const promptOptions = currentPromptOptions();

    ctx.save();
    ctx.fillStyle = 'rgba(0, 2, 12, 0.72)';
    ctx.fillRect(0, 0, w, h);
    drawUiScanlines(ctx, w, h, 0.024, 4);
    ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
    ctx.shadowBlur = 12;

    const motion = currentUiMotionSettings();
    const contentReveal = uiContentReveal(0.1);
    const focusPulse = uiFocusPulseAmount();
    const mapFooterActions = mapSelectActions(promptOptions);
    const panelLayout = mapSelectSurfaceLayout(w, h, window.innerWidth, MAP_SELECT_ENTRIES.length, mapFooterActions);
    const { left: listPanel, center: previewPanel, right: briefPanel } = panelLayout;
    const briefing = panelLayout.briefing;

    drawTerminalWindow(ctx, listPanel, {
      state: sampleTerminalWindow(uiMotionTimer, { duration: motion.windowDuration, reducedMotion: motion.reducedMotion }),
      origin: 'top-left', role: surveyRole, fillAlpha: 0.90, borderAlpha: 0.30, cornerLength: 34,
    });
    drawTerminalWindow(ctx, previewPanel, {
      state: sampleTerminalWindow(uiMotionTimer, { delay: 0.05, duration: motion.windowDuration, reducedMotion: motion.reducedMotion }),
      origin: 'top-left', role: 'flow', fillAlpha: 0.78, borderAlpha: 0.24, cornerLength: 42,
    });
    drawTerminalWindow(ctx, briefPanel, {
      state: sampleTerminalWindow(uiMotionTimer, { delay: 0.10, duration: motion.windowDuration, reducedMotion: motion.reducedMotion }),
      origin: 'top-right', role: 'salvage', fillAlpha: 0.90, borderAlpha: 0.34, cornerLength: 34,
    });
    ctx.globalAlpha *= contentReveal;

    const pad = panelLayout.pad;
    drawSectionLabel(ctx, 'destination', listPanel.x + pad, listPanel.y + 31, { role: surveyRole, alpha: 0.86 });
    ctx.textAlign = 'left';
    for (let i = 0; i < MAP_SELECT_ENTRIES.length; i++) {
      const entry = MAP_SELECT_ENTRIES[i];
      const selected = i === mapSelectIndex;
      const registry = entry.available === false ? null : surveyScaleForMap(entry.id);
      const role = entry.available === false ? 'muted' : registry?.riskBand === 'HIGH' ? 'danger' : registry?.riskBand === 'MEDIUM' ? 'salvage' : 'flow';
      const rowReveal = staggerProgress(uiMotionTimer, i, {
        delay: 0.2,
        stagger: motion.rowStagger,
        reducedMotion: motion.reducedMotion,
      });
      const row = panelLayout.rows[i];
      ctx.save();
      ctx.globalAlpha *= rowReveal;
      drawSelectedRow(ctx, row, {
        role,
        active: true,
        alpha: selected ? (entry.available === false ? 0.82 : 0.92 + focusPulse * 0.08) : 0.30,
        fillAlpha: selected ? (entry.available === false ? 0.10 : 0.18 + focusPulse * 0.05) : 0.045,
        borderAlpha: selected ? (entry.available === false ? 0.72 : 0.66 + focusPulse * 0.12) : 0.12,
        railWidth: selected ? 5 : 2,
      });
      const iconX = row.x + UI_DECK_GEOMETRY.listRow.paddingX + UI_DECK_GEOMETRY.iconCell.minWidth / 2;
      const iconY = row.y + row.h / 2;
      ctx.strokeStyle = roleColor(entry.available === false ? 'muted' : role, selected ? 0.78 : 0.38);
      ctx.fillStyle = roleColor(entry.available === false ? 'muted' : role, selected ? 0.36 : 0.18);
      ctx.lineWidth = selected ? 1.5 : 1;
      ctx.strokeRect(iconX - 15, iconY - 15, 30, 30);
      const topologySignature = entry.available === false ? null : resolveTopologySignature(entry.id);
      const glyphRows = topologySignature?.rows || ['010', '101', '010'];
      const glyphCells = glyphRows.length;
      for (let gy = 0; gy < glyphCells; gy++) {
        for (let gx = 0; gx < glyphCells; gx++) {
          if (glyphRows[gy]?.[gx] !== '1') continue;
          ctx.fillRect(iconX - 10 + gx * (20 / glyphCells), iconY - 10 + gy * (20 / glyphCells), 2.5, 2.5);
        }
      }
      if (entry.available === false) {
        ctx.strokeStyle = roleColor(selected ? 'danger' : 'muted', selected ? 0.92 : 0.54);
        ctx.beginPath();
        ctx.arc(iconX, iconY - 4, 5, Math.PI, 0);
        ctx.stroke();
        ctx.strokeRect(iconX - 6, iconY - 4, 12, 10);
      }
      const textX = row.x + UI_DECK_GEOMETRY.listRow.paddingX + UI_DECK_GEOMETRY.iconCell.minWidth + UI_DECK_GEOMETRY.listRow.gap;
      ctx.font = canvasFont(selected ? 16 : 14, { role: selected ? 'display' : 'body', weight: selected ? '700' : '600' });
      ctx.fillStyle = selected ? roleColor(entry.available === false ? 'danger' : 'text', 0.96) : roleColor('muted', 0.72);
      const rowLabel = entry.available === false ? entry.label : registry.label;
      ctx.fillText(fitUiText(ctx, rowLabel, row.w - (textX - row.x) - UI_DECK_GEOMETRY.listRow.paddingX), textX, row.y + row.h * 0.44);
      ctx.font = canvasFont(11, { weight: '700' });
      ctx.fillStyle = roleColor(entry.available === false ? (selected ? 'danger' : 'muted') : role, selected ? 0.82 : 0.46);
      const rowStatus = entry.available === false ? entry.status : `${registry.scale.label} // AVAILABLE`;
      ctx.fillText(fitUiText(ctx, rowStatus, row.w - (textX - row.x) - UI_DECK_GEOMETRY.listRow.paddingX), textX, row.y + row.h * 0.72);
      ctx.restore();
    }

    drawActionFooter(ctx, panelLayout.footer.drawX, panelLayout.footer.drawY, mapFooterActions,
      { alpha: 0.82, gap: 10, maxWidth: panelLayout.footer.contentWidth, backing: true, backingRole: surveyRole });

    const centerX = previewPanel.x + pad;
    if (!locked && surveyTerminal) {
      ctx.font = canvasFont(9);
      ctx.fillStyle = roleColor('muted', 0.48);
      ctx.fillText(
        `${surveyTerminal.chrome.terminal} // seed ${surveyTerminal.chrome.seedSerial} · cycle ${surveyTerminal.chrome.cycle} // signal ${surveyTerminal.chrome.signal.toLowerCase()}`,
        centerX,
        previewPanel.y + 18,
      );
    }
    ctx.font = canvasFont(21, { role: 'display', weight: '800' });
    ctx.fillStyle = roleColor('text', 0.96);
    ctx.fillText('SURVEY RECONSTRUCTION', centerX, previewPanel.y + 42);
    if (locked) {
      drawLockedSurveyTopology(ctx, previewPanel, { alpha: 0.96, motionTime: uiMotionTimer, reducedMotion: motion.reducedMotion });
    } else {
      drawSurveyTopology(ctx, previewPanel, preview, { alpha: 0.96, motionTime: uiMotionTimer, reducedMotion: motion.reducedMotion });
      const legendX = previewPanel.x + previewPanel.w - 126;
      let legendY = previewPanel.y + 72;
      ctx.font = canvasFont(10);
      for (const item of surveyTerminal.density.legend) {
        ctx.fillStyle = roleColor(item.id === 'anomaly' ? 'anomaly' : item.id === 'dense' ? 'salvage' : 'muted', 0.72);
        ctx.fillText(`${item.mark === 'contour' ? '◎' : item.mark === 'dots' ? '··' : item.mark === 'burst' ? '※' : item.mark === 'empty' ? '○' : '--'} ${item.label.toLowerCase()}`, legendX, legendY);
        legendY += 16;
      }
      ctx.fillStyle = roleColor('muted', 0.64);
      ctx.fillText('//// unstable zones', legendX, legendY + 4);
      const densityW = Math.max(160, previewPanel.w * 0.42);
      drawSegmentedGauge(ctx, { x: centerX, y: previewPanel.y + previewPanel.h - 25, w: densityW, h: 10 }, {
        value: surveyTerminal.density.filledSegments,
        max: surveyTerminal.density.segments,
        segments: surveyTerminal.density.segments,
        role: 'flow',
        label: 'density low → high',
        alpha: 0.82,
      });
    }

    const briefX = briefPanel.x + pad;
    const briefW = briefPanel.w - pad * 2;
    const commandY = panelLayout.command.y;
    if (locked) {
      ctx.font = canvasFont(20, { role: 'display', weight: '800' });
      ctx.fillStyle = roleColor('danger', 0.96);
      ctx.fillText('DATA WITHHELD', briefX, briefing.titleY);
      ctx.font = canvasFont(11, { weight: '700' });
      for (let i = 0; i < 6; i++) {
        const y = briefPanel.y + 98 + i * 42;
        ctx.fillStyle = roleColor('text', 0.78);
        ctx.fillText('???', briefX, y);
        ctx.strokeStyle = roleColor('danger', 0.56);
        ctx.lineWidth = 1;
        ctx.strokeRect(briefX + 44, y - 12, Math.max(48, briefW - 44), 16);
        ctx.fillStyle = roleColor('danger', 0.42);
        for (let mark = 0; mark < 5; mark++) {
          ctx.fillRect(briefX + 52 + mark * Math.max(14, (briefW - 66) / 5), y - 8, 6, 2);
        }
        ctx.fillStyle = roleColor('danger', 0.62);
        ctx.fillText('WITHHELD', briefX + 54, y + 2);
      }
      drawSectionLabel(ctx, 'survey confidence', briefX, briefPanel.y + briefPanel.h - 210, { role: 'danger', alpha: 0.88 });
      ctx.font = canvasFont(28, { role: 'display', weight: '800' });
      ctx.fillStyle = roleColor('danger', 0.96);
      ctx.fillText('0%', briefX, briefPanel.y + briefPanel.h - 174);
      drawSectionLabel(ctx, 'checksum', briefX, briefPanel.y + briefPanel.h - 124, { role: 'danger', alpha: 0.82 });
      ctx.font = canvasFont(15, { weight: '700' });
      ctx.fillStyle = roleColor('danger', 0.90);
      ctx.fillText('INVALID', briefX, briefPanel.y + briefPanel.h - 100);
      drawCommandButtonMotion(ctx, { x: briefX, y: commandY, w: briefW, h: UI_DECK_GEOMETRY.button.minHeight }, 'sector locked', {
        role: 'muted', active: false, disabled: true, alpha: 0.94, progress: contentReveal, reducedMotion: motion.reducedMotion,
      });
    } else {
      ctx.font = canvasFont(20, { role: 'display', weight: '800' });
      ctx.fillStyle = roleColor('text', 0.96);
      ctx.fillText(fitUiText(ctx, preview.mapClass.label, briefW), briefX, briefing.titleY);
      drawStatusPill(ctx, panelLayout.briefStatus.scale, preview.scale.label, {
        role: 'flow', alpha: 0.88, minWidth: panelLayout.briefStatus.scale.w,
      });
      drawStatusPill(ctx, panelLayout.briefStatus.risk, preview.riskBand, {
        role: surveyRole, alpha: 0.88, minWidth: panelLayout.briefStatus.risk.w,
      });
      drawKeyValueRow(ctx, 'signature', preview.signature.name, briefX, briefing.signatureY, { labelWidth: 88, valueRole: 'anomaly' });
      if (preview.signature.mechanical) {
        ctx.font = canvasFont(12);
        ctx.fillStyle = roleColor('muted', 0.82);
        ctx.fillText(fitUiText(ctx, preview.signature.mechanical, briefW), briefX, briefing.signatureEffectY);
      }
      ctx.fillStyle = roleColor('muted', 0.74);
      const descriptionLines = wrapUiText(ctx, preview.description, briefW, { maxLines: briefing.descriptionLines });
      descriptionLines.forEach((line, index) => {
        ctx.fillText(line, briefX, briefing.descriptionLineY + index * briefing.descriptionLineHeight);
      });
      drawSectionLabel(ctx, 'possible contents', briefX, briefing.contentsY, { role: 'flow', alpha: 0.86 });
      const contactY = briefing.contactY;
      for (const [index, family] of surveyTerminal.contacts.entries()) {
        const contactColumnW = briefW / briefing.contactColumns;
        const contactX = briefX + (index % briefing.contactColumns) * contactColumnW;
        const y = contactY + Math.floor(index / briefing.contactColumns) * briefing.contactRowStep;
        ctx.font = canvasFont(12, { weight: '700' });
        ctx.fillStyle = roleColor(family.role, 0.86);
        ctx.fillText(family.glyph, contactX, y);
        const rangeLabel = family.range.label;
        const labelWidth = Math.max(48, contactColumnW - 74);
        ctx.fillText(fitUiText(ctx, family.label.toLowerCase(), labelWidth), contactX + 20, y);
        drawSegmentedGauge(ctx, { x: contactX + 20, y: y + 7, w: Math.min(76, contactColumnW - 44), h: 8 }, {
          value: family.magnitude.filledSegments,
          max: family.magnitude.segments,
          segments: family.magnitude.segments,
          role: family.role,
          alpha: 0.76,
        });
        ctx.textAlign = 'right';
        ctx.fillStyle = roleColor('text', 0.82);
        ctx.fillText(rangeLabel, contactX + contactColumnW - 2, y);
        ctx.textAlign = 'left';
        if (briefing.contactDescription) {
          const sourceFamily = preview.possibleContactFamilies[index];
          ctx.font = canvasFont(12);
          ctx.fillStyle = roleColor('muted', 0.68);
          ctx.fillText(fitUiText(ctx, sourceFamily?.description || '', Math.max(64, briefW - 108)), briefX + 108, y + 16);
        }
      }
      const authorityY = briefing.authorityY;
      const authorityActions = remoteControl?.canHostReset ? [{
        descriptor: actionDescriptor('delete', promptOptions),
        verb: 'open new cycle',
      }] : [];
      const linkLine = remoteControl?.hasLiveSession
        ? `live cycle // ${remoteControl.sessionPlayerCount} players`
        : remoteControl?.loading ? 'link: searching...' : 'link: stable';
      drawSectionLabel(ctx, 'link', briefX, authorityY, { role: simClient?.enabled ? 'flow' : 'muted', alpha: 0.82 });
      ctx.font = canvasFont(10);
      ctx.fillStyle = roleColor('muted', 0.72);
      ctx.fillText(fitUiText(ctx, linkLine, briefW), briefX, authorityY + 20);
      if (authorityActions.length > 0) {
        drawActionFooter(ctx, briefX, authorityY + 28, authorityActions, {
          alpha: 0.82, gap: 10, maxWidth: briefW,
        });
      }
      drawSectionLabel(ctx, 'survey confidence', briefX, briefing.confidenceLabelY, { role: 'flow', alpha: 0.86 });
      ctx.font = canvasFont(26, { role: 'display', weight: '800' });
      ctx.fillStyle = roleColor('flow', 0.96);
      ctx.fillText(`${preview.confidence}%`, briefX, briefing.confidenceValueY);
      const waveX = briefX + 76;
      const waveY = briefing.confidenceValueY - 8;
      ctx.strokeStyle = roleColor('flow', 0.64);
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let point = 0; point < 9; point++) {
        const x = waveX + point * Math.max(8, (briefW - 82) / 8);
        const y = waveY + Math.sin((point + previewSeed % 11) * 1.7) * (3 + preview.confidence / 18);
        if (point === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
      drawCommandButtonMotion(ctx, { x: briefX, y: commandY, w: briefW, h: UI_DECK_GEOMETRY.button.minHeight }, remoteControl?.hasLiveSession ? 'join live cycle' : 'begin drop', {
        action: actionDescriptor('confirm', promptOptions), role: surveyRole === 'danger' ? UI_INTERACTION_ROLES.command : surveyRole,
        active: true, alpha: 0.96, progress: contentReveal, pulseTime: (totalTime % 1.45) / 1.45,
        reducedMotion: motion.reducedMotion, commandPulse: motion.commandPulse,
      });
    }

    ctx.restore();
  }

  // === RUN RESULTS (shared for death, collapse, and extraction) ===
  if (!rendererFixtureActive && (gamePhase === 'dead' || gamePhase === 'escaped')) {
    const rawT = gamePhase === 'dead' ? deathTimer : escapeTimer;
    const lingerFrac = Math.min(1.0, rawT / DEATH_LINGER_DURATION);
    fadeHUD(1.0 - lingerFrac);
    drawRunResultsOverlay(ctx, overlayCanvas, {
      view: currentRunResultsViewModel(),
      rawTime: rawT,
      totalTime,
      lingerDuration: DEATH_LINGER_DURATION,
      motionSettings: currentUiMotionSettings(),
      promptOptions: currentPromptOptions(),
    });
  }

  // === PAUSE MENU ===
  if (!rendererFixtureActive && gamePhase === 'paused') {
    const w = overlayCanvas.width, h = overlayCanvas.height;
    const pauseActions = [
      { descriptor: actionDescriptor('select', currentPromptOptions()), verb: 'select' },
      { descriptor: actionDescriptor('confirm', currentPromptOptions()), verb: 'confirm' },
      { descriptor: actionDescriptor('back', currentPromptOptions()), verb: 'resume' },
    ];
    const surface = interruptSurfaceLayout(w, h, 'pause', pauseActions);
    const cx = surface.panel.x + surface.panel.w / 2;
    ctx.save();
    ctx.fillStyle = 'rgba(0, 2, 12, 0.82)';
    ctx.fillRect(0, 0, w, h);
    drawUiScanlines(ctx, w, h, currentUiMotionSettings().reducedMotion ? 0 : 0.025, 4);
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
    ctx.shadowBlur = 12;

    const motion = currentUiMotionSettings();
    const windowState = sampleTerminalWindow(uiMotionTimer, {
      duration: motion.windowDuration,
      reducedMotion: motion.reducedMotion,
    });
    drawTerminalWindow(ctx, surface.panel, {
      state: windowState,
      origin: 'top-left',
      role: 'flow',
      fillAlpha: 0.90,
      borderAlpha: 0.36,
      cornerLength: 34,
    });
    ctx.globalAlpha *= windowState.content;

    ctx.fillStyle = roleColor(pauseAbandonConfirm ? 'danger' : 'flow', 0.95);
    ctx.font = canvasFont(28, { role: 'display', weight: '700' });
    ctx.fillText(pauseAbandonConfirm ? 'ABANDON RUN?' : 'PAUSED', cx, surface.heading.y + 29);

    const awaySeconds = pauseResumeState.enteredAt == null
      ? 0
      : Math.max(0, (performance.now() - pauseResumeState.enteredAt) / 1000);
    const remotePause = remoteSession.active;
    ctx.fillStyle = roleColor(pauseAbandonConfirm ? 'danger' : remotePause ? 'flow' : 'text', 0.96);
    ctx.font = canvasFont(14, { weight: '700' });
    ctx.fillText(
      pauseAbandonConfirm ? 'LEAVE THIS CYCLE?' : remotePause ? 'THE WORLD CONTINUES' : 'SIMULATION HELD',
      cx,
      surface.status.y + 16,
    );
    ctx.fillStyle = roleColor('muted', 0.78);
    ctx.font = canvasFont(11);
    const status = pauseAbandonConfirm
      ? 'confirm abandon run or return to resume'
      : remotePause
        ? `connection ${remoteSession.health?.ok === false ? 'lost' : 'stable'} · away ${awaySeconds.toFixed(1)}s`
        : '';
    if (status) ctx.fillText(fitUiText(ctx, status, surface.status.w), cx, surface.status.y + 38);

    const buttons = ['return to game', 'abandon run'];
    for (let i = 0; i < buttons.length; i++) {
      const row = surface.rows[i];
      const selected = i === pauseMenuSelection;
      drawSelectedRow(ctx, row, {
        role: pauseAbandonConfirm && i === 1 ? 'danger' : 'flow',
        active: selected,
        alpha: selected ? 1 : 0.58,
        fillAlpha: 0.14,
        borderAlpha: 0.68,
        railWidth: 2,
      });
      ctx.fillStyle = roleColor(selected ? 'text' : 'muted', selected ? 1 : 0.72);
      ctx.font = selected ? canvasFont(18, { weight: 'bold' }) : canvasFont(16);
      ctx.fillText(buttons[i], cx, row.y + row.h / 2 + 6);
    }

    drawActionFooter(ctx, surface.footer.drawX, surface.footer.drawY, pauseActions, {
      alpha: 0.78,
      gap: UI_DECK_GEOMETRY.panel.gap,
      maxWidth: surface.footer.contentWidth,
    });

    ctx.restore();
  }

  if (!rendererFixtureActive && gamePhase === 'recovery') {
    const recoveryActions = [
      { descriptor: actionDescriptor('back', currentPromptOptions()), verb: 'return to the deck' },
    ];
    const surface = interruptSurfaceLayout(overlayCanvas.width, overlayCanvas.height, 'recovery', recoveryActions);
    const cx = surface.panel.x + surface.panel.w / 2;
    const motion = currentUiMotionSettings();
    ctx.save();
    ctx.fillStyle = 'rgba(0, 2, 12, 0.84)';
    ctx.fillRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    drawUiScanlines(ctx, overlayCanvas.width, overlayCanvas.height, motion.reducedMotion ? 0 : 0.025, 4);
    drawTerminalWindow(ctx, surface.panel, {
      state: sampleTerminalWindow(uiMotionTimer, {
        duration: motion.windowDuration,
        reducedMotion: motion.reducedMotion,
      }),
      origin: 'top-left',
      role: 'flow',
      fillAlpha: 0.92,
      borderAlpha: 0.42,
      cornerLength: 34,
    });
    ctx.textAlign = 'center';
    ctx.fillStyle = roleColor('text', 0.96);
    ctx.font = canvasFont(28, { role: 'display', weight: '700' });
    ctx.fillText('SIGNAL LOST', cx, surface.heading.y + 29);
    ctx.fillStyle = roleColor('muted', 0.84);
    ctx.font = canvasFont(15);
    ctx.fillText('this cycle is beyond reach', cx, surface.status.y + 22);
    ctx.font = canvasFont(12);
    ctx.fillText('cycle record syncs on reconnect', cx, surface.status.y + 50);
    drawActionFooter(ctx, surface.footer.drawX, surface.footer.drawY, recoveryActions, {
      alpha: 0.82,
      gap: UI_DECK_GEOMETRY.panel.gap,
      maxWidth: surface.footer.contentWidth,
      backingRole: 'flow',
    });
    ctx.restore();
  }

  if (transitionActive) {
    const motion = currentUiMotionSettings();
    const wipeAlpha = 0.9 * motion.intensity;
    if (motion.enabled && wipeAlpha > 0) {
      const transitionState = sampleScreenTransition(transitionTimer, {
        duration: motion.transitionDuration,
        reducedMotion: motion.reducedMotion,
        maxOcclusion: motion.maxOcclusion,
      });
      ctx.save();
      ctx.fillStyle = `rgba(0, 2, 12, ${transitionState.occlusionAlpha.toFixed(3)})`;
      ctx.fillRect(0, 0, overlayCanvas.width, overlayCanvas.height);
      ctx.restore();
      drawDirectionalWipe(ctx, { x: 0, y: 0, w: overlayCanvas.width, h: overlayCanvas.height }, {
        progress: transitionState.progress,
        direction: 'right',
        role: 'anomaly',
        alpha: wipeAlpha,
        reducedMotion: motion.reducedMotion,
      });
    }
  }

  recordPerfStat('overlayMs', performance.now() - overlayStart);
  recordPerfStat('frameMs', performance.now() - frameStart);
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
async function boot() {
  try {
    const fontsReady = await waitForTypographyFonts();
    window.__LBH_BOOT_MARK__?.('typography.fonts.checked', { ready: fontsReady });
    const ok = init();
    if (ok !== false) {
      window.__LBH_BOOT_MARK__?.('init.completed', {
        phase: gamePhase,
        rendererBackend: rendererBackend?.name || null,
      });
    }
  } catch (err) {
    reportBootFailure('Game initialization crashed.', err);
    throw err;
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
