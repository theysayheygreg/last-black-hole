# v0.4 Decisions

> Branch: `codex/v0.4-multiplayer-architecture`
>
> This is the decision log for v0.4. Record detailed v0.4 choices here, not in
> `docs/journal/DECISION-LOG.md`. The project-wide log receives one summarized
> promotion entry when v0.4 merges, plus any genuinely cross-version rule.

Statuses:

- **ACTIVE** — current v0.4 product or engineering truth.
- **PROVISIONAL** — selected to unblock testing; Greg has not ratified it as a
  shipping policy.
- **REJECTED** — investigated and intentionally closed.
- **SUPERSEDED** — preserved for history but replaced by a later decision.

## Current Decision Index

| Decision | Status | Detailed source |
|---|---|---|
| S20 is the one-through-four-player product path | ACTIVE | `MULTIPLAYER-DECISION-PACKET.md` |
| one logical single-writer authority per match | ACTIVE | `ARCHITECTURE.md` |
| eight-player v0.4 admission remains closed | REJECTED | `COMPLETION-AUDIT.md` |
| four-human product completion is the active goal | ACTIVE | `FOUR-HUMAN-PRODUCT-PLAN.md` |
| Crew Muster stages players before world time begins | ACTIVE | entry below |
| readiness belongs to the current connection epoch | ACTIVE | entry below |
| configured multiplayer defaults to stream with explicit offline recovery | ACTIVE | entry below |
| public run identity exposes seat and link state, not private loadout truth | ACTIVE | entry below |
| connection lifecycle is public match coordination state | ACTIVE | entry below |
| external test uses a disposable Tailscale shared node | ACTIVE | `OPTIONAL-LOCAL-INTERNET-HOST.md` |
| hybrid verified authority plus private continuity | PROVISIONAL | `OPEN-DECISIONS.md` |

## 2026-07-14 — External test uses a disposable Tailscale shared node

**Status:** ACTIVE

The first external four-human test runs one S20 authority on a disposable,
separately enrolled `lbh-playtest` node. Share only that node with three named
testers through Tailscale device sharing. Testers use their own accounts and
tailnets; they never join Greg's tailnet.

Tailscale Serve exposes one loopback-only HTTPS origin. Exact-user port-443
grants and identity-bound, one-use LBH crew invitations form independent
network and game admission layers. Do not share GregBot, enable Funnel, add
Cloudflare as a first-test dependency, advertise subnets/exit-node access, or
treat the result as verified cloud evidence.

**Why:** this is the shortest private path to an external test while keeping
the shared surface narrow, revocable, and disposable.

## 2026-07-14 — Configured multiplayer defaults to stream and preserves offline choice

**Status:** ACTIVE

A configured authority presents Host Private, Join Private, and Play Offline as
explicit peer choices. Stream is the normal admitted multiplayer transport;
`simTransport=http` remains a deliberate diagnostic rollback. Failed or absent
private rooms never auto-host and never silently become local play. The player
may instead choose offline, which uses the existing local simulation without
contacting or depending on the configured authority.

Invitations are bounded six-character codes with copy and labeled-text paste.
Invalid, full, expired, unavailable, and incompatible-version failures remain
visible with a recovery action. Retired codes are stored only as a bounded hash
window.

**Why:** availability and compatibility failures must be honest, while local
play must remain usable without turning a multiplayer failure into split truth.

## 2026-07-14 — Shared-run identity is public coordination state

**Status:** ACTIVE

Running public player projections retain the stable P1–P4 seat and current link
state already established in Crew Muster. Presentation may use public pilot
name, hull, outcome, position, seat, and link state for a compact crew rail and
future visually proven world markers. Cargo, individual signal, equipment,
effects, detailed ability state, and private rewards remain owner-private.

Public Inhibitor pressure may later be shown as world pressure; it must not be
labeled as a sum of crew signal. Public extraction events do not expose cargo
count.

**Why:** humans need to know who is present and what happened to the crew, but
readability is not permission to widen private progression or inventory truth.

## 2026-07-14 — Connection lifecycle is public match coordination state

**Status:** ACTIVE

The current match authority publishes `player.disconnected` only when the
active fenced stream epoch closes, and `player.reconnected` only after a resume
admission restores that player. Both carry stable public seat/name identity.
The current player also derives a local reconnecting state directly from its
transport while snapshots are unavailable. Ordinary leave remains a distinct
authority event and removes the seat immediately.

These events authorize connection presentation only. They do not transfer
gameplay authority, reveal private player state, or relax old-epoch fencing.

Transient stream loss presents as reconnecting. Exhausted or explicitly
non-reconnectable recovery presents as a persistent failure, releases local
continuous gameplay intent, and stops new gameplay dispatch. Returning to the
launch choices is a local, immediate UI action: it does not claim that the
authority removed the body, and it never silently starts offline play. The
authority continues the existing reservation/expiry contract independently.

**Why:** humans need to distinguish a dead pilot, a temporarily broken link,
and someone who intentionally left without guessing from a disappearing ship.

## 2026-07-14 — A disconnected live body remains authoritative for 90 seconds

**Status:** ACTIVE

When an active human connection closes, the match authority releases held
thrust, braking, slingshot, ability, pulse, extraction, and consumable input but
does not freeze, despawn, protect, or transfer the body. The stable seat and
body remain reserved for 90 simulation seconds while currents, collisions,
hazards, death, and extraction continue normally. Public crew state may show
the remaining reservation time.

A valid resume rotates the connection epoch and clears the deadline. Expiry
commits an abandoned outcome, removes the player and its authority grant, and
promotes the next connected human when the departed player was crew leader.
Tests may shorten the window explicitly; the product default remains 90
seconds.

**Why:** a network interruption must not grant invulnerability, duplicate a
body, preserve stale control, or dissolve the crew's leadership state.

## 2026-07-14 — Crew Muster is the synchronized multiplayer start boundary

**Status:** ACTIVE

One through four humans stage on a frozen match authority before the run. Sim
time, AI, hazards, and world consequences do not advance until the host launches
once. Non-host launch, pre-launch gameplay input, and a fifth seat fail closed.

A failed multiplayer admission must remain a visible multiplayer failure. It
must never silently start a separate local universe. Offline/local launch stays
available only through its explicit product path.

**Why:** the earlier auto-host/auto-join flow let the first player and AI begin
consuming the universe while later humans navigated menus. That was technically
multiplayer but not a fair or understandable human game.

## 2026-07-14 — Lobby truth does not depend on render cadence or HTTP caches

**Status:** ACTIVE

Private-room roster, readiness, connection, and launch state refresh on a
bounded control cadence independent of animation frames. Dynamic sim/control
responses are explicitly non-cacheable. A backgrounded, throttled, or newly
focused client must converge on current authority truth rather than retaining
the roster it saw when it joined.

**Why:** a multiplayer lobby is coordination state. Treating it like render
work or cacheable content made different humans see different crews even while
the authority itself was correct.

## 2026-07-14 — Private-room readiness is connection-bound lobby state

**Status:** ACTIVE

A staged private match exposes a bounded six-character room code through the
host's authenticated control response. Joining guests must present that code;
the authority assigns the lowest free seat from zero through three. Readiness
is self-authored, visible through the authenticated lobby projection, and reset
whenever that membership reconnects or loses its current connection epoch.
Only the host may launch, and launch requires every occupied human seat to be
connected and ready.

Lobby connection/readiness fields do not widen S20 gameplay entity components
or become a second authority stream. They remain control-plane state owned by
the same per-match authority.

**Why:** a human lobby needs truthful seats and readiness, while the admitted
gameplay replication contract should stay fixed and fail-closed.

## 2026-07-14 — Four-human product completion follows architecture closeout

**Status:** ACTIVE

The architecture and costing program is closed. The active v0.4 goal is the
human journey from private crew creation through synchronized launch, shared
run, reconnect, truthful result, leave, and rematch. Four humans are the
acceptance gate; one through three humans remain supported party sizes.

Do not reopen eight-player replication, high-count capacity, provider costing,
host packing, public matchmaking, built-in voice, or production cloud work as
a substitute for completing this journey.

## 2026-07-14 — Authority and replication product boundary

**Status:** ACTIVE

Verified gameplay uses one logical single-writer authority for each match. If
`M` matches are concurrent, `M` independently fenced authorities exist. S20 is
the admitted replication path for one through four clients. Measured packing
may later place multiple authorities on one host; there is never one global
gameplay authority and there is no unmeasured packing claim.

S23, S23P, and the reverted split-fragment experiment do not admit eight-player
v0.4. True authority-free public P2P remains rejected. Private player-hosted
authority remains a visibly unverified continuity option.

## Decision Routing

Add a v0.4 entry when work changes product behavior, authority/trust ownership,
protocol admission, persistence semantics, player-visible policy, evidence
interpretation, or release scope. Ordinary implementation detail belongs only
in `CHANGELOG.md`.

When v0.4 is promoted, add one project-wide summary to
`docs/journal/DECISION-LOG.md` linking here. Do not copy every entry into the
project log.
