const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const installerPath = path.join(ROOT, "scripts", "install-steam-deck.sh");
const workflowPath = path.join(ROOT, ".github", "workflows", "nightly-playables.yml");
const readmePath = path.join(ROOT, "README.md");

function includes(source, needle, message) {
  assert(source.includes(needle), message || `Expected to find ${needle}`);
}

function run() {
  execFileSync("bash", ["-n", installerPath], { cwd: ROOT, stdio: "inherit" });

  const installer = fs.readFileSync(installerPath, "utf8");
  includes(installer, "last-singularity-linux-nightly.zip", "Installer must default to the stable public Linux release asset");
  includes(installer, "releases/download", "Installer must download from GitHub releases by default");
  includes(installer, "--disable-gpu-sandbox", "Installer launcher must preserve Deck GPU sandbox workaround");
  includes(installer, "--ignore-gpu-blocklist", "Installer launcher must preserve Deck GPU blocklist workaround");
  includes(installer, "--ozone-platform=x11", "Installer launcher must force the tested Deck XWayland path");
  includes(installer, "ELECTRON_LOG_FILE", "Installer launcher must persist Electron logs");
  includes(installer, "shortcuts.vdf", "Installer must register a Gaming Mode shortcut");
  includes(installer, ".lbh-backup-", "Installer must back up Steam shortcuts before writing");
  includes(installer, "LBH_SKIP_STEAM_SHORTCUT", "Installer must expose a Desktop Mode-only escape hatch");
  includes(installer, "LBH_DECK_BUILD_URL", "Installer must allow explicit build URL override");

  const workflow = fs.readFileSync(workflowPath, "utf8");
  includes(workflow, "name: Weekly Playables", "Regular playable workflow must be labeled weekly");
  includes(workflow, "cron: '17 9 * * 1'", "Regular playable workflow must run weekly");
  includes(workflow, "priorRun.head_sha === currentSha", "Scheduled playable workflow must skip unchanged commits");
  includes(workflow, "build-linux:", "Weekly workflow must build a Linux artifact for Deck installs");
  includes(workflow, "last-singularity-linux-nightly.zip", "Weekly workflow must publish the Linux Deck zip");
  includes(workflow, "START-HERE.md", "Weekly release zips must include playable instructions");
  includes(workflow, "BUILD-MANIFEST.json", "Weekly release zips must include build metadata");
  includes(workflow, "scripts/ci/package-nightly-assets.cjs", "Weekly workflow must use the checked-in CJS packager");

  const readme = fs.readFileSync(readmePath, "utf8");
  includes(readme, "## Playable Targets", "README must expose playable targets");
  includes(readme, "scripts/install-steam-deck.sh | bash", "README must document the Deck installer command");
  includes(readme, "docs/reference/STEAM-DECK-RUNBOOK.md", "README must link the Steam Deck runbook");

  console.log("Deck installer public pipeline guard passed.");
}

run();
