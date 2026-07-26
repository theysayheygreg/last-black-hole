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
// The public engage gate is 0.05 tangential speed. This keeps the authored
// capture in-range through the lock and arc frames instead of outrunning it.
const CAPTURE_TANGENTIAL_SPEED = 0.2;

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

async function post(route, body) {
  const response = await fetch(`${SIM_URL}${route}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${route} failed: ${response.status}`);
  return response.json();
}

async function slingshotEdgeAcks(page) {
  return page.evaluate(() => window.__TEST_API?.getNetworkState?.()
    ?.networkMetrics?.slingshotEdgeAcks || []);
}

async function pressAcknowledgedSlingshotEdge(page, label) {
  const before = await slingshotEdgeAcks(page);
  await page.keyboard.down("KeyF");
  try {
    await waitFor(
      () => slingshotEdgeAcks(page),
      (acks) => acks.length === before.length + 1,
      `${label} edge acknowledgement`,
    );
  } finally {
    await page.keyboard.up("KeyF");
  }
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
    await post("/debug/player-state", {
      clientId: network.clientId,
      // A right-side fixture overlaps this seed's moving planetoid. Use the
      // unobstructed lower edge of the selected well and its tangent instead.
      wx: well.wx,
      wy: (well.wy + 0.30) % worldScale,
      vx: CAPTURE_TANGENTIAL_SPEED,
      vy: 0,
      deltaV: 80,
      resetSlingshot: true,
      status: "alive",
    });

    const playerFor = async () => {
      const current = await snapshot();
      return current.players?.find((player) => player.clientId === network.clientId) || null;
    };
    const eventWatermark = Math.max(0, ...(await events()).map((event) => event.seq || 0));
    const capture = async (name) => {
      const file = path.join(OUTPUT_DIR, `${name}.png`);
      await page.screenshot({ path: file });
      const hash = crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
      captures.push({ name, path: file, sha256: hash });
      return file;
    };

    const aim = await waitFor(
      playerFor,
      (player) => player?.slingshot?.phase === "aim"
        && player.slingshot?.aim?.anchorId === well.id
        && player.slingshot?.aim?.engageEligible === true,
      "engageable aim cue",
    );
    assert(aim.slingshot?.aim?.anchorId === well.id && aim.slingshot?.aim?.engageEligible === true,
      `Capture setup must be authority-engageable: ${JSON.stringify(aim.slingshot?.aim)}`);
    await capture("01-aim-cue");
    const engageAck = await pressAcknowledgedSlingshotEdge(page, "engage");
    const engagedEvents = await waitFor(
      () => playerSlingshotEvents(network.clientId, eventWatermark),
      (currentEvents) => currentEvents.length === 1
        && currentEvents[0].type === "player.slingshotEngaged",
      "exactly one authoritative engage event",
    );
    const engagedEvent = engagedEvents[0];
    const lock = await waitFor(playerFor, (player) => player?.slingshot?.phase === "lock", "lock telegraph");
    await capture("02-lock");
    const arc = await waitFor(
      playerFor,
      (player) => player?.slingshot?.engaged === true
        && player?.slingshot?.phase === "arc"
        && player?.slingshot?.telegraph?.ownedArc,
      "owned arc authority snapshot",
    );
    const overlay = await waitFor(
      () => page.evaluate(() => window.__TEST_API.getRulerOverlayStats()),
      (value) => value?.enabled && value.handlerCount === 11 && value.forceTick != null,
      "ruler and force ledger evidence",
    );
    await capture("03-owned-arc-ruler-force");
    const engagedBeforeRelease = await playerFor();
    assert(engagedBeforeRelease?.slingshot?.engaged === true,
      `Slingshot auto-released before the requested release: ${JSON.stringify(engagedBeforeRelease?.slingshot)}`);
    const eventsBeforeRelease = await playerSlingshotEvents(network.clientId, eventWatermark);
    assert.deepStrictEqual(eventsBeforeRelease.map((event) => event.type), [
      "player.slingshotEngaged",
    ], "Expected only the authoritative engage event before release");
    assert.strictEqual(eventsBeforeRelease[0].seq, engagedEvent.seq,
      "Engage event changed before the requested release");

    const releaseAck = await pressAcknowledgedSlingshotEdge(page, "release");
    const releaseEvents = await waitFor(
      () => playerSlingshotEvents(network.clientId, engagedEvent.seq),
      (currentEvents) => currentEvents.length === 1
        && currentEvents[0].type === "player.slingshotReleased"
        && currentEvents[0].payload?.reason === "release",
      "exactly one requested release event",
    );
    const releasedEvent = releaseEvents[0];
    const released = await waitFor(
      playerFor,
      (player) => player?.slingshot?.engaged === false && player?.slingshot?.telegraph?.releaseGhost,
      "release ghost",
    );
    await capture("04-release-ghost");

    const slingshotEvents = await playerSlingshotEvents(network.clientId, eventWatermark);
    assert.deepStrictEqual(slingshotEvents.map((event) => event.type), [
      "player.slingshotEngaged",
      "player.slingshotReleased",
    ], "Expected one authoritative slingshot engage/release sequence");
    assert.strictEqual(slingshotEvents[0].seq, engagedEvent.seq,
      "Final event window did not retain the engaged event");
    assert.strictEqual(slingshotEvents[1].seq, releasedEvent.seq,
      "Final event window did not retain the released event");
    assert.strictEqual(slingshotEvents[1].payload?.reason, "release",
      "Final slingshot release must be player-requested");

    const result = {
      outputDir: OUTPUT_DIR,
      phases: [aim.slingshot.phase, lock.slingshot.phase, arc.slingshot.phase, released.slingshot.phase],
      telegraphKeys: Object.keys(released.slingshot.telegraph || {}).filter((key) => released.slingshot.telegraph[key]),
      overlay: {
        handlerCount: overlay.handlerCount,
        handlerIds: overlay.handlerIds,
        forceTick: overlay.forceTick,
        geometry: overlay.geometry,
        reducedMotion: overlay.reducedMotion,
      },
      edgeAcks: { engage: engageAck, release: releaseAck },
      events: slingshotEvents.map((event) => ({
        seq: event.seq,
        type: event.type,
        reason: event.payload?.reason || null,
      })),
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
