import { worldPixelScale, worldRadiusToScreen } from './coords.js';
import { UNIT_SCALE } from './content/units.js';

export const METERS_PER_SIM_UNIT = UNIT_SCALE.metersPerSimUnit;
export const DRIFTER_HULL_LENGTH_METERS = UNIT_SCALE.drifterHullLengthMeters;
export const DRIFTER_HULL_LENGTH_SIM_UNITS = UNIT_SCALE.drifterHullLengthSimUnits;
export const RULER_SCALE_BAR_METERS = UNIT_SCALE.scaleBarMeters;
export const UNIT_SCALE_STATUS = UNIT_SCALE.status;

export function simUnitsToMeters(value) {
  return Number(value || 0) * METERS_PER_SIM_UNIT;
}

export function metersToSimUnits(value) {
  return Number(value || 0) / METERS_PER_SIM_UNIT;
}

export function simVectorToMeters(vector = {}) {
  return Object.freeze({
    x: simUnitsToMeters(vector.x),
    y: simUnitsToMeters(vector.y),
  });
}

export function metersToScreenRadius(meters, canvasW, canvasH) {
  return worldRadiusToScreen(metersToSimUnits(meters), canvasW, canvasH);
}

export function metersVectorToScreen(vector = {}, canvasW, canvasH) {
  const scale = worldPixelScale(canvasW, canvasH);
  return Object.freeze({
    x: metersToSimUnits(vector.x) * scale.x,
    y: metersToSimUnits(vector.y) * scale.y,
  });
}

function decimalPlaces(value) {
  const text = String(value);
  if (text.includes('e-')) return Number(text.split('e-')[1]) || 0;
  return text.includes('.') ? text.length - text.indexOf('.') - 1 : 0;
}

export function snapToDeclaredStep(value, metadata = {}) {
  const numeric = Number(value);
  const step = Math.abs(Number(metadata.step));
  if (!Number.isFinite(numeric) || !Number.isFinite(step) || step <= 0) return numeric;
  const min = Number.isFinite(Number(metadata.min)) ? Number(metadata.min) : 0;
  const max = Number.isFinite(Number(metadata.max)) ? Number(metadata.max) : Infinity;
  const snapped = min + Math.round((numeric - min) / step) * step;
  const clamped = Math.min(max, Math.max(min, snapped));
  const precision = Math.min(12, Math.max(decimalPlaces(step), decimalPlaces(min)));
  return Number(clamped.toFixed(precision));
}

export class TunableDrawRegistry {
  constructor() {
    this.handlers = new Map();
  }

  register(contract, draw) {
    const id = String(contract?.id || '').trim();
    if (!id) throw new Error('Ruler handler id is required');
    if (this.handlers.has(id)) throw new Error(`Ruler handler already registered: ${id}`);
    if (typeof draw !== 'function') throw new Error(`Ruler handler ${id} must provide draw()`);
    const normalized = Object.freeze({
      id,
      system: String(contract.system || 'unknown'),
      kind: String(contract.kind || 'vector'),
      unit: String(contract.unit || ''),
      range: Array.isArray(contract.range) ? Object.freeze([...contract.range]) : null,
      step: Number.isFinite(Number(contract.step)) ? Number(contract.step) : null,
      startBias: String(contract.startBias || 'unresolved'),
      resolved: contract.resolved !== false,
    });
    this.handlers.set(id, Object.freeze({ contract: normalized, draw }));
    return normalized;
  }

  list() {
    return Object.freeze([...this.handlers.values()].map((entry) => entry.contract));
  }

  ids() {
    return Object.freeze([...this.handlers.keys()]);
  }

  drawAll(context) {
    const results = [];
    for (const entry of this.handlers.values()) {
      results.push(Object.freeze({
        id: entry.contract.id,
        drawn: entry.draw(context, entry.contract) !== false,
      }));
    }
    return Object.freeze(results);
  }

  assertCoverage(expectedIds) {
    const missing = expectedIds.filter((id) => !this.handlers.has(id));
    if (missing.length) throw new Error(`Missing ruler handlers: ${missing.join(', ')}`);
    return true;
  }
}
