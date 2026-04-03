/**
 * sim-lifecycle.js — sim process lifecycle checks.
 *
 * Verifies that empty sims auto-stop by default and stay alive only when
 * explicitly pinned with keep-alive mode.
 */
const { startSimServer, stopSimServer, TestRunner, assert } = require("./helpers");

const AUTO_PORT = 8796;
const KEEPALIVE_PORT = 8797;

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(port, route) {
  const response = await fetch(`http://127.0.0.1:${port}${route}`);
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

  const allPassed = runner.summary();
  process.exit(allPassed ? 0 : 1);
}

run().catch(async (err) => {
  console.error("SimLifecycle test fatal error:", err.message);
  try { await stopSimServer(AUTO_PORT); } catch {}
  try { await stopSimServer(KEEPALIVE_PORT); } catch {}
  process.exit(1);
});
