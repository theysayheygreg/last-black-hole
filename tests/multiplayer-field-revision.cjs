const { TestRunner, assert, startSimServer, stopSimServer } = require("./helpers.cjs");

const SIM_PORT = 8834;
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

async function waitFor(check, message, timeoutMs = 4000) {
  const deadline = Date.now() + timeoutMs;
  let lastValue = null;
  while (Date.now() < deadline) {
    lastValue = await check();
    if (lastValue?.ok) return lastValue.value;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`${message}; last=${JSON.stringify(lastValue)}`);
}

async function alignedViews(runId, authorities) {
  return waitFor(async () => {
    const responses = await Promise.all([
      request(`/snapshot?runId=${encodeURIComponent(runId)}`),
      ...authorities.map((authority) => request(`/snapshot?runId=${encodeURIComponent(runId)}`, { authority })),
    ]);
    const snapshotIds = new Set(responses.map((response) => response.body.snapshotId));
    return {
      ok: responses.every((response) => response.status === 200) && snapshotIds.size === 1,
      value: responses,
      statuses: responses.map((response) => response.status),
      snapshotIds: [...snapshotIds],
    };
  }, "Snapshot readers did not converge on one authoritative baseline");
}

async function run() {
  const runner = new TestRunner("MultiplayerFieldRevision");
  await startSimServer(SIM_PORT, { keepAlive: true });

  try {
    let activeAuthority = null;

    await runner.run("Disabled coarse field stays at revision one across ticks, reads, and reconnect", async () => {
      const started = await request("/session/start", {
        method: "POST",
        body: {
          mapId: "shallows",
          requesterId: "field-a",
          requesterName: "Field A",
          seed: 8834,
        },
      });
      assert(started.status === 200 && started.body.joinTicket, "Expected Shallows session start");
      const runId = started.body.session.runId;

      const initialHealth = await request("/health");
      const initialSnapshot = await request(`/snapshot?runId=${encodeURIComponent(runId)}`);
      assert(initialHealth.body.fieldRevision === 1, `Expected initial health revision 1, got ${initialHealth.body.fieldRevision}`);
      assert(initialSnapshot.body.fieldRevision === 1, `Expected initial snapshot revision 1, got ${initialSnapshot.body.fieldRevision}`);

      const joinedA = await request("/join", {
        method: "POST",
        body: {
          runId,
          clientId: "field-a",
          joinTicket: started.body.joinTicket,
          name: "Field A",
        },
      });
      const joinedB = await request("/join", {
        method: "POST",
        body: { runId, clientId: "field-b", name: "Field B" },
      });
      assert(joinedA.status === 200 && joinedB.status === 200, "Expected two field-revision recipients");

      const views = await alignedViews(runId, [joinedA.body.authority, joinedB.body.authority]);
      const revisions = new Set(views.map((response) => response.body.fieldRevision));
      assert(revisions.size === 1 && revisions.has(1),
        `Expected every projection of one baseline to carry revision 1, got ${[...revisions]}`);

      const tickBefore = (await request("/health")).body.tick;
      await waitFor(async () => {
        const health = await request("/health");
        return { ok: health.body.tick >= tickBefore + 3, value: health.body };
      }, "Shallows authority ticks did not advance");
      for (let index = 0; index < 5; index += 1) {
        await request("/health");
        await request(`/snapshot?runId=${encodeURIComponent(runId)}`);
      }
      const stableHealth = await request("/health");
      assert(stableHealth.body.fieldRevision === 1,
        `Disabled coarse-field ticks or reads advanced revision to ${stableHealth.body.fieldRevision}`);

      const reconnected = await request("/join", {
        method: "POST",
        authority: joinedA.body.authority,
        body: { runId, clientId: joinedA.body.authority.playerId },
      });
      assert(reconnected.status === 200 && reconnected.body.authority?.reconnected === true,
        "Expected authenticated field-revision reconnect");
      assert((await request("/health")).body.fieldRevision === 1, "Reconnect advanced field revision");
      activeAuthority = reconnected.body.authority;
    });

    await runner.run("Coarse-field rebuild advances revision and reset starts a new revision lineage", async () => {
      const started = await request("/session/start", {
        method: "POST",
        authority: activeAuthority,
        body: command(activeAuthority, 1, {
          mapId: "expanse",
          requesterId: activeAuthority.playerId,
          requesterName: "Field A",
          seed: 8835,
        }),
      });
      assert(started.status === 200 && started.body.session.mapId === "expanse",
        `Expected Expanse start, got ${JSON.stringify(started.body)}`);
      const runId = started.body.session.runId;
      const beforeJoinHealth = await request("/health");
      const beforeJoinSnapshot = await request(`/snapshot?runId=${encodeURIComponent(runId)}`);
      assert(beforeJoinHealth.body.fieldRevision === 1 && beforeJoinSnapshot.body.fieldRevision === 1,
        `New Expanse lineage did not start at revision 1: health=${beforeJoinHealth.body.fieldRevision}, snapshot=${beforeJoinSnapshot.body.fieldRevision}`);

      const joined = await request("/join", {
        method: "POST",
        body: {
          runId,
          clientId: "field-a",
          joinTicket: started.body.joinTicket,
          name: "Field A",
        },
      });
      assert(joined.status === 200, "Expected host to join Expanse revision fixture");
      const authority = joined.body.authority;

      const rebuiltHealth = await waitFor(async () => {
        const health = await request("/health");
        return { ok: health.body.fieldRevision > 1, value: health.body };
      }, "Scheduled Expanse coarse-field rebuild did not advance revision");
      const rebuiltSnapshot = await waitFor(async () => {
        const snapshot = await request(`/snapshot?runId=${encodeURIComponent(runId)}`);
        return {
          ok: snapshot.body.fieldRevision >= rebuiltHealth.fieldRevision,
          value: snapshot.body,
        };
      }, "Public snapshot did not expose rebuilt field revision");
      assert(Number.isInteger(rebuiltSnapshot.fieldRevision) && rebuiltSnapshot.fieldRevision > 1,
        `Expected positive rebuilt snapshot revision, got ${rebuiltSnapshot.fieldRevision}`);

      const reset = await request("/session/reset", {
        method: "POST",
        authority,
        body: command(authority, 1, { requesterId: authority.playerId }),
      });
      assert(reset.status === 200 && reset.body.session.runId !== runId, "Expected reset to rotate run lineage");
      const resetRunId = reset.body.session.runId;
      const resetHealth = await request("/health");
      const resetSnapshot = await request(`/snapshot?runId=${encodeURIComponent(resetRunId)}`);
      assert(resetHealth.body.fieldRevision === 1 && resetSnapshot.body.fieldRevision === 1,
        `Reset lineage did not restart at revision 1: health=${resetHealth.body.fieldRevision}, snapshot=${resetSnapshot.body.fieldRevision}`);
      assert(resetSnapshot.body.runId === resetRunId, "Reset snapshot carried the wrong run lineage");

      const staleWindow = await request(`/snapshots?runId=${encodeURIComponent(runId)}&since=0`);
      assert(staleWindow.status === 200 && staleWindow.body.status === "reset" && staleWindow.body.snapshots.length === 0,
        "Old run revision lineage did not request a clean snapshot rebase");
    });
  } finally {
    await stopSimServer(SIM_PORT).catch(() => null);
  }

  process.exit(runner.summary() ? 0 : 1);
}

run().catch(async (error) => {
  await stopSimServer(SIM_PORT).catch(() => null);
  console.error("MultiplayerFieldRevision test fatal error:", error.stack || error.message);
  process.exit(1);
});
