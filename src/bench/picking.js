function finitePoint(point) {
  const x = Number(point?.x ?? point?.wx);
  const y = Number(point?.y ?? point?.wy);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function wrappedDelta(delta, span) {
  if (!Number.isFinite(span) || span <= 0) return delta;
  const magnitude = Math.abs(delta) % span;
  return Math.min(magnitude, span - magnitude);
}

function compareKeys(left, right) {
  const a = String(left);
  const b = String(right);
  return a === b ? 0 : (a < b ? -1 : 1);
}

export function benchPickDistance(point, identity, bounds = null) {
  const target = finitePoint(point);
  const position = finitePoint(identity?.position);
  if (!target || !position) return Infinity;
  const dx = wrappedDelta(target.x - position.x, Number(bounds?.width));
  const dy = wrappedDelta(target.y - position.y, Number(bounds?.height));
  return Math.hypot(dx, dy);
}

export function pickBenchIdentity(identities, point, { bounds = null, padding = 0 } = {}) {
  if (!Array.isArray(identities) || !finitePoint(point)) return null;
  const extra = Math.max(0, Number(padding) || 0);
  const candidates = [];
  for (const identity of identities) {
    const radius = Math.max(0, Number(identity?.radius) || 0) + extra;
    const distance = benchPickDistance(point, identity, bounds);
    if (distance <= radius) candidates.push({ identity, distance });
  }
  candidates.sort((left, right) => left.distance - right.distance
    || compareKeys(left.identity.key, right.identity.key));
  return candidates[0]?.identity || null;
}

export function selectBenchIdentityGroup(identities, selected) {
  if (!selected || !Array.isArray(identities)) return Object.freeze([]);
  const groupKey = selected.groupKey || `${selected.family}:${selected.archetype}`;
  return Object.freeze(identities
    .filter((identity) => (identity.groupKey || `${identity.family}:${identity.archetype}`) === groupKey)
    .slice()
    .sort((left, right) => compareKeys(left.key, right.key)));
}
