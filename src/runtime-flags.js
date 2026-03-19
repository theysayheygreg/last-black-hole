const DEFAULT_FLAGS = {
  mode: 'dev',
  enableDevPanel: true,
  enableTestAPI: true,
  enableDebugOverlay: true,
};

function normalizeMode(mode) {
  return ['dev', 'test', 'release'].includes(mode) ? mode : 'dev';
}

function readRawFlags() {
  if (typeof window === 'undefined') return DEFAULT_FLAGS;
  return window.__LBH_BUILD_FLAGS__ || DEFAULT_FLAGS;
}

export function getRuntimeFlags() {
  const raw = readRawFlags();
  const mode = normalizeMode(raw.mode);
  return {
    mode,
    enableDevPanel: Boolean(raw.enableDevPanel),
    enableTestAPI: Boolean(raw.enableTestAPI),
    enableDebugOverlay: Boolean(raw.enableDebugOverlay),
    isDev: mode === 'dev',
    isTest: mode === 'test',
    isRelease: mode === 'release',
  };
}

export function applyRuntimeFlags(config) {
  const flags = getRuntimeFlags();

  if (!flags.enableDebugOverlay) {
    config.debug.showVelocityField = false;
    config.debug.showWellRadii = false;
    config.debug.showFPS = false;
    config.debug.showCoordDiagnostic = false;
    config.debug.showFluidDiagnostic = false;
  }

  return flags;
}
