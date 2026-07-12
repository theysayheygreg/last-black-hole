"use strict";

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
