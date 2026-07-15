const assert = require("assert");
const fs = require("fs");
const path = require("path");
const {
  classifyPaths,
  isProcessOnlyPath,
  normalizeRepoPath,
} = require("../scripts/push-scope.cjs");

const ROOT = path.resolve(__dirname, "..");

function run() {
  const processOnly = [
    "docs/project/LBH-ORCHESTRATION-CONTRACT.md",
    "README.md",
    ".githooks/pre-push",
    ".github/workflows/ci.yml",
    "tests/push-scope.cjs",
    "scripts/push-scope.cjs",
    "scripts/release.cjs",
  ];
  const runtime = [
    "src/main.js",
    "scripts/sim-runtime.cjs",
    "package.json",
    "assets/audio/inhibitor.wav",
  ];

  for (const file of processOnly) {
    assert.strictEqual(isProcessOnlyPath(file), true, `${file} should be process-only`);
  }
  for (const file of runtime) {
    assert.strictEqual(isProcessOnlyPath(file), false, `${file} should require release preparation`);
  }

  assert.strictEqual(normalizeRepoPath("./docs\\project\\ROADMAP.md"), "docs/project/ROADMAP.md");
  assert.strictEqual(classifyPaths(processOnly), "process-only");
  assert.strictEqual(classifyPaths([...processOnly, "src/main.js"]), "release-required");
  assert.strictEqual(classifyPaths([]), "release-required", "Empty or unreadable ranges must fail closed");

  const hook = fs.readFileSync(path.join(ROOT, ".githooks", "pre-push"), "utf8");
  assert(hook.includes("scripts/push-scope.cjs"), "Tracked hook must classify the pushed range");
  assert(!hook.includes("LBH_SKIP_RELEASE_PREP"), "Tracked hook must not rely on a manual skip variable");

  console.log("Push scope: 17 assertions passed");
}

run();
