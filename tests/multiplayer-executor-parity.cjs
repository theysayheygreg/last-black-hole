const { TestRunner, assert, startSimServer, stopSimServer } = require("./helpers.cjs");

const SIM_PORT = 8833;
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

async function waitFor(check, message, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  let lastValue = null;
  while (Date.now() < deadline) {
    lastValue = await check();
    if (lastValue) return lastValue;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  const resolvedMessage = typeof message === "function" ? message() : message;
  throw new Error(`${resolvedMessage}${lastValue == null ? "" : `; last=${JSON.stringify(lastValue)}`}`);
}

function assertExactError(response, status, expected) {
  assert(response.status === status, `Expected ${status}, got ${response.status}: ${JSON.stringify(response.body)}`);
  assert(JSON.stringify(response.body) === JSON.stringify(expected),
    `Response drift: expected ${JSON.stringify(expected)}, got ${JSON.stringify(response.body)}`);
}

async function run() {
  const runner = new TestRunner("MultiplayerExecutorParity");
  await startSimServer(SIM_PORT, { keepAlive: true });

  try {
    await runner.run("HTTP reference matrix remains exact through transport-neutral executors", async () => {
      const started = await request("/session/start", {
        method: "POST",
        body: {
          mapId: "shallows",
          requesterId: "executor-a",
          requesterName: "Executor A",
          seed: 8833,
        },
      });
      assert(started.status === 200 && started.body.joinTicket, "Expected host join ticket");
      const runId = started.body.session.runId;

      const joinedA = await request("/join", {
        method: "POST",
        body: {
          runId,
          clientId: "executor-a",
          joinTicket: started.body.joinTicket,
          name: "Executor A",
          equipped: [{
            id: "executor-parity-artifact",
            name: "Executor Parity Artifact",
            category: "artifact",
            subcategory: "equippable",
            tier: "common",
            value: 1,
          }, null],
        },
      });
      assert(joinedA.status === 200 && joinedA.body.authority?.commandCredential,
        "Expected authority A");
      const authorityA = joinedA.body.authority;

      const joinedB = await request("/join", {
        method: "POST",
        body: { runId, clientId: "executor-b", name: "Executor B" },
      });
      assert(joinedB.status === 200 && joinedB.body.authority?.commandCredential,
        "Expected authority B");
      const authorityB = joinedB.body.authority;

      const resonantFixture = await request("/debug/player-state", {
        method: "POST",
        body: { clientId: authorityA.playerId, hullType: "resonant" },
      });
      assert(resonantFixture.status === 200
        && resonantFixture.body.player?.abilityState?.hullType === "resonant",
      "Expected harness-only resonant fixture for both held ability fields");

      const valid = await request("/input", {
        method: "POST",
        authority: authorityA,
        body: command(authorityA, 1, {
          seq: 1,
          moveX: 0.75,
          moveY: -0.25,
          ability1: true,
          ability2: true,
          pulse: true,
        }),
      });
      assert(valid.status === 200, `Expected valid input 200, got ${valid.status}`);
      assert(JSON.stringify(valid.body) === JSON.stringify({
        ok: true,
        acceptedCommandSeq: 1,
        acceptedSeq: 1,
        acceptedSlingshotEdges: [],
        pendingSlingshotEdgeCount: 0,
        tick: valid.body.tick,
      }), `Valid input response drift: ${JSON.stringify(valid.body)}`);

      let lastAbilityState = null;
      await waitFor(async () => {
        const snapshot = await request("/snapshot", { authority: authorityA });
        const player = snapshot.body.players?.find((entry) => entry.clientId === authorityA.playerId);
        lastAbilityState = player?.abilityState || null;
        return player?.abilityState?.tapAnchor && player.abilityState.nextPulseInverted === true
          ? player
          : null;
      }, () => `Held ability1/ability2 fields did not reach authoritative ability state: ${JSON.stringify(lastAbilityState)}`);

      const releaseHeldAndPreserveOneShot = await request("/input", {
        method: "POST",
        authority: authorityA,
        body: command(authorityA, 2, {
          seq: 2,
          moveX: 0,
          moveY: 0,
          ability1: false,
          ability2: false,
          pulse: false,
        }),
      });
      assert(releaseHeldAndPreserveOneShot.status === 200
        && releaseHeldAndPreserveOneShot.body.acceptedCommandSeq === 2
        && releaseHeldAndPreserveOneShot.body.acceptedSeq === 2,
      `Expected held-input release, got ${JSON.stringify(releaseHeldAndPreserveOneShot.body)}`);

      await waitFor(async () => {
        const events = await request(`/events?runId=${encodeURIComponent(runId)}&since=0`);
        return events.body.events?.some((event) =>
          event.type === "player.pulse" && event.payload?.clientId === authorityA.playerId
        ) ? events.body.events : null;
      }, "Latched pulse one-shot was not delivered");
      await new Promise((resolve) => setTimeout(resolve, 180));
      const oneShotEvents = await request(`/events?runId=${encodeURIComponent(runId)}&since=0`);
      const pulseCount = oneShotEvents.body.events.filter((event) =>
        event.type === "player.pulse" && event.payload?.clientId === authorityA.playerId
      ).length;
      assert(pulseCount === 1, `Expected reliable pulse one-shot exactly once, got ${pulseCount}`);

      const conflictingIdentity = await request("/input", {
        method: "POST",
        authority: authorityA,
        body: command(authorityA, 3, { clientId: authorityB.playerId, seq: 3 }),
      });
      assertExactError(conflictingIdentity, 400, {
        ok: false,
        code: "conflicting-identity",
        error: "playerId and clientId disagree",
      });

      const invalidCredential = await request("/input", {
        method: "POST",
        body: command(authorityA, 3, { commandCredential: "invalid-credential", seq: 3 }),
      });
      assertExactError(invalidCredential, 403, {
        ok: false,
        code: "invalid-authority",
        error: "Invalid player command authority",
      });

      const wrongPlayer = await request("/input", {
        method: "POST",
        body: command(authorityA, 3, { playerId: authorityB.playerId, seq: 3 }),
      });
      assertExactError(wrongPlayer, 403, {
        ok: false,
        code: "wrong-player",
        error: "Command authority does not own that player",
      });

      const staleCommand = await request("/input", {
        method: "POST",
        authority: authorityA,
        body: command(authorityA, 2, { seq: 3 }),
      });
      assertExactError(staleCommand, 409, {
        ok: false,
        code: "stale-command",
        error: "Command sequence is not newer than the last accepted command",
        acceptedCommandSeq: 2,
      });

      const staleInput = await request("/input", {
        method: "POST",
        authority: authorityA,
        body: command(authorityA, 3, { seq: 2 }),
      });
      assertExactError(staleInput, 409, {
        ok: false,
        code: "stale-input",
        error: "Input sequence is not newer than the last accepted input",
        acceptedCommandSeq: 3,
        acceptedSeq: 2,
      });

      const inventoryFailure = await request("/inventory/action", {
        method: "POST",
        authority: authorityA,
        body: command(authorityA, 4, { action: "unknown-action" }),
      });
      assertExactError(inventoryFailure, 409, {
        ok: false,
        error: "Unknown inventory action",
      });

      const inventorySuccess = await request("/inventory/action", {
        method: "POST",
        authority: authorityA,
        body: command(authorityA, 5, { action: "unequip", equipSlot: 0 }),
      });
      assert(inventorySuccess.status === 200
        && inventorySuccess.body.ok === true
        && inventorySuccess.body.acceptedCommandSeq === 5,
      `Expected inventory success, got ${JSON.stringify(inventorySuccess.body)}`);
      assert(inventorySuccess.body.player.equipped[0] == null
        && inventorySuccess.body.player.cargo.some((item) => item?.id === "executor-parity-artifact"),
      "Inventory executor did not preserve authoritative mutation behavior");
      const projectedOwner = inventorySuccess.body.snapshot.players.find((entry) =>
        entry.clientId === authorityA.playerId
      );
      const projectedOther = inventorySuccess.body.snapshot.players.find((entry) =>
        entry.clientId === authorityB.playerId
      );
      assert(projectedOwner?.cargo?.some((item) => item?.id === "executor-parity-artifact"),
        "Inventory response lost owner-private projection");
      assert(!Object.prototype.hasOwnProperty.call(projectedOther || {}, "cargo"),
        "Inventory response leaked another player's private projection");

      const reset = await request("/session/reset", {
        method: "POST",
        authority: authorityA,
        body: command(authorityA, 6, { requesterId: authorityA.playerId }),
      });
      assert(reset.status === 200 && reset.body.session.runId !== runId,
        `Expected reset, got ${JSON.stringify(reset.body)}`);

      const staleRun = await request("/input", {
        method: "POST",
        authority: authorityA,
        body: command(authorityA, 7, { seq: 3 }),
      });
      assertExactError(staleRun, 409, {
        ok: false,
        code: "stale-run",
        error: "Command does not belong to the active run",
        activeRunId: reset.body.session.runId,
      });
    });
  } finally {
    await stopSimServer(SIM_PORT).catch(() => null);
  }

  process.exit(runner.summary() ? 0 : 1);
}

run().catch(async (error) => {
  await stopSimServer(SIM_PORT).catch(() => null);
  console.error("MultiplayerExecutorParity test fatal error:", error.stack || error.message);
  process.exit(1);
});
