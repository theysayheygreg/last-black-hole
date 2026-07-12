"use strict";

function positiveCapacity(value) {
  const capacity = Number(value);
  if (!Number.isSafeInteger(capacity) || capacity <= 0) {
    throw new TypeError("bounded quantile capacity must be a positive safe integer");
  }
  return capacity;
}

function nearestRank(sorted, probability) {
  if (sorted.length === 0) return 0;
  const rank = Math.max(1, Math.ceil(probability * sorted.length));
  return sorted[Math.min(sorted.length - 1, rank - 1)];
}

class BoundedQuantiles {
  constructor(capacity) {
    this.capacity = positiveCapacity(capacity);
    this.values = new Float64Array(this.capacity);
    this.reset();
  }

  observe(value) {
    const sample = Number(value);
    if (!Number.isFinite(sample) || sample < 0) {
      throw new TypeError("bounded quantile sample must be a non-negative finite number");
    }
    this.values[this.cursor] = sample;
    this.cursor = (this.cursor + 1) % this.capacity;
    this.count = Math.min(this.capacity, this.count + 1);
    this.totalObserved += 1;
  }

  reset() {
    this.cursor = 0;
    this.count = 0;
    this.totalObserved = 0;
  }

  snapshot() {
    const sorted = Array.from(this.values.subarray(0, this.count)).sort((left, right) => left - right);
    return Object.freeze({
      count: this.count,
      totalObserved: this.totalObserved,
      p50: nearestRank(sorted, 0.50),
      p95: nearestRank(sorted, 0.95),
      p99: nearestRank(sorted, 0.99),
      max: sorted.length === 0 ? 0 : sorted[sorted.length - 1],
    });
  }
}

module.exports = {
  BoundedQuantiles,
  nearestRank,
};
