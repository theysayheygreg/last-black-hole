// Small presentation-only adapters for authoritative wells and their emitted
// growth fronts. They deliberately do not infer physics or mutate authority.

import { FABRIC } from '../content/fabric.js';
import { worldYToFluidTextureV } from '../coords.js';

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, finite(value)));
}

export function effectiveWellVisualMass(well) {
  const mass = Number(well?.mass);
  const multiplier = Number(well?.overdriveMultiplier);
  return (Number.isFinite(mass) ? Math.max(0, mass) : 1)
    * (Number.isFinite(multiplier) ? Math.max(1, multiplier) : 1);
}

/**
 * Convert a source well's world-space coordinates into the global fluid-space
 * coordinates used by the lane shader. World Y is down; fluid Y is up.
 */
export function eventWaveSourceFluidWorld(wave, worldScale = 3) {
  const scale = Math.max(0.001, finite(worldScale, 3));
  const sourceWX = finite(wave?.sourceWX ?? wave?.world?.x);
  const sourceWY = finite(wave?.sourceWY ?? wave?.world?.y);
  return [sourceWX, worldYToFluidTextureV(sourceWY / scale) * scale];
}

/**
 * Project the authority-owned wave into the one fluid presentation seam.
 * Radius, lifecycle, and telegraph progress remain facts of the public
 * snapshot; the renderer never advances this record itself.
 */
export function projectEventWavePresentation(wave, simTime = 0) {
  if (!wave || wave.alive === false) return null;
  const sourceWellId = wave?.sourceWellId == null ? '' : String(wave.sourceWellId).trim();
  const sourceWX = finite(wave?.sourceWX ?? wave?.world?.x, NaN);
  const sourceWY = finite(wave?.sourceWY ?? wave?.world?.y, NaN);
  if (!sourceWellId || !Number.isFinite(sourceWX) || !Number.isFinite(sourceWY)) return null;

  const launchTime = finite(wave?.launchTime, finite(simTime));
  const telegraphStartTime = finite(
    wave?.telegraphStartTime,
    launchTime - Math.max(0, finite(wave?.telegraphSeconds, FABRIC.eventWave.telegraphSeconds)),
  );
  const explicitState = wave?.state === 'telegraph' || wave?.state === 'active'
    ? wave.state
    : null;
  const state = explicitState || (finite(simTime) < launchTime ? 'telegraph' : 'active');
  const telegraphProgress = state === 'telegraph'
    ? clamp01((finite(simTime) - telegraphStartTime) / Math.max(0.001, launchTime - telegraphStartTime))
    : 1;
  const amplitude = Math.max(0, finite(wave?.amplitude));
  const initialAmplitude = Math.max(0.0001, finite(wave?.initialAmplitude, amplitude || 1));

  return Object.freeze({
    eventId: String(wave?.eventId || wave?.id || 'wave'),
    cause: String(wave?.cause || 'unknown'),
    sourceWellId,
    sourceWX,
    sourceWY,
    state,
    launchTime,
    telegraphStartTime,
    telegraphProgress,
    radius: Math.max(0, finite(wave?.radius)),
    frontWidth: Math.max(0.001, finite(wave?.frontWidth, FABRIC.eventWave.frontWidth)),
    amplitude,
    strengthRatio: clamp01(amplitude / initialAmplitude),
  });
}

export function eventWaveMaterialProfile(wave, sampleDistance) {
  const width = Math.max(0.001, finite(wave?.frontWidth, FABRIC.eventWave.frontWidth));
  const radius = Math.max(0, finite(wave?.radius));
  const strength = clamp01(finite(wave?.strengthRatio, 1));
  const distance = Math.max(0, finite(sampleDistance));
  const telegraphProgress = clamp01(wave?.telegraphProgress);
  const telegraphScale = 1 + telegraphProgress * 0.14;
  const front = Math.exp(-Math.abs(distance - radius) / (width * 1.5));
  const behind = Math.exp(-Math.max(0, radius - distance) / (width * 2.0)) * 0.5;
  return Object.freeze({
    swell: Math.max(front, behind) * strength,
    leadingCrest: front * strength,
    calmBehind: Math.max(0, radius - distance) >= width * 8,
    displayDistance: distance * telegraphScale,
    sourceBrightness: 1 + telegraphProgress * 0.65,
  });
}

export function syncRemoteWellPresentation(local, remote) {
  if (!local || !remote) return local;
  local.wx = remote.wx;
  local.wy = remote.wy;
  local.mass = remote.mass;
  local.orbitalDir = finite(remote.orbitalDir, finite(local.orbitalDir, 1));
  local.overdriveTier = remote.overdriveTier ?? 0;
  local.overdriveMultiplier = remote.overdriveMultiplier ?? 1;
  local.overdriveSource = remote.overdriveSource ?? null;
  local.overdriveTime = remote.overdriveTime ?? null;
  if (remote.catalogId) local.catalogId = remote.catalogId;
  if (remote.behaviorId) local.behaviorId = remote.behaviorId;
  if (remote.catalogActivation) local.catalogActivation = remote.catalogActivation;
  if (remote.killRadius) local.killRadius = remote.killRadius;
  if (remote.name) local.name = remote.name;
  return local;
}
