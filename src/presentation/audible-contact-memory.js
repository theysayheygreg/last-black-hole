import { metersToSimUnits, simUnitsToMeters } from '../units.js';

const DEFAULT_CATEGORY_PRIORITY = Object.freeze({
  INHIBITOR: 5,
  VESSEL: 5,
  'VESSEL THRUST': 5,
  IMPACT: 4,
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
  return identity === 'VESSEL THRUST' ? 2 : identity === 'VESSEL' ? 1 : 0;
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
