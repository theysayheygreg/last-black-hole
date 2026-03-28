# LBH Dev Server and Process Model

## Current Process Model

LBH currently has **one local app runtime**, not a separate sim process.

That means:
- the **dev server** only serves files
- the **client runtime** (browser tab or wrapper) runs both render and sim
- the **test harness** starts its own temporary static server on a separate port

There is **not** a standalone authoritative sim PID yet.

## Canonical Ports

- **Dev server:** `8080`
- **Harness server:** `8719`

These are intentionally separate so tests never stomp on human playtesting.

## Canonical Commands

- `npm run dev`
- `npm run dev:status`
- `npm run dev:stop`
- `npm run dev:restart`

The harness commands remain:

- `npm test`
- `npm run test:renderer`

Those start and stop their own transient server automatically.

## Browser Tooling

LBH now includes project-scoped Chrome DevTools MCP config in:

- `/Users/theysayheygreg/clawd/projects/last-black-hole/.mcp.json`

Use it as a live browser inspection tool, not as a replacement for the test suite.

The practical split is:

- `npm test` / `npm run test:renderer` = deterministic truth
- Chrome DevTools MCP = visual inspection, console inspection, perf traces, interactive debugging

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

### Client runtime PID

Usually a browser or Electron process.

- owns render and sim **today**
- is separate from the static server
- is not tracked by a project pid file right now

## Future Process Model

The intended later shape is:

- **sim/server PID** — authoritative world update
- **client PID** — render, input, interpolation, presentation
- **harness PID set** — test-only server plus browser driver

That is future architecture, not current behavior.

## Practical Rule

For day-to-day work:

- use `npm run dev` for local playtesting
- use `npm test` or `npm run test:renderer` for transient harness work
- use Chrome DevTools MCP for live browser debugging on top of those paths
- do not guess at ports or restart random `python3 -m http.server` processes
