#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { TestRunner, assert, startSimServer, stopSimServer } = require("./helpers.cjs");
const {
  MODE,
  createAuthoredCollapseTestLifecycle,
} = require("../scripts/authored-collapse-test-lifecycle.cjs");

const ENABLED_PORT = 8811;
const CAP_PORT = 8812;
const DEFAULT_PORT = 8813;
const REJECTED_PORT = 8814;
const GENERIC_PORT = 8815;
const FINAL_PORTAL_PORT = 8817;

async function fetchJson(port, pathname) {
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`);
  return { status: response.status, body: await response.json() };
}

async function postJson(port, pathname, body) {
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

async function getAuthorized(port, pathname, authority) {
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`, { headers: {
    "x-lbh-command-credential": authority.commandCredential,
    "x-lbh-player-id": authority.playerId,
    "x-lbh-run-id": authority.runId,
  } });
  return { status: response.status, body: await response.json() };
}

async function startHumanRun(port, clientId) {
  const start = await postJson(port, "/session/start", {
    mapId: "shallows", requesterId: clientId, requesterName: clientId,
  });
  const join = await postJson(port, "/join", {
    runId: start.body.session.runId, clientId, name: clientId, joinTicket: start.body.joinTicket,
  });
  assert(join.status === 200, `${clientId} must join`);
  return join.body.authority;
}

async function waitFor(port, predicate, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await fetchJson(port, "/health");
    if (predicate(last.body)) return last.body;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`health predicate timed out: ${JSON.stringify(last?.body)}`);
}

async function run() {
  const runner = new TestRunner("AuthoredCollapseTestLifecycle");

  await runner.run("strict startup authorization rejects malformed and unguarded opt-ins", async () => {
    for (const env of [
      { LBH_SIM_TEST_DISABLE_AUTHORED_COLLAPSE: "true" },
      { LBH_SIM_TEST_DISABLE_AUTHORED_COLLAPSE: "" },
      { LBH_SIM_TEST_DISABLE_AUTHORED_COLLAPSE: "1", NODE_ENV: "test" },
      { LBH_SIM_TEST_DISABLE_AUTHORED_COLLAPSE: "1", LBH_SOAK_DIAGNOSTICS: "1" },
    ]) {
      let rejected = false;
      try { createAuthoredCollapseTestLifecycle({ env, maxSimTime: 600 }); } catch { rejected = true; }
      assert(rejected, `expected startup configuration rejection for ${JSON.stringify(env)}`);
    }
    let startupRejected = false;
    try {
      await startSimServer(REJECTED_PORT, { keepAlive: true, env: {
        NODE_ENV: "test",
        LBH_SIM_TEST_DISABLE_AUTHORED_COLLAPSE: "1",
        LBH_SOAK_DIAGNOSTICS: "0",
      } });
    } catch (error) {
      startupRejected = /did not start cleanly|requires NODE_ENV=test and LBH_SOAK_DIAGNOSTICS=1/.test(error.message);
    }
    assert(startupRejected, "unguarded opt-in must fail the real sim startup path");
  });

  await runner.run("disabled mode preserves both authored collapse terminals and omits health", async () => {
    for (const value of [undefined, "0"]) {
      const env = value === undefined ? {} : { LBH_SIM_TEST_DISABLE_AUTHORED_COLLAPSE: value };
      const lifecycle = createAuthoredCollapseTestLifecycle({ env, maxSimTime: 600 });
      assert(lifecycle.suppress("collapse", 600) === false, "generic collapse must remain enabled by default");
      assert(lifecycle.suppress("inhibitor-final-portal-missed", 615) === false,
        "final-portal collapse must remain enabled by default");
      assert(lifecycle.health() === null, "disabled lifecycle health must be entirely absent");
    }
    await startSimServer(DEFAULT_PORT, { keepAlive: true, env: {
      LBH_SIM_TEST_DISABLE_AUTHORED_COLLAPSE: "0",
    } });
    try {
      const health = await fetchJson(DEFAULT_PORT, "/health");
      assert(!Object.prototype.hasOwnProperty.call(health.body, "authoredCollapseTest"),
        "default runtime health must omit the test lifecycle field entirely");
    } finally {
      await stopSimServer(DEFAULT_PORT).catch(() => null);
    }
  });

  await runner.run("enabled mode latches one bounded fact and reset clears it", async () => {
    const lifecycle = createAuthoredCollapseTestLifecycle({ env: {
      LBH_SIM_TEST_DISABLE_AUTHORED_COLLAPSE: "1",
      NODE_ENV: "test",
      LBH_SOAK_DIAGNOSTICS: "1",
    }, maxSimTime: 7200 });
    assert(lifecycle.health().count === 0, "fresh run must start unlatched");
    assert(lifecycle.suppress("collapse", 600.0667) === true, "enabled generic collapse must suppress terminal work");
    lifecycle.suppress("inhibitor-final-portal-missed", 615);
    assert(JSON.stringify(lifecycle.health()) === JSON.stringify({
      mode: MODE, count: 1, firstReason: "collapse", firstSimTime: 600.0667, maxSimTime: 7200,
    }), `expected first-only bounded fact, got ${JSON.stringify(lifecycle.health())}`);
    lifecycle.reset();
    assert(lifecycle.health().count === 0 && lifecycle.health().firstReason === null,
      "new run reset must clear the latch");
  });

  await runner.run("runtime wires both terminal paths through the guarded helper", async () => {
    const source = fs.readFileSync(path.join(__dirname, "../scripts/sim-runtime.cjs"), "utf8");
    assert(source.includes('authoredCollapseTestLifecycle.suppress("collapse", runtime.simTime)'),
      "generic authored collapse must use the lifecycle helper");
    assert(source.includes('authoredCollapseTestLifecycle.suppress("inhibitor-final-portal-missed", runtime.simTime)'),
      "final-portal-missed collapse must use the lifecycle helper");
  });

  await runner.run("generic authored collapse suppresses only terminal work after real predicates", async () => {
    await startSimServer(GENERIC_PORT, { keepAlive: true, env: {
      NODE_ENV: "test", LBH_SOAK_DIAGNOSTICS: "1", LBH_SIM_TEST_DISABLE_AUTHORED_COLLAPSE: "1",
      LBH_SIM_MAX_SIM_TIME: "7200",
    } });
    try {
      const authority = await startHumanRun(GENERIC_PORT, "generic-collapse-host");
      const setup = await postJson(GENERIC_PORT, "/debug/authored-collapse-test-state", {
        simTime: 61, exhaustPortalWaves: true, clearPortals: true,
      });
      assert(setup.status === 200 && setup.body.nextPortalWaveIndex === 5 && setup.body.portalCount === 0,
        "generic collapse test must establish its real terminal predicates");
      const latched = await waitFor(GENERIC_PORT, (body) => body.authoredCollapseTest?.count === 1);
      assert(latched.authoredCollapseTest.firstReason === "collapse", "generic predicate must latch the generic reason");
      assert(latched.session.status === "running", "generic seam must preserve the running infrastructure session");
      const tick = latched.tick;
      const snapshot = await getAuthorized(GENERIC_PORT, "/snapshot", authority);
      const own = snapshot.body.players?.find((player) => player.clientId === "generic-collapse-host");
      assert(own?.status === "alive", "generic seam must suppress player kill");
      assert(!snapshot.body.recentEvents?.some((event) => event.type === "player.died" || event.type === "session.ended"),
        "generic seam must not invent or emit terminal gameplay events");
      const progressed = await waitFor(GENERIC_PORT, (body) => body.tick > tick);
      assert(progressed.authoredCollapseTest.count === 1, "generic latch must remain bounded while ticks continue");
    } finally {
      await stopSimServer(GENERIC_PORT).catch(() => null);
    }
  });

  await runner.run("final inhibitor portal expiry keeps expiry side effects but suppresses terminal work", async () => {
    await startSimServer(FINAL_PORTAL_PORT, { keepAlive: true, env: {
      NODE_ENV: "test", LBH_SOAK_DIAGNOSTICS: "1", LBH_SIM_TEST_DISABLE_AUTHORED_COLLAPSE: "1",
      LBH_SIM_MAX_SIM_TIME: "7200",
    } });
    try {
      const authority = await startHumanRun(FINAL_PORTAL_PORT, "final-portal-host");
      const baseline = await fetchJson(FINAL_PORTAL_PORT, "/health");
      const portal = await postJson(FINAL_PORTAL_PORT, "/debug/portal-state", {
        portalId: "test-final-expiry", finalInhibitor: true, alive: true,
        spawnTime: Math.max(0, baseline.body.simTime - 1), lifespan: 0.1,
      });
      assert(portal.status === 200, "final inhibitor portal fixture must be accepted");
      const latched = await waitFor(FINAL_PORTAL_PORT, (body) => body.authoredCollapseTest?.count === 1);
      assert(latched.authoredCollapseTest.firstReason === "inhibitor-final-portal-missed",
        "final portal predicate must latch its exact reason");
      assert(latched.session.status === "running", "final portal seam must preserve infrastructure runtime");
      const snapshot = await getAuthorized(FINAL_PORTAL_PORT, "/snapshot", authority);
      const expired = snapshot.body.world?.portals?.find((entry) => entry.id === "test-final-expiry");
      const own = snapshot.body.players?.find((player) => player.clientId === "final-portal-host");
      assert(expired?.alive === false && snapshot.body.inhibitor?.finalPortalExpired === true,
        "normal portal expiry and inhibitor side effects must occur before suppression");
      assert(own?.status === "alive", "final portal seam must suppress player kill");
      assert(snapshot.body.recentEvents?.some((event) => event.type === "portal.expired"
        && event.payload?.portalId === "test-final-expiry"), "normal portal.expired event must remain");
      assert(!snapshot.body.recentEvents?.some((event) => event.type === "player.died" || event.type === "session.ended"),
        "final portal seam must emit no terminal gameplay event");
    } finally {
      await stopSimServer(FINAL_PORTAL_PORT).catch(() => null);
    }
  });

  await runner.run("authorized runtime exposes test-only health and resets it per session", async () => {
    await startSimServer(ENABLED_PORT, { keepAlive: true, env: {
      NODE_ENV: "test", LBH_SOAK_DIAGNOSTICS: "1",
      LBH_SIM_TEST_DISABLE_AUTHORED_COLLAPSE: "1",
      LBH_SIM_MAX_SIM_TIME: "7200",
    } });
    try {
      const initial = await fetchJson(ENABLED_PORT, "/health");
      assert(initial.body.authoredCollapseTest?.mode === MODE, "enabled runtime must expose bounded lifecycle mode");
      assert(initial.body.authoredCollapseTest?.count === 0, "initial run must have no suppression latch");
      const restarted = await postJson(ENABLED_PORT, "/session/start", { mapId: "shallows", requesterId: "reset-host" });
      assert(restarted.status === 200, "test session reset must succeed");
      const health = await fetchJson(ENABLED_PORT, "/health");
      assert(health.body.authoredCollapseTest?.count === 0, "session reset must clear the suppression latch");
    } finally {
      await stopSimServer(ENABLED_PORT).catch(() => null);
    }
  });

  await runner.run("MATCH_MAX_SIM_TIME remains terminal with the seam enabled", async () => {
    await startSimServer(CAP_PORT, { keepAlive: true, env: {
      NODE_ENV: "test", LBH_SOAK_DIAGNOSTICS: "1",
      LBH_SIM_TEST_DISABLE_AUTHORED_COLLAPSE: "1",
      LBH_SIM_MAX_SIM_TIME: "1",
      LBH_SIM_TERMINAL_GRACE_MS: "60000",
    } });
    try {
      const start = await postJson(CAP_PORT, "/session/start", {
        mapId: "shallows", requesterId: "cap-host", requesterName: "Cap Host",
      });
      const join = await postJson(CAP_PORT, "/join", {
        runId: start.body.session.runId, clientId: "cap-host", name: "Cap Host", joinTicket: start.body.joinTicket,
      });
      assert(join.status === 200, "cap test human must join");
      const ended = await waitFor(CAP_PORT, (body) => body.session?.status === "ended", 6000);
      assert(ended.session.endReason === "run-timeout", `expected run-timeout, got ${ended.session.endReason}`);
      assert(ended.authoredCollapseTest?.count === 0, "lifetime cap must bypass authored-collapse suppression");
      assert(ended.match?.maxSimTime === 1, "health must retain the real one-second lifetime cap");
    } finally {
      await stopSimServer(CAP_PORT).catch(() => null);
    }
  });

  process.exit(runner.summary() ? 0 : 1);
}

run().catch(async (error) => {
  console.error(error.stack || error.message);
  await stopSimServer(ENABLED_PORT).catch(() => null);
  await stopSimServer(CAP_PORT).catch(() => null);
  await stopSimServer(DEFAULT_PORT).catch(() => null);
  await stopSimServer(REJECTED_PORT).catch(() => null);
  await stopSimServer(GENERIC_PORT).catch(() => null);
  await stopSimServer(FINAL_PORTAL_PORT).catch(() => null);
  process.exit(1);
});
