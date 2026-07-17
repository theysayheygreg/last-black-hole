function buildFlagsForMode(mode, target = 'browser') {
  const authorityMode = target === 'desktop'
    ? 'required'
    : target === 'sandbox'
      ? 'sandbox'
      : mode === 'dev'
        ? 'dev-only'
        : 'required';
  return {
    dev: {
      mode,
      buildTarget: target,
      authorityMode,
      enableDevPanel: true,
      enableTestAPI: true,
      enableDebugOverlay: true,
    },
    test: {
      mode,
      buildTarget: target,
      authorityMode,
      enableDevPanel: false,
      enableTestAPI: true,
      enableDebugOverlay: false,
    },
    release: {
      mode,
      buildTarget: target,
      authorityMode,
      enableDevPanel: false,
      enableTestAPI: false,
      enableDebugOverlay: false,
    },
  }[mode];
}

module.exports = { buildFlagsForMode };
