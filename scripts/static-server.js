#!/usr/bin/env node

const http = require("http");
const fs = require("fs");
const path = require("path");
const { createRuntimeLogger } = require("./runtime-telemetry.js");

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      args[key] = next;
      i++;
    } else {
      args[key] = true;
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const ROOT = path.resolve(args.root || process.cwd());
const HOST = args.host || "127.0.0.1";
const PORT = Number(args.port || 8080);
const PID_FILE = args["pid-file"] ? path.resolve(args["pid-file"]) : null;
const META_FILE = args["meta-file"] ? path.resolve(args["meta-file"]) : null;
const LOG_LABEL = args.label || "lbh-server";
const telemetry = createRuntimeLogger("dev-server", { label: LOG_LABEL, host: HOST, port: PORT });

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".wasm": "application/wasm",
  ".map": "application/json; charset=utf-8",
};

function ensureParent(filepath) {
  if (!filepath) return;
  fs.mkdirSync(path.dirname(filepath), { recursive: true });
}

function cleanupFiles() {
  for (const file of [PID_FILE, META_FILE]) {
    if (!file) continue;
    try {
      fs.rmSync(file, { force: true });
    } catch {}
  }
}

function writeFiles() {
  const meta = {
    pid: process.pid,
    host: HOST,
    port: PORT,
    root: ROOT,
    label: LOG_LABEL,
    startedAt: new Date().toISOString(),
    url: `http://${HOST}:${PORT}/`,
  };

  if (PID_FILE) {
    ensureParent(PID_FILE);
    fs.writeFileSync(PID_FILE, `${process.pid}\n`, "utf8");
  }

  if (META_FILE) {
    ensureParent(META_FILE);
    fs.writeFileSync(META_FILE, `${JSON.stringify(meta, null, 2)}\n`, "utf8");
  }
}

function safePathFromUrl(urlString) {
  const pathname = decodeURIComponent(new URL(urlString, `http://${HOST}:${PORT}`).pathname);
  const relative = pathname === "/" ? "index-a.html" : pathname.replace(/^\/+/, "");
  const resolved = path.resolve(ROOT, relative);
  if (!resolved.startsWith(ROOT)) return null;
  return resolved;
}

function send404(res) {
  res.statusCode = 404;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.end("Not found");
}

function send500(res, err) {
  res.statusCode = 500;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.end(`Server error\n${err.message}`);
}

const server = http.createServer((req, res) => {
  try {
    const resolved = safePathFromUrl(req.url || "/");
    if (!resolved) {
      send404(res);
      return;
    }

    let filepath = resolved;
    if (fs.existsSync(filepath) && fs.statSync(filepath).isDirectory()) {
      const candidate = path.join(filepath, "index-a.html");
      if (fs.existsSync(candidate)) {
        filepath = candidate;
      } else {
        send404(res);
        return;
      }
    }

    if (!fs.existsSync(filepath) || !fs.statSync(filepath).isFile()) {
      send404(res);
      return;
    }

    const ext = path.extname(filepath).toLowerCase();
    res.statusCode = 200;
    res.setHeader("Content-Type", MIME[ext] || "application/octet-stream");
    fs.createReadStream(filepath).pipe(res);
  } catch (err) {
    send500(res, err);
  }
});

server.on("error", (err) => {
  telemetry.error("runtime.error", { message: err.message });
  cleanupFiles();
  process.exit(1);
});

function shutdown() {
  telemetry.info("runtime.stopping", { reason: "signal" });
  server.close(() => {
    cleanupFiles();
    process.exit(0);
  });
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
process.on("exit", cleanupFiles);

server.listen(PORT, HOST, () => {
  writeFiles();
  telemetry.info("runtime.started", { root: ROOT, url: `http://${HOST}:${PORT}/` });
  console.log(`[${LOG_LABEL}] serving ${ROOT} on http://${HOST}:${PORT}/`);
});
