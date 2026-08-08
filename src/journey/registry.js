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
  #actions = new Map();
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

  registerAction(name, validateArgs = null) {
    const validName = requireName(name, 'Journey action');
    if (this.#actions.has(validName)) throw new Error(`Duplicate Journey action: ${validName}`);
    if (validateArgs !== null && typeof validateArgs !== 'function') {
      throw new TypeError(`Journey action ${validName} argument validator must be a function`);
    }
    this.#actions.set(validName, validateArgs);
    return this;
  }

  registerRoutine(name, expand, validateArgs = null) {
    const validName = requireName(name, 'Journey routine');
    if (typeof expand !== 'function') throw new TypeError(`Journey routine ${validName} requires an expansion function`);
    if (this.#routines.has(validName)) throw new Error(`Duplicate Journey routine: ${validName}`);
    if (validateArgs !== null && typeof validateArgs !== 'function') {
      throw new TypeError(`Journey routine ${validName} argument validator must be a function`);
    }
    this.#routines.set(validName, { expand, validateArgs });
    return this;
  }

  requireAction(name) {
    if (!this.#actions.has(name)) throw new RangeError(`Unknown Journey action: ${String(name)}`);
    return name;
  }

  requireRoutine(name) {
    const routine = this.#routines.get(name);
    if (!routine) throw new RangeError(`Unknown Journey routine: ${String(name)}`);
    return routine.expand;
  }

  validateActionArgs(name, args) {
    this.requireAction(name);
    return this.#actions.get(name)?.(args) ?? args;
  }

  validateRoutineArgs(name, args) {
    this.requireRoutine(name);
    return this.#routines.get(name).validateArgs?.(args) ?? args;
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
      actions: Object.freeze([...this.#actions.keys()]),
      routines: Object.freeze([...this.#routines.keys()]),
    });
  }
}

export function createJourneyRegistry(options = {}) {
  return new JourneyRegistry(options);
}

export { DEFAULT_ACTIONS, DEFAULT_ROUTINES };
