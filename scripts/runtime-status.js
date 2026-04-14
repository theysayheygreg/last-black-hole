const http = require('http');
const { execFileSync } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DEV_URL = 'http://127.0.0.1:8080/';
const LOCAL_SIM_URL = 'http://127.0.0.1:8787';
const LOCAL_CONTROL_URL = 'http://127.0.0.1:8791';

function runNode(script, commandName, extraArgs = []) {
  return execFileSync(process.execPath, [path.join(ROOT, 'scripts', script), commandName, ...extraArgs], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function runNodeSafe(script, commandName, extraArgs = []) {
  try {
    return runNode(script, commandName, extraArgs);
  } catch (err) {
    const stdout = err.stdout?.toString?.() || '';
    const stderr = err.stderr?.toString?.() || '';
    return `${stdout}\n${stderr}`.trim();
  }
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

function statusService(name) {
  if (name === 'dev') return runNodeSafe('dev-server.js', 'status');
  if (name === 'sim') return runNodeSafe('sim-server.js', 'status');
  if (name === 'control') return runNodeSafe('control-plane-server.js', 'status');
  return '';
}

function startService(name) {
  if (name === 'dev') return runNodeSafe('dev-server.js', 'start');
  if (name === 'sim') return runNodeSafe('sim-server.js', 'start');
  if (name === 'control') return runNodeSafe('control-plane-server.js', 'start');
  return '';
}

function stopService(name) {
  if (name === 'dev') return runNodeSafe('dev-server.js', 'stop');
  if (name === 'sim') return runNodeSafe('sim-server.js', 'stop');
  if (name === 'control') return runNodeSafe('control-plane-server.js', 'stop');
  return '';
}

async function getStackSnapshot() {
  const [controlHealth, simHealth] = await Promise.all([
    fetchJson(`${LOCAL_CONTROL_URL}/health`),
    fetchJson(`${LOCAL_SIM_URL}/health`),
  ]);
  return {
    checkedAt: new Date().toISOString(),
    urls: {
      dev: DEV_URL,
      control: LOCAL_CONTROL_URL,
      sim: LOCAL_SIM_URL,
    },
    services: {
      dev: { statusText: statusService('dev') },
      control: { statusText: statusService('control'), health: controlHealth },
      sim: { statusText: statusService('sim'), health: simHealth },
    },
  };
}

function formatStackSummary(snapshot) {
  const lines = [];
  lines.push(snapshot.services.dev.statusText || 'LBH dev server is not running.');
  lines.push('');
  lines.push(snapshot.services.control.statusText || 'LBH control plane is not running.');
  lines.push('');
  lines.push(snapshot.services.sim.statusText || 'LBH sim server is not running.');
  if (snapshot.services.control.health || snapshot.services.sim.health) {
    lines.push('');
    lines.push('Stack summary:');
    if (snapshot.services.control.health) {
      lines.push(`- control plane: healthy at ${snapshot.urls.control}`);
    }
    if (snapshot.services.sim.health) {
      const simHealth = snapshot.services.sim.health;
      const idle = simHealth.idleState || {};
      lines.push(`- sim: ${simHealth.session?.status || 'unknown'} | map=${simHealth.mapId || 'none'} | players=${idle.humanPlayerCount ?? '?'} human + ${idle.aiPlayerCount ?? '?'} AI | overload=${simHealth.session?.overloadState || 'unknown'}`);
    }
  }
  return lines.join('\n');
}

module.exports = {
  DEV_URL,
  LOCAL_SIM_URL,
  LOCAL_CONTROL_URL,
  fetchJson,
  getStackSnapshot,
  formatStackSummary,
  startService,
  stopService,
  statusService,
};
