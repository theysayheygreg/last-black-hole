const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { buildIdForMode, currentBuildVersion } = require("../scripts/version.cjs");

const ROOT = path.resolve(__dirname, "..");
const BUILD_ID = buildIdForMode("test", currentBuildVersion());
const BUILD_ROOT = path.join(ROOT, "builds", BUILD_ID);
const DROP_DIR = path.join(BUILD_ROOT, "last-singularity-cloudflare-drop");
const DROP_ZIP = path.join(ROOT, "builds", `last-singularity-cloudflare-drop-${BUILD_ID}.zip`);

function read(file) {
  return fs.readFileSync(file, "utf8");
}

function assertIncludes(source, needle, message) {
  assert(source.includes(needle), message || `Expected to find ${needle}`);
}

function run() {
  execFileSync(process.execPath, ["scripts/build.cjs", "--targets=drop", "--mode=test"], {
    cwd: ROOT,
    stdio: "inherit",
  });

  const indexPath = path.join(DROP_DIR, "index.html");
  const debugIndexPath = path.join(DROP_DIR, "index-a.html");
  const notesPath = path.join(DROP_DIR, "CLOUDFLARE-DROP.md");
  const flagsPath = path.join(DROP_DIR, "src", "build-flags.js");
  const threePath = path.join(DROP_DIR, "node_modules", "three", "build", "three.module.js");
  const manifestPath = path.join(BUILD_ROOT, "BUILD-MANIFEST.json");
  const infoPath = path.join(BUILD_ROOT, "BUILD-INFO-drop.json");
  const packageJson = JSON.parse(read(path.join(ROOT, "package.json")));

  assert(fs.existsSync(indexPath), "Drop build must include index.html");
  assert(fs.existsSync(debugIndexPath), "Drop build must include index-a.html");
  assert(fs.existsSync(notesPath), "Drop build must include Cloudflare Drop notes");
  assert(fs.existsSync(flagsPath), "Drop build must include generated build flags");
  assert(fs.existsSync(threePath), "Drop build must include the Three runtime");
  assert(fs.existsSync(DROP_ZIP), "Drop build must write a dedicated Cloudflare zip");
  assert.strictEqual(
    packageJson.scripts["release:drop"],
    "node scripts/release.cjs drop",
    "release:drop must go through the release helper so hash builds require committed source",
  );

  for (const file of [indexPath, debugIndexPath]) {
    const html = read(file);
    assertIncludes(html, "url.searchParams.set('localSandbox', '1')", `${file} must force local sandbox mode`);
    assertIncludes(html, "url.searchParams.delete('simServer')", `${file} must clear explicit sim-server URLs`);
    assertIncludes(html, "localStorage.removeItem('lbh.simServerUrl')", `${file} must clear remembered sim URLs`);
    assertIncludes(html, "url.searchParams.set('renderer', 'three')", `${file} must default to the Three renderer`);
  }

  const notes = read(notesPath);
  assertIncludes(notes, "Cloudflare Drop", "Drop notes must name the share surface");
  assertIncludes(notes, "static browser sandbox build", "Drop notes must explain the runtime shape");
  assertIncludes(notes, "does not run the Node control plane", "Drop notes must not imply authority support");

  const flags = read(flagsPath);
  assertIncludes(flags, '"mode": "test"', "Test-mode Drop build must preserve test build flags");
  assertIncludes(flags, '"enableTestAPI": true', "Test-mode Drop build must keep the test API enabled");

  const manifest = JSON.parse(read(manifestPath));
  assert.strictEqual(manifest.mode, "test");
  assert(manifest.results.some((item) => item.target === "drop" && item.status === "built"), "Manifest must list the Drop target");

  const info = JSON.parse(read(infoPath));
  assert.strictEqual(info.target, "drop");
  assert.strictEqual(info.runtimeMode, "local-sandbox");
  assert.strictEqual(info.authority, "none");
  assert.strictEqual(info.zipArtifact, path.basename(DROP_ZIP));

  const zipListing = execFileSync("unzip", ["-Z1", DROP_ZIP], {
    cwd: ROOT,
    encoding: "utf8",
  }).split(/\r?\n/);
  assert(zipListing.includes("index.html"), "Drop zip must expose index.html at archive root");
  assert(!zipListing.includes("last-singularity-cloudflare-drop/index.html"), "Drop zip must not require unwrapping a parent folder");
  assert(!zipListing.some((entry) => entry.includes("__MACOSX/")), "Drop zip must not include macOS resource wrapper entries");
  assert(!zipListing.some((entry) => entry.endsWith(".DS_Store")), "Drop zip must not include Finder metadata");

  console.log("Cloudflare Drop build guard passed.");
}

run();
