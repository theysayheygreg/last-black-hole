const { TestRunner, assert, startSimServer, stopSimServer } = require("./helpers.cjs");
const { pathToFileURL } = require("url");
const path = require("path");

const SIM_PORT = 8825;
const SIM_URL = `http://127.0.0.1:${SIM_PORT}`;
const PRIVATE_KEYS = [
  "profileId", "rigLevels", "abilityState", "deltaV", "deltaVMax", "deltaVRatio",
  "lastInputSeq", "lastInputBrake", "pendingSlingshotEdgeCount", "cargo", "cargoCount",
  "equipped", "consumables", "activeEffects", "effectState", "portalInteraction", "signal",
  "controlDebuff",
];

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

function assertPublicPlayer(player, label) {
  for (const key of PRIVATE_KEYS) {
    assert(!Object.prototype.hasOwnProperty.call(player, key), `${label} leaked owner-private key '${key}'`);
  }
  assert(!Object.prototype.hasOwnProperty.call(player?.slingshot || {}, "energy"),
    `${label} leaked private slingshot energy`);
  assert(!Object.prototype.hasOwnProperty.call(player?.slingshot || {}, "chainCount"),
    `${label} leaked private slingshot chain state`);
}

function player(snapshot, playerId) {
  return snapshot.players?.find((entry) => entry.clientId === playerId);
}

async function run() {
  const runner = new TestRunner("MultiplayerPrivacy");
  await startSimServer(SIM_PORT, { keepAlive: true });

  try {
    await runner.run("HTTP snapshots expose public state plus only the current connection owner's overlay", async () => {
      const start = await request("/session/start", {
        method: "POST",
        body: { mapId: "shallows", requesterId: "privacy-a", requesterName: "Privacy A", seed: 8250 },
      });
      const runId = start.body.session.runId;
      const privateItemA = {
        id: "private-item-a",
        name: "A Secret Loadout",
        category: "artifact",
        subcategory: "equippable",
        tier: "common",
        value: 1,
      };
      const privateItemB = {
        id: "private-item-b",
        name: "B Secret Loadout",
        category: "artifact",
        subcategory: "equippable",
        tier: "common",
        value: 1,
      };
      const joinedA = await request("/join", {
        method: "POST",
        body: {
          runId,
          clientId: "privacy-a",
          joinTicket: start.body.joinTicket,
          name: "Privacy A",
          profileId: "private-profile-a",
          profileSnapshot: { name: "Privacy A", loadout: { equipped: [privateItemA] } },
        },
      });
      const joinedB = await request("/join", {
        method: "POST",
        body: {
          runId,
          clientId: "privacy-b",
          name: "Privacy B",
          profileId: "private-profile-b",
          profileSnapshot: { name: "Privacy B", loadout: { equipped: [privateItemB] } },
        },
      });
      const authorityA1 = joinedA.body.authority;
      const authorityB = joinedB.body.authority;

      const simClientModule = path.join(__dirname, "..", "src", "sim", "sim-client.js");
      const { SimClient } = await import(pathToFileURL(simClientModule).href);
      const authenticatedClient = new SimClient(SIM_URL);
      authenticatedClient.clientId = "privacy-client";
      authenticatedClient.runId = runId;
      await authenticatedClient.join({
        name: "Privacy Client",
        profileId: "private-profile-client",
        profileSnapshot: { name: "Privacy Client" },
      });
      const clientSnapshot = await authenticatedClient.pollSnapshot(true);
      assert(player(clientSnapshot, "privacy-client")?.profileId === "private-profile-client",
        "SimClient snapshot polling did not authenticate its owner-private read");

      const publicLive = await request(`/snapshot?runId=${encodeURIComponent(runId)}`);
      assert(publicLive.status === 200 && publicLive.body.players?.length >= 2,
        "Expected public live snapshot");
      assert(!Object.prototype.hasOwnProperty.call(publicLive.body.session, "hostProfileId"),
        "Public session projection leaked host profile identity");
      assertPublicPlayer(player(publicLive.body, authorityA1.playerId), "public A");
      assertPublicPlayer(player(publicLive.body, authorityB.playerId), "public B");
      const publicJson = JSON.stringify(publicLive.body);
      assert(!publicJson.includes("private-profile-a") && !publicJson.includes("private-profile-b")
        && !publicJson.includes("private-item-a") && !publicJson.includes("private-item-b"),
      "Unauthenticated snapshot serialized private profile/loadout data");

      const viewA = await request(`/snapshot?runId=${encodeURIComponent(runId)}`, { authority: authorityA1 });
      const aAsOwner = player(viewA.body, authorityA1.playerId);
      const bAsRival = player(viewA.body, authorityB.playerId);
      assert(viewA.status === 200 && aAsOwner.profileId === "private-profile-a"
        && aAsOwner.equipped.some((item) => item?.id === "private-item-a")
        && Number.isFinite(aAsOwner.deltaV),
      "A did not receive its owner-private overlay");
      assertPublicPlayer(bAsRival, "B in A view");
      assert(!JSON.stringify(bAsRival).includes("private-item-b"), "A received B's private loadout");

      const viewB = await request(`/snapshot?runId=${encodeURIComponent(runId)}`, { authority: authorityB });
      const bAsOwner = player(viewB.body, authorityB.playerId);
      const aAsRival = player(viewB.body, authorityA1.playerId);
      assert(viewB.status === 200 && bAsOwner.profileId === "private-profile-b"
        && bAsOwner.equipped.some((item) => item?.id === "private-item-b"),
      "B did not receive its owner-private overlay");
      assertPublicPlayer(aAsRival, "A in B view");
      assert(!JSON.stringify(aAsRival).includes("private-item-a"), "B received A's private loadout");

      const publicHistory = await request(`/snapshots?runId=${encodeURIComponent(runId)}&since=0`);
      assert(publicHistory.status === 200 && publicHistory.body.snapshots.length >= 1,
        "Expected retained snapshot history");
      for (const snapshot of publicHistory.body.snapshots) {
        for (const entry of snapshot.players) assertPublicPlayer(entry, "public history player");
      }
      assert(!JSON.stringify(publicHistory.body).includes("private-profile-a"),
        "Unauthenticated history leaked owner-private state");

      const historyA = await request(`/snapshots?runId=${encodeURIComponent(runId)}&since=0`, {
        authority: authorityA1,
      });
      assert(historyA.body.snapshots.every((snapshot) =>
        player(snapshot, authorityA1.playerId)?.profileId === "private-profile-a"
        && !Object.prototype.hasOwnProperty.call(player(snapshot, authorityB.playerId), "profileId")
      ), "Authenticated history did not preserve owner/rival projection");

      const rebase = await request("/snapshots?runId=retired-run&since=0");
      assert(rebase.status === 200 && rebase.body.status === "reset" && rebase.body.snapshots.length === 0,
        "Public stale-run history should request a rebase without returning private snapshots");

      const reconnectA = await request("/join", {
        method: "POST",
        authority: authorityA1,
        body: { runId, clientId: authorityA1.playerId },
      });
      const authorityA2 = reconnectA.body.authority;
      const staleRead = await request(`/snapshot?runId=${encodeURIComponent(runId)}`, { authority: authorityA1 });
      assert(staleRead.status === 403 && staleRead.body.code === "invalid-authority",
        `Stale connection read was not fenced: ${staleRead.status}/${staleRead.body.code}`);
      const freshRead = await request(`/snapshot?runId=${encodeURIComponent(runId)}`, { authority: authorityA2 });
      assert(freshRead.status === 200
        && player(freshRead.body, authorityA2.playerId)?.profileId === "private-profile-a",
      "Rotated connection did not receive its owner-private overlay");
    });
  } finally {
    await stopSimServer(SIM_PORT).catch(() => null);
  }

  process.exit(runner.summary() ? 0 : 1);
}

run().catch(async (error) => {
  await stopSimServer(SIM_PORT).catch(() => null);
  console.error("MultiplayerPrivacy test fatal error:", error.stack || error.message);
  process.exit(1);
});
