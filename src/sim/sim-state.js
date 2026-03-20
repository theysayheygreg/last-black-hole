export function createSimState() {
  return {
    growthTimer: 0,
    runElapsedTime: 0,
    runEndTime: 0,
  };
}

export function resetSimState(simState) {
  simState.growthTimer = 0;
  simState.runElapsedTime = 0;
  simState.runEndTime = 0;
}

export function freezeRunEnd(simState) {
  simState.runEndTime = simState.runElapsedTime;
}
