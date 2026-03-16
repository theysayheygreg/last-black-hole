/**
 * Run all test suites.
 * Usage: node tests/run-all.js [index-a.html|index-b.html|index.html]
 *
 * Exits with code 0 if all pass, 1 if any fail.
 */
const { execSync } = require("child_process");
const path = require("path");

const htmlFile = process.argv[2] || "index.html";

const suites = [
  { name: "Smoke", file: "smoke.js" },
  { name: "Physics", file: "physics.js" },
];

console.log(`\n╔══════════════════════════════════════╗`);
console.log(`║  LAST BLACK HOLE — TEST HARNESS      ║`);
console.log(`║  Target: ${htmlFile.padEnd(28)}║`);
console.log(`╚══════════════════════════════════════╝\n`);

let allPassed = true;
const results = [];

for (const suite of suites) {
  const suitePath = path.join(__dirname, suite.file);
  try {
    execSync(`node "${suitePath}" "${htmlFile}"`, {
      stdio: "inherit",
      timeout: 60000,
    });
    results.push({ name: suite.name, passed: true });
  } catch (err) {
    results.push({ name: suite.name, passed: false });
    allPassed = false;
  }
}

console.log(`\n╔══════════════════════════════════════╗`);
console.log(`║  SUMMARY                             ║`);
console.log(`╠══════════════════════════════════════╣`);
for (const r of results) {
  const status = r.passed ? "PASS" : "FAIL";
  const icon = r.passed ? "✓" : "✗";
  console.log(`║  ${icon} ${r.name.padEnd(20)} ${status.padEnd(14)}║`);
}
console.log(`╚══════════════════════════════════════╝`);

if (allPassed) {
  console.log("\nAll suites passed.\n");
} else {
  console.log("\nSome suites failed. See above for details.\n");
}

process.exit(allPassed ? 0 : 1);
