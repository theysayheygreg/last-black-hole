import { validateConditionQuery } from '../conditions/index.js';
import { createJourneyRegistry, DEFAULT_ACTIONS } from './registry.js';

const ACTION_ROUTINES = Object.freeze({
  launch: 'launch',
  navigate: 'navigate',
  approach: 'navigate',
  grapple: 'grapple',
  release: 'releaseGrapple',
  salvage: 'salvage',
  extract: 'confirmExtraction',
  recover: 'recover',
  returnHome: 'returnHome',
});

const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const nonEmpty = (value) => typeof value === 'string' && value.trim() !== '';
const ARGUMENT_RULES = Object.freeze({
  seed: (value) => nonEmpty(value) || finite(value), signature: nonEmpty,
  targetId: nonEmpty, targetKind: nonEmpty, targetPolicy: nonEmpty, policy: nonEmpty,
  timeoutMs: (value) => finite(value) && value >= 50,
  durationMs: (value) => finite(value) && value >= 50,
  arrivalRadius: (value) => finite(value) && value > 0,
  arrivalSpeed: (value) => finite(value) && value >= 0,
  thrust: (value) => finite(value) && value >= 0 && value <= 1,
  brake: (value) => finite(value) && value >= 0 && value <= 1,
  intensity: (value) => finite(value) && value >= 0 && value <= 1,
  moveX: (value) => finite(value) && value >= -1 && value <= 1,
  moveY: (value) => finite(value) && value >= -1 && value <= 1,
  approachTargetId: (value) => value === null || nonEmpty(value),
  hold: (value) => typeof value === 'boolean', allowTerminal: (value) => typeof value === 'boolean',
  confirm: (value) => typeof value === 'boolean', provenance: (value) => typeof value === 'boolean',
  section: nonEmpty, name: nonEmpty, causePolicy: nonEmpty,
  overlays: (value) => typeof value === 'boolean' || (Array.isArray(value) && value.every(nonEmpty)),
});

function validateKeys(allowed, enums = {}) {
  const names = new Set(allowed);
  return (args) => {
    for (const key of Object.keys(args)) {
      if (!names.has(key)) throw new TypeError(`Unknown Journey argument: ${key}`);
      if (ARGUMENT_RULES[key] && !ARGUMENT_RULES[key](args[key])) {
        throw new TypeError(`Invalid Journey argument ${key}: ${JSON.stringify(args[key])}`);
      }
      if (enums[key] && !enums[key].includes(args[key])) {
        throw new RangeError(`Unknown Journey ${key}: ${String(args[key])}`);
      }
    }
    return args;
  };
}

const EMPTY = validateKeys([]);
const NAVIGATE = validateKeys(
  ['targetId', 'targetKind', 'targetPolicy', 'policy', 'timeoutMs', 'arrivalRadius', 'arrivalSpeed', 'thrust', 'durationMs', 'allowTerminal'],
  {
    targetKind: ['wreck', 'portal', 'well'],
    targetPolicy: ['nearest-salvage', 'active-grapple', 'active-approach', 'next-available-exfil', 'nearest-well'],
    policy: ['straight-line', 'steady-visible-current', 'representative-current', 'well-intercept', 'slingshot'],
  },
);
const VALIDATORS = Object.freeze({
  launch: validateKeys(['seed', 'signature']), relaunch: validateKeys(['seed', 'signature']), navigate: NAVIGATE,
  selectApproachTarget: NAVIGATE, salvage: NAVIGATE,
  setMovementIntent: validateKeys(['moveX', 'moveY', 'thrust', 'brake', 'approachTargetId']),
  brake: validateKeys(['intensity', 'targetId', 'hold']), grapple: EMPTY, releaseGrapple: EMPTY,
  emitPulse: EMPTY, confirmExtraction: EMPTY, recover: EMPTY, returnHome: EMPTY,
  pause: EMPTY, resume: EMPTY, exitRun: validateKeys(['confirm']),
  navigateHome: validateKeys(['section'], { section: ['profile', 'ship', 'rig', 'chronicle', 'results', 'map-select'] }),
  selectRig: EMPTY, openChronicle: EMPTY, deletePilot: validateKeys(['confirm']),
  capture: validateKeys(['name', 'overlays', 'provenance']),
});

export function createDefaultJourneyRegistry() {
  const registry = createJourneyRegistry({
    conditionValidator: validateConditionQuery,
  });
  for (const action of DEFAULT_ACTIONS) registry.registerAction(action, VALIDATORS[action] || EMPTY);
  for (const [routine, action] of Object.entries(ACTION_ROUTINES)) {
    registry.registerRoutine(routine, ({ args }) => [{ action, args }], VALIDATORS[action] || EMPTY);
  }
  registry.registerRoutine('die', ({ args }) => [
    { action: 'navigate', args: { policy: 'well-intercept', targetPolicy: args.causePolicy, allowTerminal: true, timeoutMs: 60_000 } },
    { waitForEvent: 'player.died', timeoutMs: 60_000 },
  ], validateKeys(['causePolicy'], {
    causePolicy: ['nearest-well'],
  }));
  return registry;
}
