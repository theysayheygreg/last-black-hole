const crypto = require("crypto");
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

async function post(route, body) {
  const response = await fetch(`${SIM_URL}${route}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${route} failed: ${response.status}`);
  return response.json();
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
      wx: (well.wx + 0.30) % worldScale,
      wy: well.wy,
      vx: 0,
      vy: 0.8,
      deltaV: 80,
      resetSlingshot: true,
      status: "alive",
    });

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

    const aim = await waitFor(playerFor, (player) => player?.slingshot?.phase === "aim", "aim cue");
    await capture("01-aim-cue");
    await page.keyboard.press("KeyF");
    const lock = await waitFor(playerFor, (player) => player?.slingshot?.phase === "lock", "lock telegraph");
    await capture("02-lock");
    await page.keyboard.down("KeyW");
    const arc = await waitFor(playerFor, (player) => player?.slingshot?.phase === "arc", "owned arc");
    const overlay = await waitFor(
      () => page.evaluate(() => window.__TEST_API.getRulerOverlayStats()),
      (value) => value?.enabled && value.handlerCount === 11 && value.forceTick != null,
      "ruler and force ledger evidence",
    );
    await capture("03-owned-arc-ruler-force");
    await page.keyboard.press("KeyF");
    await page.keyboard.up("KeyW");
    const released = await waitFor(
      playerFor,
      (player) => player?.slingshot?.phase === "release-ghost" && player?.slingshot?.telegraph?.releaseGhost,
      "release ghost",
    );
    await capture("04-release-ghost");

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
