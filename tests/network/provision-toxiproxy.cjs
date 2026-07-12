#!/usr/bin/env node
const crypto = require("crypto");
const fs = require("fs");
const https = require("https");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "../..");
const FIXTURE_PATH = path.join(ROOT, "tests/fixtures/network-impairment/toxiproxy-tool-v1.json");
const MAX_DOWNLOAD_BYTES = 100 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 30_000;
const ALLOWED_DOWNLOAD_HOSTS = new Set(["github.com", "release-assets.githubusercontent.com"]);

function loadToolFixture() {
  const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8"));
  if (fixture.schemaVersion !== 1 || fixture.tool !== "toxiproxy-server" || fixture.version !== "2.12.0") {
    throw new Error(`Unsupported Toxiproxy tool fixture: ${FIXTURE_PATH}`);
  }
  if (!String(fixture.releaseBaseUrl).startsWith("https://github.com/Shopify/toxiproxy/releases/download/")) {
    throw new Error("Toxiproxy releaseBaseUrl must be the pinned Shopify GitHub HTTPS release path");
  }
  return fixture;
}

function platformKey() {
  return `${process.platform}-${process.arch}`;
}

function selectedAsset(fixture = loadToolFixture()) {
  const key = platformKey();
  const asset = fixture.assets[key];
  if (!asset) {
    throw new Error(`Toxiproxy is not pinned for ${key}; allowed platforms: ${Object.keys(fixture.assets).join(", ")}`);
  }
  return { key, ...asset };
}

function cacheRoot(fixture = loadToolFixture()) {
  const configured = process.env[fixture.cache.environmentVariable];
  return configured ? path.resolve(configured) : path.join(ROOT, fixture.cache.defaultRelativePath);
}

function binaryPath(fixture = loadToolFixture(), asset = selectedAsset(fixture)) {
  const relative = fixture.cache.binaryRelativePath
    .replace("{platform}", process.platform)
    .replace("{arch}", process.arch);
  return path.join(cacheRoot(fixture), relative);
}

function sha256File(file) {
  const size = fs.statSync(file).size;
  if (size > MAX_DOWNLOAD_BYTES) throw new Error(`Toxiproxy file exceeds ${MAX_DOWNLOAD_BYTES} bytes: ${file}`);
  const hash = crypto.createHash("sha256");
  const fd = fs.openSync(file, "r");
  const buffer = Buffer.allocUnsafe(64 * 1024);
  try {
    for (;;) {
      const count = fs.readSync(fd, buffer, 0, buffer.length, null);
      if (count === 0) break;
      hash.update(buffer.subarray(0, count));
    }
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest("hex");
}

function verifyBinaryVersion(file, expectedVersion) {
  const result = spawnSync(file, ["-version"], { encoding: "utf8", timeout: 3_000 });
  if (result.error) throw new Error(`Could not execute pinned Toxiproxy binary: ${result.error.message}`);
  const output = `${result.stdout || ""}${result.stderr || ""}`.trim();
  const expected = `toxiproxy-server version ${expectedVersion}`;
  if (result.status !== 0 || output !== expected) {
    throw new Error(`Toxiproxy version mismatch at ${file}: expected '${expected}', got '${output}' (status ${result.status})`);
  }
  return expectedVersion;
}

function verifyCachedBinary({ requirePresent = true } = {}) {
  const fixture = loadToolFixture();
  const asset = selectedAsset(fixture);
  const file = binaryPath(fixture, asset);
  if (!fs.existsSync(file)) {
    if (!requirePresent) return { present: false, file, fixture, asset };
    throw new Error(
      `Pinned Toxiproxy ${fixture.version} binary is absent at ${file}. `
      + "This registered test intentionally requires a tool preflight and ordinary tests never download it. "
      + "Provision it explicitly with: npm run test:tool:toxiproxy:provision",
    );
  }
  const actualSha256 = sha256File(file);
  if (actualSha256 !== asset.sha256) {
    throw new Error(`Toxiproxy hash mismatch at ${file}: expected ${asset.sha256}, got ${actualSha256}`);
  }
  const mode = fs.statSync(file).mode & 0o777;
  if ((mode & 0o111) === 0) throw new Error(`Pinned Toxiproxy binary is not executable: ${file}`);
  const version = verifyBinaryVersion(file, fixture.version);
  return { present: true, file, fixture, asset, sha256: actualSha256, version, mode };
}

function fetchToFile(url, destination, redirectsLeft = 5, deadlineMs = Date.now() + DOWNLOAD_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return reject(new Error(`Refusing non-HTTPS tool URL: ${url}`));
    if (!ALLOWED_DOWNLOAD_HOSTS.has(parsed.hostname)) return reject(new Error(`Refusing unapproved Toxiproxy download host: ${parsed.hostname}`));
    const remainingMs = deadlineMs - Date.now();
    if (remainingMs <= 0) return reject(new Error("Toxiproxy download exceeded its absolute wall-clock deadline"));
    let deadlineTimer = null;
    const fail = (error) => { clearTimeout(deadlineTimer); reject(error); };
    const request = https.get(parsed, { timeout: Math.min(DOWNLOAD_TIMEOUT_MS, remainingMs), headers: { "user-agent": "lbh-test-tool-provisioner/1" } }, (response) => {
      const location = response.headers.location;
      if ([301, 302, 303, 307, 308].includes(response.statusCode) && location) {
        response.resume();
        if (redirectsLeft === 0) return fail(new Error("Too many redirects downloading Toxiproxy"));
        clearTimeout(deadlineTimer);
        return fetchToFile(new URL(location, parsed).toString(), destination, redirectsLeft - 1, deadlineMs).then(resolve, fail);
      }
      if (response.statusCode !== 200) {
        response.resume();
        return fail(new Error(`Toxiproxy download returned HTTP ${response.statusCode}`));
      }
      const declaredBytes = Number(response.headers["content-length"]);
      if (Number.isFinite(declaredBytes) && declaredBytes > MAX_DOWNLOAD_BYTES) {
        response.resume();
        return fail(new Error(`Toxiproxy asset declares ${declaredBytes} bytes, exceeding ${MAX_DOWNLOAD_BYTES}`));
      }
      const output = fs.createWriteStream(destination, { flags: "wx", mode: 0o600 });
      let received = 0;
      response.on("data", (chunk) => {
        received += chunk.length;
        if (received > MAX_DOWNLOAD_BYTES) response.destroy(new Error(`Toxiproxy asset exceeds ${MAX_DOWNLOAD_BYTES} bytes`));
      });
      response.pipe(output);
      output.on("finish", () => output.close(() => { clearTimeout(deadlineTimer); resolve({ bytes: received }); }));
      output.on("error", fail);
      response.on("error", fail);
    });
    deadlineTimer = setTimeout(() => request.destroy(new Error("Toxiproxy download exceeded its absolute wall-clock deadline")), remainingMs);
    request.on("timeout", () => request.destroy(new Error("Timed out downloading Toxiproxy")));
    request.on("error", fail);
  });
}

async function provision() {
  const fixture = loadToolFixture();
  const asset = selectedAsset(fixture);
  const file = binaryPath(fixture, asset);
  const existing = verifyCachedBinary({ requirePresent: false });
  if (existing.present) return existing;

  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp-${process.pid}-${crypto.randomBytes(6).toString("hex")}`;
  const url = `${fixture.releaseBaseUrl}/${asset.name}`;
  try {
    await fetchToFile(url, temp);
    if (fs.statSync(temp).size > MAX_DOWNLOAD_BYTES) throw new Error(`Downloaded Toxiproxy exceeds ${MAX_DOWNLOAD_BYTES} bytes`);
    const actualSha256 = sha256File(temp);
    if (actualSha256 !== asset.sha256) {
      throw new Error(`Downloaded Toxiproxy hash mismatch: expected ${asset.sha256}, got ${actualSha256}`);
    }
    fs.chmodSync(temp, 0o755);
    verifyBinaryVersion(temp, fixture.version);
    const raced = verifyCachedBinary({ requirePresent: false });
    if (raced.present) return raced;
    fs.renameSync(temp, file);
    return verifyCachedBinary();
  } finally {
    fs.rmSync(temp, { force: true });
  }
}

async function main() {
  if (!process.argv.includes("--provision")) {
    const result = verifyCachedBinary();
    console.log(JSON.stringify({ tool: result.fixture.tool, version: result.fixture.version, platform: result.asset.key, path: result.file, sha256: result.sha256 }, null, 2));
    return;
  }
  const result = await provision();
  console.log(JSON.stringify({ tool: result.fixture.tool, version: result.fixture.version, platform: result.asset.key, path: result.file, sha256: result.sha256 }, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}

module.exports = { FIXTURE_PATH, loadToolFixture, selectedAsset, cacheRoot, binaryPath, sha256File, verifyBinaryVersion, verifyCachedBinary, provision };
