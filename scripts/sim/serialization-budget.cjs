function normalizeByteLimit(maxBytes, label) {
  const limit = Math.floor(Number(maxBytes));
  if (!Number.isFinite(limit) || limit < 1) {
    throw new RangeError(`${label} byte budget must be a positive finite integer`);
  }
  return limit;
}

// Authority responses and snapshot admission must measure the same bytes. Keep
// the wire representation here so a formatting change cannot make the ring
// accept snapshots the HTTP endpoint later overflows.
function serializeRuntimeJson(value) {
  return JSON.stringify(value);
}

function serializedJsonBytes(value, { pretty = false, trailingNewline = false } = {}) {
  const json = JSON.stringify(value, null, pretty ? 2 : undefined);
  return Buffer.byteLength(trailingNewline ? `${json}\n` : json);
}

function serializedRuntimeJsonBytes(value) {
  return Buffer.byteLength(serializeRuntimeJson(value));
}

function assertByteBudget(bytes, maxBytes, options = {}) {
  const label = String(options.label || "Serialized payload");
  const limit = normalizeByteLimit(maxBytes, label);
  if (bytes > limit) {
    throw new RangeError(`${label} requires ${bytes} bytes, exceeding the ${limit}-byte budget`);
  }
  return bytes;
}

function assertSerializedJsonBudget(value, maxBytes, options = {}) {
  return assertByteBudget(serializedJsonBytes(value, options), maxBytes, options);
}

function assertRuntimeJsonBudget(value, maxBytes, options = {}) {
  return assertByteBudget(serializedRuntimeJsonBytes(value), maxBytes, options);
}

module.exports = {
  assertSerializedJsonBudget,
  assertRuntimeJsonBudget,
  serializedJsonBytes,
  serializedRuntimeJsonBytes,
  serializeRuntimeJson,
};
