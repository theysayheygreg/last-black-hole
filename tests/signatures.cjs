const path = require("path");
const { pathToFileURL } = require("url");
const { TestRunner, assert } = require("./helpers.cjs");
const serverManifest = require("../scripts/content/signatures.cjs");
const { PLAYABLE_MAP_IDS, getMapScaleDefinition } = require("../scripts/content/map-scales.cjs");

const ROOT = path.join(__dirname, "..");

async function loadSignatureModule() {
  const url = pathToFileURL(path.join(ROOT, "src", "run-briefing.js"));
  return import(`${url.href}?test=${Date.now()}`);
}

async function run() {
  const runner = new TestRunner("Signatures");
  const signatures = await loadSignatureModule();
  const canonicalManifest = await import(
    pathToFileURL(path.join(ROOT, "src", "content", "signatures.js")).href
  );

  await runner.run("CJS adapter exposes the canonical signature module", async () => {
    for (const name of Object.keys(serverManifest)) {
      assert(serverManifest[name] === canonicalManifest[name], `${name} is not the canonical ESM export`);
    }
  });

  await runner.run("the briefing has no second signature template system", async () => {
    assert(typeof signatures.buildRunBriefing === "function", "briefing builder missing");
    assert(!Object.prototype.hasOwnProperty.call(signatures, "applySignatureConfig"), "retired template application leaked into briefing");
    assert(!Object.prototype.hasOwnProperty.call(signatures, "rollSignature"), "retired template picker leaked into briefing");
  });

  await runner.run("seeded signatures carry player-facing briefing copy", async () => {
    for (const signature of serverManifest.SEEDED_SIGNATURES) {
      assert(typeof signature.flavor === "string" && signature.flavor.length > 0,
        `${signature.id}: missing flavor copy`);
      assert(typeof signature.mechanical === "string" && signature.mechanical.length > 0,
        `${signature.id}: missing mechanical copy`);
    }
  });

  await runner.run("noise storm seed presents canonical Noise copy and modifiers", async () => {
    const briefing = signatures.buildRunBriefing({ id: "test", name: "Test", wells: [], wrecks: [] }, 9);
    const signature = briefing.signature;
    const playerFacingCopy = `${signature.name} ${signature.flavor} ${signature.mechanical}`;

    assert(signature.id === "signal_storm", `Seed 9 must force signal_storm, got ${signature.id}`);
    assert(!/\bsignal\b/i.test(playerFacingCopy), `Retired Signal vocabulary leaked: ${playerFacingCopy}`);
    assert(signature.name === "noise storm", `Expected canonical Noise name, got ${signature.name}`);
    assert(signature.mechanical === "larger Noise radius / slower Noise decay",
      `Expected truthful Noise mechanics, got ${signature.mechanical}`);
    assert(signature.mods.noiseRadiusMultiplier === 1.5 && signature.mods.noiseDecayMultiplier === 0.7,
      "Canonical Noise modifier keys or values changed");
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
