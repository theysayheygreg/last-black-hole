const { TestRunner, assert, startSimServer, stopSimServer } = require("./helpers.cjs");

const SIM_PORT = 8807;
const SIM_URL = `http://127.0.0.1:${SIM_PORT}`;

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchRaw(path) {
  const response = await fetch(`${SIM_URL}${path}`);
  const text = await response.text();
  return { status: response.status, text, body: JSON.parse(text) };
}

async function postJson(path, payload) {
  const response = await fetch(`${SIM_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await response.json();
  return { status: response.status, body };
}

async function waitForHealth(predicate, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = (await fetchRaw("/health")).body;
    if (predicate(last)) return last;
    await sleep(150);
  }
  throw new Error(`Timed out waiting for health condition. Last=${JSON.stringify({
    tick: last?.tick,
    simTime: last?.simTime,
    session: last?.session,
    ballpark: last?.ballpark,
    eventJournal: last?.eventJournal,
  })}`);
}

async function run() {
  const runner = new TestRunner("SimBoundedGrowth");

  await runner.run("Deep-field run stays bounded and stops growing after timeout", async () => {
    await startSimServer(SIM_PORT, {
      keepAlive: true,
      idleShutdownMs: 5000,
      env: {
        LBH_SIM_MAX_SIM_TIME: "2",
        LBH_SIM_FINAL_EXFIL_DURATION: "2",
        LBH_SIM_TERMINAL_GRACE_MS: "60000",
      },
    });
    try {
      const start = await postJson("/session/start", {
        mapId: "deep-field",
        requesterId: "bounded-growth-test",
        requesterName: "Bounded Growth Test",
        seed: 7804,
      });
      assert(start.status === 200 && start.body.ok === true, `Expected start success, got ${start.status}`);
      assert(start.body.session.runDurationSeconds === 2,
        "Explicit short-fixture override must remain the resolved test duration");
      const join = await postJson("/join", {
        runId: start.body.session.runId,
        clientId: "bounded-growth-test",
        name: "Bounded Growth Test",
        joinTicket: start.body.joinTicket,
      });
      assert(join.status === 200 && join.body.ok === true, `Expected join success, got ${join.status}`);

      const samples = [];
      const startedAt = Date.now();
      while (Date.now() - startedAt < 3500) {
        samples.push((await fetchRaw("/health")).body);
        await sleep(250);
      }
      assert(samples.length >= 4, "Expected multiple bounded-growth samples");
      for (const sample of samples) {
        assert(sample.ballpark?.bodyCount <= 2000,
          `Expected bounded Ballpark body count, got ${sample.ballpark?.bodyCount}`);
        assert(sample.ballpark?.activeBodyCount <= sample.ballpark?.bodyCount,
          "Expected active body count to stay within total body count");
        assert((sample.ballpark?.duplicateIds || []).length === 0,
          `Expected no duplicate Ballpark ids, got ${JSON.stringify(sample.ballpark?.duplicateIds)}`);
        assert(Number.isFinite(sample.ballpark?.lastRebuildMs) && sample.ballpark.lastRebuildMs <= 100,
          `Expected deep-field Ballpark rebuild to stay within structural budget, got ${sample.ballpark?.lastRebuildMs}ms`);
        assert(sample.eventJournal?.retainedCount <= sample.eventJournal?.capacity,
          "Expected event journal retained events to stay within capacity");
      }

      const snapshotRaw = await fetchRaw("/snapshot");
      assert(snapshotRaw.status === 200, `Expected /snapshot 200, got ${snapshotRaw.status}`);
      assert(Buffer.byteLength(snapshotRaw.text) < 2_000_000,
        `Expected snapshot payload below 2MB, got ${Buffer.byteLength(snapshotRaw.text)}`);
      assert(snapshotRaw.body.lastEventSeq <= samples.at(-1).eventJournal.lastSeq,
        "Expected snapshot event watermark not to outrun health journal");

      const ended = await waitForHealth((body) => body.session?.status === "ended", 8000);
      const endTick = ended.tick;
      const endBodyCount = ended.ballpark?.bodyCount || 0;
      const endLastSeq = ended.eventJournal?.lastSeq || 0;
      await sleep(900);
      const afterIdle = (await fetchRaw("/health")).body;
      assert(afterIdle.tick === endTick, `Expected ended session tick to stop at ${endTick}, got ${afterIdle.tick}`);
      assert(afterIdle.ballpark?.bodyCount === endBodyCount,
        `Expected ended session Ballpark body count to stabilize at ${endBodyCount}, got ${afterIdle.ballpark?.bodyCount}`);
      assert(afterIdle.eventJournal?.lastSeq === endLastSeq,
        `Expected ended session event seq to stabilize at ${endLastSeq}, got ${afterIdle.eventJournal?.lastSeq}`);
    } finally {
      await stopSimServer(SIM_PORT).catch(() => null);
    }
  });

  const allPassed = runner.summary();
  process.exit(allPassed ? 0 : 1);
}

run().catch(async (err) => {
  await stopSimServer(SIM_PORT).catch(() => null);
  console.error("SimBoundedGrowth test fatal error:", err.message);
  process.exit(1);
});
