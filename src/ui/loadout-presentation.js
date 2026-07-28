const COEFFICIENT_LABELS = Object.freeze({
  thrustScale: 'thrust response',
  dragScale: 'drift drag',
  currentCoupling: 'current coupling',
  wellResistScale: 'well resistance',
  noiseRadiusMultiplier: 'noise radius',
  noiseDecayMultiplier: 'noise decay',
  signalGenMult: 'noise radius',
  signalDecayMult: 'noise decay',
  controlDebuffResist: 'control resistance',
  sensorRange: 'sensor reach',
  pickupRadius: 'pickup reach',
  deltaVCapacityMult: 'propulsion capacity',
  deltaVRegenMult: 'propulsion recovery',
  deltaVBurnMult: 'propulsion cost',
  cargoSlots: 'cargo slots',
  pulseRadiusScale: 'pulse reach',
});

function signedPercent(value) {
  const delta = Math.round((Number(value) - 1) * 100);
  if (!Number.isFinite(delta) || delta === 0) return 'unchanged';
  return `${delta > 0 ? '+' : ''}${delta}%`;
}

function humanize(value) {
  return String(value || '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[-_]+/g, ' ')
    .trim();
}

export function formatItemEffects(item) {
  const effects = [];
  for (const [key, value] of Object.entries(item?.coefficients || {})) {
    const label = COEFFICIENT_LABELS[key] || humanize(key);
    if (key === 'cargoSlots') {
      effects.push(`${label} ${Number(value) >= 0 ? '+' : ''}${value}`);
    } else {
      effects.push(`${label} ${signedPercent(value)}`);
    }
  }
  if (item?.special) effects.push(humanize(item.special));
  if (effects.length > 0) return effects;
  if (item?.useDesc) return [humanize(item.useDesc)];
  if (item?.effectDesc) return [humanize(item.effectDesc)];
  return ['no measured effect'];
}

export function formatSlotIdentity(item) {
  if (item?.subcategory === 'consumable') return 'hotbar slot';
  if (item?.subcategory === 'equippable') return 'artifact slot';
  return 'cargo slot';
}

export function formatHullStats(base = {}, fitted = {}) {
  const rows = [
    ['thrust response', base.thrustScale, fitted.thrustScale, true],
    ['drift drag', base.dragScale, fitted.dragScale, true],
    ['current coupling', base.currentCoupling, fitted.currentCoupling, true],
    ['propulsion tank', base.deltaVMax, fitted.deltaVMax, false],
  ];
  return rows.map(([label, baseValue, fittedValue, percent]) => ({
    label,
    base: percent ? `${Math.round(Number(baseValue || 0) * 100)}%` : `${Math.round(Number(baseValue || 0))}`,
    fitted: percent ? `${Math.round(Number(fittedValue || 0) * 100)}%` : `${Math.round(Number(fittedValue || 0))}`,
  }));
}
