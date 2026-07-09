const { TestRunner, assert } = require("./helpers.cjs");
const {
  assertPublicVersion,
  currentBuildVersion,
  currentPublicVersion,
  currentVersionTrain,
  parseBuildVersion,
} = require("../scripts/version.cjs");

async function run() {
  const runner = new TestRunner("Versioning");

  await runner.run("v0.3 uses public patch plus commit hash", async () => {
    assert(currentPublicVersion() === "0.3.0", `Expected v0.3 public train, got ${currentPublicVersion()}`);
    assert(currentVersionTrain() === "0.3", `Expected active train 0.3, got ${currentVersionTrain()}`);
    const build = currentBuildVersion("0.3.0", "abcdef0");
    assert(build === "0.3.0.abcdef0", `Expected four-part build version, got ${build}`);
    const parsed = parseBuildVersion(build);
    assert(parsed.minor === 3 && parsed.public === 0 && parsed.hash === "abcdef0",
      `Unexpected parsed build ${JSON.stringify(parsed)}`);
  });

  await runner.run("release validation follows the active semantic train", async () => {
    const parsed = assertPublicVersion("0.3.7");
    assert(parsed.major === 0 && parsed.minor === 3 && parsed.public === 7,
      `Unexpected public version ${JSON.stringify(parsed)}`);
  });

  process.exit(runner.summary() ? 0 : 1);
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
