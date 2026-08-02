const crypto = require("crypto");
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const {
  startSimServer,
  stopSimServer,
  launchGame,
  withQuery,
} = require("./helpers.cjs");

const ROOT = path.resolve(__dirname, "..");
const STATIC_PORT = 8846;
const SIM_PORT = 8847;
const SIM_URL = `http://127.0.0.1:${SIM_PORT}`;
const OUTPUT_DIR = path.join(__dirname, "screenshots", "slingshot-v2-live-20260714");
// The bounded angle search avoids transient overlaps; every tangent remains
// twice the public 0.05 engage gate without outrunning the capture.
const CAPTURE_RADIUS_OFFSET = 0.20;
const CAPTURE_TANGENTIAL_SPEED = 0.10;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(read, predicate, label, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  let value = null;
  while (Date.now() < deadline) {
    value = await read();
    if (predicate(value)) return value;
    await sleep(40);
  }
  throw new Error(`Timed out waiting for ${label}: ${JSON.stringify(value)}`);
}

async function startStaticServer() {
  const child = spawn(process.execPath, [
    path.join(ROOT, "scripts", "static-server.cjs"),
    "--host", "127.0.0.1", "--port", String(STATIC_PORT), "--root", ROOT,
    "--pid-file", path.join(ROOT, "tmp", `slingshot-v2-static-${STATIC_PORT}.pid`),
    "--meta-file", path.join(ROOT, "tmp", `slingshot-v2-static-${STATIC_PORT}.json`),
    "--label", "lbh-slingshot-v2-live",
  ], { cwd: ROOT, stdio: "ignore" });
  await waitFor(
    async () => { try { return (await fetch(`http://127.0.0.1:${STATIC_PORT}/index-a.html`)).ok; } catch { return false; } },
    Boolean,
    "dedicated static server",
  );
  return child;
}

async function snapshot() {
  const response = await fetch(`${SIM_URL}/snapshot`);
  if (!response.ok) throw new Error(`Snapshot failed: ${response.status}`);
  return response.json();
}

async function events(since = 0) {
  const response = await fetch(`${SIM_URL}/events?since=${since}`);
  if (!response.ok) throw new Error(`Events failed: ${response.status}`);
  return (await response.json()).events || [];
}

async function playerSlingshotEvents(clientId, since = 0) {
  return (await events(since)).filter((event) =>
    event.payload?.clientId === clientId && event.type.startsWith("player.slingshot"));
}

async function nextPlayerSlingshotEvent(clientId, afterSeq, label, timeoutMs = 10000) {
  const available = await waitFor(
    () => playerSlingshotEvents(clientId, afterSeq),
    (currentEvents) => currentEvents.length > 0,
    label,
    timeoutMs,
  );
  return available[0];
}

async function post(route, body) {
  const response = await fetch(`${SIM_URL}${route}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${route} failed: ${response.status}`);
  return response.json();
}

async function armSelectedWellFixture(clientId, well, worldScale, angle) {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return post("/debug/player-state", {
    clientId,
    wx: (well.wx + cosine * CAPTURE_RADIUS_OFFSET + worldScale) % worldScale,
    wy: (well.wy + sine * CAPTURE_RADIUS_OFFSET + worldScale) % worldScale,
    vx: -sine * CAPTURE_TANGENTIAL_SPEED,
    vy: cosine * CAPTURE_TANGENTIAL_SPEED,
    deltaV: 80,
    resetSlingshot: true,
    status: "alive",
  });
}

async function armAndWaitForSelectedWell(label, clientId, well, worldScale) {
  const attempts = [];
  let lastAim = null;
  for (let index = 0; index < 8; index++) {
    const angle = index * Math.PI / 4;
    const placed = await armSelectedWellFixture(clientId, well, worldScale, angle);
    const armTick = placed.snapshot?.tick ?? (await snapshot()).tick;
    const deadline = Date.now() + 1500;
    let lastTick = armTick;
    while (Date.now() < deadline) {
      await sleep(35);
      const current = await snapshot();
      lastTick = current.tick;
      if (current.tick <= armTick) continue;
      const player = current.players?.find((entry) => entry.clientId === clientId) || null;
      lastAim = player?.slingshot?.aim || null;
      if (current.tick >= armTick + 6) break;
      if (player?.slingshot?.phase === "aim"
        && lastAim?.anchorType === "well"
        && lastAim?.anchorId === well.id
        && lastAim?.engageEligible === true
        && lastAim?.distance <= 0.25) {
        return {
          player,
          receipt: {
            label,
            index,
            degrees: index * 45,
            armTick,
            acceptedTick: current.tick,
          },
        };
      }
    }
    attempts.push({
      index,
      degrees: index * 45,
      armTick,
      lastTick,
      lastAim,
    });
  }
  throw new Error(`Failed to arm selected well: ${JSON.stringify({ label, attempts, lastAim })}`);
}

function assertSelectedWellEvent(event, expectedType, clientId, well, reason) {
  assert.strictEqual(event.type, expectedType,
    `Expected next slingshot event ${expectedType}, got ${JSON.stringify(event)}`);
  assert.strictEqual(event.payload?.clientId, clientId,
    `Slingshot event selected the wrong client: ${JSON.stringify(event.payload)}`);
  assert.strictEqual(event.payload?.anchorType, "well",
    `Slingshot event selected the wrong anchor type: ${JSON.stringify(event.payload)}`);
  assert.strictEqual(event.payload?.anchorId, well.id,
    `Slingshot event selected the wrong anchor: ${JSON.stringify(event.payload)}`);
  if (reason !== undefined) {
    assert.strictEqual(event.payload?.reason, reason,
      `Slingshot event selected the wrong release reason: ${JSON.stringify(event.payload)}`);
  }
  return event;
}

function isSelectedWellAnchor(anchor, well) {
  return anchor?.type === "well"
    && (anchor.id == null || anchor.id === well.id)
    && Math.abs(anchor.wx - well.wx) < 1e-6
    && Math.abs(anchor.wy - well.wy) < 1e-6;
}

function hasAuthorityPhase(player, phase, telegraphKey, well) {
  return player?.slingshot?.engaged === true
    && player.slingshot.phase === phase
    && player.slingshot.anchorType === "well"
    && player.slingshot.anchorId === well.id
    && isSelectedWellAnchor(player.slingshot.telegraph?.[telegraphKey]?.anchor, well);
}

async function visibleState(page) {
  return page.evaluate(() => ({
    scene: window.__TEST_API.getThreeSceneState(),
    ruler: window.__TEST_API.getRulerOverlayStats(),
  }));
}

function compactAck(ack) {
  return {
    requested: ack.requestedEdgeIds,
    accepted: ack.acceptedEdgeIds,
    serverTick: ack.serverTick,
  };
}

async function slingshotEdgeAcks(page) {
  return page.evaluate(() => window.__TEST_API?.getNetworkState?.()
    ?.networkMetrics?.slingshotEdgeAcks || []);
}

async function pressAcknowledgedSlingshotEdge(page, label, { release = true } = {}) {
  const before = await slingshotEdgeAcks(page);
  await page.keyboard.down("KeyF");
  try {
    await waitFor(
      () => slingshotEdgeAcks(page),
      (acks) => acks.length === before.length + 1,
      `${label} edge acknowledgement`,
    );
  } finally {
    if (release) await page.keyboard.up("KeyF");
  }
  if (release) await waitForSlingshotKeyUp(page, label);
  const after = await slingshotEdgeAcks(page);
  assert.strictEqual(after.length, before.length + 1,
    `${label} must produce exactly one edge acknowledgement`);
  const [ack] = after.slice(before.length);
  assert.strictEqual(ack.requestedEdgeIds.length, 1,
    `${label} must request exactly one edge ID`);
  assert.strictEqual(ack.acceptedEdgeIds.length, 1,
    `${label} must accept exactly one edge ID`);
  assert.strictEqual(ack.acceptedEdgeIds[0], ack.requestedEdgeIds[0],
    `${label} must accept the requested edge ID`);
  return ack;
}

async function waitForSlingshotKeyUp(page, label) {
  await waitFor(
    () => page.evaluate(() => {
      const local = window.__TEST_API?.getInputState?.();
      const remote = window.__TEST_API?.getNetworkState?.()?.lastRemoteInput;
      return {
        localSlingshot: local?.slingshot,
        remoteSlingshot: remote?.slingshot,
      };
    }),
    (state) => state?.localSlingshot === false && state?.remoteSlingshot === false,
    `${label} key-up propagation`,
  );
}

async function releaseHeldSlingshot(page, label) {
  await page.keyboard.up("KeyF");
  await waitForSlingshotKeyUp(page, label);
}

async function main() {
  let browser = null;
  let staticServer = null;
  const captures = [];
  try {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    staticServer = await startStaticServer();
    await startSimServer(SIM_PORT, { keepAlive: true, idleShutdownMs: 8000 });
    const launched = await launchGame(withQuery(
      `http://127.0.0.1:${STATIC_PORT}/index-a.html`,
      { simServer: SIM_URL },
    ));
    browser = launched.browser;
    const page = launched.page;
    await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
    await waitFor(
      () => page.evaluate(() => Boolean(window.__TEST_API?.createTestProfile)),
      Boolean,
      "test API boot",
      12000,
    );
    await page.evaluate(() => {
      localStorage.clear();
      window.__TEST_API.createTestProfile("Slingshot V2 Capture");
      window.__TEST_API.setConfig("debug.showRulerOverlay", true);
      window.__TEST_API.setConfig("ui.motion.reduced", true);
    });
    await page.evaluate(() => window.__TEST_API.startRemoteGameNow(0));
    const network = await waitFor(
      () => page.evaluate(() => window.__TEST_API.getNetworkState()),
      (value) => value?.remoteAuthorityActive && value.clientId,
      "remote authority",
      12000,
    );
    const initial = await snapshot();
    const well = initial.world?.wells?.[0];
    if (!well) throw new Error("No well available for live slingshot capture");
    const worldScale = initial.session.worldScale;

    const playerFor = async () => {
      const current = await snapshot();
      return current.players?.find((player) => player.clientId === network.clientId) || null;
    };
    const capture = async (name) => {
      const file = path.join(OUTPUT_DIR, `${name}.png`);
      await page.screenshot({ path: file });
      const hash = crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
      captures.push({ name, path: file, sha256: hash });
      return file;
    };

    const arming = [];
    const initialArm = await armAndWaitForSelectedWell(
      "capture-aim",
      network.clientId,
      well,
      worldScale,
    );
    arming.push(initialArm.receipt);
    const aim = initialArm.player;
    assert(aim.slingshot?.aim?.anchorId === well.id && aim.slingshot?.aim?.engageEligible === true,
      `Capture setup must be authority-engageable: ${JSON.stringify(aim.slingshot?.aim)}`);
    const aimVisible = await waitFor(
      () => visibleState(page),
      (visible) => isSelectedWellAnchor(visible.scene?.slingshot?.affordance, well),
      "visible selected-well affordance",
      1500,
    );
    await capture("01-aim-cue");

    const lockArm = await armAndWaitForSelectedWell(
      "lock-leg",
      network.clientId,
      well,
      worldScale,
    );
    arming.push(lockArm.receipt);

    // All three proof legs share one watermark so the final check covers the
    // complete client slingshot stream without reason-based filtering.
    const eventWatermark = Math.max(0, ...(await events()).map((event) => event.seq || 0));
    const ackWatermark = (await slingshotEdgeAcks(page)).length;

    const lockEngageAck = await pressAcknowledgedSlingshotEdge(page, "lock leg engage", { release: false });
    const lockEngaged = assertSelectedWellEvent(
      await nextPlayerSlingshotEvent(
        network.clientId,
        eventWatermark,
        "lock leg next authoritative event",
      ),
      "player.slingshotEngaged",
      network.clientId,
      well,
    );
    const lockGate = await waitFor(
      async () => {
        const [player, visible] = await Promise.all([playerFor(), visibleState(page)]);
        return { player, visible };
      },
      ({ player, visible }) => hasAuthorityPhase(player, "arc", "lock", well)
        && isSelectedWellAnchor(visible.scene?.slingshot?.telegraph?.lock?.anchor, well),
      "authoritative and visible selected-well lock",
      1500,
    );
    await capture("02-lock");
    await releaseHeldSlingshot(page, "lock leg release");
    const lockReleased = assertSelectedWellEvent(
      await nextPlayerSlingshotEvent(
        network.clientId,
        lockEngaged.seq,
        "lock leg next authoritative release",
        6000,
      ),
      "player.slingshotReleased",
      network.clientId,
      well,
      "release",
    );

    const arcArm = await armAndWaitForSelectedWell(
      "arc-leg",
      network.clientId,
      well,
      worldScale,
    );
    arming.push(arcArm.receipt);
    const arcEngageAck = await pressAcknowledgedSlingshotEdge(page, "arc leg engage", { release: false });
    const arcEngaged = assertSelectedWellEvent(
      await nextPlayerSlingshotEvent(
        network.clientId,
        lockReleased.seq,
        "arc leg next authoritative event",
      ),
      "player.slingshotEngaged",
      network.clientId,
      well,
    );
    const arcAuthority = await waitFor(
      playerFor,
      (player) => hasAuthorityPhase(player, "arc", "ownedArc", well),
      "arc leg selected-well authority",
      1500,
    );
    const arcForceTick = arcAuthority.forceLedger?.tick ?? null;
    const arcVisible = await waitFor(
      () => visibleState(page),
      (visible) => isSelectedWellAnchor(
        visible.scene?.slingshot?.telegraph?.ownedArc?.anchor,
        well,
      )
        && visible.ruler?.enabled
        && visible.ruler.handlerCount === 12
        && visible.ruler.forceTick != null
        && (arcForceTick == null || visible.ruler.forceTick >= arcForceTick),
      "visible selected-well arc and fresh ruler evidence",
      1500,
    );
    await capture("03-owned-arc-ruler-force");
    await releaseHeldSlingshot(page, "arc leg release");
    const arcReleased = assertSelectedWellEvent(
      await nextPlayerSlingshotEvent(
        network.clientId,
        arcEngaged.seq,
        "arc leg next authoritative release",
        6000,
      ),
      "player.slingshotReleased",
      network.clientId,
      well,
      "release",
    );

    const releaseArm = await armAndWaitForSelectedWell(
      "release-leg",
      network.clientId,
      well,
      worldScale,
    );
    arming.push(releaseArm.receipt);
    const releaseEngageAck = await pressAcknowledgedSlingshotEdge(page, "release leg engage", { release: false });
    const releaseEngaged = assertSelectedWellEvent(
      await nextPlayerSlingshotEvent(
        network.clientId,
        arcReleased.seq,
        "release leg next authoritative event",
      ),
      "player.slingshotEngaged",
      network.clientId,
      well,
    );
    await waitFor(
      async () => {
        const [player, visible] = await Promise.all([playerFor(), visibleState(page)]);
        return { player, visible };
      },
      ({ player, visible }) => hasAuthorityPhase(player, "arc", "ownedArc", well)
        && isSelectedWellAnchor(visible.scene?.slingshot?.telegraph?.ownedArc?.anchor, well),
      "release leg authoritative and visible selected-well arc",
      1500,
    );
    await releaseHeldSlingshot(page, "release leg command");
    const releaseReleased = assertSelectedWellEvent(
      await nextPlayerSlingshotEvent(
        network.clientId,
        releaseEngaged.seq,
        "release leg next authoritative release",
      ),
      "player.slingshotReleased",
      network.clientId,
      well,
      "release",
    );
    const releaseGate = await waitFor(
      async () => {
        const [player, visible] = await Promise.all([playerFor(), visibleState(page)]);
        return { player, visible };
      },
      ({ player, visible }) => player?.slingshot?.engaged === false
        && isSelectedWellAnchor(player.slingshot?.telegraph?.releaseGhost?.anchor, well)
        && isSelectedWellAnchor(visible.scene?.slingshot?.telegraph?.releaseGhost?.anchor, well),
      "authoritative and visible selected-well release ghost",
      1500,
    );
    await capture("04-release-ghost");

    const slingshotEvents = await playerSlingshotEvents(network.clientId, eventWatermark);
    const eventRecords = slingshotEvents.map((event) => ({
      seq: event.seq,
      type: event.type,
      clientId: event.payload?.clientId,
      anchorId: event.payload?.anchorId,
      anchorType: event.payload?.anchorType,
      reason: event.payload?.reason || null,
    }));
    assert.deepStrictEqual(eventRecords, [
      lockEngaged,
      lockReleased,
      arcEngaged,
      arcReleased,
      releaseEngaged,
      releaseReleased,
    ].map((event) => ({
      seq: event.seq,
      type: event.type,
      clientId: event.payload.clientId,
      anchorId: event.payload.anchorId,
      anchorType: event.payload.anchorType,
      reason: event.payload.reason || null,
    })), "Expected the complete ordered three-leg slingshot event stream");

    const finalAcks = await slingshotEdgeAcks(page);
    assert.strictEqual(finalAcks.length, ackWatermark + 3,
      "The three proof legs must add exactly three slingshot edge acknowledgements");

    const result = {
      outputDir: OUTPUT_DIR,
      capturePhases: {
        aim: aimVisible.scene.slingshot.phase,
        lock: lockGate.visible.scene.slingshot.phase,
        arc: arcVisible.scene.slingshot.phase,
        releaseGhost: releaseGate.visible.scene.slingshot.phase,
      },
      overlay: {
        handlerCount: arcVisible.ruler.handlerCount,
        handlerIds: arcVisible.ruler.handlerIds,
        authorityForceTick: arcForceTick,
        forceTick: arcVisible.ruler.forceTick,
        geometry: arcVisible.ruler.geometry,
        reducedMotion: arcVisible.ruler.reducedMotion,
      },
      legs: {
        lock: [lockEngaged.seq, lockReleased.seq],
        arc: [arcEngaged.seq, arcReleased.seq],
        release: [releaseEngaged.seq, releaseReleased.seq],
      },
      arming,
      edgeAcks: {
        lockEngage: compactAck(lockEngageAck),
        arcEngage: compactAck(arcEngageAck),
        releaseEngage: compactAck(releaseEngageAck),
      },
      events: eventRecords,
      browserErrors: launched.errors,
      captures,
    };
    console.log(JSON.stringify(result, null, 2));
    if (launched.errors.length) throw new Error(`Browser errors: ${launched.errors.join("; ")}`);
  } finally {
    if (browser) await browser.close().catch(() => null);
    await stopSimServer(SIM_PORT).catch(() => null);
    staticServer?.kill("SIGTERM");
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
