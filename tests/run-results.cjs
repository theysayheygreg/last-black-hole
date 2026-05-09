/**
 * run-results.js — Canvas results overlay and continue-flow coverage.
 *
 * Usage: node tests/run-results.js [index-a.html]
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

async function tapConfirm(page) {
  await dispatchKey(page, "Space", " ");
  await sleep(140);
}

const extractedResult = {
  runId: "test-run-extracted",
  pilotId: "pilot-ui",
  profileId: "profile-ui",
  hullType: "hauler",
  rigLevels: [1, 0, 2],
  outcome: "extracted",
  survivalTime: 223,
  cargoExtracted: [
    { id: "cargo-a", name: "Bright Relic", value: 120, tier: 2, category: "artifact" },
    { id: "cargo-b", name: "Quiet Core", value: 80, tier: 3, category: "salvage" },
  ],
  cargoLost: [],
  signalPeak: 0.82,
  signalPeakZone: "flare",
  inhibitorFormReached: 2,
  emEarned: 290,
  aiOutcomes: [
    { personality: "raider", hullType: "breacher", outcome: "dead", cargoCount: 1 },
    { personality: "ghost", hullType: "shroud", outcome: "extracted", cargoCount: 3 },
  ],
  notables: [{ type: "milestone", description: "new milestone: DEEP DIVE", value: "deep-dive" }],
  mapId: "shallows",
  wellCount: 5,
  seed: 4242,
};

const deathResult = {
  runId: "test-run-dead",
  pilotId: "pilot-ui",
  profileId: "profile-ui",
  hullType: "drifter",
  outcome: "dead",
  deathCause: "well",
  deathEntityId: "charybdis",
  survivalTime: 64,
  cargoExtracted: [],
  cargoLost: [{ id: "lost-a", name: "Drowned Core", value: 75, tier: 2, category: "artifact" }],
  signalPeak: 0.91,
  signalPeakZone: "threshold",
  inhibitorFormReached: 3,
  emEarned: 16,
  aiOutcomes: [{ personality: "redline", hullType: "breacher", outcome: "extracted", cargoCount: 4 }],
  notables: [{ type: "death_cause", description: "consumed by Charybdis", value: "well" }],
  mapId: "expanse",
  wellCount: 8,
  seed: 99,
};

async function run() {
  console.log(`\n=== RUN RESULTS TESTS (${htmlFile}) ===\n`);

  const runner = new TestRunner("RunResults");
  await startServer();

  let browser, page;

  try {
    ({ browser, page } = await launchGame(htmlFile));
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "domcontentloaded" });
    await sleep(2000);

    await runner.run("Extraction result view exposes cargo, signal, inhibitor, earnings, AI, and notables", async () => {
      const ok = await page.evaluate((result) => window.__TEST_API.showRunResultsFixture(result), extractedResult);
      assert(ok, "Expected fixture injection to succeed");
      await waitFor(page, () => window.__TEST_API.getGamePhase() === "escaped");

      const view = await page.evaluate(() => window.__TEST_API.getRunResultsView());
      assert(view.status === "EXTRACTED", `Expected extracted status, got ${view.status}`);
      assert(view.survival === "3:43", `Expected survival 3:43, got ${view.survival}`);
      assert(view.signalPeakLabel === "FLARE (0.82)", `Expected signal peak label, got ${view.signalPeakLabel}`);
      assert(view.inhibitorLabel === "swarm", `Expected inhibitor swarm, got ${view.inhibitorLabel}`);
      assert(view.cargoTitle === "CARGO EXTRACTED", `Expected extracted cargo title, got ${view.cargoTitle}`);
      assert(view.cargoCount === 2, `Expected two extracted cargo items, got ${view.cargoCount}`);
      assert(view.emEarned === 290, `Expected 290 EM, got ${view.emEarned}`);
      assert(view.aiLines.some((line) => line.includes("ghost") && line.includes("extracted")), "Expected AI extraction line");
      assert(view.notableLines.includes("new milestone: DEEP DIVE"), "Expected milestone notable");
    });

    await runner.run("Death result view exposes cause and lost cargo", async () => {
      const ok = await page.evaluate((result) => window.__TEST_API.showRunResultsFixture(result), deathResult);
      assert(ok, "Expected fixture injection to succeed");

      const view = await page.evaluate(() => window.__TEST_API.getRunResultsView());
      assert(view.status === "CONSUMED BY CHARYBDIS", `Expected well death status, got ${view.status}`);
      assert(view.cargoTitle === "CARGO LOST", `Expected lost cargo title, got ${view.cargoTitle}`);
      assert(view.deathCause === "well: charybdis", `Expected death cause context, got ${view.deathCause}`);
      assert(view.inhibitorLabel === "vessel", `Expected vessel form, got ${view.inhibitorLabel}`);
      assert(view.cargoLabels[0].includes("Drowned Core"), "Expected lost cargo label");
      assert(view.aiLines[0].includes("redline") && view.aiLines[0].includes("4 cargo"), "Expected AI outcome cargo count");
    });

    await runner.run("Continue path leaves results for meta/home flow", async () => {
      await page.evaluate((result) => window.__TEST_API.showRunResultsFixture(result), extractedResult);
      await tapConfirm(page);
      await waitFor(page, () => window.__TEST_API.getGamePhase() === "meta", { timeout: 5000 });
      await sleep(1400);
      await tapConfirm(page);
      await waitFor(page, () => window.__TEST_API.getGamePhase() === "home", { timeout: 5000 });
    });

    const filepath = await screenshot(page, "run-results");
    console.log(`\n  Screenshot: ${filepath}`);
  } finally {
    if (browser) await browser.close();
    stopServer();
  }

  const allPassed = runner.summary();
  process.exit(allPassed ? 0 : 1);
}

run().catch((err) => {
  console.error("RunResults test fatal error:", err.message);
  stopServer();
  process.exit(1);
});
