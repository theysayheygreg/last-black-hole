const { TestRunner, assert, startSimServer, stopSimServer } = require("./helpers.cjs");

const SIM_PORT = 8806;
const SIM_URL = `http://127.0.0.1:${SIM_PORT}`;

async function getJson(path, options) {
  const response = await fetch(`${SIM_URL}${path}`, options);
  const body = await response.json();
  return { status: response.status, body };
}

async function postJson(path, payload) {
  return getJson(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

async function run() {
  const runner = new TestRunner("ProtocolRuntime");

  await runner.run("Live sim exposes journal-backed events and snapshot watermarks", async () => {
    await startSimServer(SIM_PORT, { keepAlive: true });
    try {
      const start = await postJson("/session/start", {
        mapId: "shallows",
        requesterId: "protocol-runtime-test",
        requesterName: "Protocol Runtime Test",
        seed: 7604,
      });
      assert(start.status === 200 && start.body.ok === true, `Expected start success, got ${start.status}`);
      const runId = start.body.session.runId;

      const join = await postJson("/join", {
        clientId: "protocol-runtime-test",
        name: "Protocol Runtime Test",
      });
      assert(join.status === 200 && join.body.ok === true, `Expected join success, got ${join.status}`);

      const events = await getJson("/events?since=0&lane=global");
      assert(events.status === 200, `Expected /events 200, got ${events.status}`);
      assert(events.body.runId === runId, `Expected runId ${runId}, got ${events.body.runId}`);
      assert(events.body.lastSeq >= 2, `Expected at least two events, got ${events.body.lastSeq}`);
      assert(events.body.events.some((event) => event.type === "session.started"), "Expected session.started event");
      assert(events.body.events.some((event) => event.type === "player.joined"), "Expected player.joined event");
      assert(events.body.events.every((event) => event.runId === runId), "Expected all events to carry current runId");
      assert(events.body.events.every((event) => event.lane === "global"), "Expected global lane filter to return global events");

      const snapshot = await getJson("/snapshot");
      assert(snapshot.status === 200, `Expected /snapshot 200, got ${snapshot.status}`);
      assert(snapshot.body.snapshotId === 1, `Expected first live snapshot id 1, got ${snapshot.body.snapshotId}`);
      assert(snapshot.body.runId === runId, `Expected snapshot runId ${runId}, got ${snapshot.body.runId}`);
      assert(snapshot.body.snapshotSchemaVersion === 2,
        `Expected live snapshot schema 2, got ${snapshot.body.snapshotSchemaVersion}`);
      assert(snapshot.body.lastEventSeq === events.body.lastSeq,
        `Expected snapshot lastEventSeq ${events.body.lastSeq}, got ${snapshot.body.lastEventSeq}`);
      assert(snapshot.body.recentEvents.every((event) => event.runId === runId),
        "Expected snapshot recentEvents to come from the current run");

      const health = await getJson("/health");
      assert(health.body.eventJournal?.runId === runId, "Expected health to expose current event journal runId");
      assert(health.body.eventJournal?.lastSeq === snapshot.body.lastEventSeq,
        "Expected health event journal watermark to match snapshot");
      assert(health.body.eventJournal?.retainedCount <= health.body.eventJournal?.capacity,
        "Expected event journal retention to stay within capacity");
      assert(health.body.snapshotRing?.runId === runId, "Expected health to expose current snapshot ring runId");
      assert(health.body.snapshotRing?.lastSnapshotId === snapshot.body.snapshotId,
        "Expected health snapshot watermark to match the served snapshot");

      const snapshots = await getJson(`/snapshots?runId=${encodeURIComponent(runId)}&since=0`);
      assert(snapshots.status === 200 && snapshots.body.status === "ok",
        `Expected live snapshot window, got ${snapshots.status}/${snapshots.body.status}`);
      assert(snapshots.body.snapshots.length === 1, "Expected one retained live snapshot");
      assert(snapshots.body.snapshots[0].snapshotId === snapshot.body.snapshotId,
        "Expected snapshot window to contain the served baseline");

      const staleSnapshots = await getJson("/snapshots?runId=old-run&since=0");
      assert(staleSnapshots.body.status === "reset", "Expected old snapshot run to request rebase");

      const future = await getJson(`/events?since=${events.body.lastSeq + 99}`);
      assert(future.body.future === true, "Expected future since windows to be explicit");
      assert(future.body.events.length === 0, "Expected future since window to return no events");

      const staleRun = await getJson(`/events?runId=old-run&since=${events.body.lastSeq}`);
      assert(staleRun.body.reset === true, "Expected stale run id to request stream reset");
      assert(staleRun.body.events.length === 0, "Expected stale run read to avoid mixing events");
    } finally {
      await stopSimServer(SIM_PORT).catch(() => null);
    }
  });

  const allPassed = runner.summary();
  process.exit(allPassed ? 0 : 1);
}

run().catch(async (err) => {
  await stopSimServer(SIM_PORT).catch(() => null);
  console.error("ProtocolRuntime test fatal error:", err.message);
  process.exit(1);
});
