"use strict";

function readBoolean(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

function resolveBenchGate({ args = {}, env = process.env } = {}) {
  const enabled = readBoolean(args.bench) || readBoolean(env.LBH_BENCH_ENABLED);
  return Object.freeze({
    enabled,
    source: readBoolean(args.bench)
      ? "cli"
      : (readBoolean(env.LBH_BENCH_ENABLED) ? "environment" : "disabled"),
  });
}

module.exports = {
  readBoolean,
  resolveBenchGate,
};
