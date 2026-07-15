/**
 * Proves terminal S20 truth remains readable until the last admitted human
 * leaves, even after the configured terminal grace has elapsed.
 */
const assert = require("assert");
const fs = require("fs");
const net = require("net");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "..");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function request(baseUrl, pathname, { method = "GET", body = null, authority = null } = {}) {
  const headers = { "content-type": "application/json" };
  if (authority) {
    headers["x-lbh-command-credential"] = authority.commandCredential;
    headers["x-lbh-player-id"] = authority.playerId;
    headers["x-lbh-run-id"] = authority.runId;
  }
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers,
    body: body == null ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

async function waitForHealth(baseUrl, predicate) {
  const deadline = Date.now() + 5000;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const health = await request(baseUrl, "/health");
      if (health.status === 200 && predicate(health.body)) return health.body;
    } catch (error) {
      lastError = error;
    }
    await sleep(25);
  }
  throw new Error(`timed out waiting for health: ${lastError?.message || "predicate"}`);
}

async function waitForExit(child) {
  if (child.exitCode != null) return child.exitCode;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("sim did not shut down after final leave")), 5000);
    child.once("close", (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
}

async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lbh-results-residency-"));
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const graceMs = 150;
  const child = spawn(process.execPath, [
    path.join(ROOT, "scripts/sim-runtime.cjs"),
    "--host", "127.0.0.1",
    "--port", String(port),
    "--keep-alive", "false",
    "--idle-shutdown-ms", "5000",
    "--control-plane-file", path.join(tmp, "control-plane.json"),
    "--session-registry-file", path.join(tmp, "session-registry.json"),
  ], {
    cwd: ROOT,
    env: {
      ...process.env,
      LBH_SIM_TERMINAL_GRACE_MS: String(graceMs),
      LBH_SIM_INSTANCE_ID: `results-residency-${port}`,
    },
    stdio: ["ignore", "ignore", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk; });

  try {
    await waitForHealth(baseUrl, (health) => health.session?.status === "running");
    const clientId = `residency-client-${port}`;
    const profileId = `residency-profile-${port}`;
    const joined = await request(baseUrl, "/join", {
      method: "POST",
      body: { clientId, profileId, name: "Residency Pilot" },
    });
    assert.strictEqual(joined.status, 200, JSON.stringify(joined.body));
    const authority = joined.body.authority;
    const runId = authority.runId;

    const death = await request(baseUrl, "/debug/player-state", {
      method: "POST",
      body: { clientId, status: "dead", cause: "results-residency" },
    });
    assert.strictEqual(death.status, 200, JSON.stringify(death.body));
    await waitForHealth(baseUrl, (health) => health.session?.status === "ended");

    await sleep(graceMs + 250);

    const terminalSnapshot = await request(baseUrl, `/snapshot?runId=${encodeURIComponent(runId)}`, {
      authority,
    });
    assert.strictEqual(terminalSnapshot.status, 200, JSON.stringify(terminalSnapshot.body));
    assert.strictEqual(terminalSnapshot.body.session?.status, "ended");
    assert.strictEqual(terminalSnapshot.body.session?.crewResult?.runId, runId);
    assert.strictEqual(terminalSnapshot.body.session?.crewResult?.crewSize, 1);

    const terminalEvents = await request(baseUrl, `/events?runId=${encodeURIComponent(runId)}&since=0`, {
      authority,
    });
    assert.strictEqual(terminalEvents.status, 200, JSON.stringify(terminalEvents.body));
    const events = terminalEvents.body.events || [];
    assert(events.some((event) => event.type === "session.ended"),
      "terminal event stream must retain session.ended truth");
    assert(events.some((event) =>
      event.type === "run.result"
      && event.payload?.clientId === clientId
      && event.payload?.settlement?.status === "settled"
    ), "owner event stream must retain settled private result truth");

    const stillAlive = await request(baseUrl, "/health");
    assert.strictEqual(stillAlive.status, 200, "authority must remain alive during connected result review");
    assert.strictEqual(stillAlive.body.shutdownReason, null,
      "terminal grace must not shut down an authority with an admitted connected reviewer");

    const leave = await request(baseUrl, "/leave", {
      method: "POST",
      authority,
      body: {
        clientId,
        runId: authority.runId,
        playerId: authority.playerId,
        commandCredential: authority.commandCredential,
        commandSeq: 1,
      },
    });
    assert.strictEqual(leave.status, 200, JSON.stringify(leave.body));
    assert.strictEqual(await waitForExit(child), 0, `sim stderr: ${stderr}`);

    console.log("multiplayer results residency: terminal snapshot/events survived grace while connected; final leave enabled shutdown");
  } finally {
    if (child.exitCode == null) {
      child.kill("SIGTERM");
      await waitForExit(child).catch(() => null);
    }
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exit(1);
});
