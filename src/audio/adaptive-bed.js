export const BED_STATES = Object.freeze([
  'title-terminal', 'briefing-loading', 'gameplay-pressure', 'pause-results', 'terminal-linger',
]);

const TARGETS = Object.freeze({
  'title-terminal': { ambient: 0.16, world: 0, player: 0, ui: 1, critical: 1, ramp: 0.8 },
  'briefing-loading': { ambient: 0.25, world: 0.08, player: 0, ui: 0.9, critical: 1, ramp: 0.55 },
  'gameplay-pressure': { ambient: 0.42, world: 0.72, player: 1, ui: 1, critical: 1, ramp: 0.8 },
  'pause-results': { ambient: 0.12, world: 0.08, player: 0.05, ui: 0.82, critical: 1, ramp: 0.35 },
  'terminal-linger': { ambient: 0.015, world: 0, player: 0, ui: 0.18, critical: 0.65, ramp: 0.18 },
});

export function bedTarget(state) {
  return TARGETS[BED_STATES.includes(state) ? state : 'title-terminal'];
}

export function normalizeBedState(state) {
  return ({
    title: 'title-terminal', menu: 'title-terminal', meta: 'title-terminal',
    loading: 'briefing-loading', briefing: 'briefing-loading',
    gameplay: 'gameplay-pressure', paused: 'pause-results', results: 'pause-results', escaped: 'pause-results',
    dead: 'terminal-linger', death: 'terminal-linger',
  })[state] || 'title-terminal';
}
