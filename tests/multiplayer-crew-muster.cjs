const { TestRunner, assert, startSimServer, stopSimServer } = require('./helpers.cjs');

const SIM_PORT = Number(process.env.LBH_CREW_MUSTER_SIM_PORT || 8846);
const SIM_URL = `http://127.0.0.1:${SIM_PORT}`;

async function request(pathname, { method = 'GET', body = null, authority = null } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (authority) {
    headers['x-lbh-command-credential'] = authority.commandCredential;
    headers['x-lbh-player-id'] = authority.playerId;
    headers['x-lbh-run-id'] = authority.runId;
  }
  const response = await fetch(`${SIM_URL}${pathname}`, {
    method,
    headers,
    body: body == null ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

function command(authority, commandSeq, extra = {}) {
  return {
    runId: authority.runId,
    playerId: authority.playerId,
    commandCredential: authority.commandCredential,
    commandSeq,
    ...extra,
  };
}

async function waitForRunningClock(timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const health = await request('/health');
    if (health.body.session?.status === 'running' && health.body.simTime > 0) return health.body;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('Timed out waiting for launched authority clock');
}

async function run() {
  const runner = new TestRunner('MultiplayerCrewMuster');
  await startSimServer(SIM_PORT, { keepAlive: true });

  try {
    await runner.run('staged crew freezes the universe, admits four, rejects five, and launches under host authority', async () => {
      const started = await request('/session/start', {
        method: 'POST',
        body: {
          mapId: 'shallows',
          maxPlayers: 4,
          seed: 8846,
          requesterId: 'crew-host',
          requesterName: 'Crew Host',
          startMode: 'staged',
        },
      });
      assert(started.status === 200 && started.body.session?.status === 'lobby',
        `Expected staged lobby, got ${started.status}/${started.body.session?.status}`);
      assert(/^[A-Z2-9]{6}$/.test(started.body.roomCode || ''), 'Host must receive a bounded six-character room code');
      const healthBeforeJoin = await request('/health');
      assert(!JSON.stringify(healthBeforeJoin.body).includes(started.body.roomCode), 'Unauthenticated health must not reveal the room code');

      const wrongCode = await request('/join', {
        method: 'POST',
        body: { runId: started.body.session.runId, clientId: 'wrong-code', name: 'Wrong Code', roomCode: 'AAAAAA' },
      });
      assert(wrongCode.status === 403 && wrongCode.body.code === 'room-code-invalid',
        `Expected invalid room code rejection, got ${wrongCode.status}/${wrongCode.body.code}`);

      const joins = [];
      for (let index = 0; index < 4; index += 1) {
        const clientId = index === 0 ? 'crew-host' : `crew-${index + 1}`;
        const joined = await request('/join', {
          method: 'POST',
          body: {
            runId: started.body.session.runId,
            clientId,
            name: index === 0 ? 'Crew Host' : `Crew ${index + 1}`,
            ...(index === 0 ? { joinTicket: started.body.joinTicket } : {}),
            ...(index > 0 ? { roomCode: started.body.roomCode } : {}),
          },
        });
        assert(joined.status === 200 && joined.body.authority?.playerId === clientId,
          `Expected crew seat ${index + 1}, got ${joined.status}/${joined.body.error}`);
        joins.push(joined.body.authority);
      }

      await new Promise((resolve) => setTimeout(resolve, 200));
      const stagedHealth = await request('/health');
      assert(stagedHealth.body.session.status === 'lobby', 'Crew must remain staged before host launch');
      assert(stagedHealth.body.idleState.humanPlayerCount === 4, 'Crew muster must expose four humans');
      assert(stagedHealth.body.tick === 0 && stagedHealth.body.simTime === 0,
        `Staged universe advanced: tick=${stagedHealth.body.tick} simTime=${stagedHealth.body.simTime}`);

      const lobby = await request('/lobby', { authority: joins[0] });
      const humanLobbyPlayers = lobby.body.players?.filter((player) => !player.isAI) || [];
      assert(lobby.status === 200 && humanLobbyPlayers.length === 4,
        `Authenticated lobby must expose the four-seat roster: ${lobby.status}/${JSON.stringify(lobby.body)}`);
      assert(humanLobbyPlayers.every((player, index) => player.seatNo === index && player.ready === false),
        'Seats must allocate deterministically and begin unready');

      const prematureInput = await request('/input', {
        method: 'POST',
        authority: joins[1],
        body: command(joins[1], 1, { seq: 1, moveX: 1 }),
      });
      assert(prematureInput.status === 409, 'Lobby input must not mutate the frozen universe');

      const fifth = await request('/join', {
        method: 'POST',
        body: { runId: started.body.session.runId, clientId: 'crew-5', name: 'Crew 5', roomCode: started.body.roomCode },
      });
      assert(fifth.status === 409 && fifth.body.code === 'room-full',
        `Expected fifth-seat rejection, got ${fifth.status}/${fifth.body.code}`);

      const nonHostLaunch = await request('/session/launch', {
        method: 'POST',
        authority: joins[1],
        body: command(joins[1], 1, { requesterId: 'crew-2' }),
      });
      assert(nonHostLaunch.status === 403,
        `Expected non-host launch rejection, got ${nonHostLaunch.status}/${nonHostLaunch.body.code}`);

      const earlyLaunch = await request('/session/launch', {
        method: 'POST',
        authority: joins[0],
        body: command(joins[0], 1, { requesterId: 'crew-host' }),
      });
      assert(earlyLaunch.status === 409 && earlyLaunch.body.code === 'crew-not-ready',
        `Expected readiness gate, got ${earlyLaunch.status}/${earlyLaunch.body.code}`);

      for (let index = 0; index < joins.length; index += 1) {
        const ready = await request('/session/ready', {
          method: 'POST',
          authority: joins[index],
          body: command(joins[index], 1, { ready: true }),
        });
        assert(ready.status === 200 && ready.body.player?.ready === true,
          `Expected seat ${index + 1} to become ready`);
      }

      const launched = await request('/session/launch', {
        method: 'POST',
        authority: joins[0],
        body: command(joins[0], 2, { requesterId: 'crew-host' }),
      });
      assert(launched.status === 200 && launched.body.session?.status === 'running',
        `Expected host launch, got ${launched.status}/${launched.body.session?.status}`);
      const running = await waitForRunningClock();
      assert(running.simTime > 0, 'Launched authority must advance world time');

      const duplicateLaunch = await request('/session/launch', {
        method: 'POST',
        authority: joins[0],
        body: command(joins[0], 3, { requesterId: 'crew-host' }),
      });
      assert(duplicateLaunch.status === 409 && duplicateLaunch.body.code === 'not-in-lobby',
        'Crew launch must be a one-way, exactly-once phase transition');

      const replacement = await request('/session/reset', {
        method: 'POST',
        authority: joins[0],
        body: command(joins[0], 3, { requesterId: 'crew-host' }),
      });
      assert(replacement.status === 200 && replacement.body.session?.status === 'lobby',
        `Expected host reset to open a replacement lobby, got ${replacement.status}/${replacement.body.code}`);
      assert(replacement.body.roomCode && replacement.body.roomCode !== started.body.roomCode,
        'Replacement lobby must rotate the private room code');

      const expired = await request('/join', {
        method: 'POST',
        body: { clientId: 'late-crew', name: 'Late Crew', roomCode: started.body.roomCode },
      });
      assert(expired.status === 403 && expired.body.code === 'room-expired',
        `Expected retired invite to report room-expired, got ${expired.status}/${expired.body.code}`);
    });
  } finally {
    await stopSimServer(SIM_PORT).catch(() => null);
  }

  process.exit(runner.summary() ? 0 : 1);
}

run().catch(async (error) => {
  await stopSimServer(SIM_PORT).catch(() => null);
  console.error('MultiplayerCrewMuster test fatal error:', error.stack || error.message);
  process.exit(1);
});
