const { assert } = require('./helpers.cjs');

function installBrowserStubs() {
  global.window = {
    innerWidth: 1280,
    innerHeight: 800,
    addEventListener() {},
  };
  global.document = {
    getElementById() { return null; },
    addEventListener() {},
  };
  global.navigator = { getGamepads: () => [] };
  global.performance = { now: () => 0 };
}

function makePad({ mapping = 'standard', axes = [0, 0, 0, 0, 0, 0], thrust = 0, brake = 0 } = {}) {
  const buttons = Array.from({ length: 18 }, () => ({ pressed: false, value: 0 }));
  buttons[6] = { pressed: brake > 0, value: brake };
  buttons[7] = { pressed: thrust > 0, value: thrust };
  return { connected: true, index: 0, mapping, axes, buttons };
}

async function run() {
  installBrowserStubs();
  const { InputManager } = await import('../src/input.js');
  let pad = makePad();
  global.navigator.getGamepads = () => [pad];
  const input = new InputManager();

  input.poll();
  assert(input.thrustIntensity === 0 && input.brakeIntensity === 0,
    `standard rest must be neutral, got thrust=${input.thrustIntensity} brake=${input.brakeIntensity}`);

  pad = makePad({ mapping: 'standard', axes: [0, 0, 0, 0, 0.8, 0.8] });
  input.poll();
  assert(input.thrustIntensity === 0 && input.brakeIntensity === 0,
    `standard pads must ignore legacy trigger axes, got thrust=${input.thrustIntensity} brake=${input.brakeIntensity}`);

  pad = makePad({ thrust: 0.8 });
  input.poll();
  assert(input.thrustIntensity === 0.8 && input.brakeIntensity === 0,
    `R2 must deliver its button value, got thrust=${input.thrustIntensity} brake=${input.brakeIntensity}`);

  pad = makePad({ brake: 0.65 });
  input.poll();
  assert(input.thrustIntensity === 0 && input.brakeIntensity === 0.65,
    `L2 must deliver its button value, got thrust=${input.thrustIntensity} brake=${input.brakeIntensity}`);

  pad = makePad();
  input.poll();
  assert(input.thrustIntensity === 0 && input.brakeIntensity === 0,
    `released triggers must be neutral, got thrust=${input.thrustIntensity} brake=${input.brakeIntensity}`);

  pad = makePad({ mapping: '', axes: [0, 0, 0, 0, -1, -1] });
  input.poll();
  assert(input.thrustIntensity === 0 && input.brakeIntensity === 0,
    `legacy rest must be neutral, got thrust=${input.thrustIntensity} brake=${input.brakeIntensity}`);

  pad = makePad({ mapping: '', axes: [0, 0, 0, 0, 0, 0.6] });
  input.poll();
  assert(input.thrustIntensity === 0.8,
    `legacy R2 axis should map from -1..1, got thrust=${input.thrustIntensity}`);

  pad = makePad({ mapping: '', axes: [0, 0, 0, 0, 0.4, -1] });
  input.poll();
  assert(input.thrustIntensity === 0 && input.brakeIntensity === 0,
    `zero-centered legacy axes must stay neutral, got thrust=${input.thrustIntensity} brake=${input.brakeIntensity}`);

  console.log('ControllerTriggerTruth: 8/8 passed');
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
