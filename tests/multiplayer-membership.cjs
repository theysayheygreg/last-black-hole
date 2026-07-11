const { TestRunner, assert, startSimServer, stopSimServer } = require("./helpers.cjs");

const SIM_PORT = 8824;
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
  const runner = new TestRunner("MultiplayerMembership");
  await startSimServer(SIM_PORT, { keepAlive: true });

  try {
    await runner.run("server membership binds player commands and reconnect fences the old connection", async () => {
      const start = await request("/session/start", {
        method: "POST",
        body: {
          mapId: "shallows",
          requesterId: "membership-a",
          requesterName: "Membership A",
          seed: 8240,
        },
      });
      assert(start.status === 200 && start.body.joinTicket, "Expected host join claim");
      const runId = start.body.session.runId;

      const joinedA = await request("/join", {
        method: "POST",
        body: {
          runId,
          clientId: "membership-a",
          joinTicket: start.body.joinTicket,
          name: "Membership A",
          equipped: [{ id: "server-owned-loadout", category: "artifact", tier: "common", value: 1 }],
        },
      });
      const authorityA1 = joinedA.body.authority;
      assert(joinedA.status === 200 && authorityA1?.membershipId,
        "Expected a server-issued membership authority");
      assert(authorityA1.connectionId && authorityA1.connectionEpoch === 1,
        "Expected a first server-issued connection epoch");

      const joinedB = await request("/join", {
        method: "POST",
        body: { runId, clientId: "membership-b", name: "Membership B" },
      });
      const authorityB = joinedB.body.authority;
      assert(joinedB.status === 200 && authorityB?.membershipId !== authorityA1.membershipId,
        "Expected distinct server-created memberships");

      const changedBodyClient = await request("/input", {
        method: "POST",
        authority: authorityA1,
        body: command(authorityA1, 1, { clientId: authorityB.playerId, seq: 1, moveX: 1 }),
      });
      assert(changedBodyClient.status === 400 && changedBodyClient.body.code === "conflicting-identity",
        `Expected caller-id conflict rejection, got ${changedBodyClient.status}/${changedBodyClient.body.code}`);

      const credentialImpersonation = await request("/input", {
        method: "POST",
        body: command(authorityA1, 1, { playerId: authorityB.playerId, clientId: authorityB.playerId, seq: 1 }),
      });
      assert(credentialImpersonation.status === 403 && credentialImpersonation.body.code === "wrong-player",
        `Expected membership ownership rejection, got ${credentialImpersonation.status}/${credentialImpersonation.body.code}`);

      const reconnect = await request("/join", {
        method: "POST",
        authority: authorityA1,
        body: {
          runId,
          clientId: authorityA1.playerId,
          name: "Caller Mutated Name",
          profileId: "caller-mutated-profile",
          profileSnapshot: {
            shipType: "breacher",
            upgrades: { thrust: 99 },
            rigLevels: { engine: 99 },
          },
          equipped: [],
          consumables: [{ id: "caller-minted-consumable" }],
        },
      });
      const authorityA2 = reconnect.body.authority;
      assert(reconnect.status === 200 && authorityA2?.reconnected === true,
        "Expected authenticated reconnect");
      assert(authorityA2.membershipId === authorityA1.membershipId,
        "Reconnect must preserve membership identity");
      assert(authorityA2.connectionId !== authorityA1.connectionId
        && authorityA2.connectionEpoch === authorityA1.connectionEpoch + 1,
      "Reconnect must rotate the connection and advance its epoch");
      assert(authorityA2.commandCredential !== authorityA1.commandCredential,
        "Reconnect must rotate the command credential");
      assert(reconnect.body.player.name === "Membership A"
        && reconnect.body.player.profileId == null
        && reconnect.body.player.hullType !== "breacher"
        && reconnect.body.player.equipped.some((item) => item?.id === "server-owned-loadout")
        && !reconnect.body.player.consumables.some((item) => item?.id === "caller-minted-consumable"),
      "Reconnect must rehydrate server state and ignore caller-supplied profile/loadout mutations");

      const fencedOldConnection = await request("/input", {
        method: "POST",
        authority: authorityA1,
        body: command(authorityA1, 1, { seq: 1, moveX: 1 }),
      });
      assert(fencedOldConnection.status === 403 && fencedOldConnection.body.code === "invalid-authority",
        `Expected old connection fencing, got ${fencedOldConnection.status}/${fencedOldConnection.body.code}`);

      const acceptedNewConnection = await request("/input", {
        method: "POST",
        authority: authorityA2,
        body: command(authorityA2, 1, { seq: 1, moveX: 1 }),
      });
      assert(acceptedNewConnection.status === 200 && acceptedNewConnection.body.acceptedCommandSeq === 1,
        "Expected the rotated connection authority to control its bound player");
    });
  } finally {
    await stopSimServer(SIM_PORT).catch(() => null);
  }

  process.exit(runner.summary() ? 0 : 1);
}

run().catch(async (error) => {
  await stopSimServer(SIM_PORT).catch(() => null);
  console.error("MultiplayerMembership test fatal error:", error.stack || error.message);
  process.exit(1);
});
