/**
 * Agent play eval.
 *
 * This lane proves an agent can enter and understand a real authoritative run.
 * It deliberately avoids sim debug mutation: every consequence below comes
 * from normal menu input, ship controls, world contact, or the public v2 input
 * protocol. Greg remains the final judge of feel and visual taste.
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
// Agent evals are commonly run beside other authority lanes. A process-local
// default prevents one fresh-stack test from resetting another test's session.
const SIM_PORT = Number(process.env.LBH_AGENT_EVAL_SIM_PORT || (9200 + process.pid % 500));
const SIM_URL = `http://127.0.0.1:${SIM_PORT}`;
const VIEWPORT = Object.freeze({ width: 1280, height: 800, deviceScaleFactor: 1 });
const SHALLOWS_ROUTE = Object.freeze({
  id: "first-current",
  slingshotWellIndex: 1,
  salvageWreckIndex: 0,
});

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function safeName(value) {
  return String(value || "capture")
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function wrappedDelta(from, to, worldScale) {
  const scale = Number(worldScale) || 1;
  let delta = (Number(to) || 0) - (Number(from) || 0);
  if (delta > scale / 2) delta -= scale;
  if (delta < -scale / 2) delta += scale;
  return delta;
}

function wrap(value, worldScale) {
  const scale = Number(worldScale) || 1;
  return ((value % scale) + scale) % scale;
}

async function requestJson(route) {
  const response = await fetch(`${SIM_URL}${route}`);
  const body = await response.json();
  if (!response.ok) throw new Error(`${route} failed (${response.status}): ${body.error || "unknown error"}`);
  return body;
}

async function getSnapshot() {
  return requestJson("/snapshot");
}

async function getEvents(since = 0) {
  const body = await requestJson(`/events?since=${since}`);
  return body.events || [];
}

function localPlayer(snapshot, clientId) {
  return snapshot.players?.find((player) => player.clientId === clientId) || null;
}

async function waitForPlayer(clientId, predicate, { timeout = 12000, interval = 100 } = {}) {
  const deadline = Date.now() + timeout;
  let lastPlayer = null;
  let lastSnapshot = null;
  while (Date.now() < deadline) {
    lastSnapshot = await getSnapshot();
    lastPlayer = localPlayer(lastSnapshot, clientId);
    if (lastPlayer && predicate(lastPlayer, lastSnapshot)) {
      return { player: lastPlayer, snapshot: lastSnapshot };
    }
    await sleep(interval);
  }
  throw new Error(`Timed out waiting for player state; last=${JSON.stringify(lastPlayer)}`);
}

async function waitForWorld(predicate, { timeout = 60000, interval = 200 } = {}) {
  const deadline = Date.now() + timeout;
  let lastSnapshot = null;
  while (Date.now() < deadline) {
    lastSnapshot = await getSnapshot();
    const match = predicate(lastSnapshot);
    if (match) return { match, snapshot: lastSnapshot };
    await sleep(interval);
  }
  throw new Error(`Timed out waiting for authoritative world state at tick ${lastSnapshot?.tick ?? "unknown"}`);
}

async function capturePage(page, outputDir, label) {
  const filepath = path.join(outputDir, `${safeName(label)}.png`);
  const result = await page.session.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
  });
  fs.writeFileSync(filepath, Buffer.from(result.data, "base64"));
  return path.basename(filepath);
}

async function waitForPhase(page, phase, timeout = 12000) {
  await waitFor(page, (expected) => window.__TEST_API?.getGamePhase?.() === expected, { timeout }, phase);
}

function assertNoBrowserErrors(errors, checkpoint) {
  if (!errors?.length) return;
  throw new Error(`${checkpoint}: browser runtime error: ${errors.join("; ")}`);
}

async function installVirtualGamepad(page) {
  await page.evaluate(() => {
    const button = () => ({ pressed: false, touched: false, value: 0 });
    window.__TEST_GAMEPAD = {
      id: "LBH Agent Eval Pad",
      index: 0,
      connected: true,
      mapping: "standard",
      axes: [0, 0, 0, 0, -1, -1],
      buttons: Array.from({ length: 18 }, button),
      timestamp: Date.now(),
    };
    Object.defineProperty(Navigator.prototype, "getGamepads", {
      configurable: true,
      value: () => [window.__TEST_GAMEPAD],
    });
  });
}

async function setGamepadButton(page, buttonIndex, pressed) {
  await page.evaluate(({ buttonIndex, pressed }) => {
    const value = pressed ? 1 : 0;
    window.__TEST_GAMEPAD.buttons[buttonIndex] = {
      pressed,
      touched: pressed,
      value,
    };
    window.__TEST_GAMEPAD.timestamp = Date.now();
  }, { buttonIndex, pressed: Boolean(pressed) });
}

async function tapGamepadButton(page, buttonIndex, settleMs = 160) {
  await setGamepadButton(page, buttonIndex, true);
  await sleep(90);
  await setGamepadButton(page, buttonIndex, false);
  await sleep(settleMs);
}

async function moveHomeTab(page, tabName) {
  const tabs = ["SHIP", "VAULT", "RIG", "CHRONICLE", "LAUNCH"];
  const targetIndex = tabs.indexOf(tabName);
  assert(targetIndex >= 0, `Unknown Home tab ${tabName}`);
  for (let i = 0; i < tabs.length + 2; i++) {
    const state = await page.evaluate(() => window.__TEST_API?.getHomeState?.() || null);
    const current = state?.tabName || null;
    if (current === tabName) return;
    const currentIndex = Number.isInteger(state?.tabIndex) ? state.tabIndex : tabs.indexOf(current);
    const forward = (targetIndex - currentIndex + tabs.length) % tabs.length;
    const backward = (currentIndex - targetIndex + tabs.length) % tabs.length;
    await tapGamepadButton(page, forward <= backward ? 5 : 4);
  }
  const current = await page.evaluate(() => window.__TEST_API?.getHomeState?.()?.tabName || null);
  throw new Error(`Expected Home tab ${tabName}, got ${current}`);
}

async function configureEvidenceView(page) {
  await page.setViewport(VIEWPORT);
  await installVirtualGamepad(page);
  await page.evaluate(() => {
    window.__TEST_API?.setOverlayVisible?.(true);
    window.__TEST_API?.setConfig?.("debug.showFPS", false);
    window.__TEST_API?.setConfig?.("debug.showWellRadii", false);
    window.__TEST_API?.setConfig?.("debug.showFluidDiagnostic", false);
    window.__TEST_API?.setConfig?.("debug.showVelocityField", false);
    window.__TEST_API?.setConfig?.("debug.showCoordDiagnostic", false);
  });
  await sleep(250);
}

async function enterFirstRunThroughMenus(page, outputDir, screenshots, browserErrors) {
  await waitForPhase(page, "title");
  await sleep(650);
  screenshots.push(await capturePage(page, outputDir, "01-title-fresh"));

  await tapGamepadButton(page, 0);
  await waitForPhase(page, "profileSelect");
  await tapGamepadButton(page, 0);
  await tapGamepadButton(page, 0);
  await waitForPhase(page, "home");
  screenshots.push(await capturePage(page, outputDir, "02-home-profile"));
  assertNoBrowserErrors(browserErrors, "Home entry");

  const profile = await page.evaluate(() => window.__TEST_API?.getProfile?.() || null);
  assert(profile?.id, "Expected a real profile after the profile-select flow");

  await moveHomeTab(page, "LAUNCH");
  await tapGamepadButton(page, 0);
  await waitForPhase(page, "mapSelect");
  const briefing = await page.evaluate(() => window.__TEST_API?.getMapSelectState?.() || null);
  assert(briefing?.mapName === "The Shallows", `Expected The Shallows briefing, got ${briefing?.mapName}`);
  screenshots.push(await capturePage(page, outputDir, "03-shallows-route-briefing"));

  await tapGamepadButton(page, 0);
  await waitForPhase(page, "playing", 15000);
  await waitFor(page, () => {
    const net = window.__TEST_API?.getNetworkState?.();
    return net?.remoteAuthorityActive && net.sessionMapId === "shallows" && Number.isFinite(net.remoteTick);
  }, { timeout: 15000 });
  return { profile, briefing };
}

function mousePointForDirection(nx, ny) {
  // The game canvas is 1280x720, letterboxed vertically in the 1280x800
  // viewport. Client-space y=400 is therefore the canvas center.
  return {
    x: VIEWPORT.width / 2 + nx * 330,
    y: VIEWPORT.height / 2 + ny * 270,
  };
}

async function setMouseButtons(page, state, { thrust, brake }) {
  if (Boolean(thrust) !== state.thrust) {
    if (thrust) await page.mouse.down({ button: "left" });
    else await page.mouse.up({ button: "left" });
    state.thrust = Boolean(thrust);
  }
  if (Boolean(brake) !== state.brake) {
    if (brake) await page.mouse.down({ button: "right" });
    else await page.mouse.up({ button: "right" });
    state.brake = Boolean(brake);
  }
}

async function releaseMouseButtons(page, state) {
  await setMouseButtons(page, state, { thrust: false, brake: false });
}

async function steerTo(page, clientId, target, options = {}) {
  const timeout = options.timeout ?? 26000;
  const radius = options.radius ?? 0.065;
  const maxCruiseSpeed = options.maxCruiseSpeed ?? 0.38;
  const deadline = Date.now() + timeout;
  const mouseState = { thrust: false, brake: false };
  let start = null;
  let closest = Infinity;
  let last = null;

  try {
    while (Date.now() < deadline) {
      const snapshot = await getSnapshot();
      const player = localPlayer(snapshot, clientId);
      assert(player, "Authoritative player disappeared while steering");
      assert(player.status === "alive", `Player became ${player.status} while steering toward ${target.id || "target"}`);
      if (!start) start = { wx: player.wx, wy: player.wy };
      const ws = snapshot.session?.worldScale || 3;
      const dx = wrappedDelta(player.wx, target.wx, ws);
      const dy = wrappedDelta(player.wy, target.wy, ws);
      const dist = Math.hypot(dx, dy);
      const speed = Math.hypot(player.vx || 0, player.vy || 0);
      closest = Math.min(closest, dist);
      last = { wx: player.wx, wy: player.wy, vx: player.vx, vy: player.vy, dist, speed };

      if (dist <= radius && speed <= (options.arrivalSpeed ?? 0.32)) {
        return { start, end: last, closest, target: { ...target } };
      }

      const nx = dist > 1e-6 ? dx / dist : 1;
      const ny = dist > 1e-6 ? dy / dist : 0;
      const closingSpeed = (player.vx || 0) * nx + (player.vy || 0) * ny;
      const shouldBrake = speed > maxCruiseSpeed || (dist < radius * 3.5 && closingSpeed > 0.16);
      const point = mousePointForDirection(
        shouldBrake && speed > 0.01 ? (player.vx || 0) / speed : nx,
        shouldBrake && speed > 0.01 ? (player.vy || 0) / speed : ny,
      );
      await page.mouse.move(point.x, point.y);
      await setMouseButtons(page, mouseState, {
        thrust: !shouldBrake && player.deltaVRatio > 0.05,
        brake: shouldBrake,
      });
      await sleep(110);
    }
  } finally {
    await releaseMouseButtons(page, mouseState).catch(() => null);
  }

  throw new Error(
    `Could not reach ${target.id || "target"}; closest=${closest.toFixed(4)} last=${JSON.stringify(last)}`,
  );
}

async function brakeToLowSpeed(page, clientId, timeout = 5000) {
  const deadline = Date.now() + timeout;
  const mouseState = { thrust: false, brake: false };
  try {
    while (Date.now() < deadline) {
      const snapshot = await getSnapshot();
      const player = localPlayer(snapshot, clientId);
      if (!player || player.status !== "alive") return player;
      const speed = Math.hypot(player.vx || 0, player.vy || 0);
      if (speed < 0.12) return player;
      const point = mousePointForDirection((player.vx || 0) / speed, (player.vy || 0) / speed);
      await page.mouse.move(point.x, point.y);
      await setMouseButtons(page, mouseState, { thrust: false, brake: true });
      await sleep(100);
    }
  } finally {
    await releaseMouseButtons(page, mouseState).catch(() => null);
  }
  return localPlayer(await getSnapshot(), clientId);
}

async function performRouteSlingshot(page, clientId, outputDir, screenshots) {
  let snapshot = await getSnapshot();
  const player = localPlayer(snapshot, clientId);
  const anchor = snapshot.world?.wells?.[SHALLOWS_ROUTE.slingshotWellIndex];
  assert(player && anchor, "Expected the authored Shallows slingshot anchor");
  const ws = snapshot.session.worldScale;
  let awayX = wrappedDelta(anchor.wx, player.wx, ws);
  let awayY = wrappedDelta(anchor.wy, player.wy, ws);
  let awayMag = Math.hypot(awayX, awayY);
  if (awayMag < 1e-4) { awayX = 1; awayY = 0; awayMag = 1; }
  const ringPoint = {
    id: `${anchor.id || "well-1"}-outer-current`,
    wx: wrap(anchor.wx + awayX / awayMag * 0.34, ws),
    wy: wrap(anchor.wy + awayY / awayMag * 0.34, ws),
  };
  const approach = await steerTo(page, clientId, ringPoint, {
    radius: 0.07,
    maxCruiseSpeed: 0.31,
    arrivalSpeed: 0.30,
  });

  snapshot = await getSnapshot();
  const atRing = localPlayer(snapshot, clientId);
  const radialX = wrappedDelta(anchor.wx, atRing.wx, ws);
  const radialY = wrappedDelta(anchor.wy, atRing.wy, ws);
  const radialMag = Math.hypot(radialX, radialY) || 1;
  const tangent = { x: -radialY / radialMag, y: radialX / radialMag };
  const tangentPoint = mousePointForDirection(tangent.x, tangent.y);
  const mouseState = { thrust: false, brake: false };
  await page.mouse.move(tangentPoint.x, tangentPoint.y);
  await setMouseButtons(page, mouseState, { thrust: true, brake: false });
  await sleep(480);
  await releaseMouseButtons(page, mouseState);

  const baselineSeq = (await getEvents(0)).reduce((max, event) => Math.max(max, event.seq || 0), 0);
  await tapGamepadButton(page, 3, 80);
  const engaged = await waitForPlayer(clientId, (entry) => entry.slingshot?.engaged === true, { timeout: 6000 });
  screenshots.push(await capturePage(page, outputDir, "05-route-slingshot-engaged"));
  await sleep(650);
  await tapGamepadButton(page, 3, 80);
  const released = await waitForPlayer(clientId, (entry) => entry.slingshot?.engaged === false, { timeout: 6000 });
  const routeEvents = (await getEvents(baselineSeq)).filter((event) =>
    event.payload?.clientId === clientId && event.type.startsWith("player.slingshot")
  );
  assert(routeEvents.some((event) => event.type === "player.slingshotEngaged"), "Expected a public slingshot-engaged event");
  assert(routeEvents.some((event) => event.type === "player.slingshotReleased"), "Expected a public slingshot-released event");
  await brakeToLowSpeed(page, clientId);
  return {
    routeId: SHALLOWS_ROUTE.id,
    anchorId: engaged.player.slingshot.anchorId,
    anchorType: engaged.player.slingshot.anchorType,
    approach,
    releaseSpeed: Math.hypot(released.player.vx || 0, released.player.vy || 0),
    events: routeEvents.map((event) => event.type),
  };
}

async function collectRouteLootAndRaiseSignal(page, clientId, outputDir, screenshots) {
  let snapshot = await getSnapshot();
  const authored = snapshot.world?.wrecks?.[SHALLOWS_ROUTE.salvageWreckIndex];
  const wreck = authored?.alive !== false && !authored?.looted
    ? authored
    : snapshot.world?.wrecks?.find((entry) => entry.alive !== false && !entry.looted);
  assert(wreck, "Expected an available Shallows wreck for natural pickup");
  const before = localPlayer(snapshot, clientId);
  const movement = await steerTo(page, clientId, wreck, {
    radius: 0.045,
    maxCruiseSpeed: 0.28,
    arrivalSpeed: 0.24,
    timeout: 30000,
  });
  const looted = await waitForPlayer(
    clientId,
    (player) => player.cargoCount > (before.cargoCount || 0),
    { timeout: 7000 },
  );
  screenshots.push(await capturePage(page, outputDir, "06-route-wreck-looted"));

  await tapGamepadButton(page, 2, 120);
  const escalated = await waitForPlayer(
    clientId,
    (player) => player.signal?.zone !== "ghost" || player.signal?.level > 0.15,
    { timeout: 6000 },
  );
  screenshots.push(await capturePage(page, outputDir, "07-signal-escalated"));
  return {
    wreckId: wreck.id,
    movement,
    cargoBefore: before.cargoCount || 0,
    cargoAfter: looted.player.cargoCount,
    signalLevel: escalated.player.signal.level,
    signalZone: escalated.player.signal.zone,
  };
}

async function enterAndConfirmPortal(page, clientId, outputDir, screenshots) {
  const protocol = await requestJson("/protocol");
  assert(
    JSON.stringify(protocol).includes("extractConfirm"),
    "Protocol v2 dependency missing: input.extractConfirm must be public before the natural eval can prove extraction",
  );

  const { match: initialPortal } = await waitForWorld((snapshot) =>
    snapshot.world?.portals?.find((portal) => portal.alive !== false && !portal.blockedByInhibitor)
  );
  const travel = await steerTo(page, clientId, initialPortal, {
    radius: 0.035,
    maxCruiseSpeed: 0.27,
    arrivalSpeed: 0.19,
    timeout: 35000,
  });
  await brakeToLowSpeed(page, clientId, 2500);
  const ready = await waitForPlayer(
    clientId,
    (player) => player.portalInteraction?.portalId === initialPortal.id && player.portalInteraction?.ready === true,
    { timeout: 7000 },
  );
  assert(ready.player.status === "alive", "Entering an aperture must not auto-extract before confirmation");
  screenshots.push(await capturePage(page, outputDir, "08-portal-zone-awaiting-confirm"));

  // Deck A reaches the sim through InputManager -> SimClient -> protocol v2.
  await tapGamepadButton(page, 0, 100);
  const escaped = await waitForPlayer(clientId, (player) => player.status === "escaped", { timeout: 8000 });
  await waitForPhase(page, "escaped", 8000);
  screenshots.push(await capturePage(page, outputDir, "09-authoritative-extraction-result"));
  return {
    portalId: initialPortal.id,
    portalType: initialPortal.type,
    readyTick: ready.snapshot.tick,
    escapedTick: escaped.snapshot.tick,
    travel,
  };
}

async function proveHomeAndSecondRun(page, firstRun, outputDir, screenshots) {
  await sleep(2400);
  await tapGamepadButton(page, 0, 220);
  await waitForPhase(page, "meta", 10000);
  screenshots.push(await capturePage(page, outputDir, "10-salvage-report"));
  await sleep(1400);
  await tapGamepadButton(page, 0, 220);
  await waitForPhase(page, "home", 10000);

  const profile = await page.evaluate(() => window.__TEST_API?.getProfile?.() || null);
  assert(profile?.totalExtractions >= 1, `Expected profile extraction write-back, got ${profile?.totalExtractions}`);

  await moveHomeTab(page, "RIG");
  const rig = await page.evaluate(() => window.__TEST_API?.getHomeState?.() || null);
  assert(rig?.rig?.tracks?.length === 3, `Expected three public rig tracks, got ${rig?.rig?.tracks?.length}`);
  screenshots.push(await capturePage(page, outputDir, "11-home-rig-evidence"));

  await moveHomeTab(page, "CHRONICLE");
  const chronicle = await page.evaluate(() => window.__TEST_API?.getChronicleView?.() || null);
  assert(chronicle?.records?.some((record) => record.outcome === "extracted"), "Expected extraction in Chronicle after returning Home");
  screenshots.push(await capturePage(page, outputDir, "12-home-chronicle-evidence"));

  await moveHomeTab(page, "LAUNCH");
  await tapGamepadButton(page, 0);
  await waitForPhase(page, "mapSelect");
  const beforeReroll = await page.evaluate(() => window.__TEST_API?.getMapSelectState?.() || null);
  await tapGamepadButton(page, 2);
  const afterReroll = await page.evaluate(() => window.__TEST_API?.getMapSelectState?.() || null);
  assert(afterReroll.seed !== beforeReroll.seed, "Expected the second route preview to reroll its seed");
  screenshots.push(await capturePage(page, outputDir, "13-second-run-rerolled-briefing"));
  await tapGamepadButton(page, 0);
  await waitForPhase(page, "playing", 15000);

  const second = await waitForWorld((snapshot) => {
    const netRun = snapshot.session?.runId || snapshot.runId;
    return netRun && netRun !== firstRun.runId ? snapshot : null;
  }, { timeout: 15000 });
  const network = await page.evaluate(() => window.__TEST_API?.getNetworkState?.() || null);
  assert(network?.clientId, "Expected a protocol-v2 player identity in the second run");
  const movementStart = localPlayer(second.snapshot, network.clientId);
  const ws = second.snapshot.session.worldScale;
  const movementTarget = {
    id: "second-run-intent",
    wx: wrap(movementStart.wx + 0.28, ws),
    wy: movementStart.wy,
  };
  const movement = await steerTo(page, network.clientId, movementTarget, {
    radius: 0.09,
    maxCruiseSpeed: 0.30,
    arrivalSpeed: 0.30,
    timeout: 12000,
  });
  screenshots.push(await capturePage(page, outputDir, "14-second-run-changed-and-moving"));
  return {
    profile,
    rig: {
      hullType: rig.hullType,
      levels: rig.rig.levels,
      tracks: rig.rig.tracks.map((track) => track.key),
      exoticMatter: rig.exoticMatter,
    },
    chronicle: {
      recordCount: chronicle.records.length,
      latest: chronicle.records[0],
    },
    runId: second.snapshot.session.runId || second.snapshot.runId,
    seed: second.snapshot.session.seed,
    previewSeed: afterReroll.seed,
    movement,
  };
}

function writeReport(outputDir, report) {
  const jsonPath = path.join(outputDir, "report.json");
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);

  const proof = report.journey || {};
  const lines = [
    "# Agent Play Eval",
    "",
    `Generated: ${report.generatedAt}`,
    `Verdict: ${report.verdict}`,
    `Viewport: ${VIEWPORT.width}x${VIEWPORT.height}`,
    "",
    "## Product Proof",
    "",
    `- Fresh authority: sim PID boundary plus a disposable browser profile; protocol ${proof.protocolVersion || "unavailable"}.`,
    `- Route: ${proof.slingshot?.routeId || "not reached"}; slingshot ${proof.slingshot?.anchorType || "n/a"}:${proof.slingshot?.anchorId || "n/a"}.`,
    `- Salvage: ${proof.loot?.wreckId || "not reached"}; cargo ${proof.loot?.cargoBefore ?? "?"} -> ${proof.loot?.cargoAfter ?? "?"}.`,
    `- Signal: ${proof.loot?.signalZone || "not reached"} at ${Number(proof.loot?.signalLevel || 0).toFixed(3)}.`,
    `- Extraction: ${proof.portal?.portalId || "not reached"}; ${proof.portal ? "entered ready zone before explicit confirmation" : "portal proof not reached"}.`,
    `- Profile: ${proof.home?.profile?.totalExtractions ?? "?"} extraction(s); ${proof.home?.chronicle?.recordCount ?? "?"} Chronicle record(s).`,
    `- Second run: ${proof.secondRun?.runId || "not reached"}; changed from ${proof.firstRun?.runId || "not reached"}.`,
    "",
    "## Evidence",
    "",
    ...(report.screenshots || []).map((shot) => `- ${shot}`),
    "",
    "## Human Review Still Required",
    "",
    "- Movement feel, route pleasure, visual rhythm, and final polish.",
    "- Physical Steam Deck readability and controller feel in Gaming Mode.",
    "- Whether any frame is strong enough for public promotion.",
    "",
  ];

  if (report.failure) {
    lines.push("## Failure / Dependency", "", `- ${report.failure}`, "");
  }

  const mdPath = path.join(outputDir, "summary.md");
  fs.writeFileSync(mdPath, `${lines.join("\n")}\n`);
  return { jsonPath, mdPath };
}

async function runJourney(page, outputDir, report, browserErrors) {
  await configureEvidenceView(page);
  const entry = await enterFirstRunThroughMenus(page, outputDir, report.screenshots, browserErrors);
  const network = await page.evaluate(() => window.__TEST_API?.getNetworkState?.() || null);
  assert(network?.clientId, "Expected a server-issued protocol-v2 player identity");
  const firstSnapshot = await getSnapshot();
  const firstPlayer = localPlayer(firstSnapshot, network.clientId);
  assert(firstPlayer?.status === "alive", "Expected a live authoritative player after launch");
  assert(firstSnapshot.protocolVersion === "lbh-local-v2", `Expected lbh-local-v2, got ${firstSnapshot.protocolVersion}`);
  report.screenshots.push(await capturePage(page, outputDir, "04-shallows-authoritative-start"));

  const slingshot = await performRouteSlingshot(page, network.clientId, outputDir, report.screenshots);
  const loot = await collectRouteLootAndRaiseSignal(page, network.clientId, outputDir, report.screenshots);
  const portal = await enterAndConfirmPortal(page, network.clientId, outputDir, report.screenshots);
  const firstRun = {
    runId: firstSnapshot.session.runId || firstSnapshot.runId,
    seed: firstSnapshot.session.seed,
    start: { wx: firstPlayer.wx, wy: firstPlayer.wy },
  };
  const homeAndSecond = await proveHomeAndSecondRun(page, firstRun, outputDir, report.screenshots);

  const errors = await page.evaluate(() => ({ phase: window.__TEST_API?.getGamePhase?.() || null }));
  report.journey = {
    protocolVersion: firstSnapshot.protocolVersion,
    profileAtEntry: entry.profile,
    briefing: entry.briefing,
    firstRun,
    slingshot,
    loot,
    portal,
    home: {
      profile: homeAndSecond.profile,
      rig: homeAndSecond.rig,
      chronicle: homeAndSecond.chronicle,
    },
    secondRun: {
      runId: homeAndSecond.runId,
      seed: homeAndSecond.seed,
      previewSeed: homeAndSecond.previewSeed,
      movement: homeAndSecond.movement,
      phase: errors.phase,
    },
  };
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
    screenshots: [],
    journey: null,
    failure: null,
  };

  await startServer();
  try {
    await runner.run("fresh protocol-v2 Shallows journey reaches a changed second run", async () => {
      await withFreshSimServer(SIM_PORT, async () => {
        await withFreshGame(
          withQuery(htmlFile, { simServer: SIM_URL, capture: 1, deck: 1 }),
          async ({ page, errors }) => {
            await runJourney(page, outputDir, report, errors);
            assertNoBrowserErrors(errors, "Journey complete");
          },
          { resetState: true },
        );
      }, { idleShutdownMs: 30000 });
    });
  } catch (error) {
    report.failure = error.message;
  } finally {
    stopServer();
  }

  const passed = runner.summary();
  if (!passed && !report.failure) {
    report.failure = runner.results.find((result) => !result.passed)?.error || "Unknown eval failure";
  }
  report.verdict = passed ? "pass" : "fail";
  const paths = writeReport(outputDir, report);
  console.log(`\nAgent eval report: ${paths.mdPath}`);
  console.log(`Agent eval data:   ${paths.jsonPath}`);
  process.exit(passed ? 0 : 1);
}

run().catch((error) => {
  console.error(error);
  stopServer();
  process.exit(1);
});
