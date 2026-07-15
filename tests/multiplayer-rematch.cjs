/**
 * Proves a terminal four-human run can rematch in place without rebuilding the
 * party, while every run-scoped authority surface rotates and old reads fail.
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

function command(authority, commandSeq, extra = {}) {
  return {
    runId: authority.runId,
    playerId: authority.playerId,
    commandCredential: authority.commandCredential,
    commandSeq,
    ...extra,
  };
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
  const deadline = Date.now() + 8000;
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
  throw new Error(`Timed out waiting for health: ${lastError?.message || "predicate"}`);
}

async function waitForExit(child) {
  if (child.exitCode != null) return child.exitCode;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("sim did not exit")), 5000);
    child.once("close", (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
}

async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lbh-rematch-"));
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, [
    path.join(ROOT, "scripts/sim-runtime.cjs"),
    "--host", "127.0.0.1",
    "--port", String(port),
    "--keep-alive", "true",
    "--control-plane-file", path.join(tmp, "control-plane.json"),
    "--session-registry-file", path.join(tmp, "session-registry.json"),
  ], {
    cwd: ROOT,
    env: {
      ...process.env,
      LBH_SIM_INSTANCE_ID: `rematch-${port}`,
    },
    stdio: ["ignore", "ignore", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk; });

  try {
    const initialHealth = await waitForHealth(baseUrl, (health) => health.session?.status === "running");
    const oldSessionId = initialHealth.session.id;
    const authorities = [];
    const profiles = [];

    for (let index = 0; index < 4; index += 1) {
      const clientId = `rematch-human-${port}-${index}`;
      const profileId = `rematch-profile-${port}-${index}`;
      const joined = await request(baseUrl, "/join", {
        method: "POST",
        body: { clientId, profileId, name: `Rematch Human ${index}` },
      });
      assert.strictEqual(joined.status, 200, JSON.stringify(joined.body));
      authorities.push(joined.body.authority);
      profiles.push(profileId);
    }

    const oldRunId = authorities[0].runId;
    const oldSnapshot = await request(baseUrl, `/snapshot?runId=${encodeURIComponent(oldRunId)}`, {
      authority: authorities[0],
    });
    assert.strictEqual(oldSnapshot.status, 200, JSON.stringify(oldSnapshot.body));
    const oldParty = oldSnapshot.body.players
      .filter((player) => !player.isAI)
      .sort((left, right) => left.seatNo - right.seatNo)
      .map((player) => ({ clientId: player.clientId, name: player.name, seatNo: player.seatNo }));
    assert.strictEqual(oldParty.length, 4, "the initial run must contain four humans");

    const nonHostEarly = await request(baseUrl, "/session/rematch", {
      method: "POST",
      authority: authorities[1],
      body: command(authorities[1], 1),
    });
    assert.strictEqual(nonHostEarly.status, 403, JSON.stringify(nonHostEarly.body));
    assert.strictEqual(nonHostEarly.body.code, "host-required");

    const hostEarly = await request(baseUrl, "/session/rematch", {
      method: "POST",
      authority: authorities[0],
      body: command(authorities[0], 1),
    });
    assert.strictEqual(hostEarly.status, 409, JSON.stringify(hostEarly.body));
    assert.strictEqual(hostEarly.body.code, "rematch-not-ended");

    for (const authority of authorities) {
      const death = await request(baseUrl, "/debug/player-state", {
        method: "POST",
        body: { clientId: authority.playerId, status: "dead", cause: "rematch-proof" },
      });
      assert.strictEqual(death.status, 200, JSON.stringify(death.body));
    }
    await waitForHealth(baseUrl, (health) => health.session?.status === "ended");

    const rematch = await request(baseUrl, "/session/rematch", {
      method: "POST",
      authority: authorities[0],
      body: command(authorities[0], 1),
    });
    assert.strictEqual(rematch.status, 200, JSON.stringify(rematch.body));
    assert.strictEqual(rematch.body.previousRunId, oldRunId);
    assert.notStrictEqual(rematch.body.session.id, oldSessionId);
    assert.notStrictEqual(rematch.body.session.runId, oldRunId);
    assert.strictEqual(rematch.body.session.status, "lobby");
    assert(/^[A-Z2-9]{6}$/.test(rematch.body.roomCode), "rematch must expose a fresh staged room code");

    const newRunId = rematch.body.session.runId;
    const newHostAuthority = rematch.body.authority;
    assert.strictEqual(newHostAuthority.runId, newRunId);
    assert.strictEqual(newHostAuthority.lastCommandSeq, 0);
    assert.strictEqual(newHostAuthority.membershipId, authorities[0].membershipId);
    assert.notStrictEqual(newHostAuthority.connectionId, authorities[0].connectionId);
    assert.notStrictEqual(newHostAuthority.commandCredential, authorities[0].commandCredential);
    assert.strictEqual(newHostAuthority.connectionEpoch, authorities[0].connectionEpoch + 1);

    const rematchParty = rematch.body.party
      .sort((left, right) => left.seatNo - right.seatNo)
      .map((player) => ({ clientId: player.clientId, name: player.name, seatNo: player.seatNo }));
    assert.deepStrictEqual(rematchParty, oldParty, "rematch must preserve party identity and seat order");
    assert(!JSON.stringify(rematch.body.party).includes("commandCredential"),
      "rematch roster must not become a public credential channel");

    const newAuthorities = [newHostAuthority];
    for (let index = 1; index < authorities.length; index += 1) {
      const oldAuthority = authorities[index];
      const claim = await request(baseUrl, "/session/rematch/claim", {
        method: "POST",
        authority: oldAuthority,
        body: {
          runId: oldAuthority.runId,
          playerId: oldAuthority.playerId,
          commandCredential: oldAuthority.commandCredential,
        },
      });
      assert.strictEqual(claim.status, 200, JSON.stringify(claim.body));
      assert.strictEqual(claim.body.session.runId, newRunId);
      assert.strictEqual(claim.body.player.ready, false);
      const replacement = claim.body.authority;
      assert.strictEqual(replacement.playerId, oldAuthority.playerId);
      assert.strictEqual(replacement.membershipId, oldAuthority.membershipId);
      assert.strictEqual(replacement.connectionEpoch, oldAuthority.connectionEpoch + 1);
      assert.notStrictEqual(replacement.connectionId, oldAuthority.connectionId);
      assert.notStrictEqual(replacement.commandCredential, oldAuthority.commandCredential);
      assert.strictEqual(replacement.lastCommandSeq, 0);
      newAuthorities.push(replacement);
    }

    const lobby = await request(baseUrl, "/lobby", { authority: newHostAuthority });
    assert.strictEqual(lobby.status, 200, JSON.stringify(lobby.body));
    const newHumans = lobby.body.players
      .filter((player) => !player.isAI)
      .sort((left, right) => left.seatNo - right.seatNo);
    assert.strictEqual(lobby.body.session.hostClientId, authorities[0].playerId);
    assert(newHumans.length === 4 && newHumans.every((player) => player.ready === false && player.connected === true),
      "rematch must return a connected, unready four-human staged lobby");
    assert.deepStrictEqual(
      newHumans.map((player) => ({ clientId: player.clientId, seatNo: player.seatNo })),
      oldParty.map((player) => ({ clientId: player.clientId, seatNo: player.seatNo })),
    );
    assert(!JSON.stringify(lobby.body).includes("commandCredential"),
      "lobby roster must not expose replacement credentials");

    for (let index = 0; index < newAuthorities.length; index += 1) {
      const current = await request(baseUrl, `/snapshot?runId=${encodeURIComponent(newRunId)}`, {
        authority: newAuthorities[index],
      });
      assert.strictEqual(current.status, 200, JSON.stringify(current.body));
      assert.strictEqual(current.body.runId, newRunId);
      assert(Number.isSafeInteger(current.body.snapshotId) && current.body.snapshotId >= 1);
      const owner = current.body.players.find((player) => player.clientId === newAuthorities[index].playerId);
      assert.strictEqual(owner.profileId, profiles[index], "rematch must preserve owner-private profile identity");
      assert.strictEqual(current.body.session.status, "lobby");
      assert.strictEqual(current.body.session.crewResult, undefined, "new staged run must not carry terminal crew truth");
    }

    await sleep(50);
    const newEvents = await request(baseUrl, `/events?runId=${encodeURIComponent(newRunId)}&since=0`, {
      authority: newHostAuthority,
    });
    assert.strictEqual(newEvents.status, 200, JSON.stringify(newEvents.body));
    assert.strictEqual(newEvents.body.runId, newRunId);
    assert((newEvents.body.events || []).some((event) => event.type === "session.started"));
    assert(!(newEvents.body.events || []).some((event) => event.type === "session.ended"));
    assert(!(newEvents.body.events || []).some((event) => event.type === "run.result"));

    const staleCommand = await request(baseUrl, "/input", {
      method: "POST",
      authority: authorities[0],
      body: { ...command(authorities[0], 2), seq: 1, moveX: 1, moveY: 0 },
    });
    assert.strictEqual(staleCommand.status, 409, JSON.stringify(staleCommand.body));
    assert.strictEqual(staleCommand.body.code, "stale-run");

    const staleSnapshot = await request(baseUrl, `/snapshot?runId=${encodeURIComponent(oldRunId)}`, {
      authority: authorities[0],
    });
    assert.strictEqual(staleSnapshot.status, 409, JSON.stringify(staleSnapshot.body));
    assert.strictEqual(staleSnapshot.body.code, "stale-run");

    const staleEvents = await request(baseUrl, `/events?runId=${encodeURIComponent(oldRunId)}&since=0`, {
      authority: authorities[0],
    });
    assert.strictEqual(staleEvents.status, 409, JSON.stringify(staleEvents.body));
    assert.strictEqual(staleEvents.body.code, "stale-run");

    const publicStaleEvents = await request(baseUrl, `/events?runId=${encodeURIComponent(oldRunId)}&since=0`);
    assert.strictEqual(publicStaleEvents.status, 200, JSON.stringify(publicStaleEvents.body));
    assert.strictEqual(publicStaleEvents.body.reset, true);
    assert.strictEqual(publicStaleEvents.body.events.length, 0);

    const publicStaleSnapshots = await request(baseUrl, `/snapshots?runId=${encodeURIComponent(oldRunId)}&since=0`);
    assert.strictEqual(publicStaleSnapshots.status, 200, JSON.stringify(publicStaleSnapshots.body));
    assert.strictEqual(publicStaleSnapshots.body.status, "reset");
    assert.strictEqual(publicStaleSnapshots.body.snapshots.length, 0);

    console.log("multiplayer rematch: four-human party and seats preserved; run, authority, journal, snapshot, and old-read fences proven");
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
