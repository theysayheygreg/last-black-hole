"use strict";

const fs = require("fs");
const vm = require("vm");
const v8 = require("v8");

// Test-owned opt-in enables the adapter's bounded, redacted per-live-scheduler
// table without retaining its high-rate transition stream in soak artifacts.
const adapterPath = require.resolve("../../scripts/sim-ws-adapter.cjs");
const adapterModule = require(adapterPath);
const original = adapterModule.createSimWebSocketAdapter;
let installed = false;
adapterModule.createSimWebSocketAdapter = function createSoakObservedAdapter(options) {
  if (installed) throw new Error("soak pressure observer supports exactly one authority");
  installed = true;
  return original({ ...options, onPressureTransition() { return true; } });
};

const gcFile = process.env.LBH_SOAK_GC_FILE;
if (gcFile) {
  v8.setFlagsFromString("--expose_gc");
  const forceGc = vm.runInNewContext("gc");
  process.on("SIGUSR2", () => {
    forceGc();
    forceGc();
    fs.appendFileSync(gcFile, `${JSON.stringify({ type: "forced-gc-complete", pid: process.pid,
      monotonicMs: performance.now(), timestamp: Date.now() })}\n`);
  });
}

const cleanupFile = process.env.LBH_SOAK_DIAGNOSTICS_CLEANUP_FILE;
if (cleanupFile) {
  const diagnosticsPath = require.resolve("../../scripts/soak-runtime-diagnostics.cjs");
  const diagnosticsModule = require(diagnosticsPath);
  const createDiagnostics = diagnosticsModule.createSoakRuntimeDiagnostics;
  diagnosticsModule.createSoakRuntimeDiagnostics = function createObservedDiagnostics(options) {
    const diagnostics = createDiagnostics(options);
    return Object.freeze({ ...diagnostics, stop() {
      const status = diagnostics.stop();
      fs.appendFileSync(cleanupFile, `${JSON.stringify({ type: "diagnostics-cleanup", status })}\n`);
      return status;
    } });
  };
}

const resourceFile = process.env.LBH_SOAK_RESOURCE_FILE;
if (resourceFile) {
  process.on("SIGUSR1", () => {
    const counts = {};
    for (const name of process.getActiveResourcesInfo()) counts[name] = (counts[name] || 0) + 1;
    fs.appendFileSync(resourceFile, `${JSON.stringify({ type: "authority-resource-inventory",
      pid: process.pid, monotonicMs: performance.now(), counts })}\n`);
  });
}
