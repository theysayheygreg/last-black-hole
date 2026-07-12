"use strict";

const fs = require("fs");
const path = require("path");
const { performance } = require("perf_hooks");
const { ManagedToxiproxy } = require("./toxiproxy-control.cjs");

const TOXIC_NAMES = Object.freeze([
  "upstream_latency", "upstream_bandwidth", "downstream_latency", "downstream_bandwidth",
]);

function assert(condition, message) { if (!condition) throw new Error(message); }
function write(file, value) { fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); }
function append(file, value) { fs.appendFileSync(file, `${JSON.stringify(value)}\n`); }

function validateTransport(transport, pilots = 4) {
  assert(transport?.kind === "managed-tcp-proxy", "T1 requires managed-tcp-proxy");
  assert(pilots === 4, "T1 requires exactly four browser paths");
  assert(transport.activationGuardMs === 250 && transport.maximumApplySkewMs === 100,
    "T1 activation window contract changed");
  const profile = transport.profile;
  assert(profile?.upstream?.latencyMs === 25 && profile.upstream.rateKBps === 66
    && profile.upstream.targetBytesPerSecond === 65536
    && profile.upstream.nominalAppliedBytesPerSecond === 66000,
  "T1 upstream profile changed");
  assert(profile?.downstream?.latencyMs === 45 && profile.downstream.rateKBps === 328
    && profile.downstream.targetBytesPerSecond === 327680
    && profile.downstream.nominalAppliedBytesPerSecond === 328000,
  "T1 downstream profile changed");
  assert(profile.roundingPolicy === "nearest-integer-decimal-kBps" && profile.jitterMs === 0,
    "T1 rate rounding/jitter contract changed");
}

function exactProfile(transport) {
  return {
    upstreamLatencyMs: transport.profile.upstream.latencyMs,
    upstreamRateKBps: transport.profile.upstream.rateKBps,
    downstreamLatencyMs: transport.profile.downstream.latencyMs,
    downstreamRateKBps: transport.profile.downstream.rateKBps,
  };
}

function assertSnapshot(snapshot, mappings, toxicity, transport) {
  const expectedToxics = [
    { name: "upstream_latency", type: "latency", stream: "upstream",
      attributes: { latency: transport.profile.upstream.latencyMs, jitter: 0 } },
    { name: "upstream_bandwidth", type: "bandwidth", stream: "upstream",
      attributes: { rate: transport.profile.upstream.rateKBps } },
    { name: "downstream_latency", type: "latency", stream: "downstream",
      attributes: { latency: transport.profile.downstream.latencyMs, jitter: 0 } },
    { name: "downstream_bandwidth", type: "bandwidth", stream: "downstream",
      attributes: { rate: transport.profile.downstream.rateKBps } },
  ];
  assert(Object.keys(snapshot).length === mappings.length, "T1 proxy snapshot count changed");
  for (const mapping of mappings) {
    const proxy = snapshot[mapping.proxyName];
    assert(proxy?.listen === mapping.listen && proxy.upstream === mapping.upstream && proxy.enabled === true,
      `${mapping.proxyName} mapping changed`);
    assert(Array.isArray(proxy.toxics) && proxy.toxics.length === 4, `${mapping.proxyName} toxic count changed`);
    for (let index = 0; index < TOXIC_NAMES.length; index += 1) {
      const toxic = proxy.toxics[index];
      const expected = expectedToxics[index];
      assert(toxic.name === expected.name && toxic.type === expected.type && toxic.stream === expected.stream
        && toxic.toxicity === toxicity && JSON.stringify(toxic.attributes) === JSON.stringify(expected.attributes),
        `${mapping.proxyName} toxic chain/order changed at ${index}`);
    }
  }
}

function metricKey(row) { return `${row.family}|${row.proxy}|${row.direction}`; }
function zeroMetricBaseline(mappings) {
  return { directionalBytes: mappings.flatMap((mapping) =>
    ["toxiproxy_proxy_received_bytes_total", "toxiproxy_proxy_sent_bytes_total"].flatMap((family) =>
      ["upstream", "downstream"].map((direction) => ({ family, proxy: mapping.proxyName, direction,
        listener: mapping.listen, upstream: mapping.upstream, value: 0 })))) };
}
function assertFinalMetrics(baseline, final, mappings) {
  const before = new Map(baseline.directionalBytes.map((row) => [metricKey(row), row]));
  const after = new Map(final.directionalBytes.map((row) => [metricKey(row), row]));
  assert(before.size === mappings.length * 4 && after.size === mappings.length * 4,
    "T1 directional metric family cardinality changed");
  const comparisons = [];
  for (const [key, start] of before) {
    const end = after.get(key);
    assert(end && end.value > start.value, `T1 finalized byte counter did not advance: ${key}`);
    comparisons.push({ key, baseline: start.value, finalized: end.value, delta: end.value - start.value });
  }
  return comparisons;
}

async function settleActivationRequests(descriptors, dispatch) {
  const settled = await Promise.allSettled(descriptors.map(dispatch));
  const outcomes = settled.map((entry, index) => entry.status === "fulfilled"
    ? { proxyName: descriptors[index].proxyName, toxicName: descriptors[index].toxicName,
      status: "fulfilled", operation: entry.value }
    : { proxyName: descriptors[index].proxyName, toxicName: descriptors[index].toxicName,
      status: "rejected", error: String(entry.reason?.message || entry.reason).slice(0, 500) });
  return { settled, outcomes };
}

async function rollbackAll(controller) {
  const outcomes = await Promise.allSettled([...controller.proxies.keys()].flatMap((proxyName) =>
    TOXIC_NAMES.map((toxicName) => controller.patchToxic(proxyName, toxicName, { toxicity: 0 }))));
  const failed = outcomes.filter((entry) => entry.status === "rejected");
  if (failed.length) throw new AggregateError(failed.map((entry) => entry.reason), "T1 toxic rollback failed");
}

async function createTcpProxyBrowserTransport({ transport, simPort, runDir, signal }) {
  validateTransport(transport);
  const controller = new ManagedToxiproxy({ workDir: runDir });
  const summaryFile = path.join(runDir, "t1-proxy-transport.json");
  const metricsFile = path.join(runDir, "toxiproxy-metrics.jsonl");
  const rawMetricsFile = path.join(runDir, "toxiproxy-metrics.raw.log");
  const beforeFile = path.join(runDir, "toxiproxy-config-before.json");
  const activeFile = path.join(runDir, "toxiproxy-config-active.json");
  const finalFile = path.join(runDir, "toxiproxy-config-final.json");
  fs.writeFileSync(metricsFile, "", { flag: "wx" });
  fs.writeFileSync(rawMetricsFile, "", { flag: "wx" });
  let stage = "NEW";
  let mappings = [];
  let baselineMetrics = null;
  let activation = null;
  let finalized = null;
  let cleanup = null;
  let authorityPid = null;
  const claimBoundary = "Configured fixed userspace TCP-stream proxy latency/rate and observed browser/gameplay outcomes only; not packet loss/reorder, throughput accuracy, congestion, retransmission, receive-window, WAN, WSS, TLS, hosted, live throughput, queue depth, or connection-drain evidence";
  const packetCapture = { required: false, status: "not-run", reason: "T1 makes TCP-stream configuration and gameplay claims only" };

  function persist(extra = {}) {
    write(summaryFile, { stage, tool: controller.describe(), oneAuthority: { simPid: authorityPid, simPort }, mappings,
      requestedProfile: transport.profile, activation, finalized, packetCapture, claimBoundary,
      firstFailure: controller.firstFailure, cleanup, ...extra });
  }
  try {
    await controller.start();
    stage = "DAEMON_READY";
    for (let index = 0; index < 4; index += 1) {
      const proxyName = `t1_pilot_${index}`;
      const proxy = await controller.createProxy({ name: proxyName, upstream: `127.0.0.1:${simPort}` });
      await controller.createInactiveProfile(proxyName, exactProfile(transport));
      mappings.push({ pilotSlot: `pilot-${index}`, proxyName, listen: proxy.listen,
        listenerPort: proxy.listener.port, upstream: proxy.upstream, simPort });
    }
    const before = await controller.snapshot();
    assertSnapshot(before, mappings, 0, transport);
    write(beforeFile, before);
    stage = "LISTENERS_READY";
    persist();
  } catch (error) {
    controller.captureFirstFailure(error, { stage });
    try { await rollbackAll(controller); } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], "T1 setup failed and rollback failed");
    }
    throw error;
  }

  async function markAdmitted({ simPid }) {
    authorityPid = simPid;
    assert(stage === "LISTENERS_READY", `T1 admission baseline required LISTENERS_READY, got ${stage}`);
    const raw = await controller.request("GET", "/metrics", undefined, { expectJson: false });
    fs.appendFileSync(rawMetricsFile, `# inactive-baseline-after-admission ${new Date().toISOString()}\n${raw}\n`);
    baselineMetrics = zeroMetricBaseline(mappings);
    append(metricsFile, { stage: "inactive-baseline-after-admission", diagnosticOnly: false,
      sampledWallMs: Date.now(), baselinePolicy: "zero-before-any-browser-link-finalization",
      directionalBytes: baselineMetrics.directionalBytes });
    stage = "ADMITTED";
    persist({ oneAuthority: { simPid, simPort } });
    return baselineMetrics;
  }

  async function activate(deadlineWallMs) {
    if (signal?.aborted) throw signal.reason || new Error("aborted");
    const delay = deadlineWallMs - Date.now();
    if (delay > 0) await new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, delay);
      signal?.addEventListener("abort", () => { clearTimeout(timer); reject(signal.reason || new Error("aborted")); }, { once: true });
    });
    stage = "APPLYING";
    const descriptors = mappings.flatMap((mapping) => TOXIC_NAMES.map((toxicName) => ({
      proxyName: mapping.proxyName, toxicName,
    })));
    const dispatch = async ({ proxyName, toxicName }) => {
      const requestWallMs = Date.now();
      const requestMonoMs = performance.now();
      const toxic = await controller.patchToxic(proxyName, toxicName, { toxicity: 1 });
      return { proxyName, toxicName, requestWallMs, requestMonoMs,
        responseWallMs: Date.now(), responseMonoMs: performance.now(), toxic };
    };
    try {
      const { settled, outcomes } = await settleActivationRequests(descriptors, dispatch);
      append(path.join(runDir, "toxiproxy-activation-outcomes.jsonl"), {
        deadlineWallMs, completedWallMs: Date.now(), outcomes,
      });
      const rejected = settled.filter((entry) => entry.status === "rejected");
      if (rejected.length > 0) {
        activation = { deadlineWallMs, outcomes, applySkewMs: null, activeConfigurationVerified: false };
        const activationError = new AggregateError(rejected.map((entry) => entry.reason),
          `T1 activation had ${rejected.length} rejected toxic PATCH requests`);
        controller.captureFirstFailure(activationError, { stage, rejectedActivationRequests: rejected.length });
        stage = "RESTORING";
        await rollbackAll(controller);
        const restored = await controller.snapshot();
        assertSnapshot(restored, mappings, 0, transport);
        stage = "RESTORED";
        persist({ activationRollbackVerified: true });
        activationError.t1ActivationRollbackVerified = true;
        throw activationError;
      }
      const operations = settled.map((entry) => entry.value);
      const responseTimes = operations.map((entry) => entry.responseMonoMs);
      const applySkewMs = Math.max(...responseTimes) - Math.min(...responseTimes);
      assert(applySkewMs <= transport.maximumApplySkewMs,
        `T1 toxic response-completion skew ${applySkewMs}ms exceeded ${transport.maximumApplySkewMs}ms`);
      const active = await controller.snapshot();
      assertSnapshot(active, mappings, 1, transport);
      write(activeFile, active);
      activation = { deadlineWallMs, outcomes, operations, applySkewMs, activeConfigurationVerified: true,
        exclusionWindow: { startWallMs: Math.min(...operations.map((entry) => entry.requestWallMs)),
          endWallMs: Math.max(...operations.map((entry) => entry.responseWallMs)) + transport.activationGuardMs,
          guardMs: transport.activationGuardMs, reason: "non-atomic 16-toxic activation plus guard" } };
      stage = "ACTIVE";
      persist();
      return activation;
    } catch (error) {
      controller.captureFirstFailure(error, { stage });
      if (error.t1ActivationRollbackVerified) throw error;
      try { await rollbackAll(controller); stage = "RESTORED"; persist(); }
      catch (rollbackError) { throw new AggregateError([error, rollbackError], "T1 activation failed and rollback failed"); }
      throw error;
    }
  }

  async function sampleMetrics(label) {
    const raw = await controller.request("GET", "/metrics", undefined, { expectJson: false });
    fs.appendFileSync(rawMetricsFile, `# ${label} ${new Date().toISOString()}\n${raw}\n`);
    const sample = { rawBytes: Buffer.byteLength(raw) };
    append(metricsFile, { stage: label, diagnosticOnly: true,
      sampledWallMs: Date.now(), rawBytes: sample.rawBytes,
      caveat: "v2.12 counters may remain absent or flat until each browser link closes" });
    return sample;
  }

  async function finalizeAfterBrowserClose({ simPid }) {
    authorityPid = simPid;
    const finalConfig = await controller.snapshot();
    assertSnapshot(finalConfig, mappings, 1, transport);
    write(finalFile, finalConfig);
    const finalMetrics = await controller.metrics();
    append(metricsFile, { stage: "finalized-after-browser-close", diagnosticOnly: false,
      sampledWallMs: Date.now(), directionalBytes: finalMetrics.directionalBytes });
    finalized = { sampledAfterBrowserClose: true, sampledBeforeProxyDeletion: true,
      metricComparisons: assertFinalMetrics(baselineMetrics, finalMetrics, mappings) };
    stage = "RESTORING";
    await rollbackAll(controller);
    stage = "RESTORED";
    persist();
    return finalized;
  }

  async function stop() {
    try {
      if (stage === "ACTIVE" || stage === "APPLYING") await rollbackAll(controller);
    } finally {
      cleanup = await controller.cleanup();
      stage = "STOPPED";
      persist();
    }
    return cleanup;
  }

  return { mappings, markAdmitted, activate, sampleMetrics, finalizeAfterBrowserClose, stop,
    get activation() { return activation; }, get finalized() { return finalized; },
    get cleanup() { return cleanup; }, get stage() { return stage; },
    tool: controller.describe(), packetCapture, claimBoundary };
}

async function selfTestActivationFailureSettlement() {
  const transport = {
    profile: { upstream: { latencyMs: 25, rateKBps: 66 }, downstream: { latencyMs: 45, rateKBps: 328 } },
  };
  const mapping = { proxyName: "fault_proxy", listen: "127.0.0.1:41001", upstream: "127.0.0.1:41002" };
  const definitions = [
    { name: "upstream_latency", type: "latency", stream: "upstream", attributes: { latency: 25, jitter: 0 } },
    { name: "upstream_bandwidth", type: "bandwidth", stream: "upstream", attributes: { rate: 66 } },
    { name: "downstream_latency", type: "latency", stream: "downstream", attributes: { latency: 45, jitter: 0 } },
    { name: "downstream_bandwidth", type: "bandwidth", stream: "downstream", attributes: { rate: 328 } },
  ];
  const state = new Map(definitions.map((entry) => [entry.name, { ...entry, toxicity: 0 }]));
  let delayedSuccessCompleted = false;
  const fake = {
    proxies: new Map([[mapping.proxyName, mapping]]),
    async patchToxic(proxyName, toxicName, { toxicity }) {
      assert(proxyName === mapping.proxyName && state.has(toxicName), "fault self-test received unknown identity");
      if (toxicity === 1 && toxicName === "upstream_latency") throw new Error("injected activation rejection");
      if (toxicity === 1 && toxicName === "downstream_bandwidth") {
        await new Promise((resolve) => setTimeout(resolve, 25));
        delayedSuccessCompleted = true;
      }
      state.get(toxicName).toxicity = toxicity;
      return state.get(toxicName);
    },
    async snapshot() {
      return { [mapping.proxyName]: { name: mapping.proxyName, listen: mapping.listen,
        upstream: mapping.upstream, enabled: true, toxics: definitions.map((entry) => state.get(entry.name)) } };
    },
  };
  const descriptors = TOXIC_NAMES.map((toxicName) => ({ proxyName: mapping.proxyName, toxicName }));
  const { settled } = await settleActivationRequests(descriptors,
    (descriptor) => fake.patchToxic(descriptor.proxyName, descriptor.toxicName, { toxicity: 1 }));
  assert(delayedSuccessCompleted && settled.some((entry) => entry.status === "rejected"),
    "fault self-test did not settle rejection plus delayed success");
  await rollbackAll(fake);
  assertSnapshot(await fake.snapshot(), [mapping], 0, transport);
  return { requestsSettled: settled.length, rejected: settled.filter((entry) => entry.status === "rejected").length,
    delayedSuccessCompleted, finalInactiveSnapshot: true };
}

module.exports = { createTcpProxyBrowserTransport, validateTransport, TOXIC_NAMES,
  settleActivationRequests, selfTestActivationFailureSettlement };
