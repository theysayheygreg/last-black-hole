const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const mainSource = fs.readFileSync(path.join(ROOT, 'src/main.js'), 'utf8');
const inputSource = fs.readFileSync(path.join(ROOT, 'src/input.js'), 'utf8');

(async () => {
  const reconcile = await import(path.join(ROOT, 'src/pause-resume-reconcile.js'));
  const {
    PAUSE_LONG_AWAY_THRESHOLD_MS,
    authoritativePausePhase,
    createPauseResumeState,
    enterPause,
    markPauseInputNeutralized,
    observePauseConnection,
    observePauseEvents,
    observePauseSnapshot,
    reconcilePauseResume,
  } = reconcile;
  let passed = 0;
  let total = 0;
  function check(condition, message) {
    total += 1;
    assert(condition, message);
    passed += 1;
  }

  const alive = (runId = 'run-a', snapshotId = 1, tick = snapshotId) => ({
    runId,
    snapshotId,
    tick,
    simTime: tick / 10,
    session: { runId, status: 'running' },
    players: [{ clientId: 'pilot', status: 'alive', wx: tick / 10, wy: 0.2, vx: 0.1, vy: 0 }],
  });

  check(PAUSE_LONG_AWAY_THRESHOLD_MS === 1500, 'long-away threshold must be named and stable');
  check(authoritativePausePhase(alive(), 'pilot') === 'playing', 'alive authority derives playing');
  check(authoritativePausePhase({ ...alive(), players: [{ clientId: 'pilot', status: 'dead' }] }, 'pilot') === 'dead', 'dead authority derives result');
  check(authoritativePausePhase({ ...alive(), players: [{ clientId: 'pilot', status: 'escaped' }] }, 'pilot') === 'escaped', 'extracted authority derives result');
  check(authoritativePausePhase({ ...alive(), session: { runId: 'run-a', status: 'ended' } }, 'pilot') === 'recovery', 'terminal session derives recovery');
  check(authoritativePausePhase(alive(), 'other') === 'recovery', 'missing local player derives recovery');

  const initial = createPauseResumeState({ now: 10, snapshot: alive() });
  const entered = enterPause(initial, { now: 100, snapshot: alive('run-a', 2, 2) });
  check(entered.covered === true, 'pause entry covers presentation');
  check(entered.enteredAt === 100, 'pause entry records wall time');
  check(entered.entryRunId === 'run-a' && entered.entrySnapshotId === 2, 'pause entry records authority identity');
  const newer = alive('run-a', 3, 3);
  const observed = observePauseSnapshot(entered, newer);
  check(observed.latestSnapshot === newer, 'newest snapshot replaces covered presentation');
  check(observePauseSnapshot(observed, alive('run-a', 2, 2)) === observed, 'older snapshots are discarded');
  const disconnected = observePauseConnection(observed, false);
  check(disconnected.connectionOk === false, 'covered connection state is tracked');
  check(markPauseInputNeutralized(markPauseInputNeutralized(disconnected)).inputNeutralized === true, 'input neutralization is idempotent');
  const coveredEvents = observePauseEvents(entered, [
    { seq: 7, type: 'inhibitor.wake', payload: {} },
    { seq: 8, type: 'run.result', payload: { clientId: 'pilot', runId: 'run-a', outcome: 'dead' } },
  ], { clientId: 'pilot', runId: 'run-a' });
  check(coveredEvents.terminalEvent?.payload?.outcome === 'dead', 'covered events retain only the current terminal result');
  check(coveredEvents.eventWatermark === 8, 'covered event intake advances a discard watermark');

  const short = reconcilePauseResume(coveredEvents, { now: 900, snapshot: newer, playerId: 'pilot' });
  check(short.decision.awayMs === 800, 'short resume reports elapsed-away wall time');
  check(short.decision.longAway === false, 'short resume preserves ordinary follow');
  check(short.decision.phase === 'playing', 'short resume follows live authority');
  check(short.decision.discardEvents === true, 'resume discards intermediate event presentation');
  check(short.decision.terminalEvent?.payload?.outcome === 'dead', 'resume carries the terminal result without replaying warnings');
  check(short.state.covered === false, 'resume closes the command cover');

  const long = reconcilePauseResume(entered, { now: 1800, snapshot: newer, playerId: 'pilot' });
  check(long.decision.longAway === true, 'long resume crosses the named threshold');
  check(long.decision.snapshot === newer, 'long resume uses newest truth atomically');
  const rematched = reconcilePauseResume(entered, { now: 200, snapshot: alive('run-b', 1, 1), playerId: 'pilot' });
  check(rematched.decision.rematched === true, 'run identity change is explicit');
  const terminal = reconcilePauseResume(entered, {
    now: 200,
    snapshot: { ...alive('run-a', 4, 4), session: { runId: 'run-a', status: 'ended' } },
    playerId: 'pilot',
  });
  check(terminal.decision.phase === 'recovery', 'terminal covered truth routes to recovery');
  const noSnapshot = reconcilePauseResume(enterPause(createPauseResumeState(), { now: 100, snapshot: null }), {
    now: 200,
    snapshot: null,
    playerId: 'pilot',
  });
  check(noSnapshot.decision.phase === 'recovery', 'missing authoritative truth routes to recovery');
  const failedConnection = reconcilePauseResume(observed, { now: 900, snapshot: newer, playerId: 'pilot', connectionOk: false });
  check(failedConnection.decision.phase === 'recovery', 'disconnect while covered routes to recovery');

  check(inputSource.includes('neutralizeForPause()'), 'input exposes one pause neutralization operation');
  check(mainSource.includes('const localSandboxPaused = gamePhase === \'paused\' && !remoteAuthorityActive;'), 'local debug freeze remains separate');
  check(mainSource.includes('requestRemoteSnapshot();'), 'remote snapshot intake remains live under pause');
  check(mainSource.includes('applyCoveredTerminalEvents(decision);'), 'resume applies only current terminal result events');
  check(mainSource.includes('fluid?.clear();') && mainSource.includes('setFluidCamera(camX, camY);'), 'long resume resets fluid anchor with camera snap');
  check(mainSource.includes('WORLD CONTINUES') && mainSource.includes('awaySeconds'), 'pause panel exposes live authority and elapsed-away status');
  check(mainSource.includes("sampleTerminalWindow(uiMotionTimer") && mainSource.includes('reducedMotion: motion.reducedMotion'), 'pause and recovery surfaces honor reduced motion');
  check(mainSource.includes("actionDescriptor('back', currentPromptOptions())"), 'pause actions use centralized Deck-safe glyph descriptors');
  for (const field of ['remotePendingPulse', 'remotePendingExtractConfirm', 'remotePendingConsumeSlot', 'remotePendingSlingshotEdges']) {
    check(mainSource.includes(`clearRemotePendingActions`) && mainSource.includes(field), `${field} is cleared on pause entry`);
  }

  console.log(`PauseResume ${passed}/${total} passed.`);
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
