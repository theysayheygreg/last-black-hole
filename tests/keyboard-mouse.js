/**
 * keyboard-mouse.js — browser-install control coverage for players without gamepads.
 *
 * Usage: node tests/keyboard-mouse.js [index-a.html]
 */
const {
  startServer,
  stopServer,
  startSimServer,
  stopSimServer,
  launchGame,
  screenshot,
  TestRunner,
  assert,
  waitFor,
} = require("./helpers");

const htmlFile = process.argv[2] || "index-a.html";
const SIM_PORT = 8793;
const SIM_URL = `http://127.0.0.1:${SIM_PORT}`;

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function waitForPhase(page, phase, timeout = 9000) {
  await waitFor(page, (expected) => window.__TEST_API?.getGamePhase?.() === expected, { timeout }, phase);
}

async function setKey(page, code, key, pressed) {
  await page.evaluate(({ code, key, pressed }) => {
    window.dispatchEvent(new KeyboardEvent(pressed ? "keydown" : "keyup", {
      code,
      key,
      bubbles: true,
      cancelable: true,
    }));
  }, { code, key, pressed });
}

async function tap(page, code, key) {
  await setKey(page, code, key, true);
  await sleep(80);
  await setKey(page, code, key, false);
  await sleep(120);
}

async function bootstrapCleanPage(page) {
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "domcontentloaded" });
  await sleep(2000);
}

async function enterRemoteRun(page) {
  await waitForPhase(page, "title");
  await tap(page, "Space", " ");
  await waitForPhase(page, "profileSelect");
  await tap(page, "Enter", "Enter");
  await tap(page, "Enter", "Enter");
  await waitForPhase(page, "home");
  await tap(page, "KeyE", "e");
  await tap(page, "KeyE", "e");
  await tap(page, "KeyE", "e");
  await tap(page, "Enter", "Enter");
  await waitForPhase(page, "mapSelect");
  await tap(page, "Enter", "Enter");
  await waitForPhase(page, "playing", 12000);
  await waitFor(page, () => {
    const net = window.__TEST_API.getNetworkState();
    return net.simEnabled && net.remoteAuthorityActive && typeof net.remoteTick === "number";
  }, { timeout: 12000 });
}

async function prepareLocalRun(page) {
  await page.evaluate(() => {
    window.__TEST_API.triggerRestart();
    window.__TEST_API.setConfig("wells.shipPullStrength", 0);
  });
  await waitForPhase(page, "playing", 9000);
  await sleep(300);
}

async function run() {
  console.log(`\n=== KEYBOARD + MOUSE TESTS (${htmlFile}) ===\n`);

  const runner = new TestRunner("KeyboardMouse");
  await startServer();
  await startSimServer(SIM_PORT);

  let browser, page;
  let browserRemote, pageRemote;

  try {
    ({ browser, page } = await launchGame(htmlFile));

    await runner.run("Mouse aims, left click thrusts, and right click brakes locally", async () => {
      await prepareLocalRun(page);
      const before = await page.evaluate(() => window.__TEST_API.getShipPos());

      await page.mouse.move(980, 360);
      await page.mouse.down({ button: "left" });
      await waitFor(page, () => {
        const input = window.__TEST_API.getInputState();
        return input?.lastInputSource === "mouse" && input.thrustIntensity > 0.45 && Number.isFinite(input.facing);
      }, { timeout: 3000 });
      await sleep(700);
      await page.mouse.up({ button: "left" });
      await sleep(120);

      const after = await page.evaluate(() => window.__TEST_API.getShipPos());
      const moved = Math.hypot(after.x - before.x, after.y - before.y);
      assert(moved > 0.003, `Expected mouse thrust movement, got ${moved.toFixed(4)} world-units`);

      await page.mouse.down({ button: "right" });
      await waitFor(page, () => {
        const input = window.__TEST_API.getInputState();
        return input?.lastInputSource === "mouse" && input.brakeIntensity > 0.9;
      }, { timeout: 3000 });
      await page.mouse.up({ button: "right" });
    });

    await runner.run("W/S provide keyboard thrust and brake without a controller", async () => {
      await prepareLocalRun(page);

      await setKey(page, "KeyW", "w", true);
      await waitFor(page, () => {
        const input = window.__TEST_API.getInputState();
        return input?.lastInputSource === "keyboard" && input.thrustIntensity > 0.9;
      }, { timeout: 3000 });
      await setKey(page, "KeyW", "w", false);

      await setKey(page, "KeyS", "s", true);
      await waitFor(page, () => {
        const input = window.__TEST_API.getInputState();
        return input?.lastInputSource === "keyboard" && input.brakeIntensity > 0.9;
      }, { timeout: 3000 });
      await setKey(page, "KeyS", "s", false);
    });

    await runner.run("Keyboard arrow facing overrides stale mouse aim", async () => {
      await prepareLocalRun(page);

      // Aim right with the mouse, then steer left with the keyboard.
      // Keyboard facing must win over mouse facing on the same frame.
      await page.mouse.move(1100, 360);
      await waitFor(page, () => {
        const input = window.__TEST_API.getInputState();
        return input?.mouseAimActive === true && Number.isFinite(input.facing);
      }, { timeout: 3000 });
      await setKey(page, "ArrowLeft", "ArrowLeft", true);
      await waitFor(page, () => {
        const input = window.__TEST_API.getInputState();
        // Keyboard left = facing ~ π. Allow tolerance for input smoothing.
        return input?.lastInputSource === "keyboard" &&
               Math.abs(Math.abs(input.facing ?? 0) - Math.PI) < 0.2;
      }, { timeout: 3000 });
      await setKey(page, "ArrowLeft", "ArrowLeft", false);
    });

    await runner.run("Mouse deactivates on window blur", async () => {
      await prepareLocalRun(page);

      await page.mouse.move(900, 360);
      await waitFor(page, () => {
        const input = window.__TEST_API.getInputState();
        return input?.mouseAimActive === true;
      }, { timeout: 3000 });

      // Simulate tab-switch / alt-tab
      await page.evaluate(() => window.dispatchEvent(new Event("blur")));
      await waitFor(page, () => {
        const input = window.__TEST_API.getInputState();
        return input?.mouseAimActive === false;
      }, { timeout: 3000 });
    });

    await runner.run("Click inside deadzone does not produce thrust", async () => {
      await prepareLocalRun(page);

      // Put the cursor directly on the ship. Deadzone is 28px
      // (CONFIG.input.mouseDeadzonePx) — thrust must stay at zero.
      const shipScreen = await page.evaluate(() => window.__TEST_API.getShipScreenPos?.());
      assert(shipScreen && Number.isFinite(shipScreen.x) && Number.isFinite(shipScreen.y),
        `Expected ship screen position; got ${JSON.stringify(shipScreen)}`);
      await page.mouse.move(shipScreen.x, shipScreen.y);
      await page.mouse.down({ button: "left" });
      await sleep(250);
      const state = await page.evaluate(() => window.__TEST_API.getInputState());
      await page.mouse.up({ button: "left" });
      assert(
        state.thrustIntensity < 0.05,
        `Cursor in deadzone should not thrust; got thrustIntensity=${state.thrustIntensity.toFixed(3)} distancePx=${state.mouseDistancePx.toFixed(1)}`,
      );
    });

    ({ browser: browserRemote, page: pageRemote } = await launchGame(`${htmlFile}?simServer=${encodeURIComponent(SIM_URL)}`));
    await bootstrapCleanPage(pageRemote);

    await runner.run("Keyboard + mouse drives remote-authority input", async () => {
      await enterRemoteRun(pageRemote);

      await pageRemote.mouse.move(980, 360);
      await pageRemote.mouse.down({ button: "left" });
      await waitFor(pageRemote, () => {
        const net = window.__TEST_API.getNetworkState();
        const input = net.lastRemoteInput;
        return input && input.thrust > 0.45 && Math.hypot(input.moveX, input.moveY) > 0.9;
      }, { timeout: 4000 });
      await pageRemote.mouse.up({ button: "left" });

      await pageRemote.mouse.down({ button: "right" });
      await waitFor(pageRemote, () => {
        const net = window.__TEST_API.getNetworkState();
        return net.lastRemoteInput && net.lastRemoteInput.brake > 0.9;
      }, { timeout: 4000 });
      await pageRemote.mouse.up({ button: "right" });
    });

    const localShot = await screenshot(page, "keyboard-mouse-local");
    const remoteShot = await screenshot(pageRemote, "keyboard-mouse-remote");
    console.log(`\n  Local screenshot: ${localShot}`);
    console.log(`  Remote screenshot: ${remoteShot}`);
  } finally {
    if (page) {
      await page.mouse.up({ button: "left" }).catch(() => null);
      await page.mouse.up({ button: "right" }).catch(() => null);
    }
    if (pageRemote) {
      await pageRemote.mouse.up({ button: "left" }).catch(() => null);
      await pageRemote.mouse.up({ button: "right" }).catch(() => null);
    }
    if (browser) await browser.close();
    if (browserRemote) await browserRemote.close();
    await stopSimServer(SIM_PORT).catch(() => null);
    stopServer();
  }

  const allPassed = runner.summary();
  process.exit(allPassed ? 0 : 1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
