"use strict";

const fs = require("fs");
const path = require("path");

const RULE_METHOD = "Network.emulateNetworkConditionsByRule";
const STATE_METHOD = "Network.overrideNetworkState";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sleep(ms, signal) {
  if (signal?.aborted) return Promise.reject(signal.reason || new Error("aborted"));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(done, Math.max(0, ms));
    function done() { signal?.removeEventListener("abort", aborted); resolve(); }
    function aborted() {
      clearTimeout(timer);
      signal?.removeEventListener("abort", aborted);
      reject(signal.reason || new Error("aborted"));
    }
    signal?.addEventListener("abort", aborted, { once: true });
  });
}

function validateTransport(transport, pilots) {
  assert(transport?.kind === "cdp-websocket-smoke", "T0 requires the CDP WebSocket smoke transport kind");
  const profile = transport.profile;
  assert(Number.isFinite(profile?.latencyMs) && profile.latencyMs >= 0, "T0 latency must be non-negative");
  assert(Number.isSafeInteger(profile?.uploadBytesPerSecond) && profile.uploadBytesPerSecond > 0,
    "T0 upload rate must be a positive integer");
  assert(Number.isSafeInteger(profile?.downloadBytesPerSecond) && profile.downloadBytesPerSecond > 0,
    "T0 download rate must be a positive integer");
  const offline = transport.offlineWindow;
  assert(pilots.some((pilot) => pilot.slot === offline?.pilotSlot), "T0 offline pilot is absent");
  assert(Number.isFinite(offline?.startMs) && Number.isFinite(offline?.endMs)
    && offline.startMs > 0 && offline.endMs > offline.startMs, "T0 offline window is invalid");
  assert(Number.isFinite(offline?.guardMs) && offline.guardMs >= 250
    && offline.startMs + offline.guardMs < offline.endMs, "T0 offline guard is invalid");
  assert(Number.isFinite(offline?.firstProgressBudgetMs) && offline.firstProgressBudgetMs > 0,
    "T0 first-progress budget is invalid");
  assert(offline?.inputAckTimeoutMs === 5000 && Number.isFinite(offline?.timeoutMatchToleranceMs)
    && offline.timeoutMatchToleranceMs > 0 && offline.timeoutMatchToleranceMs <= offline.guardMs,
  "T0 input timeout causal-match contract is invalid");
  assert(Number.isFinite(offline?.settleMs) && offline.settleMs >= offline.firstProgressBudgetMs,
    "T0 settle window is invalid");
  assert(Number.isFinite(offline?.finalDrainMs) && offline.finalDrainMs > 0,
    "T0 final drain is invalid");
  const rejectionBudget = transport.releaseRejectionBudget;
  assert(Number.isSafeInteger(rejectionBudget?.maximumTotal) && rejectionBudget.maximumTotal >= 0
    && Object.values(rejectionBudget.classes || {}).every((value) => Number.isSafeInteger(value) && value >= 0),
  "T0 release-rejection budget is invalid");
}

function ruleParams(transport, offline = false) {
  return {
    matchedNetworkConditions: [{
      urlPattern: "",
      latency: transport.profile.latencyMs,
      downloadThroughput: transport.profile.downloadBytesPerSecond,
      uploadThroughput: transport.profile.uploadBytesPerSecond,
      offline,
    }],
  };
}

function stateParams(transport, offline = false) {
  return {
    offline,
    latency: transport.profile.latencyMs,
    downloadThroughput: transport.profile.downloadBytesPerSecond,
    uploadThroughput: transport.profile.uploadBytesPerSecond,
  };
}

const CLEAR_RULES = Object.freeze({ matchedNetworkConditions: [] });
const RESTORED_STATE = Object.freeze({
  offline: false,
  latency: 0,
  downloadThroughput: -1,
  uploadThroughput: -1,
});

function publicState(state) {
  return {
    connectionEpoch: state?.connectionEpoch ?? null,
    snapshotId: state?.snapshotId ?? null,
    activeTransport: state?.transport?.activeTransport ?? null,
    streamState: state?.transport?.streamState ?? null,
    reconnectCount: state?.transport?.reconnectCount ?? null,
    lastInputAck: state?.transport?.lastInputAck ?? null,
    pendingInputCount: state?.transport?.pendingInputCount ?? null,
    pendingActionCount: state?.transport?.pendingActionCount ?? null,
  };
}

function cdpSnapshot(pilot) {
  return {
    inboundBytes: pilot.cdp.inboundBytes,
    outboundBytes: pilot.cdp.outboundBytes,
    inboundFrames: pilot.cdp.inboundFrames,
    outboundFrames: pilot.cdp.outboundFrames,
    lifecycleCount: pilot.cdp.lifecycle.length,
  };
}

function createCdpBrowserTransport({ pilots, transport, startWallMs, runDir, journeyState, signal }) {
  validateTransport(transport, pilots);
  const commandFile = path.join(runDir, "t0-cdp-commands.jsonl");
  const summaryFile = path.join(runDir, "t0-cdp-transport.json");
  fs.writeFileSync(commandFile, "", { flag: "wx" });
  const controller = new AbortController();
  const runSignal = controller.signal;
  const onParentAbort = () => controller.abort(signal.reason || new Error("aborted"));
  signal?.addEventListener("abort", onParentAbort, { once: true });
  let restored = false;
  let restorationComplete = false;
  let result = null;
  let browserVersion = null;

  function append(value) { fs.appendFileSync(commandFile, `${JSON.stringify(value)}\n`); }
  function persist(stage, extra = {}) {
    fs.writeFileSync(summaryFile, `${JSON.stringify({ stage,
      methods: { shaping: RULE_METHOD, navigatorState: STATE_METHOD },
      claimBoundary: "CDP browser WebSocket shaping/offline smoke only; it does not claim CDP caused an observed socket close/reconnect and is not TCP loss, netem, WAN, TLS, congestion, retransmission, or receive-window evidence",
      browserVersion, configuredRule: ruleParams(transport), configuredState: stateParams(transport),
      offlineWindow: transport.offlineWindow, result, ...extra }, null, 2)}\n`);
  }

  async function command(pilot, method, phase, params) {
    const requestedWallMs = Date.now();
    const pageMonoBefore = await pilot.page.evaluate(() => performance.now());
    let response = null;
    let failure = null;
    try {
      response = await pilot.page.session.send(method, params);
      return { pilotSlot: pilot.slot, method, phase, requestedWallMs, completedWallMs: Date.now(),
        pageMonoBefore, pageMonoAfter: await pilot.page.evaluate(() => performance.now()), params, response };
    } catch (error) {
      failure = error.message;
      throw error;
    } finally {
      append({ event: "cdp-command", pilotSlot: pilot.slot, method, phase, requestedWallMs,
        completedWallMs: Date.now(), pageMonoBefore, params, response, failure });
    }
  }

  async function clearPilot(pilot, phase) {
    const shaping = await command(pilot, RULE_METHOD, phase, CLEAR_RULES);
    assert(Array.isArray(shaping.response?.ruleIds) && shaping.response.ruleIds.length === 0,
      `${pilot.slot} retained CDP shaping rules`);
    const navigatorState = await command(pilot, STATE_METHOD, phase, RESTORED_STATE);
    const navigator = await navigatorEvidence(pilot);
    assert(navigator.onLine === true, `${pilot.slot} remained navigator-offline after cleanup`);
    return { pilotSlot: pilot.slot, shaping, navigatorState, navigator };
  }

  async function apply(pilot, phase, offline) {
    let shaping = null;
    try {
      shaping = await command(pilot, RULE_METHOD, phase, ruleParams(transport, offline));
      assert(Array.isArray(shaping.response?.ruleIds) && shaping.response.ruleIds.length === 1,
        `${pilot.slot} ${phase} did not return one CDP shaping rule ID`);
      const navigatorState = await command(pilot, STATE_METHOD, phase, stateParams(transport, offline));
      return { shaping, navigatorState };
    } catch (error) {
      if (shaping) {
        try { await clearPilot(pilot, `${phase}-rollback`); }
        catch (rollbackError) {
          throw new AggregateError([error, rollbackError], `${pilot.slot} ${phase} failed and rollback failed`);
        }
      }
      throw error;
    }
  }

  async function navigatorEvidence(pilot) {
    return pilot.page.evaluate(() => ({
      onLine: navigator.onLine,
      events: (window.__LBH_T0_NETWORK_EVENTS__ || []).slice(),
      nowMonoMs: performance.now(),
    }));
  }

  async function run() {
    browserVersion = await pilots[0].page.session.send("Browser.getVersion");
    for (const pilot of pilots) {
      await pilot.page.evaluate(() => {
        window.__LBH_T0_NETWORK_EVENTS__ = [];
        window.addEventListener("online", () => window.__LBH_T0_NETWORK_EVENTS__.push({
          type: "online", atWallMs: Date.now(), atMonoMs: performance.now(), onLine: navigator.onLine,
        }));
        window.addEventListener("offline", () => window.__LBH_T0_NETWORK_EVENTS__.push({
          type: "offline", atWallMs: Date.now(), atMonoMs: performance.now(), onLine: navigator.onLine,
        }));
      });
    }
    await sleep(startWallMs - Date.now(), runSignal);
    const throttled = await Promise.all(pilots.map((pilot) => apply(pilot, "throttled-online", false)));
    const shapeTimes = throttled.map((entry) => entry.shaping.requestedWallMs);
    const profileSkewMs = Math.max(...shapeTimes) - Math.min(...shapeTimes);
    persist("throttled", { profileSkewMs });

    const impairedPilot = pilots.find((pilot) => pilot.slot === transport.offlineWindow.pilotSlot);
    const offlineStartWallMs = startWallMs + transport.offlineWindow.startMs;
    const offlineEndWallMs = startWallMs + transport.offlineWindow.endMs;
    await sleep(offlineStartWallMs - Date.now(), runSignal);
    const before = publicState(await journeyState(impairedPilot));
    const cdpBefore = cdpSnapshot(impairedPilot);
    const lifecycleIndexBefore = impairedPilot.cdp.lifecycle.length;
    const privacyFrameCountBefore = impairedPilot.privacyFrames.length;
    const offlineCommands = await apply(impairedPilot, "offline", true);
    impairedPilot.rotateSchedulerOnNextSocket = true;
    let offlineNavigator = null;
    const navigatorDeadline = Date.now() + 1000;
    while (Date.now() <= navigatorDeadline) {
      offlineNavigator = await navigatorEvidence(impairedPilot);
      if (offlineNavigator.onLine === false
        && offlineNavigator.events.some((entry) => entry.type === "offline" && entry.onLine === false)) break;
      await sleep(20, runSignal);
    }
    assert(offlineNavigator?.onLine === false, "T0 did not expose navigator.onLine=false");
    assert(offlineNavigator.events.some((entry) => entry.type === "offline" && entry.onLine === false),
      "T0 did not dispatch the browser offline transition");
    await sleep(transport.offlineWindow.guardMs, runSignal);
    const guarded = publicState(await journeyState(impairedPilot));
    const cdpGuarded = cdpSnapshot(impairedPilot);
    await sleep(offlineEndWallMs - Date.now(), runSignal);
    const during = publicState(await journeyState(impairedPilot));
    const cdpDuring = cdpSnapshot(impairedPilot);
    assert(cdpDuring.inboundFrames === cdpGuarded.inboundFrames,
      `T0 received ${cdpDuring.inboundFrames - cdpGuarded.inboundFrames} CDP WebSocket frames after its offline guard`);
    assert(during.snapshotId === guarded.snapshotId && during.lastInputAck === guarded.lastInputAck,
      "T0 application delivery progressed during the guarded offline window");

    const onlineCommands = await apply(impairedPilot, "throttled-online-restored", false);
    let onlineNavigator = null;
    const onlineDeadline = Date.now() + 1000;
    while (Date.now() <= onlineDeadline) {
      onlineNavigator = await navigatorEvidence(impairedPilot);
      if (onlineNavigator.onLine === true
        && onlineNavigator.events.some((entry) => entry.type === "online" && entry.onLine === true)) break;
      await sleep(20, runSignal);
    }
    assert(onlineNavigator?.onLine === true, "T0 did not restore navigator.onLine=true");
    assert(onlineNavigator.events.some((entry) => entry.type === "online" && entry.onLine === true),
      "T0 did not dispatch the browser online transition");
    const privacyFrameCountAtOnline = impairedPilot.privacyFrames.length;

    const firstProgressDeadline = onlineCommands.navigatorState.completedWallMs
      + transport.offlineWindow.firstProgressBudgetMs;
    const settleDeadline = onlineCommands.navigatorState.completedWallMs + transport.offlineWindow.settleMs;
    let firstProgress = null;
    let settledState = null;
    let schedulerRotated = false;
    while (Date.now() <= settleDeadline) {
      const state = publicState(await journeyState(impairedPilot));
      if (!schedulerRotated && state.connectionEpoch > before.connectionEpoch) {
        if (impairedPilot.reconnectRotationPromise) await impairedPilot.reconnectRotationPromise;
        else await impairedPilot.page.evaluate(() => window.__LBH_FRAME_IMPAIRMENT__.rotateEpoch());
        schedulerRotated = true;
      }
      if (state.activeTransport === "stream" && state.streamState === "open"
        && state.connectionEpoch >= before.connectionEpoch
        && state.reconnectCount >= before.reconnectCount
        && state.snapshotId > before.snapshotId
        && impairedPilot.cdp.inboundFrames > cdpGuarded.inboundFrames) {
        if (!firstProgress) firstProgress = { observedWallMs: Date.now(),
          recoveryMs: Date.now() - onlineCommands.navigatorState.completedWallMs, state };
        settledState = state;
      }
      await sleep(20, runSignal);
    }
    const finalState = publicState(await journeyState(impairedPilot));
    impairedPilot.rotateSchedulerOnNextSocket = false;
    assert(firstProgress && firstProgress.observedWallMs <= firstProgressDeadline,
      `T0 did not make first progress within ${transport.offlineWindow.firstProgressBudgetMs}ms`);
    assert(settledState && finalState.activeTransport === "stream" && finalState.streamState === "open"
      && finalState.snapshotId > before.snapshotId && finalState.lastInputAck > before.lastInputAck,
    `T0 did not finish its ${transport.offlineWindow.settleMs}ms settle window with resumed delivery`);
    const settled = { observedWallMs: Date.now(), state: finalState };
    assert(settled.state.reconnectCount <= before.reconnectCount + 1,
      "T0 exceeded the single permitted incidental reconnect");
    const immediateSocketOutcome = firstProgress.state.connectionEpoch === before.connectionEpoch
      && firstProgress.state.reconnectCount === before.reconnectCount ? "same-socket-resume" : "new-socket-recovery";
    const finalConnectionOutcome = settled.state.connectionEpoch === before.connectionEpoch
      && settled.state.reconnectCount === before.reconnectCount ? "same-socket-resume" : "new-socket-recovery";
    const lifecycle = impairedPilot.cdp.lifecycle.slice(lifecycleIndexBefore);
    if (finalConnectionOutcome === "same-socket-resume") {
      assert(!lifecycle.some((entry) => entry.event === "closed" || entry.event === "created"),
        "T0 same-socket classification contradicted CDP lifecycle evidence");
    } else {
      const closeIndex = lifecycle.findIndex((entry) => entry.event === "closed");
      const closed = lifecycle[closeIndex];
      const createdIndex = lifecycle.findIndex((entry, index) => index > closeIndex
        && entry.event === "created" && entry.requestIdHash !== closed?.requestIdHash);
      const created = lifecycle[createdIndex];
      const requestIndex = lifecycle.findIndex((entry, index) => index > createdIndex
        && entry.event === "handshake-request" && entry.requestIdHash === created?.requestIdHash);
      const responseIndex = lifecycle.findIndex((entry, index) => index > requestIndex
        && entry.event === "handshake-response" && entry.requestIdHash === created?.requestIdHash
        && entry.status === 101);
      assert(closeIndex >= 0 && createdIndex > closeIndex && requestIndex > createdIndex
        && responseIndex > requestIndex,
      "T0 new-socket classification lacked ordered, hash-correlated CDP lifecycle evidence");
    }
    result = {
      profileSkewMs,
      before,
      guarded,
      during,
      firstProgress,
      settled,
      immediateSocketOutcome,
      finalConnectionOutcome,
      schedulerRotated,
      cdp: { before: cdpBefore, guarded: cdpGuarded, during: cdpDuring,
        afterRecovery: cdpSnapshot(impairedPilot), lifecycle },
      navigator: { offline: offlineNavigator, online: onlineNavigator },
      commands: { throttled, offline: offlineCommands, online: onlineCommands },
      gap: {
        configuredMs: transport.offlineWindow.endMs - transport.offlineWindow.startMs,
        actualMs: onlineCommands.shaping.requestedWallMs - offlineCommands.shaping.requestedWallMs,
        guardMs: transport.offlineWindow.guardMs,
        edgeDeltas: {
          inboundFrames: cdpGuarded.inboundFrames - cdpBefore.inboundFrames,
          snapshot: guarded.snapshotId - before.snapshotId,
          inputAck: guarded.lastInputAck - before.lastInputAck,
        },
        guardedDeltas: {
          inboundFrames: cdpDuring.inboundFrames - cdpGuarded.inboundFrames,
          snapshot: during.snapshotId - guarded.snapshotId,
          inputAck: during.lastInputAck - guarded.lastInputAck,
        },
        firstProgressMs: firstProgress.recoveryMs,
      },
      privacyFrameCountBefore,
      privacyFrameCountAtOnline,
      steadyStateExclusionWindow: {
        pilotSlot: impairedPilot.slot,
        reason: "CDP offline stall and measured queue-drain recovery",
        startMonoMs: offlineCommands.shaping.pageMonoBefore,
        endMonoMs: offlineCommands.shaping.pageMonoBefore
          + (settled.observedWallMs - offlineCommands.shaping.requestedWallMs),
        startWallMs: offlineCommands.shaping.requestedWallMs,
        endWallMs: settled.observedWallMs,
      },
    };
    persist("delivery-resumed");
    return result;
  }

  async function restore() {
    if (restored) return;
    restored = true;
    const outcomes = [];
    for (const pilot of pilots) {
      try {
        outcomes.push(await clearPilot(pilot, "unrestricted-finally"));
      } catch (error) {
        outcomes.push({ pilotSlot: pilot.slot, failure: error.message });
      }
    }
    restorationComplete = outcomes.length === pilots.length && outcomes.every((entry) => !entry.failure);
    persist("restored", { restoration: { complete: restorationComplete, outcomes } });
    assert(restorationComplete, "T0 failed to clear every CDP rule and restore every navigator state");
  }

  persist("created");
  return {
    run,
    restore,
    cancel: () => controller.abort(new Error("T0 CDP transport cancelled")),
    get result() { return result; },
    get restorationComplete() { return restorationComplete; },
  };
}

if (require.main === module) {
  const transport = { kind: "cdp-websocket-smoke",
    profile: { latencyMs: 35, uploadBytesPerSecond: 65536, downloadBytesPerSecond: 327680 },
    offlineWindow: { pilotSlot: "pilot-3", startMs: 25000, guardMs: 250,
      endMs: 30000, inputAckTimeoutMs: 5000, timeoutMatchToleranceMs: 250,
      firstProgressBudgetMs: 10000, settleMs: 15000, finalDrainMs: 6000 },
    releaseRejectionBudget: { maximumTotal: 8,
      classes: { ownerState: 6, "ack:input": 3, heartbeat: 1 } } };
  validateTransport(transport, [{ slot: "pilot-3" }]);
  assert(JSON.stringify(ruleParams(transport)) === JSON.stringify({
    matchedNetworkConditions: [{ urlPattern: "", latency: 35, downloadThroughput: 327680,
      uploadThroughput: 65536, offline: false }] }), "T0 rule compiler drifted");
  assert(!Object.prototype.hasOwnProperty.call(stateParams(transport), "connectionType"),
    "T0 must not inject a synthetic connection type");
  assert(CLEAR_RULES.matchedNetworkConditions.length === 0 && RESTORED_STATE.downloadThroughput === -1,
    "T0 cleanup profile drifted");
  process.stdout.write("CDP browser transport helper passed\n");
}

module.exports = { createCdpBrowserTransport, ruleParams, stateParams, CLEAR_RULES, RESTORED_STATE, validateTransport };
