/**
 * Run all test suites.
 * Usage: node tests/run-all.js [index-a.html|index-b.html|index.html]
 *
 * Exits with code 0 if all pass, 1 if any fail.
 */
const { execSync } = require("child_process");
const path = require("path");

const htmlFile = process.argv[2] || "index-a.html";

const suites = [
  { name: "Validation", file: "validation.js" },
  { name: "Signatures", file: "signatures.js" },
  { name: "Smoke", file: "smoke.js" },
  { name: "InfraSmoke", file: "infra-smoke.js" },
  { name: "TelemetrySmoke", file: "telemetry-smoke.js" },
  { name: "SimLifecycle", file: "sim-lifecycle.js" },
  { name: "MetaFlow", file: "meta-flow.js", timeout: 90000 },
  { name: "RunResults", file: "run-results.js" },
  { name: "Controller", file: "controller.js" },
  { name: "KeyboardMouse", file: "keyboard-mouse.js", retries: 1 },
  { name: "Physics", file: "physics.js" },
  { name: "Coordinates", file: "coordinates.js" },
  { name: "Flow", file: "flow.js" },
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
  { name: "RemoteAuthority", file: "remote-authority.js", retries: 1, timeout: 120000 },
];

console.log(`\n╔══════════════════════════════════════╗`);
console.log(`║  LAST SINGULARITY — TEST HARNESS     ║`);
console.log(`║  Target: ${htmlFile.padEnd(28)}║`);
console.log(`╚══════════════════════════════════════╝\n`);

let allPassed = true;
const results = [];

for (const suite of suites) {
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
