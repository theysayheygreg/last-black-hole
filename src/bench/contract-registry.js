const REQUIRED_TEXT_FIELDS = Object.freeze([
  'id',
  'label',
  'effect',
  'group',
  'unit',
  'drawKind',
  'reset',
]);

export const BENCH_CONTRACT_SCOPES = Object.freeze(['type', 'family', 'system']);
export const BENCH_APPLICATION_TIMINGS = Object.freeze(['live', 'next-tick', 'restart']);

function requireText(value, field, context) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${context}.${field} must be a non-empty string`);
  }
  return value;
}

function cloneIdentity(identity) {
  return Object.freeze({ family: identity.family, type: identity.type });
}

export function validateBenchContract(contract) {
  const context = `Bench contract${contract?.id ? ` '${contract.id}'` : ''}`;
  if (!contract || typeof contract !== 'object' || Array.isArray(contract)) {
    throw new Error('Bench contract must be an object');
  }
  for (const field of REQUIRED_TEXT_FIELDS) requireText(contract[field], field, context);
  if (!BENCH_CONTRACT_SCOPES.includes(contract.scope)) {
    throw new Error(`${context}.scope must be one of: ${BENCH_CONTRACT_SCOPES.join(', ')}`);
  }
  if (!BENCH_APPLICATION_TIMINGS.includes(contract.applies)) {
    throw new Error(`${context}.applies must be one of: ${BENCH_APPLICATION_TIMINGS.join(', ')}`);
  }

  const range = [contract.min, contract.max, contract.step];
  const hasNumericRange = range.every((value) => typeof value === 'number' && Number.isFinite(value));
  const hasNoRange = range.every((value) => value === null);
  if (!hasNumericRange && !hasNoRange) {
    throw new Error(`${context} min, max, and step must be finite numbers or all null`);
  }
  if (hasNumericRange && (contract.min > contract.max || contract.step <= 0)) {
    throw new Error(`${context} requires min <= max and step > 0`);
  }

  return Object.freeze({
    id: contract.id,
    label: contract.label,
    effect: contract.effect,
    group: contract.group,
    unit: contract.unit,
    min: contract.min,
    max: contract.max,
    step: contract.step,
    scope: contract.scope,
    applies: contract.applies,
    drawKind: contract.drawKind,
    reset: contract.reset,
  });
}

export function validateBenchValue(contract, value) {
  if (value !== null && !['number', 'string', 'boolean'].includes(typeof value)) {
    throw new Error(`Bench value for '${contract.id}' must be a JSON scalar`);
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new Error(`Bench value for '${contract.id}' must be finite`);
  }
  if (contract.min !== null) {
    if (typeof value !== 'number') {
      throw new Error(`Bench value for '${contract.id}' must be numeric`);
    }
    if (value < contract.min || value > contract.max) {
      throw new Error(`Bench value for '${contract.id}' must be between ${contract.min} and ${contract.max}`);
    }
    const steps = (value - contract.min) / contract.step;
    if (Math.abs(steps - Math.round(steps)) > 1e-8) {
      throw new Error(`Bench value for '${contract.id}' must align to step ${contract.step}`);
    }
  }
  return value;
}

function validateIdentity(identity, context = 'Bench identity') {
  if (!identity || typeof identity !== 'object' || Array.isArray(identity)) {
    throw new Error(`${context} must be an object`);
  }
  requireText(identity.family, 'family', context);
  requireText(identity.type, 'type', context);
  return identity;
}

function identityKey(identity) {
  return `${identity.family}\u0000${identity.type}`;
}

export class BenchContractRegistry {
  #byId = new Map();
  #byIdentity = new Map();

  register(adapter) {
    if (!adapter || typeof adapter !== 'object' || Array.isArray(adapter)) {
      throw new Error('Bench adapter must be an object');
    }
    const id = requireText(adapter.id, 'id', 'Bench adapter');
    const identity = validateIdentity(adapter.identity, `Bench adapter '${id}'.identity`);
    if (!Array.isArray(adapter.contracts) || adapter.contracts.length === 0) {
      throw new Error(`Bench adapter '${id}' requires at least one curated contract`);
    }
    if (typeof adapter.read !== 'function' || typeof adapter.apply !== 'function') {
      throw new Error(`Bench adapter '${id}' requires explicit read and apply functions`);
    }
    if (this.#byId.has(id)) throw new Error(`Duplicate Bench adapter id '${id}'`);
    const key = identityKey(identity);
    if (this.#byIdentity.has(key)) {
      throw new Error(`Duplicate Bench adapter identity '${identity.family}/${identity.type}'`);
    }

    const contracts = adapter.contracts.map(validateBenchContract);
    const contractIds = new Set();
    for (const contract of contracts) {
      if (contractIds.has(contract.id)) {
        throw new Error(`Duplicate Bench contract id '${contract.id}' in adapter '${id}'`);
      }
      contractIds.add(contract.id);
    }
    const registered = Object.freeze({
      id,
      label: typeof adapter.label === 'string' && adapter.label.trim() ? adapter.label : identity.type,
      identity: cloneIdentity(identity),
      contracts: Object.freeze(contracts),
      read: adapter.read,
      apply: adapter.apply,
    });
    this.#byId.set(id, registered);
    this.#byIdentity.set(key, registered);
    return registered;
  }

  resolve(identity) {
    validateIdentity(identity);
    return this.#byIdentity.get(identityKey(identity)) || null;
  }

  get(adapterId) {
    return this.#byId.get(adapterId) || null;
  }

  contract(adapterOrId, propertyId) {
    const adapter = typeof adapterOrId === 'string' ? this.get(adapterOrId) : adapterOrId;
    if (!adapter) return null;
    return adapter.contracts.find((contract) => contract.id === propertyId) || null;
  }

  adapters() {
    return Object.freeze([...this.#byId.values()]);
  }
}

export function createBenchContractRegistry(adapters = []) {
  const registry = new BenchContractRegistry();
  for (const adapter of adapters) registry.register(adapter);
  return registry;
}
