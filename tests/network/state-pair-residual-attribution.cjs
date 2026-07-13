"use strict";

const crypto = require("crypto");

const SAFE_OWNER_COMPONENTS = new Set(["ownerState", "transient"]);
const MAX_ATTRIBUTION_ROWS = 512;
const SAFE_ENTITY_TYPES = new Set([
  "fauna", "inhibitor", "owner", "planetoid", "player", "portal", "scavenger",
  "sentry", "star", "well", "wreck",
]);

function jsonBytes(value) {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

function safeName(value, fallback = "<other>") {
  return typeof value === "string" && /^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(value) ? value : fallback;
}

function entityType(entity) {
  const explicit = safeName(entity?.category, "");
  if (SAFE_ENTITY_TYPES.has(explicit)) return explicit;
  const identity = typeof entity?.publicEntityId === "string" ? entity.publicEntityId : "";
  const separator = identity.indexOf(":");
  const length = separator > 0 ? Number(identity.slice(0, separator)) : NaN;
  const encodedCategory = Number.isSafeInteger(length) && length > 0
    ? identity.slice(separator + 1, separator + 1 + length) : "";
  return SAFE_ENTITY_TYPES.has(encodedCategory) ? encodedCategory : "<other>";
}

function tokenComposition(value) {
  const result = {
    totalBytes: jsonBytes(value),
    identifierAndKeyBytes: 0,
    stringPayloadBytes: 0,
    numericPayloadBytes: 0,
    booleanAndNullPayloadBytes: 0,
    delimiterBytes: 0,
  };
  const visit = (current) => {
    if (Array.isArray(current)) {
      for (const entry of current) visit(entry);
      return;
    }
    if (current && typeof current === "object") {
      for (const [key, entry] of Object.entries(current)) {
        result.identifierAndKeyBytes += jsonBytes(key);
        visit(entry);
      }
      return;
    }
    const bytes = jsonBytes(current);
    if (typeof current === "number") result.numericPayloadBytes += bytes;
    else if (typeof current === "string") result.stringPayloadBytes += bytes;
    else result.booleanAndNullPayloadBytes += bytes;
  };
  visit(value);
  result.delimiterBytes = result.totalBytes - result.identifierAndKeyBytes - result.stringPayloadBytes
    - result.numericPayloadBytes - result.booleanAndNullPayloadBytes;
  return result;
}

function addComposition(target, source) {
  for (const key of Object.keys(target)) target[key] += source[key];
}

function createRows() {
  return new Map();
}

function observe(rows, key, bytes, pairIndex, extra = {}) {
  if (!rows.has(key) && rows.size >= MAX_ATTRIBUTION_ROWS) {
    throw new Error("residual attribution row cap exceeded");
  }
  const row = rows.get(key) || { key, bytes: 0, occurrences: 0, pairs: new Set(), ...extra };
  row.bytes += bytes;
  row.occurrences += 1;
  row.pairs.add(pairIndex);
  rows.set(key, row);
}

function finalizeRows(rows, totalBytes, pairCount) {
  let cumulative = 0;
  return [...rows.values()].sort((left, right) => right.bytes - left.bytes || left.key.localeCompare(right.key))
    .map((row) => {
      cumulative += row.bytes;
      const { pairs, ...safe } = row;
      return {
        ...safe,
        pairsObserved: pairs.size,
        bytesPerSampledPair: pairCount ? row.bytes / pairCount : null,
        occurrencesPerSampledPair: pairCount ? row.occurrences / pairCount : null,
        pairFrequency: pairCount ? pairs.size / pairCount : null,
        percentOfTotal: totalBytes ? row.bytes / totalBytes : null,
        cumulativePercent: totalBytes ? cumulative / totalBytes : null,
      };
    });
}

function arrayOverhead(array) {
  return jsonBytes(array) - array.reduce((sum, entry) => sum + jsonBytes(entry), 0);
}

function analyzeStatePairSample(rawFrames, { maxFrames = 512 } = {}) {
  if (!Array.isArray(rawFrames) || !Number.isSafeInteger(maxFrames) || maxFrames < 1) {
    throw new TypeError("bounded raw state-pair sample is required");
  }
  const selected = rawFrames.slice(0, maxFrames);
  const pairKinds = {};
  const pairBytes = [];
  let publicBytes = 0;
  let ownerBytes = 0;
  let outerEnvelopeBytes = 0;
  let publicDeltaBytes = 0;
  let publicKeyframeBytes = 0;
  let ownerKeyframeBytes = 0;
  let ownerDeltaBytes = 0;
  const operationRows = createRows();
  const rootRows = createRows();
  const entityRows = createRows();
  const componentRows = createRows();
  const ownerRows = createRows();
  const publicTokens = tokenComposition([]);
  const ownerTokens = tokenComposition([]);
  for (const key of Object.keys(publicTokens)) publicTokens[key] = 0;
  for (const key of Object.keys(ownerTokens)) ownerTokens[key] = 0;

  selected.forEach((raw, pairIndex) => {
    if (typeof raw !== "string") throw new TypeError("captured state pair must be an encoded JSON string");
    const frame = JSON.parse(raw);
    if (frame?.type !== "statePair" || !frame.public || !frame.owner) {
      throw new TypeError("captured frame is not an atomic state pair");
    }
    const encodedBytes = Buffer.byteLength(raw, "utf8");
    if (encodedBytes !== jsonBytes(frame)) throw new Error("captured frame is not exact compact JSON wire bytes");
    const nextPublicBytes = jsonBytes(frame.public);
    const nextOwnerBytes = jsonBytes(frame.owner);
    const nextOuterBytes = encodedBytes - nextPublicBytes - nextOwnerBytes;
    if (nextOuterBytes < 0) throw new Error("state-pair lane attribution exceeded encoded frame bytes");
    pairBytes.push(encodedBytes);
    publicBytes += nextPublicBytes;
    ownerBytes += nextOwnerBytes;
    outerEnvelopeBytes += nextOuterBytes;
    const kind = `public-${frame.public.kind}+owner-${frame.owner.kind}`;
    pairKinds[kind] = (pairKinds[kind] || 0) + 1;

    if (frame.public.kind === "delta") {
      publicDeltaBytes += nextPublicBytes;
      addComposition(publicTokens, tokenComposition(frame.public));
      const delta = frame.public.delta;
      if (!delta || !["rootOps", "creates", "updates", "despawns"].every((key) => Array.isArray(delta[key]))) {
        throw new TypeError("public delta attribution requires canonical operation arrays");
      }
      const classes = ["rootOps", "creates", "updates", "despawns"];
      let classified = 0;
      for (const operationClass of classes) {
        const bytes = jsonBytes(delta[operationClass]);
        classified += bytes;
        observe(operationRows, operationClass, bytes, pairIndex, { operationClass });
      }
      observe(operationRows, "unchangedProtocolOverhead", nextPublicBytes - classified, pairIndex,
        { operationClass: "unchangedProtocolOverhead" });

      const rootOverhead = arrayOverhead(delta.rootOps);
      if (rootOverhead) observe(rootRows, "<array-overhead>", rootOverhead, pairIndex, { rootField: "<array-overhead>" });
      for (const operation of delta.rootOps) {
        const rootField = safeName(operation?.path?.[0], "<other-root>");
        observe(rootRows, rootField, jsonBytes(operation), pairIndex, { rootField });
      }

      for (const operationClass of ["creates", "updates", "despawns"]) {
        const operations = delta[operationClass];
        const overhead = arrayOverhead(operations);
        if (overhead) {
          observe(entityRows, `${operationClass}:<array-overhead>`, overhead, pairIndex,
            { operationClass, entityType: "<array-overhead>" });
          observe(componentRows, `${operationClass}:<array-overhead>`, overhead, pairIndex,
            { operationClass, component: "<array-overhead>" });
        }
        for (const operation of operations) {
          const type = entityType(operation);
          const entryBytes = jsonBytes(operation);
          observe(entityRows, `${operationClass}:${type}`, entryBytes, pairIndex, { operationClass, entityType: type });
          const components = operationClass === "despawns" ? null : operation.components;
          if (!components || typeof components !== "object" || Array.isArray(components)) {
            observe(componentRows, `${operationClass}:<entity-envelope>`, entryBytes, pairIndex,
              { operationClass, component: operationClass === "despawns" ? "<despawn-record>" : "<entity-envelope>" });
            continue;
          }
          let componentBytes = 0;
          for (const [name, component] of Object.entries(components)) {
            const safe = safeName(name, "<other-component>");
            const bytes = jsonBytes(component);
            componentBytes += bytes;
            observe(componentRows, `${operationClass}:${safe}`, bytes, pairIndex,
              { operationClass, component: safe });
          }
          observe(componentRows, `${operationClass}:<entity-envelope>`, entryBytes - componentBytes, pairIndex,
            { operationClass, component: "<entity-envelope>" });
        }
      }
    } else {
      publicKeyframeBytes += nextPublicBytes;
    }

    if (frame.owner.kind === "keyframe") {
      ownerKeyframeBytes += nextOwnerBytes;
      addComposition(ownerTokens, tokenComposition(frame.owner));
      let classified = 0;
      for (const entity of frame.owner.projection?.entities || []) {
        for (const [name, component] of Object.entries(entity?.components || {})) {
          const safe = SAFE_OWNER_COMPONENTS.has(name) ? name : "<redacted-component>";
          const bytes = jsonBytes(component);
          classified += bytes;
          observe(ownerRows, safe, bytes, pairIndex, { component: safe });
        }
      }
      observe(ownerRows, "<owner-envelope-and-lineage>", nextOwnerBytes - classified, pairIndex,
        { component: "<owner-envelope-and-lineage>" });
    } else {
      ownerDeltaBytes += nextOwnerBytes;
    }
  });

  const encodedPairBytes = pairBytes.reduce((sum, value) => sum + value, 0);
  const operationClassBytes = [...operationRows.values()].reduce((sum, row) => sum + row.bytes, 0);
  const ownerClassifiedBytes = [...ownerRows.values()].reduce((sum, row) => sum + row.bytes, 0);
  const safeResult = {
    schema: "lbh-state-pair-residual-attribution-v1",
    sample: {
      boundedMaxFrames: maxFrames,
      capturedAcceptedFrames: selected.length,
      pairKinds: Object.fromEntries(Object.entries(pairKinds).sort(([a], [b]) => a.localeCompare(b))),
      encodedPairBytes,
      pairBytes: selected.length ? {
        mean: encodedPairBytes / selected.length,
        min: Math.min(...pairBytes),
        max: Math.max(...pairBytes),
      } : { mean: null, min: null, max: null },
    },
    exactLaneReconciliation: {
      encodedPairBytes,
      publicBytes,
      ownerBytes,
      outerEnvelopeBytes,
      reconciledBytes: publicBytes + ownerBytes + outerEnvelopeBytes,
      passed: encodedPairBytes === publicBytes + ownerBytes + outerEnvelopeBytes,
    },
    publicDelta: {
      bytes: publicDeltaBytes,
      publicKeyframeBytes,
      operationClasses: finalizeRows(operationRows, publicDeltaBytes, selected.length),
      operationClassReconciliation: {
        classifiedBytes: operationClassBytes,
        expectedBytes: publicDeltaBytes,
        passed: operationClassBytes === publicDeltaBytes,
      },
      rootFields: finalizeRows(rootRows,
        [...rootRows.values()].reduce((sum, row) => sum + row.bytes, 0), selected.length),
      entityTypes: finalizeRows(entityRows,
        [...entityRows.values()].reduce((sum, row) => sum + row.bytes, 0), selected.length),
      components: finalizeRows(componentRows,
        [...componentRows.values()].reduce((sum, row) => sum + row.bytes, 0), selected.length),
      tokenComposition: publicTokens,
      classificationNote: "Operation classes are exact additive. Root, entity-type, and component tables are overlapping drill-down views; JSON array/object delimiter overhead is explicit.",
    },
    ownerKeyframe: {
      bytes: ownerKeyframeBytes,
      ownerDeltaBytes,
      publicSafeComponents: finalizeRows(ownerRows, ownerKeyframeBytes, selected.length),
      reconciliation: {
        classifiedBytes: ownerClassifiedBytes,
        expectedBytes: ownerKeyframeBytes,
        passed: ownerClassifiedBytes === ownerKeyframeBytes,
      },
      tokenComposition: ownerTokens,
    },
    privacy: {
      rawFramesRetained: false,
      ownerPrivateValuesEmitted: false,
      ownerComponentNamesAllowlisted: [...SAFE_OWNER_COMPONENTS].sort(),
      identifiersAggregatedBySerializedLengthOnly: true,
    },
  };
  safeResult.safeAggregateSha256 = crypto.createHash("sha256")
    .update(JSON.stringify(safeResult), "utf8").digest("hex");
  return safeResult;
}

module.exports = { analyzeStatePairSample, tokenComposition };
