#!/usr/bin/env node

const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const ZERO_SHA = /^0+$/;
const PROCESS_ONLY_PREFIXES = [
  "docs/",
  ".githooks/",
  ".github/",
  "tests/",
];
const PROCESS_ONLY_FILES = new Set([
  "README.md",
  "AGENTS.md",
  "CLAUDE.md",
  ".editorconfig",
  ".gitattributes",
  ".gitignore",
  "scripts/push-scope.cjs",
  "scripts/release.cjs",
]);

function normalizeRepoPath(file) {
  return String(file || "")
    .replaceAll("\\", "/")
    .replace(/^\.\//, "")
    .replace(/^\/+/, "");
}

function isProcessOnlyPath(file) {
  const normalized = normalizeRepoPath(file);
  if (!normalized) return false;
  if (PROCESS_ONLY_FILES.has(normalized)) return true;
  return PROCESS_ONLY_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

function classifyPaths(files) {
  const paths = Array.from(new Set((files || []).map(normalizeRepoPath).filter(Boolean))).sort();
  if (paths.length === 0) return "release-required";
  return paths.every(isProcessOnlyPath) ? "process-only" : "release-required";
}

function classifyRange(baseSha, headSha, { cwd = ROOT } = {}) {
  if (!baseSha || !headSha || ZERO_SHA.test(baseSha) || ZERO_SHA.test(headSha)) {
    return { classification: "release-required", paths: [], reason: "new-or-deleted-ref" };
  }

  const ancestry = spawnSync("git", ["merge-base", "--is-ancestor", baseSha, headSha], {
    cwd,
    encoding: "utf8",
  });
  if (ancestry.status !== 0) {
    return { classification: "release-required", paths: [], reason: "non-fast-forward-or-missing-base" };
  }

  const diff = spawnSync("git", [
    "diff",
    "--name-only",
    "--no-renames",
    "--diff-filter=ACDMRTUXB",
    `${baseSha}..${headSha}`,
  ], {
    cwd,
    encoding: "utf8",
  });
  if (diff.status !== 0) {
    return { classification: "release-required", paths: [], reason: "git-diff-failed" };
  }

  const paths = diff.stdout.split(/\r?\n/).map(normalizeRepoPath).filter(Boolean);
  return { classification: classifyPaths(paths), paths, reason: "changed-paths" };
}

if (require.main === module) {
  const [, , baseSha, headSha] = process.argv;
  const result = classifyRange(baseSha, headSha);
  console.log(result.classification);
}

module.exports = {
  PROCESS_ONLY_FILES,
  PROCESS_ONLY_PREFIXES,
  classifyPaths,
  classifyRange,
  isProcessOnlyPath,
  normalizeRepoPath,
};
