const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const path = require('path');
const { fork } = require('child_process');
const http = require('http');

// Embedded servers — the desktop build is self-contained.
// Control plane + sim server run as child processes inside the app.
// Player never sees a terminal. Double-click → play.

const CONTROL_PORT = 8791;
const SIM_PORT = 8787;
const LOG_LIMIT = 40;

let controlProcess = null;
let simProcess = null;
let mainWindow = null;
let statusWindow = null;
const runtimeLogs = {
  control: [],
  sim: [],
};

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

function startEmbeddedServers() {
  const scriptsDir = path.join(__dirname, 'server');

  const controlScript = path.join(scriptsDir, 'control-plane-runtime.js');
  controlProcess = fork(controlScript, [], {
    env: { ...process.env, PORT: String(CONTROL_PORT), LBH_DATA_DIR: app.getPath('userData') },
    stdio: 'pipe',
  });
  bindProcessLogs('control', controlProcess);
  controlProcess.on('error', (err) => pushLog('control', `[control-plane-error] ${err.message}`));

  const simScript = path.join(scriptsDir, 'sim-runtime.js');
  simProcess = fork(simScript, [], {
    env: {
      ...process.env,
      PORT: String(SIM_PORT),
      LBH_CONTROL_PLANE_URL: `http://127.0.0.1:${CONTROL_PORT}`,
    },
    stdio: 'pipe',
  });
  bindProcessLogs('sim', simProcess);
  simProcess.on('error', (err) => pushLog('sim', `[sim-server-error] ${err.message}`));
}

function stopEmbeddedServers() {
  if (controlProcess) { controlProcess.kill(); controlProcess = null; }
  if (simProcess) { simProcess.kill(); simProcess = null; }
}

async function getEmbeddedStackSnapshot() {
  const [controlHealth, simHealth] = await Promise.all([
    fetchJson(`http://127.0.0.1:${CONTROL_PORT}/health`),
    fetchJson(`http://127.0.0.1:${SIM_PORT}/health`),
  ]);
  return {
    checkedAt: new Date().toISOString(),
    embeddedMode: 'embedded-desktop',
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
    if (snapshot.control.health && snapshot.sim.health) return snapshot;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  return null;
}

function createMainWindow() {
  // Authored 16:9 window at 1440x810 content size. Non-resizable by
  // design — this is a game, not a webview. Fullscreen is still
  // allowed via the OS shortcut (macOS Cmd+Ctrl+F / green button) so
  // players on any monitor aspect can go immersive; the internal
  // render letterboxes cleanly inside whatever fullscreen hands us.
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 810,
    useContentSize: true,
    resizable: false,
    maximizable: false,
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

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Dev-mode: if LBH_DEV_URL is set, load from the running dev server
  // (stack.js manages control/sim/dev). Skips the packaged renderer
  // and the embedded control/sim — those come from the dev stack.
  // Packaged mode falls through to the bundled desktop/renderer/.
  const devUrl = process.env.LBH_DEV_URL;
  if (devUrl) {
    mainWindow.loadURL(devUrl).catch((err) => {
      console.error('[electron] dev loadURL failed:', err.message);
    });
    return;
  }

  waitForEmbeddedStack().finally(() => {
    if (!mainWindow) return;
    mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'), {
      query: { simServer: `http://127.0.0.1:${SIM_PORT}` },
    });
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

app.whenReady().then(() => {
  // Dev-mode: servers are already running (stack.js started dev/control/sim
  // externally). Skip embedded server fork.
  if (!process.env.LBH_DEV_URL) startEmbeddedServers();
  buildMenu();
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (!process.env.LBH_DEV_URL) stopEmbeddedServers();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (!process.env.LBH_DEV_URL) stopEmbeddedServers();
});
