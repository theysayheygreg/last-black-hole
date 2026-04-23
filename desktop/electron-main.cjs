const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const path = require('path');
const { fork } = require('child_process');
const http = require('http');
const net = require('net');

// Embedded servers — the desktop build is self-contained.
// Control plane + sim server run as child processes inside the app.
// Player never sees a terminal. Double-click → play.

const LOG_LIMIT = 40;

let controlProcess = null;
let simProcess = null;
let controlPort = null;
let simPort = null;
let embeddedControlLabel = null;
let embeddedSimInstanceId = null;
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

  const controlScript = path.join(scriptsDir, 'control-plane-runtime.js');
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

  const simScript = path.join(scriptsDir, 'sim-runtime.js');
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
    const controlMatches = snapshot.control.health?.label === embeddedControlLabel;
    const simMatches = snapshot.sim.health?.simInstanceId === embeddedSimInstanceId;
    if (controlMatches && simMatches) return snapshot;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
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

  waitForEmbeddedStack().then((snapshot) => {
    if (!mainWindow) return;
    if (!snapshot || !simPort) {
      loadEmbeddedFailurePage('The local control plane and sim did not report the expected embedded identity.');
      return;
    }
    mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'), {
      query: { simServer: `http://127.0.0.1:${simPort}` },
    });
  }).catch((err) => {
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

app.whenReady().then(async () => {
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

app.on('window-all-closed', () => {
  if (!process.env.LBH_DEV_URL) stopEmbeddedServers();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (!process.env.LBH_DEV_URL) stopEmbeddedServers();
});
