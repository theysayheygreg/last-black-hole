const { app, BrowserWindow, Menu, ipcMain, clipboard, dialog, protocol } = require('electron');
const path = require('path');
const fs = require('fs');
const { fork } = require('child_process');
const http = require('http');
const net = require('net');

// Embedded servers — the desktop build is self-contained.
// Control plane + sim server run as child processes inside the app.
// Player never sees a terminal. Double-click → play.

const LOG_LIMIT = 40;
const RENDERER_LOAD_TIMEOUT_MS = Number(process.env.LBH_RENDERER_LOAD_TIMEOUT_MS) || 10000;
const RENDERER_SCHEME = 'lbh';

let controlProcess = null;
let simProcess = null;
let controlPort = null;
let simPort = null;
let embeddedControlLabel = null;
let embeddedSimInstanceId = null;
let mainWindow = null;
let statusWindow = null;
const hasSingleInstanceLock = app.requestSingleInstanceLock();
const runtimeLogs = {
  control: [],
  sim: [],
};

protocol.registerSchemesAsPrivileged([
  {
    scheme: RENDERER_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
    },
  },
]);

function logMain(event, details = {}) {
  const suffix = details && Object.keys(details).length
    ? ` ${JSON.stringify(details)}`
    : '';
  console.log(`[electron-main] ${event}${suffix}`);
}

function applyDeckChromiumProfile() {
  if (!isDeckRuntime()) return;
  // SteamOS can launch Electron inside gamescope/XWayland with a GPU sandbox
  // context Chromium dislikes. Keep hardware WebGL on, but relax the Chromium
  // GPU sandbox/blocklist so the renderer survives Deck launch.
  const glBackend = process.env.LBH_DECK_USE_GL || 'auto';
  app.commandLine.appendSwitch('disable-gpu-sandbox');
  app.commandLine.appendSwitch('disable-renderer-backgrounding');
  app.commandLine.appendSwitch('ignore-gpu-blocklist');
  app.commandLine.appendSwitch('ozone-platform', 'x11');
  if (glBackend !== 'auto') {
    app.commandLine.appendSwitch('use-gl', glBackend);
  }
  if (process.env.LBH_DECK_DISABLE_GPU_COMPOSITING === '1') {
    app.commandLine.appendSwitch('disable-gpu-compositing');
  }
  if (process.env.LBH_DECK_IN_PROCESS_GPU === '1') {
    app.commandLine.appendSwitch('in-process-gpu');
  }
  logMain('deck.chromium-profile', {
    ozonePlatform: 'x11',
    glBackend: glBackend === 'auto' ? null : glBackend,
    disableGpuCompositing: process.env.LBH_DECK_DISABLE_GPU_COMPOSITING === '1',
    inProcessGpu: process.env.LBH_DECK_IN_PROCESS_GPU === '1',
  });
}

function focusExistingWindows() {
  const target = mainWindow && !mainWindow.isDestroyed() ? mainWindow : statusWindow;
  if (!target || target.isDestroyed()) return;
  if (target.isMinimized()) target.restore();
  target.show();
  target.focus();
}

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  applyDeckChromiumProfile();
  app.on('second-instance', () => {
    // Deck/Desktop launchers are easy to double-click; keep one authority stack
    // per profile so Electron cache files and embedded ports stay coherent.
    focusExistingWindows();
  });
}

function fetchJson(url) {
  return new Promise((resolve) => {
    const request = http.get(url, { timeout: 1200 }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch {
          resolve(null);
        }
      });
    });
    request.on('error', () => resolve(null));
    request.on('timeout', () => {
      request.destroy();
      resolve(null);
    });
  });
}

function pushLog(stream, chunk) {
  const lines = String(chunk || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return;
  runtimeLogs[stream].push(...lines.map((line) => ({ at: new Date().toISOString(), line })));
  for (const line of lines) {
    console.log(`[embedded:${stream}] ${line}`);
  }
  if (runtimeLogs[stream].length > LOG_LIMIT) {
    runtimeLogs[stream] = runtimeLogs[stream].slice(-LOG_LIMIT);
  }
}

function bindProcessLogs(stream, child) {
  child.stdout?.on('data', (chunk) => pushLog(stream, chunk));
  child.stderr?.on('data', (chunk) => pushLog(stream, chunk));
  child.on('exit', (code, signal) => {
    pushLog(stream, `[process-exit] code=${code} signal=${signal}`);
  });
}

function mimeTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.wav': 'audio/wav',
    '.mp3': 'audio/mpeg',
    '.ogg': 'audio/ogg',
    '.wasm': 'application/wasm',
  }[ext] || 'application/octet-stream';
}

function responseForText(message, status = 404) {
  return new Response(message, {
    status,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}

function rendererFilePathFromUrl(requestUrl) {
  const url = new URL(requestUrl);
  if (url.hostname !== 'renderer') return null;
  const rendererRoot = path.join(__dirname, 'renderer');
  const rawPath = decodeURIComponent(url.pathname || '/index.html');
  const relativePath = rawPath.replace(/^\/+/, '') || 'index.html';
  const filePath = path.normalize(path.join(rendererRoot, relativePath));
  if (filePath !== rendererRoot && !filePath.startsWith(`${rendererRoot}${path.sep}`)) {
    return null;
  }
  return filePath;
}

function registerRendererProtocol() {
  protocol.handle(RENDERER_SCHEME, async (request) => {
    const filePath = rendererFilePathFromUrl(request.url);
    if (!filePath) return responseForText('Invalid renderer asset path.', 400);
    try {
      const data = fs.readFileSync(filePath);
      return new Response(data, {
        status: 200,
        headers: {
          'content-type': mimeTypeFor(filePath),
          'cache-control': 'no-store',
        },
      });
    } catch (err) {
      logMain('renderer.protocol.miss', { url: request.url, filePath, message: err.message });
      return responseForText('Renderer asset not found.', 404);
    }
  });
  logMain('renderer.protocol.registered', { scheme: RENDERER_SCHEME });
}

function getOpenPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : null;
      server.close(() => {
        if (port) resolve(port);
        else reject(new Error('Could not allocate an embedded server port.'));
      });
    });
  });
}

async function startEmbeddedServers() {
  if (controlProcess && simProcess) return;
  if (controlProcess || simProcess) stopEmbeddedServers();

  const scriptsDir = path.join(__dirname, 'server');
  const owner = `${process.pid}-${Date.now()}`;
  const dataDir = app.getPath('userData');
  controlPort = Number(process.env.LBH_EMBEDDED_CONTROL_PORT) || await getOpenPort();
  simPort = Number(process.env.LBH_EMBEDDED_SIM_PORT) || await getOpenPort();
  embeddedControlLabel = `lbh-embedded-control-${owner}`;
  embeddedSimInstanceId = `lbh-embedded-sim-${owner}`;

  const controlScript = path.join(scriptsDir, 'control-plane-runtime.cjs');
  controlProcess = fork(controlScript, ['--host', '127.0.0.1', '--port', String(controlPort), '--label', embeddedControlLabel], {
    env: {
      ...process.env,
      LBH_CONTROL_PLANE_LABEL: embeddedControlLabel,
      LBH_CONTROL_PLANE_FILE: path.join(dataDir, 'control-plane-store.json'),
      LBH_SESSION_REGISTRY_FILE: path.join(dataDir, 'session-registry.json'),
    },
    stdio: 'pipe',
  });
  bindProcessLogs('control', controlProcess);
  controlProcess.on('error', (err) => pushLog('control', `[control-plane-error] ${err.message}`));
  controlProcess.on('exit', () => {
    controlProcess = null;
  });

  const simScript = path.join(scriptsDir, 'sim-runtime.cjs');
  simProcess = fork(simScript, ['--host', '127.0.0.1', '--port', String(simPort), '--sim-instance-id', embeddedSimInstanceId], {
    env: {
      ...process.env,
      LBH_SIM_INSTANCE_ID: embeddedSimInstanceId,
      LBH_CONTROL_PLANE_URL: `http://127.0.0.1:${controlPort}`,
      LBH_SESSION_REGISTRY_FILE: path.join(dataDir, 'session-registry.json'),
    },
    stdio: 'pipe',
  });
  bindProcessLogs('sim', simProcess);
  simProcess.on('error', (err) => pushLog('sim', `[sim-server-error] ${err.message}`));
  simProcess.on('exit', () => {
    simProcess = null;
  });
}

function stopEmbeddedServers() {
  if (controlProcess) { controlProcess.kill(); controlProcess = null; }
  if (simProcess) { simProcess.kill(); simProcess = null; }
  controlPort = null;
  simPort = null;
  embeddedControlLabel = null;
  embeddedSimInstanceId = null;
}

async function getEmbeddedStackSnapshot() {
  const controlUrl = controlPort ? `http://127.0.0.1:${controlPort}/health` : null;
  const simUrl = simPort ? `http://127.0.0.1:${simPort}/health` : null;
  const [controlHealth, simHealth] = await Promise.all([
    controlUrl ? fetchJson(controlUrl) : Promise.resolve(null),
    simUrl ? fetchJson(simUrl) : Promise.resolve(null),
  ]);
  return {
    checkedAt: new Date().toISOString(),
    stackMode: 'embedded',
    stackLabel: {
      name: 'Embedded desktop',
      detail: 'Packaged app-owned control plane and sim on dynamic loopback ports.',
    },
    urls: {
      control: controlPort ? `http://127.0.0.1:${controlPort}` : null,
      sim: simPort ? `http://127.0.0.1:${simPort}` : null,
    },
    services: {
      control: {
        pid: controlProcess?.pid || null,
        health: controlHealth,
        recentLogs: runtimeLogs.control.slice(-12),
      },
      sim: {
        pid: simProcess?.pid || null,
        health: simHealth,
        recentLogs: runtimeLogs.sim.slice(-12),
      },
    },
    control: {
      pid: controlProcess?.pid || null,
      health: controlHealth,
      recentLogs: runtimeLogs.control.slice(-12),
    },
    sim: {
      pid: simProcess?.pid || null,
      health: simHealth,
      recentLogs: runtimeLogs.sim.slice(-12),
    },
  };
}

async function waitForEmbeddedStack(timeoutMs = 4000) {
  const startedAt = Date.now();
  while ((Date.now() - startedAt) < timeoutMs) {
    const snapshot = await getEmbeddedStackSnapshot();
    const controlMatches = snapshot.control.health?.label === embeddedControlLabel;
    const simMatches = snapshot.sim.health?.simInstanceId === embeddedSimInstanceId;
    if (controlMatches && simMatches) {
      logMain('embedded.ready', {
        waitedMs: Date.now() - startedAt,
        controlPort,
        simPort,
        controlPid: snapshot.control.pid,
        simPid: snapshot.sim.pid,
      });
      return snapshot;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  logMain('embedded.timeout', {
    timeoutMs,
    controlPort,
    simPort,
    embeddedControlLabel,
    embeddedSimInstanceId,
  });
  return null;
}

function loadEmbeddedFailurePage(message) {
  if (!mainWindow) return;
  const html = `
    <!doctype html>
    <meta charset="utf-8">
    <title>Last Singularity — Stack Error</title>
    <body style="margin:0;background:#050914;color:#d8f3ff;font:18px monospace;display:grid;place-items:center;height:100vh;">
      <main style="max-width:760px;padding:32px;border:1px solid #17445e;background:#07111d;">
        <h1 style="color:#ff3b1f;margin-top:0;">embedded authority failed to start</h1>
        <p>${message}</p>
        <p>Open <strong>Last Singularity → Stack Status</strong> for process logs.</p>
      </main>
    </body>
  `;
  mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  createStatusWindow();
}

function isDeckRuntime() {
  return process.env.LBH_DECK === '1';
}

function inspectRendererState(label) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const script = `(() => {
    const canvasState = Array.from(document.querySelectorAll('canvas')).map((canvas) => {
      const rect = canvas.getBoundingClientRect();
      const style = window.getComputedStyle(canvas);
      return {
        id: canvas.id,
        width: canvas.width,
        height: canvas.height,
        cssWidth: rect.width,
        cssHeight: rect.height,
        display: style.display,
        opacity: style.opacity,
      };
    });
    return {
      href: window.location.href,
      readyState: document.readyState,
      title: document.title,
      bodyText: (document.body && document.body.innerText || '').slice(0, 240),
      bootState: window.__LBH_BOOT_STATE__ || null,
      runtimeFlags: window.__LBH_BUILD_FLAGS__ || null,
      canvasState,
    };
  })()`;
  mainWindow.webContents.executeJavaScript(script, true)
    .then((state) => logMain(`renderer.inspect.${label}`, state))
    .catch((err) => logMain(`renderer.inspect.${label}.failed`, { message: err.message }));
}

function installMainWindowDiagnostics(win) {
  win.on('ready-to-show', () => logMain('window.ready-to-show'));
  win.on('show', () => logMain('window.show'));
  win.on('unresponsive', () => logMain('window.unresponsive'));
  win.on('responsive', () => logMain('window.responsive'));

  const wc = win.webContents;
  wc.on('did-start-loading', () => logMain('renderer.did-start-loading', { url: wc.getURL() }));
  wc.on('dom-ready', () => {
    logMain('renderer.dom-ready', { url: wc.getURL() });
    inspectRendererState('dom-ready');
  });
  wc.on('did-finish-load', () => {
    logMain('renderer.did-finish-load', { url: wc.getURL() });
    inspectRendererState('finish');
    setTimeout(() => inspectRendererState('finish-plus-2s'), 2000);
  });
  wc.on('did-stop-loading', () => logMain('renderer.did-stop-loading', { url: wc.getURL() }));
  wc.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    logMain('renderer.did-fail-load', { errorCode, errorDescription, validatedURL, isMainFrame });
  });
  wc.on('render-process-gone', (_event, details) => logMain('renderer.process-gone', details));
  wc.on('console-message', (_event, ...args) => {
    const payload = args.length === 1 && typeof args[0] === 'object'
      ? args[0]
      : { level: args[0], message: args[1], line: args[2], sourceId: args[3] };
    logMain('renderer.console', payload);
  });
}

function loadDeckDiagnosticPage(reason) {
  if (!mainWindow) return;
  const html = `
    <!doctype html>
    <meta charset="utf-8">
    <title>Last Singularity — Deck Diagnostic</title>
    <body style="margin:0;background:#08111f;color:#e9f7ff;font:20px monospace;display:grid;place-items:center;height:100vh;">
      <main style="max-width:820px;padding:32px;border:1px solid #3c789b;background:#0d1c2f;">
        <h1 style="margin-top:0;color:#7ee0ff;">Deck window diagnostic</h1>
        <p>If you can read this, Electron can create and paint the fullscreen Deck window.</p>
        <p>Reason: ${reason}</p>
      </main>
    </body>
  `;
  logMain('renderer.diagnostic-page', { reason });
  mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
}

function loadGameRenderer() {
  if (!mainWindow || !simPort) return;
  const rendererPath = path.join(__dirname, 'renderer', 'index.html');
  const simServer = `http://127.0.0.1:${simPort}`;
  const params = new URLSearchParams({ simServer });
  if (isDeckRuntime()) params.set('deck', '1');
  const rendererUrl = `${RENDERER_SCHEME}://renderer/index.html?${params.toString()}`;
  let settled = false;
  let timeout = null;

  const clearLoadTimeout = () => {
    settled = true;
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
    }
  };

  mainWindow.webContents.once('did-finish-load', clearLoadTimeout);
  mainWindow.webContents.once('did-fail-load', (_event, _errorCode, _errorDescription, _validatedURL, isMainFrame) => {
    if (isMainFrame) clearLoadTimeout();
  });

  timeout = setTimeout(() => {
    if (settled || !mainWindow || mainWindow.isDestroyed()) return;
    logMain('renderer.load.timeout', {
      timeoutMs: RENDERER_LOAD_TIMEOUT_MS,
      rendererPath,
      rendererExists: fs.existsSync(rendererPath),
      rendererUrl,
      currentUrl: mainWindow.webContents.getURL(),
    });
    inspectRendererState('load-timeout');
    loadEmbeddedFailurePage('The game renderer did not finish loading. Check the Deck launch log for renderer diagnostics.');
  }, RENDERER_LOAD_TIMEOUT_MS);

  logMain('renderer.load.request', {
    rendererPath,
    rendererExists: fs.existsSync(rendererPath),
    rendererUrl,
    simServer,
  });
  mainWindow.loadURL(rendererUrl).then(() => {
    logMain('renderer.load.resolved', { url: mainWindow?.webContents?.getURL?.() || null });
  }).catch((err) => {
    clearLoadTimeout();
    logMain('renderer.load.rejected', { message: err.message, rendererPath });
    loadEmbeddedFailurePage(`The game renderer failed to load: ${err.message}`);
  });
}

function createMainWindow() {
  const deckRuntime = isDeckRuntime();
  const windowSize = deckRuntime
    ? { width: 1280, height: 800 }
    : { width: 1440, height: 810 };

  // Authored 16:9 window at 1440x810 content size. Non-resizable by
  // design — this is a game, not a webview. Fullscreen is still
  // allowed via the OS shortcut (macOS Cmd+Ctrl+F / green button) so
  // players on any monitor aspect can go immersive; the internal
  // render letterboxes cleanly inside whatever fullscreen hands us.
  // The Deck launcher sets LBH_DECK=1 so Gaming Mode gets a native
  // 1280x800 fullscreen shell while the game keeps its 16:9 playfield.
  mainWindow = new BrowserWindow({
    width: windowSize.width,
    height: windowSize.height,
    useContentSize: true,
    resizable: false,
    maximizable: deckRuntime,
    fullscreen: deckRuntime,
    fullscreenable: true,
    backgroundColor: '#000033',
    autoHideMenuBar: true,
    title: 'Last Singularity',
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  logMain('window.created', { deckRuntime, windowSize });
  installMainWindowDiagnostics(mainWindow);

  mainWindow.on('closed', () => {
    logMain('window.closed');
    mainWindow = null;
  });

  // Dev-mode: if LBH_DEV_URL is set, load from the running dev server
  // (stack.js manages control/sim/dev). Skips the packaged renderer
  // and the embedded control/sim — those come from the dev stack.
  // Packaged mode falls through to the bundled desktop/renderer/.
  const devUrl = process.env.LBH_DEV_URL;
  if (devUrl) {
    const deckAwareDevUrl = deckRuntime
      ? `${devUrl}${devUrl.includes('?') ? '&' : '?'}deck=1`
      : devUrl;
    logMain('renderer.dev-load.request', { devUrl: deckAwareDevUrl });
    mainWindow.loadURL(deckAwareDevUrl).catch((err) => {
      console.error('[electron] dev loadURL failed:', err.message);
    });
    return;
  }

  if (process.env.LBH_DECK_DIAGNOSTIC === '1') {
    loadDeckDiagnosticPage('LBH_DECK_DIAGNOSTIC=1');
    return;
  }

  waitForEmbeddedStack().then((snapshot) => {
    if (!mainWindow) return;
    if (!snapshot || !simPort) {
      loadEmbeddedFailurePage('The local control plane and sim did not report the expected embedded identity.');
      return;
    }
    loadGameRenderer();
  }).catch((err) => {
    logMain('embedded.wait.failed', { message: err.message });
    loadEmbeddedFailurePage(err.message);
  });
}

function createStatusWindow() {
  if (statusWindow && !statusWindow.isDestroyed()) {
    statusWindow.show();
    statusWindow.focus();
    return statusWindow;
  }
  statusWindow = new BrowserWindow({
    width: 980,
    height: 680,
    title: 'Last Singularity — Stack Status',
    backgroundColor: '#050914',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'status-preload.cjs'),
      contextIsolation: true,
      sandbox: false,
      nodeIntegration: false,
    },
  });
  statusWindow.loadFile(path.join(__dirname, 'status.html'));
  statusWindow.on('closed', () => {
    statusWindow = null;
  });
  return statusWindow;
}

function buildMenu() {
  const template = [
    {
      label: 'Last Singularity',
      submenu: [
        { label: 'Stack Status', accelerator: 'CmdOrCtrl+Shift+S', click: () => createStatusWindow() },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'close' },
        { type: 'separator' },
        { label: 'Show Stack Status', accelerator: 'CmdOrCtrl+Shift+S', click: () => createStatusWindow() },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

ipcMain.handle('lbh:stack-status', async () => getEmbeddedStackSnapshot());
ipcMain.handle('lbh:focus-main-window', async () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
  }
  return { ok: true };
});
ipcMain.handle('lbh:copy-text', async (_event, text) => {
  clipboard.writeText(String(text || ''));
  return { ok: true };
});
ipcMain.handle('lbh:export-text', async (_event, payload = {}) => {
  const result = await dialog.showSaveDialog(statusWindow || mainWindow, {
    title: 'Export Stack Status',
    defaultPath: payload.defaultPath || 'last-singularity-status.txt',
    filters: [{ name: 'Text', extensions: ['txt', 'json', 'log'] }],
  });
  if (result.canceled || !result.filePath) return { ok: false, canceled: true };
  fs.writeFileSync(result.filePath, String(payload.text || ''), 'utf8');
  return { ok: true, filePath: result.filePath };
});

if (hasSingleInstanceLock) {
  app.whenReady().then(async () => {
    registerRendererProtocol();
    // Dev-mode: servers are already running (stack.js started dev/control/sim
    // externally). Skip embedded server fork.
    if (!process.env.LBH_DEV_URL) await startEmbeddedServers();
    buildMenu();
    createMainWindow();

    app.on('activate', async () => {
      if (!mainWindow || mainWindow.isDestroyed()) {
        if (!process.env.LBH_DEV_URL) await startEmbeddedServers();
        createMainWindow();
      }
    });
  });
}

app.on('window-all-closed', () => {
  if (!process.env.LBH_DEV_URL) stopEmbeddedServers();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (!process.env.LBH_DEV_URL) stopEmbeddedServers();
});
