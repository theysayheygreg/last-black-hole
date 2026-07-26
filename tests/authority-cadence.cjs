const { performance } = require("perf_hooks");
const { TestRunner, assert, startSimServer, stopSimServer } = require("./helpers.cjs");

const SIM_PORT = 8847;
const SIM_URL = `http://127.0.0.1:${SIM_PORT}`;
const SAMPLE_COUNT = 20;
const SAMPLE_INTERVAL_MS = 250;
const MAPS = [
  ["shallows", 5005],
  ["expanse", 15015],
  ["deep-field", 25025],
];

function percentile(values, fraction) {
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1));
  return sorted[index] || 0;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getJson(path) {
  const startedAtMs = performance.now();
  const response = await fetch(`${SIM_URL}${path}`);
  const text = await response.text();
  const capturedAtMs = performance.now();
  return {
    status: response.status,
    body: JSON.parse(text),
    elapsedMs: capturedAtMs - startedAtMs,
    bytes: Buffer.byteLength(text),
    capturedAtMs,
  };
}

async function postJson(path, payload) {
  const response = await fetch(`${SIM_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  return { status: response.status, body: await response.json() };
}

async function measure(mapId, seed) {
  await startSimServer(SIM_PORT, { keepAlive: true });
  try {
    const start = await postJson("/session/start", {
      mapId,
      requesterId: `cadence-${mapId}`,
      requesterName: `Cadence ${mapId}`,
      seed,
    });
    assert(start.status === 200 && start.body.ok, `${mapId}: expected session start`);
    const join = await postJson("/join", {
      runId: start.body.session.runId,
      clientId: `cadence-${mapId}`,
      name: `Cadence ${mapId}`,
      joinTicket: start.body.joinTicket,
    });
    assert(join.status === 200 && join.body.ok, `${mapId}: expected authority join`);

    await sleep(750);
    const baseline = await getJson("/health");
    const tickStart = baseline.body.tick;
    const queryUsageStart = baseline.body.ballpark?.queryUsage || {};
    const snapshotLatencyMs = [];
    const snapshotBytes = [];
    const ballparkSyncMs = [];
    let lastHealth = baseline;

    for (let index = 0; index < SAMPLE_COUNT; index += 1) {
      const snapshot = await getJson("/snapshot");
      const health = await getJson("/health");
      assert(snapshot.status === 200 && health.status === 200, `${mapId}: authority endpoints must stay healthy`);
      snapshotLatencyMs.push(snapshot.elapsedMs);
      snapshotBytes.push(snapshot.bytes);
      ballparkSyncMs.push(Number(health.body.ballpark?.lastRebuildMs) || 0);
      lastHealth = health;
      await sleep(SAMPLE_INTERVAL_MS);
    }

    const elapsedSec = (lastHealth.capturedAtMs - baseline.capturedAtMs) / 1000;
    const tickCount = lastHealth.body.tick - tickStart;
    const targetTickHz = Number(lastHealth.body.session.tickHz) || 1;
    const observedTickHz = tickCount / elapsedSec;
    const scheduler = lastHealth.body.scheduler;
    const queryUsageEnd = lastHealth.body.ballpark?.queryUsage || {};
    const circleQueries = (queryUsageEnd.queryCircleCount || 0) - (queryUsageStart.queryCircleCount || 0);

    assert(observedTickHz >= targetTickHz * 0.99,
      `${mapId}: ${observedTickHz.toFixed(2)}Hz fell outside the 1% wall-clock tolerance`);
    assert(observedTickHz <= targetTickHz * 1.01,
      `${mapId}: ${observedTickHz.toFixed(2)}Hz exceeded the 1% wall-clock tolerance`);
    assert(scheduler, `${mapId}: expected deadline scheduler diagnostics`);
    assert(scheduler.intervalMs === 66.666667, `${mapId}: expected canonical fractional 15Hz deadline interval`);
    assert(scheduler.catchUpTicks === 0, `${mapId}: idle-host receipt must not need catch-up ticks`);
    assert(scheduler.skippedDeadlines === 0, `${mapId}: idle-host receipt silently lost ${scheduler.skippedDeadlines} deadlines`);

    return {
      mapId,
      observedTickHz: Number(observedTickHz.toFixed(3)),
      authorityTicks: tickCount,
      p95SnapshotMs: Number(percentile(snapshotLatencyMs, 0.95).toFixed(3)),
      p95SnapshotKiB: Number((percentile(snapshotBytes, 0.95) / 1024).toFixed(3)),
      p95BallparkSyncMs: Number(percentile(ballparkSyncMs, 0.95).toFixed(3)),
      ballparkQueriesPerTick: Number((circleQueries / Math.max(1, tickCount)).toFixed(2)),
      catchUpTicks: scheduler.catchUpTicks,
      skippedDeadlines: scheduler.skippedDeadlines,
    };
  } finally {
    await stopSimServer(SIM_PORT).catch(() => null);
  }
}

async function run() {
  const runner = new TestRunner("AuthorityCadence");
  await runner.run("5/15/25 maps sustain the canonical authority deadline", async () => {
    const results = [];
    for (const [mapId, seed] of MAPS) results.push(await measure(mapId, seed));
    console.log(JSON.stringify(results, null, 2));
  });
  process.exit(runner.summary() ? 0 : 1);
}

run().catch(async (error) => {
  await stopSimServer(SIM_PORT).catch(() => null);
  console.error(error.stack || error.message);
  process.exit(1);
});
