"use strict";

const TARGETS = Object.freeze({ humans: 24, expensiveAi: 48, dynamicBodies: 400,
  evidenceFauna: 328, adapterConnections: 24, rejectedConnection: 25 });
const FLAG = "LBH_S24_LIVE_EVIDENCE";
const HARNESS_FLAG = "LBH_S24_EVIDENCE_HARNESS";

function strictFlag(env, name) {
  const value = env[name];
  if (value === undefined || value === "0") return false;
  if (value === "1") return true;
  throw new Error(`${name} must be exactly 0 or 1`);
}

function createS24LiveEvidenceFixture(env = process.env) {
  const enabled = strictFlag(env, FLAG);
  const harness = strictFlag(env, HARNESS_FLAG);
  if (enabled && (env.NODE_ENV !== "test" || !harness)) {
    throw new Error(`${FLAG} requires NODE_ENV=test and ${HARNESS_FLAG}=1`);
  }
  if (harness && (!enabled || env.NODE_ENV !== "test")) {
    throw new Error(`${HARNESS_FLAG} is valid only with NODE_ENV=test and ${FLAG}=1`);
  }
  let counters = emptyCounters();

  function emptyCounters() {
    return { resetAt: Date.now(), simTicks: 0, worldSteps: 0, worldEntityUpdates: 0,
      fieldSteps: 0, scavengerSteps: 0, expensiveAiEntityUpdates: 0,
      faunaSteps: 0, evidenceFaunaEntityUpdates: 0, eventsPublished: 0,
      projectionSchedules: 0, eventTypes: {} };
  }

  function requireEnabled() {
    if (!enabled) throw new Error("S24 evidence fixture is disabled");
  }

  function prepareSession(session, requested = {}) {
    requireEnabled();
    const errors = [];
    if (String(requested.mapId || "") !== "deep-field") errors.push("mapId must be deep-field");
    if (Number(requested.maxPlayers) !== TARGETS.humans) errors.push("maxPlayers must be 24");
    if (errors.length) throw new Error(`S24 evidence session rejected: ${errors.join("; ")}`);
    session.baseSpawnScavengersBase = TARGETS.expensiveAi;
    session.spawnScavengersBase = TARGETS.expensiveAi;
    session.baseSpawnScavengersPerPlayer = 0;
    session.spawnScavengersPerPlayer = 0;
    session.baseMaxScavengers = TARGETS.expensiveAi;
    session.maxScavengers = TARGETS.expensiveAi;
    session.baseMaxRelevantScavengersPerPlayer = TARGETS.expensiveAi;
    session.maxRelevantScavengersPerPlayer = TARGETS.expensiveAi;
    return session;
  }

  function seedRuntime(runtime) {
    requireEnabled();
    if (runtime.mapState.scavengers.length !== TARGETS.expensiveAi) {
      throw new Error(`S24 evidence expected ${TARGETS.expensiveAi} scavengers, found ${runtime.mapState.scavengers.length}`);
    }
    const worldScale = runtime.session.worldScale;
    runtime.mapState.fauna = Array.from({ length: TARGETS.evidenceFauna }, (_, index) => {
      const columns = 20;
      const row = Math.floor(index / columns);
      const column = index % columns;
      const angle = ((index * 2654435761) >>> 0) / 0xffffffff * Math.PI * 2;
      return { id: `s24-evidence-fauna-${index + 1}`, type: "s24-load",
        wx: ((column + 0.5) / columns) * worldScale,
        wy: ((row + 0.5) / Math.ceil(TARGETS.evidenceFauna / columns)) * worldScale,
        vx: Math.cos(angle) * 0.002, vy: Math.sin(angle) * 0.002,
        age: 0, lifespan: 1e9, alive: true, phase: angle, s24EvidenceBody: true };
    });
    for (const scavenger of runtime.mapState.scavengers) scavenger.s24EvidenceAi = true;
    counters = emptyCounters();
  }

  function observe(name, count = 1, detail = null) {
    if (!enabled) return;
    if (!Object.hasOwn(counters, name)) throw new Error(`Unknown S24 evidence counter ${name}`);
    counters[name] += Math.max(0, Number(count) || 0);
    if (name === "eventsPublished" && detail) {
      const type = String(detail);
      counters.eventTypes[type] = (counters.eventTypes[type] || 0) + 1;
    }
  }

  function reset() {
    if (enabled) counters = emptyCounters();
  }

  function snapshot(runtime) {
    if (!enabled) return null;
    const humans = [...runtime.players.values()].filter((player) => !player.isAI).length;
    const ambientAiPlayers = [...runtime.players.values()].filter((player) => player.isAI).length;
    const expensiveAi = runtime.mapState.scavengers
      .filter((entry) => entry.s24EvidenceAi && entry.alive !== false && entry.state !== "dying").length;
    const evidenceFauna = runtime.mapState.fauna
      .filter((entry) => entry.s24EvidenceBody && entry.alive !== false).length;
    const dynamicBodies = humans + expensiveAi + evidenceFauna;
    return { enabled: true, schema: "lbh-s24-live-evidence-fixture-v1", targets: TARGETS,
      counts: { humans, expensiveAi, evidenceFauna, dynamicBodies, ambientAiPlayers },
      exactVectorPresent: humans === TARGETS.humans && expensiveAi === TARGETS.expensiveAi
        && evidenceFauna === TARGETS.evidenceFauna && dynamicBodies === TARGETS.dynamicBodies
        && ambientAiPlayers === 0,
      counters: { ...counters, eventTypes: { ...counters.eventTypes } },
      authority: { logicalGameplayWriters: 1, processes: 1, workers: 0,
        note: "One writer for this match; concurrent matches use independent authorities." },
      boundary: "Test-only server startup flags; unavailable through client negotiation, session body, or gameplay input.",
    };
  }

  return Object.freeze({ enabled, targets: TARGETS, adapterMaxConnections: enabled ? 24 : 16,
    adapterMaxPendingHello: enabled ? 24 : 8, profilerMaxRecipients: enabled ? 24 : 16,
    suppressAmbientAiPlayers: enabled, prepareSession, seedRuntime, observe, reset, snapshot });
}

module.exports = { FLAG, HARNESS_FLAG, TARGETS, createS24LiveEvidenceFixture };
