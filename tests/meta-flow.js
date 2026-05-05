/**
 * meta-flow.js — Real profile/home/mapSelect entry-flow coverage.
 *
 * Drives the actual title -> profileSelect -> home -> mapSelect -> playing path
 * instead of using triggerRestart().
 *
 * Usage: node tests/meta-flow.js [index-a.html]
 */
const {
  startServer,
  stopServer,
  launchGame,
  screenshot,
  TestRunner,
  assert,
  dispatchKey,
  waitFor,
} = require("./helpers");

const htmlFile = process.argv[2] || "index-a.html";

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function waitForPhase(page, phase, timeout = 7000) {
  await waitFor(page, (expected) => window.__TEST_API?.getGamePhase?.() === expected, { timeout }, phase);
}

async function tapConfirm(page) {
  await dispatchKey(page, "Space", " ");
  await sleep(120);
}

async function tapEnter(page) {
  await dispatchKey(page, "Enter", "Enter");
  await sleep(120);
}

async function tapTabRight(page) {
  await dispatchKey(page, "KeyE", "e");
  await sleep(120);
}

async function bootstrapCleanPage(page) {
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "domcontentloaded" });
  await sleep(2000);
}

async function runRealEntryFlow(page) {
  await waitForPhase(page, "title");
  await tapConfirm(page); // title -> profileSelect
  await waitForPhase(page, "profileSelect");

  const activeBefore = await page.evaluate(() => window.__TEST_API.getProfile());
  if (activeBefore) {
    // Real menu path still matters; if a profile already exists, load it from slot 0.
    await tapEnter(page);
  } else {
    // Empty slot 0 -> enters name input with generated default, second Enter confirms.
    await tapEnter(page);
    await sleep(120);
    await tapEnter(page);
  }

  await waitForPhase(page, "home");

  // Move to LAUNCH tab and enter map select through the real home UI.
  await tapTabRight(page);
  await tapTabRight(page);
  await tapTabRight(page);
  await waitFor(page, () => window.__TEST_API.getHomeState().tabName === "LAUNCH", { timeout: 3000 });
  await tapEnter(page);
  await waitForPhase(page, "mapSelect");

  // Start the first map through the real map select UI.
  await sleep(300);
  await tapEnter(page);
  await waitForPhase(page, "playing", 9000);
}

async function run() {
  console.log(`\n=== META FLOW TESTS (${htmlFile}) ===\n`);

  const runner = new TestRunner("MetaFlow");
  await startServer();

  let browser, page;

  try {
    ({ browser, page } = await launchGame(htmlFile));
    await bootstrapCleanPage(page);

    await runner.run("Real profile flow reaches home screen", async () => {
      await bootstrapCleanPage(page);
      await waitForPhase(page, "title");
      await tapConfirm(page);
      await waitForPhase(page, "profileSelect");
      await tapEnter(page);
      await sleep(120);
      await tapEnter(page);
      await waitForPhase(page, "home");

      const profile = await page.evaluate(() => window.__TEST_API.getProfile());
      assert(profile !== null, "Expected active profile after real creation flow");
      assert(typeof profile.name === "string" && profile.name.length > 0, "Expected generated pilot name");
    });

    await runner.run("Real launch flow reaches gameplay from home", async () => {
      await bootstrapCleanPage(page);
      await runRealEntryFlow(page);

      const phase = await page.evaluate(() => window.__TEST_API.getGamePhase());
      assert(phase === "playing", `Expected playing phase, got ${phase}`);
      const pos = await page.evaluate(() => window.__TEST_API.getShipPos());
      assert(typeof pos.x === "number" && typeof pos.y === "number", "Ship position unavailable after real launch flow");
    });

    await runner.run("Home rig tab exposes tracks and buys an upgrade through menu input", async () => {
      await bootstrapCleanPage(page);
      await waitForPhase(page, "title");
      await tapConfirm(page);
      await waitForPhase(page, "profileSelect");
      await tapEnter(page);
      await sleep(120);
      await tapEnter(page);
      await waitForPhase(page, "home");

      await page.evaluate(() => window.__TEST_API.seedProfileExoticMatter(300));
      await tapTabRight(page);
      await tapTabRight(page);
      await waitFor(page, () => window.__TEST_API.getHomeState().tabName === "RIG", { timeout: 3000 });

      const before = await page.evaluate(() => window.__TEST_API.getHomeState());
      assert(before.hullType === "drifter", `Expected drifter hull, got ${before.hullType}`);
      assert(before.rig.tracks.length === 3, `Expected 3 rig tracks, got ${before.rig.tracks.length}`);
      assert(before.selectedRig.key === "laminar", `Expected laminar selected, got ${before.selectedRig.key}`);
      assert(before.selectedRigCost.em === 300, `Expected first rig cost 300 EM, got ${before.selectedRigCost.em}`);
      assert(before.selectedRigAffordable === true, "Expected seeded profile to afford first rig upgrade");
      assert(before.loadoutSlots.equipped === 2, "Expected 2 equipped slots to remain canonical");
      assert(before.loadoutSlots.consumables === 2, "Expected 2 consumable slots to remain canonical");

      await tapConfirm(page);
      const after = await page.evaluate(() => window.__TEST_API.getHomeState());
      assert(after.rig.levels[0] === 1, `Expected laminar level 1 after purchase, got ${after.rig.levels[0]}`);
      assert(after.rig.levels[1] === 0 && after.rig.levels[2] === 0, "Expected only selected rig track to change");
      assert(after.exoticMatter === 0, `Expected EM spent down to 0, got ${after.exoticMatter}`);
    });

    const filepath = await screenshot(page, "meta-flow");
    console.log(`\n  Screenshot: ${filepath}`);
  } finally {
    if (browser) await browser.close();
    stopServer();
  }

  const allPassed = runner.summary();
  process.exit(allPassed ? 0 : 1);
}

run().catch((err) => {
  console.error("MetaFlow test fatal error:", err.message);
  stopServer();
  process.exit(1);
});
