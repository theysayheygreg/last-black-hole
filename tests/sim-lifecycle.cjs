/**
 * sim-lifecycle.js — sim process lifecycle checks.
 *
 * Verifies that empty sims auto-stop by default and stay alive only when
 * explicitly pinned with keep-alive mode.
 */
const { startSimServer, stopSimServer, TestRunner, assert } = require("./helpers.cjs");

const AUTO_PORT = 8796;
const KEEPALIVE_PORT = 8797;
const JOIN_PORT = 8798;
const FRESH_PORT = 8801;
const TERMINAL_PORT = 8802;
const MATCH_CAP_PORT = 8803;

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(port, route) {
  const response = await fetch(`http://127.0.0.1:${port}${route}`);
  const body = await response.json();
  return { status: response.status, body };
}

async function postJson(port, route, payload) {
  const response = await fetch(`http://127.0.0.1:${port}${route}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await response.json();
  return { status: response.status, body };
}

async function postAuthorized(port, route, payload, authority, commandSeq) {
  const response = await fetch(`http://127.0.0.1:${port}${route}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-lbh-command-credential": authority.commandCredential,
      "x-lbh-player-id": authority.playerId,
      "x-lbh-run-id": authority.runId,
    },
    body: JSON.stringify({
      ...payload,
      runId: authority.runId,
      playerId: authority.playerId,
      commandCredential: authority.commandCredential,
      commandSeq,
    }),
  });
  return { status: response.status, body: await response.json() };
}

async function waitForShutdown(port, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await fetch(`http://127.0.0.1:${port}/health`);
    } catch {
      return true;
    }
    await sleep(150);
  }
  return false;
}

async function waitForHealth(port, predicate, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    try {
      last = await fetchJson(port, "/health");
      if (predicate(last.body)) return last;
    } catch (err) {
      last = { error: err };
    }
    await sleep(100);
  }
  const detail = last?.body ? JSON.stringify({
    session: last.body.session,
    simTime: last.body.simTime,
    idleState: last.body.idleState,
  }) : String(last?.error?.message || "no health response");
  throw new Error(`Timed out waiting for health condition on ${port}: ${detail}`);
}

async function run() {
  const runner = new TestRunner("SimLifecycle");

  await runner.run("Empty sim auto-stops after the idle grace window", async () => {
    await startSimServer(AUTO_PORT, { idleShutdownMs: 1500 });
    const { status, body } = await fetchJson(AUTO_PORT, "/health");
    assert(status === 200, `Expected /health 200, got ${status}`);
    assert(body.process?.pid > 0, "Expected sim health to expose process pid");
    assert(Number.isSafeInteger(body.process?.sampledAtMs) && body.process.sampledAtMs > 0,
      "Expected sim health to timestamp its process CPU sample");
    assert(body.process?.cpuUsage?.user >= 0 && body.process?.cpuUsage?.system >= 0,
      "Expected sim health to expose cumulative process CPU usage");
    assert(body.process?.memory?.rss > 0, "Expected sim health to expose memory usage");
    assert(body.idleState?.idle === true, "Expected new sim with no humans to report idle");
    assert(body.idleState?.keepAlive === false, "Expected keepAlive false by default");
    const stopped = await waitForShutdown(AUTO_PORT, 5000);
    assert(stopped, "Expected empty sim to auto-stop");
  });

  await runner.run("Keep-alive mode prevents empty sim auto-stop", async () => {
    await startSimServer(KEEPALIVE_PORT, { idleShutdownMs: 1500, keepAlive: true });
    try {
      await sleep(2200);
      const { status, body } = await fetchJson(KEEPALIVE_PORT, "/health");
      assert(status === 200, `Expected /health 200, got ${status}`);
      assert(body.idleState?.idle === true, "Expected keep-alive sim to report idle");
      assert(body.idleState?.keepAlive === true, "Expected keepAlive true");
      assert(body.idleState?.shutdownInMs == null, "Expected keep-alive sim to skip auto-stop countdown");
    } finally {
      await stopSimServer(KEEPALIVE_PORT);
    }
  });

  await runner.run("Human join promotes active sessions out of idle tick rate", async () => {
    await startSimServer(JOIN_PORT, { idleShutdownMs: 5000, keepAlive: true });
    try {
      const start = await postJson(JOIN_PORT, "/session/start", {
        mapId: "shallows",
        requesterId: "loop-host",
        requesterName: "Loop Host",
      });
      assert(start.status === 200, `Expected /session/start 200, got ${start.status}`);

      const idle = await fetchJson(JOIN_PORT, "/health");
      assert(idle.body.idleState?.idle === true, "Expected session with only AI pilots to report idle");
      assert(idle.body.idleState?.currentLoopTickHz === idle.body.idleState?.idleTickHz,
        `Expected idle loop ${idle.body.idleState?.idleTickHz}, got ${idle.body.idleState?.currentLoopTickHz}`);

      const join = await postJson(JOIN_PORT, "/join", {
        runId: start.body.session.runId,
        clientId: "loop-host",
        name: "Loop Host",
        joinTicket: start.body.joinTicket,
      });
      assert(join.status === 200, `Expected /join 200, got ${join.status}`);

      const active = await fetchJson(JOIN_PORT, "/health");
      assert(active.body.idleState?.idle === false, "Expected human join to clear idle state");
      assert(active.body.idleState?.humanPlayerCount === 1,
        `Expected one human, got ${active.body.idleState?.humanPlayerCount}`);
      assert(active.body.idleState?.currentLoopTickHz > active.body.idleState?.idleTickHz,
        `Expected active loop above idle, got ${active.body.idleState?.currentLoopTickHz}`);
    } finally {
      await stopSimServer(JOIN_PORT);
    }
  });

  await runner.run("Harness sim startup replaces any previous process on that test port", async () => {
    await startSimServer(FRESH_PORT, { idleShutdownMs: 5000, keepAlive: true });
    try {
      const first = await fetchJson(FRESH_PORT, "/health");
      await sleep(150);
      await startSimServer(FRESH_PORT, { idleShutdownMs: 5000, keepAlive: true });
      const second = await fetchJson(FRESH_PORT, "/health");
      assert(first.body.process?.pid !== second.body.process?.pid,
        `Expected a fresh sim pid after restart, got ${first.body.process?.pid}`);
      assert(second.body.process?.uptimeSec < 5,
        `Expected fresh sim uptime, got ${second.body.process?.uptimeSec}s`);
    } finally {
      await stopSimServer(FRESH_PORT).catch(() => null);
    }
  });

  await runner.run("Terminal human players end the session instead of running forever", async () => {
    await startSimServer(TERMINAL_PORT, {
      idleShutdownMs: 5000,
      keepAlive: true,
      env: { LBH_SIM_TERMINAL_GRACE_MS: "60000" },
    });
    try {
      const start = await postJson(TERMINAL_PORT, "/session/start", {
        mapId: "shallows",
        requesterId: "terminal-host",
        requesterName: "Terminal Host",
      });
      assert(start.status === 200, `Expected /session/start 200, got ${start.status}`);

      const join = await postJson(TERMINAL_PORT, "/join", {
        runId: start.body.session.runId,
        clientId: "terminal-host",
        name: "Terminal Host",
        joinTicket: start.body.joinTicket,
      });
      assert(join.status === 200, `Expected /join 200, got ${join.status}`);

      const death = await postJson(TERMINAL_PORT, "/debug/player-state", {
        clientId: "terminal-host",
        status: "dead",
        cause: "test-terminal",
      });
      assert(death.status === 200, `Expected debug death 200, got ${death.status}`);

      const ended = await waitForHealth(TERMINAL_PORT, (body) => body.session?.status === "ended");
      assert(ended.body.session?.endReason === "terminal-players",
        `Expected terminal-players end reason, got ${ended.body.session?.endReason}`);
      assert(ended.body.idleState?.humanPlayerCount === 1,
        `Expected terminal human to remain visible, got ${ended.body.idleState?.humanPlayerCount}`);
      assert(ended.body.idleState?.activeHumanPlayerCount === 0,
        `Expected zero active humans, got ${ended.body.idleState?.activeHumanPlayerCount}`);
      assert(ended.body.idleState?.currentLoopTickHz === 0,
        `Expected stopped loop after terminal end, got ${ended.body.idleState?.currentLoopTickHz}`);

      const input = await postJson(TERMINAL_PORT, "/input", {
        clientId: "terminal-host",
        seq: 99,
        moveX: 1,
      });
      assert(input.status === 409, `Expected ended session input to reject with 409, got ${input.status}`);

      const leave = await postAuthorized(
        TERMINAL_PORT,
        "/leave",
        { clientId: "terminal-host" },
        join.body.authority,
        1
      );
      assert(leave.status === 200, `Expected leave after terminal session 200, got ${leave.status}`);
      assert(leave.body.ok === true, "Expected leave after terminal session to succeed");
      const afterLeave = await fetchJson(TERMINAL_PORT, "/health");
      assert(afterLeave.body.idleState?.humanPlayerCount === 0,
        `Expected leave to remove terminal human, got ${afterLeave.body.idleState?.humanPlayerCount}`);

      const restart = await postJson(TERMINAL_PORT, "/session/start", {
        mapId: "shallows",
        requesterId: "terminal-host",
        requesterName: "Terminal Host",
      });
      assert(restart.status === 200, `Expected restart after terminal session 200, got ${restart.status}`);
      const fresh = await fetchJson(TERMINAL_PORT, "/health");
      assert(fresh.body.session?.status === "running", `Expected fresh session running, got ${fresh.body.session?.status}`);
      assert(fresh.body.simTime < 0.5, `Expected fresh simTime reset, got ${fresh.body.simTime}`);
      assert(fresh.body.match?.wreckRepeatWaveCount === 0,
        `Expected wreck repeat count reset, got ${fresh.body.match?.wreckRepeatWaveCount}`);
    } finally {
      await stopSimServer(TERMINAL_PORT).catch(() => null);
    }
  });

  await runner.run("Match lifetime cap collapses active runs", async () => {
    await startSimServer(MATCH_CAP_PORT, {
      idleShutdownMs: 5000,
      keepAlive: true,
      env: {
        LBH_SIM_MAX_SIM_TIME: "1",
        LBH_SIM_TERMINAL_GRACE_MS: "60000",
      },
    });
    try {
      const start = await postJson(MATCH_CAP_PORT, "/session/start", {
        mapId: "shallows",
        requesterId: "cap-host",
        requesterName: "Cap Host",
      });
      assert(start.status === 200, `Expected /session/start 200, got ${start.status}`);
      const join = await postJson(MATCH_CAP_PORT, "/join", {
        runId: start.body.session.runId,
        clientId: "cap-host",
        name: "Cap Host",
        joinTicket: start.body.joinTicket,
      });
      assert(join.status === 200, `Expected /join 200, got ${join.status}`);

      const ended = await waitForHealth(MATCH_CAP_PORT, (body) => body.session?.status === "ended", 6000);
      assert(ended.body.session?.endReason === "run-timeout",
        `Expected run-timeout end reason, got ${ended.body.session?.endReason}`);
      assert(ended.body.simTime >= 1,
        `Expected simTime to reach cap, got ${ended.body.simTime}`);
      assert(ended.body.idleState?.activeHumanPlayerCount === 0,
        `Expected timeout to leave no active humans, got ${ended.body.idleState?.activeHumanPlayerCount}`);
      assert(ended.body.match?.maxSimTime === 1,
        `Expected health to expose maxSimTime 1, got ${ended.body.match?.maxSimTime}`);
    } finally {
      await stopSimServer(MATCH_CAP_PORT).catch(() => null);
    }
  });

  const allPassed = runner.summary();
  process.exit(allPassed ? 0 : 1);
}

run().catch(async (err) => {
  console.error("SimLifecycle test fatal error:", err.message);
  try { await stopSimServer(AUTO_PORT); } catch {}
  try { await stopSimServer(KEEPALIVE_PORT); } catch {}
  try { await stopSimServer(JOIN_PORT); } catch {}
  try { await stopSimServer(FRESH_PORT); } catch {}
  try { await stopSimServer(TERMINAL_PORT); } catch {}
  try { await stopSimServer(MATCH_CAP_PORT); } catch {}
  process.exit(1);
});
