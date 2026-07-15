const path = require("path");
const { pathToFileURL } = require("url");
const { TestRunner, assert } = require("./helpers.cjs");
const serverManifest = require("../scripts/content/signatures.cjs");
const { PLAYABLE_MAP_IDS, getMapScaleDefinition } = require("../scripts/content/map-scales.cjs");

const ROOT = path.join(__dirname, "..");

async function loadSignatureModule() {
  const url = pathToFileURL(path.join(ROOT, "src", "signatures.js"));
  return import(`${url.href}?test=${Date.now()}`);
}

async function run() {
  const runner = new TestRunner("Signatures");
  const signatures = await loadSignatureModule();

  await runner.run("rollSignature uses canonical map-id pools and stable ids", async () => {
    const first3 = signatures.rollSignature("shallows", () => 0);
    assert(first3.id === "slow_tide", `Expected slow_tide, got ${first3.id}`);
    assert(first3.name === "the slow tide", `Unexpected name ${first3.name}`);

    const next3 = signatures.rollSignature("shallows", () => 0);
    assert(next3.id === "shattered_merge", `Expected streak-protected shattered_merge, got ${next3.id}`);

    const first10 = signatures.rollSignature("deep-field", () => 0);
    assert(serverManifest.SIGNATURE_POOLS_BY_MAP_ID["deep-field"].includes(first10.id), "Deep Field signature was not in server pool");
    assert(!["slow_tide", "thick_dark", "rush"].includes(first10.id), `10x10 excluded signature rolled: ${first10.id}`);
  });

  await runner.run("layout multipliers preserve current signature consumer contract", async () => {
    assert(signatures.getLayoutMultiplier("wreckDensity", "dense") === 1.6, "dense wreck multiplier changed");
    assert(signatures.getLayoutMultiplier("portalCount", "low") === -1, "low portal offset changed");
    assert(signatures.getLayoutMultiplier("scavengerCount", "high") === 2, "high scavenger offset changed");
    assert(signatures.getLayoutMultiplier("unknown", "normal") === 1, "unknown layout key should remain neutral");
  });

  await runner.run("signature exports are sourced from the shared manifest", async () => {
    assert(
      JSON.stringify(signatures.SIGNATURE_DEFINITIONS) === JSON.stringify(serverManifest.SIGNATURE_DEFINITIONS),
      "Runtime SIGNATURE_DEFINITIONS drifted from server manifest"
    );
    assert(
      JSON.stringify(signatures.SIGNATURE_POOLS_BY_MAP_SIZE) === JSON.stringify(serverManifest.SIGNATURE_POOLS_BY_MAP_SIZE),
      "Runtime SIGNATURE_POOLS_BY_MAP_SIZE drifted from server manifest"
    );
    assert(
      JSON.stringify(signatures.SIGNATURE_POOLS_BY_MAP_ID) === JSON.stringify(serverManifest.SIGNATURE_POOLS_BY_MAP_ID),
      "Runtime SIGNATURE_POOLS_BY_MAP_ID drifted from server manifest"
    );
  });

  await runner.run("seeded signatures carry player-facing briefing copy", async () => {
    for (const signature of serverManifest.SEEDED_SIGNATURES) {
      assert(typeof signature.flavor === "string" && signature.flavor.length > 0,
        `${signature.id}: missing flavor copy`);
      assert(typeof signature.mechanical === "string" && signature.mechanical.length > 0,
        `${signature.id}: missing mechanical copy`);
    }
  });

  await runner.run("run briefings use real map counts and stable named streams", async () => {
    const shallowDefinition = getMapScaleDefinition("shallows");
    const deepDefinition = getMapScaleDefinition("deep-field");
    const { MAP: shallows } = await import(pathToFileURL(path.join(ROOT, "src", "maps", shallowDefinition.sourceFile)).href);
    const { MAP: deepField } = await import(pathToFileURL(path.join(ROOT, "src", "maps", deepDefinition.sourceFile)).href);
    const first = signatures.buildRunBriefing(shallows, 424242);
    const repeat = signatures.buildRunBriefing(shallows, 424242);
    const deep = signatures.buildRunBriefing(deepField, 424242);

    assert(JSON.stringify(first) === JSON.stringify(repeat), "Same map and seed produced different briefings");
    assert(first.wellCount === shallows.wells.length, "Shallows briefing used the wrong well count");
    assert(deep.wellCount === deepField.wells.length, "Deep Field briefing used the wrong well count");
    assert(first.wellNames.length === shallows.wells.length, "Shallows well names were truncated or padded");
    assert(deep.wellNames.length === deepField.wells.length, "Deep Field well names were truncated or padded");
    assert(first.signature.id === deep.signature.id,
      "Independent signature stream should not change with map entity count");
  });

  const allPassed = runner.summary();
  process.exit(allPassed ? 0 : 1);
}

run().catch((err) => {
  console.error("Signatures test fatal error:", err.stack || err.message);
  process.exit(1);
});
