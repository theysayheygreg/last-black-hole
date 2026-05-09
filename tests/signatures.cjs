const fs = require("fs");
const os = require("os");
const path = require("path");
const { TestRunner, assert } = require("./helpers.cjs");
const serverManifest = require("../scripts/content/signatures.cjs");

const ROOT = path.join(__dirname, "..");

async function loadSignatureModule() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lbh-signatures-"));
  fs.mkdirSync(path.join(tmp, "content"), { recursive: true });
  fs.writeFileSync(path.join(tmp, "signatures.mjs"), fs.readFileSync(path.join(ROOT, "src", "signatures.js"), "utf8"));
  fs.writeFileSync(path.join(tmp, "config.mjs"), fs.readFileSync(path.join(ROOT, "src", "config.js"), "utf8"));
  fs.writeFileSync(
    path.join(tmp, "content", "signatures.mjs"),
    fs.readFileSync(path.join(ROOT, "src", "content", "signatures.js"), "utf8")
  );

  let signaturesSrc = fs.readFileSync(path.join(tmp, "signatures.mjs"), "utf8");
  signaturesSrc = signaturesSrc
    .replace("./config.js", "./config.mjs")
    .replace("./content/signatures.js", "./content/signatures.mjs");
  fs.writeFileSync(path.join(tmp, "signatures.mjs"), signaturesSrc);

  return import(`file://${path.join(tmp, "signatures.mjs")}`);
}

async function run() {
  const runner = new TestRunner("Signatures");
  const signatures = await loadSignatureModule();

  await runner.run("rollSignature uses map-size pools and stable ids", async () => {
    const first3 = signatures.rollSignature(3, () => 0);
    assert(first3.id === "slow_tide", `Expected slow_tide, got ${first3.id}`);
    assert(first3.name === "the slow tide", `Unexpected name ${first3.name}`);

    const next3 = signatures.rollSignature(3, () => 0);
    assert(next3.id === "shattered_merge", `Expected streak-protected shattered_merge, got ${next3.id}`);

    const first10 = signatures.rollSignature(10, () => 0);
    assert(serverManifest.SIGNATURE_POOLS_BY_MAP_SIZE[10].includes(first10.id), "10x10 signature was not in server pool");
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
  });

  const allPassed = runner.summary();
  process.exit(allPassed ? 0 : 1);
}

run().catch((err) => {
  console.error("Signatures test fatal error:", err.stack || err.message);
  process.exit(1);
});
