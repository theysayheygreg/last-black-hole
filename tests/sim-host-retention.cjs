const fs = require('fs');
const path = require('path');
const { startSimServer, stopSimServer, TestRunner, assert } = require('./helpers.cjs');
const { MODES, startLocalHostSim } = require('../scripts/stack.cjs');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.LBH_RUN_LIFECYCLE_SIM_PORT || (9650 + process.pid % 200));
const UNPINNED_PORT = PORT + 1;
const PINNED_PORT = PORT + 2;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function requestAt(port, route, options = {}) {
  const response = await fetch(`http://127.0.0.1:${port}${route}`, options);
  return { status: response.status, body: await response.json().catch(() => ({})) };
}

async function postAt(port, route, payload) {
  return requestAt(port, route, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

async function waitForHealthAt(port, predicate, timeout = 5000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const result = await requestAt(port, '/health');
      if (predicate(result)) return result;
    } catch {}
    await sleep(60);
  }
  throw new Error(`Timed out waiting for sim health on ${port}`);
}

async function startAndEndTerminalRun(port, clientId) {
  const start = await postAt(port, '/session/start', { mapId: 'shallows', requesterId: clientId, requesterName: clientId });
  assert(start.status === 200, `Expected start on ${port}, got ${start.status}`);
  const join = await postAt(port, '/join', {
    clientId,
    runId: start.body.session?.runId,
    joinTicket: start.body.joinTicket,
    name: clientId,
  });
  assert(join.status === 200, `Expected join on ${port}, got ${join.status}`);
  const death = await postAt(port, '/debug/player-state', { clientId, status: 'dead', cause: 'lifecycle-smoke' });
  assert(death.status === 200, `Expected terminal setup on ${port}, got ${death.status}`);
  await waitForHealthAt(port, (result) => result.status === 200 && result.body.session?.status === 'ended');
}

(async () => {
  const runner = new TestRunner('SimHostRetention');
  await runner.run('Local player launch replaces a managed unpinned sim before starting', async () => {
    assert(JSON.stringify(MODES['local-host']?.serviceArgs?.sim) === JSON.stringify(['--keep-alive', 'true']),
      'Expected local-host authority to survive terminal result and Home');
    const calls = [];
    await startLocalHostSim({
      healthFetcher: async () => ({ idleState: { keepAlive: false } }),
      stop: (name) => { calls.push(`stop:${name}`); return 'stopped'; },
      start: (name, args) => { calls.push(`start:${name}:${args.join(' ')}`); return 'started'; },
    });
    assert(calls.join('|') === 'stop:sim|start:sim:--keep-alive true', `Unexpected replacement: ${calls.join('|')}`);
    const playSource = fs.readFileSync(path.join(ROOT, 'scripts', 'play.cjs'), 'utf8');
    assert(playSource.includes("startService('sim', LOCAL_PLAY_SIM_ARGS)"), 'Fresh play must retain local lifetime args');
  });

  await runner.run('Unpinned terminal retires while pinned terminal stays available', async () => {
    const env = { LBH_SIM_TERMINAL_GRACE_MS: '300' };
    await startSimServer(UNPINNED_PORT, { env });
    try {
      await startAndEndTerminalRun(UNPINNED_PORT, 'unpinned-terminal');
      await sleep(700);
      let stopped = false;
      try { await requestAt(UNPINNED_PORT, '/health'); } catch { stopped = true; }
      assert(stopped, 'Expected unpinned terminal sim to retire');
    } finally { await stopSimServer(UNPINNED_PORT).catch(() => null); }

    await startSimServer(PINNED_PORT, { keepAlive: true, env });
    try {
      await startAndEndTerminalRun(PINNED_PORT, 'pinned-terminal');
      await sleep(700);
      const health = await requestAt(PINNED_PORT, '/health');
      assert(health.status === 200 && health.body.idleState?.keepAlive === true, 'Expected pinned terminal sim to remain');
    } finally { await stopSimServer(PINNED_PORT).catch(() => null); }
  });
  process.exit(runner.summary() ? 0 : 1);
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
