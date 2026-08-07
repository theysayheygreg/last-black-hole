#!/usr/bin/env node

const { runJourney } = require('../tests/journey/run.cjs');

const id = process.argv[2] || 'representative-salvage-extract';
runJourney(id, {
  artifactRoot: process.env.LBH_JOURNEY_ARTIFACT_ROOT,
  simPort: process.env.LBH_JOURNEY_SIM_PORT,
}).then(({ receipt, receiptPath }) => {
  console.log(`${receipt.summary}\nreceipt: ${receiptPath}`);
  if (receipt.status === 'failed') process.exitCode = 1;
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
