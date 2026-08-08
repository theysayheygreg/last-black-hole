const { spawn } = require('child_process');
const path = require('path');

const child = spawn(process.execPath, [
  path.join(__dirname, 'run-journey.cjs'),
  'agent.salvage-noise-extract',
  ...process.argv.slice(2),
], {
  cwd: path.resolve(__dirname, '..'),
  env: { ...process.env, LBH_BROWSER_MODE: 'headed' },
  stdio: 'inherit',
});
child.on('error', (error) => { console.error(error); process.exit(1); });
child.on('exit', (code, signal) => process.exit(signal ? 1 : (code ?? 1)));
