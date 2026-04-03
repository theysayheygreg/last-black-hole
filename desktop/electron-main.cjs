const { app, BrowserWindow } = require('electron');
const path = require('path');
const { fork } = require('child_process');

// Embedded servers — the desktop build is self-contained.
// Control plane + sim server run as child processes inside the app.
// Player never sees a terminal. Double-click → play.

const CONTROL_PORT = 8791;
const SIM_PORT = 8787;

let controlProcess = null;
let simProcess = null;

function startEmbeddedServers() {
  const scriptsDir = path.join(__dirname, 'server');

  // Control plane
  const controlScript = path.join(scriptsDir, 'control-plane-runtime.js');
  controlProcess = fork(controlScript, [], {
    env: { ...process.env, PORT: String(CONTROL_PORT), LBH_DATA_DIR: app.getPath('userData') },
    stdio: 'pipe',
  });
  controlProcess.on('error', (err) => console.error('[control-plane]', err.message));

  // Sim server
  const simScript = path.join(scriptsDir, 'sim-runtime.js');
  simProcess = fork(simScript, [], {
    env: {
      ...process.env,
      PORT: String(SIM_PORT),
      LBH_CONTROL_PLANE_URL: `http://127.0.0.1:${CONTROL_PORT}`,
      LBH_MAP_DIR: path.join(__dirname, 'renderer', 'src', 'maps'),
    },
    stdio: 'pipe',
  });
  simProcess.on('error', (err) => console.error('[sim-server]', err.message));
}

function stopEmbeddedServers() {
  if (controlProcess) { controlProcess.kill(); controlProcess = null; }
  if (simProcess) { simProcess.kill(); simProcess = null; }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    backgroundColor: '#000033',
    autoHideMenuBar: true,
    title: 'Last Singularity',
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  // Give servers a moment to bind, then load the game
  setTimeout(() => {
    win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  }, 800);
}

app.whenReady().then(() => {
  startEmbeddedServers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  stopEmbeddedServers();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  stopEmbeddedServers();
});
