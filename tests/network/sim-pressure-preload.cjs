"use strict";

const fs = require("fs");

const configPath = process.env.LBH_PRESSURE_PRELOAD_CONFIG;
if (configPath) install(JSON.parse(fs.readFileSync(configPath, "utf8")));

function append(file, value) {
  fs.appendFileSync(file, `${JSON.stringify(value)}\n`);
}

function install(config) {
  const adapterPath = require.resolve("../../scripts/sim-ws-adapter.cjs");
  const adapterModule = require(adapterPath);
  const original = adapterModule.createSimWebSocketAdapter;
  let installed = false;
  let emitted = 0;
  adapterModule.createSimWebSocketAdapter = function createPressureObservedAdapter(options) {
    if (installed) throw new Error("pressure preload supports exactly one authority adapter");
    installed = true;
    const adapter = original({
      ...options,
      onPressureTransition(event) {
        if (++emitted > config.maxPressureEvents) return false;
        append(config.pressureFile, event);
        return true;
      },
    });
    append(config.lifecycleFile, { type: "adapter-created", pid: process.pid, timestamp: Date.now() });
    return Object.freeze({
      ...adapter,
      async shutdown() {
        const before = sanitize(adapter.diagnostics());
        append(config.lifecycleFile, { type: "pre-shutdown", diagnostics: before, timestamp: Date.now() });
        const result = sanitize(await adapter.shutdown());
        append(config.lifecycleFile, { type: "post-shutdown", diagnostics: result, timestamp: Date.now() });
        return result;
      },
    });
  };
}

function sanitize(diagnostics) {
  if (!diagnostics) return null;
  const { currentRunId: _currentRunId, ...safe } = diagnostics;
  return safe;
}

module.exports = { install };
