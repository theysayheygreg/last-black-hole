const assert = require('assert');
const fs = require('fs');
const path = require('path');

const mainSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
const pressStart = mainSource.indexOf('if (!inventoryOpen && slingshotNow && !_prevSlingshot)');
const pressEnd = mainSource.indexOf('\n        }', pressStart);
const pressBlock = mainSource.slice(pressStart, pressEnd);

async function run() {
  const {
    captureRemotePendingActions,
    createRemoteSessionState,
    queueRemoteConsumeSlot,
    queueRemoteExtractConfirm,
    queueRemotePulse,
    queueRemoteSlingshotEdge,
    settleRemoteInputAcknowledgement,
  } = await import(path.join(__dirname, '..', 'src/sim/remote-session-state.js'));

  assert(pressStart >= 0 && pressEnd > pressStart, 'slingshot press feedback branch must remain discoverable');
  assert(
    pressBlock.includes("!authoritySlingshot?.engaged && !authoritySlingshot?.aim")
      && pressBlock.includes('no anchor in range // move toward a ring'),
    'a missing aim anchor must keep the move-toward-ring warning',
  );
  assert(
    pressBlock.includes("authoritySlingshot?.aim?.engageEligible === false")
      && pressBlock.includes('build tangential speed / follow the ring'),
    'an in-range but ineligible anchor must explain how to become eligible',
  );
  assert(
    pressBlock.indexOf('queueRemoteSlingshotEdge(remoteSession)') > pressBlock.indexOf('showWarning'),
    'feedback must be emitted before the normal edge is queued',
  );

  const state = createRemoteSessionState();
  for (let index = 0; index < 10; index += 1) queueRemoteSlingshotEdge(state);
  assert.deepStrictEqual(state.pendingSlingshotEdges, [3, 4, 5, 6, 7, 8, 9, 10],
    'pending edge queue stays bounded while ids remain monotonic');
  queueRemotePulse(state);
  queueRemoteExtractConfirm(state);
  queueRemoteConsumeSlot(state, 0);
  const sent = captureRemotePendingActions(state);
  queueRemoteConsumeSlot(state, 1);
  settleRemoteInputAcknowledgement(state, sent, { acceptedSlingshotEdges: [3, 4] });
  assert(!state.pendingPulse && !state.pendingExtractConfirm && state.pendingConsumeSlot === 1,
    'ack settlement clears sent one-shots without clearing a newer consumable choice');
  assert.deepStrictEqual(state.pendingSlingshotEdges, [5, 6, 7, 8, 9, 10],
    'ack settlement removes only accepted slingshot edges');

  console.log('SlingshotInputFeedback: 6/6 passed');
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
