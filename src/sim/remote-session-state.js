const MAX_PENDING_SLINGSHOT_EDGES = 8;

function resetInputRequests(state) {
  Object.assign(state, {
    inputRequestInFlight: false, snapshotRequestInFlight: false,
    inventoryRequestInFlight: false,
  });
}

function resetPendingInput(state) {
  Object.assign(state, {
    pendingPulse: false, pendingExtractConfirm: false,
    pendingConsumeSlot: null, pendingSlingshotEdges: [],
  });
}

function resetPendingInputSequence(state) {
  resetPendingInput(state);
  state.nextSlingshotEdgeId = 1;
}

export function createRemoteSessionState() {
  return {
    active: false, mapId: null, snapshot: null,
    authoritativeField: null, players: [],
    lastEventSeq: 0,
    inputRequestInFlight: false, snapshotRequestInFlight: false,
    inventoryRequestInFlight: false,
    health: null, healthRequestInFlight: false,
    healthLastFetchedAt: 0,
    pendingPulse: false, pendingExtractConfirm: false,
    pendingConsumeSlot: null, pendingSlingshotEdges: [],
    nextSlingshotEdgeId: 1,
    presentation: null, pauseNeutralizationInFlight: false,
  };
}

// These boundaries deliberately invalidate different caches. Keep them named
// instead of folding them into an options-driven reset that hides lifecycle.
export function resetRemoteAfterLaunchFailure(state) {
  Object.assign(state, {
    active: false, mapId: null, snapshot: null,
    authoritativeField: null, players: [], health: null,
    pendingExtractConfirm: false,
    pendingSlingshotEdges: [], nextSlingshotEdgeId: 1,
    presentation: null,
  });
}

export function resetRemoteForLocalGame(state) {
  Object.assign(state, {
    pauseNeutralizationInFlight: false, active: false,
    mapId: null, snapshot: null, authoritativeField: null,
    lastEventSeq: 0,
    presentation: null,
  });
  resetInputRequests(state);
  resetPendingInputSequence(state);
}

export function beginRemoteSession(state, mapId) {
  Object.assign(state, {
    active: true, pauseNeutralizationInFlight: false,
    authoritativeField: null, mapId, snapshot: null, players: [],
    lastEventSeq: 0,
    presentation: null,
  });
  resetInputRequests(state);
  resetPendingInputSequence(state);
}

export function resetRemoteAfterLeave(state) {
  Object.assign(state, {
    active: false, pauseNeutralizationInFlight: false,
    mapId: null, snapshot: null, players: [], health: null,
    lastEventSeq: 0,
    presentation: null,
  });
  resetInputRequests(state);
  resetPendingInputSequence(state);
}

export function resetRemoteForRestart(state) {
  Object.assign(state, {
    active: true, players: [], lastEventSeq: 0, presentation: null,
  });
  resetInputRequests(state);
  resetPendingInputSequence(state);
}

export function clearRemotePendingActions(state) { resetPendingInput(state); }

export function queueRemotePulse(state) { state.pendingPulse = true; }

export function queueRemoteExtractConfirm(state) { state.pendingExtractConfirm = true; }

export function queueRemoteConsumeSlot(state, slot) { state.pendingConsumeSlot = slot; }

export function queueRemoteSlingshotEdge(state) {
  const edgeId = state.nextSlingshotEdgeId++;
  state.pendingSlingshotEdges.push(edgeId);
  if (state.pendingSlingshotEdges.length > MAX_PENDING_SLINGSHOT_EDGES) state.pendingSlingshotEdges.shift();
  return edgeId;
}

export function captureRemotePendingActions(state) {
  return {
    pulse: state.pendingPulse,
    extractConfirm: state.pendingExtractConfirm,
    consumeSlot: state.pendingConsumeSlot,
    slingshotEdges: state.pendingSlingshotEdges.slice(0, MAX_PENDING_SLINGSHOT_EDGES),
  };
}

export function settleRemoteInputAcknowledgement(state, sent, response) {
  if (sent.pulse) state.pendingPulse = false;
  if (sent.extractConfirm) state.pendingExtractConfirm = false;
  const acceptedEdges = Array.isArray(response.acceptedSlingshotEdges)
    ? new Set(response.acceptedSlingshotEdges)
    : new Set(sent.slingshotEdges);
  if (acceptedEdges.size > 0) {
    state.pendingSlingshotEdges = state.pendingSlingshotEdges.filter((id) => !acceptedEdges.has(id));
  }
  if (sent.consumeSlot !== null && state.pendingConsumeSlot === sent.consumeSlot) {
    state.pendingConsumeSlot = null;
  }
}
