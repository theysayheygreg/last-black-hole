#!/usr/bin/env node

const path = require("path");
const { createServiceSupervisor, parseArgs } = require("./service-supervisor.cjs");

const ROOT = path.resolve(__dirname, "..");
const TMP = path.join(ROOT, "tmp");
const cliArgs = parseArgs(process.argv.slice(3));
const HOST = cliArgs.host || process.env.LBH_CONTROL_PLANE_HOST || "127.0.0.1";
const PORT = Number(cliArgs.port || process.env.LBH_CONTROL_PLANE_PORT || 8791);

const supervisor = createServiceSupervisor({
  serviceName: "LBH control plane",
  host: HOST,
  port: PORT,
  root: ROOT,
  tmpDir: TMP,
  pidFile: path.join(TMP, `control-plane-${PORT}.pid`),
  metaFile: path.join(TMP, `control-plane-${PORT}.json`),
  logFile: path.join(TMP, `control-plane-${PORT}.log`),
  serverScript: path.join(ROOT, "scripts", "control-plane-runtime.cjs"),
  runtimeArgs: [
    "--host", HOST,
    "--port", String(PORT),
    "--pid-file", path.join(TMP, `control-plane-${PORT}.pid`),
    "--meta-file", path.join(TMP, `control-plane-${PORT}.json`),
    "--label", "lbh-control-plane",
  ],
});

supervisor.run(process.argv[2] || "start").catch((error) => {
  console.error(error.message);
  process.exit(1);
});
