// Small presentation-only adapters for authoritative wells and their emitted
// growth fronts. They deliberately do not infer physics or mutate authority.

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function effectiveWellVisualMass(well) {
  const mass = Number(well?.mass);
  const multiplier = Number(well?.overdriveMultiplier);
  return (Number.isFinite(mass) ? Math.max(0, mass) : 1)
    * (Number.isFinite(multiplier) ? Math.max(1, multiplier) : 1);
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

export function sourceBoundWellWavefront(wave, wells = []) {
  const sourceWellId = wave?.sourceWellId == null ? '' : String(wave.sourceWellId).trim();
  if (!sourceWellId) return null;
  const sourceWell = wells.find((well) => String(well?.id) === sourceWellId);
  if (!sourceWell) return null;

  const x = Number(wave?.world?.x);
  const y = Number(wave?.world?.y);
  const radius = Number(wave?.radius);
  const strength = Number(wave?.strength);
  if (![x, y, radius, strength].every(Number.isFinite) || radius <= 0 || strength <= 0) return null;

  const initialStrength = Math.max(0.0001, finite(wave.initialStrength, strength));
  return Object.freeze({
    id: String(wave.id),
    sourceWellId,
    world: Object.freeze({ x, y }),
    radius,
    strengthRatio: Math.max(0, Math.min(1, strength / initialStrength)),
  });
}
