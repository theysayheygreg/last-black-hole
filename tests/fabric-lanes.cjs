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

  await runner.run('accepted coarse current drives rich, bounded world-anchored corridors', async () => {
    assert(shader.includes('uniform sampler2D u_coarse'));
    assert(shader.includes('uniform vec2 u_worldCamera'));
    assert(shader.includes('vec2 coarseUV = fract(u_worldCamera'));
    assert(shader.includes('sampleSpatiallyFilteredAuthoritativeFlow')
      && shader.includes('vec2 stableAuthorityFlow = sampleSpatiallyFilteredAuthoritativeFlow(')
      && shader.includes('coarseUV, fieldFilterUV'),
    'The corridor must use a spatially filtered authority field at its world position, not one camera texel');
    assert(!shader.includes('cameraFlowUV'), 'The retired single camera-center vector must not return');
    assert(shader.includes('float visualBacktrace = min(u_cameraView * 0.11, 0.32);')
      && shader.includes('laneWorld -= (localLaneDir - baseLaneDir) * visualBacktrace;'),
    'Local curvature must be a bounded visual backtrace, never a new movement input');
    assert(shader.includes('vec2 laneMetric = laneWorld * vec2(screenAspect, 1.0);')
      && shader.includes('vec2 laneDirMetric = normalize(laneFlow * vec2(screenAspect, 1.0));'),
    'Corridor measurement must occur in aspect-correct display space');
    assert(shader.includes('const float laneSpacing = 1.50'));
    assert(shader.includes('const float channelHalfViewport = 0.125'));
    assert(shader.includes('float channelEnvelope = 1.0 - smoothstep('));
    assert(shader.includes('float channelBody = 1.0 - smoothstep('));
    assert(shader.includes('channelEnvelope * 0.34 + channelBody * 0.38'));
    assert(shader.includes('float mediumFilament = 1.0 - smoothstep('));
    assert(shader.includes('float fineAsciiWeave = fineThread * markAttack * markRelease * channelEnvelope;'));
    assert(shader.includes('float decorativeHistory = (sceneExcitation * 0.46 + ringSignal * 0.18)'));
    assert(shader.includes('float markLength = mix(0.13, 0.31, laneStrength)'));
    assert(shader.includes('u_time * mix(0.12, 0.90, laneStrength)'));
    assert(shader.includes('float markPhase = fract(along / markLength'));
    assert(shader.includes('smoothstep(0.01, 0.06, laneSpeed)'));
    assert(!shader.includes('43758.5453'), 'hash-noise cue must be retired');
    assert(!shader.includes('flowLight'), 'global speed-brightening cue must be retired');
  });

  await runner.run('diagnostic corridor math holds 4-5 ship widths at 0, 45, and 90 degrees', async () => {
    const cameraView = 3;
    const canvasHeight = 800;
    const halfViewport = 0.125;
    const shipDiameter = 44;
    const aspect = 1280 / 800;
    for (const degrees of [0, 45, 90]) {
      const radians = degrees * Math.PI / 180;
      const sideMetric = [-Math.sin(radians), Math.cos(radians)];
      const sideWorld = [sideMetric[0] / aspect, sideMetric[1]];
      const pixelsPerWorld = [canvasHeight * aspect / cameraView, canvasHeight / cameraView];
      const aspectCorrectWidth = 2 * cameraView * halfViewport * Math.hypot(
        sideWorld[0] * pixelsPerWorld[0],
        sideWorld[1] * pixelsPerWorld[1],
      );
      const shipWidths = aspectCorrectWidth / shipDiameter;
      assert(shipWidths >= 4 && shipWidths <= 5,
        `${degrees}deg corridor must remain 4-5 ship widths, got ${shipWidths.toFixed(2)}`);
    }
  });

  await runner.run('diagnostic material coverage, direction agreement, and filter stability stay bounded', async () => {
    const spacing = 1.5;
    const halfWidth = 3 * 0.125;
    let covered = 0;
    const samples = 12000;
    for (let index = 0; index < samples; index += 1) {
      const across = (index / samples) * spacing;
      const center = Math.floor(across / spacing + 0.5) * spacing;
      if (Math.abs(across - center) < halfWidth) covered += 1;
    }
    const materialCoverage = covered / samples;
    assert(Math.abs(materialCoverage - 0.5) < 0.01,
      `Ordinary corridor body should leave about 50% calm frame coverage, got ${(1 - materialCoverage).toFixed(3)} calm`);

    const filtered = (center, east, west, north, south) => [
      center[0] * 0.4 + (east[0] + west[0] + north[0] + south[0]) * 0.15,
      center[1] * 0.4 + (east[1] + west[1] + north[1] + south[1]) * 0.15,
    ];
    const angle = (flow) => Math.atan2(flow[1], flow[0]);
    const base = filtered([1, 0], [1, 0.08], [1, -0.08], [1, 0.03], [1, -0.03]);
    const jittered = filtered([1, 0.25], [1, 0.08], [1, -0.08], [1, 0.03], [1, -0.03]);
    assert(base[0] > 0 && jittered[0] > 0, 'Filtered direction must agree with the authority flow sign');
    assert(Math.abs(angle(base) - angle(jittered)) * 180 / Math.PI < 8,
      'The filtered direction must resist one noisy center sample');
  });

  await runner.run('lane source stays inside the existing display ABI', async () => {
    assert(fluid.includes("gl.activeTexture(gl.TEXTURE3)"));
    assert(fluid.includes('this.coarseField.read.tex'));
    assert(pass.includes('ctx.worldCameraUV'));
    assert(pass.includes('ctx.worldScale'));
    assert(main.includes('worldCameraUV: worldToGlobalFluidUV(camX, camY)'));
  });

  const allPassed = runner.summary();
  process.exit(allPassed ? 0 : 1);
}

run().catch((error) => {
  console.error('FabricLanes fatal error:', error.stack || error.message);
  process.exit(1);
});
