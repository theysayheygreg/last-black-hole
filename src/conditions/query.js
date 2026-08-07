import { getConditionDefinition, validateConditionValue } from './registry.js';

const COMPARISONS = Object.freeze(['equals', 'gt', 'gte', 'lt', 'lte']);

function deepFreeze(value) {
  if (Array.isArray(value)) {
    value.forEach(deepFreeze);
    return Object.freeze(value);
  }
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  }
  return value;
}

function normalizeQuery(query, path = 'query') {
  if (typeof query === 'string') {
    getConditionDefinition(query);
    return { condition: query };
  }
  if (!query || typeof query !== 'object' || Array.isArray(query)) {
    throw new TypeError(`${path} must be a condition name or query object`);
  }
  const keys = Object.keys(query);
  const combinators = ['all', 'any', 'not'].filter((key) => key in query);
  if (combinators.length > 0) {
    if (combinators.length !== 1 || keys.length !== 1) {
      throw new TypeError(`${path} must contain exactly one of all, any, or not`);
    }
    const operator = combinators[0];
    if (operator === 'not') return { not: normalizeQuery(query.not, `${path}.not`) };
    if (!Array.isArray(query[operator]) || query[operator].length === 0) {
      throw new TypeError(`${path}.${operator} must be a non-empty array`);
    }
    return { [operator]: query[operator].map((child, index) => normalizeQuery(child, `${path}.${operator}[${index}]`)) };
  }
  if (typeof query.condition !== 'string') throw new TypeError(`${path}.condition must be a string`);
  const definition = getConditionDefinition(query.condition);
  const comparisons = COMPARISONS.filter((key) => key in query);
  const expectedKeys = 1 + comparisons.length;
  if (comparisons.length > 1 || keys.length !== expectedKeys) {
    throw new TypeError(`${path} may contain condition and at most one comparison`);
  }
  if (comparisons.length === 0) return { condition: definition.name };
  const comparison = comparisons[0];
  if (comparison !== 'equals' && definition.type !== 'integer' && definition.type !== 'number') {
    throw new TypeError(`${path}.${comparison} requires a numeric condition`);
  }
  validateConditionValue(definition, query[comparison], `${path}.${comparison}`);
  return { condition: definition.name, [comparison]: query[comparison] };
}

export function validateConditionQuery(query) {
  return deepFreeze(normalizeQuery(query));
}

function evaluateValidated(store, query, context) {
  if (query.all) return query.all.every((child) => evaluateValidated(store, child, context));
  if (query.any) return query.any.some((child) => evaluateValidated(store, child, context));
  if (query.not) return !evaluateValidated(store, query.not, context);
  const actual = store.read(query.condition, context);
  if ('equals' in query) return Object.is(actual, query.equals);
  if ('gt' in query) return actual > query.gt;
  if ('gte' in query) return actual >= query.gte;
  if ('lt' in query) return actual < query.lt;
  if ('lte' in query) return actual <= query.lte;
  return Boolean(actual);
}

export function evaluateConditionQuery(store, query, context) {
  return evaluateValidated(store, validateConditionQuery(query), context);
}
