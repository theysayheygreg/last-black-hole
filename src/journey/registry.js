const DEFAULT_ACTIONS = Object.freeze([
  'launch',
  'navigate',
  'setMovementIntent',
  'selectApproachTarget',
  'brake',
  'grapple',
  'releaseGrapple',
  'salvage',
  'emitPulse',
  'confirmExtraction',
  'recover',
  'returnHome',
  'pause',
  'resume',
  'exitRun',
  'relaunch',
  'navigateHome',
  'selectRig',
  'openChronicle',
  'deletePilot',
  'capture',
]);

const DEFAULT_ROUTINES = Object.freeze([
  'launch',
  'navigate',
  'approach',
  'grapple',
  'release',
  'salvage',
  'extract',
  'die',
  'recover',
  'returnHome',
]);

function requireName(name, label) {
  if (typeof name !== 'string' || !/^[a-z][A-Za-z0-9]*$/.test(name)) {
    throw new TypeError(`${label} must be a lower-camel-case identifier`);
  }
  return name;
}

export class JourneyRegistry {
  #actions = new Set();
  #routines = new Map();
  #conditionValidator;

  constructor({ actions = [], routines = {}, conditionValidator = null } = {}) {
    if (conditionValidator !== null && typeof conditionValidator !== 'function') {
      throw new TypeError('conditionValidator must be a function');
    }
    this.#conditionValidator = conditionValidator;
    for (const action of actions) this.registerAction(action);
    for (const [name, expand] of Object.entries(routines)) this.registerRoutine(name, expand);
  }

  registerAction(name) {
    const validName = requireName(name, 'Journey action');
    if (this.#actions.has(validName)) throw new Error(`Duplicate Journey action: ${validName}`);
    this.#actions.add(validName);
    return this;
  }

  registerRoutine(name, expand) {
    const validName = requireName(name, 'Journey routine');
    if (typeof expand !== 'function') throw new TypeError(`Journey routine ${validName} requires an expansion function`);
    if (this.#routines.has(validName)) throw new Error(`Duplicate Journey routine: ${validName}`);
    this.#routines.set(validName, expand);
    return this;
  }

  requireAction(name) {
    if (!this.#actions.has(name)) throw new RangeError(`Unknown Journey action: ${String(name)}`);
    return name;
  }

  requireRoutine(name) {
    const expand = this.#routines.get(name);
    if (!expand) throw new RangeError(`Unknown Journey routine: ${String(name)}`);
    return expand;
  }

  validateConditionQuery(query) {
    if (!this.#conditionValidator) {
      if (typeof query !== 'string' && (!query || typeof query !== 'object' || Array.isArray(query))) {
        throw new TypeError('Journey condition query must be a condition name or query object');
      }
      return query;
    }
    return this.#conditionValidator(query);
  }

  list() {
    return Object.freeze({
      actions: Object.freeze([...this.#actions]),
      routines: Object.freeze([...this.#routines.keys()]),
    });
  }
}

export function createJourneyRegistry(options = {}) {
  return new JourneyRegistry(options);
}

export { DEFAULT_ACTIONS, DEFAULT_ROUTINES };
