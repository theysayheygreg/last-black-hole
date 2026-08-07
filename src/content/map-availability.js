import { evaluateConditionQuery } from '../conditions/query.js';
import { MAP_SCALE_REGISTRY, PLAYABLE_MAP_IDS } from './map-scales.js';

/**
 * Content gates are declared on maps and evaluated by the condition store.
 * This module owns no progression state and deliberately has no map-specific
 * branching: new maps provide an unlockCondition in the same shape.
 */
export function mapAvailabilityFor(definition, conditionStore, context) {
  if (!definition?.unlockCondition) return true;
  if (!conditionStore) {
    throw new TypeError(`Map ${definition.mapId} requires a condition store to evaluate availability`);
  }
  if (typeof conditionStore.evaluate === 'function') {
    return Boolean(conditionStore.evaluate(definition.unlockCondition, context));
  }
  return Boolean(evaluateConditionQuery(conditionStore, definition.unlockCondition, context));
}

export function listPlayableMapAvailability(conditionStore, context) {
  return Object.freeze(PLAYABLE_MAP_IDS.map((mapId) => {
    const definition = MAP_SCALE_REGISTRY[mapId];
    return Object.freeze({
      mapId,
      available: mapAvailabilityFor(definition, conditionStore, context),
      unlockCondition: definition.unlockCondition,
    });
  }));
}
