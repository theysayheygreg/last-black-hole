const fs = require('fs');
const path = require('path');
const { TestRunner, assert } = require('./helpers.cjs');
const { MOVEMENT } = require('../scripts/content/movement.cjs');
const { SERVER_INPUT } = require('../scripts/sim/player-movement-step.cjs');

async function run() {
  const runner = new TestRunner('MovementContract');

  await runner.run('sandbox and authority consume one movement manifest', async () => {
    const manifestPath = path.join(__dirname, '..', 'src', 'content', 'movement.data.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    assert(JSON.stringify(manifest) === JSON.stringify(MOVEMENT), 'CJS movement contract drifted');

    const configSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'config.js'), 'utf8');
    assert(configSource.includes("import { MOVEMENT } from './content/movement.js'"),
      'browser CONFIG must import the shared movement contract');
    assert(configSource.includes('thrustAccel: MOVEMENT.player.thrustAccel'),
      'sandbox thrust must consume the shared authority baseline');
    assert(SERVER_INPUT.fluidCoupling === MOVEMENT.player.fluidCoupling,
      'authority fluid coupling must consume the shared movement contract');
  });

  await runner.run('packaged desktop routes gameplay through authority', async () => {
    const electronMain = fs.readFileSync(path.join(__dirname, '..', 'desktop', 'electron-main.cjs'), 'utf8');
    assert(electronMain.includes('const simServer = `http://127.0.0.1:${simPort}`'),
      'packaged desktop must derive the renderer authority URL from its embedded sim');
    assert(electronMain.includes('const params = new URLSearchParams({ simServer })'),
      'packaged desktop must pass its embedded authority URL to the renderer');
  });

  const passed = runner.summary();
  process.exit(passed ? 0 : 1);
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
