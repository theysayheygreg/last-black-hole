"use strict";

const ENV_NAME = "LBH_SIM_TEST_DISABLE_AUTHORED_COLLAPSE";
const MODE = "synthetic-infrastructure-longevity";

function readStrictFlag(env, name) {
  const value = env[name];
  if (value === undefined) return false;
  if (value === "0") return false;
  if (value === "1") return true;
  throw new Error(`${name} must be exactly 0 or 1`);
}

function createAuthoredCollapseTestLifecycle({ env = process.env, maxSimTime }) {
  const enabled = readStrictFlag(env, ENV_NAME);
  if (enabled && !(env.NODE_ENV === "test" && env.LBH_SOAK_DIAGNOSTICS === "1")) {
    throw new Error(`${ENV_NAME}=1 requires NODE_ENV=test and LBH_SOAK_DIAGNOSTICS=1`);
  }

  let first = null;
  return {
    enabled,
    reset() {
      first = null;
    },
    suppress(reason, simTime) {
      if (!enabled) return false;
      if (!first) {
        first = {
          reason: String(reason),
          simTime: Number.isFinite(Number(simTime)) ? Number(simTime) : null,
        };
      }
      return true;
    },
    health() {
      if (!enabled) return null;
      return {
        mode: MODE,
        count: first ? 1 : 0,
        firstReason: first?.reason || null,
        firstSimTime: first?.simTime ?? null,
        maxSimTime,
      };
    },
  };
}

module.exports = {
  ENV_NAME,
  MODE,
  createAuthoredCollapseTestLifecycle,
  readStrictFlag,
};
