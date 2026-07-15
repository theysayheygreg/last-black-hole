const { spawn } = require('child_process');
const path = require('path');

const root = path.resolve(__dirname, '..');
const child = spawn(process.execPath, [
  path.join(root, 'tests', 'run-all.cjs'),
  '--lane=agent-eval',
  '--renderer=three',
  ...process.argv.slice(2),
], {
  cwd: root,
  env: { ...process.env, LBH_BROWSER_MODE: 'headed' },
  stdio: 'inherit',
});

child.on('error', (error) => {
  console.error(`Unable to start visible agent review: ${error.message}`);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  if (signal) {
    console.error(`Visible agent review stopped by ${signal}`);
    process.exit(1);
  }
  process.exit(code ?? 1);
});
