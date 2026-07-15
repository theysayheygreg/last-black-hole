const WAVE_HALF_LIFE_SECONDS = 2;

function finite(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function decayWaveAmplitude(amplitude, dt, halfLife = WAVE_HALF_LIFE_SECONDS) {
  const safeHalfLife = Math.max(0.001, finite(halfLife, WAVE_HALF_LIFE_SECONDS));
  const step = Math.max(0, finite(dt));
  return finite(amplitude) * Math.pow(0.5, step / safeHalfLife);
}

function advanceWaveRings(rings, dt, options = {}) {
  const speed = finite(options.speed, 0.4);
  const maxRadius = Math.max(0, finite(options.maxRadius, 2));
  const halfLife = Math.max(0.001, finite(options.halfLife, WAVE_HALF_LIFE_SECONDS));
  return (rings || []).map((ring) => {
    const radius = finite(ring.radius) + speed * Math.max(0, finite(dt));
    const amplitude = decayWaveAmplitude(ring.amplitude, dt, halfLife);
    return {
      ...ring,
      radius,
      amplitude,
      alive: ring.alive !== false && radius <= maxRadius && amplitude >= 0.01,
    };
  }).filter((ring) => ring.alive !== false);
}

module.exports = {
  WAVE_HALF_LIFE_SECONDS,
  advanceWaveRings,
  decayWaveAmplitude,
};
