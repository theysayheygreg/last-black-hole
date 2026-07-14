const crypto = require("crypto");

class HostedPlacementTokenError extends Error {
  constructor(code = "TOKEN_REJECTED") {
    super("hosted placement token rejected");
    this.name = "HostedPlacementTokenError";
    this.code = code;
  }
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

const MAX_PREVIOUS_TOKEN_KEYS = 4;

function tokenKey(value) {
  if (!Buffer.isBuffer(value) || value.length !== 32) throw new HostedPlacementTokenError("INVALID_TOKEN_KEY");
  return Buffer.from(value);
}

function tokenKeyId(value) {
  if (typeof value !== "string" || value.length < 1 || value.length > 128 || value.trim() !== value) {
    throw new HostedPlacementTokenError("INVALID_TOKEN_KEY");
  }
  return value;
}

function keyring(key, currentKeyId, previousKeys = []) {
  if (Buffer.isBuffer(key) && currentKeyId == null && previousKeys.length === 0) {
    const selected = tokenKey(key);
    const derivedId = crypto.createHash("sha256").update(selected).digest("base64url").slice(0, 22);
    return { currentKeyId: derivedId, currentKey: selected, keys: new Map([[derivedId, selected]]) };
  }
  const current = key && typeof key === "object" && !Array.isArray(key) && !Buffer.isBuffer(key)
    ? { keyId: key.currentKeyId, key: key.currentKey, previousKeys: key.previousKeys ?? [] }
    : { keyId: currentKeyId, key, previousKeys };
  const keyId = tokenKeyId(current.keyId);
  const currentTokenKey = tokenKey(current.key);
  if (!Array.isArray(current.previousKeys) || current.previousKeys.length > MAX_PREVIOUS_TOKEN_KEYS) {
    throw new HostedPlacementTokenError("INVALID_TOKEN_KEY");
  }
  const keys = new Map([[keyId, currentTokenKey]]);
  for (const entry of current.previousKeys) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)
        || !Object.hasOwn(entry, "keyId") || !Object.hasOwn(entry, "key")
        || Object.keys(entry).some((name) => name !== "keyId" && name !== "key")) {
      throw new HostedPlacementTokenError("INVALID_TOKEN_KEY");
    }
    const previousId = tokenKeyId(entry.keyId);
    if (keys.has(previousId)) throw new HostedPlacementTokenError("INVALID_TOKEN_KEY");
    keys.set(previousId, tokenKey(entry.key));
  }
  return { currentKeyId: keyId, currentKey: currentTokenKey, keys };
}

function decodeCanonical(value) {
  if (typeof value !== "string" || value.length === 0 || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("shape");
  const decoded = Buffer.from(value, "base64url");
  if (decoded.toString("base64url") !== value) throw new Error("shape");
  return decoded;
}

function createOpaqueTokenCodec({ key, currentKeyId, previousKeys = [], randomBytes = crypto.randomBytes } = {}) {
  const configured = keyring(key, currentKeyId, previousKeys);
  if (typeof randomBytes !== "function") throw new HostedPlacementTokenError("INVALID_RANDOM_SOURCE");

  function seal(claims, audience) {
    const nonce = randomBytes(12);
    if (!Buffer.isBuffer(nonce) || nonce.length !== 12) throw new HostedPlacementTokenError("INVALID_RANDOM_SOURCE");
    const encodedKeyId = Buffer.from(configured.currentKeyId, "utf8").toString("base64url");
    const cipher = crypto.createCipheriv("aes-256-gcm", configured.currentKey, nonce);
    cipher.setAAD(Buffer.from(`lbh-placement-v2\u0000${configured.currentKeyId}\u0000${audience}`, "utf8"));
    const ciphertext = Buffer.concat([cipher.update(stableJson(claims), "utf8"), cipher.final()]);
    return `v2.${encodedKeyId}.${nonce.toString("base64url")}.${ciphertext.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}`;
  }

  function open(token, audience) {
    try {
      if (typeof token !== "string" || token.length > 16_384) throw new Error("shape");
      const [version, encodedKeyId, encodedNonce, encodedCiphertext, encodedTag, extra] = token.split(".");
      if (version !== "v2" || extra !== undefined) throw new Error("shape");
      const keyId = decodeCanonical(encodedKeyId).toString("utf8");
      if (Buffer.from(keyId, "utf8").toString("base64url") !== encodedKeyId) throw new Error("shape");
      const selectedKey = configured.keys.get(keyId);
      if (!selectedKey) throw new Error("key");
      const nonce = decodeCanonical(encodedNonce);
      const ciphertext = decodeCanonical(encodedCiphertext);
      const tag = decodeCanonical(encodedTag);
      if (nonce.length !== 12 || tag.length !== 16 || ciphertext.length === 0) throw new Error("shape");
      const decipher = crypto.createDecipheriv("aes-256-gcm", selectedKey, nonce);
      decipher.setAAD(Buffer.from(`lbh-placement-v2\u0000${keyId}\u0000${audience}`, "utf8"));
      decipher.setAuthTag(tag);
      const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      const claims = JSON.parse(plaintext.toString("utf8"));
      if (!claims || typeof claims !== "object" || Array.isArray(claims)) throw new Error("claims");
      return claims;
    } catch {
      throw new HostedPlacementTokenError("TOKEN_REJECTED");
    }
  }

  return Object.freeze({ seal, open });
}

module.exports = { HostedPlacementTokenError, createOpaqueTokenCodec, stableJson };
