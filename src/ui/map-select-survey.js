/**
 * Player-facing Map Select survey contract.
 *
 * The authority maps keep their simulation scale and exact entity layout. This
 * module is the deliberate information boundary for the survey terminal: it
 * emits only coarse, aggregate, and uncertain facts suitable for a preview.
 */
import { getMapScaleDefinition } from '../content/map-scales.js';

export function resolveSurveyPresentation(mapOrId) {
  const id = typeof mapOrId === 'string' ? mapOrId : mapOrId?.id;
  const definition = getMapScaleDefinition(id);
  const survey = definition?.survey;
  if (!definition || !survey) return null;
  const width = definition.dimensions.width;
  const height = definition.dimensions.height;
  return {
    source: 'canonical',
    mapClass: definition.mapClass,
    label: survey.label,
    authorityCells: width,
    scale: {
      cells: width,
      label: `${width}x${height}`,
      band: survey.scaleBand,
      grid: survey.topology.grid,
    },
    topology: { ...survey.topology },
    riskBand: survey.riskBand,
    description: survey.description,
    contents: survey.contents.map((content) => ({ ...content })),
  };
}

export function resolveSurveyScalePresentation(mapOrId) {
  const presentation = resolveSurveyPresentation(mapOrId);
  return presentation ? { ...presentation.scale, authorityCells: presentation.authorityCells, source: presentation.source } : null;
}

export const LOCKED_SECTOR_REGISTRY = Object.freeze([
  Object.freeze({ id: 'sector-04', label: 'SECTOR 04', status: 'UNRESOLVED', available: false }),
  Object.freeze({ id: 'sector-05', label: 'SECTOR 05', status: 'REDACTED', available: false }),
  Object.freeze({ id: 'sector-06', label: 'SECTOR 06', status: 'SIGNAL LOST', available: false }),
]);

const SURVEY_KEYS = Object.freeze([
  'schemaVersion',
  'mapClass',
  'scale',
  'description',
  'aggregateRanges',
  'signature',
  'coarseRegions',
  'density',
  'uncertainty',
  'confidence',
  'riskBand',
  'possibleContactFamilies',
]);

const FORBIDDEN_KEY_PATTERN = /^(spawn|portal|route|path|stage|stages|anchor|anchors|wreck|wrecks|well|wells|star|stars|entity|entities|object|objects|coordinate|coordinates|position|positions|exact|layout)$/i;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function hashSeed(value) {
  const source = String(value ?? '1');
  let hash = 2166136261;
  for (let i = 0; i < source.length; i++) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createSurveyRng(seed, mapClass) {
  let state = hashSeed(`${mapClass}:${Math.max(1, Math.floor(Number(seed) || 1))}`) || 1;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function range(min, max, rng, spread = 0) {
  const shift = spread ? Math.round((rng() - 0.5) * spread) : 0;
  return { min: Math.max(0, min + shift), max: Math.max(min + shift, max + shift) };
}

function coarseRegions(registry, rng) {
  const { grid, regionCount, voidBias } = registry.topology;
  const regions = [];
  const occupied = new Set();
  const kinds = ['basin', 'interference', 'open void', 'dense mass'];
  for (let i = 0; i < regionCount; i++) {
    const span = registry.scale.cells <= 5 ? 1 + Math.floor(rng() * 2) : 1 + Math.floor(rng() * 3);
    const width = clamp(span + Math.floor(rng() * 2), 1, Math.max(1, grid - 1));
    const height = clamp(span + Math.floor(rng() * 2), 1, Math.max(1, grid - 1));
    let gridX = Math.floor(rng() * Math.max(1, grid - width + 1));
    let gridY = Math.floor(rng() * Math.max(1, grid - height + 1));
    const key = `${gridX}:${gridY}:${width}:${height}`;
    if (occupied.has(key)) {
      gridX = (gridX + i + 1) % Math.max(1, grid - width + 1);
      gridY = (gridY + i * 2 + 1) % Math.max(1, grid - height + 1);
    }
    occupied.add(`${gridX}:${gridY}:${width}:${height}`);
    const voidRegion = rng() < voidBias;
    regions.push({
      gridX,
      gridY,
      width,
      height,
      kind: voidRegion ? 'open void' : kinds[Math.floor(rng() * kinds.length) % kinds.length],
      density: Number((voidRegion ? 0.12 + rng() * 0.22 : 0.42 + rng() * 0.56).toFixed(2)),
      uncertainty: Number((0.24 + rng() * 0.58).toFixed(2)),
    });
  }
  return regions;
}

function contentFamilies(registry, aggregates) {
  return registry.contents.map((content) => {
    const contentRange = aggregates[content.rangeKey] || { min: 0, max: 0 };
    return {
      id: content.id,
      label: content.label,
      description: content.description,
      role: content.role,
      range: contentRange,
      likelihood: contentRange.max > 0 ? (contentRange.min > 0 ? 'LIKELY' : 'POSSIBLE') : 'UNCERTAIN',
    };
  });
}

function safeSignature(signature) {
  return {
    id: String(signature?.id || 'unresolved'),
    name: String(signature?.name || 'UNRESOLVED SIGNATURE'),
  };
}

function safeMapClass(registry) {
  return { id: registry.mapClass, label: registry.label };
}

function surveyAggregates(map, registry, rng) {
  const wellCount = Array.isArray(map?.wells) ? map.wells.length : 0;
  const wreckCount = Array.isArray(map?.wrecks) ? map.wrecks.length : 0;
  const starCount = Array.isArray(map?.stars) ? map.stars.length : 0;
  const scaleFactor = registry.scale.cells / 5;
  return {
    gravityWells: range(Math.max(2, Math.round(wellCount * 0.58)), Math.max(4, Math.ceil(wellCount * 1.18)), rng, Math.max(1, Math.round(scaleFactor))),
    derelictFields: range(Math.max(3, Math.round(wreckCount * 0.48)), Math.max(6, Math.ceil(wreckCount * 0.92)), rng, Math.max(1, Math.round(scaleFactor))),
    stellarContacts: range(Math.max(1, Math.round(starCount * 0.42)), Math.max(3, Math.ceil(starCount * 0.86)), rng, 1),
    possibleExits: range(1, deepExitMax(registry), rng, 1),
  };
}

function deepExitMax(registry) {
  if (registry.scale.cells >= 25) return 5;
  if (registry.scale.cells >= 15) return 4;
  return 3;
}

function sanitizeRegions(regions, limit = 32) {
  return (Array.isArray(regions) ? regions : []).slice(0, limit).map((region) => ({
    gridX: Math.max(0, Math.floor(Number(region?.gridX) || 0)),
    gridY: Math.max(0, Math.floor(Number(region?.gridY) || 0)),
    width: Math.max(1, Math.floor(Number(region?.width) || 1)),
    height: Math.max(1, Math.floor(Number(region?.height) || 1)),
    kind: String(region?.kind || 'uncertain'),
    density: clamp(Number(region?.density) || 0, 0, 1),
    uncertainty: clamp(Number(region?.uncertainty) || 0, 0, 1),
  }));
}

/**
 * Whitelist the player-facing schema before the recursive forbidden-field
 * guard. This makes the boundary resilient if an authoritative briefing is
 * accidentally passed here with extra fields in the future.
 */
export function sanitizeSurveyPreview(candidate) {
  const scale = candidate?.scale || {};
  const aggregates = candidate?.aggregateRanges || {};
  const safe = {
    schemaVersion: 1,
    mapClass: {
      id: String(candidate?.mapClass?.id || 'unknown'),
      label: String(candidate?.mapClass?.label || 'UNKNOWN SECTOR'),
    },
    scale: {
      cells: Math.max(1, Math.floor(Number(scale.cells) || 1)),
      label: String(scale.label || 'UNRESOLVED'),
      band: String(scale.band || 'UNKNOWN'),
      grid: Math.max(1, Math.floor(Number(scale.grid) || 1)),
    },
    description: String(candidate?.description || 'Survey contacts remain unresolved.'),
    aggregateRanges: {},
    signature: safeSignature(candidate?.signature),
    coarseRegions: sanitizeRegions(candidate?.coarseRegions),
    density: {
      band: String(candidate?.density?.band || 'UNCERTAIN'),
      value: clamp(Number(candidate?.density?.value) || 0, 0, 1),
    },
    uncertainty: {
      band: String(candidate?.uncertainty?.band || 'PARTIAL'),
      value: clamp(Number(candidate?.uncertainty?.value) || 0, 0, 1),
    },
    confidence: clamp(Math.round(Number(candidate?.confidence) || 0), 0, 100),
    riskBand: String(candidate?.riskBand || 'UNKNOWN'),
    possibleContactFamilies: Array.isArray(candidate?.possibleContactFamilies)
      ? candidate.possibleContactFamilies.map((family) => ({
        id: String(family?.id || 'unknown'),
        label: String(family?.label || 'UNKNOWN CONTACT'),
        description: String(family?.description || 'possible read'),
        role: String(family?.role || 'muted'),
        likelihood: String(family?.likelihood || 'UNCERTAIN'),
        range: {
          min: Math.max(0, Math.floor(Number(family?.range?.min) || 0)),
          max: Math.max(0, Math.floor(Number(family?.range?.max) || 0)),
        },
      }))
      : [],
  };
  for (const key of ['gravityWells', 'derelictFields', 'stellarContacts', 'possibleExits']) {
    safe.aggregateRanges[key] = {
      min: Math.max(0, Math.floor(Number(aggregates[key]?.min) || 0)),
      max: Math.max(0, Math.floor(Number(aggregates[key]?.max) || 0)),
    };
  }
  return safe;
}

export function surveyPreviewForbiddenFields(value, path = '') {
  const violations = [];
  if (!value || typeof value !== 'object') return violations;
  for (const [key, child] of Object.entries(value)) {
    const childPath = path ? `${path}.${key}` : key;
    if (FORBIDDEN_KEY_PATTERN.test(key)) violations.push(childPath);
    if (child && typeof child === 'object') violations.push(...surveyPreviewForbiddenFields(child, childPath));
  }
  return violations;
}

export function assertSurveyPreviewSafe(value) {
  const violations = surveyPreviewForbiddenFields(value);
  if (violations.length > 0) throw new Error(`Survey preview contains forbidden fields: ${violations.join(', ')}`);
  return value;
}

export function buildSurveyPreview(map, briefing, seed) {
  const mapClass = map?.id || briefing?.mapId || 'unknown';
  const registry = surveyScaleForMap(mapClass) || surveyScaleForMap('shallows');
  const rng = createSurveyRng(seed, registry.mapClass);
  const densityValue = clamp(registry.topology.densityBias + (rng() - 0.5) * 0.22, 0.08, 0.94);
  const uncertaintyValue = clamp(0.26 + rng() * 0.48 + registry.topology.voidBias * 0.18, 0.2, 0.9);
  const aggregates = surveyAggregates(map, registry, rng);
  const candidate = {
    mapClass: safeMapClass(registry),
    scale: registry.scale,
    description: registry.description,
    aggregateRanges: aggregates,
    signature: safeSignature(briefing?.signature),
    coarseRegions: coarseRegions(registry, rng),
    density: { band: densityValue > 0.65 ? 'DENSE' : densityValue > 0.4 ? 'MIXED' : 'SPARSE', value: Number(densityValue.toFixed(2)) },
    uncertainty: { band: uncertaintyValue > 0.62 ? 'HIGH' : uncertaintyValue > 0.42 ? 'PARTIAL' : 'LOW', value: Number(uncertaintyValue.toFixed(2)) },
    confidence: Math.round(clamp(100 - uncertaintyValue * 56 - registry.topology.voidBias * 14 + rng() * 8, 18, 86)),
    riskBand: registry.riskBand,
    possibleContactFamilies: contentFamilies(registry, aggregates),
  };
  const safe = sanitizeSurveyPreview(candidate);
  assertSurveyPreviewSafe(safe);
  return safe;
}

export function buildLockedSurveySelection(entry) {
  return {
    state: 'locked',
    entry: {
      id: String(entry?.id || 'sector-unknown'),
      label: String(entry?.label || 'SECTOR UNKNOWN'),
      status: String(entry?.status || 'WITHHELD'),
      available: false,
    },
    surveyPreview: null,
  };
}

export function buildValidSurveySelection(entry, briefing, seed) {
  return {
    state: 'valid',
    entry: {
      id: String(entry?.id || briefing?.mapId || 'unknown'),
      label: String(entry?.map?.name || briefing?.mapName || 'UNKNOWN SECTOR'),
      status: 'AVAILABLE',
      available: true,
    },
    surveyPreview: buildSurveyPreview(entry?.map, briefing, seed),
  };
}

export function surveySelectionState(entry, briefing, seed) {
  return entry?.available === false
    ? buildLockedSurveySelection(entry)
    : buildValidSurveySelection(entry, briefing, seed);
}

export function surveyScaleForMap(mapOrId) {
  return resolveSurveyPresentation(mapOrId);
}

export function surveySchemaKeys() {
  return [...SURVEY_KEYS];
}

// Authored thumbnail signatures describe each survey class, not the seeded
// entity layout. Keeping them here gives destination rows a stable identity
// without leaking authority positions through the preview boundary.
const TOPOLOGY_SIGNATURES = Object.freeze({
  shallows: Object.freeze([
    '00100',
    '01110',
    '11010',
    '01110',
    '00100',
  ]),
  expanse: Object.freeze([
    '10001',
    '01110',
    '11011',
    '01110',
    '10101',
  ]),
  'deep-field': Object.freeze([
    '11011',
    '00100',
    '10101',
    '01010',
    '11111',
  ]),
});

const CONTACT_ICONOGRAPHY = Object.freeze({
  gravity: Object.freeze({ icon: 'well-spiral', glyph: '◎' }),
  derelict: Object.freeze({ icon: 'derelict-diamond', glyph: '◇' }),
  stellar: Object.freeze({ icon: 'stellar-star', glyph: '✦' }),
  scavenger: Object.freeze({ icon: 'scavenger-skull', glyph: '♙' }),
  anomaly: Object.freeze({ icon: 'anomaly-burst', glyph: '※' }),
  exit: Object.freeze({ icon: 'aperture-ring', glyph: '◉' }),
});

export function resolveTopologySignature(mapOrId) {
  const id = typeof mapOrId === 'string' ? mapOrId : mapOrId?.id;
  const definition = getMapScaleDefinition(id);
  const rows = TOPOLOGY_SIGNATURES[id];
  if (!definition || !rows) return null;
  return {
    id: `${id}-survey-signature`,
    mapClass: definition.mapClass,
    grid: rows.length,
    rows: [...rows],
  };
}

function seedSerial(seed, mapClass) {
  const first = hashSeed(`${mapClass}:${String(seed ?? 1)}`);
  const second = hashSeed(`${first}:survey-terminal`);
  const body = `${first.toString(36)}${second.toString(36)}`.toUpperCase().padStart(12, '0').slice(-12);
  return `${body.slice(0, 4)}-${body.slice(4, 8)}-${body.slice(8, 12)}`;
}

export function projectSurveyChrome({ seed, mapClass, confidence = 0 } = {}) {
  const safeConfidence = clamp(Math.round(Number(confidence) || 0), 0, 100);
  const normalizedSeed = Math.max(1, Math.floor(Number(seed) || 1));
  return {
    terminal: 'SURVEY TERMINAL v0.3',
    seedSerial: seedSerial(seed, mapClass),
    cycle: normalizedSeed % 100,
    signal: safeConfidence >= 70 ? 'STRONG' : safeConfidence >= 40 ? 'PARTIAL' : 'WEAK',
    link: safeConfidence > 0 ? 'STABLE' : 'NO CARRIER',
    confidence: safeConfidence,
  };
}

export function projectSurveyDensity(density = {}) {
  const value = clamp(Number(density.value) || 0, 0, 1);
  return {
    band: String(density.band || 'UNCERTAIN'),
    segments: 8,
    filledSegments: Math.round(value * 8),
    legend: [
      { id: 'dense', label: 'DENSE MASS', mark: 'contour' },
      { id: 'scattered', label: 'SCATTERED', mark: 'dots' },
      { id: 'uncertain', label: 'UNCERTAIN', mark: 'broken' },
      { id: 'anomaly', label: 'ANOMALY', mark: 'burst' },
      { id: 'void', label: 'VOID', mark: 'empty' },
    ],
    gradient: { low: 'LOW', high: 'HIGH' },
    unstableZones: { label: 'UNSTABLE ZONES', mark: 'hatch' },
  };
}

export function projectSurveyContacts(families = []) {
  const source = Array.isArray(families) ? families : [];
  const largest = Math.max(1, ...source.map((family) => Number(family?.range?.max) || 0));
  return source.map((family) => {
    const min = Math.max(0, Math.floor(Number(family?.range?.min) || 0));
    const max = Math.max(min, Math.floor(Number(family?.range?.max) || 0));
    const icon = CONTACT_ICONOGRAPHY[family?.id] || { icon: 'unknown-contact', glyph: '?' };
    return {
      id: String(family?.id || 'unknown'),
      label: String(family?.label || 'UNKNOWN CONTACT'),
      role: String(family?.role || 'muted'),
      icon: icon.icon,
      glyph: icon.glyph,
      magnitude: {
        segments: 5,
        filledSegments: max > 0 ? Math.max(1, Math.ceil((((min + max) / 2) / largest) * 5)) : 0,
      },
      range: { min, max, label: `${min}–${max}` },
    };
  });
}

export function projectSurveyTerminal(preview, { seed, mapClass } = {}) {
  if (!preview) return null;
  const resolvedMapClass = mapClass || preview.mapClass?.id;
  return {
    topologySignature: resolveTopologySignature(resolvedMapClass),
    chrome: projectSurveyChrome({ seed, mapClass: resolvedMapClass, confidence: preview.confidence }),
    density: projectSurveyDensity(preview.density),
    contacts: projectSurveyContacts(preview.possibleContactFamilies),
    // Confidence is deliberately the only summary statistic. Uncertainty
    // still shapes reconstruction noise, but gets no second numeric readout.
    confidence: preview.confidence,
  };
}

function surveyNoise(seed) {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

function drawSurveyContour(ctx, cx, cy, rx, ry, seed, color, alpha = 1, dashed = false) {
  const points = 12;
  ctx.save();
  ctx.strokeStyle = color.replace(/,\s*[^,)]+\)$/, `, ${alpha})`);
  ctx.lineWidth = 1;
  if (dashed) ctx.setLineDash([4, 5]);
  ctx.beginPath();
  for (let i = 0; i <= points; i++) {
    const angle = (i / points) * Math.PI * 2;
    const wobble = 0.82 + surveyNoise(seed + i * 3.7) * 0.28;
    const x = cx + Math.cos(angle) * rx * wobble;
    const y = cy + Math.sin(angle) * ry * wobble;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.restore();
}

export function drawSurveyTopology(ctx, rect, preview, { alpha = 1, motionTime = 0, reducedMotion = false } = {}) {
  if (!preview) return;
  const plot = { x: rect.x + 24, y: rect.y + 58, w: rect.w - 48, h: rect.h - 100 };
  const grid = Math.max(1, Number(preview.scale.grid) || 1);
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.fillStyle = 'rgba(0, 4, 18, 0.58)';
  ctx.fillRect(plot.x, plot.y, plot.w, plot.h);
  ctx.strokeStyle = 'rgba(0, 226, 255, 0.08)';
  ctx.lineWidth = 1;
  for (let i = 1; i < grid; i++) {
    const gx = plot.x + (i / grid) * plot.w;
    const gy = plot.y + (i / grid) * plot.h;
    ctx.beginPath();
    ctx.moveTo(gx, plot.y); ctx.lineTo(gx, plot.y + plot.h);
    ctx.moveTo(plot.x, gy); ctx.lineTo(plot.x + plot.w, gy);
    ctx.stroke();
  }
  const coarseGrid = Math.max(1, Number(preview.scale.grid) || 1);
  for (const [index, region] of preview.coarseRegions.entries()) {
    const x = plot.x + ((region.gridX + region.width / 2) / coarseGrid) * plot.w;
    const y = plot.y + ((region.gridY + region.height / 2) / coarseGrid) * plot.h;
    const rx = Math.max(16, (region.width / coarseGrid) * plot.w * 0.44);
    const ry = Math.max(14, (region.height / coarseGrid) * plot.h * 0.44);
    const isVoid = region.kind === 'open void';
    const isInterference = region.kind === 'interference';
    const color = isVoid ? 'rgba(154, 180, 206, 0.26)' : isInterference ? 'rgba(255, 62, 181, 0.60)' : region.kind === 'dense mass' ? 'rgba(255, 185, 56, 0.62)' : 'rgba(0, 226, 255, 0.58)';
    const contourCount = isVoid ? 1 : 2 + Math.round(region.density * 3);
    if (!isVoid) {
      ctx.fillStyle = color.replace(/,\s*[^,)]+\)$/, ', 0.08)');
      ctx.beginPath();
      ctx.moveTo(x - rx, y);
      for (let step = 1; step <= 12; step++) {
        const angle = (step / 12) * Math.PI * 2;
        const wobble = 0.82 + surveyNoise(index * 13 + step) * 0.28;
        ctx.lineTo(x + Math.cos(angle) * rx * wobble, y + Math.sin(angle) * ry * wobble);
      }
      ctx.fill();
    }
    for (let ring = 0; ring < contourCount; ring++) {
      const scale = 1 - ring * 0.17;
      drawSurveyContour(ctx, x, y, rx * scale, ry * scale, index * 17 + ring, color, isVoid ? 0.26 : 0.66 - ring * 0.1, isVoid || isInterference);
    }
    if (isInterference) {
      for (let mark = 0; mark < 4; mark++) {
        const offsetX = (surveyNoise(index * 7 + mark) - 0.5) * rx * 1.4;
        const offsetY = (surveyNoise(index * 11 + mark) - 0.5) * ry * 1.4;
        ctx.fillStyle = 'rgba(255, 62, 181, 0.54)';
        ctx.fillRect(x + offsetX, y + offsetY, 18 + mark * 7, 2);
      }
    }
  }
  const uncertaintyBars = Math.round(preview.uncertainty.value * 10);
  for (let i = 0; i < uncertaintyBars; i++) {
    const bandX = plot.x + ((i * 37) % 100) / 100 * plot.w;
    const bandY = plot.y + ((i * 61) % 100) / 100 * plot.h;
    ctx.fillStyle = 'rgba(234, 247, 255, 0.14)';
    ctx.fillRect(bandX, bandY, 18 + (i % 3) * 8, 2);
  }
  if (!reducedMotion) {
    const scanY = plot.y + ((motionTime * 0.34) % 1) * plot.h;
    ctx.fillStyle = 'rgba(0, 226, 255, 0.12)';
    ctx.fillRect(plot.x, scanY, plot.w, 2);
  }
  ctx.restore();
}

export function drawLockedSurveyTopology(ctx, rect, { alpha = 1, motionTime = 0, reducedMotion = false } = {}) {
  const plot = { x: rect.x + 22, y: rect.y + 54, w: rect.w - 44, h: rect.h - 92 };
  const phase = reducedMotion ? 0 : Math.floor(motionTime * 8);
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.fillStyle = 'rgba(0, 4, 18, 0.72)';
  ctx.fillRect(plot.x, plot.y, plot.w, plot.h);
  for (let y = 0; y < 14; y++) {
    for (let x = 0; x < 22; x++) {
      if ((x * 17 + y * 31 + phase) % 5 > 1) continue;
      ctx.fillStyle = (x + y + phase) % 7 === 0 ? 'rgba(255, 62, 181, 0.72)' : 'rgba(0, 226, 255, 0.44)';
      ctx.fillRect(plot.x + x * plot.w / 22, plot.y + y * plot.h / 14, 2, 2);
    }
  }
  for (let i = 0; i < 7; i++) {
    const x = plot.x + ((i * 43 + phase * 11) % 100) / 100 * plot.w;
    const y = plot.y + ((i * 29 + phase * 7) % 100) / 100 * plot.h;
    ctx.fillStyle = 'rgba(255, 51, 54, 0.72)';
    ctx.fillRect(x, y, 48 + (i % 3) * 22, 5);
  }
  ctx.strokeStyle = 'rgba(255, 51, 54, 0.86)';
  ctx.lineWidth = 2;
  ctx.strokeRect(plot.x + plot.w * 0.42, plot.y + plot.h * 0.45, plot.w * 0.16, plot.h * 0.12);
  ctx.fillStyle = 'rgba(255, 51, 54, 0.96)';
  ctx.font = '700 22px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('ACCESS DENIED', plot.x + plot.w / 2, plot.y + plot.h * 0.66);
  ctx.font = '700 12px monospace';
  ctx.fillText('SIGNAL UNRESOLVED', plot.x + plot.w / 2, plot.y + plot.h * 0.70);
  ctx.restore();
}
