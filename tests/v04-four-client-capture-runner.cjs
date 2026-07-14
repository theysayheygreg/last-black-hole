#!/usr/bin/env node
"use strict";

const crypto = require("crypto");
const {
  runFourClientCapture,
  validateConfig,
  createAppendOnlyFileSink,
  S20,
  SCHEDULE,
} = require("../scripts/v04-four-client-capture-runner.cjs");
const fs = require("fs");
const os = require("os");
const path = require("path");
const Ajv2020 = require("ajv/dist/2020");
const { analyze, measured } = require("../scripts/v04-regional-four-player-benchmark.cjs");
const { TestRunner, assert } = require("./helpers.cjs");

function rejectCall(callback, pattern) {
  let error = null;
  try { callback(); } catch (caught) { error = caught; }
  assert(error && pattern.test(error.message), `expected ${pattern}, got ${error?.message || "no rejection"}`);
}

function config() {
  const clients = Array.from({ length: 4 }, (_, index) => ({
    alias: `client-${index + 1}`,
    origin: `https://capture-${index + 1}.invalid`,
    processId: `private-process-${index + 1}`,
    incarnationId: `private-incarnation-${index + 1}`,
  }));
  return {
    protocolVersion: S20, retries: 0, runId: "fixture-run-001", scenarioId: "fixed-four-client-short-v1",
    gitCommit: "a".repeat(40), artifactSha256: `sha256:${"b".repeat(64)}`,
    provider: "fixture-only", region: "fixture-region", runtime: process.version,
    hostClass: "fixture-host", seed: "0x50B04A5E", clients,
    fifthProbe: { alias: "client-5-probe", origin: "https://capture-5.invalid",
      processId: "private-process-5", incarnationId: "private-incarnation-5" },
    invoice: { currency: "USD", computeRate: measured("USD/hour", 0.05),
      egressRate: measured("USD/GB", 0.02), billingSource: "fixture-rate-card", invoiceObserved: false },
    budgets: {
      tickDebtMsMax: measured("ms", 100), rssBytesMax: measured("bytes", 512 * 1024 * 1024),
      heapUsedBytesMax: measured("bytes", 256 * 1024 * 1024),
      authorityRetainedBytesMax: measured("bytes", 16 * 1024 * 1024),
      clientRetainedBytesMax: measured("bytes", 4 * 1024 * 1024),
      backpressureEventsMax: measured("count", 0),
    },
  };
}

function runtimeSamples(connectionIds) {
  const clients = connectionIds.map((connectionId, index) => ({
    connectionId, source: "fixture-application-ledger", completedStateHz: 9.8,
    bytesPerSecondMean: 31_000, bytesPerSecondP95: 33_000,
    applicationQueueHighWaterBytes: 4_096, reliableQueueHighWaterBytes: 1_024,
    transportQueueHighWaterBytes: 8_192, backpressureEvents: 0, retainedBytes: 65_536 + index,
  }));
  return {
    semantics: { cpu: "capture-start-end-delta", memory: "capture-window-maxima",
      queues: "capture-window-maxima", latency: "capture-window-histograms" },
    provenance: { productionSafe: true, bounded: true },
    overloadMode: "NORMAL",
    latencyMs: { authority: { p50: 12, p95: 20, p99: 25 }, sim: { p50: 5, p95: 9, p99: 12 },
      writer: { p50: 3, p95: 6, p99: 8 }, projection: { p50: 25, p95: 45, p99: 60 } },
    process: { userCpuMs: 8_000, systemCpuMs: 1_000, rssBytes: 150_000_000,
      heapUsedBytes: 80_000_000, gcPauseMs: 2, eventLoopDelayMs: 8, tickDebtMs: 0, retainedBytes: 400_000 },
    clients,
    networkReconciliation: { applicationSource: "fixture-application-ledger",
      socketSource: "fixture-client-local-socket-counters", wireSource: "fixture-client-to-public-edge-capture",
      unexplainedByteRatio: 0.01, lossRate: 0 },
    outcomes: { correctness: { stateConverged: true, consequencesTruthful: true, exactlyOnceResult: true },
      privacy: { ownerFieldsIsolated: true, structuredLogScanClean: true } },
  };
}

function adapters({ mutateRuntime = () => {}, mutateWire = () => {}, authorityReady = true } = {}) {
  const pair = crypto.generateKeyPairSync("ed25519");
  const events = [];
  const retained = [];
  const failures = [];
  let elapsedMs = 0;
  const instant = () => new Date(Date.parse("2026-07-14T00:00:00.000Z") + elapsedMs).toISOString();
  const connectionIds = ["connection-a", "connection-b", "connection-c", "connection-d"];
  const runtime = runtimeSamples(connectionIds);
  mutateRuntime(runtime);
  const clients = config().clients;
  const socketSamples = connectionIds.map((connectionId, index) => ({
    connectionId, source: "fixture-client-local-socket-counters", captureLeg: "client-local-socket",
    observerProcessId: clients[index].processId, observerIncarnationId: clients[index].incarnationId,
    bytesPerSecondMean: 33_000, bytesPerSecondP95: 36_000,
  }));
  const wireSamples = connectionIds.map((connectionId, index) => ({
    connectionId, source: "fixture-client-to-public-edge-capture", captureLeg: "client-to-public-edge",
    observerProcessId: clients[index].processId, observerIncarnationId: clients[index].incarnationId,
    bytesPerSecondMean: 35_000, bytesPerSecondP95: 39_000,
    packetsPerSecondMean: 20, packetsPerSecondP95: 24,
    retransmittedBytes: 0, retransmittedPackets: 0, lossRate: 0,
  }));
  mutateWire(wireSamples);
  const collector = (name, result, capabilities) => ({
    capabilities,
    async start() { events.push(`${name}:start`); },
    async stop() { events.push(`${name}:stop`); return result; },
    async abort() { events.push(`${name}:abort`); },
  });
  const processCollector = collector("process", runtime, {
    productionSafe: true, bounded: true, processCpuDeltas: true, captureMaxima: true,
    gcPauseHistogram: true, eventLoopDelayHistogram: true,
    latencyHistograms: ["authority", "sim", "writer", "projection"],
  });
  const socketCollector = collector("socket", socketSamples, {
    productionSafe: true, bounded: true, perClientConnection: true, captureLeg: "client-local-socket",
  });
  const wireCollector = collector("wire", wireSamples, {
    productionSafe: true, bounded: true, perClientConnection: true,
    captureLeg: "client-to-public-edge", retransmitAndLoss: true,
  });
  const value = {
    pair, events, retained, failures,
    clock: {
      now: () => new Date(Date.parse("2026-07-14T00:00:00.000Z") + elapsedMs),
      monotonicMs: () => elapsedMs,
    },
    scheduler: { async sleep(ms, phase) { events.push(`sleep:${phase}:${ms}`); elapsedMs += ms; } },
    transport: {
      async startAuthority() { events.push("authority:start"); const processStartedAt = instant(); elapsedMs += 500;
        return { authorityCount: 1, ready: authorityReady, health: authorityReady ? "healthy" : "starting", protocolVersion: S20,
          observer: "control-plane", authorityIncarnationAlias: "authority-incarnation-1", leaseEpoch: 7,
          processStartedAt, readyAt: instant() }; },
      async connect(client) { const index = Number(client.alias.slice(-1)) - 1; events.push(`connect:${client.alias}`);
        return { admitted: true, protocolVersion: S20, connectionId: connectionIds[index], isolationVerified: true,
          origin: client.origin, processId: client.processId, incarnationId: client.incarnationId,
          isolationObserver: "independent-client-launcher" }; },
      async runPacedCapture(input) { events.push(`paced:${input.durationMs}:${input.cadenceHz}:${input.expectedSteps}`);
        return { fixedScheduleVerified: true, durationMs: input.durationMs, steps: input.expectedSteps }; },
      async reconnect() { events.push("reconnect:client-1"); return { protocolVersion: S20, completedState: true, reconnectMs: 850 }; },
      async probeFifth() { events.push("probe:client-5-probe"); return { rejected: true, admittedSeats: 4, layer: "authority" }; },
      async drain() { events.push("drain"); elapsedMs += 300; return { replacementMs: 1_200,
        previousLeaseFenced: true, writerOverlapMs: 0, previousAuthorityProcessAlias: "authority-1",
        observer: "control-plane", authorityIncarnationAlias: "authority-incarnation-1", leaseEpoch: 7, observedAt: instant() }; },
      async cleanup() { events.push("cleanup"); elapsedMs += 100; return { socketsClosed: true, authorityExited: true,
        queuesReleased: true, authorityProcessAlias: "authority-1", activeWriterCount: 0, leaseFenced: true,
        observer: "runtime-supervisor", exactProcessExitObserved: true,
        authorityIncarnationAlias: "authority-incarnation-1", leaseEpoch: 7, processExitedAt: instant() }; },
    },
    processCollector, socketCollector, wireCollector,
    signer: { publicKey: pair.publicKey, sign: (bytes) => crypto.sign(null, bytes, pair.privateKey) },
    sink: { appendOnly: true, durableBeforeTeardown: true,
      async retain(artifact, state) { events.push("retain:sealed"); retained.push({ artifact, state }); },
      async retainFailure(artifact, state) { events.push("retain:failure"); failures.push({ artifact, state }); } },
  };
  return value;
}

async function run() {
  const runner = new TestRunner("V04FourClientCaptureRunner");

  await runner.run("runs the fixed four-client S20 schedule and emits analyzer-compatible schema-v1", async () => {
    const fixture = adapters();
    const artifact = await runFourClientCapture(config(), fixture);
    const analysis = analyze(artifact, { trustedPublicKeyPem: fixture.pair.publicKey });
    assert(artifact.schema === "lbh-v04-regional-four-player-raw-v1" && analysis.verdict === "PASS");
    const schema = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "docs", "v0.4", "evidence",
      "regional-four-player-benchmark", "raw.schema.json"), "utf8"));
    const validate = new Ajv2020({ strict: false }).compile(schema);
    assert(validate(artifact), `raw JSON schema mismatch: ${JSON.stringify(validate.errors)}`);
    assert(fixture.retained.length === 1 && fixture.failures.length === 0);
    assert(fixture.events.join("|") === ["authority:start", "connect:client-1", "connect:client-2", "connect:client-3", "connect:client-4",
      `sleep:warmup:${SCHEDULE.warmupMs}`, "process:start", "socket:start", "wire:start",
      `sleep:capture:${SCHEDULE.captureMs}`, `paced:${SCHEDULE.captureMs}:${SCHEDULE.captureCadenceHz}:200`,
      "process:stop", "socket:stop", "wire:stop", "reconnect:client-1", "probe:client-5-probe", "drain", "cleanup", "retain:sealed"].join("|"),
    `unexpected schedule: ${fixture.events.join("|")}`);
  });

  await runner.run("keeps HTTPS origins and process/incarnation identities out of signed raw evidence", async () => {
    const privateConfig = config();
    privateConfig.clients[0].origin = "https://private-origin-secret.invalid";
    privateConfig.clients[0].processId = "private-process-secret";
    privateConfig.clients[0].incarnationId = "private-incarnation-secret";
    const fixture = adapters();
    fixture.transport.connect = async (client) => {
      const index = Number(client.alias.slice(-1)) - 1;
      return { admitted: true, protocolVersion: S20, connectionId: `connection-${"abcd"[index]}`,
        isolationVerified: true, origin: client.origin, processId: client.processId, incarnationId: client.incarnationId,
        isolationObserver: "independent-client-launcher" };
    };
    fixture.socketCollector.stop = async () => fixture.processCollector.capabilities && [0, 1, 2, 3].map((index) => ({
      connectionId: `connection-${"abcd"[index]}`, source: "fixture-client-local-socket-counters", captureLeg: "client-local-socket",
      observerProcessId: privateConfig.clients[index].processId, observerIncarnationId: privateConfig.clients[index].incarnationId,
      bytesPerSecondMean: 33_000, bytesPerSecondP95: 36_000 }));
    fixture.wireCollector.stop = async () => [0, 1, 2, 3].map((index) => ({
      connectionId: `connection-${"abcd"[index]}`, source: "fixture-client-to-public-edge-capture", captureLeg: "client-to-public-edge",
      observerProcessId: privateConfig.clients[index].processId, observerIncarnationId: privateConfig.clients[index].incarnationId,
      bytesPerSecondMean: 35_000, bytesPerSecondP95: 39_000, packetsPerSecondMean: 20, packetsPerSecondP95: 24,
      retransmittedBytes: 0, retransmittedPackets: 0, lossRate: 0 }));
    const artifact = await runFourClientCapture(privateConfig, fixture);
    const text = JSON.stringify(artifact);
    for (const secret of ["private-origin-secret", "private-process-secret", "private-incarnation-secret", "connection-a"]) {
      assert(!text.includes(secret), `signed evidence leaked ${secret}`);
    }
    assert(artifact.clients.map((client) => client.clientAlias).join(",") === "client-1,client-2,client-3,client-4");
  });

  await runner.run("rejects non-HTTPS, duplicate origins, non-isolated identities, non-S20, and any eight-client setup", async () => {
    const badOrigin = config(); badOrigin.clients[0].origin = "http://capture-1.invalid";
    rejectCall(() => validateConfig(badOrigin), /bare HTTPS origin/);
    const duplicate = config(); duplicate.clients[1].origin = duplicate.clients[0].origin;
    rejectCall(() => validateConfig(duplicate), /unique HTTPS origin/);
    const duplicateProcess = config(); duplicateProcess.clients[1].processId = duplicateProcess.clients[0].processId;
    rejectCall(() => validateConfig(duplicateProcess), /unique processId/);
    const s23 = config(); s23.protocolVersion = "s23-v1";
    rejectCall(() => validateConfig(s23), /must be s20-v1\+brotli-q1/);
    const privateInvoice = config(); privateInvoice.invoice.admissionTicket = "do-not-sign";
    rejectCall(() => validateConfig(privateInvoice), /only the five public schema fields/);
    const eight = config(); eight.clients = Array.from({ length: 8 }, (_, index) => ({ alias: `client-${index + 1}`,
      origin: `https://capture-${index + 1}.invalid`, processId: `p-${index}`, incarnationId: `i-${index}` }));
    rejectCall(() => validateConfig(eight), /exactly four clients/);
  });

  await runner.run("preserves measured zero versus unavailable client-edge evidence", async () => {
    const zeroFixture = adapters();
    const zeroArtifact = await runFourClientCapture(config(), zeroFixture);
    assert(zeroArtifact.clients[0].network.retransmittedBytes.status === "measured"
      && zeroArtifact.clients[0].network.retransmittedBytes.value === 0);
    const unavailableFixture = adapters({ mutateWire: (samples) => {
      samples[1] = { connectionId: samples[1].connectionId, source: "fixture-client-to-public-edge-capture",
        status: "unavailable", reason: "client interface collector permission denied" };
    } });
    const unavailableArtifact = await runFourClientCapture(config(), unavailableFixture);
    const missing = unavailableArtifact.clients[1].network.onWireBytesPerSecondMean;
    assert(missing.status === "unavailable" && !Object.hasOwn(missing, "value"));
    rejectCall(() => analyze(unavailableArtifact, { trustedPublicKeyPem: unavailableFixture.pair.publicKey }), /cannot be unavailable/);
    assert(unavailableFixture.retained.length === 1, "signed unavailable evidence must be retained");
  });

  await runner.run("retains a signed schema-compatible gate failure instead of retrying or discarding it", async () => {
    const fixture = adapters({ mutateRuntime: (runtime) => { runtime.clients[2].completedStateHz = 8; } });
    const artifact = await runFourClientCapture(config(), fixture);
    const analysis = analyze(artifact, { trustedPublicKeyPem: fixture.pair.publicKey });
    assert(analysis.verdict === "FAIL" && artifact.metadata.retries === 0);
    assert(fixture.retained.length === 1 && fixture.retained[0].artifact.integrity.signatureBase64);
  });

  await runner.run("signs and durably retains operational failure before teardown", async () => {
    const fixture = adapters({ authorityReady: false });
    let error = null;
    try { await runFourClientCapture(config(), fixture); } catch (caught) { error = caught; }
    assert(error && /healthy S20 readiness/.test(error.message));
    assert(fixture.failures.length === 1 && fixture.failures[0].artifact.integrity.signatureBase64,
      "operational failure must be signed and retained");
    assert(fixture.events.indexOf("retain:failure") < fixture.events.indexOf("cleanup"),
      "failure retention must precede teardown");
    assert(fixture.events.filter((event) => event === "authority:start").length === 1, "no retry is allowed");
  });

  await runner.run("fails closed on authority-side proxy capture or unbound client collector samples", async () => {
    const fixture = adapters({ mutateWire: (samples) => { samples[0].captureLeg = "authority-to-proxy"; } });
    let error = null;
    try { await runFourClientCapture(config(), fixture); } catch (caught) { error = caught; }
    assert(error && /not bound to its isolated client/.test(error.message));
    assert(fixture.failures.length === 1, "collector perspective failure must remain as durable negative evidence");
  });

  await runner.run("append-only file sink fsyncs a detached signature bundle and refuses overwrite", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lbh-v04-capture-sink-"));
    try {
      const fixture = adapters();
      fixture.sink = createAppendOnlyFileSink(directory, { publicKey: fixture.pair.publicKey });
      const artifact = await runFourClientCapture(config(), fixture);
      const bundle = path.join(directory, `${artifact.metadata.runId}.raw.sealed`);
      for (const file of ["raw.json", "signature.json", "signer-fingerprint.txt", "SEALED"]) {
        assert(fs.existsSync(path.join(bundle, file)), `sealed bundle missing ${file}`);
      }
      const detached = JSON.parse(fs.readFileSync(path.join(bundle, "signature.json"), "utf8"));
      assert(detached.signatureBase64 === artifact.integrity.signatureBase64
        && fs.readFileSync(path.join(bundle, "signer-fingerprint.txt"), "utf8").trim() === artifact.integrity.signerKeyId);
      let duplicate = null;
      try { await fixture.sink.retain(artifact); } catch (caught) { duplicate = caught; }
      assert(duplicate, "append-only sink must refuse a second artifact for the same run ID");
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  });

  runner.summary();
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
