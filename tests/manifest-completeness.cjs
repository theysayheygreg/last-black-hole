const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { SUITES } = require("./suite-manifest.cjs");
const { EXCLUSIONS } = require("./manifest-exclusions.cjs");

const TESTS_DIR = __dirname;
const topLevelTests = fs.readdirSync(TESTS_DIR)
  .filter((file) => file.endsWith(".cjs"))
  .sort();
const listedFiles = SUITES.map((suite) => suite.file);
const listedSet = new Set(listedFiles);
const exclusionFiles = Object.keys(EXCLUSIONS).sort();
const exclusionSet = new Set(exclusionFiles);

function print(label, values) {
  if (values.length > 0) console.error(`${label}: ${values.join(", ")}`);
}

try {
  const duplicateSuites = listedFiles.filter((file, index) => listedFiles.indexOf(file) !== index);
  const missingManifestFiles = listedFiles.filter((file) => !topLevelTests.includes(file));
  const staleExclusions = exclusionFiles.filter((file) => !topLevelTests.includes(file));
  const missingReasons = exclusionFiles.filter((file) => typeof EXCLUSIONS[file] !== "string" || !EXCLUSIONS[file].trim());
  const listedAndExcluded = topLevelTests.filter((file) => listedSet.has(file) && exclusionSet.has(file));
  const unclassified = topLevelTests.filter((file) => !listedSet.has(file) && !exclusionSet.has(file));

  print("Duplicate manifest entries", duplicateSuites);
  print("Manifest entries missing from tests/", missingManifestFiles);
  print("Stale manifest exclusions", staleExclusions);
  print("Exclusions without a reason", missingReasons);
  print("Files both wired and excluded", listedAndExcluded);
  print("Unclassified top-level tests", unclassified);

  assert.strictEqual(duplicateSuites.length, 0, "Every manifest suite file must be unique");
  assert.strictEqual(missingManifestFiles.length, 0, "Every manifest suite file must exist");
  assert.strictEqual(staleExclusions.length, 0, "Every exclusion must name a current top-level .cjs file");
  assert.strictEqual(missingReasons.length, 0, "Every exclusion must carry a one-line reason");
  assert.strictEqual(listedAndExcluded.length, 0, "A file must be either wired or excluded, never both");
  assert.strictEqual(unclassified.length, 0,
    "Every top-level tests/*.cjs file must be manifest-wired or explicitly excluded");

  console.log(`ManifestCompleteness: ${topLevelTests.length} top-level files = ${listedFiles.length} wired + ${exclusionFiles.length} excluded`);
} catch (error) {
  console.error(error.stack || error.message);
  process.exitCode = 1;
}
