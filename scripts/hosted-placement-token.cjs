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

function createOpaqueTokenCodec({ key, randomBytes = crypto.randomBytes } = {}) {
  if (!Buffer.isBuffer(key) || key.length !== 32) throw new HostedPlacementTokenError("INVALID_TOKEN_KEY");
  if (typeof randomBytes !== "function") throw new HostedPlacementTokenError("INVALID_RANDOM_SOURCE");

  function seal(claims, audience) {
    const nonce = randomBytes(12);
    if (!Buffer.isBuffer(nonce) || nonce.length !== 12) throw new HostedPlacementTokenError("INVALID_RANDOM_SOURCE");
    const cipher = crypto.createCipheriv("aes-256-gcm", key, nonce);
    cipher.setAAD(Buffer.from(`lbh-placement-v1\u0000${audience}`, "utf8"));
    const ciphertext = Buffer.concat([cipher.update(stableJson(claims), "utf8"), cipher.final()]);
    return `v1.${nonce.toString("base64url")}.${ciphertext.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}`;
  }

  function open(token, audience) {
    try {
      if (typeof token !== "string" || token.length > 16_384) throw new Error("shape");
      const [version, encodedNonce, encodedCiphertext, encodedTag, extra] = token.split(".");
      if (version !== "v1" || extra !== undefined) throw new Error("shape");
      const nonce = Buffer.from(encodedNonce, "base64url");
      const ciphertext = Buffer.from(encodedCiphertext, "base64url");
      const tag = Buffer.from(encodedTag, "base64url");
      if (nonce.length !== 12 || tag.length !== 16 || ciphertext.length === 0) throw new Error("shape");
      const decipher = crypto.createDecipheriv("aes-256-gcm", key, nonce);
      decipher.setAAD(Buffer.from(`lbh-placement-v1\u0000${audience}`, "utf8"));
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
