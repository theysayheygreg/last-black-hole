/**
 * Agent play eval.
 *
 * This is the "did an agent actually play and understand the build?" lane.
 * It produces screenshots plus a short report that connects actions to product
 * contracts, so Greg is the final look-and-feel stop instead of first QA.
 */
const fs = require("fs");
const path = require("path");
const {
  startServer,
  stopServer,
  withFreshGame,
  withFreshSimServer,
  TestRunner,
  assert,
  waitFor,
  withQuery,
} = require("./helpers.cjs");

const htmlFile = process.argv[2] || "index-a.html?renderer=three";
const SIM_PORT = Number(process.env.LBH_AGENT_EVAL_SIM_PORT || 8797);
const SIM_URL = `http://127.0.0.1:${SIM_PORT}`;

const MAPS = [
  { index: 0, id: "shallows", name: "The Shallows" },
  { index: 1, id: "expanse", name: "The Expanse" },
  { index: 2, id: "deep-field", name: "Deep Field" },
];

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function worldWrappedDeltaForTest(a, b, worldScale) {
  const direct = Math.abs((Number(b) || 0) - (Number(a) || 0));
  return Math.min(direct, Math.abs((Number(worldScale) || 5) - direct));
}

function safeName(value) {
  return String(value || "capture").replace(/[^a-z0-9_-]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
}

async function capturePage(page, outputDir, label) {
  const filepath = path.join(outputDir, `${safeName(label)}.png`);
  const result = await page.session.send("Page.captureScreenshot", { format: "png", fromSurface: true });
  fs.writeFileSync(filepath, Buffer.from(result.data, "base64"));
  return filepath;
}

async function waitForPhase(page, phase, timeout = 12000) {
  await waitFor(page, (expected) => window.__TEST_API?.getGamePhase?.() === expected, { timeout }, phase);
}

async function getSnapshot() {
  const response = await fetch(`${SIM_URL}/snapshot`);
  return response.json();
}

async function postDebugPlayerState(body) {
  const response = await fetch(`${SIM_URL}/debug/player-state`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return response.json();
}

async function postDebugPortalState(body) {
  const response = await fetch(`${SIM_URL}/debug/portal-state`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return response.json();
}

async function postSessionStart(body) {
  const response = await fetch(`${SIM_URL}/session/start`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

async function getEvents(since = 0) {
  const response = await fetch(`${SIM_URL}/events?since=${since}`);
  const body = await response.json();
  return body.events || [];
}

async function waitForSnapshotPlayer(clientId, predicate, { timeout = 7000, interval = 100 } = {}) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const snapshot = await getSnapshot();
    const player = snapshot.players?.find((entry) => entry.clientId === clientId);
    if (player && predicate(player, snapshot)) return { player, snapshot };
    await sleep(interval);
  }
  throw new Error("Timed out waiting for authoritative snapshot state");
}

function chooseSafePoint(snapshot, index = 0) {
  const ws = snapshot.session?.worldScale || 5;
  const wells = snapshot.world?.wells || [];
  const candidates = [
    [ws * 0.18, ws * 0.18],
    [ws * 0.82, ws * 0.18],
    [ws * 0.18, ws * 0.82],
    [ws * 0.82, ws * 0.82],
    [ws * 0.50, ws * 0.22],
    [ws * 0.22, ws * 0.50],
    [ws * 0.78, ws * 0.50],
    [ws * 0.50, ws * 0.78],
  ];

  const ranked = candidates.map(([wx, wy], candidateIndex) => {
    let nearest = Infinity;
    for (const well of wells) {
      const dist = Math.hypot(
        worldWrappedDeltaForTest(wx, well.wx, ws),
        worldWrappedDeltaForTest(wy, well.wy, ws),
      );
      nearest = Math.min(nearest, dist);
    }
    return { wx, wy, candidateIndex, nearest };
  }).sort((a, b) => b.nearest - a.nearest || a.candidateIndex - b.candidateIndex);

  return ranked[index % ranked.length] || { wx: ws * 0.5, wy: ws * 0.5, nearest: 0 };
}

function countArrays(value) {
  const counts = {};
  for (const [key, entry] of Object.entries(value || {})) {
    if (Array.isArray(entry)) counts[key] = entry.length;
  }
  return counts;
}

async function observe(page) {
  return page.evaluate(() => {
    const api = window.__TEST_API || {};
    return {
      phase: api.getGamePhase?.() || null,
      rendererBackend: api.getRendererBackend?.() || null,
      renderCanvasId: api.getRenderCanvasId?.() || null,
      fps: api.getFPS?.() || null,
      network: api.getNetworkState?.() || null,
      ship: api.getShipPos?.() || null,
      velocity: api.getShipVelocity?.() || null,
      ability: api.getAbilityState?.() || null,
      inventory: api.getInventory?.() || null,
      scene: api.getThreeSceneState?.() || null,
    };
  });
}

async function setAgentEvalView(page) {
  await page.evaluate(() => {
    window.__TEST_API?.setOverlayVisible?.(true);
    window.__TEST_API?.setConfig?.("debug.showFPS", false);
    window.__TEST_API?.setConfig?.("debug.showWellRadii", false);
    window.__TEST_API?.setConfig?.("debug.showFluidDiagnostic", false);
    window.__TEST_API?.setConfig?.("debug.showVelocityField", false);
    window.__TEST_API?.setConfig?.("debug.showCoordDiagnostic", false);
  });
}

async function startRemoteRun(page, map) {
  const started = await page.evaluate(async (pilotName, mapIndex) => {
    window.__TEST_API.createTestProfile(pilotName);
    return window.__TEST_API.startRemoteGameNow(mapIndex);
  }, `Agent Eval ${map.name}`, map.index);
  assert(started === true, `${map.name}: expected remote game to start through test API`);

  await waitForPhase(page, "playing", 12000);
  await waitFor(page, () => {
    const net = window.__TEST_API?.getNetworkState?.();
    return net?.simEnabled && net.remoteAuthorityActive && typeof net.remoteTick === "number";
  }, { timeout: 12000 });
}

async function primeAuthoritativeMap(map) {
  const reset = await postSessionStart({
    mapId: map.id,
    requesterId: `agent-eval-host-${map.id}`,
    requesterName: "Agent Eval Harness",
    seed: 7000 + map.index,
  });
  assert(reset.status === 200 && reset.body?.ok === true, `${map.name}: expected sim map start to succeed`);
  assert(reset.body.session?.mapId === map.id, `${map.name}: expected sim session ${map.id}, got ${reset.body.session?.mapId}`);
}

async function driveMouseThrust(page) {
  const before = await observe(page);
  await page.mouse.move(980, 360);
  await page.mouse.down({ button: "left" });
  await waitFor(page, () => {
    const net = window.__TEST_API?.getNetworkState?.();
    return net?.lastRemoteInput?.thrust > 0.4;
  }, { timeout: 4000 });
  await sleep(850);
  await page.mouse.up({ button: "left" });
  await sleep(250);
  const after = await observe(page);
  const moved = Math.hypot((after.ship?.x || 0) - (before.ship?.x || 0), (after.ship?.y || 0) - (before.ship?.y || 0));
  return { before: before.ship, after: after.ship, moved, afterObservation: after };
}

async function forceExtraction(page, outputDir) {
  const net = await page.evaluate(() => window.__TEST_API?.getNetworkState?.() || null);
  assert(net?.clientId, "Expected remote client id before extraction check");

  const snapshot = await getSnapshot();
  const point = chooseSafePoint(snapshot, 0);
  const baselineEvents = await getEvents(0);
  const baselineSeq = baselineEvents.reduce((max, event) => Math.max(max, event.seq || 0), 0);
  const portalId = `agent-eval-portal-${Date.now()}`;

  const moved = await postDebugPlayerState({
    clientId: net.clientId,
    wx: point.wx,
    wy: point.wy,
    vx: 0,
    vy: 0,
    status: "alive",
  });
  assert(moved.ok === true, "Expected debug player placement before extraction");

  const portal = await postDebugPortalState({
    id: portalId,
    wx: point.wx,
    wy: point.wy,
    type: "standard",
    alive: true,
    blockedByInhibitor: false,
    lifespan: 30,
    opacity: 1,
  });
  assert(portal.ok === true, `Expected debug portal placement, got ${JSON.stringify(portal)}`);

  const { player } = await waitForSnapshotPlayer(
    net.clientId,
    (remotePlayer) => remotePlayer.status === "escaped",
    { timeout: 8000 },
  );
  await waitFor(page, () => window.__TEST_API?.getGamePhase?.() === "escaped", { timeout: 8000 });

  const events = await getEvents(0);
  const escapedEvent = events.find((event) =>
    event.seq > baselineSeq &&
    event.type === "player.escaped" &&
    event.payload?.clientId === net.clientId &&
    event.payload?.portalId === portalId
  );
  assert(Boolean(escapedEvent), "Expected authoritative player.escaped event for the agent eval portal");

  return {
    portalId,
    playerStatus: player.status,
    safePoint: { wx: point.wx, wy: point.wy, nearestWell: point.nearest },
    resultScreenshot: await capturePage(page, outputDir, "shallows-extraction-result"),
  };
}

function writeReport(outputDir, report) {
  const jsonPath = path.join(outputDir, "report.json");
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);

  const lines = [
    "# Agent Play Eval",
    "",
    `Generated: ${report.generatedAt}`,
    `Verdict: ${report.verdict}`,
    "",
    "## What The Agent Proved",
    "",
    "- The Three renderer booted in fresh browser sessions.",
    "- Each covered map reached a remote-authoritative playing state on a fresh sim.",
    "- Mouse movement produced server-visible thrust and visible ship displacement.",
    "- The Shallows extraction consequence was authored by the sim and reached the result screen.",
    "",
    "## What Greg Still Owns",
    "",
    "- Final taste, mood, motion feel, and polish calls.",
    "- Whether the screenshots are marketing-pretty enough for a public beat.",
    "",
    "## Map Evidence",
    "",
  ];

  for (const map of report.maps) {
    lines.push(`### ${map.name}`);
    lines.push("");
    lines.push(`- Phase: ${map.endPhase}`);
    lines.push(`- Renderer: ${map.rendererBackend}`);
    lines.push(`- FPS sample: ${map.fps}`);
    lines.push(`- Movement delta: ${map.movement?.moved?.toFixed?.(4) || map.movement?.moved}`);
    lines.push(`- Scene counts: ${JSON.stringify(map.sceneCounts)}`);
    lines.push(`- Screenshots: ${map.screenshots.join(", ")}`);
    lines.push("");
  }

  if (report.extraction) {
    lines.push("## Consequence Spot Check");
    lines.push("");
    lines.push(`- Portal ${report.extraction.portalId} produced status ${report.extraction.playerStatus}.`);
    lines.push(`- Screenshot: ${report.extraction.resultScreenshot}`);
    lines.push("");
  }

  const mdPath = path.join(outputDir, "summary.md");
  fs.writeFileSync(mdPath, `${lines.join("\n")}\n`);
  return { jsonPath, mdPath };
}

async function runMapEval(map, outputDir) {
  const mapReport = {
    id: map.id,
    name: map.name,
    screenshots: [],
  };

  await withFreshSimServer(SIM_PORT, async () => {
    await primeAuthoritativeMap(map);
    await withFreshGame(withQuery(htmlFile, { simServer: SIM_URL, capture: 1 }), async ({ page, errors }) => {
      await startRemoteRun(page, map);
      await setAgentEvalView(page);
      const start = await observe(page);
      assert(start.phase === "playing", `${map.name}: expected playing phase, got ${start.phase}`);
      assert(start.rendererBackend === "three", `${map.name}: expected three backend, got ${start.rendererBackend}`);
      assert(start.network?.remoteAuthorityActive === true, `${map.name}: expected remote authority`);
      assert(start.network?.sessionMapId === map.id, `${map.name}: expected map ${map.id}, got ${start.network?.sessionMapId}`);
      assert(Number(start.fps) > 10, `${map.name}: expected non-trivial FPS sample, got ${start.fps}`);

      const sceneCounts = countArrays(start.scene);
      assert((sceneCounts.wells || 0) > 0, `${map.name}: expected wells in Three scene`);
      assert((sceneCounts.stars || 0) > 0, `${map.name}: expected stars in Three scene`);
      assert((sceneCounts.scavengers || 0) > 0, `${map.name}: expected scavengers in Three scene`);

      mapReport.screenshots.push(await capturePage(page, outputDir, `${map.id}-start`));

      const movement = await driveMouseThrust(page);
      assert(movement.moved > 0.002, `${map.name}: expected visible movement after mouse thrust, got ${movement.moved}`);
      assert(movement.afterObservation.network?.lastRemoteInput?.thrust === 0, `${map.name}: expected thrust release to reach remote input`);
      mapReport.screenshots.push(await capturePage(page, outputDir, `${map.id}-after-move`));

      if (errors.length) {
        throw new Error(`${map.name}: browser reported errors: ${errors.join("; ")}`);
      }

      mapReport.rendererBackend = start.rendererBackend;
      mapReport.fps = Number(start.fps);
      mapReport.sceneCounts = sceneCounts;
      mapReport.movement = {
        before: movement.before,
        after: movement.after,
        moved: movement.moved,
      };
      mapReport.endPhase = movement.afterObservation.phase;

      if (map.id === "shallows") {
        mapReport.extraction = await forceExtraction(page, outputDir);
        mapReport.endPhase = "escaped";
      }
    }, { resetState: true });
  }, { idleShutdownMs: 30000 });

  return mapReport;
}

async function run() {
  console.log(`\n=== AGENT PLAY EVAL (${htmlFile}) ===\n`);

  const runner = new TestRunner("AgentPlayEval");
  const runStamp = new Date().toISOString().replace(/[:.]/g, "");
  const outputDir = path.join(__dirname, "screenshots", `agent-play-eval-${runStamp}`);
  fs.mkdirSync(outputDir, { recursive: true });

  const report = {
    generatedAt: new Date().toISOString(),
    htmlFile,
    simUrl: SIM_URL,
    outputDir,
    verdict: "pending",
    maps: [],
    extraction: null,
    humanReviewNeeded: [
      "Final readability and mood judgment",
      "Movement feel and polish beyond measured responsiveness",
      "Promo-worthy composition and timing",
    ],
  };

  await startServer();
  try {
    for (const map of MAPS) {
      await runner.run(`${map.name} fresh remote play eval`, async () => {
        const mapReport = await runMapEval(map, outputDir);
        report.maps.push(mapReport);
        if (mapReport.extraction) report.extraction = mapReport.extraction;
      });
    }
  } finally {
    stopServer();
  }

  const passed = runner.summary();
  report.verdict = passed ? "pass" : "fail";
  const paths = writeReport(outputDir, report);
  console.log(`\nAgent eval report: ${paths.mdPath}`);
  console.log(`Agent eval data:   ${paths.jsonPath}`);
  process.exit(passed ? 0 : 1);
}

run().catch((err) => {
  console.error(err);
  stopServer();
  process.exit(1);
});
