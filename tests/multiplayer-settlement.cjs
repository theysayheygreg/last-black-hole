/**
 * Proves the Phase 0 local settlement contract: service-authenticated HTTP
 * mutation, exact replay idempotency, explicit conflict, and embedded parity.
 */
const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const net = require("net");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { ControlPlaneStore } = require("../scripts/control-plane-store.cjs");
const { createControlPlaneClient } = require("../scripts/control-plane-client.cjs");

const ROOT = path.resolve(__dirname, "..");

function makePayload() {
  const runId = `run-${crypto.randomUUID()}`;
  const profileId = `profile-${crypto.randomUUID()}`;
  return {
    profileId,
    outcome: "extracted",
    runDuration: 120,
    session: { id: `session-${crypto.randomUUID()}`, runId, mapId: "shallows" },
    player: {
      clientId: `player-${crypto.randomUUID()}`,
      profileId,
      name: "Settlement Pilot",
      cargo: [{ id: "relic-1", name: "Test Relic", value: 50 }],
      equipped: [],
      consumables: [],
    },
    runResult: {
      runId,
      profileId,
      outcome: "extracted",
      survivalTime: 120,
      emEarned: 60,
      cargoExtracted: [{ id: "relic-1", name: "Test Relic", value: 50 }],
      cargoLost: [],
    },
    settlement: { authorityInstanceId: "authority-test-1", authorityEpoch: 1 },
  };
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

async function waitForHealth(baseUrl) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("control plane did not become healthy");
}

async function waitFor(predicate, label) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`timed out waiting for ${label}`);
}

async function post(baseUrl, payload, token) {
  const headers = { "content-type": "application/json" };
  if (token != null) headers["x-lbh-service-token"] = token;
  const response = await fetch(`${baseUrl}/profile/outcome`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  return { response, body: await response.json() };
}

async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lbh-settlement-"));
  const embeddedFile = path.join(tmp, "embedded.json");
  const payload = makePayload();
  const embedded = createControlPlaneClient({
    controlPlaneFile: embeddedFile,
    sessionRegistryFile: path.join(tmp, "embedded-registry.json"),
  });

  let first;
  for (let index = 0; index < 100; index++) {
    const committed = await embedded.applyOutcome(payload);
    if (index === 0) first = committed;
    else assert.strictEqual(committed.replayed, true, `replay ${index} should return the original commit`);
  }
  const embeddedState = JSON.parse(fs.readFileSync(embeddedFile, "utf8"));
  assert.strictEqual(Object.keys(embeddedState.settlements).length, 1);
  assert.strictEqual(Object.keys(embeddedState.runs).length, 1);
  assert.strictEqual(embeddedState.profiles[payload.profileId].exoticMatter, 60);
  assert.strictEqual(embeddedState.profiles[payload.profileId].totalExtractions, 1);
  assert.strictEqual(embeddedState.profiles[payload.profileId].vault.length, 1);
  assert.strictEqual(first.replayed, false);

  const reloaded = new ControlPlaneStore(embeddedFile);
  assert.strictEqual(reloaded.applyOutcome(payload).replayed, true, "durable replay should survive store reload");
  assert.throws(
    () => reloaded.applyOutcome({ ...payload, runResult: { ...payload.runResult, emEarned: 61 } }),
    (error) => error.code === "SETTLEMENT_CONFLICT",
  );

  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const serviceToken = crypto.randomBytes(32).toString("hex");
  const runtimeFile = path.join(tmp, "runtime.json");
  const registryFile = path.join(tmp, "registry.json");
  const child = spawn(process.execPath, [
    path.join(ROOT, "scripts/control-plane-runtime.cjs"),
    "--host", "127.0.0.1",
    "--port", String(port),
    "--control-plane-file", runtimeFile,
    "--session-registry-file", registryFile,
  ], {
    cwd: ROOT,
    env: { ...process.env, LBH_CONTROL_PLANE_SERVICE_TOKEN: serviceToken },
    stdio: ["ignore", "ignore", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  let simChild = null;

  try {
    await waitForHealth(baseUrl);
    const missing = await post(baseUrl, makePayload(), null);
    assert.strictEqual(missing.response.status, 401);
    const wrong = await post(baseUrl, makePayload(), "wrong-token");
    assert.strictEqual(wrong.response.status, 401);

    const remotePayload = makePayload();
    const previousServiceToken = process.env.LBH_CONTROL_PLANE_SERVICE_TOKEN;
    process.env.LBH_CONTROL_PLANE_SERVICE_TOKEN = serviceToken;
    const remote = createControlPlaneClient({ baseUrl });
    if (previousServiceToken == null) delete process.env.LBH_CONTROL_PLANE_SERVICE_TOKEN;
    else process.env.LBH_CONTROL_PLANE_SERVICE_TOKEN = previousServiceToken;
    for (let index = 0; index < 100; index++) {
      const committed = await remote.applyOutcome(remotePayload);
      assert.strictEqual(committed.replayed, index > 0);
    }
    const conflict = await post(baseUrl, {
      ...remotePayload,
      runResult: { ...remotePayload.runResult, emEarned: 999 },
    }, serviceToken);
    assert.strictEqual(conflict.response.status, 409);
    assert.strictEqual(conflict.body.code, "SETTLEMENT_CONFLICT");

    const runtimeState = JSON.parse(fs.readFileSync(runtimeFile, "utf8"));
    assert.strictEqual(Object.keys(runtimeState.settlements).length, 1);
    assert.strictEqual(runtimeState.profiles[remotePayload.profileId].exoticMatter, 60);
    assert.strictEqual(runtimeState.profiles[remotePayload.profileId].totalExtractions, 1);

    const simPort = await freePort();
    const simUrl = `http://127.0.0.1:${simPort}`;
    simChild = spawn(process.execPath, [
      path.join(ROOT, "scripts/sim-runtime.cjs"),
      "--host", "127.0.0.1",
      "--port", String(simPort),
      "--control-plane-url", baseUrl,
    ], {
      cwd: ROOT,
      env: {
        ...process.env,
        LBH_CONTROL_PLANE_SERVICE_TOKEN: serviceToken,
        LBH_SIM_INSTANCE_ID: "settlement-integration-sim",
      },
      stdio: ["ignore", "ignore", "pipe"],
    });
    simChild.stderr.on("data", (chunk) => { stderr += chunk; });
    await waitForHealth(simUrl);

    const simProfileId = `profile-${crypto.randomUUID()}`;
    const joinedResponse = await fetch(`${simUrl}/join`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        clientId: `client-${crypto.randomUUID()}`,
        profileId: simProfileId,
        name: "Authenticated Sim Pilot",
      }),
    });
    const joined = await joinedResponse.json();
    assert.strictEqual(joinedResponse.status, 200, JSON.stringify(joined));
    const authority = joined.authority;
    const leaveResponse = await fetch(`${simUrl}/leave`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-lbh-command-credential": authority.commandCredential,
        "x-lbh-player-id": authority.playerId,
        "x-lbh-run-id": authority.runId,
      },
      body: JSON.stringify({
        runId: authority.runId,
        playerId: authority.playerId,
        commandCredential: authority.commandCredential,
        commandSeq: 1,
      }),
    });
    const left = await leaveResponse.json();
    assert.strictEqual(leaveResponse.status, 200, JSON.stringify(left));
    await waitFor(() => {
      const state = JSON.parse(fs.readFileSync(runtimeFile, "utf8"));
      return Object.values(state.settlements).some((entry) => entry.profileId === simProfileId);
    }, "authenticated sim outcome settlement");
  } finally {
    if (simChild) {
      simChild.kill("SIGTERM");
      await new Promise((resolve) => simChild.once("close", resolve));
    }
    child.kill("SIGTERM");
    await new Promise((resolve) => child.once("close", resolve));
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  console.log("multiplayer settlement: 100x embedded + 100x authenticated replay committed once; conflict rejected");
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exit(1);
});
