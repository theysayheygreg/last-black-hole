const assert = require("assert");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

function read(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), "utf8");
}

function includes(source, needle, message) {
  assert(source.includes(needle), message || `Expected to find ${needle}`);
}

function run() {
  const readme = read("README.md");
  const startHereSource = read("scripts/build.cjs");
  const playScript = read("scripts/play.cjs");
  const deckRunbook = read("docs/reference/STEAM-DECK-RUNBOOK.md");
  const workflow = read(".github/workflows/nightly-playables.yml");

  includes(readme, "## How To Play", "README must expose a real player-facing how-to-play section");
  includes(readme, "npm run play", "README must document the canonical local source launch");
  includes(readme, "npm run stop", "README must document how to stop the full local authority stack");
  includes(readme, "First launch flow:", "README must explain how to get from title screen into a run");
  includes(readme, "Go to `LAUNCH`", "README must describe the home-to-map launch step");
  includes(readme, "follow wormhole arrows", "README must describe the in-run extraction objective");
  includes(readme, "releases/download/v0.2.2-final/install.sh | sh -s -- --version v0.2.2-final", "README must keep the release-owned Deck install command visible, pinned to the stable public release");
  includes(readme, "START-HERE.md", "README must point packaged-build testers at the generated instructions");
  includes(readme, "npm run stack:remote -- --sim=http://HOST:PORT", "README remote-client example must include the required sim URL");

  includes(startHereSource, "Choose the launcher for your platform", "Generated START-HERE must be platform-specific");
  includes(startHereSource, "First launch flow", "Generated START-HERE must explain the first run path");
  includes(startHereSource, "Go to LAUNCH", "Generated START-HERE must explain home-to-map launch");
  includes(startHereSource, "follow wormhole arrows", "Generated START-HERE must include the run objective");
  includes(startHereSource, "Steam Deck", "Generated START-HERE must mention the Deck installer preference");
  includes(workflow, "START-HERE.md", "Weekly platform zips must include generated play instructions");

  includes(playScript, "npm run stop", "npm run play exit message must point at the full stack stop command");

  includes(deckRunbook, "First launch flow on Deck", "Deck runbook must explain what to do after install");
  includes(deckRunbook, "Library -> Non-Steam", "Deck runbook must say where Gaming Mode launch appears");
  includes(deckRunbook, "R2", "Deck runbook must include playable Deck controls");

  console.log("Play instructions guard passed.");
}

run();
