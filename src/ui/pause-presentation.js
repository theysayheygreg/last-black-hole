export function pauseAbandonIntent({ remoteActive = false } = {}) {
  return remoteActive ? 'leave-remote' : 'return-title';
}
