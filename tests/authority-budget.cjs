const { performance } = require("perf_hooks");
const { TestRunner, assert, startSimServer, stopSimServer } = require("./helpers.cjs");

const SIM_PORT = 8830;
const SIM_URL = `http://127.0.0.1:${SIM_PORT}`;
const SAMPLE_COUNT = 20;
const SAMPLE_INTERVAL_MS = 250;

function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1));
  return sorted[index] || 0;
}

async function getJson(path) {
  const started = performance.now();
  const response = await fetch(`${SIM_URL}${path}`);
  const text = await response.text();
  const elapsedMs = performance.now() - started;
  return { status: response.status, body: JSON.parse(text), bytes: Buffer.byteLength(text), elapsedMs };
}

async function postJson(path, payload) {
  const response = await fetch(`${SIM_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  return { status: response.status, body: await response.json() };
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  const runner = new TestRunner("AuthorityBudget");

  await runner.run("Deep Field stays inside explicit sim and transport budgets", async () => {
    await startSimServer(SIM_PORT, { keepAlive: true });
    try {
      const start = await postJson("/session/start", {
        mapId: "deep-field",
        requesterId: "authority-budget",
        requesterName: "Authority Budget",
        seed: 300903,
      });
      assert(start.status === 200 && start.body.ok, "Expected Deep Field session start");
      const join = await postJson("/join", {
        runId: start.body.session.runId,
        clientId: "authority-budget",
        name: "Authority Budget",
        joinTicket: start.body.joinTicket,
      });
      assert(join.status === 200 && join.body.ok, "Expected authority budget player join");

      await sleep(1000);
      const baseline = await getJson("/health");
      const tickStart = baseline.body.tick;
      const wallStart = performance.now();
      const heapStart = baseline.body.process.memory.heapUsed;
      const queryUsageStart = baseline.body.ballpark?.queryUsage || {};
      const latencies = [];
      const snapshotBytes = [];
      const rebuildTimes = [];
      let lastHealth = baseline.body;

      for (let index = 0; index < SAMPLE_COUNT; index++) {
        const snapshot = await getJson("/snapshot");
        const health = await getJson("/health");
        assert(snapshot.status === 200 && health.status === 200, "Expected budget endpoints to stay healthy");
        latencies.push(snapshot.elapsedMs);
        snapshotBytes.push(snapshot.bytes);
        rebuildTimes.push(Number(health.body.ballpark?.lastRebuildMs) || 0);
        lastHealth = health.body;
        await sleep(SAMPLE_INTERVAL_MS);
      }

      const elapsedSec = (performance.now() - wallStart) / 1000;
      const observedTickHz = (lastHealth.tick - tickStart) / elapsedSec;
      const targetTickHz = Number(lastHealth.session.tickHz) || 1;
      const heapGrowth = lastHealth.process.memory.heapUsed - heapStart;
      const p95Latency = percentile(latencies, 0.95);
      const p95SnapshotBytes = percentile(snapshotBytes, 0.95);
      const p95RebuildMs = percentile(rebuildTimes, 0.95);
      const estimatedSnapshotBytesPerSec = p95SnapshotBytes * (Number(lastHealth.session.snapshotHz) || 1);
      const queryUsageEnd = lastHealth.ballpark?.queryUsage || {};
      const tickCount = lastHealth.tick - tickStart;
      const circleQueries = (queryUsageEnd.queryCircleCount || 0) - (queryUsageStart.queryCircleCount || 0);
      const queryCandidates = (queryUsageEnd.candidateCount || 0) - (queryUsageStart.candidateCount || 0);
      const duplicateCandidates = (
        (queryUsageEnd.duplicateCandidates || 0) - (queryUsageStart.duplicateCandidates || 0)
      );

      assert(observedTickHz >= targetTickHz * 0.65,
        `Observed ${observedTickHz.toFixed(2)} Hz below 65% of ${targetTickHz} Hz target`);
      assert(observedTickHz <= targetTickHz * 1.35,
        `Observed ${observedTickHz.toFixed(2)} Hz above expected bounded cadence ${targetTickHz} Hz`);
      assert(p95Latency < 150, `Snapshot p95 ${p95Latency.toFixed(1)}ms exceeds local 150ms budget`);
      assert(p95SnapshotBytes < 1_000_000,
        `Snapshot p95 ${(p95SnapshotBytes / 1024).toFixed(1)}KiB exceeds 1MB budget`);
      assert(estimatedSnapshotBytesPerSec < 8_000_000,
        `Estimated snapshot stream ${(estimatedSnapshotBytesPerSec / 1_000_000).toFixed(2)}MB/s exceeds 8MB/s ceiling`);
      assert(heapGrowth < 32 * 1024 * 1024,
        `Heap grew ${(heapGrowth / 1024 / 1024).toFixed(1)}MiB during the short soak`);
      assert(p95RebuildMs < 12, `Ballpark sync p95 ${p95RebuildMs.toFixed(2)}ms exceeds 12ms budget`);
      assert(lastHealth.eventJournal.retainedCount <= lastHealth.eventJournal.capacity,
        "Event journal exceeded bounded retention");
      assert(lastHealth.snapshotRing.retainedCount <= lastHealth.snapshotRing.capacity,
        "Snapshot ring exceeded bounded retention");

      console.log(JSON.stringify({
        observedTickHz: Number(observedTickHz.toFixed(2)),
        targetTickHz,
        p95LatencyMs: Number(p95Latency.toFixed(2)),
        p95SnapshotKiB: Number((p95SnapshotBytes / 1024).toFixed(2)),
        estimatedSnapshotMBps: Number((estimatedSnapshotBytesPerSec / 1_000_000).toFixed(2)),
        heapGrowthMiB: Number((heapGrowth / 1024 / 1024).toFixed(2)),
        p95BallparkSyncMs: Number(p95RebuildMs.toFixed(3)),
        authorityTicks: tickCount,
        ballparkCircleQueries: circleQueries,
        ballparkQueriesPerTick: Number((circleQueries / Math.max(1, tickCount)).toFixed(2)),
        ballparkCandidates: queryCandidates,
        ballparkDuplicateCandidates: duplicateCandidates,
      }, null, 2));
    } finally {
      await stopSimServer(SIM_PORT).catch(() => null);
    }
  });

  process.exit(runner.summary() ? 0 : 1);
}

run().catch(async (error) => {
  await stopSimServer(SIM_PORT).catch(() => null);
  console.error(error.stack || error.message);
  process.exit(1);
});
