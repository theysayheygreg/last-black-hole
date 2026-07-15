// CJS wrapper around the canonical anomaly catalog manifest.
const data = require("../../src/content/anomalies.data.json");

module.exports = {
  ANOMALY_CATALOG_DATA: data,
  ANOMALY_CATALOG: data.catalog,
  ANOMALY_MAP_POLICIES: data.mapPolicies,
  ANOMALY_TUNABLE_CONTRACT: data.tunableContract,
  ANOMALY_EVENT_CONTRACTS: data.eventContracts,
  ANOMALY_COLLAPSE_EPOCH_CONTRACT: data.collapseEpochContract,
};
