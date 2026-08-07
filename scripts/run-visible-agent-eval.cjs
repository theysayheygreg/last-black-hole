process.env.LBH_BROWSER_MODE = 'headed';
process.argv.splice(2, 0, 'agent.salvage-noise-extract');
require('./run-journey.cjs');
