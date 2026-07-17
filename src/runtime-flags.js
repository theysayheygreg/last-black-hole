const DEFAULT_FLAGS = {
  mode: 'dev',
  buildTarget: 'source',
  authorityMode: 'dev-only',
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

function normalizeAuthorityMode(mode) {
  return ['required', 'dev-only', 'sandbox'].includes(mode) ? mode : 'required';
}

export function resolveAuthorityLaunchPolicy(rawFlags = {}, search = '') {
  const mode = normalizeMode(rawFlags.mode);
  const authorityMode = normalizeAuthorityMode(rawFlags.authorityMode);
  const buildTarget = rawFlags.buildTarget || 'source';
  const params = new URLSearchParams(search);
  const legacySoloRequested = params.get('legacySolo') === '1';
  const localSandboxRequested = params.get('localSandbox') === '1';
  const allowLegacySoloFallback = authorityMode === 'dev-only'
    ? mode === 'dev' && legacySoloRequested
    : authorityMode === 'sandbox' && localSandboxRequested;

  return {
    mode,
    buildTarget,
    authorityMode,
    legacySoloRequested,
    localSandboxRequested,
    allowLegacySoloFallback,
    authorityRequired: !allowLegacySoloFallback,
  };
}

export function getRuntimeFlags() {
  const raw = readRawFlags();
  const authority = resolveAuthorityLaunchPolicy(raw, typeof window === 'undefined' ? '' : window.location.search);
  return {
    mode: authority.mode,
    buildTarget: raw.buildTarget || 'source',
    authorityMode: authority.authorityMode,
    authorityRequired: authority.authorityRequired,
    allowLegacySoloFallback: authority.allowLegacySoloFallback,
    legacySoloRequested: authority.legacySoloRequested,
    enableDevPanel: Boolean(raw.enableDevPanel),
    enableTestAPI: Boolean(raw.enableTestAPI),
    enableDebugOverlay: Boolean(raw.enableDebugOverlay),
    isDev: authority.mode === 'dev',
    isTest: authority.mode === 'test',
    isRelease: authority.mode === 'release',
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
