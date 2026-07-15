const { TestRunner, assert } = require('./helpers.cjs');
const { browserLaunchArgs } = require('./browser-driver.cjs');
const fs = require('fs');
const path = require('path');

async function run() {
  const runner = new TestRunner('BrowserMode');
  const common = { viewport: { width: 1280, height: 800 }, userDataDir: '/tmp/lbh-review' };

  await runner.run('CI browser mode stays headless by default', async () => {
    assert(browserLaunchArgs({ ...common, headless: true }).includes('--headless=new'),
      'headless mode must retain the CI browser flag');
  });

  await runner.run('review browser mode opens a visible CDP-controlled window', async () => {
    const args = browserLaunchArgs({ ...common, headless: false });
    assert(!args.includes('--headless=new'), 'headed review mode must not pass a headless flag');
    assert(args.includes('--remote-debugging-port=0'), 'headed review mode must remain CDP controllable');
  });

  await runner.run('visible review command is portable across desktop shells', async () => {
    const packageJson = require('../package.json');
    assert(packageJson.scripts['test:agent-eval:visible'] === 'node scripts/run-visible-agent-eval.cjs',
      'visible review must not depend on shell-specific environment assignment');
    const source = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'run-visible-agent-eval.cjs'), 'utf8');
    assert(source.includes("LBH_BROWSER_MODE: 'headed'"), 'visible review runner must request headed Chrome');
  });

  const passed = runner.summary();
  process.exit(passed ? 0 : 1);
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
