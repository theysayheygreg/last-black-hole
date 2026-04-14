# LBH Runtime Modes

LBH now has explicit runtime modes instead of one vague "start everything" path.

These modes preserve the original architecture intent:

- the client renders locally
- the sim stays authoritative
- the control plane owns durable orchestration
- the stack should be understandable by humans, not only by people who know the ports

## Modes

### `local-browser`

Client-only browser play against no authority stack.

- starts: dev server
- does not start: control plane, sim
- use when: renderer, HUD, and local-only client work

Command:

- `npm run stack:browser`

### `local-host`

Local browser client bound to a locally running authority stack.

- starts: dev server, control plane, sim
- opens the client pointed at `http://127.0.0.1:8787`
- use when: architecture work, local multiplayer/dev authority work, real run truth checks

Commands:

- `npm run stack`
- `npm start`

### `remote-client`

Local browser client pointed at a remote sim.

- starts: dev server
- does not start: local control plane or sim
- use when: MacBook client against mini authority, Tailscale/LAN validation

Command:

- `npm run stack:remote -- --sim=http://HOST:PORT`

### `embedded-desktop`

Packaged Electron app with embedded authority.

- starts inside the app: embedded control plane + embedded sim
- no terminal required for ordinary local packaged play
- use when: local packaged desktop playtests

This is not launched through `npm run stack:*`; it is the packaged app behavior.

### `test-harness`

Transient deterministic automation mode.

- starts its own temporary servers and browsers
- owns its own ports and cleanup
- use when: `npm test` and `npm run test:renderer`

## Status

Use:

- `npm run stack:status`

That prints:

- mode inventory
- dev server status
- control plane status
- sim status
- current stack summary when live services respond

## Why this exists

LBH had already grown these modes in code, but they were still implicit in:

- ports
- query params
- separate scripts
- Electron packaging behavior

Making them explicit keeps feature work honest and makes remote play, packaging, and testing easier to reason about.
