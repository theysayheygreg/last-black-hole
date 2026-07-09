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
  voidBlack: 0x000000,
  matteNearBlack: 0x000006,
  neutralWhite: 0xffffff,
  playerCyan: 0x74d7ff,
  playerWhite: 0xf0fcff,
  playerRim: 0xd9fbff,
  remoteBlue: 0x3fb8ff,
  remoteWhite: 0x98d8ff,
  routeCyan: 0x4beeff,
  routeCyanCore: 0x9dfcff,
  routeAmber: 0xffd36a,
  salvageBone: 0xf8fbff,
  salvageMuted: 0x7f8994,
  salvageMutedRim: 0x8b96a4,
  salvageRim: 0xdcecff,
  threatRed: 0xff3b35,
  threatHalo: 0xff1f39,
  ecologyGreen: 0x36ffc3,
  ecologyCore: 0x7dffd8,
  sentryCore: 0x35ff98,
  sentryHalo: 0x00ff88,
  inhibitorMagenta: 0xe636ff,
  anomalyMagenta: 0xe636ff,
  corruptMagenta: 0xff36c8,
  fabricBlue: 0x74b8ff,
  fabricSurf: 0x9cfbff,
  fabricWave: 0xb8ffff,
  hazardCore: 0xff210f,
  hazardRing: 0xff3b22,
  routeWhite: 0xd7f2ff,
  routeHalo: 0x8ee2ff,
  warmStar: 0xffe08a,
  warmStarHalo: 0xff9e38,
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
    entityBudgets: Object.freeze({ players: 16, wrecks: 48, portals: 12 }),
  }),
  default: Object.freeze({
    backdropReveal: 0.07,
    parallaxStrength: 0.55,
    scanlineIntensity: 0.006,
    vignette: 0.035,
    motionWarp: 0.004,
    chromaticMotion: 0.0018,
    entityGain: 1.22,
    entityGamma: 0.88,
    entityBudgets: Object.freeze({ players: 32, wrecks: 96, portals: 20 }),
  }),
  rich: Object.freeze({
    backdropReveal: 0.12,
    parallaxStrength: 0.85,
    scanlineIntensity: 0.010,
    vignette: 0.055,
    motionWarp: 0.007,
    chromaticMotion: 0.0025,
    entityGain: 1.38,
    entityGamma: 0.82,
    entityBudgets: Object.freeze({ players: 48, wrecks: 144, portals: 28 }),
  }),
  capture: Object.freeze({
    backdropReveal: 0.14,
    parallaxStrength: 0.9,
    scanlineIntensity: 0.010,
    vignette: 0.055,
    motionWarp: 0.007,
    chromaticMotion: 0.0025,
    entityGain: 1.42,
    entityGamma: 0.80,
    entityBudgets: Object.freeze({ players: 64, wrecks: 192, portals: 32 }),
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
