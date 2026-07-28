// Browser adapter for the canonical Inhibitor ecology population contract.
import data from './inhibitor-ecology.data.json' with { type: 'json' };

export const INHIBITOR_ECOLOGY_DATA = data;
export const INHIBITOR_TOTAL_ACTIVE_CAP = data.population.totalActiveCap;
export const INHIBITOR_KIND_CAPS = Object.freeze({ ...data.population.kindCaps });
