const { pathToFileURL } = require("url");
const path = require("path");
const { TestRunner, assert, startSimServer, stopSimServer } = require("./helpers.cjs");

const SIM_PORT = 8813;
const SIM_URL = `http://127.0.0.1:${SIM_PORT}`;

async function request(pathname, { method = "GET", body = null, authority = null } = {}) {
  const headers = { "content-type": "application/json" };
  if (authority) {
    headers["x-lbh-command-credential"] = authority.commandCredential;
    headers["x-lbh-player-id"] = authority.playerId;
    headers["x-lbh-run-id"] = authority.runId;
  }
  const response = await fetch(`${SIM_URL}${pathname}`, {
    method,
    headers,
    body: body == null ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
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

async function run() {
  const runner = new TestRunner("ProtocolV2Authority");
  await startSimServer(SIM_PORT, { keepAlive: true });

  try {
    await runner.run("v2 binds commands, reconnects, private events, and recovery to run authority", async () => {
      const protocol = await request("/protocol");
      assert(protocol.body.version === "lbh-local-v2", `Expected v2 protocol, got ${protocol.body.version}`);

      const started = await request("/session/start", {
        method: "POST",
        body: {
          mapId: "shallows",
          requesterId: "authority-a",
          requesterName: "Authority A",
          seed: 8103,
        },
      });
      assert(started.status === 200 && started.body.joinTicket, "Expected a one-time host join ticket");
      const runId = started.body.session.runId;

      const joinedA = await request("/join", {
        method: "POST",
        body: {
          runId,
          clientId: "authority-a",
          joinTicket: started.body.joinTicket,
          name: "Authority A",
          equipped: [{
            id: "authority-fixture",
            name: "Authority Fixture",
            category: "artifact",
            subcategory: "equippable",
            tier: "common",
            value: 1,
          }],
        },
      });
      assert(joinedA.status === 200 && joinedA.body.authority?.commandCredential,
        "Expected server-issued command authority for host");
      const authorityA = joinedA.body.authority;

      const joinedB = await request("/join", {
        method: "POST",
        body: { runId, clientId: "authority-b", name: "Authority B" },
      });
      assert(joinedB.status === 200 && joinedB.body.authority?.commandCredential,
        "Expected server-issued command authority for second player");
      const authorityB = joinedB.body.authority;
      assert(authorityA.commandCredential !== authorityB.commandCredential,
        "Expected per-player credentials to be unique");

      const inventory = await request("/inventory/action", {
        method: "POST",
        authority: authorityA,
        body: command(authorityA, 1, { action: "unequip", equipSlot: 0 }),
      });
      assert(inventory.status === 200 && inventory.body.acceptedCommandSeq === 1,
        `Expected first command to succeed, got ${inventory.status}/${inventory.body.code}`);

      const publicEvents = await request(`/events?runId=${encodeURIComponent(runId)}&since=0`);
      assert(!publicEvents.body.events.some((event) => event.type === "player.inventoryAction"),
        "Unauthenticated event reads must not expose player-local inventory events");
      assert(publicEvents.body.nextSince >= 1, "Filtered readers should still advance on the global watermark");

      const eventsA = await request(`/events?runId=${encodeURIComponent(runId)}&since=0`, {
        authority: authorityA,
      });
      assert(eventsA.body.events.some((event) =>
        event.type === "player.inventoryAction" && event.payload?.clientId === authorityA.playerId
      ), "Owning player should receive its local event");

      const eventsB = await request(`/events?runId=${encodeURIComponent(runId)}&since=0`, {
        authority: authorityB,
      });
      assert(!eventsB.body.events.some((event) => event.type === "player.inventoryAction"),
        "Other authenticated players must not receive another player's local event");

      const snapshot = await request("/snapshot");
      assert(!snapshot.body.recentEvents.some((event) => event.type === "player.inventoryAction"),
        "Shared snapshot baseline must not embed player-local events");
      assert(!JSON.stringify(snapshot.body).includes(authorityA.commandCredential),
        "Command credentials must never appear in shared snapshots");

      const reconnected = await request("/join", {
        method: "POST",
        authority: authorityA,
        body: {
          runId,
          clientId: authorityA.playerId,
          commandCredential: authorityA.commandCredential,
          name: "Authority A Reconnected",
        },
      });
      assert(reconnected.status === 200 && reconnected.body.authority?.reconnected === true,
        "Expected an authenticated reconnect to resume the existing player");
      assert(reconnected.body.authority.commandCredential !== authorityA.commandCredential,
        "Reconnect must rotate command authority within the same run");
      assert(reconnected.body.authority.membershipId === authorityA.membershipId,
        "Reconnect must preserve the server-issued membership");
      assert(reconnected.body.authority.connectionId !== authorityA.connectionId
        && reconnected.body.authority.connectionEpoch === authorityA.connectionEpoch + 1,
      "Reconnect must rotate connection identity and advance its epoch");
      assert(reconnected.body.authority.lastCommandSeq === 1,
        "Reconnect should preserve the monotonic command watermark");
      let activeAuthorityA = reconnected.body.authority;

      const fencedConnection = await request("/input", {
        method: "POST",
        authority: authorityA,
        body: command(authorityA, 2, { seq: 1, moveX: 1 }),
      });
      assert(fencedConnection.status === 403 && fencedConnection.body.code === "invalid-authority",
        `Expected old reconnect authority to be fenced, got ${fencedConnection.status}/${fencedConnection.body.code}`);

      const accepted = await request("/input", {
        method: "POST",
        authority: activeAuthorityA,
        body: command(activeAuthorityA, 2, {
          seq: 1,
          moveX: 1,
          moveY: 0,
          slingshotEdges: [10, 11],
        }),
      });
      assert(accepted.status === 200 && accepted.body.acceptedSlingshotEdges.join(",") === "10,11",
        "Expected ordered queued edges to be accepted once");
      const inputReconnect = await request("/join", {
        method: "POST",
        authority: activeAuthorityA,
        body: { runId, clientId: activeAuthorityA.playerId, name: "Authority A" },
      });
      assert(!JSON.stringify(inputReconnect.body.player).includes(authorityA.commandCredential),
        "Accepted gameplay state must not retain the command credential");
      activeAuthorityA = inputReconnect.body.authority;

      const staleCommand = await request("/input", {
        method: "POST",
        authority: activeAuthorityA,
        body: command(activeAuthorityA, 2, { seq: 2 }),
      });
      assert(staleCommand.status === 409 && staleCommand.body.code === "stale-command",
        `Expected stale command rejection, got ${staleCommand.status}/${staleCommand.body.code}`);

      const staleInput = await request("/input", {
        method: "POST",
        authority: activeAuthorityA,
        body: command(activeAuthorityA, 3, { seq: 1 }),
      });
      assert(staleInput.status === 409 && staleInput.body.code === "stale-input",
        `Expected stale input rejection, got ${staleInput.status}/${staleInput.body.code}`);

      const wrongPlayer = await request("/input", {
        method: "POST",
        body: command(activeAuthorityA, 4, {
          playerId: authorityB.playerId,
          seq: 2,
        }),
      });
      assert(wrongPlayer.status === 403 && wrongPlayer.body.code === "wrong-player",
        `Expected wrong-player rejection, got ${wrongPlayer.status}/${wrongPlayer.body.code}`);

      const dedupedEdge = await request("/input", {
        method: "POST",
        authority: activeAuthorityA,
        body: command(activeAuthorityA, 4, { seq: 2, slingshotEdges: [11, 12] }),
      });
      assert(dedupedEdge.status === 200 && dedupedEdge.body.acceptedSlingshotEdges.join(",") === "12",
        `Expected consumed edge 11 to stay rejected, got ${JSON.stringify(dedupedEdge.body.acceptedSlingshotEdges)}`);

      const reset = await request("/session/reset", {
        method: "POST",
        authority: activeAuthorityA,
        body: command(activeAuthorityA, 5, { requesterId: activeAuthorityA.playerId }),
      });
      assert(reset.status === 200 && reset.body.session.runId !== runId && reset.body.joinTicket,
        "Expected host reset to create a new run and join claim");

      const staleRun = await request("/input", {
        method: "POST",
        authority: authorityA,
        body: command(authorityA, 6, { seq: 3 }),
      });
      assert(staleRun.status === 409 && staleRun.body.code === "stale-run",
        `Expected stale-run rejection, got ${staleRun.status}/${staleRun.body.code}`);

      const joinedNewRun = await request("/join", {
        method: "POST",
        body: {
          runId: reset.body.session.runId,
          clientId: authorityA.playerId,
          joinTicket: reset.body.joinTicket,
          name: "Authority A",
        },
      });
      assert(joinedNewRun.status === 200, "Expected host to join reset run");
      assert(joinedNewRun.body.authority.commandCredential !== authorityA.commandCredential,
        "A new run must rotate player command authority");

      const newAuthority = joinedNewRun.body.authority;
      const left = await request("/leave", {
        method: "POST",
        authority: newAuthority,
        body: command(newAuthority, 1),
      });
      assert(left.status === 200, "Expected authenticated leave to succeed");
      const abandonedRunId = reset.body.session.runId;

      const modulePath = path.join(__dirname, "..", "src", "sim", "sim-client.js");
      const { SimClient } = await import(pathToFileURL(modulePath).href);
      const client = new SimClient(SIM_URL);
      const fresh = await client.ensureSession({ mapId: "shallows", maxPlayers: 4 });
      assert(fresh.runId !== abandonedRunId,
        "A client should replace a running session with no human pilots instead of reusing a ghost run");
      await client.join({ name: "Ghost Session Recovery" });
      const live = await client.sendInput({ moveX: 1, thrust: 0 });
      assert(live.ok === true && live.acceptedCommandSeq === 1,
        "Recovered client should hold valid v2 authority in the fresh run");
      await client.leave();
    });
  } finally {
    await stopSimServer(SIM_PORT).catch(() => null);
  }

  const allPassed = runner.summary();
  process.exit(allPassed ? 0 : 1);
}

run().catch(async (error) => {
  await stopSimServer(SIM_PORT).catch(() => null);
  console.error("ProtocolV2Authority test fatal error:", error.stack || error.message);
  process.exit(1);
});
