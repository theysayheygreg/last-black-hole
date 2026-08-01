import { FABRIC } from './fabric.js';

export const WAVE_HALF_LIFE_SECONDS = FABRIC.eventWave.halfLifeSeconds;

function finite(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function decayWaveAmplitude(amplitude, dt, halfLife = WAVE_HALF_LIFE_SECONDS) {
  const safeHalfLife = Math.max(0.001, finite(halfLife, WAVE_HALF_LIFE_SECONDS));
  const step = Math.max(0, finite(dt));
  return finite(amplitude) * Math.pow(0.5, step / safeHalfLife);
}

export function advanceWaveRings(rings, dt, options = {}) {
  const speed = finite(options.speed, FABRIC.eventWave.speed);
  const maxRadius = Math.max(0, finite(options.maxRadius, FABRIC.eventWave.maxRadius));
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
