"use strict";

const fs = require("fs");
const path = require("path");
const { performance } = require("perf_hooks");
const { ManagedToxiproxy } = require("./toxiproxy-control.cjs");

const TOXIC_NAMES = Object.freeze(["upstream_timeout", "downstream_timeout"]);

function assert(value, message) { if (!value) throw new Error(message); }
function write(file, value) { fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); }
function append(file, value) { fs.appendFileSync(file, `${JSON.stringify(value)}\n`); }
function delay(ms, signal) {
  if (signal?.aborted) return Promise.reject(signal.reason || new Error("aborted"));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => { clearTimeout(timer); reject(signal.reason || new Error("aborted")); }, { once: true });
  });
}

function validateTransport(transport) {
  assert(transport?.kind === "managed-tcp-proxy-blackout", "F5 requires managed-tcp-proxy-blackout");
  assert(transport.durationProfile === "pr-smoke-5-40-15" && transport.pilotSlot === "pilot-3",
    "F5 topology/profile changed");
  assert(transport.activationAtMs === 20000 && transport.applicationDiscardEndMs === 45000
    && transport.activationGuardMs === 250 && transport.minimumVerifiedDropMs === 25000
    && transport.namedActionLeadMs === 3000 && transport.recoveryBudgetMs === 8000,
  "F5 timing contract changed");
  assert(JSON.stringify(transport.toxics) === JSON.stringify([
    { name: "upstream_timeout", type: "timeout", stream: "upstream", toxicity: 0, attributes: { timeout: 0 } },
    { name: "downstream_timeout", type: "timeout", stream: "downstream", toxicity: 0, attributes: { timeout: 0 } },
  ]), "F5 timeout-zero definitions changed");
}

function exactProxy(snapshot, mapping, enabled, toxicity, toxicCount = 2) {
  const proxy = snapshot[mapping.proxyName];
  assert(proxy?.name === mapping.proxyName && proxy.listen === mapping.listen
    && proxy.upstream === mapping.upstream && proxy.enabled === enabled, `${mapping.proxyName} identity/state changed`);
  assert(Array.isArray(proxy.toxics) && proxy.toxics.length === toxicCount,
    `${mapping.proxyName} toxic count changed`);
  if (toxicCount) {
    for (const name of TOXIC_NAMES) {
      const toxic = proxy.toxics.find((entry) => entry.name === name);
      const stream = name.startsWith("upstream") ? "upstream" : "downstream";
      assert(toxic?.type === "timeout" && toxic.stream === stream && toxic.toxicity === toxicity
        && JSON.stringify(toxic.attributes) === '{"timeout":0}', `${mapping.proxyName}/${name} changed`);
    }
  }
  return proxy;
}

function assertSnapshot(snapshot, mappings, impaired, enabled = true, toxicity = 0, toxicCount = 2) {
  assert(Object.keys(snapshot).length === 4, "F5 requires four owned proxies");
  for (const mapping of mappings) {
    exactProxy(snapshot, mapping, mapping.proxyName === impaired.proxyName ? enabled : true,
      mapping.proxyName === impaired.proxyName ? toxicity : 0,
      mapping.proxyName === impaired.proxyName ? toxicCount : 0);
  }
}

async function rollback(controller, impaired) {
  const settled = await Promise.allSettled(TOXIC_NAMES.map((name) =>
    controller.patchToxic(impaired.proxyName, name, { toxicity: 0 })));
  const rejected = settled.filter((entry) => entry.status === "rejected");
  if (rejected.length) throw new AggregateError(rejected.map((entry) => entry.reason), "F5 activation rollback failed");
  return settled;
}

async function createTcpProxyBlackoutTransport({ transport, simPort, runDir, signal }) {
  validateTransport(transport);
  const controller = new ManagedToxiproxy({ workDir: runDir });
  const summaryFile = path.join(runDir, "f5-proxy-transport.json");
  const scheduleFile = path.join(runDir, "f5-blackout-schedule.json");
  let stage = "NEW";
  let mappings = [];
  let authorityPid = null;
  let cut = null;
  let finalized = null;
  let cleanup = null;
  let cutPromise = null;
  const claimBoundary = "Configured userspace timeout-zero stream discard, one-listener disable/re-enable fence, and observed browser/gameplay outcomes only; not packet loss, synchronous RST, live byte-counter, WAN, WSS, TLS, congestion, retransmission, or hosted evidence";
  const persist = (extra = {}) => write(summaryFile, { stage, tool: controller.describe(), oneAuthority: { simPid: authorityPid, simPort },
    mappings, cut, finalized, cleanup, firstFailure: controller.firstFailure, claimBoundary, ...extra });

  try {
    await controller.start();
    stage = "DAEMON_READY";
    for (let index = 0; index < 4; index += 1) {
      const proxyName = `f5_pilot_${index}`;
      const proxy = await controller.createProxy({ name: proxyName, upstream: `127.0.0.1:${simPort}` });
      const mapping = { pilotSlot: `pilot-${index}`, proxyName, listen: proxy.listen,
        listenerPort: proxy.listener.port, upstream: proxy.upstream, simPort };
      mappings.push(mapping);
      if (index === 3) for (const toxic of transport.toxics) await controller.createToxic(proxyName, toxic);
    }
    const impaired = mappings[3];
    const before = await controller.snapshot();
    assertSnapshot(before, mappings, impaired);
    write(path.join(runDir, "toxiproxy-config-before.json"), before);
    stage = "LISTENERS_READY";
    persist();
  } catch (error) {
    controller.captureFirstFailure(error, { stage });
    throw error;
  }

  async function markAdmitted({ simPid }) {
    assert(stage === "LISTENERS_READY", `F5 admission required LISTENERS_READY, got ${stage}`);
    authorityPid = simPid;
    stage = "ADMITTED";
    persist();
  }

  function beginCut({ startWallMs, pilot, journeyState, sampleAuthority, sendDuringBlackout }) {
    assert(!cutPromise, "F5 cut may run once");
    const impaired = mappings[3];
    cutPromise = (async () => {
      await delay(Math.max(0, startWallMs + transport.activationAtMs - Date.now()), signal);
      const beforeState = await journeyState(pilot);
      const beforeAuthority = await sampleAuthority();
      const before = { wallMs: Date.now(), monoMs: performance.now(), state: beforeState,
        authority: beforeAuthority, cdp: { ...pilot.cdp }, lifecycleCount: pilot.cdp.lifecycle.length,
        socketHash: pilot.cdp.lifecycle.filter((entry) => entry.event === "handshake-response" && entry.status === 101).at(-1)?.requestIdHash };
      stage = "ACTIVATING";
      const dispatches = TOXIC_NAMES.map((toxicName) => ({ toxicName, requestWallMs: Date.now(), requestMonoMs: performance.now(),
        promise: controller.patchToxic(impaired.proxyName, toxicName, { toxicity: 1 }) }));
      const settled = await Promise.allSettled(dispatches.map((entry) => entry.promise));
      const outcomes = settled.map((entry, index) => entry.status === "fulfilled"
        ? { toxicName: dispatches[index].toxicName, status: "fulfilled", responseWallMs: Date.now(), toxic: entry.value }
        : { toxicName: dispatches[index].toxicName, status: "rejected", error: String(entry.reason?.message || entry.reason).slice(0, 500) });
      if (settled.some((entry) => entry.status === "rejected")) {
        const activationError = new AggregateError(settled.filter((entry) => entry.status === "rejected").map((entry) => entry.reason),
          "F5 partial activation");
        controller.captureFirstFailure(activationError, { stage, outcomes });
        await rollback(controller, impaired);
        const inactive = await controller.snapshot();
        assertSnapshot(inactive, mappings, impaired);
        cut = { activation: { outcomes }, rollback: { verifiedInactive: true } };
        stage = "ROLLED_BACK"; persist();
        throw activationError;
      }
      const active = await controller.snapshot();
      assertSnapshot(active, mappings, impaired, true, 1);
      write(path.join(runDir, "toxiproxy-config-cut.json"), active);
      const verifiedMonoMs = performance.now();
      const verifiedWallMs = Date.now();
      await delay(transport.activationGuardMs, signal);
      const guarded = await controller.snapshot();
      assertSnapshot(guarded, mappings, impaired, true, 1);
      const guardedWallMs = Date.now();
      const guardedState = await journeyState(pilot);
      const guardedAuthority = await sampleAuthority();
      const guardedCdp = { ...pilot.cdp };
      stage = "BLACKHOLE_VERIFIED";
      // Leave enough Layer-A time for the client's serialized send queue to attempt and discard the action.
      await delay(Math.max(0, verifiedWallMs + transport.minimumVerifiedDropMs
        - transport.namedActionLeadMs - Date.now()), signal);
      const namedAction = await sendDuringBlackout();
      const pendingState = await journeyState(pilot);
      assert(pendingState.transport.pendingActionCount > guardedState.transport.pendingActionCount,
        "F5 during-blackout reliable action was not pending before disable");
      await delay(Math.max(0, verifiedWallMs + transport.minimumVerifiedDropMs - Date.now()), signal);
      const finalActive = await controller.snapshot();
      assertSnapshot(finalActive, mappings, impaired, true, 1);
      const preDisableState = await journeyState(pilot);
      const preDisableAuthority = await sampleAuthority();
      const guardedInboundFrameDelta = pilot.cdp.inboundFrames - guardedCdp.inboundFrames;
      const finalActiveWallMs = Date.now();
      assert(finalActiveWallMs - verifiedWallMs >= transport.minimumVerifiedDropMs,
        "F5 verified physical drop was shorter than 25000ms");
      assert(guardedInboundFrameDelta === 0,
        "F5 pilot received a CDP WebSocket frame during guarded endpoint silence");
      assert(preDisableState.snapshotId === guardedState.snapshotId
        && preDisableState.transport.lastInputAck === guardedState.transport.lastInputAck,
      "F5 pilot gameplay cursors advanced during guarded endpoint silence");

      pilot.rotateSchedulerOnNextSocket = true;
      const disableDispatchWallMs = Date.now();
      const disableDispatchMonoMs = performance.now();
      await controller.updateProxyEnabled(impaired.proxyName, false);
      const disabled = await controller.snapshot();
      assertSnapshot(disabled, mappings, impaired, false, 1);
      write(path.join(runDir, "toxiproxy-config-disabled.json"), disabled);
      await Promise.all(TOXIC_NAMES.map((name) => controller.removeToxic(impaired.proxyName, name)));
      const pristine = await controller.snapshot();
      assertSnapshot(pristine, mappings, impaired, false, 0, 0);
      await controller.updateProxyEnabled(impaired.proxyName, true);
      const restored = await controller.snapshot();
      assertSnapshot(restored, mappings, impaired, true, 0, 0);
      write(path.join(runDir, "toxiproxy-config-restored.json"), restored);
      const reenabledWallMs = Date.now();
      const reenabledMonoMs = performance.now();
      const deadline = reenabledWallMs + transport.recoveryBudgetMs;
      let recovered = null;
      while (Date.now() < deadline) {
        recovered = await journeyState(pilot);
        if (recovered?.transport?.streamState === "open" && recovered.connectionEpoch > beforeState.connectionEpoch) break;
        await delay(50, signal);
      }
      assert(recovered?.transport?.streamState === "open" && recovered.connectionEpoch > beforeState.connectionEpoch,
        "F5 recovery exceeded 8s or did not rotate authority epoch");
      await pilot.reconnectRotationPromise;
      const lifecycle = pilot.cdp.lifecycle.slice(before.lifecycleCount);
      const oldTerminal = lifecycle.find((entry) => ["closed", "frame-error"].includes(entry.event)
        && entry.requestIdHash === before.socketHash && entry.atWallMs >= disableDispatchWallMs);
      assert(oldTerminal, "F5 old socket lacked an ordered close/error after disable dispatch");
      const distinct101 = lifecycle.find((entry) => entry.event === "handshake-response" && entry.status === 101
        && entry.requestIdHash !== before.socketHash);
      assert(distinct101 && distinct101.atWallMs >= reenabledWallMs,
        "F5 distinct successful handshake preceded verified re-enable or was absent");
      const newHash = distinct101.requestIdHash;
      const createdIndex = lifecycle.findIndex((entry) => entry.event === "created" && entry.requestIdHash === newHash);
      const requestIndex = lifecycle.findIndex((entry) => entry.event === "handshake-request" && entry.requestIdHash === newHash);
      const responseIndex = lifecycle.indexOf(distinct101);
      assert(createdIndex >= 0 && requestIndex > createdIndex && responseIndex > requestIndex,
      "F5 new socket lacked created/request/101 ordering evidence");
      const exclusionClock = await pilot.page.evaluate(() => ({ wallMs: Date.now(), monoMs: performance.now() }));
      cut = {
        activation: { scheduledWallMs: startWallMs + transport.activationAtMs, dispatches: dispatches.map(({ promise, ...entry }) => entry),
          outcomes, verifiedWallMs, verifiedMonoMs, guardMs: transport.activationGuardMs, guardedWallMs },
        endpointSilence: { startWallMs: verifiedWallMs + transport.activationGuardMs, endWallMs: disableDispatchWallMs,
          cdpInboundFrameDelta: guardedInboundFrameDelta,
          snapshotDelta: preDisableState.snapshotId - guardedState.snapshotId,
          inputAckDelta: preDisableState.transport.lastInputAck - guardedState.transport.lastInputAck,
          authorityBefore: guardedAuthority, authorityAfter: preDisableAuthority,
          note: "authority snapshots are oracle evidence; finalized proxy counters are forensic only" },
        namedDuringBlackoutAction: { label: "f5-during-blackout-reliable", ...namedAction,
          pendingBeforeDisable: true, pendingActionCount: pendingState.transport.pendingActionCount },
        fence: { finalActiveWallMs, disableDispatchWallMs, disableDispatchMonoMs,
          verifiedReenableWallMs: reenabledWallMs, verifiedReenableMonoMs: reenabledMonoMs,
          oldSocketHash: before.socketHash, newSocketHash: newHash, lifecycle, recoveryObservedWallMs: Date.now(),
          recoveryMs: Date.now() - reenabledWallMs, oldEpoch: beforeState.connectionEpoch,
          newEpoch: recovered.connectionEpoch },
        exclusionWindow: { pilotSlot: transport.pilotSlot, startWallMs: dispatches[0].requestWallMs,
          endWallMs: exclusionClock.wallMs, startMonoMs: exclusionClock.monoMs + dispatches[0].requestWallMs - exclusionClock.wallMs,
          endMonoMs: exclusionClock.monoMs, reason: "F5 activation through distinct-socket authority recovery" },
        stableAuthority: { admission: beforeAuthority, recovered: await sampleAuthority() },
      };
      write(scheduleFile, cut);
      write(path.join(runDir, "f5-cdp-lifecycle.json"), cut.fence);
      stage = "RECOVERED";
      persist();
      return cut;
    })().catch(async (error) => {
      controller.captureFirstFailure(error, { stage });
      try {
        await controller.updateProxyEnabled(impaired.proxyName, false).catch(() => null);
        for (const name of TOXIC_NAMES) await controller.removeToxic(impaired.proxyName, name).catch(() => null);
      } finally { stage = "FAILED"; persist(); }
      throw error;
    });
    return cutPromise;
  }

  async function finalizeAfterBrowserClose() {
    const rawMetrics = await controller.request("GET", "/metrics", undefined, { expectJson: false });
    fs.writeFileSync(path.join(runDir, "toxiproxy-metrics-final.raw.log"), rawMetrics);
    finalized = { sampledAfterBrowserClose: true, sampledBeforeProxyCleanup: true,
      rawBytes: Buffer.byteLength(rawMetrics), forensicOnly: true };
    const final = await controller.snapshot();
    write(path.join(runDir, "toxiproxy-config-final.json"), final);
    persist();
    return finalized;
  }

  async function stop() {
    await cutPromise?.catch(() => null);
    cleanup = await controller.cleanup();
    stage = "STOPPED";
    persist();
    return cleanup;
  }

  return { mappings, markAdmitted, beginCut, finalizeAfterBrowserClose, stop,
    get cut() { return cut; }, get stage() { return stage; }, get finalized() { return finalized; },
    tool: controller.describe(), claimBoundary };
}

async function selfTestActivationSettlement() {
  const state = new Map(TOXIC_NAMES.map((name) => [name, 0]));
  let delayedSettled = false;
  const requests = TOXIC_NAMES.map(async (name) => {
    if (name === "upstream_timeout") throw new Error("injected F5 activation failure");
    await delay(20); delayedSettled = true; state.set(name, 1); return name;
  });
  const settled = await Promise.allSettled(requests);
  assert(delayedSettled && settled.some((entry) => entry.status === "rejected"), "F5 self-test did not settle all activation requests");
  for (const name of TOXIC_NAMES) state.set(name, 0);
  assert([...state.values()].every((value) => value === 0), "F5 self-test rollback was not inactive");
  return { requestsSettled: settled.length, rejected: 1, delayedSettled, rollbackInactive: true };
}

module.exports = { createTcpProxyBlackoutTransport, validateTransport, selfTestActivationSettlement };
