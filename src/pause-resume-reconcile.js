/**
 * Local pause is a presentation cover over an authoritative run.
 * This state owns the one newest snapshot and the one resume decision; it is
 * not a gameplay queue and never advances or pauses server truth.
 */

export const PAUSE_LONG_AWAY_THRESHOLD_MS = 1500;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function snapshotIdentity(snapshot) {
  return {
    runId: snapshot?.runId || snapshot?.session?.runId || null,
    snapshotId: Math.max(0, Math.floor(finite(snapshot?.snapshotId))),
    tick: Math.max(0, Math.floor(finite(snapshot?.tick))),
  };
}

function eventRunId(event) {
  return event?.runId || event?.payload?.runId || null;
}

function isNewerSnapshot(next, previous) {
  if (!next) return false;
  if (!previous) return true;
  const nextIdentity = snapshotIdentity(next);
  const previousIdentity = snapshotIdentity(previous);
  if (nextIdentity.runId !== previousIdentity.runId) return true;
  if (nextIdentity.snapshotId !== previousIdentity.snapshotId) {
    return nextIdentity.snapshotId > previousIdentity.snapshotId;
  }
  return nextIdentity.tick > previousIdentity.tick;
}

export function authoritativePausePhase(snapshot, playerId) {
  if (!snapshot) return 'recovery';
  const sessionStatus = String(snapshot.session?.status || '').toLowerCase();
  const player = Array.isArray(snapshot.players)
    ? snapshot.players.find((entry) => entry?.clientId === playerId)
    : null;
  const playerStatus = String(player?.status || '').toLowerCase();

  if (playerStatus === 'dead') return 'dead';
  if (playerStatus === 'escaped' || playerStatus === 'extracted') return 'escaped';
  if (sessionStatus !== 'running') return 'recovery';
  if (!player) return 'recovery';
  if (playerStatus === 'alive') return 'playing';
  return 'recovery';
}

export function createPauseResumeState({ now = 0, snapshot = null } = {}) {
  const identity = snapshotIdentity(snapshot);
  return {
    covered: false,
    enteredAt: null,
    entryRunId: null,
    entrySnapshotId: null,
    latestSnapshot: snapshot,
    connectionOk: true,
    inputNeutralized: false,
    terminalEvent: null,
    eventWatermark: 0,
    eventRunId: identity.runId,
    ...identity,
    createdAt: Math.max(0, finite(now)),
  };
}

export function enterPause(state, { now = 0, snapshot = null } = {}) {
  const latestSnapshot = isNewerSnapshot(snapshot, state?.latestSnapshot)
    ? snapshot
    : (state?.latestSnapshot || snapshot || null);
  const identity = snapshotIdentity(latestSnapshot);
  return {
    ...(state || createPauseResumeState()),
    covered: true,
    enteredAt: Math.max(0, finite(now)),
    entryRunId: identity.runId,
    entrySnapshotId: identity.snapshotId,
    latestSnapshot,
    connectionOk: true,
    inputNeutralized: false,
    terminalEvent: null,
    eventWatermark: 0,
    eventRunId: identity.runId,
    ...identity,
  };
}

export function observePauseSnapshot(state, snapshot) {
  if (!snapshot || !isNewerSnapshot(snapshot, state?.latestSnapshot)) return state;
  const identity = snapshotIdentity(snapshot);
  const runChanged = snapshotIdentity(state?.latestSnapshot).runId !== identity.runId;
  return {
    ...state,
    latestSnapshot: snapshot,
    ...(runChanged ? {
      terminalEvent: null,
      eventWatermark: 0,
      eventRunId: identity.runId,
    } : {}),
    ...identity,
    connectionOk: true,
  };
}

export function observePauseConnection(state, connectionOk) {
  return { ...state, connectionOk: connectionOk !== false };
}

export function observePauseEvents(state, events, { clientId = null, runId = null } = {}) {
  const authorityRunId = runId || snapshotIdentity(state?.latestSnapshot).runId || null;
  const sameRun = state?.eventRunId === authorityRunId;
  const entries = (Array.isArray(events) ? events : []).filter((event) => (
    !authorityRunId || eventRunId(event) === authorityRunId
  ));
  const terminalEvents = entries.filter((event) => {
    if (event?.type !== 'run.result') return false;
    const payload = event.payload || {};
    return (!clientId || payload.clientId === clientId)
      && (!authorityRunId || eventRunId(event) === authorityRunId);
  });
  return {
    ...state,
    eventRunId: authorityRunId,
    eventWatermark: Math.max(
      sameRun ? Math.max(0, Math.floor(finite(state?.eventWatermark))) : 0,
      ...entries.map((event) => Math.max(0, Math.floor(finite(event?.seq)))),
    ),
    terminalEvent: terminalEvents.at(-1) || (sameRun ? state?.terminalEvent : null) || null,
  };
}

export function markPauseInputNeutralized(state) {
  if (state?.inputNeutralized) return state;
  return { ...(state || createPauseResumeState()), inputNeutralized: true };
}

export function reconcilePauseResume(state, {
  now = 0,
  snapshot = null,
  playerId = null,
  connectionOk = state?.connectionOk !== false,
  longAwayThresholdMs = PAUSE_LONG_AWAY_THRESHOLD_MS,
} = {}) {
  const observed = observePauseSnapshot(state || createPauseResumeState(), snapshot);
  const currentSnapshot = observed.latestSnapshot || snapshot || null;
  const enteredAt = observed.enteredAt == null ? finite(now) : observed.enteredAt;
  const awayMs = Math.max(0, finite(now) - finite(enteredAt));
  const threshold = Math.max(0, finite(longAwayThresholdMs, PAUSE_LONG_AWAY_THRESHOLD_MS));
  const identity = snapshotIdentity(currentSnapshot);
  const rematched = Boolean(
    observed.entryRunId && identity.runId && observed.entryRunId !== identity.runId,
  );
  const phase = connectionOk === false
    ? 'recovery'
    : authoritativePausePhase(currentSnapshot, playerId);

  return {
    state: {
      ...observed,
      covered: false,
      connectionOk: connectionOk !== false,
      inputNeutralized: false,
    },
    decision: {
      phase,
      snapshot: currentSnapshot,
      awayMs,
      longAway: awayMs >= threshold,
      rematched,
      discardEvents: true,
      entryRunId: observed.entryRunId,
      entrySnapshotId: observed.entrySnapshotId,
      snapshotIdentity: identity,
      terminalEvent: observed.terminalEvent,
      eventWatermark: observed.eventWatermark,
      eventRunId: observed.eventRunId,
    },
  };
}
