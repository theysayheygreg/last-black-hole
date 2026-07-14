# Realistic External Multiplayer Test Plan

> Status: **SELECTED TEST APPROACH / NOT YET IMPLEMENTED**
>
> Product boundary: one private S20 match for Greg plus exactly three named
> external testers. This is not public matchmaking, verified cloud authority,
> hosted progression, or production service evidence.

## Decision

Use **Tailscale device sharing** for the first external LBH multiplayer test.
Run LBH on a disposable, separately enrolled `lbh-playtest` node and share only
that node with three named testers. Each tester uses their own Tailscale account
and tailnet; nobody joins Greg's tailnet.

Expose one loopback-only LBH origin through Tailscale Serve on HTTPS 443. Keep a
second admission layer inside LBH: three short-lived, one-use crew invitations
bound to the authenticated Tailscale identities and four authority seats.

Do not share GregBot itself. Do not use Tailscale Funnel for this test. Funnel
is public ingress and does not supply Serve's authenticated identity headers.
Do not use Cloudflare Tunnel or Access for the first external test; they add a
second provider and more operational surface without improving this fixed,
three-person playtest.

Official references:

- <https://tailscale.com/kb/1084/sharing>
- <https://tailscale.com/docs/features/tailscale-serve>
- <https://tailscale.com/docs/reference/inviting-vs-sharing>
- <https://tailscale.com/docs/reference/funnel-vs-sharing>

## Tester Contract

Each external tester must:

1. install Tailscale on the play machine;
2. sign into their own personal Tailscale account/tailnet;
3. accept a single-use share invitation for `lbh-playtest`;
4. open the full shared-node name, such as
   `https://lbh-playtest.<greg-tailnet>.ts.net`;
5. redeem their separate one-use LBH crew invitation.

The full `hostname.tailnet.ts.net` name is required for a machine shared across
tailnets. A tester sees only the shared playtest node, not Greg's other
machines. The share is revoked immediately after the session.

## Authority And Trust Boundary

- One match has one logical single-writer S20 authority.
- Greg plus three remote humans occupy the four admitted seats.
- A fifth seat rejects at share, invitation, router, session, and authority
  boundaries where applicable.
- Clients own input and presentation only. The authority owns movement,
  Ballpark state, contacts, loot, signal, death, extraction, events, and result.
- Results are local and visibly unverified. This test cannot mint verified
  inventory, currency, entitlement, Chronicle, or competitive history.
- The disposable node and match authority are trusted for this friends-only
  test; the external clients are not trusted as gameplay authorities.

## Network Shape

```text
three named external play machines
  -> each tester's own Tailscale account/tailnet
  -> individually accepted share of lbh-playtest only
  -> HTTPS/WSS :443, constrained by Greg's tailnet grants
  -> Tailscale Serve with authenticated user identity headers
  -> one reverse-proxy origin on 127.0.0.1
  -> static production client + bounded session API + one S20 authority

Greg's client
  -> the same HTTPS authority
```

No router port is forwarded. No subnet route or exit node is advertised. The
authority, control endpoints, and data stores never bind to a LAN or public
interface.

## Disposable Playtest Node

Create a dedicated Linux VM or equivalent isolated appliance on GregBot with
its own Tailscale node identity, for example `lbh-playtest-01`. It must:

- run only the pinned LBH production client, reverse proxy, and one authority;
- run as a non-root user with CPU, memory, process, and file-descriptor limits;
- mount immutable build artifacts and a small ephemeral match-data volume;
- have no access to Greg's home directory, SSH keys, Codex/OpenClaw secrets,
  browser profiles, Docker socket, unrelated repositories, or LAN services;
- expose the combined browser/API/WebSocket origin only on `127.0.0.1`;
- contain no dev server, hot reload, directory listing, source maps, test API,
  debug API, admin UI, public metrics, subnet router, or exit-node role.

Destroying or disconnecting this node must end all external reachability
without affecting GregBot's other Tailscale services.

## Tailscale Serve Front Door

Serve one origin so browser assets, HTTP admission, and WebSocket upgrades share
the same HTTPS authority and exact `Origin` policy:

```bash
tailscale serve --bg http://127.0.0.1:8787
tailscale serve status
```

Shutdown begins with:

```bash
tailscale serve off
```

Serve strips spoofed incoming Tailscale identity headers and adds authenticated
headers such as `Tailscale-User-Login` to the loopback request. LBH may trust
those headers only when the origin is loopback-only and reachable exclusively
through Serve.

## Access Grants And Sharing

Share `lbh-playtest-01` individually by email or three single-use links. Never
use a reusable share link for this test. Apply a tailnet grant that limits the
three exact tester identities to HTTPS 443 on the playtest node. The final rule
must use the actual node address and verified login identities; conceptually:

```json
{
  "grants": [
    {
      "src": [
        "tester-one@example.com",
        "tester-two@example.com",
        "tester-three@example.com"
      ],
      "dst": ["<lbh-playtest-tailscale-ip>"],
      "ip": ["443"]
    }
  ]
}
```

Before sending invitations, verify that shared users cannot reach SSH, raw sim,
database, status, metrics, admin, LAN, subnet, or exit-node services.

## LBH Admission

Tailscale proves which named tester reached the node. LBH still controls who
occupies the match:

- the host creates three random, single-use crew invitations;
- each invitation is bound to the run, expected Tailscale login, alias, and
  seat, and expires within 15 minutes if unused;
- the invitation is entered after opening LBH and never appears in a URL,
  referrer, analytics event, or retained log;
- redemption issues the existing scoped run/membership/connection authority;
- reconnect rotates connection authority and fences the prior epoch;
- Tailscale access without a valid LBH invitation cannot occupy a seat;
- forwarding a crew invitation to a different Tailscale identity fails;
- the authority accepts S20 only and rejects the fifth seat.

Store public aliases in match state, not email addresses. Keep Tailscale login
identities only in the smallest bounded admission record required for the live
session, then delete them during teardown.

## Implementation Slices

### T1 — Isolated node and single origin

- Build from a pinned clean v0.4 commit.
- Package the client, narrow reverse proxy, and one authority in the disposable
  node.
- Bind every application listener to loopback.
- Prove default local/offline launch remains unchanged.

### T2 — Serve and shared-node access

- Enroll the appliance as its own Tailscale node.
- Configure Serve for the single LBH origin.
- Add exact-user port-443 grants.
- Test one external share, revocation, and complete reachability loss.
- Document the tester install, accept, connect, and troubleshooting flow.

### T3 — Identity-bound game admission

- Add one-use crew invitations bound to Tailscale login, run, seat, protocol,
  authority incarnation, and expiry.
- Consume each invitation exactly once and issue the ordinary scoped connection
  authority.
- Prove mutation, replay, expiry, cross-identity, cross-seat, and fifth-seat
  attempts fail closed.

### T4 — Bounded session supervisor

- Verify authority readiness before enabling Serve.
- Auto-stop after the declared session lifetime or idle timeout.
- Stop Serve first on failure, then fence authority, revoke invitations, remove
  shares, and delete ephemeral state.
- Provide one local emergency command that removes ingress immediately.

### T5 — Four-human external playtest

- Greg and three external testers enter Crew Muster and launch together.
- Exercise movement, salvage, signal, reconnect, extraction/death, result,
  leave, and rematch.
- Record client network, authority cadence/CPU/memory, queue pressure,
  reconnect time, direct-versus-relayed Tailscale path, and cleanup outcome.
- Label all evidence `private shared-node playtest`; do not reuse it as cloud
  regional, provider-cost, packing, or verified-progression proof.

## Playtest Runbook

### Before the session

1. Boot a fresh `lbh-playtest` appliance from the pinned artifact.
2. Confirm only expected loopback listeners exist.
3. Start one four-seat S20 authority and the local reverse proxy.
4. Enable Serve and verify the full HTTPS name from Greg's client.
5. Apply exact-user 443 grants.
6. Send three single-use machine shares.
7. After each tester accepts, send their separate LBH crew invitation.
8. Confirm no tester can reach SSH or any non-443 service.

### During the session

1. All four players enter Crew Muster before world time advances.
2. Confirm names, host, seats, connection state, and next action are readable.
3. Launch once under host authority.
4. Complete the planned run and one deliberate reconnect.
5. Capture only sanitized performance and experience evidence.

### After the session

1. Stop Serve first and verify the HTTPS name is unreachable externally.
2. Fence and stop the authority.
3. Revoke all machine shares and unused game invitations.
4. Delete ephemeral identity and match state.
5. Archive only the sanitized report and explicitly requested media.
6. Destroy or reset the appliance before another session.

## Acceptance Gates

- No external tester becomes a member of Greg's tailnet.
- Each tester sees only the shared playtest node.
- No inbound router rule, LAN listener, subnet route, or exit-node role exists.
- Exact testers can reach HTTPS 443; they cannot reach SSH or any other port.
- A revoked machine share immediately loses access.
- A valid Tailscale identity without an LBH invitation cannot join.
- Each crew invitation redeems once and only for its bound identity and seat.
- Exactly four seats admit and the fifth rejects without disturbing the match.
- All four remain staged until the host launches the authority once.
- Every active client receives S20 at >=9 Hz; mean application traffic remains
  <=64 KiB/s/client; queues remain bounded.
- Reconnect fences the old connection epoch before accepting new input.
- Stopping Serve removes external reachability before authority cleanup.
- Local/offline play remains independent of Tailscale availability.

## Experience And Capacity Budget

Current S20 evidence is approximately 30–31 KiB/s per recipient. Three remote
recipients imply roughly 90 KiB/s of application payload leaving GregBot before
WebSocket, TLS, Tailscale relay/direct-path, and retransmission overhead.
Require a wired host connection, low bufferbloat, and at least 5 Mbit/s stable
upstream headroom.

Record whether each tester obtains a direct Tailscale path or uses DERP relay.
Do not require direct connectivity for admission, but separate relay results
when judging latency and movement feel.

## Abort Conditions

Stop Serve and end the session immediately if:

- GregBot itself, rather than the disposable node, was shared;
- any origin binds beyond loopback or a router port is forwarded;
- shared testers can reach anything except HTTPS 443 on the playtest node;
- the appliance can read host credentials, home data, Docker socket, or LAN;
- a Tailscale identity header can be supplied through a non-Serve route;
- a forwarded, replayed, expired, wrong-identity, or fifth invitation admits;
- a stale connection epoch or non-S20 client admits;
- malformed traffic causes authority instability or unbounded queues;
- private identity, token, IP, or payload data appears in retained evidence;
- local results reach verified/cloud progression;
- teardown cannot prove Serve closure, share revocation, authority fencing, and
  ephemeral credential deletion.

## Explicit Non-Goals

- public discovery, matchmaking, spectators, voice, chat, or moderation;
- browser-only access without installing Tailscale;
- Cloudflare Tunnel/Access or Tailscale Funnel for the first external test;
- sharing GregBot, subnet routing, exit-node access, or broad tailnet access;
- verified cloud progression or storefront entitlement;
- production SLA, DDoS guarantee, regional hosting, packing, or cost proof;
- eight players, S23/S23P admission, or 24/48/96-client capacity.
