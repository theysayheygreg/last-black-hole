const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { normalizeInputMessage } = require('../scripts/sim-protocol.cjs');
const { resolveAuthorityApproachTarget } = require('../scripts/sim/approach-target.cjs');

async function run() {
  const { SimClient } = await import(pathToFileURL(
    path.join(__dirname, '..', 'src', 'sim', 'sim-client.js'),
  ).href);
  const { resolveExplicitSalvageApproachSelection, selectExplicitPortalApproachTarget } = await import(pathToFileURL(
    path.join(__dirname, '..', 'src', 'sim', 'explicit-approach-intent.js'),
  ).href);
  const snapshot = {
    world: {
      portals: [
        { id: 'portal-far', wx: 1.8, wy: 0.3, alive: true },
        { id: 'portal-final', wx: 0.7, wy: 0.3, alive: true },
      ],
      wrecks: [
        { id: 'wreck-far', wx: 1.4, wy: 0.3, alive: true },
        { id: 'wreck-near', wx: 0.4, wy: 0.3, alive: true },
      ],
    },
  };
  const human = { wx: 0.2, wy: 0.3 };
  assert.strictEqual(selectExplicitPortalApproachTarget(snapshot, human, false), null,
    'free flight must not infer a target without the extraction action');
  assert.strictEqual(selectExplicitPortalApproachTarget(snapshot, human, true), 'portal-final',
    'held extraction intent must choose the nearest live authority-projected portal');
  const selectedWreck = resolveExplicitSalvageApproachSelection(snapshot, human, null, true);
  assert.strictEqual(selectedWreck.id, 'wreck-near', 'first target press selects the nearest live wreck');
  assert.strictEqual(resolveExplicitSalvageApproachSelection(snapshot, human, selectedWreck.id, false).id, 'wreck-near',
    'selection persists without another product input edge');
  assert.strictEqual(resolveExplicitSalvageApproachSelection(snapshot, human, selectedWreck.id, true).id, 'wreck-far',
    'subsequent target presses cycle nearest-first');
  assert.strictEqual(resolveExplicitSalvageApproachSelection(snapshot, human, 'wreck-far', true).id, null,
    'target cycle ends with an explicit clear state');
  assert.strictEqual(resolveExplicitSalvageApproachSelection({ world: { wrecks: [] } }, human, 'wreck-near', false).id, null,
    'missing or looted wrecks invalidate client selection immediately');
  const client = new SimClient('http://movement.invalid');
  client.commandCredential = 'movement-test-credential';
  client.authorityRunId = 'movement-test-run';
  let sentBody = null;
  client._json = async (_route, options) => {
    sentBody = JSON.parse(options.body);
    return { acceptedSeq: sentBody.seq };
  };
  await client.sendInput({
    moveX: 1,
    moveY: 0,
    thrust: 0.6,
    brake: 0,
    approachTargetId: 'portal-final',
  });
  const normalized = normalizeInputMessage(sentBody);
  assert.strictEqual(normalized.approachTargetId, 'portal-final',
    'client and protocol must preserve only the explicit target identity');
  assert(!('targetWX' in normalized) && !('targetRadius' in normalized),
    'the client must not supply target coordinates or interaction radius');

  const player = { ...human, brain: { pickupRadius: 1.5 } };
  const resolvedPortal = resolveAuthorityApproachTarget({
    player,
    targetId: normalized.approachTargetId,
    wrecks: [],
    portals: [{ id: 'portal-final', wx: 0.7, wy: 0.3, available: true }],
    worldScale: 3,
    worldDistance: (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay),
    pickupRadiusForPlayer: () => 0.12,
    portalCaptureRadius: () => 0.09,
    isPortalAvailable: (portal) => portal.available,
  });
  assert(resolvedPortal.explicit && resolvedPortal.id === 'portal-final'
    && resolvedPortal.kind === 'portal' && Math.abs(resolvedPortal.distance - 0.5) < 1e-12
    && resolvedPortal.radius === 0.09,
  'authority must resolve live target geometry from the ID');

  const resolvedWreck = resolveAuthorityApproachTarget({
    player,
    targetId: 'wreck-live',
    wrecks: [{ id: 'wreck-live', wx: 0.25, wy: 0.3 }],
    portals: [],
    worldScale: 3,
    worldDistance: (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay),
    pickupRadiusForPlayer: (owner) => 0.08 * owner.brain.pickupRadius,
    portalCaptureRadius: () => 0.09,
    isPortalAvailable: () => false,
  });
  assert.strictEqual(resolvedWreck.radius, 0.12,
    'authority must retain the existing hull/item-scaled salvage radius');

  const mainSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  assert(mainSource.includes('selectExplicitPortalApproachTarget('),
    'ordinary remote extraction input must forward its explicit portal selection');
  assert(mainSource.includes('resolveExplicitSalvageApproachSelection(')
    && mainSource.includes('portalApproachTargetId || selectedSalvageTargetId'),
  'ordinary product input must own salvage selection and forward only its authority target ID');
  const inputSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'input.js'), 'utf8');
  const bindingSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui', 'input-bindings.js'), 'utf8');
  assert(inputSource.includes("this._keys['KeyT']") && inputSource.includes('this._mouse.middle')
    && bindingSource.includes('target: [11]'),
  'keyboard, middle mouse, and R3 must share the target action');
  const remoteLoop = mainSource.slice(
    mainSource.indexOf('    if (remoteSession.active) {', mainSource.indexOf('function gameLoop')),
    mainSource.indexOf("      } else if (gamePhase === 'dead')", mainSource.indexOf('function gameLoop')),
  );
  const authorityDeclaration = remoteLoop.indexOf('const authorityPlayer = remoteSession.snapshot?.players');
  const firstAuthorityUse = remoteLoop.indexOf('authorityPlayer?.slingshot');
  const targetAuthorityUse = remoteLoop.indexOf('selectExplicitPortalApproachTarget(\n            remoteSession.snapshot,\n            authorityPlayer,');
  assert(authorityDeclaration >= 0 && firstAuthorityUse > authorityDeclaration
    && targetAuthorityUse > authorityDeclaration,
  'remote game loop must bind the snapshot-local authority player before every input use');
  const runtimeSource = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'sim-runtime.cjs'), 'utf8');
  assert(runtimeSource.includes('player.lastInput.approachTargetId = ai.goal'),
    'AI players must provide the same explicit target identity vocabulary');
  assert(runtimeSource.includes('approachTarget: playerApproachTarget(player)'),
    'authority movement must consume the resolved target facts');

  console.log('MovementInputPath: human, AI, and controller target vocabulary PASS');
}

run().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
