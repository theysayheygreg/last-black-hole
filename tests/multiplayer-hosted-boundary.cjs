const assert = require("assert");
const fs = require("fs");
const net = require("net");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const {
  HOSTED_SCHEMA_VERSION,
  HostedBoundaryError,
  resolveServiceMode,
  assertPlainData,
  assertHostedBodyBytes,
  assertNoDuplicateJsonKeys,
  unwrapHostedRequest,
  wrapHostedRequest,
  assertHostedProductSeats,
  assertHostedTicketIssuance,
  assertHostedAuthorityAdmission,
  rejectServerDerivedIdentityFields,
  authorizeLocator,
  diagnosticAlias,
  compatibilityIds,
} = require("../scripts/hosted-boundary.cjs");
const { createControlPlaneClient } = require("../scripts/control-plane-client.cjs");

const ROOT = path.resolve(__dirname, "..");

function expectBoundary(fn, code = null) {
  assert.throws(fn, (error) => error instanceof HostedBoundaryError && (!code || error.code === code));
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
      if (response.ok) return response.json();
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw new Error("hosted control plane did not become healthy");
}

async function rawPost(baseUrl, route, body, token = null) {
  const headers = { "content-type": "application/json" };
  if (token != null) headers["x-lbh-service-token"] = token;
  const response = await fetch(`${baseUrl}${route}`, { method: "POST", headers, body });
  return { status: response.status, body: await response.json() };
}

function sessionEnvelope(playerCount, extra = {}) {
  return wrapHostedRequest({
    session: {
      id: "session-service-owned",
      runId: "run-service-owned",
      simInstanceId: "authority-service-owned",
      maxPlayers: 4,
      status: "running",
    },
    players: Array.from({ length: playerCount }, (_, index) => ({
      clientId: `client-locator-${index}`,
      profileId: `profile-service-owned-${index}`,
      name: `Pilot ${index}`,
      status: "active",
      isAI: false,
    })),
    ...extra,
  });
}

async function main() {
  assert.strictEqual(resolveServiceMode(), "local", "Default service mode must remain local");
  assert.strictEqual(resolveServiceMode("hosted"), "hosted");
  expectBoundary(() => resolveServiceMode("local-with-auth-bypass"), "INVALID_SERVICE_MODE");

  const cyclic = {};
  cyclic.self = cyclic;
  expectBoundary(() => assertPlainData(cyclic));
  expectBoundary(() => assertPlainData(Object.create({ inherited: true })));
  const accessor = {};
  Object.defineProperty(accessor, "secret", { enumerable: true, get() { return "not-read"; } });
  expectBoundary(() => assertPlainData(accessor));
  expectBoundary(() => assertPlainData({ values: new Array(257).fill("x") }));
  expectBoundary(() => assertHostedBodyBytes(256 * 1024 + 1), "HOSTED_REQUEST_TOO_LARGE");
  assertNoDuplicateJsonKeys('{"schemaVersion":"a","payload":{"x":1}}');
  expectBoundary(
    () => assertNoDuplicateJsonKeys('{"schemaVersion":"a","schemaVersion":"b","payload":{}}'),
    "HOSTED_DUPLICATE_KEY",
  );
  expectBoundary(() => unwrapHostedRequest({
    schemaVersion: HOSTED_SCHEMA_VERSION,
    payload: { value: true, allowLocalAuthBypass: true },
  }, { allowedPayloadKeys: ["value"] }));

  assert.strictEqual(assertHostedProductSeats(1), 1);
  assert.strictEqual(assertHostedProductSeats(4), 4);
  expectBoundary(() => assertHostedProductSeats(5), "HOSTED_SEAT_CAP");
  expectBoundary(() => assertHostedProductSeats(8), "HOSTED_SEAT_CAP");
  assertHostedTicketIssuance({ activeSeats: 3, seatNo: 3, authorityCount: 1 });
  assertHostedAuthorityAdmission({ activeSeats: 3, seatNo: 3, authorityCount: 1 });
  expectBoundary(() => assertHostedTicketIssuance({ activeSeats: 4, seatNo: 4, authorityCount: 1 }), "HOSTED_SEAT_CAP");
  expectBoundary(() => assertHostedAuthorityAdmission({ activeSeats: 3, seatNo: 3, authorityCount: 2 }), "HOSTED_AUTHORITY_COUNT");

  expectBoundary(() => rejectServerDerivedIdentityFields({
    clientLocator: "install-a",
    profileId: "forged-profile",
  }), "HOSTED_CALLER_IDENTITY_FORBIDDEN");
  assert(authorizeLocator({
    authenticatedPrincipalId: "principal-a",
    recordOwnerPrincipalId: "principal-a",
    locator: "install-changed-by-caller",
  }));
  expectBoundary(() => authorizeLocator({
    authenticatedPrincipalId: "principal-b",
    recordOwnerPrincipalId: "principal-a",
    locator: "install-a",
  }), "HOSTED_NOT_AUTHORIZED");

  assert.deepStrictEqual(compatibilityIds({
    sessionId: "legacy-session",
    runId: "legacy-run",
    membershipId: "legacy-membership",
    connectionId: "legacy-connection",
    connectionEpoch: 3,
  }), {
    session_id: "legacy-session",
    run_id: "legacy-run",
    run_membership_id: "legacy-membership",
    connection_id: "legacy-connection",
    connection_epoch: 3,
  });

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lbh-hosted-boundary-"));
  const local = createControlPlaneClient({
    controlPlaneFile: path.join(tmp, "local-store.json"),
    sessionRegistryFile: path.join(tmp, "local-registry.json"),
  });
  const localProfile = await local.bootstrapProfile({ fallbackName: "Offline Pilot" });
  assert(localProfile.id, "Local embedded mode must remain network-independent");
  assert.strictEqual(local.storageBackend, "json", "JSON remains the explicit local default");
  const relational = createControlPlaneClient({
    controlPlaneFile: path.join(tmp, "local-store.sqlite"),
    sessionRegistryFile: path.join(tmp, "local-relational-registry.json"),
    storageBackend: "sqlite",
  });
  const relationalProfile = await relational.bootstrapProfile({ fallbackName: "Relational Pilot" });
  assert(relationalProfile.id, "Relational local mode must derive a durable profile id");
  await relational.saveEchoWreck({ wreckId: "echo-a", mapId: "map-a", seed: "seed-a", loot: [{ id: "relic-a" }] });
  assert.strictEqual((await relational.getEchoesForSeed("seed-a", "map-a")).length, 1, "Relational local mode must preserve echo parity");
  relational.close();
  assert.throws(() => createControlPlaneClient({
    controlPlaneFile: path.join(tmp, "bad-backend"),
    sessionRegistryFile: path.join(tmp, "bad-backend-registry.json"),
    storageBackend: "caller-selected-cloud",
  }), /json or sqlite/);
  assert.throws(() => createControlPlaneClient({
    controlPlaneFile: path.join(tmp, "bad-hosted.json"),
    sessionRegistryFile: path.join(tmp, "bad-hosted-registry.json"),
    serviceMode: "hosted",
  }), /baseUrl/);

  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const token = "service-token-that-is-never-logged-0123456789";
  const diagnosticKey = "diagnostic-key-that-is-never-logged-012345";
  const child = spawn(process.execPath, [
    path.join(ROOT, "scripts/control-plane-runtime.cjs"),
    "--host", "127.0.0.1",
    "--port", String(port),
    "--mode", "hosted",
    "--control-plane-file", path.join(tmp, "hosted-store.json"),
    "--session-registry-file", path.join(tmp, "hosted-registry.json"),
  ], {
    cwd: ROOT,
    env: {
      ...process.env,
      LBH_SERVICE_MODE: "hosted",
      LBH_CONTROL_PLANE_SERVICE_TOKEN: token,
      LBH_DIAGNOSTIC_KEY: diagnosticKey,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  child.stdout.on("data", (chunk) => { logs += chunk; });
  child.stderr.on("data", (chunk) => { logs += chunk; });

  try {
    const health = await waitForHealth(baseUrl);
    assert.deepStrictEqual(Object.keys(health).sort(), ["ok", "result", "schemaVersion"]);
    assert.strictEqual(health.schemaVersion, HOSTED_SCHEMA_VERSION);
    assert.strictEqual(health.result.serviceMode, "hosted");
    assert(!JSON.stringify(health).includes(tmp), "Hosted health must not expose local storage paths");

    const registration = JSON.stringify(wrapHostedRequest({
      simInstanceId: "sim-sensitive-identifier",
      url: "https://authority.internal.invalid",
      host: "authority.internal.invalid",
      port: 9999,
    }));
    const missing = await rawPost(baseUrl, "/sim/register", registration);
    assert.strictEqual(missing.status, 401);
    const wrong = await rawPost(baseUrl, "/sim/register", registration, "wrong-token");
    assert.strictEqual(wrong.status, 401);
    const accepted = await rawPost(baseUrl, "/sim/register", registration, token);
    assert.strictEqual(accepted.status, 200, JSON.stringify(accepted.body));
    assert.strictEqual(accepted.body.schemaVersion, HOSTED_SCHEMA_VERSION);

    const malicious = await rawPost(baseUrl, "/sim/register", JSON.stringify({
      schemaVersion: HOSTED_SCHEMA_VERSION,
      payload: { simInstanceId: "sim-malicious", allowLocalAuthBypass: true },
    }), token);
    assert.strictEqual(malicious.status, 400);
    assert.strictEqual(malicious.body.error, "Hosted request rejected");
    assert(!JSON.stringify(malicious.body).includes("allowLocalAuthBypass"));

    const duplicate = await rawPost(
      baseUrl,
      "/sim/heartbeat",
      `{"schemaVersion":"${HOSTED_SCHEMA_VERSION}","schemaVersion":"${HOSTED_SCHEMA_VERSION}","payload":{"simInstanceId":"sim-sensitive-identifier"}}`,
      token,
    );
    assert.strictEqual(duplicate.status, 400);

    const forgedProfile = await rawPost(baseUrl, "/profile/bootstrap", JSON.stringify(wrapHostedRequest({
      clientId: "client-locator-forged",
      installId: "install-locator-forged",
      profileId: "profile-forged",
      allowGuest: true,
    })), token);
    assert.strictEqual(forgedProfile.status, 503);
    const forgedSettlement = await rawPost(baseUrl, "/profile/outcome", JSON.stringify(wrapHostedRequest({
      profileId: "profile-forged",
      runId: "run-forged",
      outcome: "extracted",
    })), token);
    assert.strictEqual(forgedSettlement.status, 503,
      "Hosted settlement must stay closed until workload/lease-derived identity exists");

    const four = await rawPost(baseUrl, "/session/upsert", JSON.stringify(sessionEnvelope(4)), token);
    assert.strictEqual(four.status, 200, JSON.stringify(four.body));
    for (const count of [5, 8]) {
      const rejected = await rawPost(baseUrl, "/session/upsert", JSON.stringify(sessionEnvelope(count)), token);
      assert.strictEqual(rejected.status, 400, `Expected hosted ${count}-seat rejection`);
      assert.strictEqual(rejected.body.error, "Hosted request rejected");
    }

    const alias = diagnosticAlias("client", "client-locator-forged", diagnosticKey);
    assert(!alias.includes("client-locator-forged"));
    await new Promise((resolve) => setTimeout(resolve, 80));
    const forbidden = [
      token,
      diagnosticKey,
      "sim-sensitive-identifier",
      "client-locator-forged",
      "install-locator-forged",
      "profile-forged",
      "127.0.0.1",
      "authority.internal.invalid",
    ];
    for (const secret of forbidden) {
      assert(!logs.includes(secret), `Hosted structured diagnostics leaked ${secret}`);
    }
  } finally {
    child.kill("SIGTERM");
    await new Promise((resolve) => child.once("close", resolve));
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  console.log("multiplayer hosted boundary: fail-closed mode/auth/schema/seat/privacy/local compatibility passed");
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exit(1);
});
