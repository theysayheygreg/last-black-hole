const { TestRunner, assert, startSimServer, stopSimServer } = require('./helpers.cjs');

const BASE_PORT = Number(process.env.LBH_ROOM_LOBBY_BASE_PORT || 8856);

function createRequester(port) {
  const baseUrl = `http://127.0.0.1:${port}`;
  return async function request(pathname, { method = 'GET', body = null, authority = null } = {}) {
    const headers = { 'content-type': 'application/json' };
    if (authority) {
      headers['x-lbh-command-credential'] = authority.commandCredential;
      headers['x-lbh-player-id'] = authority.playerId;
      headers['x-lbh-run-id'] = authority.runId;
    }
    const response = await fetch(`${baseUrl}${pathname}`, {
      method,
      headers,
      body: body == null ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  };
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

async function exercisePopulation(population, port) {
  const request = createRequester(port);
  const started = await request('/session/start', {
    method: 'POST',
    body: {
      mapId: 'shallows',
      maxPlayers: 4,
      seed: port,
      requesterId: `host-${population}`,
      requesterName: `Host ${population}`,
      startMode: 'staged',
    },
  });
  assert(started.status === 200 && /^[A-Z2-9]{6}$/.test(started.body.roomCode || ''),
    `${population}p room must return a private six-character code`);

  const authorities = [];
  for (let index = 0; index < population; index += 1) {
    const clientId = index === 0 ? `host-${population}` : `guest-${population}-${index}`;
    const joined = await request('/join', {
      method: 'POST',
      body: {
        runId: started.body.session.runId,
        clientId,
        name: index === 0 ? `Host ${population}` : `Guest ${index}`,
        ...(index === 0 ? { joinTicket: started.body.joinTicket } : { roomCode: started.body.roomCode }),
      },
    });
    assert(joined.status === 200, `${population}p seat ${index} failed: ${joined.status}/${joined.body.code}`);
    authorities.push(joined.body.authority);
  }

  const lobby = await request('/lobby', { authority: authorities[0] });
  const humans = lobby.body.players.filter((player) => !player.isAI);
  assert(humans.length === population, `${population}p lobby roster mismatch`);
  assert(humans.every((player, index) => player.seatNo === index && !player.ready && player.connected),
    `${population}p lobby must allocate stable linked, unready seats`);
  assert(lobby.body.tick === 0 && lobby.body.simTime === 0, `${population}p lobby advanced before launch`);

  if (population > 1) {
    const nonHost = await request('/session/launch', {
      method: 'POST',
      authority: authorities[1],
      body: command(authorities[1], 1),
    });
    assert(nonHost.status === 403 && nonHost.body.code === 'host-required',
      `${population}p non-host launch must fail closed`);
  }

  const early = await request('/session/launch', {
    method: 'POST',
    authority: authorities[0],
    body: command(authorities[0], 1),
  });
  assert(early.status === 409 && early.body.code === 'crew-not-ready',
    `${population}p launch must wait for readiness`);

  for (let index = 0; index < authorities.length; index += 1) {
    const ready = await request('/session/ready', {
      method: 'POST',
      authority: authorities[index],
      body: command(authorities[index], 1, { ready: true }),
    });
    assert(ready.status === 200 && ready.body.player.ready, `${population}p seat ${index} did not ready`);
  }

  if (population === 3) {
    const oldGuestAuthority = authorities[1];
    const resumed = await request('/join', {
      method: 'POST',
      authority: oldGuestAuthority,
      body: {
        runId: oldGuestAuthority.runId,
        clientId: oldGuestAuthority.playerId,
        name: 'Ignored Reconnect Name',
      },
    });
    assert(resumed.status === 200 && resumed.body.authority.membershipId === oldGuestAuthority.membershipId,
      '3p reconnect must preserve membership and seat');
    assert(resumed.body.authority.connectionEpoch > oldGuestAuthority.connectionEpoch,
      '3p reconnect must rotate connection epoch');
    authorities[1] = resumed.body.authority;

    const afterResume = await request('/lobby', { authority: authorities[1] });
    const resumedPlayer = afterResume.body.players.find((player) => player.clientId === authorities[1].playerId);
    assert(resumedPlayer?.seatNo === 1 && resumedPlayer.ready === false,
      '3p reconnect must preserve seat and invalidate readiness');

    const staleReady = await request('/session/ready', {
      method: 'POST',
      authority: oldGuestAuthority,
      body: command(oldGuestAuthority, 2, { ready: true }),
    });
    assert(staleReady.status === 403, '3p stale authority must not restore readiness');

    const blockedAfterResume = await request('/session/launch', {
      method: 'POST',
      authority: authorities[0],
      body: command(authorities[0], 2),
    });
    assert(blockedAfterResume.status === 409 && blockedAfterResume.body.code === 'crew-not-ready',
      '3p reconnect must close the launch gate');

    const reready = await request('/session/ready', {
      method: 'POST',
      authority: authorities[1],
      body: command(authorities[1], authorities[1].nextCommandSeq, { ready: true }),
    });
    assert(reready.status === 200, '3p resumed seat must be able to ready under the new epoch');
  }

  if (population === 4) {
    const fifth = await request('/join', {
      method: 'POST',
      body: {
        runId: started.body.session.runId,
        clientId: 'fifth-human',
        name: 'Fifth Human',
        roomCode: started.body.roomCode,
      },
    });
    assert(fifth.status === 409 && fifth.body.code === 'room-full', '4p room must reject a fifth human');
    const afterFifth = await request('/lobby', { authority: authorities[0] });
    assert(afterFifth.body.players.filter((player) => !player.isAI).length === 4,
      'Fifth-seat rejection must not mutate the four-player roster');
  }

  const hostLaunchSeq = population === 3 ? 2 : 2;
  const launched = await request('/session/launch', {
    method: 'POST',
    authority: authorities[0],
    body: command(authorities[0], hostLaunchSeq),
  });
  assert(launched.status === 200 && launched.body.session.status === 'running',
    `${population}p ready crew failed to launch: ${launched.status}/${launched.body.code}`);
}

async function run() {
  const runner = new TestRunner('MultiplayerRoomLobby');
  for (let population = 1; population <= 4; population += 1) {
    const port = BASE_PORT + population;
    await runner.run(`${population} human room admits, readies, and launches coherently`, async () => {
      await startSimServer(port, { keepAlive: true });
      try {
        await exercisePopulation(population, port);
      } finally {
        await stopSimServer(port).catch(() => null);
      }
    });
  }
  process.exit(runner.summary() ? 0 : 1);
}

run().catch((error) => {
  console.error('MultiplayerRoomLobby test fatal error:', error.stack || error.message);
  process.exit(1);
});
