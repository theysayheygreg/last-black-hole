"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

function nearestRank(values, percentile) {
  if (!Array.isArray(values) || values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil(percentile * sorted.length));
  return sorted[Math.min(sorted.length - 1, rank - 1)];
}

function distribution(values) {
  const finite = values.filter(Number.isFinite);
  if (finite.length === 0) return { count: 0, p50: null, p95: null, p99: null, max: null, mean: null };
  return {
    count: finite.length,
    p50: nearestRank(finite, 0.50),
    p95: nearestRank(finite, 0.95),
    p99: nearestRank(finite, 0.99),
    max: Math.max(...finite),
    mean: finite.reduce((sum, value) => sum + value, 0) / finite.length,
  };
}

function fixedWindowRates(events, { startAt, endAt, windowMs, recipients, direction = "authority->client" }) {
  if (!(endAt > startAt) || !Number.isSafeInteger(windowMs) || windowMs < 1) {
    throw new TypeError("fixed window inputs are invalid");
  }
  const labels = [...recipients].sort();
  const bucketCount = Math.ceil((endAt - startAt) / windowMs);
  const byRecipient = Object.fromEntries(labels.map((label) => [label, Array(bucketCount).fill(0)]));
  const aggregate = Array(bucketCount).fill(0);
  for (const event of events) {
    if (event.metric !== "accepted" || event.direction !== direction
      || event.timestamp < startAt || event.timestamp >= endAt || !byRecipient[event.recipient]) continue;
    const index = Math.min(bucketCount - 1, Math.floor((event.timestamp - startAt) / windowMs));
    byRecipient[event.recipient][index] += event.bytes;
    aggregate[index] += event.bytes;
  }
  const seconds = windowMs / 1000;
  const recipientRates = Object.fromEntries(Object.entries(byRecipient).map(([label, bytes]) =>
    [label, distribution(bytes.map((value) => value / seconds))]));
  return {
    windowMs,
    direction,
    recipientBytesPerSecond: recipientRates,
    allRecipientWindowsBytesPerSecond: distribution(Object.values(byRecipient).flat().map((value) => value / seconds)),
    aggregateBytesPerSecond: distribution(aggregate.map((value) => value / seconds)),
  };
}

function eventBreakdown(events, startAt, endAt) {
  const result = {};
  for (const event of events) {
    if (event.timestamp < startAt || event.timestamp >= endAt) continue;
    const key = [event.direction, event.frameClass, event.projectionKind || "none", event.metric].join("|");
    const row = result[key] ||= { direction: event.direction, frameClass: event.frameClass,
      projectionKind: event.projectionKind, metric: event.metric, frames: 0, bytes: 0, frameBytes: [] };
    row.frames += event.frames;
    row.bytes += event.bytes;
    for (let index = 0; index < event.frames; index += 1) row.frameBytes.push(event.bytes / event.frames);
  }
  return Object.fromEntries(Object.entries(result).sort(([left], [right]) => left.localeCompare(right)).map(([key, row]) => {
    const stats = distribution(row.frameBytes);
    delete row.frameBytes;
    return [key, { ...row, frameBytes: stats }];
  }));
}

function aggregateChecksum(directory, files) {
  const hash = crypto.createHash("sha256");
  const entries = [];
  for (const relative of [...files].sort()) {
    const bytes = fs.readFileSync(path.join(directory, relative));
    const digest = crypto.createHash("sha256").update(bytes).digest("hex");
    entries.push({ path: relative, bytes: bytes.length, sha256: digest });
    hash.update(`${relative}\0${digest}\n`, "utf8");
  }
  return { algorithm: "sha256(path NUL sha256 LF, sorted by path)", sha256: hash.digest("hex"), files: entries };
}

function validateChecksums(directory, checksumFile = "checksums.json") {
  const recorded = JSON.parse(fs.readFileSync(path.join(directory, checksumFile), "utf8"));
  const actual = aggregateChecksum(directory, recorded.files.map((entry) => entry.path));
  const mismatches = actual.files.filter((entry, index) => {
    const expected = recorded.files[index];
    return !expected || entry.path !== expected.path || entry.bytes !== expected.bytes || entry.sha256 !== expected.sha256;
  });
  return { passed: mismatches.length === 0 && actual.sha256 === recorded.sha256,
    expectedAggregateSha256: recorded.sha256, actualAggregateSha256: actual.sha256, mismatches };
}

module.exports = { nearestRank, distribution, fixedWindowRates, eventBreakdown, aggregateChecksum, validateChecksums };
