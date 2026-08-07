const IDENTIFIER = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;
const MIN_TIMEOUT_MS = 50;

function requireRecord(value, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${path} must be an object`);
  }
  return value;
}

function requireString(value, path) {
  if (typeof value !== 'string' || value.trim() === '') throw new TypeError(`${path} must be a non-empty string`);
  return value;
}

function validateTimeout(timeoutMs, path) {
  if (!Number.isFinite(timeoutMs) || timeoutMs < MIN_TIMEOUT_MS) {
    throw new RangeError(`${path} must be at least ${MIN_TIMEOUT_MS}ms`);
  }
  return timeoutMs;
}

function validateData(value, path) {
  if (value === null || ['string', 'boolean'].includes(typeof value)) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map((entry, index) => validateData(entry, `${path}[${index}]`));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, validateData(entry, `${path}.${key}`)]));
  }
  throw new TypeError(`${path} must contain JSON-compatible finite data`);
}

function validateSetup(raw) {
  const setup = requireRecord(raw, 'journey.setup');
  const required = ['seed', 'pilot', 'hull', 'map'];
  for (const field of required) {
    if (field === 'seed') {
      if (!['string', 'number'].includes(typeof setup.seed) || setup.seed === '') {
        throw new TypeError('journey.setup.seed must be a stable string or number');
      }
    } else requireString(setup[field], `journey.setup.${field}`);
  }
  if (!Array.isArray(setup.loadout)) throw new TypeError('journey.setup.loadout must be an array');
  requireRecord(setup.runRules, 'journey.setup.runRules');
  const startingProfileFacts = requireRecord(setup.startingProfileFacts, 'journey.setup.startingProfileFacts');
  for (const [name, value] of Object.entries(startingProfileFacts)) {
    const definition = getConditionDefinition(name);
    if (definition.kind !== 'stored' || !['install', 'pilot'].includes(definition.scope)) {
      throw new TypeError(`journey.setup.startingProfileFacts.${name} must be an install.* or pilot.* stored condition`);
    }
    if (!definition.actions.includes('set') && !definition.actions.includes('initialize')) {
      throw new TypeError(`journey.setup.startingProfileFacts.${name} has no declared setup mutation`);
    }
    validateConditionValue(definition, value, `journey.setup.startingProfileFacts.${name}`);
  }
  return validateData(setup, 'journey.setup');
}

function validateKnownFailure(raw) {
  if (raw === undefined) return null;
  const knownFailure = requireRecord(raw, 'journey.knownFailure');
  requireString(knownFailure.reason, 'journey.knownFailure.reason');
  requireString(knownFailure.owner, 'journey.knownFailure.owner');
  requireString(knownFailure.reviewDate, 'journey.knownFailure.reviewDate');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(knownFailure.reviewDate)
    || Number.isNaN(Date.parse(`${knownFailure.reviewDate}T00:00:00Z`))) {
    throw new TypeError('journey.knownFailure.reviewDate must be an ISO calendar date');
  }
  return Object.freeze({ ...knownFailure });
}

export function validateJourneyStep(raw, registry, path = 'journey.steps[0]') {
  const step = requireRecord(raw, path);
  if ('frame' in step || 'frames' in step || 'frameNumber' in step) {
    throw new TypeError(`${path} cannot choreograph gameplay by frame number`);
  }
  const kinds = ['action', 'routine', 'waitForCondition', 'waitForEvent', 'assertCondition']
    .filter((key) => Object.hasOwn(step, key));
  if (kinds.length !== 1) throw new TypeError(`${path} must declare exactly one Journey step kind`);
  const kind = kinds[0];
  const normalized = { id: step.id || `${kind}:${path}` };
  requireString(normalized.id, `${path}.id`);

  if (kind === 'action') {
    normalized.action = registry.requireAction(requireString(step.action, `${path}.action`));
    normalized.args = validateData(step.args || {}, `${path}.args`);
  } else if (kind === 'routine') {
    registry.requireRoutine(requireString(step.routine, `${path}.routine`));
    normalized.routine = step.routine;
    normalized.args = validateData(step.args || {}, `${path}.args`);
  } else if (kind === 'waitForCondition') {
    normalized.waitForCondition = registry.validateConditionQuery(step.waitForCondition);
    normalized.timeoutMs = validateTimeout(step.timeoutMs, `${path}.timeoutMs`);
    normalized.pollMs = step.pollMs === undefined ? 50 : validateTimeout(step.pollMs, `${path}.pollMs`);
    if (normalized.pollMs > normalized.timeoutMs) throw new RangeError(`${path}.pollMs cannot exceed timeoutMs`);
  } else if (kind === 'waitForEvent') {
    normalized.waitForEvent = requireString(step.waitForEvent, `${path}.waitForEvent`);
    normalized.timeoutMs = validateTimeout(step.timeoutMs, `${path}.timeoutMs`);
  } else {
    normalized.assertCondition = registry.validateConditionQuery(step.assertCondition);
    if (step.message !== undefined) normalized.message = requireString(step.message, `${path}.message`);
  }

  if (step.target !== undefined) normalized.target = validateData(step.target, `${path}.target`);
  return Object.freeze(normalized);
}

export function validateJourneyDefinition(raw, registry) {
  const journey = requireRecord(raw, 'journey');
  const id = requireString(journey.id, 'journey.id');
  if (!IDENTIFIER.test(id)) throw new TypeError('journey.id must be a stable lowercase dotted or dashed identifier');
  if (journey.version !== 1) throw new RangeError('journey.version must be 1');
  if (!Array.isArray(journey.steps) || journey.steps.length === 0) {
    throw new TypeError('journey.steps must be a non-empty array');
  }
  const controllerPolicy = validateData(requireRecord(journey.controllerPolicy, 'journey.controllerPolicy'), 'journey.controllerPolicy');
  return Object.freeze({
    id,
    version: 1,
    description: journey.description ? requireString(journey.description, 'journey.description') : '',
    setup: Object.freeze(validateSetup(journey.setup)),
    controllerPolicy: Object.freeze(controllerPolicy),
    knownFailure: validateKnownFailure(journey.knownFailure),
    steps: Object.freeze(journey.steps.map((step, index) => validateJourneyStep(step, registry, `journey.steps[${index}]`))),
  });
}

export { MIN_TIMEOUT_MS };
import { getConditionDefinition, validateConditionValue } from '../conditions/index.js';
