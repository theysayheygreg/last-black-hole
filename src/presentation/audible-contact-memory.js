import { metersToSimUnits, simUnitsToMeters } from '../units.js';

const DEFAULT_CATEGORY_PRIORITY = Object.freeze({
  EXFIL: 6,
  'EXFIL TONE': 6,
  INHIBITOR: 5,
  VESSEL: 5,
  'VESSEL THRUST': 5,
  SWARM: 4,
  CORRUPTION: 4,
  IMPACT: 4,
  GLITCH: 3,
  STATIC: 3,
  PULSE: 3,
  THRUST: 2,
  'THRUST AGAINST FLOW': 2,
  'THRUST WITH FLOW': 2,
  SALVAGE: 1,
  CREW: 1,
  NOISE: 0,
});

function finiteOr(value, fallback) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function identityRank(identity) {
  if (identity === 'VESSEL THRUST') return 2;
  return ['GLITCH', 'SWARM', 'VESSEL', 'EXFIL'].includes(identity) ? 1 : 0;
}

export function projectAudibleContact({
  existing = null,
  sourceWX,
  sourceWY,
  distanceSimUnits,
  bearingRadians,
  emittedRadiusMeters,
  nowSeconds,
  category = 'NOISE',
  sourceClass = null,
  identificationFraction = 0.4,
  publicSourceClasses = [],
  fadeSeconds = 2.5,
} = {}) {
  const radiusMeters = Math.max(0, finiteOr(emittedRadiusMeters, 0));
  const distance = Math.max(0, finiteOr(distanceSimUnits, Infinity));
  const now = Math.max(0, finiteOr(nowSeconds, 0));
  const current = existing ? { ...existing } : null;
  const audible = radiusMeters > 0
    && distance <= metersToSimUnits(radiusMeters);

  if (!audible) {
    if (!current) return { contact: null, state: 'silent' };
    if (current.live === false && now >= finiteOr(current.expiresAt, now)) {
      return { contact: null, state: 'expired' };
    }
    const contact = {
      ...current,
      live: false,
      expiresAt: current.live === false
        ? current.expiresAt
        : now + Math.max(0, fadeSeconds),
    };
    return { contact, state: 'fading' };
  }

  const publicClass = String(sourceClass || '').toUpperCase();
  // A faded contact may identify again only after it is genuinely audible;
  // the no-upgrade rule applies while the source is lost, not on re-entry.
  const canUpgradeIdentity = true;
  const inIdentificationZone = distance <= metersToSimUnits(radiusMeters * identificationFraction);
  const identity = canUpgradeIdentity
    && inIdentificationZone
    && publicSourceClasses.includes(publicClass)
    && identityRank(publicClass) >= identityRank(current?.identity)
    ? publicClass
    : current?.identity || null;

  const contact = {
    ...current,
    category,
    identity,
    identified: Boolean(identity),
    wx: sourceWX,
    wy: sourceWY,
    bearingRadians: finiteOr(bearingRadians, 0),
    rangeMeters: simUnitsToMeters(distance),
    emittedRadiusMeters: radiusMeters,
    lastHeardAt: now,
    live: true,
    expiresAt: now + Math.max(0, fadeSeconds),
  };
  return { contact, state: 'live' };
}

export function reconcileUnobservedAudibleContacts(memory, observedKeys, nowSeconds, {
  fadeSeconds = 2.5,
} = {}) {
  for (const [key, existing] of memory || []) {
    if (observedKeys?.has(key)) continue;
    const projection = projectAudibleContact({
      existing,
      sourceWX: existing.wx,
      sourceWY: existing.wy,
      distanceSimUnits: Infinity,
      bearingRadians: existing.bearingRadians,
      emittedRadiusMeters: 0,
      nowSeconds,
      fadeSeconds,
    });
    if (projection.contact) {
      projection.contact.id = key;
      memory.set(key, projection.contact);
    } else {
      memory.delete(key);
    }
  }
  return memory;
}

export function prioritizeAudibleContacts(contacts = [], {
  limit = 5,
  categoryPriority = DEFAULT_CATEGORY_PRIORITY,
} = {}) {
  return contacts
    .filter(Boolean)
    .sort((a, b) => {
      const aKind = a.identity || a.category || 'NOISE';
      const bKind = b.identity || b.category || 'NOISE';
      return (Number(categoryPriority[bKind]) || 0) - (Number(categoryPriority[aKind]) || 0)
        || (Number(b.strengthMeters ?? b.emittedRadiusMeters) || 0)
          - (Number(a.strengthMeters ?? a.emittedRadiusMeters) || 0)
        || (Number(a.rangeMeters) || 0) - (Number(b.rangeMeters) || 0)
        || (Number(b.lastHeardAt) || 0) - (Number(a.lastHeardAt) || 0)
        || String(a.id || '').localeCompare(String(b.id || ''));
    })
    .slice(0, Math.max(0, Math.floor(Number(limit) || 0)));
}
