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

async function run() {
  const runner = new TestRunner("SimLifecycle");

  await runner.run("Empty sim auto-stops after the idle grace window", async () => {
    await startSimServer(AUTO_PORT, { idleShutdownMs: 1500 });
    const { status, body } = await fetchJson(AUTO_PORT, "/health");
    assert(status === 200, `Expected /health 200, got ${status}`);
    assert(body.process?.pid > 0, "Expected sim health to expose process pid");
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
        clientId: "loop-host",
        name: "Loop Host",
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

  const allPassed = runner.summary();
  process.exit(allPassed ? 0 : 1);
}

run().catch(async (err) => {
  console.error("SimLifecycle test fatal error:", err.message);
  try { await stopSimServer(AUTO_PORT); } catch {}
  try { await stopSimServer(KEEPALIVE_PORT); } catch {}
  try { await stopSimServer(JOIN_PORT); } catch {}
  try { await stopSimServer(FRESH_PORT); } catch {}
  process.exit(1);
});
