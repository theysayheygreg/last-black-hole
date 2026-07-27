// Bench selection consumes this deliberately small, read-only view of authority
// snapshots. Adding a family requires choosing its identity and contextual facts;
// arbitrary snapshot fields never leak into the inspector through this module.

const FAMILY_SPECS = Object.freeze([
  { family: 'players', path: ['players'] },
  { family: 'wells', path: ['world', 'wells'] },
  { family: 'stars', path: ['world', 'stars'] },
  { family: 'wrecks', path: ['world', 'wrecks'] },
  { family: 'debris', path: ['world', 'debris'] },
  { family: 'loot', path: ['world', 'loot'] },
  { family: 'portals', path: ['world', 'portals'] },
  { family: 'objectives', path: ['world', 'objectives'] },
  { family: 'planetoids', path: ['world', 'planetoids'] },
  { family: 'scavengers', path: ['world', 'scavengers'] },
  { family: 'enemies', path: ['world', 'enemies'] },
  { family: 'sentries', path: ['world', 'sentries'] },
  { family: 'fauna', path: ['world', 'fauna'] },
  { family: 'waveRings', path: ['world', 'waveRings'] },
]);

const LABELS = Object.freeze({
  players: 'Player', wells: 'Well', stars: 'Star', wrecks: 'Wreck',
  debris: 'Debris', loot: 'Loot', portals: 'Portal', objectives: 'Objective',
  planetoids: 'Planetoid', scavengers: 'Scavenger', enemies: 'Enemy',
  sentries: 'Sentry', fauna: 'Fauna', waveRings: 'Wave',
  inhibitor: 'Inhibitor', collapseEpoch: 'Collapse Epoch',
});

const SIZE_RADII = Object.freeze({ tiny: 0.018, small: 0.025, medium: 0.04, large: 0.06 });

function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function text(value) {
  if (value == null) return undefined;
  const result = String(value).trim();
  return result || undefined;
}

function atPath(source, path) {
  let value = source;
  for (const key of path) value = record(value)[key];
  return Array.isArray(value) ? value : [];
}

function positionFor(family, source) {
  const x = finite(family === 'waveRings' ? source.sourceWX : (source.wx ?? source.x));
  const y = finite(family === 'waveRings' ? source.sourceWY : (source.wy ?? source.y));
  return x === undefined || y === undefined ? null : Object.freeze({ x, y });
}

function archetypeFor(family, source) {
  const candidates = {
    players: [source.hullType, source.shipType, source.personality],
    wells: [source.catalogId, source.behaviorId, source.type],
    stars: [source.type, source.starType],
    wrecks: [source.type, source.size],
    debris: [source.type, source.kind, source.size],
    loot: [source.type, source.kind, source.itemId],
    portals: [source.type, source.kind],
    objectives: [source.type, source.kind, source.objectiveId],
    planetoids: [source.pathType, source.type, source.variant],
    scavengers: [source.archetype, source.personality, source.type],
    enemies: [source.archetype, source.type, source.kind],
    sentries: [source.archetype, source.type, source.kind],
    fauna: [source.type, source.kind, source.species],
    waveRings: [source.kind, source.type, source.sourceWellId ? 'well-growth' : null],
  }[family] || [];
  return text(candidates.find((value) => text(value))) || family.replace(/s$/, '');
}

function idFor(family, source, index) {
  return text(source.id ?? source.clientId ?? source.objectiveId ?? source.itemId)
    || `${family.replace(/s$/, '')}-${index}`;
}

function radiusFor(family, source) {
  const explicit = finite(source.pickRadius ?? source.captureRadius ?? source.killRadius ?? source.radius);
  if (explicit !== undefined) return Math.max(0, explicit);
  if (family === 'wrecks' || family === 'debris') return SIZE_RADII[text(source.size)] || SIZE_RADII.medium;
  if (family === 'stars' || family === 'wells') return 0.06;
  if (family === 'portals') return 0.08;
  if (family === 'waveRings') return Math.max(0.02, finite(source.radius) || 0.02);
  return 0.035;
}

function compact(source) {
  const result = {};
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined && value !== null) result[key] = value;
  }
  return Object.freeze(result);
}

function contextFor(family, source) {
  switch (family) {
    case 'players': return compact({ name: text(source.name), status: text(source.status), isAI: source.isAI === true, hullType: text(source.hullType), cargoCount: finite(source.cargoCount) });
    case 'wells': return compact({ mass: finite(source.mass), growthRate: finite(source.growthRate), killRadius: finite(source.killRadius), behaviorId: text(source.behaviorId) });
    case 'stars': return compact({ mass: finite(source.mass), alive: source.alive !== false, type: text(source.type) });
    case 'wrecks': case 'debris': return compact({ state: text(source.state), alive: source.alive !== false, looted: source.looted === true, lootCount: Array.isArray(source.loot) ? source.loot.length : finite(source.lootCount), size: text(source.size), tier: finite(source.tier) });
    case 'loot': return compact({ state: text(source.state), collected: source.collected === true, kind: text(source.kind ?? source.type) });
    case 'portals': return compact({ state: text(source.state), alive: source.alive !== false, type: text(source.type), final: source.finalInhibitor === true });
    case 'objectives': return compact({ state: text(source.state ?? source.status), complete: source.complete === true, objectiveId: text(source.objectiveId) });
    case 'planetoids': return compact({ state: text(source.state), alive: source.alive !== false, pathType: text(source.pathType ?? source.type) });
    case 'scavengers': case 'enemies': return compact({ name: text(source.name ?? source.callsign), state: text(source.state), alive: source.alive !== false, faction: text(source.faction) });
    case 'sentries': return compact({ state: text(source.state), alive: source.alive !== false, wellId: text(source.wellId) });
    case 'fauna': return compact({ state: text(source.state), alive: source.alive !== false, kind: text(source.kind ?? source.type), size: finite(source.size) });
    case 'waveRings': return compact({ alive: source.alive !== false, amplitude: finite(source.amplitude), sourceWellId: text(source.sourceWellId) });
    default: return Object.freeze({});
  }
}

function identity(family, sourceValue, index) {
  const source = record(sourceValue);
  const id = idFor(family, source, index);
  const archetype = archetypeFor(family, source);
  const explicitLabel = text(source.displayLabel ?? source.label ?? source.name ?? source.callsign);
  return Object.freeze({
    key: `${family}:${id}`,
    family,
    id,
    archetype,
    displayLabel: explicitLabel || `${LABELS[family] || family} ${id}`,
    position: positionFor(family, source),
    radius: radiusFor(family, source),
    context: contextFor(family, source),
    groupKey: `${family}:${archetype}`,
    tunableContract: null,
  });
}

function systemIdentities(snapshot) {
  const projected = [];
  const inhibitor = record(snapshot.inhibitor);
  if (Object.keys(inhibitor).length > 0) {
    projected.push(Object.freeze({
      key: 'inhibitor:conductor', family: 'inhibitor', id: 'conductor', archetype: 'inhibitor',
      displayLabel: LABELS.inhibitor, position: positionFor('inhibitor', inhibitor),
      radius: Math.max(0, finite(inhibitor.radius) || 0.1),
      context: compact({ phase: finite(inhibitor.phase), waveId: text(inhibitor.waveId), kinds: Array.isArray(inhibitor.ecology?.reachedKinds) ? inhibitor.ecology.reachedKinds : [] }),
      groupKey: 'inhibitor:inhibitor', tunableContract: null,
    }));
  }
  const epoch = record(record(snapshot.world).collapseEpoch);
  if (Object.keys(epoch).length > 0) {
    const id = text(epoch.epochId) || 'current';
    projected.push(Object.freeze({
      key: `collapseEpoch:${id}`, family: 'collapseEpoch', id, archetype: 'collapse-epoch',
      displayLabel: `${LABELS.collapseEpoch} ${id}`, position: null, radius: 0,
      context: compact({ epochIndex: finite(epoch.epochIndex), scheduledTime: finite(epoch.scheduledTime), transitionCount: finite(epoch.transitionCount) }),
      groupKey: 'collapseEpoch:collapse-epoch', tunableContract: null,
    }));
  }
  return projected;
}

export function resolveBenchWorldBounds(snapshot = {}) {
  const session = record(snapshot.session);
  const world = record(snapshot.world);
  const dimensions = record(world.dimensions ?? session.dimensions);
  const width = finite(dimensions.width ?? world.worldScale ?? session.worldScale);
  const height = finite(dimensions.height ?? width);
  return width > 0 && height > 0 ? Object.freeze({ width, height }) : null;
}

export function projectBenchIdentities(snapshot = {}) {
  const safeSnapshot = record(snapshot);
  const projected = [];
  const keyCounts = new Map();
  for (const spec of FAMILY_SPECS) {
    const values = atPath(safeSnapshot, spec.path);
    for (let index = 0; index < values.length; index += 1) {
      const projectedIdentity = identity(spec.family, values[index], index);
      const occurrence = (keyCounts.get(projectedIdentity.key) || 0) + 1;
      keyCounts.set(projectedIdentity.key, occurrence);
      projected.push(occurrence === 1 ? projectedIdentity : Object.freeze({
        ...projectedIdentity,
        key: `${projectedIdentity.key}#${occurrence}`,
      }));
    }
  }
  projected.push(...systemIdentities(safeSnapshot));
  return Object.freeze(projected);
}

export const BENCH_IDENTITY_FAMILIES = Object.freeze(FAMILY_SPECS.map(({ family }) => family));
