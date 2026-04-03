#!/usr/bin/env node

// stop.js — Stop all game servers.
// Usage: node scripts/stop.js
//        npm run stop

const { execSync } = require("child_process");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

function run(cmd) {
  try {
    return execSync(cmd, { cwd: ROOT, stdio: "pipe" }).toString().trim();
  } catch {
    return "";
  }
}

console.log("Stopping Last Singularity...\n");

for (const [script, label] of [
  ["scripts/dev-server.js", "Dev server"],
  ["scripts/sim-server.js", "Sim server"],
  ["scripts/control-plane-server.js", "Control plane"],
]) {
  const out = run(`node ${script} stop`);
  if (out.includes("stopped") || out.includes("Stopped")) {
    console.log(`  ${label} stopped`);
  } else if (out.includes("not running")) {
    console.log(`  ${label} not running`);
  } else {
    console.log(`  ${label}: ${out}`);
  }
}

console.log("\nDone.");
