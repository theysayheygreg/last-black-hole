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

function makePayload({ runId = `run-${crypto.randomUUID()}`, profileId = `profile-${crypto.randomUUID()}`, name = "Settlement Pilot", cargoId = "relic-1", emEarned = 60 } = {}) {
  return {
    profileId,
    outcome: "extracted",
    runDuration: 120,
    session: { id: `session-${crypto.randomUUID()}`, runId, mapId: "shallows" },
    player: {
      clientId: `player-${crypto.randomUUID()}`,
      profileId,
      name,
      cargo: [{ id: cargoId, name: "Test Relic", value: 50 }],
      equipped: [],
      consumables: [],
    },
    runResult: {
      runId,
      profileId,
      outcome: "extracted",
      survivalTime: 120,
      emEarned,
      cargoExtracted: [{ id: cargoId, name: "Test Relic", value: 50 }],
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
    const result = await predicate();
    if (result === true) return;
    if (result?.ok) return result.value;
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

  const sharedRunFile = path.join(tmp, "shared-run.json");
  const sharedStore = new ControlPlaneStore(sharedRunFile);
  const sharedRunId = `run-shared-${crypto.randomUUID()}`;
  const sharedPayloads = Array.from({ length: 4 }, (_, index) => makePayload({
    runId: sharedRunId,
    profileId: `profile-shared-${index + 1}`,
    name: `Shared Pilot ${index + 1}`,
    cargoId: `shared-relic-${index + 1}`,
    emEarned: 60 + index,
  }));
  for (const sharedPayload of sharedPayloads) {
    const committed = sharedStore.applyOutcome(sharedPayload);
    assert.strictEqual(committed.replayed, false, "each profile should settle its shared run once");
    assert.strictEqual(sharedStore.applyOutcome(sharedPayload).replayed, true, "each shared profile should replay idempotently");
  }
  const sharedState = JSON.parse(fs.readFileSync(sharedRunFile, "utf8"));
  assert.strictEqual(Object.keys(sharedState.runs).length, 4, "one shared run must retain four private run records");
  assert.strictEqual(Object.keys(sharedState.settlements).length, 4, "one shared run must retain four private settlements");
  for (const sharedPayload of sharedPayloads) {
    const recentRuns = sharedStore.getRecentRuns(sharedPayload.profileId, 5);
    assert.strictEqual(recentRuns.length, 1, `profile ${sharedPayload.profileId} should have one run record`);
    assert.strictEqual(recentRuns[0].runId, sharedRunId, "private run record should retain shared run identity");
    assert.strictEqual(recentRuns[0].profileId, sharedPayload.profileId, "private run record should retain owner identity");
  }

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
  let failureSimChild = null;

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
      "--keep-alive", "true",
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
    const outcomeResponse = await fetch(`${simUrl}/debug/player-state`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clientId: authority.playerId, status: "dead", cause: "settlement-ordering" }),
    });
    const outcome = await outcomeResponse.json();
    assert.strictEqual(outcomeResponse.status, 200, JSON.stringify(outcome));
    await waitFor(() => {
      const state = JSON.parse(fs.readFileSync(runtimeFile, "utf8"));
      return Object.values(state.settlements).some((entry) => entry.profileId === simProfileId);
    }, "authenticated sim outcome settlement");

    const eventHeaders = {
      "content-type": "application/json",
      "x-lbh-command-credential": authority.commandCredential,
      "x-lbh-player-id": authority.playerId,
      "x-lbh-run-id": authority.runId,
    };
    const privateEvents = await waitFor(async () => {
      const response = await fetch(`${simUrl}/events?runId=${encodeURIComponent(authority.runId)}&since=0`, {
        headers: eventHeaders,
      });
      const body = await response.json();
      const events = (body.events || []).filter((event) =>
        ["run.result", "profile.updated"].includes(event.type)
        && event.payload?.clientId === authority.playerId
      );
      return {
        ok: response.ok && events.length >= 3,
        value: events,
        eventTypes: events.map((event) => event.type),
      };
    }, "pending then settled owner settlement events");
    assert.deepStrictEqual(privateEvents.slice(0, 3).map((event) => event.type), [
      "run.result", "profile.updated", "run.result",
    ], "settlement events must follow pending, acknowledged profile, settled result order");
    assert.strictEqual(privateEvents[0].payload.settlement.status, "pending");
    assert.strictEqual(privateEvents[1].payload.settlement.status, "settled");
    assert(Number.isInteger(privateEvents[1].payload.settlement.emCredited), "profile acknowledgement must carry exact EM credit");
    assert(Number.isInteger(privateEvents[1].payload.settlement.overflowValue), "profile acknowledgement must carry exact overflow");
    assert.strictEqual(privateEvents[2].payload.settlement.status, "settled");
    assert.strictEqual(privateEvents[2].payload.emCredited, privateEvents[1].payload.settlement.emCredited);
    assert.strictEqual(privateEvents[2].payload.overflowValue, privateEvents[1].payload.settlement.overflowValue);

    const publicEventsResponse = await fetch(`${simUrl}/events?runId=${encodeURIComponent(authority.runId)}&since=0`);
    const publicEvents = await publicEventsResponse.json();
    assert(!(publicEvents.events || []).some((event) => ["run.result", "profile.updated"].includes(event.type)),
      "owner settlement events must not enter the public event projection");

    const failureSimPort = await freePort();
    const failureSimUrl = `http://127.0.0.1:${failureSimPort}`;
    failureSimChild = spawn(process.execPath, [
      path.join(ROOT, "scripts/sim-runtime.cjs"),
      "--host", "127.0.0.1",
      "--port", String(failureSimPort),
      "--control-plane-url", baseUrl,
      "--keep-alive", "true",
    ], {
      cwd: ROOT,
      env: {
        ...process.env,
        LBH_CONTROL_PLANE_SERVICE_TOKEN: serviceToken,
        LBH_SIM_INSTANCE_ID: "settlement-failure-sim",
      },
      stdio: ["ignore", "ignore", "pipe"],
    });
    failureSimChild.stderr.on("data", (chunk) => { stderr += chunk; });
    await waitForHealth(failureSimUrl);
    const failureHealth = await (await fetch(`${failureSimUrl}/health`)).json();
    const failureProfileId = `profile-failure-${crypto.randomUUID()}`;
    const conflictPayload = makePayload({
      runId: failureHealth.session.runId,
      profileId: failureProfileId,
      name: "Conflicting Pilot",
      cargoId: "conflict-relic",
      emEarned: 999,
    });
    conflictPayload.session = {
      id: failureHealth.session.id,
      runId: failureHealth.session.runId,
      mapId: failureHealth.session.mapId,
    };
    const seededConflict = await post(baseUrl, conflictPayload, serviceToken);
    assert.strictEqual(seededConflict.response.status, 200, JSON.stringify(seededConflict.body));

    const failureJoinResponse = await fetch(`${failureSimUrl}/join`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        clientId: `client-failure-${crypto.randomUUID()}`,
        profileId: failureProfileId,
        name: "Failure Pilot",
      }),
    });
    const failureJoin = await failureJoinResponse.json();
    assert.strictEqual(failureJoinResponse.status, 200, JSON.stringify(failureJoin));
    const failureAuthority = failureJoin.authority;
    const failureOutcomeResponse = await fetch(`${failureSimUrl}/debug/player-state`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clientId: failureAuthority.playerId, status: "dead", cause: "settlement-failure" }),
    });
    assert.strictEqual(failureOutcomeResponse.status, 200, await failureOutcomeResponse.text());
    const failedEvents = await waitFor(async () => {
      const response = await fetch(`${failureSimUrl}/events?runId=${encodeURIComponent(failureAuthority.runId)}&since=0`, {
        headers: {
          ...eventHeaders,
          "x-lbh-command-credential": failureAuthority.commandCredential,
          "x-lbh-player-id": failureAuthority.playerId,
          "x-lbh-run-id": failureAuthority.runId,
        },
      });
      const body = await response.json();
      const events = (body.events || []).filter((event) =>
        ["run.result", "profile.updated"].includes(event.type)
        && event.payload?.clientId === failureAuthority.playerId
      );
      return { ok: response.ok && events.length >= 2, value: events };
    }, "pending then failed owner settlement events");
    assert.deepStrictEqual(failedEvents.map((event) => event.type), ["run.result", "run.result"],
      "failed settlement must not publish profile.updated");
    assert.strictEqual(failedEvents[0].payload.settlement.status, "pending");
    assert.strictEqual(failedEvents[1].payload.settlement.status, "failed");
    assert.strictEqual(failedEvents[1].payload.settlement.errorCode, "SETTLEMENT_FAILED");
  } finally {
    if (failureSimChild) {
      if (failureSimChild.exitCode == null) {
        failureSimChild.kill("SIGTERM");
        await new Promise((resolve) => failureSimChild.once("close", resolve));
      }
    }
    if (simChild) {
      if (simChild.exitCode == null) {
        simChild.kill("SIGTERM");
        await new Promise((resolve) => simChild.once("close", resolve));
      }
    }
    if (child.exitCode == null) {
      child.kill("SIGTERM");
      await new Promise((resolve) => child.once("close", resolve));
    }
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  console.log("multiplayer settlement: 100x embedded + 100x authenticated replay committed once; conflict rejected");
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exit(1);
});
