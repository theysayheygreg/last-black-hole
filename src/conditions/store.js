import {
  CONDITION_SCHEMA_VERSION,
  conditionScope,
  getConditionDefinition,
  validateConditionValue,
} from './registry.js';
import { evaluateConditionQuery, validateConditionQuery } from './query.js';

const RESETTABLE_SCOPES = new Set(['run', 'session']);

function inputValues(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  return input.values && typeof input.values === 'object' && !Array.isArray(input.values)
    ? input.values
    : input;
}

export function sanitizeConditionValues(input, { scopes = null } = {}) {
  const allowedScopes = scopes == null ? null : new Set(scopes);
  const values = {};
  const issues = [];
  for (const [name, value] of Object.entries(inputValues(input))) {
    try {
      const definition = getConditionDefinition(name);
      if (definition.kind !== 'stored') throw new TypeError(`${name} is derived and cannot be persisted`);
      if (allowedScopes && !allowedScopes.has(definition.scope)) continue;
      validateConditionValue(definition, value);
      values[name] = value;
    } catch (error) {
      issues.push(Object.freeze({ name, message: error.message }));
    }
  }
  return Object.freeze({
    schemaVersion: CONDITION_SCHEMA_VERSION,
    values: Object.freeze(values),
    issues: Object.freeze(issues),
  });
}

export class ConditionStore {
  #values = new Map();
  #providers = new Map();

  constructor({ initialValues = {}, derivedProviders = {} } = {}) {
    const sanitized = sanitizeConditionValues(initialValues);
    for (const [name, value] of Object.entries(sanitized.values)) this.#values.set(name, value);
    this.migrationIssues = sanitized.issues;
    for (const [name, provider] of Object.entries(derivedProviders)) {
      this.registerDerived(name, provider);
    }
  }

  registerDerived(name, provider) {
    const definition = getConditionDefinition(name);
    if (definition.kind !== 'derived') throw new TypeError(`${name} is stored and cannot register a provider`);
    if (typeof provider !== 'function') throw new TypeError(`Derived provider for ${name} must be a function`);
    if (this.#providers.has(name)) throw new Error(`Derived provider already registered: ${name}`);
    this.#providers.set(name, provider);
    return this;
  }

  read(name, context) {
    const definition = getConditionDefinition(name);
    if (definition.kind === 'derived') {
      const provider = this.#providers.get(definition.name);
      if (!provider) throw new Error(`No derived provider registered for ${definition.name}`);
      const value = provider(context);
      return validateConditionValue(definition, value);
    }
    if (this.#values.has(definition.name)) return this.#values.get(definition.name);
    if (definition.default !== undefined) return definition.default;
    return undefined;
  }

  mutate(action, name, value) {
    const definition = getConditionDefinition(name);
    if (definition.kind !== 'stored') throw new TypeError(`${name} is derived and read-only`);
    if (!definition.actions.includes(action)) {
      throw new TypeError(`${action} is not declared for ${name}`);
    }
    let next = value;
    if (action === 'initialize') {
      if (this.#values.has(name)) return this.#values.get(name);
    } else if (action === 'increment') {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new TypeError(`increment for ${name} requires a finite numeric delta`);
      }
      next = this.read(name) + value;
    } else if (action === 'max') {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new TypeError(`max for ${name} requires a finite numeric candidate`);
      }
      next = Math.max(this.read(name), value);
    }
    validateConditionValue(definition, next);
    this.#values.set(name, next);
    return next;
  }

  clearScope(scope) {
    if (!RESETTABLE_SCOPES.has(scope)) {
      throw new TypeError(`Condition scope ${scope} cannot be cleared at runtime`);
    }
    for (const name of this.#values.keys()) {
      if (conditionScope(name) === scope) this.#values.delete(name);
    }
  }

  evaluate(query, context) {
    return evaluateConditionQuery(this, query, context);
  }

  assert(query, context, message = 'Condition assertion failed') {
    const validated = validateConditionQuery(query);
    if (!evaluateConditionQuery(this, validated, context)) {
      throw new Error(`${message}: ${JSON.stringify(validated)}`);
    }
    return true;
  }

  serialize({ scopes = null } = {}) {
    const allowedScopes = scopes == null ? null : new Set(scopes);
    const values = {};
    for (const [name, value] of this.#values) {
      if (!allowedScopes || allowedScopes.has(conditionScope(name))) values[name] = value;
    }
    return Object.freeze({
      schemaVersion: CONDITION_SCHEMA_VERSION,
      values: Object.freeze(values),
    });
  }
}
