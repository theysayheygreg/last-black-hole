const { TestRunner, assert } = require("./helpers.cjs");
const fs = require("fs");
const path = require("path");
const { HULL_DEFINITIONS, PUBLIC_HULL_IDS } = require("../scripts/content/hulls.cjs");

async function run() {
  const runner = new TestRunner("PublicRoster");

  await runner.run("v0.3 exposes only mechanically complete pilot hulls", async () => {
    assert(PUBLIC_HULL_IDS.join(",") === "drifter,breacher",
      `Expected Drifter/Breacher public roster, got ${PUBLIC_HULL_IDS.join(",")}`);
    for (const hullId of PUBLIC_HULL_IDS) {
      const hull = HULL_DEFINITIONS[hullId];
      assert(hull, `Expected public hull ${hullId} to have a definition`);
      assert(Number.isFinite(hull.thrustScale) && hull.thrustScale > 0,
        `Expected ${hullId} authoritative movement coefficients`);
      assert(hull.abilities && Object.keys(hull.abilities).length > 0,
        `Expected ${hullId} authored abilities`);
    }
  });

  await runner.run("unfinished hulls remain internal instead of disappearing", async () => {
    for (const hullId of ["resonant", "shroud", "hauler"]) {
      assert(HULL_DEFINITIONS[hullId], `Expected internal ${hullId} definition to remain available`);
      assert(!PUBLIC_HULL_IDS.includes(hullId), `Expected ${hullId} to stay out of the public roster`);
    }
  });

  await runner.run("generated player-facing copy does not leak internal hull names", async () => {
    const root = path.resolve(__dirname, "..");
    for (const relative of ["src/seeded-generation.js", "scripts/seeded-generation.cjs", "src/wrecks.js"]) {
      const source = fs.readFileSync(path.join(root, relative), "utf8");
      for (const hidden of ["Resonant", "Shroud", "Hauler"]) {
        assert(!source.includes(hidden), `${relative} must not expose internal hull name ${hidden}`);
      }
    }
  });

  process.exit(runner.summary() ? 0 : 1);
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
