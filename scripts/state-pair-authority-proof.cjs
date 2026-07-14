"use strict";

// Internal bridge between the authority publisher and the negotiated
// positional encoder. The proof object itself is deliberately opaque: its
// brand and facts live only in this module's WeakMap and it is consumed once.
// This file is not re-exported by either public protocol module.

const { canonicalJson } = require("./session-replication-manifest.cjs");
const { composeStatePairLaneCandidates } = require("./state-pair-positional-codec.cjs");

const activeProofs = new WeakMap();
let issuerBound = false;

class AuthorityStatePairProofError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "AuthorityStatePairProofError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new AuthorityStatePairProofError(code, message);
}

function assertDeepFrozen(value, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  if (!Object.isFrozen(value)) fail("invalid-trusted-proof", "trusted state-pair inputs must be frozen");
  for (const child of Object.values(value)) assertDeepFrozen(child, seen);
}

function exactLaneSet(lanes) {
  if (!lanes || typeof lanes !== "object" || Array.isArray(lanes)
      || !lanes.public || !lanes.owner) {
    fail("invalid-trusted-proof", "trusted state-pair lanes are incomplete");
  }
  const expected = [
    ["public-keyframe", lanes.public.keyframe],
    ["public-delta", lanes.public.delta],
    ["owner-keyframe", lanes.owner.keyframe],
    ["owner-delta", lanes.owner.delta],
  ];
  if (expected.some(([, payload]) => !payload || typeof payload !== "object" || Array.isArray(payload))) {
    fail("invalid-trusted-proof", "trusted state-pair lane payloads are incomplete");
  }
  return expected;
}

function bindAuthorityProofIssuer(originValidator) {
  if (issuerBound || typeof originValidator !== "function") {
    fail("invalid-trusted-proof", "authority proof issuer is already bound or invalid");
  }
  issuerBound = true;
  // The returned capability is retained only in authority-delta-publisher's
  // module scope. Neither it nor the proof brand is exported by that module.
  return function issueAuthorityStatePairProof({ header, lanes, canonicalFacts, tieOrder }) {
    if (!header || typeof header !== "object" || Array.isArray(header)
        || !Array.isArray(canonicalFacts) || !Array.isArray(tieOrder)) {
      fail("invalid-trusted-proof", "trusted state-pair proof input is invalid");
    }
    assertDeepFrozen(header);
    assertDeepFrozen(lanes);
    const expected = exactLaneSet(lanes);
    if (canonicalFacts.length !== expected.length || tieOrder.length !== 4
        || originValidator({ header, lanes, canonicalFacts, tieOrder }) !== true) {
      fail("invalid-trusted-proof", "trusted state-pair origin validation failed");
    }
    const facts = new Map();
    for (const [label, payload] of expected) {
      const fact = canonicalFacts.find((entry) => entry?.label === label);
      if (!fact || fact.payload !== payload || typeof fact.text !== "string"
          || !Number.isSafeInteger(fact.bytes) || fact.bytes < 1
          || fact.bytes !== Buffer.byteLength(fact.text, "utf8")) {
        fail("invalid-trusted-proof", `trusted ${label} canonical fact is invalid`);
      }
      facts.set(payload, Object.freeze({ label, payload, text: fact.text, bytes: fact.bytes }));
    }
    const proof = Object.freeze(Object.create(null));
    activeProofs.set(proof, Object.freeze({ header, lanes,
      tieOrder: Object.freeze([...tieOrder]), facts }));
    return proof;
  };
}

function codePointOrder(left, right) {
  const a = Array.from(left, (character) => character.codePointAt(0));
  const b = Array.from(right, (character) => character.codePointAt(0));
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return a.length - b.length;
}

function expandedSizes(header, lanes, facts, tieOrder) {
  const frameShape = { ...header, public: null, owner: null };
  const keys = Object.keys(frameShape).sort(codePointOrder);
  const sharedSegments = new Map();
  for (const key of keys) {
    if (key === "public" || key === "owner") continue;
    sharedSegments.set(key, `${JSON.stringify(key)}:${canonicalJson(header[key])}`);
  }
  const headerBytes = [...sharedSegments.values()]
    .reduce((sum, value) => sum + Buffer.byteLength(value, "utf8"), 0);
  const sizes = new Map();
  for (const kind of tieOrder) {
    const [publicKind, ownerKind] = kind.split("+").map((part) => part.split("-")[1]);
    const publicPayload = lanes.public[publicKind];
    const ownerPayload = lanes.owner[ownerKind];
    if (!publicPayload || !ownerPayload || !facts.has(publicPayload) || !facts.has(ownerPayload)) {
      fail("invalid-trusted-proof", "trusted state-pair tie order is unsupported");
    }
    let bytes = 2 + Math.max(0, keys.length - 1) + headerBytes;
    bytes += Buffer.byteLength(JSON.stringify("public"), "utf8") + 1 + facts.get(publicPayload).bytes;
    bytes += Buffer.byteLength(JSON.stringify("owner"), "utf8") + 1 + facts.get(ownerPayload).bytes;
    sizes.set(kind, bytes);
  }
  const reusedLaneBytes = [...facts.values()].reduce((sum, fact) => sum + fact.bytes, 0);
  return Object.freeze({ sizes, diagnostics: Object.freeze({
    componentSerializations: sharedSegments.size,
    headerSerializations: sharedSegments.size,
    laneSerializations: 0,
    laneSerializationReuses: facts.size,
    reusedLaneBytes,
    serializedLaneBytes: 0,
    bytesExamined: headerBytes + reusedLaneBytes,
    allocationProxyBytes: headerBytes,
    outerCandidateDescriptors: tieOrder.length,
    outerCandidateFrames: 0,
    lanePayloadsBuilt: facts.size,
    lanePayloadReferenceReuses: tieOrder.length * 2 - facts.size,
  }) });
}

function selectAuthorityStatePairWithProof(proof, { header, lanes, context, tieOrder, maxPairBytes }) {
  const record = activeProofs.get(proof);
  // Consume before doing any fallible downstream work. A failed operation can
  // never replay a proof on another tick or recipient.
  if (record) activeProofs.delete(proof);
  if (!record || record.header !== header || record.lanes !== lanes
      || !Array.isArray(tieOrder) || tieOrder.length !== record.tieOrder.length
      || tieOrder.some((kind, index) => kind !== record.tieOrder[index])) {
    fail("invalid-trusted-proof", "trusted state-pair proof is forged, stale, or cross-operation");
  }
  if (!Number.isSafeInteger(maxPairBytes) || maxPairBytes < 1) {
    fail("invalid-trusted-proof", "trusted state-pair expanded limit is invalid");
  }
  const expanded = expandedSizes(header, lanes, record.facts, record.tieOrder);
  for (const bytes of expanded.sizes.values()) {
    if (bytes > maxPairBytes) {
      fail("pair-too-large", `atomic state pair exceeds ${maxPairBytes} bytes in expanded form`);
    }
  }
  const selected = composeStatePairLaneCandidates(header, lanes, context, record.tieOrder);
  return Object.freeze({ ...selected, expandedSizes: expanded.sizes,
    expandedDiagnostics: expanded.diagnostics,
    trustDiagnostics: Object.freeze({ proofsCreated: 1, proofsConsumed: 1, proofRejects: 0,
      validationsPerformed: 1, validationsReused: record.tieOrder.length,
      canonicalSizeOperations: expanded.sizes.size, positionalSizeOperations: selected.candidates.length }) });
}

module.exports = {
  AuthorityStatePairProofError,
  bindAuthorityProofIssuer,
  selectAuthorityStatePairWithProof,
};
