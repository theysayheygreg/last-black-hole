"use strict";

const {
  getConditionDefinition,
  validateConditionValue,
} = require("../../src/conditions/index.js");
const { isExfilPortal } = require("./public-snapshot.cjs");

function clamp(value, minimum, maximum) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return minimum;
  return Math.max(minimum, Math.min(maximum, numeric));
}

function resolveContext(context = {}, getRuntime) {
  const runtime = context.runtime || getRuntime?.() || null;
  const player = context.player || (context.clientId && runtime?.players?.get(context.clientId)) || null;
  return { runtime, player, profile: context.profile || null };
}

/**
 * The only stored run facts created by the sim. Callers hand this object to
 * the central condition store once, at run creation; it is not another
 * mutable session bag.
 */
function createRunConditionInitialValues({ mapId, seed, cosmicSignatureId }) {
  const values = {
    "run.map.id": String(mapId),
    "run.seed": Number(seed),
    "run.modifier.cosmicSignatureId": String(cosmicSignatureId),
    "run.discovery.exfilToneHeard": false,
  };
  for (const [name, value] of Object.entries(values)) {
    validateConditionValue(getConditionDefinition(name), value);
  }
  return Object.freeze(values);
}

function extractionState({ runtime, player }) {
  if (!runtime?.session || runtime.session.status !== "running") return "unavailable";
  if (player?.status === "escaped") return "confirmed";
  if (player?.status && player.status !== "alive") return "expired";
  if (player?.portalInteraction?.ready) return "confirmable";
  if (player?.portalInteraction) return "approaching";
  const hasExfil = (runtime.mapState?.portals || []).some(isExfilPortal);
  return hasExfil ? "available" : "unavailable";
}

function createSimDerivedConditionProviders({ getRuntime } = {}) {
  if (typeof getRuntime !== "function") {
    throw new TypeError("createSimDerivedConditionProviders requires getRuntime");
  }
  return Object.freeze({
    "pilot.vault.itemCount": (context) => {
      const { profile } = resolveContext(context, getRuntime);
      return Array.isArray(profile?.vault) ? profile.vault.filter(Boolean).length : 0;
    },
    "run.cargo.count": (context) => {
      const { player } = resolveContext(context, getRuntime);
      return Array.isArray(player?.cargo) ? player.cargo.filter(Boolean).length : 0;
    },
    "run.hull.id": (context) => resolveContext(context, getRuntime).player?.hullType || "drifter",
    "run.hull.integrity": (context) => {
      const { player } = resolveContext(context, getRuntime);
      return 1 - clamp(player?.hullDamage, 0, 1);
    },
    "run.heat.ratio": (context) => clamp(resolveContext(context, getRuntime).player?.heatRatio, 0, 1),
    "run.extraction.state": (context) => extractionState(resolveContext(context, getRuntime)),
    "run.map.cycleProgress": (context) => {
      const { runtime } = resolveContext(context, getRuntime);
      return clamp(
        (Number(runtime?.simTime) || 0) / Math.max(1, Number(runtime?.session?.runDurationSeconds) || 1),
        0,
        1,
      );
    },
    "run.contacts.count": (context) => {
      const { player } = resolveContext(context, getRuntime);
      return Math.max(0, Math.floor(Number(player?.noise?.listeners?.length) || 0));
    },
    "run.noise.radiusMeters": (context) => {
      const { player } = resolveContext(context, getRuntime);
      return Math.max(0, Number(player?.noise?.audibleRadiusMeters) || 0);
    },
    "run.grapple.active": (context) => Boolean(resolveContext(context, getRuntime).player?.slingshot?.engaged),
  });
}

function registerSimDerivedConditions(store, options) {
  if (!store || typeof store.registerDerived !== "function") {
    throw new TypeError("registerSimDerivedConditions requires a ConditionStore");
  }
  for (const [name, provider] of Object.entries(createSimDerivedConditionProviders(options))) {
    store.registerDerived(name, provider);
  }
  return store;
}

module.exports = {
  createRunConditionInitialValues,
  createSimDerivedConditionProviders,
  registerSimDerivedConditions,
  extractionState,
};
