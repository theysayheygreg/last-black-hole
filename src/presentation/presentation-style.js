import { UI_PALETTE, colorAsNumber } from '../ui/palette-tokens.js';

// Renderer-neutral visual roles and budgets. Renderers decide how to realize
// these values; gameplay and authority code never depend on concrete materials.

export const PRESENTATION_QUALITY_TIERS = Object.freeze([
  'minimal',
  'default',
  'rich',
  'capture',
]);

export const PRESENTATION_PALETTE_ID = 'lbh-void-v0.3';

export const PRESENTATION_PALETTE = Object.freeze({
  voidBlack: colorAsNumber(UI_PALETTE.void),
  matteNearBlack: colorAsNumber(UI_PALETTE.field),
  neutralWhite: colorAsNumber(UI_PALETTE.textPrimaryBase),
  playerCyan: colorAsNumber(UI_PALETTE.textPrimaryBase),
  playerWhite: colorAsNumber(UI_PALETTE.textPrimaryBase),
  playerRim: colorAsNumber(UI_PALETTE.bone),
  remoteBlue: colorAsNumber(UI_PALETTE.textMutedBase),
  remoteWhite: colorAsNumber(UI_PALETTE.textPrimaryBase),
  routeCyan: colorAsNumber(UI_PALETTE.route),
  routeCyanCore: colorAsNumber(UI_PALETTE.route),
  routeAmber: colorAsNumber(UI_PALETTE.value),
  salvageBone: colorAsNumber(UI_PALETTE.textPrimaryBase),
  salvageMuted: colorAsNumber(UI_PALETTE.textMutedBase),
  salvageMutedRim: colorAsNumber(UI_PALETTE.textMutedBase),
  salvageRim: colorAsNumber(UI_PALETTE.bone),
  threatRed: colorAsNumber(UI_PALETTE.danger),
  threatHalo: colorAsNumber(UI_PALETTE.danger),
  ecologyGreen: colorAsNumber(UI_PALETTE.ecology),
  ecologyCore: colorAsNumber(UI_PALETTE.ecology),
  sentryCore: colorAsNumber(UI_PALETTE.ecology),
  sentryHalo: colorAsNumber(UI_PALETTE.ecology),
  inhibitorMagenta: colorAsNumber(UI_PALETTE.inhibitor),
  anomalyMagenta: colorAsNumber(UI_PALETTE.anomaly),
  corruptMagenta: colorAsNumber(UI_PALETTE.inhibitor),
  fabricBlue: colorAsNumber(UI_PALETTE.route),
  fabricSurf: colorAsNumber(UI_PALETTE.route),
  fabricWave: colorAsNumber(UI_PALETTE.textPrimaryBase),
  hazardCore: colorAsNumber(UI_PALETTE.danger),
  hazardRing: colorAsNumber(UI_PALETTE.danger),
  routeWhite: colorAsNumber(UI_PALETTE.textPrimaryBase),
  routeHalo: colorAsNumber(UI_PALETTE.route),
  warmStar: colorAsNumber(UI_PALETTE.value),
  warmStarHalo: colorAsNumber(UI_PALETTE.value),
});

const QUALITY_PROFILES = Object.freeze({
  minimal: Object.freeze({
    backdropReveal: 0,
    parallaxStrength: 0,
    scanlineIntensity: 0,
    vignette: 0,
    motionWarp: 0,
    chromaticMotion: 0,
    entityGain: 1,
    entityGamma: 1,
    entityBudgets: Object.freeze({ players: 16, wrecks: 48, portals: 12, stars: 16, planetoids: 24, scavengers: 24, ecology: 32 }),
  }),
  default: Object.freeze({
    backdropReveal: 0.07,
    parallaxStrength: 0.55,
    scanlineIntensity: 0.006,
    vignette: 0.035,
    motionWarp: 0,
    chromaticMotion: 0,
    entityGain: 1.22,
    entityGamma: 0.88,
    entityBudgets: Object.freeze({ players: 32, wrecks: 96, portals: 20, stars: 32, planetoids: 48, scavengers: 48, ecology: 64 }),
  }),
  rich: Object.freeze({
    backdropReveal: 0.12,
    parallaxStrength: 0.85,
    scanlineIntensity: 0.010,
    vignette: 0.055,
    motionWarp: 0,
    chromaticMotion: 0,
    entityGain: 1.38,
    entityGamma: 0.82,
    entityBudgets: Object.freeze({ players: 48, wrecks: 144, portals: 28, stars: 48, planetoids: 72, scavengers: 72, ecology: 96 }),
  }),
  capture: Object.freeze({
    backdropReveal: 0.14,
    parallaxStrength: 0.9,
    scanlineIntensity: 0.010,
    vignette: 0.055,
    motionWarp: 0,
    chromaticMotion: 0,
    entityGain: 1.42,
    entityGamma: 0.80,
    entityBudgets: Object.freeze({ players: 64, wrecks: 192, portals: 32, stars: 64, planetoids: 96, scavengers: 96, ecology: 128 }),
  }),
});

export const PRESENTATION_ROLE_HINTS = Object.freeze({
  player: Object.freeze({
    category: 'player', roleColor: 'playerCyan', mattePolicy: 'coreContact',
    vfxFamily: 'thrusterWake', labelPolicy: 'deckOff', priority: 'critical', cullingLane: 'nearField',
  }),
  remotePlayer: Object.freeze({
    category: 'remoteShip', roleColor: 'remoteBlue', mattePolicy: 'coreContact',
    vfxFamily: 'thrusterWake', labelPolicy: 'selectedOnly', priority: 'high', cullingLane: 'camera',
  }),
  wreck: Object.freeze({
    category: 'salvage', roleColor: 'salvageBone', mattePolicy: 'heavyOccluding',
    vfxFamily: 'none', labelPolicy: 'selectedOnly', priority: 'high', cullingLane: 'camera',
  }),
  portal: Object.freeze({
    category: 'routeAnchor', roleColor: 'routeCyan', mattePolicy: 'apertureBackplate',
    vfxFamily: 'portalAperture', labelPolicy: 'selectedOnly', priority: 'critical', cullingLane: 'camera',
  }),
  threat: Object.freeze({
    category: 'threat', roleColor: 'threatRed', mattePolicy: 'coreContact',
    vfxFamily: 'none', labelPolicy: 'selectedOnly', priority: 'high', cullingLane: 'camera',
  }),
  ecology: Object.freeze({
    category: 'ecology', roleColor: 'ecologyGreen', mattePolicy: 'softContact',
    vfxFamily: 'none', labelPolicy: 'selectedOnly', priority: 'normal', cullingLane: 'camera',
  }),
  anomaly: Object.freeze({
    category: 'anomaly', roleColor: 'anomalyMagenta', mattePolicy: 'heavyOccluding',
    vfxFamily: 'inhibitorShard', labelPolicy: 'debugOnly', priority: 'critical', cullingLane: 'foreground',
  }),
});

export function normalizePresentationQuality(value, fallback = 'default') {
  const quality = String(value || '').toLowerCase();
  return PRESENTATION_QUALITY_TIERS.includes(quality) ? quality : fallback;
}

export function resolvePresentationQuality(value = 'default') {
  return QUALITY_PROFILES[normalizePresentationQuality(value)] || QUALITY_PROFILES.default;
}

export function getPresentationPalette(id = PRESENTATION_PALETTE_ID) {
  return id === PRESENTATION_PALETTE_ID ? PRESENTATION_PALETTE : PRESENTATION_PALETTE;
}
