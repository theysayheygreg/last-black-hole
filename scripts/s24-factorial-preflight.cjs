#!/usr/bin/env node
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const v8 = require("v8");
const crypto = require("crypto");
const zlib = require("zlib");
const { spawnSync } = require("child_process");
const { performance, monitorEventLoopDelay, PerformanceObserver } = require("perf_hooks");
const { createBallparkMirror } = require("./sim/ballpark-mirror.cjs");
const { BODY_MASKS } = require("./sim/body-masks.cjs");

const SCHEMA = "lbh-s24-factorial-preflight-v1";
const WORLD_SCALE = 10;
const WRITER_HZ = 30;
const REPLICATION_HZ = 10;
const BROTLI_OPTIONS = { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 1 } };
const FACTORS = Object.freeze({
  players: [6, 24],
  bodies: [100, 400],
  dense: [0, 1],
  aiDue: [12, 48],
  fieldTilesDue: [64, 256],
  worldJobsDue: [25, 100],
  events: [8, 32],
});
const PROJECTION_FACTORS = Object.freeze({
  recipients: [6, 24],
  bodies: [100, 400],
  changedBodies: [25, 100],
  keyframe: [0, 1],
  events: [8, 32],
});
const H_VECTORS = Object.freeze({
  H24: { humans: 24, bodies: 400, ai: 48, fieldTiles: 256, worldJobs: 100, events: 32,
    replicationRecipients: 24, changedBodies: 100, keyframeBodies: 400, density: "distributed" },
  H48: { humans: 48, bodies: 900, ai: 96, fieldTiles: 576, worldJobs: 225, events: 64,
    replicationRecipients: 48, changedBodies: 225, keyframeBodies: 900, density: "distributed" },
  H96: { humans: 96, bodies: 1800, ai: 192, fieldTiles: 1152, worldJobs: 450, events: 128,
    replicationRecipients: 96, changedBodies: 450, keyframeBodies: 1800, density: "distributed" },
  X96: { humans: 96, bodies: 3000, ai: 384, fieldTiles: 2048, worldJobs: 800, events: 256,
    replicationRecipients: 96, changedBodies: 1200, keyframeBodies: 3000, density: "stacked" },
});

function percentile(values, quantile) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(quantile * sorted.length) - 1));
  return sorted[index];
}

function stats(values) {
  const finite = values.filter(Number.isFinite);
  if (!finite.length) return { count: 0, mean: null, p50: null, p95: null, p99: null, max: null };
  const mean = finite.reduce((sum, value) => sum + value, 0) / finite.length;
  return {
    count: finite.length,
    mean,
    p50: percentile(finite, 0.50),
    p95: percentile(finite, 0.95),
    p99: percentile(finite, 0.99),
    max: Math.max(...finite),
  };
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function elapsed(fn) {
  const started = performance.now();
  const value = fn();
  return { value, ms: performance.now() - started };
}

function elapsedRepeated(fn, repetitions) {
  const started = performance.now();
  let value;
  for (let index = 0; index < repetitions; index += 1) value = fn();
  return { value, ms: (performance.now() - started) / repetitions };
}

function cpuWork(count, seed, width) {
  let value = (seed + 1) >>> 0;
  for (let index = 0; index < count * width; index += 1) {
    value = Math.imul(value ^ (index + 0x9e3779b9), 1664525) + 1013904223;
    value ^= value >>> 13;
  }
  return value >>> 0;
}

function makeBodies(count, dense, tick = 0) {
  const bodies = new Array(count);
  const side = Math.ceil(Math.sqrt(count));
  for (let index = 0; index < count; index += 1) {
    const column = index % side;
    const row = Math.floor(index / side);
    const wx = dense
      ? 5 + ((column % 8) - 3.5) * 0.012 + (tick % 3) * 0.0001
      : ((column + 0.5) / side) * WORLD_SCALE + (tick % 3) * 0.0001;
    const wy = dense
      ? 5 + ((row % 8) - 3.5) * 0.012
      : ((row + 0.5) / side) * WORLD_SCALE;
    bodies[index] = {
      id: `s24-body-${index}`,
      category: index % 7 === 0 ? "player" : index % 5 === 0 ? "ai" : "world",
      wx, wy, vx: 0, vy: 0, radius: 0.018,
      collisionMask: [BODY_MASKS.PLAYER, BODY_MASKS.AI, BODY_MASKS.HAZARD],
      interactionMask: [BODY_MASKS.PICKUP, BODY_MASKS.FORCE, BODY_MASKS.SIGNAL],
      replicationLane: index % 4 === 0 ? "near" : "global",
      lifecycle: { state: "alive" },
      data: { sourceId: `fixture-${index}` },
    };
  }
  return bodies;
}

function makePlayerQueryPositions(players, dense) {
  const side = Math.ceil(Math.sqrt(players));
  return Array.from({ length: players }, (_, index) => ({
    wx: dense ? 5 : (((index % side) + 0.5) / side) * WORLD_SCALE,
    wy: dense ? 5 : ((Math.floor(index / side) + 0.5) / side) * WORLD_SCALE,
  }));
}

function queryPlayers(mirror, players, dense) {
  const before = mirror.index.stats();
  let contacts = 0;
  const positions = makePlayerQueryPositions(players, dense);
  for (let index = 0; index < players; index += 1) {
    const { wx, wy } = positions[index];
    contacts += mirror.queryCircle({ wx, wy, radius: dense ? 0.16 : 0.34,
      mask: BODY_MASKS.ALL, lifecycleStates: ["alive"] }).length;
  }
  const after = mirror.index.stats();
  return { candidates: after.candidateCount - before.candidateCount, contacts };
}

function buildPublicTuples(bodies, tick, count) {
  const tuples = new Array(count);
  for (let index = 0; index < count; index += 1) {
    const body = bodies[index % bodies.length];
    const packedFlags = cpuWork(1, tick + index, 256) & 255;
    tuples[index] = [index, Math.round(body.wx * 4096), Math.round(body.wy * 4096),
      (tick + index) & 255, packedFlags];
  }
  return tuples;
}

function buildPublicFragment({ bodies, tick, publicCount, keyframe, eventCount }) {
  return {
    schema: "lbh-s24-shared-public-fragment-v1",
    tick,
    keyframe,
    entities: buildPublicTuples(bodies, tick, publicCount),
    events: Array.from({ length: eventCount }, (_, index) =>
      [tick, index, (tick * 17 + index) & 65535]),
  };
}

function replicationBeat({ bodies, recipients, changedBodies, tick, keyframe = false, eventCount = 8 }) {
  const publicCount = keyframe ? bodies.length : Math.min(changedBodies, bodies.length);
  const projection = elapsedRepeated(() => buildPublicFragment({ bodies, tick, publicCount,
    keyframe, eventCount }), 64);
  const serialization = elapsedRepeated(() => Buffer.from(JSON.stringify(projection.value)), 8);
  const compression = elapsedRepeated(() => zlib.brotliCompressSync(serialization.value, BROTLI_OPTIONS), 32);
  let ownerBytes = 0;
  let ownerRawBytes = 0;
  const owner = elapsedRepeated(() => {
    ownerBytes = 0;
    ownerRawBytes = 0;
    for (let recipient = 0; recipient < recipients; recipient += 1) {
      const raw = Buffer.from(JSON.stringify({ schema: "lbh-s24-owner-overlay-v1", tick,
        ordinal: recipient, inputAck: tick * 3 + recipient, cargo: [recipient % 5, tick % 7],
        privateState: [1000 - tick, recipient, (tick + recipient) & 255] }));
      ownerRawBytes += raw.length;
      ownerBytes += zlib.brotliCompressSync(raw, BROTLI_OPTIONS).length;
    }
  }, 12);
  const socket = elapsedRepeated(() => {
    let checksum = 0;
    for (let recipient = 0; recipient < recipients; recipient += 1) {
      checksum ^= compression.value.length + recipient + ownerBytes;
    }
    return checksum ^ cpuWork(recipients, checksum, 64);
  }, 1024);
  const perClientPublicBytes = compression.value.length;
  return {
    stages: { projection: projection.ms, serialization: serialization.ms,
      compression: compression.ms, ownerOverlay: owner.ms, socketAccounting: socket.ms },
    rawPublicBytes: serialization.value.length,
    compressedPublicBytes: compression.value.length,
    rawOwnerBytes: ownerRawBytes,
    compressedOwnerBytes: ownerBytes,
    perClientBytes: perClientPublicBytes + ownerBytes / recipients,
    matchBytes: perClientPublicBytes * recipients + ownerBytes,
    messages: recipients * 2,
    queueBytes: perClientPublicBytes * recipients + ownerBytes,
  };
}

function writerBeat(vector, context, tick) {
  const stages = {};
  let sink = 0;
  let result = elapsed(() => cpuWork(vector.players, tick, 160));
  stages.input = result.ms; sink ^= result.value;
  result = elapsed(() => cpuWork(vector.players + vector.bodies, sink, 48));
  stages.movement = result.ms; sink ^= result.value;
  const bodies = makeBodies(vector.bodies, vector.dense === 1, tick);
  result = elapsed(() => context.mirror.synchronizeBodies(bodies, { tick }));
  stages.ballparkSync = result.ms;
  result = elapsed(() => queryPlayers(context.mirror, vector.players, vector.dense === 1));
  stages.broadphase = result.ms;
  const { candidates, contacts } = result.value;
  result = elapsed(() => cpuWork(contacts, sink, 24));
  stages.contacts = result.ms; sink ^= result.value;
  result = elapsed(() => cpuWork(vector.aiDue, sink, 256));
  stages.ai = result.ms; sink ^= result.value;
  result = elapsed(() => cpuWork(vector.fieldTilesDue, sink, 96));
  stages.field = result.ms; sink ^= result.value;
  result = elapsed(() => cpuWork(vector.worldJobsDue, sink, 160));
  stages.world = result.ms; sink ^= result.value;
  result = elapsed(() => cpuWork(vector.events, sink, 192));
  stages.events = result.ms; sink ^= result.value;
  const totalMs = Object.values(stages).reduce((sum, value) => sum + value, 0);
  return { stages, totalMs, candidates, contacts, bodies, sink };
}

function combinations(factors = FACTORS) {
  const entries = Object.entries(factors);
  const result = [];
  const count = 1 << entries.length;
  for (let ordinal = 0; ordinal < count; ordinal += 1) {
    const gray = ordinal ^ (ordinal >>> 1);
    const row = {};
    entries.forEach(([name, levels], index) => { row[name] = levels[(gray >>> index) & 1]; });
    result.push(row);
  }
  return result;
}

function solve(matrix, vector) {
  const n = vector.length;
  const augmented = matrix.map((row, index) => [...row, vector[index]]);
  const inverse = matrix.map((row, index) => row.map((_, column) => index === column ? 1 : 0));
  for (let column = 0; column < n; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < n; row += 1) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    }
    if (Math.abs(augmented[pivot][column]) < 1e-12) throw new Error("non-identifiable design matrix");
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
    [inverse[column], inverse[pivot]] = [inverse[pivot], inverse[column]];
    const scale = augmented[column][column];
    for (let j = 0; j <= n; j += 1) augmented[column][j] /= scale;
    for (let j = 0; j < n; j += 1) inverse[column][j] /= scale;
    for (let row = 0; row < n; row += 1) {
      if (row === column) continue;
      const factor = augmented[row][column];
      for (let j = 0; j <= n; j += 1) augmented[row][j] -= factor * augmented[column][j];
      for (let j = 0; j < n; j += 1) inverse[row][j] -= factor * inverse[column][j];
    }
  }
  return { solution: augmented.map((row) => row[n]), inverse };
}

function jacobiEigenvalues(input) {
  const matrix = input.map((row) => [...row]);
  const n = matrix.length;
  if (n === 0) return [];
  for (let iteration = 0; iteration < 64 * n * n; iteration += 1) {
    let p = 0; let q = 0; let largest = 0;
    for (let i = 0; i < n; i += 1) {
      for (let j = i + 1; j < n; j += 1) {
        if (Math.abs(matrix[i][j]) > largest) { largest = Math.abs(matrix[i][j]); p = i; q = j; }
      }
    }
    if (largest < 1e-12) break;
    const angle = 0.5 * Math.atan2(2 * matrix[p][q], matrix[q][q] - matrix[p][p]);
    const cosine = Math.cos(angle); const sine = Math.sin(angle);
    for (let k = 0; k < n; k += 1) {
      if (k === p || k === q) continue;
      const mkp = matrix[k][p]; const mkq = matrix[k][q];
      matrix[k][p] = matrix[p][k] = cosine * mkp - sine * mkq;
      matrix[k][q] = matrix[q][k] = sine * mkp + cosine * mkq;
    }
    const app = matrix[p][p]; const aqq = matrix[q][q]; const apq = matrix[p][q];
    matrix[p][p] = cosine * cosine * app - 2 * sine * cosine * apq + sine * sine * aqq;
    matrix[q][q] = sine * sine * app + 2 * sine * cosine * apq + cosine * cosine * aqq;
    matrix[p][q] = matrix[q][p] = 0;
  }
  return matrix.map((row, index) => row[index]);
}

function designDiagnostics(rows, predictors) {
  if (!predictors.length) return { rank: 1, columns: 1, standardizedConditionNumber: 1 };
  const means = predictors.map((name) => rows.reduce((sum, row) => sum + Number(row[name]), 0) / rows.length);
  const scales = predictors.map((name, index) => Math.sqrt(rows.reduce((sum, row) =>
    sum + (Number(row[name]) - means[index]) ** 2, 0) / rows.length));
  if (scales.some((scale) => scale <= 1e-12)) return { rank: 1, columns: predictors.length + 1,
    standardizedConditionNumber: Infinity };
  const correlation = predictors.map((_, i) => predictors.map((__, j) => rows.reduce((sum, row) =>
    sum + ((Number(row[predictors[i]]) - means[i]) / scales[i])
      * ((Number(row[predictors[j]]) - means[j]) / scales[j]), 0) / rows.length));
  const eigenvalues = jacobiEigenvalues(correlation).map(Math.abs).sort((a, b) => b - a);
  const tolerance = Math.max(1e-10, eigenvalues[0] * 1e-9);
  const predictorRank = eigenvalues.filter((value) => value > tolerance).length;
  return { rank: predictorRank + 1, columns: predictors.length + 1,
    standardizedConditionNumber: eigenvalues[eigenvalues.length - 1] > tolerance
      ? eigenvalues[0] / eigenvalues[eigenvalues.length - 1] : Infinity,
    standardizedPredictorEigenvalues: eigenvalues };
}

function ols(rows, response, predictors) {
  const x = rows.map((row) => [1, ...predictors.map((name) => Number(row[name]))]);
  const y = rows.map((row) => Number(row[response]));
  const n = x.length;
  const p = predictors.length + 1;
  const xtx = Array.from({ length: p }, () => Array(p).fill(0));
  const xty = Array(p).fill(0);
  for (let row = 0; row < n; row += 1) {
    for (let i = 0; i < p; i += 1) {
      xty[i] += x[row][i] * y[row];
      for (let j = 0; j < p; j += 1) xtx[i][j] += x[row][i] * x[row][j];
    }
  }
  const solved = solve(xtx, xty);
  const predicted = x.map((row) => row.reduce((sum, value, index) => sum + value * solved.solution[index], 0));
  const mean = y.reduce((sum, value) => sum + value, 0) / n;
  const sse = y.reduce((sum, value, index) => sum + (value - predicted[index]) ** 2, 0);
  const sst = y.reduce((sum, value) => sum + (value - mean) ** 2, 0);
  const sigma2 = sse / Math.max(1, n - p);
  const covariance = solved.inverse.map((row) => row.map((value) => value * sigma2));
  const coefficients = { intercept: solved.solution[0] };
  const standardErrors = { intercept: Math.sqrt(Math.max(0, sigma2 * solved.inverse[0][0])) };
  predictors.forEach((name, index) => {
    coefficients[name] = solved.solution[index + 1];
    standardErrors[name] = Math.sqrt(Math.max(0, sigma2 * solved.inverse[index + 1][index + 1]));
  });
  return { response, predictors, coefficients, standardErrors,
    covariance: { labels: ["intercept", ...predictors], matrix: covariance },
    design: designDiagnostics(rows, predictors),
    rSquared: sst > 0 ? 1 - sse / sst : 1, observations: n, residualSigma: Math.sqrt(sigma2) };
}

function predict(fit, vector) {
  let base = fit.coefficients.intercept;
  const row = [1];
  for (const name of fit.predictors) {
    base += fit.coefficients[name] * vector[name];
    row.push(vector[name]);
  }
  let uncertainty = 0;
  for (let i = 0; i < row.length; i += 1) {
    for (let j = 0; j < row.length; j += 1) uncertainty += row[i] * fit.covariance.matrix[i][j] * row[j];
  }
  const interval = 1.96 * Math.sqrt(uncertainty + fit.residualSigma ** 2);
  return { best: Math.max(0, base - interval), base: Math.max(0, base), worst: Math.max(0, base + interval) };
}

function stageRows(samples, name) {
  return samples.map((sample) => ({ ...sample.vector, candidates: sample.candidates,
    contacts: sample.contacts, ms: sample.stages[name] }));
}

function fitWriter(samples) {
  const definitions = {
    input: ["players"], movement: ["players", "bodies"], ballparkSync: ["bodies"],
    broadphase: ["players", "candidates"], contacts: ["contacts"], ai: ["aiDue"],
    field: ["fieldTilesDue"], world: ["worldJobsDue"], events: ["events"],
  };
  const fits = {};
  for (const [stage, predictors] of Object.entries(definitions)) fits[stage] = ols(stageRows(samples, stage), "ms", predictors);
  return fits;
}

function fitProjection(samples) {
  const definitions = {
    projectionMs: ["publicCount", "events"],
    serializationMs: ["rawPublicBytes"],
    compressionMs: ["rawPublicBytes"],
    ownerOverlayMs: ["recipients"],
    socketAccountingMs: ["recipients"],
    rawPublicBytes: ["publicCount", "events"],
    compressedPublicBytes: ["publicCount", "events"],
    compressedOwnerBytes: ["recipients"],
  };
  return Object.fromEntries(Object.entries(definitions).map(([response, predictors]) =>
    [response, ols(samples, response, predictors)]));
}

function forecastFromFits(fits, vector, geometry) {
  const modelVector = {
    players: vector.humans, bodies: vector.bodies, aiDue: vector.ai,
    fieldTilesDue: vector.fieldTiles, worldJobsDue: vector.worldJobs, events: vector.events,
    candidates: geometry.candidates, contacts: geometry.contacts,
  };
  const stages = {};
  const total = { best: 0, base: 0, worst: 0 };
  for (const [name, fit] of Object.entries(fits)) {
    stages[name] = predict(fit, modelVector);
    for (const band of Object.keys(total)) total[band] += stages[name][band];
  }
  const stageHz = { input: 30, movement: 30, ballparkSync: 30, broadphase: 30,
    contacts: 30, ai: 6, field: 3.75, world: 3.75, events: 10 };
  const meanCore = { best: 0, base: 0, worst: 0 };
  for (const [name, bands] of Object.entries(stages)) {
    for (const band of Object.keys(meanCore)) meanCore[band] += bands[band] * stageHz[name] / 1000;
  }
  return { modelVector, stages, synchronizedDueTickWriterMs: total, meanWriterCores: meanCore };
}

function forecastReplication(fits, vector) {
  const recipientVector = { recipients: vector.replicationRecipients };
  const deltaPublic = predict(fits.compressedPublicBytes,
    { publicCount: vector.changedBodies, events: vector.events });
  const keyframePublic = predict(fits.compressedPublicBytes,
    { publicCount: vector.keyframeBodies, events: vector.events });
  const ownerTotal = predict(fits.compressedOwnerBytes, recipientVector);
  const deltaInput = { publicCount: vector.changedBodies, events: vector.events };
  const keyframeInput = { publicCount: vector.keyframeBodies, events: vector.events };
  const deltaRaw = predict(fits.rawPublicBytes, deltaInput);
  const keyframeRaw = predict(fits.rawPublicBytes, keyframeInput);
  const cpuDelta = {
    projectionMs: predict(fits.projectionMs, deltaInput),
    serializationMs: null,
    compressionMs: null,
    ownerOverlayMs: predict(fits.ownerOverlayMs, recipientVector),
    socketAccountingMs: predict(fits.socketAccountingMs, recipientVector),
  };
  cpuDelta.serializationMs = predict(fits.serializationMs, { rawPublicBytes: deltaRaw.base });
  cpuDelta.compressionMs = predict(fits.compressionMs, { rawPublicBytes: deltaRaw.base });
  const cpuKeyframe = {
    projectionMs: predict(fits.projectionMs, keyframeInput),
    serializationMs: predict(fits.serializationMs, { rawPublicBytes: keyframeRaw.base }),
    compressionMs: predict(fits.compressionMs, { rawPublicBytes: keyframeRaw.base }),
    ownerOverlayMs: cpuDelta.ownerOverlayMs,
    socketAccountingMs: cpuDelta.socketAccountingMs,
  };
  const perClientBytesPerSecond = {};
  const matchBytesPerSecond = {};
  const meanReplicationCores = {};
  for (const band of ["best", "base", "worst"]) {
    const ownerPerClient = ownerTotal[band] / vector.replicationRecipients;
    perClientBytesPerSecond[band] = deltaPublic[band] * 9.5 + keyframePublic[band] * 0.5 + ownerPerClient * 10;
    matchBytesPerSecond[band] = perClientBytesPerSecond[band] * vector.replicationRecipients;
    const deltaCpu = Object.values(cpuDelta).reduce((sum, stage) => sum + stage[band], 0);
    const keyframeCpu = Object.values(cpuKeyframe).reduce((sum, stage) => sum + stage[band], 0);
    meanReplicationCores[band] = (deltaCpu * 9.5 + keyframeCpu * 0.5) / 1000;
  }
  return {
    assumptions: { deltaHz: 9.5, keyframeHz: 0.5, framesPerRecipientPerBeat: 2,
      applicationPayloadOnly: true, publicFragmentEncodingSharedButBytesFannedToEveryClient: true },
    fittedRawBytes: { delta: deltaRaw, keyframe: keyframeRaw },
    deltaPublicBytes: deltaPublic, keyframePublicBytes: keyframePublic, ownerBytesPerBeatAllRecipients: ownerTotal,
    perClientBytesPerSecond, matchBytesPerSecond,
    matchMbitPerSecond: Object.fromEntries(Object.entries(matchBytesPerSecond).map(([band, bytes]) => [band, bytes * 8 / 1e6])),
    applicationMessagesPerSecondMatch: vector.replicationRecipients * 2 * REPLICATION_HZ,
    meanSyntheticReplicationCoreDemand: meanReplicationCores, cpuDelta, cpuKeyframe,
  };
}

function geometryFor(vector) {
  const mirror = createBallparkMirror({ worldScale: WORLD_SCALE, cellSize: 0.25 });
  mirror.synchronizeBodies(makeBodies(vector.bodies, vector.density === "stacked"), { tick: 1 });
  return queryPlayers(mirror, vector.humans, vector.density === "stacked");
}

function runFactorial({ repetitions = 4 } = {}) {
  const base = combinations();
  const samples = [];
  for (let repetition = 0; repetition < repetitions; repetition += 1) {
    const order = repetition % 2 === 0 ? base : [...base].reverse();
    for (const vector of order) {
      const context = { mirror: createBallparkMirror({ worldScale: WORLD_SCALE, cellSize: 0.25 }) };
      writerBeat(vector, context, 0);
      const sample = writerBeat(vector, context, repetition + 1);
      samples.push({ ordinal: samples.length, repetition,
        orderDirection: repetition % 2 === 0 ? "forward-gray" : "reverse-gray",
        vector, stages: sample.stages, totalMs: sample.totalMs,
        candidates: sample.candidates, contacts: sample.contacts });
    }
  }
  return { design: "counterbalanced full 2^7 factorial", factors: FACTORS, repetitions,
    observations: samples.length, samples, fits: fitWriter(samples) };
}

function runProjectionFactorial({ repetitions = 8 } = {}) {
  const base = combinations(PROJECTION_FACTORS);
  const samples = [];
  for (let repetition = 0; repetition < repetitions; repetition += 1) {
    const order = repetition % 2 === 0 ? base : [...base].reverse();
    for (const vector of order) {
      const bodies = makeBodies(vector.bodies, false, repetition);
      const frame = replicationBeat({ bodies, recipients: vector.recipients,
        changedBodies: vector.changedBodies, tick: repetition + 1, keyframe: vector.keyframe === 1,
        eventCount: vector.events });
      samples.push({ ordinal: samples.length, repetition,
        orderDirection: repetition % 2 === 0 ? "forward-gray" : "reverse-gray",
        ...vector, publicCount: vector.keyframe ? vector.bodies : vector.changedBodies,
        rawPublicBytes: frame.rawPublicBytes, compressedPublicBytes: frame.compressedPublicBytes,
        compressedOwnerBytes: frame.compressedOwnerBytes,
        projectionMs: frame.stages.projection, serializationMs: frame.stages.serialization,
        compressionMs: frame.stages.compression, ownerOverlayMs: frame.stages.ownerOverlay,
        socketAccountingMs: frame.stages.socketAccounting });
    }
  }
  return { design: "counterbalanced full 2^5 replication factorial", factors: PROJECTION_FACTORS,
    repetitions, observations: samples.length, samples, fits: fitProjection(samples) };
}

async function runH24({ beats = 600, dense = false } = {}) {
  const vector = H_VECTORS.H24;
  const context = { mirror: createBallparkMirror({ worldScale: WORLD_SCALE, cellSize: 0.25 }) };
  const writer = [];
  const total = [];
  const candidates = [];
  const contacts = [];
  const replication = [];
  const bytes = [];
  const messages = [];
  const queue = [];
  const stageSamples = {};
  const rawSamples = [];
  let bodies = makeBodies(vector.bodies, dense, 0);
  const eventLoop = monitorEventLoopDelay({ resolution: 10 });
  eventLoop.enable();
  const gc = [];
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) gc.push({ durationMs: entry.duration, kind: entry.detail?.kind ?? entry.kind });
  });
  observer.observe({ entryTypes: ["gc"] });
  if (typeof global.gc === "function") global.gc();
  const memoryBefore = process.memoryUsage();
  const cpuBefore = process.cpuUsage();
  const wallStart = performance.now();
  for (let tick = 1; tick <= beats; tick += 1) {
    const due = {
      players: vector.humans, bodies: vector.bodies, dense: dense ? 1 : 0,
      aiDue: tick % 5 === 0 ? vector.ai : 0,
      fieldTilesDue: tick % 8 === 0 ? vector.fieldTiles : 0,
      worldJobsDue: tick % 8 === 0 ? vector.worldJobs : 0,
      events: tick % 3 === 0 ? vector.events : 0,
    };
    const beat = writerBeat(due, context, tick);
    writer.push(beat.totalMs); candidates.push(beat.candidates); contacts.push(beat.contacts);
    for (const [name, value] of Object.entries(beat.stages)) (stageSamples[name] ||= []).push(value);
    let replicationMs = 0;
    if (tick % 3 === 0) {
      const frame = replicationBeat({ bodies, recipients: vector.replicationRecipients,
        changedBodies: vector.changedBodies, tick, keyframe: tick % 60 === 0,
        eventCount: vector.events });
      replicationMs = Object.values(frame.stages).reduce((sum, value) => sum + value, 0);
      replication.push(replicationMs); bytes.push(frame.matchBytes); messages.push(frame.messages); queue.push(frame.queueBytes);
      for (const [name, value] of Object.entries(frame.stages)) (stageSamples[name] ||= []).push(value);
    }
    total.push(beat.totalMs + replicationMs);
    rawSamples.push({ tick, due, writerMs: beat.totalMs, replicationMs,
      authorityBeatMs: beat.totalMs + replicationMs, candidates: beat.candidates,
      contacts: beat.contacts, matchBytes: tick % 3 === 0 ? bytes[bytes.length - 1] : 0,
      messages: tick % 3 === 0 ? messages[messages.length - 1] : 0 });
    if (tick % 50 === 0) await new Promise((resolve) => setImmediate(resolve));
  }
  await new Promise((resolve) => setImmediate(resolve));
  const wallMs = performance.now() - wallStart;
  const cpu = process.cpuUsage(cpuBefore);
  context.mirror = null;
  bodies = null;
  if (typeof global.gc === "function") global.gc();
  const memoryAfter = process.memoryUsage();
  eventLoop.disable(); observer.disconnect();
  const writerStats = stats(writer);
  const replicationStats = stats(replication);
  const seconds = beats / WRITER_HZ;
  const matchBytes = bytes.reduce((sum, value) => sum + value, 0);
  const matchMessages = messages.reduce((sum, value) => sum + value, 0);
  const meanStageCpu = Object.fromEntries(Object.entries(stageSamples).map(([name, values]) => [name, stats(values)]));
  const writerMeanCore = writerStats.mean * WRITER_HZ / 1000;
  const replicationMeanCore = replicationStats.mean * REPLICATION_HZ / 1000;
  return {
    fixture: dense ? "H24-stacked-sensitivity" : "H24-representative",
    classification: "measured deterministic synthetic fixture using production Ballpark and Node Brotli; not live sim or socket proof",
    beats, seconds, clocks: { writerHz: WRITER_HZ, replicationHz: REPLICATION_HZ, aiHz: 6, fieldHz: 3.75, worldHz: 3.75 },
    vector, writer: writerStats, authorityBeatIncludingReplication: stats(total), replication: replicationStats,
    stages: meanStageCpu, candidates: stats(candidates), contacts: stats(contacts),
    cpu: { meanSyntheticCoreDemand: writerMeanCore + replicationMeanCore,
      writerMeanSyntheticCoreDemand: writerMeanCore,
      replicationMeanSyntheticCoreDemand: replicationMeanCore,
      acceleratedHarnessObservedCoreFraction: (cpu.user + cpu.system) / (wallMs * 1000),
      p99WriterFrameUtilizationAt30Hz: writerStats.p99 * WRITER_HZ / 1000,
      interpretation: "paced core demand is derived from measured single-thread stage wall time; live billable process CPU remains a capture gap" },
    memory: { before: memoryBefore, after: memoryAfter,
      heapDeltaBytes: memoryAfter.heapUsed - memoryBefore.heapUsed,
      rssDeltaBytes: memoryAfter.rss - memoryBefore.rss,
      explicitGcAvailable: typeof global.gc === "function",
      peakSyntheticOneBeatQueuedBytes: Math.max(0, ...queue) },
    gc: { observed: gc.length, pauseMs: stats(gc.map((entry) => entry.durationMs)), entries: gc },
    eventLoop: { p95DelayMs: eventLoop.percentile(95) / 1e6, p99DelayMs: eventLoop.percentile(99) / 1e6,
      maxDelayMs: eventLoop.max / 1e6,
      interpretation: "accelerated synchronous harness blockage only; not a paced 30 Hz event-loop or TiDi measurement" },
    network: { applicationPayloadBytesPerSecondPerClient: matchBytes / seconds / vector.humans,
      applicationPayloadBytesPerSecondMatch: matchBytes / seconds,
      applicationMessagesPerSecondMatch: matchMessages / seconds,
      payloadMbitPerSecondMatch: matchBytes * 8 / seconds / 1e6,
      p95MatchBytesPerReplicationBeat: percentile(bytes, 0.95),
      assumptions: ["one compressed shared public fragment copied to every recipient",
        "one independently compressed owner-private overlay per recipient",
        "keyframe every two seconds; delta/public change set at ten hertz",
        "application payload only; TLS, WebSocket, TCP/IP, ACK, loss, retransmit, voice, and reconnect excluded"] },
    rawSamples,
    gates: { normalWithoutTiDi: null,
      normalWithoutTiDiReason: "not measurable in an accelerated synthetic fixture",
      syntheticWriterP95Ms: writerStats.p95 <= 1000 / WRITER_HZ * 0.5,
      syntheticWriterP99Ms: writerStats.p99 <= 1000 / WRITER_HZ * 0.7,
      syntheticAverageDownlink: matchBytes / seconds / vector.humans <= 64 * 1024,
      writerP95LimitMs: 1000 / WRITER_HZ * 0.5, writerP99LimitMs: 1000 / WRITER_HZ * 0.7 },
  };
}

function machine() {
  return { hostname: os.hostname(), platform: process.platform, arch: process.arch, osRelease: os.release(),
    cpuModel: os.cpus()[0]?.model || "unknown", logicalCpus: os.cpus().length, totalMemoryBytes: os.totalmem(),
    node: process.version, v8: process.versions.v8,
    topology: "one OS process, one event-loop/writer thread, zero workers; one logical authority for one match" };
}

function provenance() {
  const root = path.resolve(__dirname, "..");
  const git = (args) => spawnSync("git", args, { cwd: root, encoding: "utf8" });
  const commit = git(["rev-parse", "HEAD"]);
  const status = git(["status", "--short"]);
  const testPath = path.join(root, "tests", "s24-factorial-preflight.cjs");
  return {
    gitCommit: commit.status === 0 ? commit.stdout.trim() : null,
    gitStatusShort: status.status === 0 ? status.stdout.trim().split("\n").filter(Boolean) : null,
    scriptSha256: sha256(fs.readFileSync(__filename)),
    testSha256: sha256(fs.readFileSync(testPath)),
    argv: process.argv,
  };
}

async function runPreflight(options = {}) {
  const started = new Date().toISOString();
  const factorial = runFactorial({ repetitions: options.repetitions || 4 });
  const projectionFactorial = runProjectionFactorial({ repetitions: options.projectionRepetitions || 8 });
  const h24 = await runH24({ beats: options.beats || 600, dense: false });
  const h24Stacked = await runH24({ beats: options.sensitivityBeats || Math.max(180, Math.floor((options.beats || 600) / 2)), dense: true });
  const forecasts = {};
  for (const [name, vector] of Object.entries(H_VECTORS)) {
    const geometry = geometryFor(vector);
    const writerForecast = forecastFromFits(factorial.fits, vector, geometry);
    const replicationForecast = forecastReplication(projectionFactorial.fits, vector);
    forecasts[name] = { classification: name === "H24" ? "factor-fit cross-check against measured synthetic H24" : "extrapolated",
      vector, geometry, writer: writerForecast, replication: replicationForecast,
      totalMeanSyntheticCoreDemand: Object.fromEntries(["best", "base", "worst"].map((band) =>
        [band, writerForecast.meanWriterCores[band] + replicationForecast.meanSyntheticReplicationCoreDemand[band]])),
      extrapolation: { maximumMeasuredBodies: FACTORS.bodies[1], bodyRatio: vector.bodies / FACTORS.bodies[1],
        maximumMeasuredRecipients: PROJECTION_FACTORS.recipients[1], recipientRatio: vector.replicationRecipients / PROJECTION_FACTORS.recipients[1],
        statisticalBandsExcludeStructuralRuntimeAndWANUncertainty: true } };
  }
  const allFits = [...Object.values(factorial.fits), ...Object.values(projectionFactorial.fits)];
  const identifiable = allFits.every((fit) => fit.rSquared >= 0.50)
    && allFits.every((fit) => fit.design.rank === fit.design.columns
      && fit.design.standardizedConditionNumber <= 100)
    && allFits.every((fit) => Object.values(fit.coefficients).every(Number.isFinite));
  const result = {
    schema: SCHEMA, startedAt: started, completedAt: new Date().toISOString(), machine: machine(), provenance: provenance(),
    claimBoundary: "S24 factorized synthetic preflight only. No real 24-client sockets, live runtime, WAN/WSS, host packing, promotion, or 48/96 measurement claim.",
    architectureInvariant: "one dedicated logical single-writer authority for this one match; concurrent matches multiply independent authorities",
    factorial: {
      writer: { design: factorial.design, factors: factorial.factors, repetitions: factorial.repetitions,
        observations: factorial.observations, fits: factorial.fits, rawRows: factorial.samples },
      replication: { design: projectionFactorial.design, factors: projectionFactorial.factors,
        repetitions: projectionFactorial.repetitions, observations: projectionFactorial.observations,
        fits: projectionFactorial.fits, rawRows: projectionFactorial.samples },
    },
    measured: { H24: h24, H24StackedSensitivity: h24Stacked },
    modeled: forecasts,
    identifiability: { passed: identifiable, minimumRSquared: Math.min(...allFits.map((fit) => fit.rSquared)),
      maximumStandardizedConditionNumber: Math.max(...allFits.map((fit) => fit.design.standardizedConditionNumber)),
      rule: "every stage design is full-rank with standardized condition number <=100, has finite coefficients, and R^2 >=0.50; otherwise 48/96 milliseconds are suppressed" },
    decision: { s24Gate: false,
      syntheticComponentsPassed: identifiable && [h24.gates.syntheticWriterP95Ms,
        h24.gates.syntheticWriterP99Ms, h24.gates.syntheticAverageDownlink].every(Boolean),
      gateReason: "NORMAL/no-TiDi, live authority cadence, real queues/sockets, and on-wire traffic remain unmeasured",
      productPromotion: false, real24ClientCaptureRequired: true,
      nextLane: "counterbalanced warmed 24-client loopback capture against the live runtime, after root checkpoint" },
  };
  if (!identifiable) result.modeled = { suppressed: true, reason: "factor fit is not identifiable enough to publish milliseconds" };
  return result;
}

async function main() {
  const args = process.argv.slice(2);
  const quick = args.includes("--quick");
  const outputIndex = args.indexOf("--output");
  const output = outputIndex >= 0 ? path.resolve(args[outputIndex + 1]) : null;
  const result = await runPreflight({ repetitions: quick ? 2 : 4, beats: quick ? 120 : 600,
    sensitivityBeats: quick ? 90 : 300, projectionRepetitions: quick ? 4 : 8 });
  const encoded = `${JSON.stringify(result, null, 2)}\n`;
  if (output) { fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, encoded); }
  else process.stdout.write(encoded);
}

if (require.main === module) main().catch((error) => { console.error(error.stack || error.message); process.exit(1); });

module.exports = { SCHEMA, FACTORS, PROJECTION_FACTORS, H_VECTORS, combinations, ols, predict,
  runFactorial, runProjectionFactorial, runH24, runPreflight, replicationBeat, writerBeat,
  makeBodies, makePlayerQueryPositions, buildPublicFragment, designDiagnostics };
