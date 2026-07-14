#!/usr/bin/env node
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const {
  SCHEMA,
  smokeFixture,
  measured,
  derived,
  unavailable,
  payloadForIntegrity,
  sha256,
  keyFingerprint,
} = require("./v04-regional-four-player-benchmark.cjs");

const S20 = "s20-v1+brotli-q1";
const CLIENT_ALIASES = Object.freeze(["client-1", "client-2", "client-3", "client-4"]);
const SCHEDULE = Object.freeze({
  warmupMs: 5_000,
  captureMs: 20_000,
  captureCadenceHz: 10,
  reconnectAlias: "client-1",
  phases: Object.freeze([
    "authority-start", "four-client-admission", "warmup", "capture",
    "reconnect", "fifth-rejection", "drain", "cleanup", "seal",
  ]),
});

class CaptureContractError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "CaptureContractError";
    this.code = code;
  }
}

function fail(code, message) { throw new CaptureContractError(code, message); }
function finite(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) fail("INVALID_SAMPLE", `${label} must be finite and non-negative`);
  return value;
}
function bool(value, label) {
  if (typeof value !== "boolean") fail("INVALID_SAMPLE", `${label} must be boolean`);
  return value;
}
function publicSource(value, label) {
  if (typeof value !== "string" || !value || value.length > 160 || /(?:https?:|@|\b(?:secret|token|ticket|credential|password)\b)/i.test(value)) {
    fail("PRIVATE_SOURCE_LABEL", `${label} must be a short public collector label`);
  }
  return value;
}
function iso(value, label) {
  const time = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(time.getTime())) fail("INVALID_CLOCK", `${label} must be a valid clock instant`);
  return time.toISOString();
}
function elapsed(start, end, label) {
  const value = end - start;
  if (!Number.isFinite(value) || value < 0) fail("INVALID_CLOCK", `${label} monotonic clock moved backwards`);
  return value;
}

function validateClients(clients, fifthProbe) {
  if (!Array.isArray(clients) || clients.length !== 4) fail("FOUR_CLIENTS_REQUIRED", "capture requires exactly four clients");
  const aliases = clients.map((client) => client?.alias);
  if (aliases.some((alias, index) => alias !== CLIENT_ALIASES[index])) {
    fail("PUBLIC_ALIAS_SET", "clients must be ordered client-1 through client-4");
  }
  const all = [...clients, fifthProbe];
  if (!fifthProbe || fifthProbe.alias !== "client-5-probe") fail("FIFTH_PROBE_REQUIRED", "one client-5-probe is required");
  const origins = new Set();
  const processes = new Set();
  const incarnations = new Set();
  for (const [index, client] of all.entries()) {
    let url;
    try { url = new URL(client.origin); } catch { fail("HTTPS_ORIGIN_REQUIRED", `client ${index + 1} origin is invalid`); }
    if (url.protocol !== "https:" || url.pathname !== "/" || url.search || url.hash || url.username || url.password) {
      fail("HTTPS_ORIGIN_REQUIRED", `client ${index + 1} must use a bare HTTPS origin`);
    }
    if (origins.has(url.origin)) fail("ORIGIN_NOT_ISOLATED", "every client and fifth probe must use a unique HTTPS origin");
    origins.add(url.origin);
    for (const [set, key, code] of [[processes, "processId", "PROCESS_NOT_ISOLATED"], [incarnations, "incarnationId", "INCARNATION_NOT_ISOLATED"]]) {
      if (typeof client[key] !== "string" || !client[key] || set.has(client[key])) fail(code, `every client and fifth probe needs a unique ${key}`);
      set.add(client[key]);
    }
  }
  return all.map((client) => ({ ...client, origin: new URL(client.origin).origin }));
}

function validateConfig(config) {
  if (!config || typeof config !== "object") fail("CONFIG_REQUIRED", "capture configuration is required");
  if (config.protocolVersion !== S20) fail("S20_ONLY", `capture protocol must be ${S20}`);
  if (config.retries !== 0) fail("RETRY_FORBIDDEN", "one-shot capture requires retries=0");
  if (!/^sha256:[a-f0-9]{64}$/.test(config.artifactSha256 || "")) fail("ARTIFACT_DIGEST_REQUIRED", "artifactSha256 is invalid");
  if (!/^[a-f0-9]{40}$/.test(config.gitCommit || "")) fail("GIT_COMMIT_REQUIRED", "gitCommit must be a clean 40-character commit");
  const clients = validateClients(config.clients, config.fifthProbe);
  for (const key of ["runId", "scenarioId", "provider", "region", "runtime", "hostClass", "seed"]) {
    if (typeof config[key] !== "string" || !config[key]) fail("METADATA_REQUIRED", `${key} is required`);
    if (/(?:\bBearer\s+|@|-----BEGIN|\b(?:secret|token|ticket|credential|password)\b)/i.test(config[key])) {
      fail("PRIVATE_METADATA", `${key} is not safe for public evidence`);
    }
  }
  if (!config.invoice || typeof config.invoice !== "object") fail("INVOICE_REQUIRED", "invoice metadata is required");
  const invoiceKeys = Object.keys(config.invoice).sort();
  if (invoiceKeys.join(",") !== ["billingSource", "computeRate", "currency", "egressRate", "invoiceObserved"].join(",")) {
    fail("PRIVATE_METADATA", "invoice must contain only the five public schema fields");
  }
  if (!/^[A-Z]{3}$/.test(config.invoice.currency || "") || typeof config.invoice.invoiceObserved !== "boolean") {
    fail("INVOICE_REQUIRED", "invoice currency and observed flag are invalid");
  }
  publicSource(config.invoice.billingSource, "invoice.billingSource");
  const publicMeasurement = (value, unit, label) => {
    if (!value || typeof value !== "object" || value.unit !== unit || !["measured", "unavailable"].includes(value.status)) {
      fail("MEASUREMENT_REQUIRED", `${label} must be measured or explicitly unavailable in ${unit}`);
    }
    const keys = Object.keys(value).sort().join(",");
    if (value.status === "measured") {
      if (keys !== "status,unit,value" || !Number.isFinite(value.value) || value.value < 0) fail("MEASUREMENT_REQUIRED", `${label} measured shape is invalid`);
    } else if (keys !== "reason,status,unit" || typeof value.reason !== "string" || !value.reason) {
      fail("MEASUREMENT_REQUIRED", `${label} unavailable shape is invalid`);
    }
  };
  publicMeasurement(config.invoice.computeRate, `${config.invoice.currency}/hour`, "invoice.computeRate");
  publicMeasurement(config.invoice.egressRate, `${config.invoice.currency}/GB`, "invoice.egressRate");
  const budgetUnits = { tickDebtMsMax: "ms", rssBytesMax: "bytes", heapUsedBytesMax: "bytes",
    authorityRetainedBytesMax: "bytes", clientRetainedBytesMax: "bytes", backpressureEventsMax: "count" };
  if (!config.budgets || Object.keys(config.budgets).sort().join(",") !== Object.keys(budgetUnits).sort().join(",")) {
    fail("BUDGETS_REQUIRED", "budgets must contain exactly the six precommitted limits");
  }
  for (const [key, unit] of Object.entries(budgetUnits)) {
    publicMeasurement(config.budgets[key], unit, `budgets.${key}`);
    if (config.budgets[key].status !== "measured") fail("BUDGETS_REQUIRED", `${key} must be precommitted and measured`);
  }
  if (config.redTeam != null) {
    if (Object.keys(config.redTeam).sort().join(",") !== "P1,P2,P3"
      || Object.values(config.redTeam).some((value) => !Number.isSafeInteger(value) || value < 0)) {
      fail("RED_TEAM_INVALID", "redTeam must contain exact non-negative P1/P2/P3 counts");
    }
  }
  return { ...config, clients: clients.slice(0, 4), fifthProbe: clients[4] };
}

function validateAdapters(adapters) {
  for (const name of ["clock", "scheduler", "transport", "processCollector", "socketCollector", "wireCollector", "signer", "sink"]) {
    if (!adapters?.[name]) fail("ADAPTER_REQUIRED", `${name} adapter is required`);
  }
  for (const name of ["now", "monotonicMs"]) if (typeof adapters.clock[name] !== "function") fail("CLOCK_REQUIRED", `clock.${name} is required`);
  if (typeof adapters.scheduler.sleep !== "function") fail("SCHEDULER_REQUIRED", "scheduler.sleep is required");
  for (const name of ["startAuthority", "connect", "runPacedCapture", "reconnect", "probeFifth", "drain", "cleanup"]) {
    if (typeof adapters.transport[name] !== "function") fail("TRANSPORT_REQUIRED", `transport.${name} is required`);
  }
  for (const collector of ["processCollector", "socketCollector", "wireCollector"]) {
    if (typeof adapters[collector].start !== "function" || typeof adapters[collector].stop !== "function") {
      fail("COLLECTOR_REQUIRED", `${collector} requires start and stop`);
    }
  }
  if (typeof adapters.signer.sign !== "function" || !adapters.signer.publicKey) fail("SIGNER_REQUIRED", "injected Ed25519 signer is required");
  let publicKey;
  try { publicKey = adapters.signer.publicKey?.type === "public" ? adapters.signer.publicKey : crypto.createPublicKey(adapters.signer.publicKey); }
  catch { fail("SIGNER_REQUIRED", "capture signer public key is invalid"); }
  if (publicKey.asymmetricKeyType !== "ed25519") fail("SIGNER_REQUIRED", "capture signer must be Ed25519");
  if (typeof adapters.sink.retain !== "function" || typeof adapters.sink.retainFailure !== "function"
      || adapters.sink.appendOnly !== true || adapters.sink.durableBeforeTeardown !== true) {
    fail("SINK_REQUIRED", "sink must provide append-only durable retain and retainFailure before teardown");
  }
  const processCaps = adapters.processCollector.capabilities || {};
  if (processCaps.productionSafe !== true || processCaps.bounded !== true || processCaps.processCpuDeltas !== true
      || processCaps.captureMaxima !== true || processCaps.gcPauseHistogram !== true
      || processCaps.eventLoopDelayHistogram !== true
      || !["authority", "sim", "writer", "projection"].every((name) => processCaps.latencyHistograms?.includes(name))) {
    fail("PROCESS_COLLECTOR_UNSAFE", "process collector lacks bounded production-safe delta/maxima/histogram capabilities");
  }
  const socketCaps = adapters.socketCollector.capabilities || {};
  if (socketCaps.productionSafe !== true || socketCaps.bounded !== true || socketCaps.perClientConnection !== true
      || socketCaps.captureLeg !== "client-local-socket") {
    fail("SOCKET_COLLECTOR_UNSAFE", "socket collector must be bounded and client-local per connection");
  }
  const wireCaps = adapters.wireCollector.capabilities || {};
  if (wireCaps.productionSafe !== true || wireCaps.bounded !== true || wireCaps.perClientConnection !== true
      || wireCaps.captureLeg !== "client-to-public-edge" || wireCaps.retransmitAndLoss !== true) {
    fail("WIRE_COLLECTOR_UNSAFE", "wire collector must observe each isolated client-to-public-edge leg with retransmit/loss counters");
  }
}

function numericDistribution(input, label) {
  if (!input || typeof input !== "object") fail("INVALID_SAMPLE", `${label} distribution is required`);
  const values = ["p50", "p95", "p99"].map((key) => finite(input[key], `${label}.${key}`));
  if (!(values[0] <= values[1] && values[1] <= values[2])) fail("INVALID_SAMPLE", `${label} percentiles are not monotonic`);
  return { p50: measured("ms", values[0]), p95: measured("ms", values[1]), p99: measured("ms", values[2]) };
}

function exactByConnection(samples, bindings, label) {
  if (!Array.isArray(samples) || samples.length !== 4) fail("CONNECTION_SAMPLES_REQUIRED", `${label} requires four per-connection samples`);
  const byId = new Map();
  for (const sample of samples) {
    if (!sample || typeof sample.connectionId !== "string" || byId.has(sample.connectionId)) {
      fail("CONNECTION_SAMPLES_REQUIRED", `${label} connection IDs must be unique`);
    }
    byId.set(sample.connectionId, sample);
  }
  return CLIENT_ALIASES.map((alias) => {
    const binding = bindings.get(alias);
    const sample = byId.get(binding.connectionId);
    if (!sample) fail("CONNECTION_SAMPLES_REQUIRED", `${label} is missing ${alias}`);
    byId.delete(binding.connectionId);
    return sample;
  });
}

function measuredClient(alias, app, socket, wire, reconnectMs) {
  const n = (object, key, label = key) => finite(object[key], `${alias}.${label}`);
  const layer = (sample, key, unit, label) => sample.status === "unavailable"
    ? unavailable(unit, typeof sample.reason === "string" && sample.reason ? sample.reason : `${label} was not proven by the client collector`)
    : measured(unit, n(sample, key, label));
  return {
    clientAlias: alias,
    completedStateHz: measured("Hz", n(app, "completedStateHz")),
    network: {
      applicationAccountingSource: publicSource(app.source, `${alias}.application source`),
      socketAccountingSource: publicSource(socket.source, `${alias}.socket source`),
      onWireAccountingSource: publicSource(wire.source, `${alias}.wire source`),
      applicationBytesPerSecondMean: measured("B/s", n(app, "bytesPerSecondMean", "application mean")),
      applicationBytesPerSecondP95: measured("B/s", n(app, "bytesPerSecondP95", "application p95")),
      socketBytesPerSecondMean: layer(socket, "bytesPerSecondMean", "B/s", "socket mean"),
      socketBytesPerSecondP95: layer(socket, "bytesPerSecondP95", "B/s", "socket p95"),
      onWireBytesPerSecondMean: layer(wire, "bytesPerSecondMean", "B/s", "wire mean"),
      onWireBytesPerSecondP95: layer(wire, "bytesPerSecondP95", "B/s", "wire p95"),
      packetsPerSecondMean: layer(wire, "packetsPerSecondMean", "packets/s", "packets mean"),
      packetsPerSecondP95: layer(wire, "packetsPerSecondP95", "packets/s", "packets p95"),
      retransmittedBytes: layer(wire, "retransmittedBytes", "bytes", "retransmitted bytes"),
      retransmittedPackets: layer(wire, "retransmittedPackets", "packets", "retransmitted packets"),
      lossRate: layer(wire, "lossRate", "ratio", "loss rate"),
    },
    pressure: {
      applicationQueueHighWaterBytes: measured("bytes", n(app, "applicationQueueHighWaterBytes")),
      reliableQueueHighWaterBytes: measured("bytes", n(app, "reliableQueueHighWaterBytes")),
      transportQueueHighWaterBytes: measured("bytes", n(app, "transportQueueHighWaterBytes")),
      backpressureEvents: measured("count", n(app, "backpressureEvents")),
      retainedBytes: measured("bytes", n(app, "retainedBytes")),
    },
    reconnectMs: measured("ms", finite(reconnectMs, `${alias}.reconnectMs`)),
  };
}

function sum(items, read) { return items.reduce((total, item) => total + read(item), 0); }
function layerSum(items, read, unit, reason) {
  return items.some((item) => item.status === "unavailable")
    ? unavailable(unit, reason)
    : measured(unit, sum(items, read));
}

function assertClientCollectorProof(samples, config, bindings, kind) {
  for (const client of config.clients) {
    const sample = samples.find((entry) => entry.connectionId === bindings.get(client.alias).connectionId);
    if (sample.status === "unavailable") continue;
    const expectedLeg = kind === "wire" ? "client-to-public-edge" : "client-local-socket";
    if (sample.captureLeg !== expectedLeg || sample.observerProcessId !== client.processId
      || sample.observerIncarnationId !== client.incarnationId) {
      fail("COLLECTOR_PERSPECTIVE_UNPROVEN", `${client.alias} ${kind} sample is not bound to its isolated client ${expectedLeg} collector`);
    }
  }
}

function assembleRaw({ config, signerKeyId, chronology, bindings, runtime, socketSamples, wireSamples, reconnectMs, fifth, drain, cleanup }) {
  if (runtime?.semantics?.cpu !== "capture-start-end-delta" || runtime.semantics.memory !== "capture-window-maxima"
      || runtime.semantics.queues !== "capture-window-maxima" || runtime.semantics.latency !== "capture-window-histograms"
      || runtime.provenance?.productionSafe !== true || runtime.provenance?.bounded !== true) {
    fail("PROCESS_SEMANTICS_UNPROVEN", "runtime samples must prove CPU deltas, capture maxima, histograms, and bounded production-safe provenance");
  }
  const appSamples = exactByConnection(runtime.clients, bindings, "application collector");
  const sockets = exactByConnection(socketSamples, bindings, "socket collector");
  const wires = exactByConnection(wireSamples, bindings, "on-wire collector");
  assertClientCollectorProof(sockets, config, bindings, "socket");
  assertClientCollectorProof(wires, config, bindings, "wire");
  const clients = CLIENT_ALIASES.map((alias, index) => measuredClient(alias, appSamples[index], sockets[index], wires[index],
    alias === SCHEDULE.reconnectAlias ? reconnectMs : 0));
  const exactBooleanRecord = (value, keys, label) => {
    if (!value || Object.keys(value).sort().join(",") !== [...keys].sort().join(",")) {
      fail("OUTCOME_SHAPE_INVALID", `${label} must contain exactly ${keys.join(", ")}`);
    }
    return Object.fromEntries(keys.map((key) => [key, bool(value[key], `${label}.${key}`)]));
  };
  if (fifth?.rejected !== true || fifth?.admittedSeats !== 4) fail("FIFTH_NOT_REJECTED", "fifth probe must be rejected with four admitted seats");
  if (drain?.replacementMs == null || drain.previousLeaseFenced !== true || drain.writerOverlapMs !== 0
      || drain.previousAuthorityProcessAlias !== "authority-1" || drain.observer !== "control-plane"
      || drain.authorityIncarnationAlias !== "authority-incarnation-1" || !Number.isSafeInteger(drain.leaseEpoch)) {
    fail("DRAIN_FENCE_UNPROVEN", "drain must prove the prior authority lease fenced with zero writer overlap");
  }
  if (cleanup?.authorityProcessAlias !== "authority-1" || cleanup.activeWriterCount !== 0 || cleanup.leaseFenced !== true) {
    fail("CLEANUP_UNPROVEN", "cleanup must prove exact authority exit, zero active writers, and fenced lease");
  }
  if (cleanup.observer !== "runtime-supervisor" || cleanup.exactProcessExitObserved !== true
      || cleanup.authorityIncarnationAlias !== drain.authorityIncarnationAlias || cleanup.leaseEpoch !== drain.leaseEpoch) {
    fail("CLEANUP_UNPROVEN", "runtime supervisor must externally observe exact process-incarnation exit");
  }
  const p = runtime.process;
  const captureMs = chronology.captureEndMono - chronology.captureStartMono;
  const userCpuMs = finite(p.userCpuMs, "process.userCpuMs");
  const systemCpuMs = finite(p.systemCpuMs, "process.systemCpuMs");
  const raw = smokeFixture({ type: "public", export: () => Buffer.alloc(0) });
  raw.metadata = {
    runClass: "external-one-shot", admissionEligible: true, retries: 0,
    runId: config.runId, scenarioId: config.scenarioId, gitCommit: config.gitCommit,
    artifactSha256: config.artifactSha256, protocolVersion: S20, provider: config.provider,
    region: config.region, runtime: config.runtime, hostClass: config.hostClass, seed: config.seed,
    invoice: structuredClone(config.invoice), signerKeyId,
  };
  raw.processes = [{ role: "authority", pidAlias: "authority-1", gitCommit: config.gitCommit, artifactSha256: config.artifactSha256 }];
  raw.chronology = {
    processStartedAt: chronology.processStartedAt, readyAt: chronology.readyAt,
    warmupStartedAt: chronology.warmupStartedAt, warmupEndedAt: chronology.warmupEndedAt,
    captureStartedAt: chronology.captureStartedAt, captureEndedAt: chronology.captureEndedAt,
    drainStartedAt: chronology.drainStartedAt, drainEndedAt: chronology.drainEndedAt,
    processExitedAt: chronology.processExitedAt,
    startupMs: measured("ms", chronology.readyMono - chronology.processStartMono),
    readinessMs: measured("ms", chronology.readyMono - chronology.processStartMono),
    drainMs: measured("ms", chronology.drainEndMono - chronology.drainStartMono),
    replacementMs: measured("ms", finite(drain.replacementMs, "drain.replacementMs")),
  };
  raw.admission = { admittedSeats: 4, fifthSeat: "rejected", rejectionLayer: fifth.layer || "authority" };
  raw.metrics = {
    authorityCount: 1, overloadMode: runtime.overloadMode,
    latencyMs: {
      authority: numericDistribution(runtime.latencyMs.authority, "authority"),
      sim: numericDistribution(runtime.latencyMs.sim, "sim"),
      writer: numericDistribution(runtime.latencyMs.writer, "writer"),
      projection: numericDistribution(runtime.latencyMs.projection, "projection"),
    },
    process: {
      userCpuMs: measured("ms", userCpuMs), systemCpuMs: measured("ms", systemCpuMs),
      coreFraction: derived("cores", (userCpuMs + systemCpuMs) / captureMs,
        "(userCpuMs+systemCpuMs)/captureMs", ["userCpuMs", "systemCpuMs", "captureMs"]),
      rssBytes: measured("bytes", finite(p.rssBytes, "process.rssBytes")),
      heapUsedBytes: measured("bytes", finite(p.heapUsedBytes, "process.heapUsedBytes")),
      gcPauseMs: measured("ms", finite(p.gcPauseMs, "process.gcPauseMs")),
      eventLoopDelayMs: measured("ms", finite(p.eventLoopDelayMs, "process.eventLoopDelayMs")),
      tickDebtMs: measured("ms", finite(p.tickDebtMs, "process.tickDebtMs")),
      retainedBytes: measured("bytes", finite(p.retainedBytes, "process.retainedBytes")),
    },
    matchNetwork: {
      applicationBytesPerSecondMean: measured("B/s", sum(appSamples, (sample) => finite(sample.bytesPerSecondMean, "application mean"))),
      socketBytesPerSecondMean: layerSum(sockets, (sample) => finite(sample.bytesPerSecondMean, "socket mean"), "B/s", "one or more client socket collectors unavailable"),
      onWireBytesPerSecondMean: layerSum(wires, (sample) => finite(sample.bytesPerSecondMean, "wire mean"), "B/s", "one or more client-to-public-edge collectors unavailable"),
      packetsPerSecondMean: layerSum(wires, (sample) => finite(sample.packetsPerSecondMean, "packets mean"), "packets/s", "one or more client-to-public-edge collectors unavailable"),
      retransmittedBytes: layerSum(wires, (sample) => finite(sample.retransmittedBytes, "retransmitted bytes"), "bytes", "one or more client-to-public-edge collectors unavailable"),
      retransmittedPackets: layerSum(wires, (sample) => finite(sample.retransmittedPackets, "retransmitted packets"), "packets", "one or more client-to-public-edge collectors unavailable"),
      lossRate: wires.some((sample) => sample.status === "unavailable")
        ? unavailable("ratio", "one or more client-to-public-edge collectors unavailable")
        : measured("ratio", finite(runtime.networkReconciliation.lossRate, "match lossRate")),
    },
    networkReconciliation: {
      applicationCounterSource: publicSource(runtime.networkReconciliation.applicationSource, "application source"),
      socketCounterSource: publicSource(runtime.networkReconciliation.socketSource, "socket source"),
      packetCaptureSource: publicSource(runtime.networkReconciliation.wireSource, "wire source"),
      capturedConnections: 4,
      unexplainedByteRatio: wires.some((sample) => sample.status === "unavailable") || sockets.some((sample) => sample.status === "unavailable")
        ? unavailable("ratio", "all four client connection layers are required for reconciliation")
        : measured("ratio", finite(runtime.networkReconciliation.unexplainedByteRatio, "unexplainedByteRatio")),
    },
  };
  raw.budgets = structuredClone(config.budgets);
  raw.clients = clients;
  raw.redTeam = structuredClone(config.redTeam || { P1: 0, P2: 0, P3: 0 });
  raw.outcomes = {
    correctness: Object.fromEntries(Object.entries(runtime.outcomes.correctness).map(([key, value]) => [key, bool(value, `correctness.${key}`)])),
    privacy: exactBooleanRecord(runtime.outcomes.privacy,
      ["ownerFieldsIsolated", "structuredLogScanClean"], "privacy"),
    fallback: { s20Negotiated: true, unsupportedCodecRejected: true },
    cleanup: {
      socketsClosed: bool(cleanup.socketsClosed, "cleanup.socketsClosed"),
      authorityExited: bool(cleanup.authorityExited, "cleanup.authorityExited"),
      queuesReleased: bool(cleanup.queuesReleased, "cleanup.queuesReleased"),
    },
  };
  raw.outcomes.correctness = exactBooleanRecord(runtime.outcomes.correctness,
    ["stateConverged", "consequencesTruthful", "exactlyOnceResult"], "correctness");
  raw.packing = { safeAuthoritiesPerHost: unavailable("authorities/host", "single-authority external capture cannot measure density") };
  raw.followOn = {
    soak90m: { status: "not-run", requiredDurationSeconds: 5_400 },
    noisyNeighborPacking: { status: "not-run", densities: [1, 2, 4, 8], counterbalanced: true },
  };
  return raw;
}

async function seal(raw, signer) {
  const payload = payloadForIntegrity(raw);
  const signature = await signer.sign(payload);
  const bytes = Buffer.isBuffer(signature) ? signature : Buffer.from(signature);
  if (bytes.length !== 64) fail("INVALID_SIGNATURE", "Ed25519 signer must return a 64-byte signature");
  return {
    ...raw,
    integrity: {
      algorithm: "ed25519-sha256",
      payloadSha256: `sha256:${sha256(payload)}`,
      signerKeyId: keyFingerprint(signer.publicKey),
      signatureBase64: bytes.toString("base64"),
    },
  };
}

async function sealFailure(failure, signer) {
  const payload = Buffer.from(`${JSON.stringify(failure, Object.keys(failure).sort())}\n`, "utf8");
  const signature = await signer.sign(payload);
  const bytes = Buffer.isBuffer(signature) ? signature : Buffer.from(signature);
  if (bytes.length !== 64) fail("INVALID_SIGNATURE", "Ed25519 signer must return a 64-byte failure signature");
  return {
    ...failure,
    integrity: {
      algorithm: "ed25519-sha256", payloadSha256: `sha256:${sha256(payload)}`,
      signerKeyId: keyFingerprint(signer.publicKey), signatureBase64: bytes.toString("base64"),
      canonicalEncoding: "lexicographic-flat-json-v1",
    },
  };
}

function safeRunId(value) {
  if (typeof value !== "string" || !/^[a-zA-Z0-9._-]{1,96}$/.test(value)) fail("RUN_ID_PATH_UNSAFE", "runId is not safe for append-only evidence storage");
  return value;
}

function createAppendOnlyFileSink(directory, { publicKey }) {
  const root = path.resolve(directory);
  const retainBundle = async (artifact, kind) => {
    const runId = safeRunId(artifact.runId || artifact.metadata?.runId);
    const finalDir = path.join(root, `${runId}.${kind}.sealed`);
    await fs.promises.mkdir(root, { recursive: true });
    const tempDir = await fs.promises.mkdtemp(path.join(root, `.${runId}.${kind}.tmp-`));
    const writeFsync = async (name, value) => {
      const handle = await fs.promises.open(path.join(tempDir, name), "wx", 0o600);
      try { await handle.writeFile(value); await handle.sync(); } finally { await handle.close(); }
    };
    try {
      await writeFsync("raw.json", `${JSON.stringify(artifact, null, 2)}\n`);
      await writeFsync("signature.json", `${JSON.stringify(artifact.integrity, null, 2)}\n`);
      await writeFsync("signer-fingerprint.txt", `${keyFingerprint(publicKey)}\n`);
      await writeFsync("SEALED", `${kind}\n`);
      const tempHandle = await fs.promises.open(tempDir, "r");
      try { await tempHandle.sync(); } finally { await tempHandle.close(); }
      // The destination is a non-empty directory bundle; rename cannot replace
      // an existing sealed bundle. This is the append-only O_EXCL boundary.
      await fs.promises.rename(tempDir, finalDir);
      const rootHandle = await fs.promises.open(root, "r");
      try { await rootHandle.sync(); } finally { await rootHandle.close(); }
      return finalDir;
    } catch (error) {
      await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {});
      throw error;
    }
  };
  return {
    appendOnly: true,
    durableBeforeTeardown: true,
    retain: (artifact) => retainBundle(artifact, "raw"),
    retainFailure: (artifact) => retainBundle(artifact, "failure"),
  };
}

async function runFourClientCapture(configInput, adapters) {
  const config = validateConfig(configInput);
  validateAdapters(adapters);
  const { clock, scheduler, transport, processCollector, socketCollector, wireCollector, signer, sink } = adapters;
  const chronology = {};
  const stamp = (name) => {
    chronology[`${name}At`] = iso(clock.now(), name);
    const monoName = name.endsWith("Started") ? name.replace(/Started$/, "Start")
      : name.endsWith("Ended") ? name.replace(/Ended$/, "End")
        : name.endsWith("Exited") ? name.replace(/Exited$/, "Exit") : name;
    chronology[`${monoName}Mono`] = finite(clock.monotonicMs(), `${name} monotonic`);
  };
  const bindings = new Map();
  let retained = false;
  let authorityStarted = false;
  let cleanupCompleted = false;
  const collectorsStarted = new Set();
  let currentStage = "authority-start";
  try {
    stamp("processStarted");
    const authority = await transport.startAuthority({ runId: config.runId, protocolVersion: S20, authorityCount: 1 });
    authorityStarted = true;
    if (!authority || authority.authorityCount !== 1) fail("ONE_AUTHORITY_REQUIRED", "transport must start exactly one authority");
    if (authority.ready !== true || authority.health !== "healthy" || authority.protocolVersion !== S20) {
      fail("AUTHORITY_NOT_READY", "authority must prove healthy S20 readiness; deploy success is not readiness");
    }
    if (authority.observer !== "control-plane" || authority.authorityIncarnationAlias !== "authority-incarnation-1"
      || !Number.isSafeInteger(authority.leaseEpoch) || authority.leaseEpoch < 1) {
      fail("AUTHORITY_LINEAGE_UNPROVEN", "control plane must externally observe authority incarnation and lease epoch");
    }
    chronology.processStartedAt = iso(authority.processStartedAt, "authority.processStartedAt");
    stamp("ready");
    chronology.readyAt = iso(authority.readyAt, "authority.readyAt");
    currentStage = "four-client-admission";
    for (const client of config.clients) {
      const connected = await transport.connect({ ...client, requestedProtocols: [S20] });
      if (!connected || connected.admitted !== true || connected.protocolVersion !== S20 || typeof connected.connectionId !== "string") {
        fail("S20_ADMISSION_REQUIRED", `${client.alias} did not negotiate admitted S20`);
      }
      if (connected.isolationVerified !== true || connected.origin !== client.origin
        || connected.processId !== client.processId || connected.incarnationId !== client.incarnationId) {
        fail("ORIGIN_ISOLATION_UNPROVEN", `${client.alias} transport did not prove its configured HTTPS origin and process incarnation`);
      }
      if (connected.isolationObserver !== "independent-client-launcher") {
        fail("ORIGIN_ISOLATION_UNPROVEN", `${client.alias} isolation cannot be self-asserted by the authority transport`);
      }
      if ([...bindings.values()].some((entry) => entry.connectionId === connected.connectionId)) fail("CONNECTION_NOT_ISOLATED", "client connections must be unique");
      bindings.set(client.alias, { connectionId: connected.connectionId });
    }
    currentStage = "warmup";
    stamp("warmupStarted");
    await scheduler.sleep(SCHEDULE.warmupMs, "warmup");
    stamp("warmupEnded");
    currentStage = "capture";
    stamp("captureStarted");
    const collectorContext = { runId: config.runId, connections: CLIENT_ALIASES.map((alias) => ({ alias, connectionId: bindings.get(alias).connectionId })) };
    for (const [name, collector] of [["process", processCollector], ["socket", socketCollector], ["wire", wireCollector]]) {
      await collector.start(collectorContext);
      collectorsStarted.add(name);
    }
    const paced = await Promise.all([
      scheduler.sleep(SCHEDULE.captureMs, "capture"),
      transport.runPacedCapture({ durationMs: SCHEDULE.captureMs, cadenceHz: SCHEDULE.captureCadenceHz,
        expectedSteps: SCHEDULE.captureMs / 1_000 * SCHEDULE.captureCadenceHz, protocolVersion: S20 }),
    ]).then((results) => results[1]);
    if (!paced || paced.fixedScheduleVerified !== true || paced.durationMs !== SCHEDULE.captureMs
      || paced.steps !== SCHEDULE.captureMs / 1_000 * SCHEDULE.captureCadenceHz) {
      fail("CAPTURE_PACING_UNPROVEN", "transport did not prove the exact fixed capture cadence and step count");
    }
    stamp("captureEnded");
    const runtime = await processCollector.stop(collectorContext); collectorsStarted.delete("process");
    const socketSamples = await socketCollector.stop(collectorContext); collectorsStarted.delete("socket");
    const wireSamples = await wireCollector.stop(collectorContext); collectorsStarted.delete("wire");
    currentStage = "reconnect";
    const reconnect = await transport.reconnect({ ...config.clients[0], requestedProtocols: [S20], priorConnectionId: bindings.get(SCHEDULE.reconnectAlias).connectionId });
    if (!reconnect || reconnect.protocolVersion !== S20 || reconnect.completedState !== true) fail("RECONNECT_FAILED", "client-1 reconnect must complete truthful S20 state");
    currentStage = "fifth-rejection";
    const fifth = await transport.probeFifth({ ...config.fifthProbe, requestedProtocols: [S20] });
    currentStage = "drain";
    stamp("drainStarted");
    const drain = await transport.drain({ runId: config.runId, authorityCount: 1,
      authorityIncarnationAlias: authority.authorityIncarnationAlias, leaseEpoch: authority.leaseEpoch });
    stamp("drainEnded");
    chronology.drainEndedAt = iso(drain.observedAt, "drain.observedAt");
    currentStage = "cleanup";
    const cleanup = await transport.cleanup({ runId: config.runId, connections: [...bindings.values()].map((entry) => entry.connectionId),
      authorityIncarnationAlias: authority.authorityIncarnationAlias, leaseEpoch: authority.leaseEpoch });
    cleanupCompleted = true;
    stamp("processExited");
    chronology.processExitedAt = iso(cleanup.processExitedAt, "cleanup.processExitedAt");
    // Assert chronology against the monotonic source before producing UTC evidence.
    elapsed(chronology.processStartMono, chronology.readyMono, "readiness");
    if (elapsed(chronology.warmupStartMono, chronology.warmupEndMono, "warmup") < SCHEDULE.warmupMs) fail("SHORT_WARMUP", "warmup ended early");
    if (elapsed(chronology.captureStartMono, chronology.captureEndMono, "capture") < SCHEDULE.captureMs) fail("SHORT_CAPTURE", "capture ended early");
    const raw = assembleRaw({ config, signerKeyId: keyFingerprint(signer.publicKey), chronology, bindings, runtime,
      socketSamples, wireSamples, reconnectMs: reconnect.reconnectMs, fifth, drain, cleanup });
    currentStage = "seal";
    const artifact = await seal(raw, signer);
    await sink.retain(artifact, { status: "SEALED", schema: SCHEMA });
    retained = true;
    return artifact;
  } catch (error) {
    let retentionError = null;
    if (!retained) {
      try {
        const failure = await sealFailure({
          schema: "lbh-v04-regional-four-player-capture-failure-v1",
          runId: config.runId,
          retries: 0,
          stage: currentStage,
          errorCode: error instanceof CaptureContractError ? error.code : "ADAPTER_FAILURE",
          sealedRawProduced: false,
        }, signer);
        await sink.retainFailure(failure, { status: "FAILED_BEFORE_RAW", durableBeforeTeardown: true });
      } catch (caught) { retentionError = caught; }
    }
    for (const [name, collector] of [["wire", wireCollector], ["socket", socketCollector], ["process", processCollector]]) {
      if (!collectorsStarted.has(name)) continue;
      try { await (typeof collector.abort === "function" ? collector.abort({ runId: config.runId }) : collector.stop({ runId: config.runId, aborted: true })); } catch {}
    }
    if (authorityStarted && !cleanupCompleted) {
      try { await transport.cleanup({ runId: config.runId, connections: [...bindings.values()].map((entry) => entry.connectionId), failed: true }); } catch {}
    }
    if (retentionError) throw new AggregateError([error, retentionError], "capture failed and durable failure retention also failed");
    throw error;
  }
}

module.exports = { S20, CLIENT_ALIASES, SCHEDULE, CaptureContractError, validateConfig, runFourClientCapture,
  seal, sealFailure, createAppendOnlyFileSink };
