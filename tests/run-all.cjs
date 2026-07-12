/**
 * Manifest-driven LBH test harness.
 *
 * Usage:
 *   node tests/run-all.cjs [index-a.html] [--lane=core] [--renderer=three]
 *   node tests/run-all.cjs --lane=three --renderer=three
 *   node tests/run-all.cjs --lane=visual --renderer=both
 *
 * Lanes keep different questions separate:
 * - fast: cheap commit canary
 * - core: stable local regression gate
 * - authority: control-plane/sim/remote stack
 * - sim-structure: v0.3 body, query, event, and snapshot contracts
 * - multiplayer-structure: membership, privacy, and settlement contracts
 * - multiplayer-authority: deterministic 1/4/8 authority and structure proof
 * - multiplayer-network: JSON frame and bounded queue/backpressure primitives
 * - multiplayer-impairment-browser: isolated four-browser application-frame PR smoke
 * - visual: screenshot renderer fixtures
 * - playtest: real menu/input flows best reviewed in Codex Browser
 * - agent-eval: fresh playable map checks with screenshots and a narrative report
 * - full: all committed automated suites
 */
const path = require("path");
const { spawnSync } = require("child_process");
const { SUITES, LANES } = require("./suite-manifest.cjs");
const { withQuery } = require("./helpers.cjs");

const rawArgs = process.argv.slice(2);
const options = {
  lane: null,
  renderer: "three",
  suiteFilter: null,
  list: false,
  noRetries: false,
};
let target = null;

for (const arg of rawArgs) {
  if (arg === "--fast") {
    options.lane = options.lane || "fast";
  } else if (arg === "--list") {
    options.list = true;
  } else if (arg === "--no-retries") {
    options.noRetries = true;
  } else if (arg.startsWith("--lane=")) {
    options.lane = arg.slice("--lane=".length);
  } else if (arg.startsWith("--renderer=")) {
    options.renderer = arg.slice("--renderer=".length);
  } else if (arg.startsWith("--suite=")) {
    options.suiteFilter = new Set(
      arg.slice("--suite=".length).split(",").map((name) => name.trim()).filter(Boolean),
    );
  } else if (!target) {
    target = arg;
  } else {
    throw new Error(`Unknown argument: ${arg}`);
  }
}

target = target || "index-a.html";
options.lane = options.lane || "core";

if (!LANES.includes(options.lane)) {
  throw new Error(`Unknown lane '${options.lane}'. Known lanes: ${LANES.join(", ")}`);
}
if (!["legacy", "three", "both", "target"].includes(options.renderer)) {
  throw new Error("Renderer must be one of: legacy, three, both, target");
}
if (options.suiteFilter) {
  const knownSuites = new Set(SUITES.map((suite) => suite.name));
  const unknownSuites = [...options.suiteFilter].filter((name) => !knownSuites.has(name));
  if (unknownSuites.length > 0) {
    throw new Error(`Unknown suite '${unknownSuites.join(", ")}'. Known suites: ${[...knownSuites].join(", ")}`);
  }
}

function variantsForSuite(suite) {
  if (!suite.browser || options.renderer === "target") return [{ label: "target", target }];
  const renderers = options.renderer === "both" ? ["legacy", "three"] : [options.renderer];
  return renderers.map((renderer) => ({
    label: renderer,
    target: withQuery(target, { renderer }),
  }));
}

function selectedSuites() {
  return SUITES.filter((suite) => {
    if (!suite.lanes.includes(options.lane)) return false;
    if (options.suiteFilter && !options.suiteFilter.has(suite.name)) return false;
    return true;
  });
}

function commandFor(suite, variant) {
  const suitePath = path.join(__dirname, suite.file);
  return {
    cmd: process.execPath,
    args: suite.browser ? [suitePath, variant.target] : [suitePath],
  };
}

function printPlan(entries) {
  console.log("\nLAST SINGULARITY TEST HARNESS");
  console.log(`Lane:     ${options.lane}`);
  console.log(`Target:   ${target}`);
  console.log(`Renderer: ${options.renderer}`);
  console.log("");
  for (const entry of entries) {
    const suffix = entry.suite.browser ? ` [${entry.variant.label}: ${entry.variant.target}]` : "";
    const slow = entry.suite.slow ? " slow" : "";
    const visual = entry.suite.visual ? " visual" : "";
    console.log(`- ${entry.suite.name}${suffix}${slow}${visual}`);
  }
  console.log("");
}

const suites = selectedSuites();
const entries = suites.flatMap((suite) => variantsForSuite(suite).map((variant) => ({ suite, variant })));

if (options.list) {
  printPlan(entries);
  process.exit(0);
}

if (entries.length === 0) {
  console.log("No suites selected.");
  process.exit(0);
}

printPlan(entries);

let allPassed = true;
const results = [];

for (const entry of entries) {
  const { suite, variant } = entry;
  const maxAttempts = options.noRetries ? 1 : 1 + (suite.retries || 0);
  let passed = false;
  let status = 0;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const label = suite.browser ? `${suite.name} (${variant.label})` : suite.name;
    if (attempt > 1) console.log(`\n${label} failed; retrying to isolate harness timing.\n`);
    const { cmd, args } = commandFor(suite, variant);
    const result = spawnSync(cmd, args, {
      cwd: path.resolve(__dirname, ".."),
      stdio: "inherit",
      timeout: suite.timeout || 60000,
    });
    status = result.status ?? 1;
    if (status === 0) {
      passed = true;
      break;
    }
  }

  results.push({
    name: suite.name,
    renderer: suite.browser ? variant.label : "node",
    passed,
    status,
  });
  if (!passed) allPassed = false;
}

console.log("\nSUMMARY");
for (const result of results) {
  const renderer = result.renderer === "node" ? "" : ` [${result.renderer}]`;
  console.log(`${result.passed ? "PASS" : "FAIL"} ${result.name}${renderer}`);
}

if (allPassed) {
  console.log("\nAll selected suites passed.\n");
} else {
  console.log("\nSome selected suites failed. Use --lane, --suite, and --renderer to isolate.\n");
}

process.exit(allPassed ? 0 : 1);
