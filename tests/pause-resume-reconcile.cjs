const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const mainSource = fs.readFileSync(path.join(ROOT, 'src/main.js'), 'utf8');
const inputSource = fs.readFileSync(path.join(ROOT, 'src/input.js'), 'utf8');

(async () => {
  const reconcile = await import(path.join(ROOT, 'src/pause-resume-reconcile.js'));
  const remoteState = await import(path.join(ROOT, 'src/sim/remote-session-state.js'));
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
  const {
    beginRemoteSession,
    clearRemotePendingActions,
    createRemoteSessionState,
    resetRemoteAfterLeave,
    resetRemoteAfterLaunchFailure,
    resetRemoteForLocalGame,
    resetRemoteForRestart,
  } = remoteState;
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
  check(coveredEvents.eventRunId === 'run-a', 'covered event cache records its authority run');

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
  const runBAlive = reconcilePauseResume(coveredEvents, {
    now: 200,
    snapshot: alive('run-b', 1, 1),
    playerId: 'pilot',
  });
  check(runBAlive.decision.phase === 'playing', 'run-a terminal cannot poison run-b alive truth');
  check(runBAlive.decision.terminalEvent === null, 'run change clears the prior terminal event');
  check(runBAlive.decision.eventWatermark === 0 && runBAlive.decision.eventRunId === 'run-b', 'run change resets and re-scopes the event watermark');
  const runBDeadSnapshot = {
    ...alive('run-b', 2, 2),
    players: [{ clientId: 'pilot', status: 'dead' }],
  };
  const runBDead = reconcilePauseResume(coveredEvents, {
    now: 200,
    snapshot: runBDeadSnapshot,
    playerId: 'pilot',
  });
  check(runBDead.decision.phase === 'dead' && runBDead.decision.terminalEvent === null, 'run-b dead truth routes without run-a result data');
  const runBEscapedSnapshot = {
    ...alive('run-b', 3, 3),
    players: [{ clientId: 'pilot', status: 'escaped' }],
  };
  const runBEscaped = reconcilePauseResume(coveredEvents, {
    now: 200,
    snapshot: runBEscapedSnapshot,
    playerId: 'pilot',
  });
  check(runBEscaped.decision.phase === 'escaped' && runBEscaped.decision.terminalEvent === null, 'run-b escaped truth routes without run-a result data');
  const runBEvents = observePauseEvents(observePauseSnapshot(coveredEvents, runBDeadSnapshot), [
    { seq: 2, runId: 'run-a', type: 'run.result', payload: { clientId: 'pilot', runId: 'run-a', outcome: 'dead' } },
    { seq: 3, runId: 'run-b', type: 'run.result', payload: { clientId: 'pilot', runId: 'run-b', outcome: 'dead' } },
  ], { clientId: 'pilot', runId: 'run-b' });
  const currentRunTerminal = reconcilePauseResume(runBEvents, {
    now: 200,
    snapshot: runBDeadSnapshot,
    playerId: 'pilot',
  });
  check(currentRunTerminal.decision.terminalEvent?.payload?.runId === 'run-b', 'current-run terminal result remains eligible on resume');
  check(currentRunTerminal.decision.eventWatermark === 3, 'current-run watermark excludes prior-run events');
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

  const dirtyRemoteState = () => Object.assign(createRemoteSessionState(), {
    active: true,
    mapId: 'deep-field',
    snapshot: { snapshotId: 9 },
    authoritativeField: { tick: 9 },
    players: [{ clientId: 'pilot' }],
    lastEventSeq: 9,
    inputRequestInFlight: true,
    snapshotRequestInFlight: true,
    inventoryRequestInFlight: true,
    health: { ok: true },
    healthRequestInFlight: true,
    healthLastFetchedAt: 42,
    pendingPulse: true,
    pendingExtractConfirm: true,
    pendingConsumeSlot: 1,
    pendingSlingshotEdges: [7],
    nextSlingshotEdgeId: 8,
    presentation: { wx: 1 },
    pauseNeutralizationInFlight: true,
  });
  const launchFailure = dirtyRemoteState();
  resetRemoteAfterLaunchFailure(launchFailure);
  check(!launchFailure.active && launchFailure.mapId === null && launchFailure.snapshot === null
    && launchFailure.authoritativeField === null && launchFailure.players.length === 0
    && launchFailure.health === null && !launchFailure.pendingExtractConfirm
    && launchFailure.pendingSlingshotEdges.length === 0 && launchFailure.nextSlingshotEdgeId === 1
    && launchFailure.presentation === null,
  'failed launch clears only authority identity and presentation caches');
  check(launchFailure.pendingPulse && launchFailure.pendingConsumeSlot === 1
    && launchFailure.lastEventSeq === 9 && launchFailure.inputRequestInFlight
    && launchFailure.healthLastFetchedAt === 42 && launchFailure.pauseNeutralizationInFlight,
  'failed launch preserves in-flight and unsent state outside its legacy boundary');

  const localStart = dirtyRemoteState();
  resetRemoteForLocalGame(localStart);
  check(!localStart.active && localStart.players.length === 1 && localStart.health?.ok
    && localStart.lastEventSeq === 0 && !localStart.inputRequestInFlight
    && !localStart.pendingPulse && localStart.pendingSlingshotEdges.length === 0
    && localStart.nextSlingshotEdgeId === 1 && !localStart.pauseNeutralizationInFlight,
  'local start preserves remote player and health caches while clearing authority input state');

  const remoteStart = dirtyRemoteState();
  beginRemoteSession(remoteStart, 'shallows');
  check(remoteStart.active && remoteStart.mapId === 'shallows' && remoteStart.snapshot === null
    && remoteStart.authoritativeField === null && remoteStart.players.length === 0
    && remoteStart.health?.ok && remoteStart.healthRequestInFlight
    && !remoteStart.pendingPulse && remoteStart.nextSlingshotEdgeId === 1,
  'remote start keeps freshly fetched health while clearing run presentation');

  const left = dirtyRemoteState();
  resetRemoteAfterLeave(left);
  check(!left.active && left.health === null && left.authoritativeField?.tick === 9
    && left.healthRequestInFlight && left.healthLastFetchedAt === 42
    && left.lastEventSeq === 0 && !left.inputRequestInFlight && !left.pendingPulse,
  'leave clears session health but preserves field and health-request timing');

  const restarted = dirtyRemoteState();
  resetRemoteForRestart(restarted);
  check(restarted.active && restarted.mapId === 'deep-field' && restarted.snapshot?.snapshotId === 9
    && restarted.authoritativeField?.tick === 9 && restarted.health?.ok
    && restarted.pauseNeutralizationInFlight && restarted.players.length === 0
    && restarted.lastEventSeq === 0 && !restarted.inputRequestInFlight
    && restarted.pendingSlingshotEdges.length === 0 && restarted.nextSlingshotEdgeId === 1,
  'restart preserves run caches and pause request state while clearing player input state');

  const pauseInput = dirtyRemoteState();
  clearRemotePendingActions(pauseInput);
  check(!pauseInput.pendingPulse && !pauseInput.pendingExtractConfirm
    && pauseInput.pendingConsumeSlot === null && pauseInput.pendingSlingshotEdges.length === 0
    && pauseInput.nextSlingshotEdgeId === 8,
  'pause clears unsent actions without rewinding the edge id sequence');

  check(inputSource.includes('neutralizeForPause()'), 'input exposes one pause neutralization operation');
  check(mainSource.includes('const localSandboxPaused = gamePhase === \'paused\' && !remoteSession.active;'), 'local debug freeze remains separate');
  check(mainSource.includes('requestRemoteSnapshot();'), 'remote snapshot intake remains live under pause');
  check(mainSource.includes('applyCoveredTerminalEvents(decision);'), 'resume applies only current terminal result events');
  check(mainSource.includes('decision?.eventRunId !== resumedRunId'), 'resume rejects a terminal cache from another run');
  check(mainSource.includes('terminalRunId === resumedRunId'), 'resume applies terminal events only to their snapshot run');
  check(mainSource.includes('fluid?.clear();') && mainSource.includes('setFluidCamera(camX, camY);'), 'long resume resets fluid anchor with camera snap');
  check(mainSource.includes('WORLD CONTINUES') && mainSource.includes('awaySeconds'), 'pause panel exposes live authority and elapsed-away status');
  check(mainSource.includes("sampleTerminalWindow(uiMotionTimer") && mainSource.includes('reducedMotion: motion.reducedMotion'), 'pause and recovery surfaces honor reduced motion');
  check(mainSource.includes("actionDescriptor('back', currentPromptOptions())"), 'pause actions use centralized Deck-safe glyph descriptors');

  console.log(`PauseResume ${passed}/${total} passed.`);
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
