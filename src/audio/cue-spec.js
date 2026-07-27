/**
 * Declarative client presentation-audio contract.
 * These recipes describe presentation only: simulation events remain authoritative.
 */
export const AUDIO_BUSES = Object.freeze(['ambient', 'world', 'player', 'ui', 'critical']);
export const AUDIO_PRIORITIES = Object.freeze(['ambience', 'world-detail', 'ui', 'navigation', 'warning', 'action', 'critical']);

const spec = (id, options) => Object.freeze({ id, edge: 'event', spatial: false, maxVoices: 1, cooldown: 0.08, duration: 0.5, bus: 'world', priority: 'world-detail', ...options });

export const CUE_SPECS = Object.freeze({
  loot: spec('loot', { bus: 'world', priority: 'navigation', maxVoices: 3, duration: 0.55, cooldown: 0.08, spatial: true, motif: 'amber-salvage' }),
  slingshotEngage: spec('slingshotEngage', { bus: 'player', priority: 'action', maxVoices: 2, duration: 0.5, spatial: true, motif: 'route-cell' }),
  slingshotRelease: spec('slingshotRelease', { bus: 'player', priority: 'action', maxVoices: 2, duration: 0.65, spatial: true, motif: 'route-cell' }),
  portalProximity: spec('portalProximity', { bus: 'world', priority: 'navigation', cooldown: 0.75, duration: 0.45, spatial: true, motif: 'route-cell' }),
  portalReady: spec('portalReady', { bus: 'world', priority: 'navigation', duration: 1.8, cooldown: 0.2, spatial: true, motif: 'route-cell' }),
  portalAbort: spec('portalAbort', { bus: 'ui', priority: 'navigation', duration: 0.25, cooldown: 0.12, motif: 'route-cell' }),
  portalBlocked: spec('portalBlocked', { bus: 'critical', priority: 'warning', duration: 0.32, cooldown: 0.5, motif: 'red-consequence' }),
  portalFinal: spec('portalFinal', { bus: 'critical', priority: 'critical', duration: 0.6, cooldown: 0.5, motif: 'magenta-inhibitor' }),
  portalConfirm: spec('portalConfirm', { bus: 'critical', priority: 'critical', maxVoices: 2, duration: 0.55, spatial: true, motif: 'route-cell' }),
  extract: spec('extract', { bus: 'critical', priority: 'critical', maxVoices: 5, duration: 2.2, cooldown: 0.5, spatial: true, motif: 'route-cell' }),
  death: spec('death', { bus: 'critical', priority: 'critical', maxVoices: 3, duration: 1.2, cooldown: 0.5, motif: 'red-consequence' }),
  pulse: spec('pulse', { bus: 'player', priority: 'action', maxVoices: 3, duration: 0.7, cooldown: 0.12, spatial: true }),
  shieldActivate: spec('shieldActivate', { bus: 'player', priority: 'action', maxVoices: 2, duration: 0.5 }),
  shieldAbsorb: spec('shieldAbsorb', { bus: 'critical', priority: 'critical', maxVoices: 2, duration: 0.55 }),
  breachFlare: spec('breachFlare', { bus: 'critical', priority: 'critical', duration: 0.75 }),
  starConsumed: spec('starConsumed', { bus: 'world', priority: 'warning', maxVoices: 2, duration: 0.8, spatial: true }),
  scavengerBump: spec('scavengerBump', { bus: 'world', priority: 'warning', maxVoices: 2, duration: 0.4, spatial: true }),
  scavDeath: spec('scavDeath', { bus: 'world', priority: 'warning', maxVoices: 4, duration: 0.55, spatial: true }),
  inhibitorGlitch: spec('inhibitorGlitch', { bus: 'world', priority: 'warning', maxVoices: 2, duration: 0.45, cooldown: 0.35, motif: 'magenta-inhibitor' }),
  inhibitorWake: spec('inhibitorWake', { bus: 'critical', priority: 'critical', duration: 0.65, cooldown: 0.5, motif: 'magenta-inhibitor' }),
  inhibitorVessel: spec('inhibitorVessel', { bus: 'critical', priority: 'critical', duration: 1.3, cooldown: 0.8, motif: 'magenta-inhibitor' }),
  inhibitorFinalPortal: spec('inhibitorFinalPortal', { bus: 'critical', priority: 'critical', maxVoices: 5, duration: 2.2, cooldown: 0.5, motif: 'magenta-inhibitor' }),
  hullWarning: spec('hullWarning', { bus: 'critical', priority: 'warning', duration: 0.22, cooldown: 3, motif: 'red-consequence' }),
  fuelWarning: spec('fuelWarning', { bus: 'critical', priority: 'warning', duration: 0.18, cooldown: 4, motif: 'red-consequence' }),
  signalWarning: spec('signalWarning', { bus: 'critical', priority: 'warning', duration: 0.18, cooldown: 4, motif: 'red-consequence' }),
  pause: spec('pause', { bus: 'ui', priority: 'ui', duration: 0.28, cooldown: 0.2, motif: 'terminal' }),
  resume: spec('resume', { bus: 'ui', priority: 'ui', duration: 0.25, cooldown: 0.2, motif: 'terminal' }),
  results: spec('results', { bus: 'ambient', priority: 'navigation', duration: 0.9, cooldown: 0.5, motif: 'grave-settle' }),
  menuMove: spec('menuMove', { bus: 'ui', priority: 'ui', duration: 0.12, cooldown: 0.05, motif: 'route-cell' }),
  menuConfirm: spec('menuConfirm', { bus: 'ui', priority: 'ui', maxVoices: 2, duration: 0.18, cooldown: 0.08, motif: 'route-cell' }),
  menuBack: spec('menuBack', { bus: 'ui', priority: 'ui', duration: 0.12 }),
  tabSwitch: spec('tabSwitch', { bus: 'ui', priority: 'ui', duration: 0.1 }),
  sellItem: spec('sellItem', { bus: 'ui', priority: 'ui', duration: 0.25 }),
  equipItem: spec('equipItem', { bus: 'ui', priority: 'ui', duration: 0.25 }),
  upgrade: spec('upgrade', { bus: 'ui', priority: 'ui', maxVoices: 4, duration: 0.5 }),
  cantAfford: spec('cantAfford', { bus: 'ui', priority: 'warning', duration: 0.25 }),
  launch: spec('launch', { bus: 'ui', priority: 'navigation', duration: 0.8 }),
});

export function cueSpec(cue) {
  return CUE_SPECS[cue] || null;
}
