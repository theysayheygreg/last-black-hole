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
  { name: "Validation", file: "validation.cjs" },
  { name: "Signatures", file: "signatures.cjs" },
  { name: "Smoke", file: "smoke.cjs" },
  { name: "InfraSmoke", file: "infra-smoke.cjs" },
  { name: "TelemetrySmoke", file: "telemetry-smoke.cjs" },
  { name: "SimLifecycle", file: "sim-lifecycle.cjs" },
  { name: "MetaFlow", file: "meta-flow.cjs", timeout: 90000, slow: true },
  { name: "RunResults", file: "run-results.cjs" },
  { name: "Controller", file: "controller.cjs", slow: true },
  { name: "KeyboardMouse", file: "keyboard-mouse.cjs", retries: 1 },
  { name: "Physics", file: "physics.cjs" },
  { name: "Coordinates", file: "coordinates.cjs" },
  { name: "Flow", file: "flow.cjs", slow: true },
  { name: "FluidWindow", file: "fluid-window.cjs" },
  { name: "Balance", file: "balance.cjs" },
  { name: "Items", file: "items.cjs" },
  { name: "Inventory", file: "inventory.cjs" },
  { name: "Systems", file: "systems.cjs" },
  { name: "PlayerBrain", file: "player-brain.cjs" },
  { name: "ControlPlane", file: "control-plane.cjs" },
  { name: "OverloadState", file: "overload-state.cjs" },
  { name: "CoarseField", file: "coarse-field.cjs" },
  { name: "SimScale", file: "sim-scale.cjs" },
  { name: "RemoteAuthority", file: "remote-authority.cjs", retries: 1, timeout: 120000, slow: true },
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
