"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { createOpaqueTokenCodec } = require("../scripts/hosted-placement-token.cjs");

const OLD = crypto.createHash("sha256").update("placement old key").digest();
const CURRENT = crypto.createHash("sha256").update("placement current key").digest();
const AUDIENCE = "authority:authority-1";
const CLAIMS = { type: "bootstrap", runId: "run-1", leaseEpoch: 7 };
const randomBytes = (size) => Buffer.alloc(size, 7);

let passed = 0;
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
function rejected(fn) { assert.throws(fn, (error) => error?.code === "TOKEN_REJECTED"); }
function invalid(fn) { assert.throws(fn, (error) => error?.code === "INVALID_TOKEN_KEY"); }

test("single-key configuration remains compatible and authenticated", () => {
  const codec = createOpaqueTokenCodec({ key: CURRENT, randomBytes });
  const token = codec.seal(CLAIMS, AUDIENCE);
  assert.match(token, /^v2\./);
  assert.deepEqual(codec.open(token, AUDIENCE), CLAIMS);
  rejected(() => codec.open(token, "authority:other"));
});

test("rotation issues under current ID and dual-reads the configured previous key", () => {
  const oldCodec = createOpaqueTokenCodec({ key: { currentKeyId: "placement-v1", currentKey: OLD }, randomBytes });
  const oldToken = oldCodec.seal(CLAIMS, AUDIENCE);
  const rotating = createOpaqueTokenCodec({ key: { currentKeyId: "placement-v2", currentKey: CURRENT,
    previousKeys: [{ keyId: "placement-v1", key: OLD }] }, randomBytes });
  assert.deepEqual(rotating.open(oldToken, AUDIENCE), CLAIMS);
  const currentToken = rotating.seal(CLAIMS, AUDIENCE);
  assert.equal(Buffer.from(currentToken.split(".")[1], "base64url").toString("utf8"), "placement-v2");
  assert.deepEqual(rotating.open(currentToken, AUDIENCE), CLAIMS);
});

test("explicit top-level keyring configuration supports rotation", () => {
  const oldCodec = createOpaqueTokenCodec({ key: OLD, currentKeyId: "placement-v1", randomBytes });
  const oldToken = oldCodec.seal(CLAIMS, AUDIENCE);
  const rotating = createOpaqueTokenCodec({ key: CURRENT, currentKeyId: "placement-v2",
    previousKeys: [{ keyId: "placement-v1", key: OLD }], randomBytes });
  assert.deepEqual(rotating.open(oldToken, AUDIENCE), CLAIMS);
});

test("retirement and unknown key IDs reject without fallback guessing", () => {
  const oldCodec = createOpaqueTokenCodec({ key: { currentKeyId: "placement-v1", currentKey: OLD }, randomBytes });
  const oldToken = oldCodec.seal(CLAIMS, AUDIENCE);
  const retired = createOpaqueTokenCodec({ key: { currentKeyId: "placement-v2", currentKey: CURRENT }, randomBytes });
  rejected(() => retired.open(oldToken, AUDIENCE));
  const parts = oldToken.split("."); parts[1] = Buffer.from("unknown-key", "utf8").toString("base64url");
  rejected(() => retired.open(parts.join("."), AUDIENCE));
});

test("tampered authenticated key ID cannot redirect a token to another configured key", () => {
  const oldCodec = createOpaqueTokenCodec({ key: { currentKeyId: "placement-v1", currentKey: OLD }, randomBytes });
  const token = oldCodec.seal(CLAIMS, AUDIENCE).split(".");
  const rotating = createOpaqueTokenCodec({ key: { currentKeyId: "placement-v2", currentKey: CURRENT,
    previousKeys: [{ keyId: "placement-v1", key: OLD }] }, randomBytes });
  token[1] = Buffer.from("placement-v2", "utf8").toString("base64url");
  rejected(() => rotating.open(token.join("."), AUDIENCE));
  const valid = rotating.seal(CLAIMS, AUDIENCE).split(".");
  valid[4] = valid[4].slice(0, -1) + (valid[4].endsWith("A") ? "B" : "A");
  rejected(() => rotating.open(valid.join("."), AUDIENCE));
});

test("duplicate IDs malformed entries and oversized previous keyrings are invalid", () => {
  invalid(() => createOpaqueTokenCodec({ key: { currentKeyId: "placement-v2", currentKey: CURRENT,
    previousKeys: [{ keyId: "placement-v2", key: OLD }] } }));
  invalid(() => createOpaqueTokenCodec({ key: { currentKeyId: "placement-v2", currentKey: CURRENT,
    previousKeys: Array.from({ length: 5 }, (_, index) => ({ keyId: `old-${index}`, key: OLD })) } }));
  invalid(() => createOpaqueTokenCodec({ key: { currentKeyId: "placement-v2", currentKey: CURRENT,
    previousKeys: [{ keyId: "old", key: OLD, surprise: true }] } }));
});

for (const entry of tests) {
  try { entry.fn(); passed += 1; process.stdout.write(`ok ${passed} - ${entry.name}\n`); }
  catch (error) { process.stderr.write(`not ok - ${entry.name}\n${error.stack}\n`); process.exitCode = 1; break; }
}
process.stdout.write(`${passed}/${tests.length} hosted placement token checks passed\n`);
