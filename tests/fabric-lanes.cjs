const fs = require('fs');
const path = require('path');
const { TestRunner, assert } = require('./helpers.cjs');

const ROOT = path.resolve(__dirname, '..');
const shader = fs.readFileSync(path.join(ROOT, 'src/render/shaders/fluid.glsl.js'), 'utf8');
const fluid = fs.readFileSync(path.join(ROOT, 'src/fluid.js'), 'utf8');
const pass = fs.readFileSync(path.join(ROOT, 'src/render/passes/fluid-display-pass.js'), 'utf8');
const main = fs.readFileSync(path.join(ROOT, 'src/main.js'), 'utf8');

async function run() {
  const runner = new TestRunner('FabricLanes');

  await runner.run('accepted coarse current drives a bounded world-anchored lane layer', async () => {
    assert(shader.includes('uniform sampler2D u_coarse'));
    assert(shader.includes('uniform vec2 u_worldCamera'));
    assert(shader.includes('vec2 coarseUV = fract(u_worldCamera'));
    assert(shader.includes('const float laneSpacing = 0.46'));
    assert(shader.includes('float markLength = mix(0.17, 0.62, laneStrength)'));
    assert(shader.includes('float laneWidth = mix(0.017, 0.021, laneStrength)'));
    assert(shader.includes('u_time * mix(0.08, 0.68, laneStrength)'));
    assert(shader.includes('float markPhase = fract(along / markLength'));
    assert(shader.includes('smoothstep(0.01, 0.06, laneSpeed)'));
    assert(!shader.includes('43758.5453'), 'hash-noise cue must be retired');
    assert(!shader.includes('flowLight'), 'global speed-brightening cue must be retired');
  });

  await runner.run('lane source stays inside the existing display ABI', async () => {
    assert(fluid.includes("gl.activeTexture(gl.TEXTURE3)"));
    assert(fluid.includes('this.coarseField.read.tex'));
    assert(pass.includes('ctx.worldCameraUV'));
    assert(pass.includes('ctx.worldScale'));
    assert(main.includes('worldCameraUV: [camX / WORLD_SCALE'));
  });

  const allPassed = runner.summary();
  process.exit(allPassed ? 0 : 1);
}

run().catch((error) => {
  console.error('FabricLanes fatal error:', error.stack || error.message);
  process.exit(1);
});
