/**
 * Run all test suites.
 * Usage:
 *   node tests/run-all.js [index-a.html] [--fast]
 *
 * --fast skips suites tagged `slow:true` so dev iteration drops from
 * ~4.5min to ~2min. CI / pre-push should run the full set.
 *
 * Exits with code 0 if all pass, 1 if any fail.
 */
const { execSync } = require("child_process");
const path = require("path");

const args = process.argv.slice(2).filter((a) => a !== "--fast");
const fastMode = process.argv.includes("--fast");
const htmlFile = args[0] || "index-a.html";

// `slow: true` means the suite individually takes >20s. Together the slow
// tier is ~140s out of ~280s total — skipping in fast mode roughly halves
// dev-iteration runtime. Full suite still runs without --fast.
const suites = [
  { name: "Validation", file: "validation.js" },
  { name: "Signatures", file: "signatures.js" },
  { name: "Smoke", file: "smoke.js" },
  { name: "InfraSmoke", file: "infra-smoke.js" },
  { name: "TelemetrySmoke", file: "telemetry-smoke.js" },
  { name: "SimLifecycle", file: "sim-lifecycle.js" },
  { name: "MetaFlow", file: "meta-flow.js", timeout: 90000, slow: true },
  { name: "RunResults", file: "run-results.js" },
  { name: "Controller", file: "controller.js", slow: true },
  { name: "KeyboardMouse", file: "keyboard-mouse.js", retries: 1 },
  { name: "Physics", file: "physics.js" },
  { name: "Coordinates", file: "coordinates.js" },
  { name: "Flow", file: "flow.js", slow: true },
  { name: "FluidWindow", file: "fluid-window.js" },
  { name: "Balance", file: "balance.js" },
  { name: "Items", file: "items.js" },
  { name: "Inventory", file: "inventory.js" },
  { name: "Systems", file: "systems.js" },
  { name: "PlayerBrain", file: "player-brain.js" },
  { name: "ControlPlane", file: "control-plane.js" },
  { name: "OverloadState", file: "overload-state.js" },
  { name: "CoarseField", file: "coarse-field.js" },
  { name: "SimScale", file: "sim-scale.js" },
  { name: "RemoteAuthority", file: "remote-authority.js", retries: 1, timeout: 120000, slow: true },
];

const activeSuites = fastMode ? suites.filter((s) => !s.slow) : suites;
const skippedCount = suites.length - activeSuites.length;

console.log(`\n╔══════════════════════════════════════╗`);
console.log(`║  LAST SINGULARITY — TEST HARNESS     ║`);
console.log(`║  Target: ${htmlFile.padEnd(28)}║`);
if (fastMode) {
  console.log(`║  Mode:   fast (${skippedCount} slow suites skipped) ║`);
}
console.log(`╚══════════════════════════════════════╝\n`);

let allPassed = true;
const results = [];

for (const suite of activeSuites) {
  const suitePath = path.join(__dirname, suite.file);
  const maxAttempts = 1 + (suite.retries || 0);
  let passed = false;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      execSync(`node "${suitePath}" "${htmlFile}"`, {
        stdio: "inherit",
        timeout: suite.timeout || 60000,
      });
      passed = true;
      break;
    } catch (err) {
      if (attempt < maxAttempts) {
        console.log(`\n${suite.name} failed; retrying once to isolate harness timing flake.\n`);
      }
    }
  }
  results.push({ name: suite.name, passed });
  if (!passed) {
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
