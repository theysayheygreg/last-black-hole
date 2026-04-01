# LBH Dev Server and Process Model

## Current Process Model

LBH now has four distinct runtime roles:

- the **dev server** only serves files for local playtesting
- the **control plane** owns durable profile/session orchestration
- the **sim server** owns authoritative live-run truth
- the **client runtime** (browser tab or wrapper) renders locally and sends intent

The test harness still starts its own temporary static server on a separate port, and it can also start dedicated control-plane + sim processes for remote-authority coverage.

## Canonical Ports

- **Dev server:** `8080`
- **Harness server:** `8719`
- **Control plane:** `8791`
- **Sim server:** `8787`

These are intentionally separate so local playtesting, distributed-runtime work, and tests do not stomp on each other.

## Canonical Commands

- `npm run dev`
- `npm run dev:status`
- `npm run dev:stop`
- `npm run dev:restart`

The harness commands remain:

- `npm test`
- `npm run test:renderer`

The service-layer commands are now:

- `npm run control`
- `npm run control:status`
- `npm run control:stop`
- `npm run control:restart`
- `npm run sim`
- `npm run sim:status`
- `npm run sim:stop`
- `npm run sim:restart`

Those start and stop their own transient server automatically.

## Browser Tooling

LBH now includes project-scoped Chrome DevTools MCP config in:

- `/Users/theysayheygreg/clawd/projects/last-black-hole/.mcp.json`

Use it as a live browser inspection tool, not as a replacement for the test suite.

The practical split is:

- `npm test` / `npm run test:renderer` = deterministic truth
- Chrome DevTools MCP = visual inspection, console inspection, perf traces, interactive debugging
- `tests/infra-smoke.js` = lightweight process-stack canary for control plane + sim + remote client boot
- `tests/remote-authority.js` = deeper authoritative gameplay protocol coverage

When using Chrome DevTools MCP:

- prefer the dev server on `http://127.0.0.1:8080/` for normal playtesting
- use the harness server on `http://127.0.0.1:8719/` only when reproducing a test-specific path
- keep the sim server on `http://127.0.0.1:8787/` if you are inspecting remote-authority mode

This keeps the tools from stomping on each other.

## PID Files

LBH writes process metadata to `tmp/`:

- `tmp/dev-server.pid`
- `tmp/dev-server.json`
- `tmp/harness-server.pid`
- `tmp/harness-server.json`

These files are runtime state only and are intentionally ignored by git.

## What Each PID Means

### Dev server PID

The long-lived file server for local playtesting.

- serves the project on `http://127.0.0.1:8080/`
- does **not** run gameplay logic
- does **not** own the sim

### Harness server PID

The short-lived file server started by test scripts.

- serves the project on `http://127.0.0.1:8719/`
- exists only while tests are running
- should never be reused as the human playtest server

### Control plane PID

The long-lived durable orchestration layer.

- owns profile/session endpoints
- mirrors live sessions outside disposable sim instances
- should survive sim restarts

### Sim server PID

The long-lived authoritative run server.

- owns live run truth
- registers as a disposable instance with the control plane
- is the real remote-authority process

### Client runtime PID

Usually a browser or Electron process.

- owns render and UI
- can still run locally without remote authority
- speaks to the sim server in remote mode
- is separate from the static server
- is not tracked by a project pid file right now

## Future Process Model

The intended later shape is still the same graph, just more distributed:

- **persistent data/control plane PID(s)**
- **instanced sim PID(s)**
- **client PID(s)**
- **harness PID set**

That future work is now an extension of the current model, not a different one.

## Practical Rule

For day-to-day work:

- use `npm run dev` for local playtesting
- use `npm run control` + `npm run sim` when testing the real distributed stack manually
- use `npm test` or `npm run test:renderer` for transient harness work
- use Chrome DevTools MCP for live browser debugging on top of those paths
- do not guess at ports or restart random `python3 -m http.server` processes
