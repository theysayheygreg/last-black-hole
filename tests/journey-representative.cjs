#!/usr/bin/env node

const { runJourney } = require('./journey/run.cjs');

runJourney('agent.salvage-noise-extract', {
  artifactRoot: process.env.LBH_JOURNEY_ARTIFACT_ROOT,
  simPort: process.env.LBH_JOURNEY_SIM_PORT,
}).then(({ receipt, receiptPath }) => {
  console.log(`${receipt.summary}\nreceipt: ${receiptPath}`);
  if (receipt.status === 'failed') process.exitCode = 1;
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
