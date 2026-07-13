const crypto = require("crypto");
const path = require("path");
const { pathToFileURL } = require("url");
const { TestRunner, assert } = require("./helpers.cjs");
const {
  MAX_MANIFEST_BYTES,
  SessionManifestError,
  canonicalJsonBytes,
  createSessionReplicationManifest,
  createManifestFetchRegistry,
} = require("../scripts/session-replication-manifest.cjs");

function expectError(fn, code) {
  try { fn(); } catch (error) {
    assert(error instanceof SessionManifestError, `Expected SessionManifestError, got ${error?.name}`);
    assert(error.code === code, `Expected ${code}, got ${error.code}`);
    return;
  }
  throw new Error(`Expected ${code}`);
}

async function run() {
  const runner = new TestRunner("SessionReplicationManifest");

  await runner.run("canonical JSON fixes code-point key order, numbers, -0, arrays, and UTF-8", async () => {
    const a = { z: -0, "\u{10000}": 1e21, "\uE000": 1e-7, nested: { b: 2, a: 1 }, array: [3, 2, 1], escaped: "é\n" };
    const b = { escaped: "é\n", array: [3, 2, 1], nested: { a: 1, b: 2 }, "\uE000": 1e-7, "\u{10000}": 1e21, z: 0 };
    const first = canonicalJsonBytes(a);
    const second = canonicalJsonBytes(b);
    assert(first.equals(second), "Insertion order and negative zero must not change canonical bytes");
    assert(first.toString("utf8") === "{\"array\":[3,2,1],\"escaped\":\"é\\n\",\"nested\":{\"a\":1,\"b\":2},\"z\":0,\"\":1e-7,\"𐀀\":1e+21}", `Unexpected canonical golden: ${first}`);
    assert(first.length === Buffer.byteLength(first.toString("utf8"), "utf8"), "Byte count must be exact UTF-8");
    expectError(() => canonicalJsonBytes({ value: NaN }), "non-finite-number");
    expectError(() => canonicalJsonBytes({ value: Infinity }), "non-finite-number");
    expectError(() => canonicalJsonBytes({ value: "e\u0301" }), "non-nfc-string");
    expectError(() => canonicalJsonBytes({ value: Array(2) }), "sparse-array");
    expectError(() => canonicalJsonBytes({ "e\u0301": true }), "non-nfc-key");
  });

  await runner.run("manifest hash addresses exact immutable served bytes and cache copies are byte-equal", async () => {
    const descriptor = createSessionReplicationManifest({
      runId: "run-a",
      map: { id: "map-a", name: "Map", worldScale: 3, fluidResolution: 256, wells: [{ id: "well-1", wx: 1, wy: 2 }], stars: [], wrecks: [], planetoids: [] },
      publicContent: { hullSchema: "v1" },
    });
    const exact = `sha256:${crypto.createHash("sha256").update(descriptor.bytes).digest("hex")}`;
    assert(descriptor.manifestHash === exact, "Hash must cover exact bytes");
    assert(descriptor.manifestBytes === descriptor.bytes.length && descriptor.manifestBytes < MAX_MANIFEST_BYTES, "Advertised length must be exact and capped");
    assert(Object.isFrozen(descriptor.manifest) && Object.isFrozen(descriptor.manifest.map.wells), "Cached manifest must be deeply immutable");
    const attemptedMutation = descriptor.bytes;
    attemptedMutation[0] ^= 0xff;
    assert(!attemptedMutation.equals(descriptor.bytes), "Callers must receive copies, not mutable canonical storage");
    const cache = new Map([[`${descriptor.manifestSchema}:${descriptor.manifestHash}`, Buffer.from(descriptor.bytes)]]);
    assert(cache.values().next().value.equals(descriptor.bytes), "Cached accepted bytes must equal served bytes");
    expectError(() => createSessionReplicationManifest({
      runId: "run-large",
      map: { id: "large", name: "Large", worldScale: 1, fluidResolution: 1 },
      publicContent: { blob: "x".repeat(MAX_MANIFEST_BYTES) },
    }), "manifest-too-large");
  });

  await runner.run("fetch capabilities are 256-bit, header-safe, one-use, bound, expiring, and resettable", async () => {
    let clock = 1000;
    let seed = 1;
    const registry = createManifestFetchRegistry({ now: () => clock, randomBytes: (size) => Buffer.alloc(size, seed++) });
    const expected = { runId: "run-a", membershipId: "member-a", manifestHash: "sha256:abc" };
    const issued = registry.issue(expected);
    assert(/^[A-Za-z0-9_-]{43}$/.test(issued.capability), "Capability must be a 32-byte base64url token");
    registry.redeem(issued.capability, expected);
    registry.consumeProof({ ...expected, connectionEpoch: null });
    assert(registry.consumeProof({ ...expected, connectionEpoch: 2 }), "Previously verified membership may prove the same immutable cached hash on a new epoch");
    expectError(() => registry.consumeProof({ ...expected, membershipId: "never-fetched", connectionEpoch: 1 }), "manifest-not-fetched");
    expectError(() => registry.redeem(issued.capability, expected), "invalid-capability");
    const mismatch = registry.issue(expected);
    expectError(() => registry.redeem(mismatch.capability, { ...expected, membershipId: "other" }), "capability-mismatch");
    clock += 10_000;
    const expired = registry.issue(expected);
    clock = expired.expiresAt;
    expectError(() => registry.redeem(expired.capability, expected), "invalid-capability");
    registry.issue(expected);
    assert(registry.reset() >= 1 && registry.diagnostics().retained === 0, "Reset must clear capabilities");
    assert(!JSON.stringify(registry.diagnostics()).includes("member-a"), "Diagnostics must not expose binding or capability");
  });

  await runner.run("proofs, retries, and accepted cache bindings are TTL- and capacity-bounded", async () => {
    let clock = 0;
    let seed = 10;
    const registry = createManifestFetchRegistry({
      now: () => clock, capacity: 2, ttlMs: 10, cacheTtlMs: 20,
      randomBytes: (size) => Buffer.alloc(size, seed++),
    });
    const expected = { runId: "run", membershipId: "member", manifestSchema: "schema", manifestHash: "sha256:a", connectionEpoch: 1 };
    const initial = registry.issue(expected);
    registry.redeem(initial.capability, expected);
    assert(registry.diagnostics().verified === 1, "Fetch must retain one bounded short-lived proof");
    registry.consumeProof(expected);
    assert(registry.diagnostics().cachedBindings === 1, "ACK must promote proof to a bounded cache binding");
    registry.issue(expected, { retry: true });
    expectError(() => registry.issue(expected, { retry: true }), "retry-exhausted");
    clock = 21;
    const diagnostics = registry.diagnostics();
    assert(diagnostics.verified === 0 && diagnostics.cachedBindings === 0 && diagnostics.retries === 0 && diagnostics.retained === 0,
      `All retained classes must prune deterministically: ${JSON.stringify(diagnostics)}`);
  });

  await runner.run("one total client deadline aborts a hanging retry and cannot emit a late ACK", async () => {
    const { _verifySessionManifest } = await import(pathToFileURL(path.resolve(__dirname, "../src/sim/sim-stream-transport.js")));
    const originalFetch = global.fetch;
    let retryAborted = false;
    let sends = 0;
    global.fetch = async () => ({ ok: false, status: 503 });
    const fake = {
      _socketGeneration: 1,
      _manifestAdmissionTimeoutMs: 30,
      _manifestCache: new Map(),
      baseUrl: "http://127.0.0.1:1",
      connectionEpoch: 1,
      _sendFrame() { sends += 1; },
      _json(_path, options) {
        return new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => {
          retryAborted = true;
          reject(new Error("aborted"));
        }, { once: true }));
      },
    };
    const welcome = {
      wireVersion: "lbh-multiplayer-json-v2", runId: "run", connectionEpoch: 1,
      manifestSchema: "schema", manifestHash: "sha256:deadbeef", manifestBytes: 1,
      fetchPath: "/multiplayer/manifest/deadbeef",
    };
    let rejected = false;
    try {
      await _verifySessionManifest.call(fake, welcome, { manifestCapability: "cap" }, 1);
    } catch { rejected = true; }
    global.fetch = originalFetch;
    assert(rejected && retryAborted && sends === 0, "Deadline must abort the retry promise and forbid a late manifest ACK");
  });

  process.exit(runner.summary() ? 0 : 1);
}

run().catch((error) => { console.error(error.stack || error.message); process.exit(1); });
