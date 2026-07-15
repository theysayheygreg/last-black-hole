function normalizeByteLimit(maxBytes, label) {
  const limit = Math.floor(Number(maxBytes));
  if (!Number.isFinite(limit) || limit < 1) {
    throw new RangeError(`${label} byte budget must be a positive finite integer`);
  }
  return limit;
}

function serializedJsonBytes(value, { pretty = false, trailingNewline = false } = {}) {
  const json = JSON.stringify(value, null, pretty ? 2 : undefined);
  return Buffer.byteLength(trailingNewline ? `${json}\n` : json);
}

function assertSerializedJsonBudget(value, maxBytes, options = {}) {
  const label = String(options.label || "Serialized payload");
  const limit = normalizeByteLimit(maxBytes, label);
  const bytes = serializedJsonBytes(value, options);
  if (bytes > limit) {
    throw new RangeError(`${label} requires ${bytes} bytes, exceeding the ${limit}-byte budget`);
  }
  return bytes;
}

module.exports = {
  assertSerializedJsonBudget,
  serializedJsonBytes,
};
