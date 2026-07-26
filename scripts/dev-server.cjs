#!/usr/bin/env node

const path = require("path");
const { createServiceSupervisor } = require("./service-supervisor.cjs");

const ROOT = path.resolve(__dirname, "..");
const TMP = path.join(ROOT, "tmp");
const HOST = "127.0.0.1";
const PORT = 8080;
const PID_FILE = path.join(TMP, "dev-server.pid");
const META_FILE = path.join(TMP, "dev-server.json");

const supervisor = createServiceSupervisor({
  serviceName: "LBH dev server",
  host: HOST,
  port: PORT,
  root: ROOT,
  tmpDir: TMP,
  pidFile: PID_FILE,
  metaFile: META_FILE,
  logFile: path.join(TMP, "dev-server.log"),
  serverScript: path.join(ROOT, "scripts", "static-server.cjs"),
  alreadyPreposition: "on",
  runtimeArgs: [
    "--host", HOST,
    "--port", String(PORT),
    "--root", ROOT,
    "--pid-file", PID_FILE,
    "--meta-file", META_FILE,
    "--label", "lbh-dev",
  ],
  occupiedAdvice() {
    console.error("Free that process or pick a different canonical dev port before starting LBH.");
  },
});

supervisor.run(process.argv[2] || "start").catch((error) => {
  console.error(error.message);
  process.exit(1);
});
