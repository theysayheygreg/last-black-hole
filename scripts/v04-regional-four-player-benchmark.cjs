#!/usr/bin/env node
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

const SCHEMA = "lbh-v04-regional-four-player-raw-v1";
const ANALYSIS_SCHEMA = "lbh-v04-regional-four-player-analysis-v1";
const RUN_CLASSES = new Set(["external-one-shot", "local-contract-smoke"]);
const REQUIRED_LATENCY = ["authority", "sim", "writer", "projection"];
const PERCENTILES = ["p50", "p95", "p99"];
const FORBIDDEN_KEY = /(?:secret|token|ticket|credential|password|providerSubject|accountId|deviceId|profileId|membershipId)/i;

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function payloadForIntegrity(raw) {
  const copy = structuredClone(raw);
  delete copy.integrity;
  return Buffer.from(`${stableStringify(copy)}\n`, "utf8");
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function keyFingerprint(publicKey) {
  const key = publicKey?.type === "public" ? publicKey : crypto.createPublicKey(publicKey);
  const der = key.export({ type: "spki", format: "der" });
  return `sha256:${sha256(der)}`;
}

function signRawArtifact(raw, privateKey, publicKey) {
  const payload = payloadForIntegrity(raw);
  return {
    ...raw,
    integrity: {
      algorithm: "ed25519-sha256",
      payloadSha256: `sha256:${sha256(payload)}`,
      signerKeyId: keyFingerprint(publicKey),
      signatureBase64: crypto.sign(null, payload, privateKey).toString("base64"),
    },
  };
}

function measurement(status, unit, value, extra = {}) {
  return status === "unavailable"
    ? { status, unit, reason: extra.reason || "not captured" }
    : { status, unit, value, ...extra };
}

function measured(unit, value) { return measurement("measured", unit, value); }
function unavailable(unit, reason) { return measurement("unavailable", unit, undefined, { reason }); }
function derived(unit, value, formula, inputs) { return measurement("derived", unit, value, { formula, inputs }); }

function assertObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
}

function validateMeasurement(value, label, { allowUnavailable = true } = {}) {
  assertObject(value, label);
  if (!new Set(["measured", "derived", "unavailable"]).has(value.status)) {
    throw new Error(`${label}.status must distinguish measured, derived, or unavailable`);
  }
  if (typeof value.unit !== "string" || !value.unit) throw new Error(`${label}.unit is required`);
  if (value.status === "unavailable") {
    if (!allowUnavailable) throw new Error(`${label} cannot be unavailable`);
    if (Object.hasOwn(value, "value")) throw new Error(`${label} unavailable must not masquerade as zero/value`);
    if (typeof value.reason !== "string" || !value.reason) throw new Error(`${label}.reason is required when unavailable`);
    return;
  }
  if (typeof value.value !== "number" || !Number.isFinite(value.value) || value.value < 0) {
    throw new Error(`${label}.value must be a finite non-negative number`);
  }
  if (value.status === "derived" && (!value.formula || !Array.isArray(value.inputs) || value.inputs.length === 0)) {
    throw new Error(`${label} derived values require formula and inputs`);
  }
}

function valueOf(value, label) {
  validateMeasurement(value, label, { allowUnavailable: false });
  return value.value;
}

function validateDistribution(value, label) {
  assertObject(value, label);
  for (const p of PERCENTILES) validateMeasurement(value[p], `${label}.${p}`, { allowUnavailable: false });
  const numbers = PERCENTILES.map((p) => value[p].value);
  if (!(numbers[0] <= numbers[1] && numbers[1] <= numbers[2])) throw new Error(`${label} percentiles are not monotonic`);
}

function isoMs(value, label) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be ISO-8601`);
  return parsed;
}

function validateChronology(raw) {
  const t = raw.chronology;
  assertObject(t, "chronology");
  const ordered = ["processStartedAt", "readyAt", "warmupStartedAt", "warmupEndedAt", "captureStartedAt", "captureEndedAt", "drainStartedAt", "drainEndedAt", "processExitedAt"];
  const values = ordered.map((key) => isoMs(t[key], `chronology.${key}`));
  for (let i = 1; i < values.length; i += 1) {
    if (values[i] < values[i - 1]) throw new Error(`forged chronology: ${ordered[i]} precedes ${ordered[i - 1]}`);
  }
  if (values[3] - values[2] < 5_000) throw new Error("warmup must be at least 5 seconds");
  if (values[5] - values[4] < 20_000) throw new Error("paced capture must be at least 20 seconds");
  validateMeasurement(t.startupMs, "chronology.startupMs", { allowUnavailable: false });
  validateMeasurement(t.readinessMs, "chronology.readinessMs", { allowUnavailable: false });
  validateMeasurement(t.drainMs, "chronology.drainMs", { allowUnavailable: false });
  validateMeasurement(t.replacementMs, "chronology.replacementMs");
}

function scanForForbiddenKeys(value, trail = "$") {
  if (Array.isArray(value)) return value.flatMap((item, index) => scanForForbiddenKeys(item, `${trail}[${index}]`));
  if (!value || typeof value !== "object") return [];
  const findings = [];
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEY.test(key)) findings.push(`${trail}.${key}`);
    findings.push(...scanForForbiddenKeys(child, `${trail}.${key}`));
  }
  return findings;
}

function verifyIntegrity(raw, trustedPublicKeyPem) {
  assertObject(raw.integrity, "integrity");
  if (raw.integrity.algorithm !== "ed25519-sha256") throw new Error("integrity algorithm must be ed25519-sha256");
  if (!trustedPublicKeyPem) throw new Error("trusted public key is required; embedded evidence cannot choose its own trust root");
  const fingerprint = keyFingerprint(trustedPublicKeyPem);
  if (raw.integrity.signerKeyId !== fingerprint) throw new Error("artifact signer is not the trusted capture signer");
  const payload = payloadForIntegrity(raw);
  if (raw.integrity.payloadSha256 !== `sha256:${sha256(payload)}`) throw new Error("artifact SHA-256 mismatch");
  const signature = Buffer.from(raw.integrity.signatureBase64 || "", "base64");
  if (!crypto.verify(null, payload, trustedPublicKeyPem, signature)) throw new Error("artifact signature verification failed");
}

function validateMetadata(raw) {
  assertObject(raw.metadata, "metadata");
  if (!RUN_CLASSES.has(raw.metadata.runClass)) throw new Error("metadata.runClass is invalid");
  if (raw.metadata.runClass === "external-one-shot" && raw.metadata.retries !== 0) throw new Error("external final run must have zero retries");
  if (raw.metadata.runClass === "local-contract-smoke" && raw.metadata.admissionEligible !== false) {
    throw new Error("local smoke must be non-admission");
  }
  for (const key of ["runId", "scenarioId", "gitCommit", "artifactSha256", "protocolVersion", "provider", "region", "runtime", "hostClass", "seed"]) {
    if (raw.metadata[key] == null || raw.metadata[key] === "") throw new Error(`metadata.${key} is required`);
  }
  if (!/^sha256:[a-f0-9]{64}$/.test(raw.metadata.artifactSha256)) throw new Error("metadata.artifactSha256 is invalid");
  if (!Array.isArray(raw.processes) || raw.processes.length !== 1 || raw.processes[0].role !== "authority") {
    throw new Error("exactly one authority process per match is required");
  }
  if (raw.processes.some((process) => process.gitCommit !== raw.metadata.gitCommit)) throw new Error("mixed commits are forbidden");
  assertObject(raw.metadata.invoice, "metadata.invoice");
  for (const key of ["currency", "computeRate", "egressRate", "billingSource", "invoiceObserved"]) {
    if (!Object.hasOwn(raw.metadata.invoice, key)) throw new Error(`metadata.invoice.${key} is required`);
  }
}

function validateMetrics(raw) {
  assertObject(raw.metrics, "metrics");
  assertObject(raw.budgets, "budgets");
  for (const name of ["tickDebtMsMax", "rssBytesMax", "heapUsedBytesMax", "authorityRetainedBytesMax",
    "clientRetainedBytesMax", "backpressureEventsMax"]) {
    validateMeasurement(raw.budgets[name], `budgets.${name}`, { allowUnavailable: false });
  }
  for (const name of REQUIRED_LATENCY) validateDistribution(raw.metrics.latencyMs[name], `metrics.latencyMs.${name}`);
  for (const name of ["userCpuMs", "systemCpuMs", "coreFraction", "rssBytes", "heapUsedBytes", "gcPauseMs", "eventLoopDelayMs", "tickDebtMs", "retainedBytes"]) {
    validateMeasurement(raw.metrics.process[name], `metrics.process.${name}`, { allowUnavailable: false });
  }
  if (raw.metrics.process.userCpuMs.status !== "measured" || raw.metrics.process.systemCpuMs.status !== "measured") {
    throw new Error("process user/system CPU must be measured, not derived");
  }
  if (raw.metrics.process.coreFraction.status !== "derived") throw new Error("core fraction must be derived from measured process CPU and capture duration");
  if (!Array.isArray(raw.clients) || raw.clients.length !== 4 || new Set(raw.clients.map((c) => c.clientAlias)).size !== 4) {
    throw new Error("exactly four isolated clients are required");
  }
  for (const [index, client] of raw.clients.entries()) {
    if (!/^client-[1-4]$/.test(client.clientAlias)) throw new Error(`clients[${index}] alias must be public client-1..4`);
    validateMeasurement(client.completedStateHz, `clients[${index}].completedStateHz`, { allowUnavailable: false });
    for (const name of ["applicationBytesPerSecondMean", "applicationBytesPerSecondP95", "wireBytesPerSecondMean", "wireBytesPerSecondP95", "packetsPerSecondMean", "packetsPerSecondP95"]) {
      validateMeasurement(client.network[name], `clients[${index}].network.${name}`, { allowUnavailable: false });
    }
    if (client.network.applicationBytesPerSecondMean.value === client.network.wireBytesPerSecondMean.value
      && client.network.accountingSource === "application-only") {
      throw new Error("application bytes cannot be relabeled as real socket/on-wire bytes");
    }
    for (const name of ["applicationQueueHighWaterBytes", "reliableQueueHighWaterBytes", "transportQueueHighWaterBytes", "backpressureEvents", "retainedBytes"]) {
      validateMeasurement(client.pressure[name], `clients[${index}].pressure.${name}`, { allowUnavailable: false });
    }
    validateMeasurement(client.reconnectMs, `clients[${index}].reconnectMs`);
  }
  for (const name of ["applicationBytesPerSecondMean", "wireBytesPerSecondMean", "packetsPerSecondMean"]) {
    validateMeasurement(raw.metrics.matchNetwork[name], `metrics.matchNetwork.${name}`, { allowUnavailable: false });
  }
  if (raw.metrics.authorityCount !== 1) throw new Error("authorityCount must be exactly one");
  if (raw.metrics.overloadMode !== "NORMAL") throw new Error("benchmark must remain NORMAL");
  if (raw.admission.fifthSeat !== "rejected" || raw.admission.admittedSeats !== 4) throw new Error("fifth seat must be rejected after four admissions");
  if (raw.packing.safeAuthoritiesPerHost.status !== "unavailable") throw new Error("safeAuthoritiesPerHost stays unknown until density evidence");
  if (Object.hasOwn(raw.packing.safeAuthoritiesPerHost, "value")) throw new Error("safeAuthoritiesPerHost cannot be inferred from local/single-authority data");
}

function acceptanceChecks(raw) {
  const checks = [];
  const add = (id, passed, observed, gate) => checks.push({ id, passed, observed, gate });
  add("exact-one-authority", raw.metrics.authorityCount === 1, raw.metrics.authorityCount, 1);
  add("four-clients", raw.clients.length === 4, raw.clients.length, 4);
  add("fifth-seat-rejected", raw.admission.fifthSeat === "rejected", raw.admission.fifthSeat, "rejected");
  add("normal", raw.metrics.overloadMode === "NORMAL", raw.metrics.overloadMode, "NORMAL");
  add("all-clients-9hz", raw.clients.every((c) => c.completedStateHz.value >= 9), raw.clients.map((c) => c.completedStateHz.value), ">=9");
  add("projection-p95", raw.metrics.latencyMs.projection.p95.value <= 50, raw.metrics.latencyMs.projection.p95.value, "<=50ms");
  add("projection-p99", raw.metrics.latencyMs.projection.p99.value <= 70, raw.metrics.latencyMs.projection.p99.value, "<=70ms");
  add("application-mean", raw.clients.every((c) => c.network.applicationBytesPerSecondMean.value <= 64 * 1024),
    raw.clients.map((c) => c.network.applicationBytesPerSecondMean.value), "<=64KiB/s/client");
  add("application-p95", raw.clients.every((c) => c.network.applicationBytesPerSecondP95.value <= 80 * 1024),
    raw.clients.map((c) => c.network.applicationBytesPerSecondP95.value), "<=80KiB/s/client");
  add("bounded-application-queues", raw.clients.every((c) => c.pressure.applicationQueueHighWaterBytes.value <= 512 * 1024),
    raw.clients.map((c) => c.pressure.applicationQueueHighWaterBytes.value), "<=512KiB/client");
  add("bounded-reliable-queues", raw.clients.every((c) => c.pressure.reliableQueueHighWaterBytes.value <= 256 * 1024),
    raw.clients.map((c) => c.pressure.reliableQueueHighWaterBytes.value), "<=256KiB/client");
  add("bounded-transport-queues", raw.clients.every((c) => c.pressure.transportQueueHighWaterBytes.value <= 256 * 1024),
    raw.clients.map((c) => c.pressure.transportQueueHighWaterBytes.value), "<=256KiB/client");
  add("bounded-tick-debt", raw.metrics.process.tickDebtMs.value <= raw.budgets.tickDebtMsMax.value,
    raw.metrics.process.tickDebtMs.value, `<=${raw.budgets.tickDebtMsMax.value}ms`);
  add("bounded-rss", raw.metrics.process.rssBytes.value <= raw.budgets.rssBytesMax.value,
    raw.metrics.process.rssBytes.value, `<=${raw.budgets.rssBytesMax.value} bytes`);
  add("bounded-heap", raw.metrics.process.heapUsedBytes.value <= raw.budgets.heapUsedBytesMax.value,
    raw.metrics.process.heapUsedBytes.value, `<=${raw.budgets.heapUsedBytesMax.value} bytes`);
  add("bounded-retention", raw.metrics.process.retainedBytes.value <= raw.budgets.authorityRetainedBytesMax.value
    && raw.clients.every((c) => c.pressure.retainedBytes.value <= raw.budgets.clientRetainedBytesMax.value),
  { authority: raw.metrics.process.retainedBytes.value, clients: raw.clients.map((c) => c.pressure.retainedBytes.value) },
  { authority: raw.budgets.authorityRetainedBytesMax.value, client: raw.budgets.clientRetainedBytesMax.value });
  add("bounded-backpressure", raw.clients.every((c) => c.pressure.backpressureEvents.value <= raw.budgets.backpressureEventsMax.value),
    raw.clients.map((c) => c.pressure.backpressureEvents.value), `<=${raw.budgets.backpressureEventsMax.value}`);
  add("no-severity-findings", ["P1", "P2", "P3"].every((key) => raw.redTeam[key] === 0), raw.redTeam, "P1=P2=P3=0");
  add("correctness", Object.values(raw.outcomes.correctness).every(Boolean), raw.outcomes.correctness, "all true");
  add("privacy", Object.values(raw.outcomes.privacy).every(Boolean), raw.outcomes.privacy, "all true");
  add("fallback-cleanup", Object.values({ ...raw.outcomes.fallback, ...raw.outcomes.cleanup }).every(Boolean),
    { ...raw.outcomes.fallback, ...raw.outcomes.cleanup }, "all true");
  return checks;
}

function analyze(raw, { trustedPublicKeyPem } = {}) {
  if (raw.schema !== SCHEMA) throw new Error(`expected schema ${SCHEMA}`);
  verifyIntegrity(raw, trustedPublicKeyPem);
  validateMetadata(raw);
  validateChronology(raw);
  validateMetrics(raw);
  if (raw.metadata.runClass === "external-one-shot") {
    validateMeasurement(raw.chronology.replacementMs, "chronology.replacementMs", { allowUnavailable: false });
    raw.clients.forEach((client, index) => validateMeasurement(client.reconnectMs,
      `clients[${index}].reconnectMs`, { allowUnavailable: false }));
  }
  const privacyFindings = scanForForbiddenKeys({ metadata: raw.metadata, clients: raw.clients, outcomes: raw.outcomes });
  if (privacyFindings.length) throw new Error(`secret/PII leakage in evidence keys: ${privacyFindings.join(", ")}`);
  const checks = acceptanceChecks(raw);
  const local = raw.metadata.runClass === "local-contract-smoke";
  return {
    schema: ANALYSIS_SCHEMA,
    rawArtifactSha256: raw.integrity.payloadSha256,
    signerKeyId: raw.integrity.signerKeyId,
    runClass: raw.metadata.runClass,
    admissionEligible: !local && raw.metadata.admissionEligible === true,
    verdict: local ? "LOCAL_NON_ADMISSION" : checks.every((check) => check.passed) ? "PASS" : "FAIL",
    checks,
    safeAuthoritiesPerHost: { status: "unavailable", reason: "requires counterbalanced density and noisy-neighbor evidence" },
    evidenceLabels: { localSmoke: local, hostedRegional: !local, measuredVsDerivedPreserved: true },
  };
}

function smokeFixture(publicKey) {
  const start = Date.parse("2026-07-14T00:00:00.000Z");
  const at = (ms) => new Date(start + ms).toISOString();
  const dist = (p50, p95, p99) => ({ p50: measured("ms", p50), p95: measured("ms", p95), p99: measured("ms", p99) });
  const clients = Array.from({ length: 4 }, (_, i) => ({
    clientAlias: `client-${i + 1}`,
    completedStateHz: measured("Hz", 9.8),
    network: {
      accountingSource: "socket-and-application-counters",
      applicationBytesPerSecondMean: measured("B/s", 31_000), applicationBytesPerSecondP95: measured("B/s", 33_000),
      wireBytesPerSecondMean: measured("B/s", 34_000), wireBytesPerSecondP95: measured("B/s", 37_000),
      packetsPerSecondMean: measured("packets/s", 20), packetsPerSecondP95: measured("packets/s", 24),
    },
    pressure: {
      applicationQueueHighWaterBytes: measured("bytes", 4_096), reliableQueueHighWaterBytes: measured("bytes", 1_024),
      transportQueueHighWaterBytes: measured("bytes", 8_192), backpressureEvents: measured("count", 0), retainedBytes: measured("bytes", 65_536),
    },
    reconnectMs: unavailable("ms", "local parser smoke did not disconnect"),
  }));
  return {
    schema: SCHEMA,
    metadata: {
      runClass: "local-contract-smoke", admissionEligible: false, retries: 0, runId: "local-smoke-001",
      scenarioId: "phase6-four-player-contract-smoke", gitCommit: "0".repeat(40), artifactSha256: `sha256:${"1".repeat(64)}`,
      protocolVersion: "s20-v1+brotli-q1", provider: "local", region: "loopback", runtime: process.version,
      hostClass: `${process.platform}-${process.arch}`, seed: "0x50B04A5E",
      invoice: { currency: "USD", computeRate: unavailable("USD/hour", "local smoke"),
        egressRate: unavailable("USD/GB", "local smoke"), billingSource: "none-local", invoiceObserved: false },
      signerKeyId: keyFingerprint(publicKey),
    },
    processes: [{ role: "authority", pidAlias: "authority-1", gitCommit: "0".repeat(40), artifactSha256: `sha256:${"1".repeat(64)}` }],
    chronology: {
      processStartedAt: at(0), readyAt: at(500), warmupStartedAt: at(1_000), warmupEndedAt: at(6_000),
      captureStartedAt: at(7_000), captureEndedAt: at(27_000), drainStartedAt: at(27_100), drainEndedAt: at(27_400), processExitedAt: at(27_500),
      startupMs: measured("ms", 500), readinessMs: measured("ms", 500), drainMs: measured("ms", 300),
      replacementMs: unavailable("ms", "local parser smoke did not replace authority"),
    },
    admission: { admittedSeats: 4, fifthSeat: "rejected", rejectionLayer: "authority" },
    metrics: {
      authorityCount: 1, overloadMode: "NORMAL", latencyMs: { authority: dist(12, 20, 25), sim: dist(5, 9, 12), writer: dist(3, 6, 8), projection: dist(25, 45, 60) },
      process: {
        userCpuMs: measured("ms", 8_000), systemCpuMs: measured("ms", 1_000),
        coreFraction: derived("cores", 0.45, "(userCpuMs+systemCpuMs)/captureMs", ["userCpuMs", "systemCpuMs", "captureMs"]),
        rssBytes: measured("bytes", 150_000_000), heapUsedBytes: measured("bytes", 80_000_000), gcPauseMs: measured("ms", 2),
        eventLoopDelayMs: measured("ms", 8), tickDebtMs: measured("ms", 0), retainedBytes: measured("bytes", 400_000),
      },
      matchNetwork: { applicationBytesPerSecondMean: measured("B/s", 124_000), wireBytesPerSecondMean: measured("B/s", 136_000), packetsPerSecondMean: measured("packets/s", 80) },
    },
    budgets: {
      tickDebtMsMax: measured("ms", 100), rssBytesMax: measured("bytes", 512 * 1024 * 1024),
      heapUsedBytesMax: measured("bytes", 256 * 1024 * 1024), authorityRetainedBytesMax: measured("bytes", 16 * 1024 * 1024),
      clientRetainedBytesMax: measured("bytes", 4 * 1024 * 1024), backpressureEventsMax: measured("count", 0),
    },
    clients,
    redTeam: { P1: 0, P2: 0, P3: 0 },
    outcomes: {
      correctness: { stateConverged: true, consequencesTruthful: true, exactlyOnceResult: true },
      privacy: { ownerFieldsIsolated: true, structuredLogScanClean: true },
      fallback: { s20Negotiated: true, unsupportedCodecRejected: true },
      cleanup: { socketsClosed: true, authorityExited: true, queuesReleased: true },
    },
    packing: { safeAuthoritiesPerHost: unavailable("authorities/host", "single-authority contract smoke cannot measure density") },
    followOn: {
      soak90m: { status: "not-run", requiredDurationSeconds: 5_400 },
      noisyNeighborPacking: { status: "not-run", densities: [1, 2, 4, 8], counterbalanced: true },
    },
  };
}

function parseArgs(argv) {
  const result = {};
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--smoke") result.smoke = true;
    else if (["--input", "--output", "--trusted-public-key"].includes(arg)) result[arg.slice(2)] = argv[++i];
    else throw new Error(`unknown argument ${arg}`);
  }
  return result;
}

function main() {
  const args = parseArgs(process.argv);
  if (args.smoke) {
    const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519");
    const raw = signRawArtifact(smokeFixture(publicKey), privateKey, publicKey);
    const analysis = analyze(raw, { trustedPublicKeyPem: publicKey });
    console.log(JSON.stringify({ ...analysis, host: os.hostname(), note: "local parser/schema smoke; no cloud or admission claim" }, null, 2));
    return;
  }
  if (!args.input || !args["trusted-public-key"]) throw new Error("usage: --input RAW.json --trusted-public-key PUBLIC.pem [--output ANALYSIS.json]");
  const raw = JSON.parse(fs.readFileSync(path.resolve(args.input), "utf8"));
  const trustedPublicKeyPem = fs.readFileSync(path.resolve(args["trusted-public-key"]), "utf8");
  const analysis = analyze(raw, { trustedPublicKeyPem });
  const output = `${JSON.stringify(analysis, null, 2)}\n`;
  if (args.output) fs.writeFileSync(path.resolve(args.output), output, { flag: "wx" }); else process.stdout.write(output);
  if (analysis.verdict === "FAIL") process.exitCode = 1;
}

if (require.main === module) {
  try { main(); } catch (error) { console.error(error.stack || error.message); process.exitCode = 1; }
}

module.exports = { SCHEMA, ANALYSIS_SCHEMA, analyze, stableStringify, payloadForIntegrity, sha256,
  keyFingerprint, signRawArtifact, smokeFixture, measured, derived, unavailable };
