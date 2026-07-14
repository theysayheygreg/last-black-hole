# Optional Local Internet Host Plan

> Status: **OPTIONAL / NOT IMPLEMENTED**
>
> Product boundary: one private match hosted on GregBot for Greg plus exactly
> three invited remote players. This is not public matchmaking, verified cloud
> authority, hosted progression, or production service evidence.

## Decision

Add an optional v0.4 private-host lane that exposes a production-built browser
client and one S20 match authority through an identity-gated outbound tunnel.
The recommended ingress is a named Cloudflare Tunnel protected by Cloudflare
Access. Do not port-forward GregBot, expose a development server, or use a
shared password as the only access control.

If all players will install Tailscale, Tailscale Serve with individually
invited tailnet identities is the safer alternative because it is not publicly
reachable. Tailscale Funnel is not the default because public reachability
still requires an application authentication layer.

## Authority And Trust Boundary

- One session has one logical single-writer authority on GregBot.
- Greg plus three remote players occupy the four admitted S20 seats.
- A fifth seat is rejected by session, invite, router, and authority gates.
- Clients own input and presentation only. The authority owns movement,
  Ballpark state, contacts, loot, signal, death, extraction, events, and result.
- Results are local and visibly unverified. This lane cannot mint cloud
  inventory, currency, entitlement, Chronicle, or competitive history.
- Host availability and host integrity are trusted for this friends-only mode.

## Network Shape

```text
three invited browsers
  -> HTTPS/WSS
  -> Cloudflare Access: exact-email allowlist, short session
  -> Cloudflare Tunnel: outbound-only connector
  -> loopback-only ingress on an isolated Linux appliance
  -> static production client + one S20 match authority

Greg local client
  -> the same authority through a local-only route
```

Cloudflare Tunnel supports WebSockets and establishes outbound connections, so
the router requires no inbound rule. References:

- <https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/>
- <https://developers.cloudflare.com/cloudflare-one/faq/cloudflare-tunnels-faq/>
- <https://developers.cloudflare.com/cloudflare-one/access-controls/policies/>
- <https://developers.cloudflare.com/network/websockets/>

## Defense In Depth

### 1. Isolate the appliance

Run the authority, static client, and narrow reverse proxy in a disposable
Linux VM or restricted container. It must:

- run as a non-root user with a read-only root filesystem;
- drop capabilities and apply CPU, memory, process, and file-descriptor limits;
- mount only immutable build artifacts plus a small ephemeral data volume;
- have no access to Greg's home directory, SSH keys, Codex/OpenClaw secrets,
  browser profiles, Docker socket, unrelated project files, or LAN services;
- publish its origin only on `127.0.0.1` or a private sidecar network;
- contain no dev server, hot reload, directory listing, source maps, debug API,
  test API, control-plane admin surface, or public metrics endpoint.

The tunnel connector may reach only this appliance. No router port forwarding
or general LAN route is allowed.

### 2. Authenticate the public hostname

Protect the entire hostname, including `/`, `/api/session/*`, and `/ws`, with a
default-deny Cloudflare Access application.

- Allow only Greg and the three exact guest email addresses.
- Use email one-time PIN or an existing identity provider.
- Do not use `Include Everyone`, all valid emails, or a permanent bypass.
- Use a short Access session lifetime bounded to the play session.
- Verify the Access application audience/JWT at the local proxy as defense in
  depth; do not trust a caller-supplied identity header.
- Serve the client and WebSocket from one origin so browser authentication and
  exact `Origin` validation remain simple.

A shared password may be an additional join secret, but never the perimeter.

### 3. Admit exactly four players

After Access authentication, the host creates three one-use game invitations.
Each invitation is:

- bound to the run, one player alias, and one seat;
- random, single-use, and no longer than 15 minutes before redemption;
- entered after login, never placed in a URL, referrer, analytics event, or log;
- exchanged for a short-lived scoped connection grant;
- rotated on reconnect while the prior connection epoch is fenced.

The authority accepts S20 only. Every HTTP and WebSocket envelope has strict
type, size, sequence, rate, and identifier bounds. WebSocket upgrades require
WSS, the exact public `Origin`, a valid Access identity, and a valid scoped
game grant. Queue, reliable-action, heartbeat, reconnect, and idle limits stay
bounded and fail closed.

### 4. Minimize data and blast radius

- Store run-local public aliases, not email addresses or durable account ids.
- Strip or avoid logging Access cookies, JWTs, invite/grant values, client IP
  headers, provider identities, and raw payloads.
- Keep admin, shutdown, inspection, and invitation creation loopback-only.
- Accept no uploads, mods, chat, arbitrary filenames, or user-authored HTML.
- Delete ephemeral match state and invitations after shutdown. Retain only a
  sanitized run summary if explicitly requested.

## Implementation Slices

### Slice A — Immutable local appliance

- Build the static client and authority from a pinned clean v0.4 commit.
- Add a private-host production profile that exposes only static assets,
  bounded session admission, and `/ws`.
- Package it in the isolated appliance described above.
- Prove default local/offline launch remains unchanged.

### Slice B — Private admission

- Add host-created one-use invitations and short-lived connection grants.
- Bind each grant to run, player alias, seat, protocol, authority incarnation,
  and connection epoch.
- Prove replay, mutation, expiry, cross-seat use, and fifth-seat use fail.

### Slice C — Tunnel and Access adapter

- Configure a named tunnel for one disposable hostname.
- Protect the entire hostname with an exact-email Access policy.
- Verify Access identity at the local proxy and validate exact WebSocket
  origin. Keep tunnel credentials outside the repo and appliance image.
- Provide a check-only preflight and an explicit start/stop workflow.

### Slice D — Session supervisor

- Start one appliance and one authority, then verify loopback-only listeners.
- Start the tunnel only after authority readiness and Access-policy checks.
- Stop the tunnel first on failure or shutdown, then fence the authority,
  delete invitations, and remove ephemeral state.
- Auto-stop after a bounded session lifetime or a declared idle interval.
- Provide one local emergency command that kills ingress immediately.

### Slice E — Four-human validation

- Test from three distinct external browser profiles/networks plus Greg locally.
- Exercise invite, join, movement, salvage, signal, reconnect, extraction/death,
  result, leave, and rematch.
- Record state cadence, application bytes, authority CPU/memory, queue pressure,
  reconnect time, tunnel disconnects, and cleanup. Label this private-host
  evidence; do not reuse it as cloud packing or regional-hosting proof.

## Acceptance Gates

- No inbound router rule and no listener on a non-loopback host interface.
- An unauthorized email cannot fetch the client or upgrade `/ws`.
- Access success without a game invitation cannot join a match.
- Each invitation redeems once; expired, replayed, mutated, and cross-seat
  grants fail closed.
- Exactly four seats admit and the fifth rejects at every boundary.
- Every active client receives S20 at >=9 Hz in the representative profile;
  mean application traffic remains <=64 KiB/s/client.
- Reconnect fences the old connection epoch before accepting new input.
- Oversized, malformed, rate-excessive, and wrong-origin requests are rejected
  without authority instability or unbounded queues.
- Killing the tunnel immediately removes Internet reachability while local
  shutdown still fences the authority and deletes ephemeral credentials.
- Default local/offline play remains network-independent.

## Capacity And Experience Budget

Current S20 evidence is approximately 30–31 KiB/s per recipient. Three remote
recipients imply roughly 90 KiB/s of application payload leaving GregBot,
before WebSocket, TLS, tunnel, and retransmission overhead. Require a wired
host connection, low bufferbloat, and at least 5 Mbit/s stable upstream
headroom. Measure actual cadence and latency before calling the experience
playable.

Cloudflare may terminate long-lived WebSockets during network updates. The
shipping reconnect/epoch fence therefore remains mandatory.

## Abort Conditions

Stop and close the tunnel if any of the following occurs:

- origin binds beyond loopback or any router port is forwarded;
- Access is bypassed, widened beyond the four exact identities, or not enforced
  on the WebSocket upgrade;
- the appliance can read host credentials, home data, Docker socket, or LAN;
- a fifth seat, stale grant, stale connection epoch, or non-S20 client admits;
- malformed traffic causes authority instability or unbounded queues;
- private identity, token, IP, or payload data appears in retained logs;
- local results reach verified/cloud progression;
- shutdown cannot prove tunnel closure, authority fencing, and credential
  deletion.

## Explicit Non-Goals

- public discovery, matchmaking, spectators, voice, chat, or moderation;
- one shared global authority or multiple gameplay writers for the match;
- verified cloud progression or storefront entitlement;
- production SLA, DDoS guarantee, regional hosting, host packing, or cost proof;
- eight players, S23/S23P admission, or 24/48/96-client capacity.
