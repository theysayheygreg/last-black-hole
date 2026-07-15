const { createRNGStreams } = require('./rng-stream.cjs');
const {
  ANOMALY_CATALOG_DATA,
  ANOMALY_CATALOG,
  ANOMALY_MAP_POLICIES,
  ANOMALY_FABRIC_PARAMETER_CONTRACT,
} = require('./content/anomalies.cjs');

const ANOMALY_CATALOG_SCHEMA_VERSION = ANOMALY_CATALOG_DATA.schemaVersion;
const BASE_WELL_CATALOG_ID = 'base-well';
const DEFAULT_POLICY = {
  mode: 'fixed-curated',
  drawStream: null,
  fixedCast: [BASE_WELL_CATALOG_ID],
  eligibleCatalogIds: [BASE_WELL_CATALOG_ID],
};

function hasObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function requiredString(value) {
  return typeof value === 'string' && value.length > 0;
}

function isStepAligned(value, declaration) {
  const step = Number(declaration.step);
  const minimum = Number(declaration.range?.[0]);
  if (!Number.isFinite(step) || !Number.isFinite(minimum)) return false;
  const quotient = (value - minimum) / step;
  return Math.abs(quotient - Math.round(quotient)) <= 1e-9;
}

function catalogErrors(data) {
  const errors = [];
  if (!hasObject(data)) return ['catalog must be an object'];
  if (data.schemaVersion !== 1) errors.push('schemaVersion must be 1');
  if (!hasObject(data.tunableContract)) errors.push('tunableContract must be an object');
  if (!hasObject(data.catalog) || Object.keys(data.catalog).length === 0) errors.push('catalog must contain at least one entry');
  for (const [key, entry] of Object.entries(data.catalog || {})) {
    const prefix = `catalog.${key}`;
    if (!hasObject(entry)) {
      errors.push(`${prefix} must be an object`);
      continue;
    }
    if (entry.id !== key || !requiredString(entry.id)) errors.push(`${prefix}.id must match its key`);
    if (!['shipping', 'planned'].includes(entry.status)) errors.push(`${prefix}.status must be shipping or planned`);
    if (!requiredString(entry.activation)) errors.push(`${prefix}.activation is required`);
    if (!requiredString(entry.runtimeBehaviorId)) errors.push(`${prefix}.runtimeBehaviorId is required`);
    for (const field of ['fabricSignature', 'interactionVerb', 'tell', 'growthBehavior', 'tunables']) if (!hasObject(entry[field])) errors.push(`${prefix}.${field} is required`);
    if (entry.status === 'shipping' && entry.shipping === false) errors.push(`${prefix} shipping entry cannot be disabled`);
    if (entry.status === 'planned' && entry.shipping !== false) errors.push(`${prefix} planned entry must set shipping=false`);
  }
  const base = data.catalog?.[BASE_WELL_CATALOG_ID];
  if (!base || base.status !== 'shipping' || base.runtimeBehaviorId !== BASE_WELL_CATALOG_ID) errors.push('base-well must be the shipping phase-1 runtime behavior');
  const fields = data.tunableContract?.fields;
  if (!hasObject(fields) || Object.keys(fields).length === 0) errors.push('tunableContract.fields must contain fields');
  for (const [key, field] of Object.entries(fields || {})) {
    const prefix = `tunableContract.fields.${key}`;
    if (!hasObject(field)) {
      errors.push(`${prefix} must be an object`);
      continue;
    }
    if (!requiredString(field.unit)) errors.push(`${prefix}.unit is required`);
    if (!Array.isArray(field.range) || field.range.length !== 2 || !field.range.every(Number.isFinite)) errors.push(`${prefix}.range must be two finite numbers`);
    if (!Number.isFinite(field.step) || field.step <= 0) errors.push(`${prefix}.step must be positive`);
    if (!requiredString(field.startBias)) errors.push(`${prefix}.startBias is required`);
    if (!requiredString(field.source)) errors.push(`${prefix}.source is required`);
  }
  const fabricParameters = data.tunableContract?.fabricSignatureParameters;
  if (!hasObject(fabricParameters) || Object.keys(fabricParameters).length === 0) errors.push('tunableContract.fabricSignatureParameters must contain parameters');
  for (const [key, parameter] of Object.entries(fabricParameters || {})) {
    const prefix = `tunableContract.fabricSignatureParameters.${key}`;
    if (!hasObject(parameter)) {
      errors.push(`${prefix} must be an object`);
      continue;
    }
    if (!requiredString(parameter.unit)) errors.push(`${prefix}.unit is required`);
    if (!Array.isArray(parameter.range) || parameter.range.length !== 2
      || !parameter.range.every(Number.isFinite) || parameter.range[1] < parameter.range[0]) errors.push(`${prefix}.range must be two ordered finite numbers`);
    if (!Number.isFinite(parameter.step) || parameter.step <= 0) errors.push(`${prefix}.step must be positive`);
    if (!requiredString(parameter.startBias)) errors.push(`${prefix}.startBias is required`);
    if (!requiredString(parameter.source)) errors.push(`${prefix}.source is required`);
  }
  const fabricParameterNames = Object.keys(fabricParameters || {}).sort();
  for (const [key, entry] of Object.entries(data.catalog || {})) {
    if (entry?.status !== 'shipping') continue;
    const prefix = `catalog.${key}.fabricSignature`;
    const signature = entry.fabricSignature;
    if (!hasObject(signature) || signature.kind !== 'bounded-parameter-vector'
      || !requiredString(signature.id) || signature.fieldFamily !== 'well'
      || !hasObject(signature.parameters)) {
      errors.push(`${prefix} must be a bounded well parameter vector`);
      continue;
    }
    const parameterNames = Object.keys(signature.parameters).sort();
    if (JSON.stringify(parameterNames) !== JSON.stringify(fabricParameterNames)) errors.push(`${prefix}.parameters must match the central parameter contract`);
    for (const name of fabricParameterNames) {
      const value = signature.parameters[name];
      const declaration = fabricParameters[name];
      if (!hasObject(declaration)) continue;
      if (!Number.isFinite(value)) {
        errors.push(`${prefix}.parameters.${name} must be finite`);
        continue;
      }
      if (!Array.isArray(declaration.range) || value < declaration.range[0] - 1e-9
        || value > declaration.range[1] + 1e-9) errors.push(`${prefix}.parameters.${name} is outside its declared range`);
      else if (!isStepAligned(value, declaration)) errors.push(`${prefix}.parameters.${name} must align to its declared step`);
    }
  }
  const growthEvent = data.eventContracts?.wellGrowth;
  if (!hasObject(growthEvent) || !requiredString(growthEvent.type)
    || !requiredString(growthEvent.tellId) || !requiredString(growthEvent.waveFamily)) {
    errors.push('eventContracts.wellGrowth must declare type, tellId, and waveFamily');
  }
  const epochContract = data.collapseEpochContract;
  if (!hasObject(epochContract) || epochContract.schemaVersion !== 1
    || epochContract.status !== 'provisional' || epochContract.boundaryMode !== 'match-progress') {
    errors.push('collapseEpochContract must declare provisional match-progress schema version 1');
  }
  if (!hasObject(epochContract?.parameterVectors) || Object.keys(epochContract.parameterVectors).length === 0) {
    errors.push('collapseEpochContract.parameterVectors must be non-empty');
  }
  if (!Array.isArray(epochContract?.boundaries) || epochContract.boundaries.length < 2) {
    errors.push('collapseEpochContract.boundaries must contain at least two entries');
  }
  for (const [mapId, policy] of Object.entries(data.mapPolicies || {})) {
    const prefix = `mapPolicies.${mapId}`;
    if (!hasObject(policy)) {
      errors.push(`${prefix} must be an object`);
      continue;
    }
    if (!['fixed-curated', 'seeded-draw'].includes(policy.mode)) errors.push(`${prefix}.mode is invalid`);
    if (!Array.isArray(policy.eligibleCatalogIds) || policy.eligibleCatalogIds.length === 0) errors.push(`${prefix}.eligibleCatalogIds must be non-empty`);
    for (const id of policy.eligibleCatalogIds || []) if (!data.catalog?.[id]) errors.push(`${prefix} references unknown catalog id ${id}`);
    if (policy.mode === 'fixed-curated' && (!Array.isArray(policy.fixedCast) || policy.fixedCast.length === 0)) errors.push(`${prefix}.fixedCast must be non-empty for a fixed policy`);
  }
  return errors;
}

function validateAnomalyCatalog(data = ANOMALY_CATALOG_DATA) {
  const errors = catalogErrors(data);
  return { ok: errors.length === 0, errors };
}

function assertValidAnomalyCatalog(data = ANOMALY_CATALOG_DATA) {
  const result = validateAnomalyCatalog(data);
  if (!result.ok) throw new Error(`Invalid anomaly catalog: ${result.errors.join('; ')}`);
  return true;
}

function getAnomalyDefinition(catalogId = BASE_WELL_CATALOG_ID) {
  return ANOMALY_CATALOG[catalogId] || ANOMALY_CATALOG[BASE_WELL_CATALOG_ID];
}

function getRuntimeBehaviorId(catalogId = BASE_WELL_CATALOG_ID) {
  return getAnomalyDefinition(catalogId).runtimeBehaviorId || BASE_WELL_CATALOG_ID;
}

function getFabricSignature(catalogId = BASE_WELL_CATALOG_ID) {
  const entry = getAnomalyDefinition(catalogId);
  const signature = entry.fabricSignature || {};
  return {
    id: signature.id || `${entry.id}-signature`,
    kind: signature.kind || 'bounded-parameter-vector',
    fieldFamily: signature.fieldFamily || 'well',
    parameters: { ...(signature.parameters || {}) },
  };
}

function migrateCurrentWell(well = {}, catalogId = well.catalogId || BASE_WELL_CATALOG_ID) {
  const entry = getAnomalyDefinition(catalogId);
  const fabricSignature = getFabricSignature(entry.id);
  return {
    ...well,
    catalogId: entry.id,
    behaviorId: getRuntimeBehaviorId(entry.id),
    catalogActivation: entry.activation,
    fabricSignatureId: fabricSignature.id,
    fabricSignature,
  };
}

function derivedRng(rngStreams, seed, mapId, slot) {
  if (rngStreams?.derive) return rngStreams.derive('anomalyCatalog', `${mapId}:${slot}`);
  return createRNGStreams(seed).derive('anomalyCatalog', `${mapId}:${slot}`);
}

function shuffled(ids, rng) {
  const result = ids.slice();
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function selectAnomalyCast({ mapId, seed = 1, wellCount = 0, rngStreams = null } = {}) {
  assertValidAnomalyCatalog();
  const normalizedMapId = String(mapId || 'shallows');
  const policy = ANOMALY_MAP_POLICIES[normalizedMapId] || DEFAULT_POLICY;
  const count = Math.max(0, Math.floor(Number(wellCount) || 0));
  const eligibleMap = [];
  const cast = [];
  for (let slot = 0; slot < count; slot += 1) {
    const candidateIds = policy.mode === 'seeded-draw'
      ? shuffled(policy.eligibleCatalogIds, derivedRng(rngStreams, seed, normalizedMapId, slot))
      : policy.eligibleCatalogIds.slice();
    const fixedId = policy.fixedCast[slot % policy.fixedCast.length] || BASE_WELL_CATALOG_ID;
    const catalogId = policy.mode === 'fixed-curated' ? fixedId : candidateIds[0];
    const entry = getAnomalyDefinition(catalogId);
    eligibleMap.push({ slot, candidateIds, selectedId: catalogId });
    cast.push({
      slot,
      catalogId: entry.id,
      runtimeBehaviorId: getRuntimeBehaviorId(entry.id),
      shipping: entry.status === 'shipping',
      fabricSignatureId: getFabricSignature(entry.id).id,
      fabricSignature: getFabricSignature(entry.id),
      interactionVerbId: entry.interactionVerb?.id || null,
      tellId: entry.tell?.id || null,
      growthBehaviorId: entry.growthBehavior?.id || null,
    });
  }
  return {
    schemaVersion: ANOMALY_CATALOG_SCHEMA_VERSION,
    mapId: normalizedMapId,
    seed: Number(seed) || 1,
    policy: policy.mode,
    drawStream: policy.drawStream,
    eligibleMap,
    cast,
    castIdentity: cast.map((entry) => entry.catalogId).join('|'),
  };
}

module.exports = {
  ANOMALY_CATALOG_SCHEMA_VERSION,
  BASE_WELL_CATALOG_ID,
  ANOMALY_CATALOG_DATA,
  ANOMALY_CATALOG,
  ANOMALY_MAP_POLICIES,
  ANOMALY_FABRIC_PARAMETER_CONTRACT,
  ANOMALY_EVENT_CONTRACTS: ANOMALY_CATALOG_DATA.eventContracts,
  ANOMALY_COLLAPSE_EPOCH_CONTRACT: ANOMALY_CATALOG_DATA.collapseEpochContract,
  validateAnomalyCatalog,
  assertValidAnomalyCatalog,
  getAnomalyDefinition,
  getRuntimeBehaviorId,
  getFabricSignature,
  migrateCurrentWell,
  selectAnomalyCast,
};
