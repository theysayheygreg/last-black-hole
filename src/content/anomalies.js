// Canonical anomaly catalog manifest. The authority wrapper loads the same
// JSON so catalog identity and deferred behavior gates cannot drift.
import data from './anomalies.data.json' with { type: 'json' };

export const ANOMALY_CATALOG_DATA = data;
export const ANOMALY_CATALOG = data.catalog;
export const ANOMALY_MAP_POLICIES = data.mapPolicies;
export const ANOMALY_TUNABLE_CONTRACT = data.tunableContract;
