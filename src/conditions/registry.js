import manifest from '../content/conditions.data.json' with { type: 'json' };

export const CONDITION_SCHEMA_VERSION = manifest.schemaVersion;
export const CONDITION_SCOPES = Object.freeze(['install', 'pilot', 'run', 'session']);
export const CONDITION_TYPES = Object.freeze(['boolean', 'integer', 'number', 'identifier', 'string']);
export const CONDITION_ACTIONS = Object.freeze(['initialize', 'set', 'increment', 'max']);

const IDENTIFIER_PATTERN = /^[a-z0-9]+(?:[._-][A-Za-z0-9]+)*$/;
const CONDITION_NAME_PATTERN = /^(install|pilot|run|session)\.[A-Za-z0-9]+(?:\.[A-Za-z0-9]+)*$/;

function frozenCopy(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(frozenCopy));
  if (value && typeof value === 'object') {
    return Object.freeze(Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, frozenCopy(child)]),
    ));
  }
  return value;
}

function fail(message) {
  throw new Error(`Condition registry: ${message}`);
}

export function conditionScope(name) {
  return String(name).split('.', 1)[0];
}

export function validateConditionValue(definition, value, label = definition.name) {
  const type = definition.type;
  if (type === 'boolean' && typeof value !== 'boolean') {
    throw new TypeError(`${label} expects boolean, received ${typeof value}`);
  }
  if (type === 'integer' && !Number.isSafeInteger(value)) {
    throw new TypeError(`${label} expects a safe integer`);
  }
  if (type === 'number' && (typeof value !== 'number' || !Number.isFinite(value))) {
    throw new TypeError(`${label} expects a finite number`);
  }
  if (type === 'identifier' && (typeof value !== 'string' || !IDENTIFIER_PATTERN.test(value))) {
    throw new TypeError(`${label} expects a stable identifier`);
  }
  if (type === 'string' && typeof value !== 'string') {
    throw new TypeError(`${label} expects a string`);
  }
  if (typeof value === 'number') {
    if (definition.minimum !== undefined && value < definition.minimum) {
      throw new RangeError(`${label} must be at least ${definition.minimum}`);
    }
    if (definition.maximum !== undefined && value > definition.maximum) {
      throw new RangeError(`${label} must be at most ${definition.maximum}`);
    }
  }
  if (definition.maxLength !== undefined && value.length > definition.maxLength) {
    throw new RangeError(`${label} must contain at most ${definition.maxLength} characters`);
  }
  if (definition.allowedValues && !definition.allowedValues.includes(value)) {
    throw new RangeError(`${label} must be one of: ${definition.allowedValues.join(', ')}`);
  }
  return value;
}

function validateDefinition(raw, seen) {
  if (!raw || typeof raw !== 'object') fail('each entry must be an object');
  const { name, kind, type } = raw;
  if (typeof name !== 'string' || !CONDITION_NAME_PATTERN.test(name)) fail(`invalid name ${String(name)}`);
  if (seen.has(name)) fail(`duplicate name ${name}`);
  seen.add(name);
  if (kind !== 'stored' && kind !== 'derived') fail(`${name} has invalid kind ${kind}`);
  if (!CONDITION_TYPES.includes(type)) fail(`${name} has invalid type ${type}`);
  if (raw.allowedValues !== undefined && (!Array.isArray(raw.allowedValues) || raw.allowedValues.length === 0)) {
    fail(`${name} allowedValues must be a non-empty array`);
  }
  if (raw.allowedValues && new Set(raw.allowedValues).size !== raw.allowedValues.length) {
    fail(`${name} allowedValues contains duplicates`);
  }
  if (raw.minimum !== undefined && (typeof raw.minimum !== 'number' || !Number.isFinite(raw.minimum))) {
    fail(`${name} minimum must be finite`);
  }
  if (raw.maximum !== undefined && (typeof raw.maximum !== 'number' || !Number.isFinite(raw.maximum))) {
    fail(`${name} maximum must be finite`);
  }
  if (raw.minimum !== undefined && raw.maximum !== undefined && raw.minimum > raw.maximum) {
    fail(`${name} minimum exceeds maximum`);
  }
  if (kind === 'stored') {
    if (!Array.isArray(raw.actions) || raw.actions.length === 0) fail(`${name} requires declared actions`);
    for (const action of raw.actions) {
      if (!CONDITION_ACTIONS.includes(action)) fail(`${name} has invalid action ${action}`);
      if ((action === 'increment' || action === 'max') && type !== 'integer' && type !== 'number') {
        fail(`${name} cannot declare numeric action ${action}`);
      }
    }
  } else if (raw.actions !== undefined || raw.default !== undefined) {
    fail(`${name} derived entries cannot declare actions or defaults`);
  }
  if (raw.default !== undefined) validateConditionValue(raw, raw.default);
  if (raw.allowedValues) raw.allowedValues.forEach((value) => validateConditionValue({ ...raw, allowedValues: undefined }, value));
  return frozenCopy({ ...raw, scope: conditionScope(name) });
}

if (!Number.isSafeInteger(manifest.schemaVersion) || manifest.schemaVersion < 1) {
  fail('schemaVersion must be a positive integer');
}
if (!Array.isArray(manifest.conditions)) fail('conditions must be an array');

const seen = new Set();
const definitions = manifest.conditions.map((raw) => validateDefinition(raw, seen));
const byName = new Map(definitions.map((definition) => [definition.name, definition]));

export const CONDITION_DEFINITIONS = Object.freeze(definitions);
export const CONDITION_NAMES = Object.freeze(definitions.map(({ name }) => name));

export function getConditionDefinition(name) {
  const definition = byName.get(String(name));
  if (!definition) throw new RangeError(`Unknown condition: ${String(name)}`);
  return definition;
}

export function hasConditionDefinition(name) {
  return byName.has(String(name));
}
