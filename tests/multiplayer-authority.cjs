const { performance } = require("perf_hooks");
const {
  TestRunner,
  assert,
  startSimServer,
  stopSimServer,
} = require("./helpers.cjs");

const SIM_PORT = 8894;
const SIM_URL = `http://127.0.0.1:${SIM_PORT}`;
const HUMAN_COUNTS = [1, 4, 8];
const SNAPSHOT_ROUNDS = 6;
const RESULT_REPLAY_COUNT = 100;
const PRIVATE_PLAYER_KEYS = [
  "profileId", "rigLevels", "abilityState", "deltaV", "deltaVMax", "deltaVRatio",
  "lastInputSeq", "lastInputBrake", "pendingSlingshotEdgeCount", "cargo", "cargoCount",
  "equipped", "consumables", "activeEffects", "effectState", "portalInteraction", "signal",
  "controlDebuff",
];

function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * fraction) - 1),
  );
  return sorted[index] || 0;
}

function round(value, places = 2) {
  const scale = 10 ** places;
  return Math.round(Number(value || 0) * scale) / scale;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function request(pathname, { method = "GET", body = null, authority = null } = {}) {
  const headers = { "content-type": "application/json" };
  if (authority) {
    headers["x-lbh-command-credential"] = authority.commandCredential;
    headers["x-lbh-player-id"] = authority.playerId;
    headers["x-lbh-run-id"] = authority.runId;
  }
  const started = performance.now();
  const response = await fetch(`${SIM_URL}${pathname}`, {
    method,
    headers,
    body: body == null ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return {
    status: response.status,
    body: JSON.parse(text),
    bytes: Buffer.byteLength(text),
    elapsedMs: performance.now() - started,
  };
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

function playerFixture(humanCount, index) {
  const suffix = `${humanCount}-${index + 1}`;
  return {
    clientId: `multiplayer-human-${suffix}`,
    profileId: `multiplayer-profile-${suffix}`,
    name: `Multiplayer Human ${suffix}`,
    secretItemId: `owner-private-item-${suffix}`,
  };
}

function stableMembership(snapshot) {
  return snapshot.players
    .filter((player) => !player.isAI)
    .map((player) => ({
      clientId: player.clientId,
      name: player.name,
      hullType: player.hullType,
      status: player.status,
    }))
    .sort((a, b) => a.clientId.localeCompare(b.clientId));
}

function publicPlayerProjection(player) {
  const projected = { ...player };
  for (const key of PRIVATE_PLAYER_KEYS) delete projected[key];
  if (projected.slingshot) {
    projected.slingshot = { ...projected.slingshot };
    delete projected.slingshot.energy;
    delete projected.slingshot.chainCount;
    delete projected.slingshot.engageRadius;
  }
  return projected;
}

function publicSnapshotProjection(snapshot) {
  return {
    ...snapshot,
    players: snapshot.players.map(publicPlayerProjection),
  };
}

function assertPublicPlayer(player, label) {
  for (const key of PRIVATE_PLAYER_KEYS) {
    assert(!Object.prototype.hasOwnProperty.call(player, key), `${label} leaked private key '${key}'`);
  }
  assert(!Object.prototype.hasOwnProperty.call(player?.slingshot || {}, "energy"),
    `${label} leaked private slingshot energy`);
  assert(!Object.prototype.hasOwnProperty.call(player?.slingshot || {}, "chainCount"),
    `${label} leaked private slingshot chain state`);
  assert(!Object.prototype.hasOwnProperty.call(player?.slingshot || {}, "engageRadius"),
    `${label} leaked private slingshot engage radius`);
}

function firstDifference(left, right, path = "snapshot") {
  if (Object.is(left, right)) return null;
  if (typeof left !== "object" || left === null || typeof right !== "object" || right === null) {
    return `${path}: ${JSON.stringify(left)} !== ${JSON.stringify(right)}`;
  }
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.join(",") !== rightKeys.join(",")) {
    return `${path} keys: ${leftKeys.join(",")} !== ${rightKeys.join(",")}`;
  }
  for (const key of leftKeys) {
    const difference = firstDifference(left[key], right[key], `${path}.${key}`);
    if (difference) return difference;
  }
  return null;
}

async function waitFor(predicate, { timeoutMs = 4000, intervalMs = 25 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await predicate();
    if (last?.ok) return last.value;
    await sleep(intervalMs);
  }
  throw new Error(`Timed out waiting for multiplayer authority truth: ${JSON.stringify(last)}`);
}

async function waitForProfileResult(profileId, runId, deathsBefore) {
  return waitFor(async () => {
    const response = await request(`/profile?profileId=${encodeURIComponent(profileId)}`);
    const matchingRuns = response.body.recentRuns?.filter((run) => run.runId === runId) || [];
    return {
      ok: response.status === 200 && response.body.profile?.totalDeaths === deathsBefore + 1 && matchingRuns.length === 1,
      value: response.body,
      status: response.status,
      totalDeaths: response.body.profile?.totalDeaths,
      matchingRuns: matchingRuns.length,
    };
  });
}

function reportExpectedGap(label, present, detail) {
  const state = present == null ? "NOT-EXERCISED" : present ? "EXPECTED-FAIL" : "RESOLVED";
  console.log(`        ${state}: ${label}${detail ? ` — ${detail}` : ""}`);
}

async function readAlignedViews(runId, authorities) {
  return waitFor(async () => {
    const [publicView, ...ownerViews] = await Promise.all([
      request(`/snapshot?runId=${encodeURIComponent(runId)}`),
      ...authorities.map((authority) => request(`/snapshot?runId=${encodeURIComponent(runId)}`, {
        authority,
      })),
    ]);
    const views = [publicView, ...ownerViews];
    const snapshotIds = new Set(views.map((view) => view.body.snapshotId));
    return {
      ok: views.every((view) => view.status === 200 && view.body.runId === runId) && snapshotIds.size === 1,
      value: { publicView, ownerViews },
      statuses: views.map((view) => view.status),
      snapshotIds: [...snapshotIds],
    };
  });
}

async function runScenario(humanCount) {
  await startSimServer(SIM_PORT, { keepAlive: true });
  try {
    const fixtures = Array.from({ length: humanCount }, (_, index) => playerFixture(humanCount, index));
    const started = await request("/session/start", {
      method: "POST",
      body: {
        mapId: "shallows",
        maxPlayers: humanCount,
        requesterId: fixtures[0].clientId,
        requesterName: fixtures[0].name,
        seed: 904_000 + humanCount,
      },
    });
    assert(started.status === 200 && started.body.ok, `Expected ${humanCount}-human session start`);
    const runId = started.body.session.runId;
    const joins = [];

    for (let index = 0; index < fixtures.length; index++) {
      const fixture = fixtures[index];
      const joined = await request("/join", {
        method: "POST",
        body: {
          runId,
          clientId: fixture.clientId,
          profileId: fixture.profileId,
          name: fixture.name,
          joinTicket: index === 0 ? started.body.joinTicket : undefined,
          profileSnapshot: {
            id: fixture.profileId,
            name: fixture.name,
            rigLevels: [index % 3, 0, 0],
            loadout: {
              equipped: [{
                id: fixture.secretItemId,
                name: `Private Fixture ${index + 1}`,
                category: "artifact",
                tier: "common",
                value: index + 1,
              }],
              consumables: [],
            },
          },
        },
      });
      assert(joined.status === 200 && joined.body.ok, `Human ${index + 1}/${humanCount} failed to join`);
      assert(joined.body.authority?.runId === runId, `Human ${index + 1} received authority for another run`);
      assert(joined.body.authority?.playerId === fixture.clientId, `Human ${index + 1} received wrong player authority`);
      joins.push(joined.body.authority);
    }

    assert(new Set(joins.map((authority) => authority.commandCredential)).size === humanCount,
      "Every human must receive a unique command credential");

    const inputReceipts = await Promise.all(joins.map((authority, index) => request("/input", {
      method: "POST",
      authority,
      body: command(authority, 1, {
        seq: 1,
        moveX: index % 2 === 0 ? 1 : -1,
        moveY: index % 3 === 0 ? 0.5 : -0.5,
        thrust: 0.35 + index * 0.01,
        brake: 0,
      }),
    })));
    inputReceipts.forEach((receipt, index) => {
      assert(receipt.status === 200 && receipt.body.ok,
        `Human ${index + 1}/${humanCount} input was not accepted`);
      assert(receipt.body.acceptedSeq === 1 && receipt.body.acceptedCommandSeq === 1,
        `Human ${index + 1}/${humanCount} input acknowledgement diverged`);
    });

    const settledViews = await waitFor(async () => {
      const aligned = await readAlignedViews(runId, joins);
      const membership = stableMembership(aligned.publicView.body);
      return {
        ok: aligned.publicView.body.runId === runId &&
          membership.length === humanCount &&
          aligned.ownerViews.every((view, index) => {
            const owner = view.body.players.find((player) => player.clientId === joins[index].playerId);
            return owner?.lastInputSeq === 1;
          }),
        value: aligned,
        runId: aligned.publicView.body.runId,
        membership,
      };
    });
    const expectedMembership = fixtures.map((fixture) => fixture.clientId).sort();
    assert(stableMembership(settledViews.publicView.body).map((player) => player.clientId).join(",") === expectedMembership.join(","),
      "Authoritative membership did not contain the exact expected humans");

    const baselineHealth = await request("/health");
    const sampleStarted = performance.now();
    const publicSamples = [];
    const ownerSamples = [];
    const ownerOverlayBytes = [];
    for (let roundIndex = 0; roundIndex < SNAPSHOT_ROUNDS; roundIndex++) {
      const { publicView, ownerViews } = await readAlignedViews(runId, joins);
      assert(!Object.prototype.hasOwnProperty.call(publicView.body.session, "hostProfileId"),
        "Public session projection leaked host profile identity");
      for (const player of publicView.body.players) assertPublicPlayer(player, "public player");
      const publicJson = JSON.stringify(publicView.body);
      for (const fixture of fixtures) {
        assert(!publicJson.includes(fixture.profileId) && !publicJson.includes(fixture.secretItemId),
          `Public snapshot leaked ${fixture.clientId} profile or loadout identity`);
      }

      ownerViews.forEach((view, ownerIndex) => {
        const projectionDifference = firstDifference(publicSnapshotProjection(view.body), publicView.body);
        assert(!projectionDifference,
          `Owner ${ownerIndex + 1} disagreed with the aligned shared public snapshot: ${projectionDifference}`);
        const privatePlayers = view.body.players.filter((player) =>
          Object.prototype.hasOwnProperty.call(player, "profileId")
        );
        assert(privatePlayers.length === 1 && privatePlayers[0].clientId === joins[ownerIndex].playerId,
          `Owner ${ownerIndex + 1} view contained another player's private overlay`);
        const owner = privatePlayers[0];
        assert(owner.profileId === fixtures[ownerIndex].profileId && owner.lastInputSeq === 1,
          `Owner ${ownerIndex + 1} did not receive its own profile/input truth`);
        assert(owner.equipped.some((item) => item?.id === fixtures[ownerIndex].secretItemId),
          `Owner ${ownerIndex + 1} did not receive its private loadout marker`);
        for (const rival of view.body.players.filter((player) => player.clientId !== owner.clientId)) {
          assertPublicPlayer(rival, `rival in owner ${ownerIndex + 1} view`);
        }
      });

      assert(JSON.stringify(stableMembership(publicView.body)) === JSON.stringify(stableMembership(settledViews.publicView.body)),
        "Aligned views disagreed on stable public membership truth");
      publicSamples.push(publicView);
      ownerSamples.push(...ownerViews);
      ownerOverlayBytes.push(...ownerViews.map((view) => view.bytes - publicView.bytes));
      await sleep(35);
    }
    const finalHealth = await request("/health");
    const sampleElapsedSec = Math.max(0.001, (performance.now() - sampleStarted) / 1000);
    const observedTickHz = (finalHealth.body.tick - baselineHealth.body.tick) / sampleElapsedSec;

    reportExpectedGap(
      "server-created membership is not required for non-host joins",
      humanCount > 1 ? true : null,
      humanCount > 1 ? `${humanCount - 1} client ids joined without a membership claim` : "single-host fixture has no rival join",
    );

    const resultAuthority = joins[0];
    const resultFixture = fixtures[0];
    const profileBeforeResult = await request(`/profile?profileId=${encodeURIComponent(resultFixture.profileId)}`);
    assert(profileBeforeResult.status === 200, "Expected fixture profile before result replay");
    const deathsBefore = Number(profileBeforeResult.body.profile?.totalDeaths) || 0;
    const firstDeath = await request("/debug/player-state", {
      method: "POST",
      body: { clientId: resultFixture.clientId, status: "dead", cause: "multiplayer-fixture" },
    });
    assert(firstDeath.status === 200 && firstDeath.body.ok, "Expected fixture death to commit a result");
    for (let replayIndex = 1; replayIndex < RESULT_REPLAY_COUNT; replayIndex++) {
      const replay = await request("/debug/player-state", {
        method: "POST",
        body: { clientId: resultFixture.clientId, status: "dead", cause: "multiplayer-fixture-replay" },
      });
      assert(replay.status === 200 && replay.body.ok, `Result replay ${replayIndex + 1} failed`);
    }

    const firstEvents = await request(`/events?runId=${encodeURIComponent(runId)}&since=0`, {
      authority: resultAuthority,
    });
    const replayedEvents = await request(`/events?runId=${encodeURIComponent(runId)}&since=0`, {
      authority: resultAuthority,
    });
    const firstResults = firstEvents.body.events.filter((event) =>
      event.type === "run.result" && event.payload?.clientId === resultFixture.clientId
    );
    const replayedResults = replayedEvents.body.events.filter((event) =>
      event.type === "run.result" && event.payload?.clientId === resultFixture.clientId
    );
    assert(firstResults.length === 1 && replayedResults.length === 1,
      `Expected one replayable run.result event, got ${firstResults.length}/${replayedResults.length}`);
    assert(JSON.stringify(firstResults[0]) === JSON.stringify(replayedResults[0]),
      "Repeated result delivery changed event truth");
    assert(firstResults[0].payload.runId === runId && firstResults[0].payload.outcome === "dead",
      "Run result did not carry authoritative run/outcome truth");

    const persisted = await waitForProfileResult(resultFixture.profileId, runId, deathsBefore);
    assert(persisted.profile.totalDeaths - deathsBefore === 1,
      "100 outcome attempts must increment totalDeaths once");
    assert(persisted.recentRuns.filter((run) => run.runId === runId).length === 1,
      "100 outcome attempts must produce one durable run record");

    for (let index = 1; index < fixtures.length; index++) {
      const terminal = await request("/debug/player-state", {
        method: "POST",
        body: { clientId: fixtures[index].clientId, status: "dead", cause: "crew-result-fixture" },
      });
      assert(terminal.status === 200 && terminal.body.ok,
        `Expected crew member ${index + 1} death to reach canonical result`);
    }
    const terminalSnapshot = await request(`/snapshot?runId=${encodeURIComponent(runId)}`, {
      authority: resultAuthority,
    });
    const crewResult = terminalSnapshot.body.session?.crewResult;
    assert(terminalSnapshot.body.session?.status === "ended", "Expected terminal crew session");
    assert(crewResult?.runId === runId && crewResult?.outcome === "crew-lost",
      "Canonical crew result did not carry shared run/outcome truth");
    assert(crewResult?.crewSize === humanCount && crewResult?.lostCount === humanCount,
      `Canonical crew result count mismatch for ${humanCount} humans`);
    assert(Array.isArray(crewResult?.members) && crewResult.members.length === humanCount,
      "Canonical crew result omitted public crew members");
    assert(crewResult.members.every((member) => !Object.keys(member).some((key) => PRIVATE_PLAYER_KEYS.includes(key))),
      "Canonical crew result leaked owner-private fields");

    const terminalEvents = await request(`/events?runId=${encodeURIComponent(runId)}&since=0`, {
      authority: resultAuthority,
    });
    const endedEvents = terminalEvents.body.events.filter((event) => event.type === "session.ended");
    assert(endedEvents.length === 1, `Expected one canonical session.ended event, got ${endedEvents.length}`);
    assert(JSON.stringify(endedEvents[0].payload.crewResult) === JSON.stringify(crewResult),
      "Crew result diverged between the public event and session snapshot");

    const publicSnapshotBytes = publicSamples.map((sample) => sample.bytes);
    const ownerSnapshotBytes = ownerSamples.map((sample) => sample.bytes);
    const publicSnapshotLatencies = publicSamples.map((sample) => sample.elapsedMs);
    const ownerSnapshotLatencies = ownerSamples.map((sample) => sample.elapsedMs);
    const heapStart = baselineHealth.body.process.memory.heapUsed;
    const heapEnd = finalHealth.body.process.memory.heapUsed;
    const metrics = {
      humans: humanCount,
      runMembership: stableMembership(settledViews.publicView.body).length,
      inputReceipts: inputReceipts.length,
      publicSnapshotSamples: publicSamples.length,
      ownerSnapshotSamples: ownerSamples.length,
      publicSnapshotBytesP50: percentile(publicSnapshotBytes, 0.50),
      publicSnapshotBytesP95: percentile(publicSnapshotBytes, 0.95),
      ownerSnapshotBytesP50: percentile(ownerSnapshotBytes, 0.50),
      ownerSnapshotBytesP95: percentile(ownerSnapshotBytes, 0.95),
      ownerOverlayBytesP95: percentile(ownerOverlayBytes, 0.95),
      publicSnapshotResponseMsP50: round(percentile(publicSnapshotLatencies, 0.50), 3),
      publicSnapshotResponseMsP95: round(percentile(publicSnapshotLatencies, 0.95), 3),
      ownerSnapshotResponseMsP50: round(percentile(ownerSnapshotLatencies, 0.50), 3),
      ownerSnapshotResponseMsP95: round(percentile(ownerSnapshotLatencies, 0.95), 3),
      observedTickHz: round(observedTickHz),
      targetTickHz: finalHealth.body.session.tickHz,
      ballparkLastRebuildMs: round(finalHealth.body.ballpark?.lastRebuildMs, 3),
      heapUsedMiB: round(finalHealth.body.process.memory.heapUsed / 1024 / 1024),
      heapDeltaMiB: round((heapEnd - heapStart) / 1024 / 1024),
      resultReplayAttempts: RESULT_REPLAY_COUNT,
      durableDeathDelta: persisted.profile.totalDeaths - deathsBefore,
      durableRunRecordsForRun: persisted.recentRuns.filter((run) => run.runId === runId).length,
      privacyProjection: "enforced",
      rivalPrivateMarkerVisible: false,
    };
    console.log(`        measurements=${JSON.stringify(metrics)}`);
    return metrics;
  } finally {
    await stopSimServer(SIM_PORT).catch(() => null);
  }
}

async function run() {
  const runner = new TestRunner("MultiplayerAuthority");
  const metrics = [];
  for (const humanCount of HUMAN_COUNTS) {
    await runner.run(`${humanCount} human${humanCount === 1 ? "" : "s"} share authority, input, and replay-safe result truth`, async () => {
      metrics.push(await runScenario(humanCount));
    });
  }
  console.log(`\nMultiplayer authority baseline:\n${JSON.stringify(metrics, null, 2)}`);
  process.exit(runner.summary() ? 0 : 1);
}

run().catch(async (error) => {
  await stopSimServer(SIM_PORT).catch(() => null);
  console.error("MultiplayerAuthority test fatal error:", error.stack || error.message);
  process.exit(1);
});
