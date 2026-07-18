"use strict";

const APPLICATION_TIMINGS = new Set(["live", "next-tick", "restart"]);
const SCOPES = new Set(["type", "family", "system"]);

function assertText(value, field) {
  if (!String(value || "").trim()) throw new Error(`${field} is required`);
  return String(value).trim();
}

function validateProperty(property) {
  const normalized = {
    id: assertText(property?.id, "property.id"),
    label: assertText(property?.label, "property.label"),
    effect: assertText(property?.effect, "property.effect"),
    group: assertText(property?.group, "property.group"),
    unit: assertText(property?.unit, "property.unit"),
    scope: assertText(property?.scope, "property.scope"),
    applies: assertText(property?.applies, "property.applies"),
    drawKind: assertText(property?.drawKind, "property.drawKind"),
    reset: assertText(property?.reset, "property.reset"),
    min: Number(property?.min),
    max: Number(property?.max),
    step: Number(property?.step),
  };
  if (!SCOPES.has(normalized.scope)) throw new Error(`Unsupported scope: ${normalized.scope}`);
  if (!APPLICATION_TIMINGS.has(normalized.applies)) {
    throw new Error(`Unsupported application timing: ${normalized.applies}`);
  }
  if (![normalized.min, normalized.max, normalized.step].every(Number.isFinite)) {
    throw new Error(`Property ${normalized.id} requires finite min, max, and step`);
  }
  if (normalized.min > normalized.max || normalized.step <= 0) {
    throw new Error(`Property ${normalized.id} has an invalid range`);
  }
  return Object.freeze(normalized);
}

function createBenchAdapterRegistry() {
  const adapters = new Map();

  function register(adapter) {
    const id = assertText(adapter?.id, "adapter.id");
    if (adapters.has(id)) throw new Error(`Bench adapter already registered: ${id}`);
    const properties = new Map((adapter.properties || []).map((entry) => {
      const property = validateProperty(entry);
      return [property.id, property];
    }));
    if (properties.size === 0) throw new Error(`Bench adapter ${id} has no curated properties`);
    const normalized = Object.freeze({
      id,
      label: assertText(adapter.label, "adapter.label"),
      properties,
      apply: typeof adapter.apply === "function" ? adapter.apply : null,
      reset: typeof adapter.reset === "function" ? adapter.reset : null,
    });
    adapters.set(id, normalized);
    return normalized;
  }

  function requireProperty(adapterId, propertyId) {
    const adapter = adapters.get(String(adapterId || ""));
    if (!adapter) throw new Error(`NO TUNABLE CONTRACT YET: ${adapterId}`);
    const property = adapter.properties.get(String(propertyId || ""));
    if (!property) throw new Error(`Unsupported Bench property: ${adapterId}.${propertyId}`);
    return { adapter, property };
  }

  function describe() {
    return Array.from(adapters.values()).map((adapter) => ({
      id: adapter.id,
      label: adapter.label,
      properties: Array.from(adapter.properties.values()),
    }));
  }

  return Object.freeze({ describe, register, requireProperty });
}

module.exports = {
  createBenchAdapterRegistry,
  validateProperty,
};
