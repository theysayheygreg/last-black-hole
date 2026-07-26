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
 * - visual: screenshot renderer fixtures
 * - playtest: real menu/input flows best reviewed in Codex Browser
 * - agent-eval: fresh playable map checks with screenshots and a narrative report
 * - full: all committed automated suites
 */
const fs = require("fs");
const net = require("net");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { SUITES, LANES } = require("./suite-manifest.cjs");
const { withQuery } = require("./helpers.cjs");

const ROOT = path.resolve(__dirname, "..");
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

function positiveInt(value, fallback, ceiling) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, ceiling);
}

const totalWorkers = positiveInt(process.env.LBH_TEST_WORKERS, Math.min(4, os.availableParallelism()), 4);
const browserWorkers = Math.min(
  totalWorkers,
  positiveInt(process.env.LBH_TEST_BROWSER_WORKERS, Math.min(2, totalWorkers), 2),
);
const runId = `${Date.now()}-${process.pid}`;
const artifactRoot = path.join(ROOT, "tmp", "harness-artifacts", runId);
const runningChildren = new Set();

function killChildTree(child, signal = "SIGTERM") {
  try {
    if (process.platform === "win32") child.kill(signal);
    else process.kill(-child.pid, signal);
  } catch {}
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    for (const child of runningChildren) killChildTree(child);
    process.exit(signal === "SIGINT" ? 130 : 143);
  });
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

function consumesBrowser(suite) {
  return suite.browser || suite.browserProcess;
}

function labelFor(entry) {
  return entry.suite.browser
    ? `${entry.suite.name} (${entry.variant.label})`
    : entry.suite.name;
}

function printPlan(entries) {
  console.log("\nLAST SINGULARITY TEST HARNESS");
  console.log(`Lane:     ${options.lane}`);
  console.log(`Target:   ${target}`);
  console.log(`Renderer: ${options.renderer}`);
  console.log(`Workers:  ${totalWorkers} total / ${browserWorkers} browser`);
  console.log("");
  for (const entry of entries) {
    const suffix = entry.suite.browser ? ` [${entry.variant.label}: ${entry.variant.target}]` : "";
    const slow = entry.suite.slow ? " slow" : "";
    const visual = entry.suite.visual ? " visual" : "";
    const browserProcess = entry.suite.browserProcess ? " browser-process" : "";
    const group = entry.suite.isolationGroup ? ` isolated:${entry.suite.isolationGroup}` : "";
    console.log(`- ${entry.suite.name}${suffix}${slow}${visual}${browserProcess}${group}`);
  }
  console.log("");
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

function safeName(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function readLaunchMetrics(file) {
  const counts = { browser: 0, static: 0, sim: 0, control: 0 };
  try {
    for (const line of fs.readFileSync(file, "utf8").trim().split(/\r?\n/)) {
      if (Object.hasOwn(counts, line)) counts[line]++;
    }
  } catch {}
  return counts;
}

function addCounts(total, addition) {
  for (const key of Object.keys(total)) total[key] += addition[key] || 0;
}

async function runAttempt(entry, attempt) {
  const { suite, variant } = entry;
  const { cmd, args } = commandFor(suite, variant);
  const attemptId = `${String(entry.index + 1).padStart(3, "0")}-${safeName(labelFor(entry))}-a${attempt}`;
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "lbh-test-"));
  const metricsFile = path.join(tempRoot, "launches.log");
  const staticPort = await freePort();
  const env = {
    ...process.env,
    LBH_TEST_RUN_ID: runId,
    LBH_TEST_STATIC_PORT: String(staticPort),
    LBH_TEST_TMP_ROOT: tempRoot,
    LBH_TEST_ARTIFACT_ROOT: path.join(artifactRoot, attemptId),
    LBH_TEST_METRICS_FILE: metricsFile,
  };
  const startedAt = process.hrtime.bigint();

  return new Promise((resolve) => {
    const chunks = [];
    let timedOut = false;
    let sequence = 0;
    const child = spawn(cmd, args, {
      cwd: ROOT,
      env,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });
    runningChildren.add(child);
    const capture = (stream) => (data) => chunks.push({
      sequence: sequence++,
      stream,
      text: data.toString(),
    });
    child.stdout.on("data", capture("stdout"));
    child.stderr.on("data", capture("stderr"));

    let forceKill = null;
    const timeout = setTimeout(() => {
      timedOut = true;
      killChildTree(child);
      forceKill = setTimeout(() => killChildTree(child, "SIGKILL"), 2000);
    }, suite.timeout || 60000);

    child.on("error", (error) => chunks.push({
      sequence: sequence++,
      stream: "stderr",
      text: `${error.stack || error.message}\n`,
    }));
    child.on("close", (code, signal) => {
      clearTimeout(timeout);
      if (forceKill) clearTimeout(forceKill);
      runningChildren.delete(child);
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      const output = chunks
        .sort((a, b) => a.sequence - b.sequence)
        .map((chunk) => chunk.text)
        .join("");
      const launches = readLaunchMetrics(metricsFile);
      fs.rmSync(tempRoot, { recursive: true, force: true });
      resolve({
        attempt,
        passed: code === 0 && !timedOut,
        status: code ?? 1,
        signal,
        timedOut,
        durationMs,
        output,
        launches,
      });
    });
  });
}

async function runEntry(entry) {
  const maxAttempts = options.noRetries ? 1 : 1 + (entry.suite.retries || 0);
  const attempts = [];
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = await runAttempt(entry, attempt);
    attempts.push(result);
    if (result.passed) break;
  }
  const last = attempts.at(-1);
  return {
    name: entry.suite.name,
    renderer: entry.suite.browser ? entry.variant.label : "node",
    browser: consumesBrowser(entry.suite),
    passed: last.passed,
    status: last.status,
    attempts,
    durationMs: attempts.reduce((sum, attempt) => sum + attempt.durationMs, 0),
  };
}

function printResult(entry, result) {
  const label = labelFor(entry);
  for (const attempt of result.attempts) {
    console.log(`\n--- ${label} · attempt ${attempt.attempt} · ${(attempt.durationMs / 1000).toFixed(2)}s ---`);
    if (attempt.output) process.stdout.write(attempt.output.endsWith("\n") ? attempt.output : `${attempt.output}\n`);
    if (attempt.timedOut) console.log(`TIMEOUT after ${entry.suite.timeout || 60000}ms`);
    if (!attempt.passed && attempt.attempt < result.attempts.length) {
      console.log(`${label} failed; retrying to isolate harness timing.`);
    }
  }
}

async function runScheduled(entries) {
  const pending = [...entries];
  const active = new Map();
  const activeGroups = new Set();
  const results = new Array(entries.length);
  let browserActive = 0;
  let nextToPrint = 0;

  function canStart(entry) {
    if (active.size >= totalWorkers) return false;
    if (consumesBrowser(entry.suite) && browserActive >= browserWorkers) return false;
    return !entry.suite.isolationGroup || !activeGroups.has(entry.suite.isolationGroup);
  }

  function start(entry) {
    if (consumesBrowser(entry.suite)) browserActive++;
    if (entry.suite.isolationGroup) activeGroups.add(entry.suite.isolationGroup);
    console.log(
      `START ${labelFor(entry)} [active=${active.size + 1}/${totalWorkers} browser=${browserActive}/${browserWorkers}]`,
    );
    const promise = runEntry(entry).then((result) => ({ entry, result }));
    active.set(entry.index, promise);
  }

  function finish({ entry, result }) {
    active.delete(entry.index);
    if (consumesBrowser(entry.suite)) browserActive--;
    if (entry.suite.isolationGroup) activeGroups.delete(entry.suite.isolationGroup);
    results[entry.index] = result;
    while (results[nextToPrint]) {
      printResult(entries[nextToPrint], results[nextToPrint]);
      nextToPrint++;
    }
  }

  while (pending.length > 0 || active.size > 0) {
    let launched = false;
    for (let index = 0; index < pending.length && active.size < totalWorkers;) {
      const entry = pending[index];
      if (!canStart(entry)) {
        index++;
        continue;
      }
      pending.splice(index, 1);
      start(entry);
      launched = true;
    }
    if (active.size === 0) {
      throw new Error(`No runnable suite remains: ${pending.map(labelFor).join(", ")}`);
    }
    if (!launched || active.size >= totalWorkers || pending.length === 0) {
      finish(await Promise.race(active.values()));
    }
  }
  return results;
}

async function main() {
  const suites = selectedSuites();
  const entries = suites
    .flatMap((suite) => variantsForSuite(suite).map((variant) => ({ suite, variant })))
    .map((entry, index) => ({ ...entry, index }));

  if (options.list) {
    printPlan(entries);
    return 0;
  }
  if (entries.length === 0) {
    console.log("No suites selected.");
    return 0;
  }

  printPlan(entries);
  const startedAt = process.hrtime.bigint();
  const results = await runScheduled(entries);
  const wallMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
  const launches = { browser: 0, static: 0, sim: 0, control: 0 };
  let suiteProcesses = 0;
  for (const result of results) {
    suiteProcesses += result.attempts.length;
    for (const attempt of result.attempts) addCounts(launches, attempt.launches);
  }

  console.log("\nSUMMARY");
  for (const result of results) {
    const renderer = result.renderer === "node" ? "" : ` [${result.renderer}]`;
    const retries = result.attempts.length > 1 ? ` attempts=${result.attempts.length}` : "";
    console.log(`${result.passed ? "PASS" : "FAIL"} ${result.name}${renderer} ${(result.durationMs / 1000).toFixed(2)}s${retries}`);
  }
  console.log("\nTIMING RECEIPT");
  console.log(`Wall:             ${(wallMs / 1000).toFixed(2)}s`);
  console.log(`Suite time:       ${(results.reduce((sum, result) => sum + result.durationMs, 0) / 1000).toFixed(2)}s`);
  console.log(`Suite processes:  ${suiteProcesses}`);
  console.log(`Browser launches: ${launches.browser}`);
  console.log(`Service starts:   static=${launches.static} sim=${launches.sim} control=${launches.control}`);
  console.log(`Workers:          total=${totalWorkers} browser=${browserWorkers}`);
  console.log(`Artifacts:        ${path.relative(ROOT, artifactRoot)}`);

  const allPassed = results.every((result) => result.passed);
  console.log(allPassed
    ? "\nAll selected suites passed.\n"
    : "\nSome selected suites failed. Use --lane, --suite, and --renderer to isolate.\n");
  return allPassed ? 0 : 1;
}

main()
  .then((status) => { process.exitCode = status; })
  .catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
