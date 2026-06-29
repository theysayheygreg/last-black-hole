const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

const ROOT = path.resolve(__dirname, "..");

function read(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), "utf8");
}

function includes(source, needle, message) {
  assert(source.includes(needle), message || `Expected to find ${needle}`);
}

function excludes(source, needle, message) {
  assert(!source.includes(needle), message || `Expected not to find ${needle}`);
}

function pngSize(relPath) {
  const buffer = fs.readFileSync(path.join(ROOT, relPath));
  assert(buffer.slice(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), `${relPath} is not a PNG`);
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function assertPng(relPath, width, height) {
  const size = pngSize(relPath);
  assert.strictEqual(size.width, width, `${relPath} width`);
  assert.strictEqual(size.height, height, `${relPath} height`);
}

async function run() {
  const prompts = await import(pathToFileURL(path.join(ROOT, "src", "ui", "input-prompts.js")).href);
  assert.strictEqual(prompts.promptLabel("confirm", { deck: true }), "A");
  assert.strictEqual(prompts.promptLabel("back", { deck: true }), "B");
  assert.strictEqual(prompts.promptLabel("pulse", { deck: true }), "X");
  assert.strictEqual(prompts.promptLabel("inventory", { deck: true }), "View");
  assert.strictEqual(prompts.promptLabel("tabs", { deck: true }), "L1/R1");
  assert(prompts.menuHint({ deck: true }).includes("D-pad select"), "Deck menu hint must prefer D-pad");

  const index = read("index-a.html");
  includes(index, "--lbh-couch-body: 15px", "HUD must keep a couch-readable body-size target");
  includes(index, "--lbh-gauge-height: 14px", "HUD gauges must stay at least text-sized on Deck");
  includes(index, "width: 160px; height: var(--lbh-gauge-height)", "Fuel/signal bars must not regress to hairlines");
  includes(index, "#hud-abilities", "Deck HUD must keep abilities in an explicit panel");
  includes(index, "backdrop-filter: blur(2px)", "HUD panels need backing separation over dense ASCII fields");

  const main = read("src/main.js");
  const hud = read("src/hud.js");
  const results = read("src/run-results.js");
  const primitives = read("src/ui/canvas-primitives.js");
  for (const source of [main, hud, results]) {
    excludes(source, "press space", "Player-facing code must not hardcode press-space prompts");
    excludes(source, "space/A", "Player-facing code must use centralized prompt helpers");
    excludes(source, "[Tab]", "Player-facing code must not hardcode Tab inventory prompts");
  }
  includes(main, "currentPromptOptions()", "Canvas overlays must route through prompt options");
  includes(hud, "promptLabel('inventory'", "HUD cargo prompt must use centralized input labels");
  includes(results, "promptLabel('confirm'", "Results overlay must use centralized input labels");
  includes(primitives, "r.y + r.h + 8", "Command button affordances must draw below the button label");
  excludes(primitives, "hotkey ? `${String(hotkey).toUpperCase()}  ${String(label).toUpperCase()}`", "Command labels must not fuse input affordances into the action label");

  const electronMain = read("desktop/electron-main.cjs");
  includes(electronMain, "params.set('deck', '1')", "Packaged Deck renderer must receive an explicit deck mode flag");

  const build = read("scripts/build.cjs");
  includes(build, "APP_ICON_PNG", "Build must know about the app icon");
  includes(build, "last-singularity-icon.png", "Desktop package must copy a loose Deck/desktop icon");

  const deploy = read("scripts/deploy/steam-deck.cjs");
  const gaming = read("scripts/deploy/deck-gaming-mode.cjs");
  const installer = read("scripts/install-steam-deck.sh");
  includes(deploy, "Icon=", "Deck desktop entries must include the app icon");
  includes(gaming, "last-singularity-icon.png", "Gaming Mode shortcut metadata must include the app icon");
  includes(installer, "last-singularity-icon.png", "One-click installer must wire the app icon");

  assertPng("assets/app/icon-256.png", 256, 256);
  assertPng("assets/app/icon-512.png", 512, 512);
  assertPng("docs/public/steam/capsule-main-616x353.png", 616, 353);
  assertPng("docs/public/steam/capsule-header-460x215.png", 460, 215);
  assertPng("docs/public/steam/capsule-small-231x87.png", 231, 87);
  assertPng("docs/public/steam/library-capsule-600x900.png", 600, 900);
  assertPng("docs/public/steam/library-hero-3840x1240.png", 3840, 1240);
  assertPng("docs/public/steam/library-logo-1280x720.png", 1280, 720);
  includes(read("docs/public/steam/STORE-COPY.md"), "Surf an ASCII-dithered spacetime ocean", "Steam copy draft must exist");

  console.log("Steam Deck compatibility guard passed.");
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
