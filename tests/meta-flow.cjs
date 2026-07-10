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
} = require("./helpers.cjs");

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

async function moveHomeTab(page, tabName) {
  for (let i = 0; i < 8; i++) {
    const current = await page.evaluate(() => window.__TEST_API.getHomeState().tabName);
    if (current === tabName) return;
    await tapTabRight(page);
  }
  const current = await page.evaluate(() => window.__TEST_API.getHomeState().tabName);
  throw new Error(`Expected home tab ${tabName}, got ${current}`);
}

async function bootstrapCleanPage(page) {
  await startServer();
  try {
    await page.evaluate(() => localStorage.clear());
  } catch {
    const target = String(htmlFile).startsWith("http")
      ? htmlFile
      : `http://localhost:8719/${String(htmlFile).replace(/^\//, "")}`;
    await page.goto(target, { waitUntil: "domcontentloaded", timeout: 10000 });
    await page.evaluate(() => localStorage.clear());
  }
  await page.reload({ waitUntil: "domcontentloaded" });
  // Wait for init() to mount __TEST_API. Then wait for the title-screen
  // gate to clear: main.js requires titleTimer > 0.5 seconds before the
  // first Space press will transition title → profileSelect (an
  // intentional "don't skip the title" guard). Without that game-time
  // wait the first tapConfirm drops silently. 600ms covers the 500ms
  // gate plus slack — total bootstrap lands around 700ms, down from a
  // pessimistic 2000ms.
  await waitFor(
    page,
    () => Boolean(window.__TEST_API?.triggerRestart) && window.__TEST_API.getGamePhase?.() === "title",
    { timeout: 5000 },
  );
  await sleep(600);
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
  await moveHomeTab(page, "LAUNCH");
  await tapEnter(page);
  await waitFor(page, () => {
    const phase = window.__TEST_API?.getGamePhase?.();
    return phase === "mapSelect" || window.__TEST_API?.getHomeState?.().tabName === "LAUNCH";
  }, { timeout: 3000 });
  if (await page.evaluate(() => window.__TEST_API.getGamePhase() === "home")) {
    await tapEnter(page);
  }
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

    await runner.run("Profile names are sanitized and capped", async () => {
      await bootstrapCleanPage(page);
      const profile = await page.evaluate(() => window.__TEST_API.createTestProfile("<script>Hamlet</script> ".repeat(12)));
      assert(profile.name.length <= 16, `Expected capped name, got ${profile.name.length}`);
      assert(!/[<>{}\\/[\\]^`|~]/.test(profile.name), `Expected markup stripped, got ${profile.name}`);
      assert(profile.name.toLowerCase().includes("scripthamlet") || profile.name.toLowerCase().includes("hamlet"),
        `Expected readable pasted text to remain, got ${profile.name}`);
    });

    await runner.run("Profile prompts match empty, occupied, and modal states", async () => {
      await bootstrapCleanPage(page);
      await waitForPhase(page, "title");
      await tapConfirm(page);
      await waitForPhase(page, "profileSelect");

      const emptyPrompt = await page.evaluate(() => window.__TEST_API.getUiMotionState().profilePrompt);
      assert(emptyPrompt.includes("create") && !emptyPrompt.includes("delete"), `Expected empty-slot create prompt, got ${emptyPrompt}`);

      await tapEnter(page);
      const namePrompt = await page.evaluate(() => window.__TEST_API.getUiMotionState().profilePrompt);
      assert(namePrompt.includes("confirm") && namePrompt.includes("cancel") && !namePrompt.includes("select"),
        `Expected name modal prompt, got ${namePrompt}`);
      await tapEnter(page);
      await waitForPhase(page, "home");
      await page.evaluate(() => window.__TEST_API.showUiFixture("profile-select", { cursor: 0 }));
      await waitForPhase(page, "profileSelect");

      const occupiedPrompt = await page.evaluate(() => window.__TEST_API.getUiMotionState().profilePrompt);
      assert(occupiedPrompt.includes("load") && occupiedPrompt.includes("delete"), `Expected occupied-slot prompt, got ${occupiedPrompt}`);

      await dispatchKey(page, "KeyX", "x");
      await sleep(120);
      const deletePrompt = await page.evaluate(() => window.__TEST_API.getUiMotionState().profilePrompt);
      assert(deletePrompt.includes("delete") && deletePrompt.includes("cancel") && !deletePrompt.includes("select"),
        `Expected delete modal prompt, got ${deletePrompt}`);
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
      await moveHomeTab(page, "RIG");

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

    await runner.run("Chronicle tab surfaces profile stats, recent runs, and echoes", async () => {
      await bootstrapCleanPage(page);
      await waitForPhase(page, "title");
      await tapConfirm(page);
      await waitForPhase(page, "profileSelect");
      await tapEnter(page);
      await sleep(120);
      await tapEnter(page);
      await waitForPhase(page, "home");

      await page.evaluate(() => {
        window.__TEST_API.seedProfileExoticMatter(480);
        window.__TEST_API.seedProfileRunRecords([
          {
            runId: "chronicle-run-1",
            outcome: "extracted",
            survivalTime: 223,
            hullType: "drifter",
            mapId: "shallows",
            emEarned: 90,
            cargoCount: 2,
            cargoValue: 200,
            signalPeakZone: "flare",
            notable: "new milestone: DEEP DIVE",
          },
          {
            runId: "chronicle-run-2",
            outcome: "dead",
            survivalTime: 64,
            hullType: "drifter",
            mapId: "expanse",
            emEarned: 16,
            cargoCount: 1,
            cargoValue: 75,
            deathCause: "well",
            deathEntityId: "charybdis",
          },
        ]);
        window.__TEST_API.seedRecentEchoes([
          { fragment: "my controls went heavy. then i went heavy.", pilotName: "Quiet Wake", hullType: "shroud" },
        ]);
      });

      await moveHomeTab(page, "CHRONICLE");

      const chronicle = await page.evaluate(() => window.__TEST_API.getChronicleView());
      assert(chronicle.stats.exoticMatter === 480, `Expected current EM in Chronicle, got ${chronicle.stats.exoticMatter}`);
      assert(chronicle.records.length >= 2, `Expected recent run records, got ${chronicle.records.length}`);
      assert(chronicle.records[0].outcome === "extracted", `Expected latest extracted record, got ${chronicle.records[0].outcome}`);
      assert(chronicle.records[0].survivalLabel === "3:43", `Expected survival 3:43, got ${chronicle.records[0].survivalLabel}`);
      assert(chronicle.records.some((record) => record.deathCause === "well: charybdis"), "Expected death cue in Chronicle records");
      assert(chronicle.echoes[0].fragment.includes("controls went heavy"), "Expected recovered echo fragment");
    });

    await runner.run("Run result continue path feeds Chronicle home state", async () => {
      await bootstrapCleanPage(page);
      await page.evaluate(() => {
        window.__TEST_API.createTestProfile("Chronicle Pilot");
        window.__TEST_API.showRunResultsFixture({
          runId: "chronicle-result-run",
          outcome: "extracted",
          survivalTime: 151,
          hullType: "hauler",
          mapId: "shallows",
          seed: 777,
          cargoExtracted: [
            { id: "em-a", name: "Sungold Core", value: 140, tier: 2, category: "salvage" },
          ],
          emEarned: 75,
          signalPeakZone: "whisper",
          signalPeak: 0.22,
          inhibitorFormReached: 0,
          notables: [{ type: "cargo", description: "first cargo made it home" }],
        }, "escaped");
      });
      await waitForPhase(page, "escaped");
      await tapConfirm(page);
      await waitForPhase(page, "meta");
      await waitFor(page, () => window.__TEST_API.getUiMotionState().salvageReport.ready === true, { timeout: 4000 });
      await tapConfirm(page);
      await waitForPhase(page, "home");

      const chronicle = await page.evaluate(() => window.__TEST_API.getChronicleView());
      assert(chronicle.records[0].runId === "chronicle-result-run", `Expected latest RunResult record, got ${chronicle.records[0]?.runId}`);
      assert(chronicle.records[0].survivalLabel === "2:31", `Expected survival 2:31, got ${chronicle.records[0].survivalLabel}`);
      assert(chronicle.records[0].emEarned === 75, `Expected 75 EM ledger credit from result, got ${chronicle.records[0].emEarned}`);
      assert(chronicle.records[0].cargoCount === 1, `Expected cargo count 1, got ${chronicle.records[0].cargoCount}`);
    });

    await runner.run("Reduced-motion salvage report is settled and transition corruption stays off", async () => {
      await bootstrapCleanPage(page);
      await page.evaluate(() => {
        window.__TEST_API.createTestProfile("Reduced Pilot");
        window.__TEST_API.setConfig("ui.motion.reduced", true);
        window.__TEST_API.showRunResultsFixture({
          runId: "reduced-result-run",
          outcome: "extracted",
          survivalTime: 90,
          cargoExtracted: [],
          emEarned: 10,
        }, "escaped");
      });
      await waitForPhase(page, "escaped");
      await tapConfirm(page);

      const transition = await page.evaluate(() => window.__TEST_API.getUiMotionState().transition);
      assert(transition.duration === 0.34, `Expected configured 0.34s transition, got ${transition.duration}`);
      assert(transition.glitchIntensity === 0, `Expected reduced-motion shader corruption off, got ${transition.glitchIntensity}`);

      await sleep(500);
      const metaPhase = await page.evaluate(() => window.__TEST_API.getGamePhase());
      assert(metaPhase === "meta", `Expected reduced-motion result transition to reach meta, got ${metaPhase}`);
      await waitFor(page, () => window.__TEST_API.getUiMotionState().salvageReport.ready === true, { timeout: 2000 });
      const report = await page.evaluate(() => window.__TEST_API.getUiMotionState().salvageReport);
      assert(report.ready === true && report.displayTime > report.readyAt,
        `Expected settled visible salvage CTA, got ${JSON.stringify(report)}`);
      await tapConfirm(page);
      await sleep(500);
      const homePhase = await page.evaluate(() => window.__TEST_API.getGamePhase());
      assert(homePhase === "home", `Expected ready salvage CTA to accept confirm, got ${homePhase}`);
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
