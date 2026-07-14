# v0.4 Changelog

> Detailed branch-local changes for `codex/v0.4-multiplayer-architecture`.
>
> Add v0.4 work here. When v0.4 merges or promotes, summarize the larger
> revision once in `docs/journal/CHANGELOG.md` and link back to this file.
> Earlier v0.4 history remains in the legacy project changelog and git; this
> file is the canonical journal from 2026-07-14 forward.

## Unreleased

### Documentation workflow

- Split detailed decisions and changes into version-local journals for v0.2,
  v0.3, and v0.4 while preserving the combined project journals as archive.
- Reserved the project-wide decision log for cross-version rules and the
  project changelog for larger branch-merge or version-promotion summaries.
- Updated the project contract so future agents write to the active version's
  journals by default.

### Human multiplayer product

- Opened `FOUR-HUMAN-PRODUCT-PLAN.md` as the active front-door-through-rematch
  contract after closing architecture and costing.
- Added Crew Muster: a frozen one-through-four-player lobby, host-controlled
  synchronized launch, four-seat admission, fifth-seat rejection, and no
  gameplay input before the run begins.
- Removed split-reality fallback. Failed multiplayer admission remains visible
  instead of silently starting a separate local universe.
- Preserved immediate-start harness behavior and explicit offline/local play.
- Added explicit private host/join choices, a bounded six-character room code,
  deterministic four-seat roster, connection-bound readiness, and host launch
  gating.
- Added durable wrong-code, not-ready, and room-full errors plus reconnect
  readiness invalidation without widening the fixed S20 gameplay projection.
- Added a fast one/two/three/four-player lobby matrix covering seat order,
  non-host denial, reconnect epoch fencing, and fifth-seat rejection.
- Added a five-browser human-surface proof: host, join-code entry, four-seat
  convergence, readiness, leader launch, durable fifth rejection, shared run,
  and stable client/membership identity across reconnect.
- Fixed Crew Muster's first-frame prompt crash, uncoupled lobby refresh from
  render cadence, and marked dynamic authority responses non-cacheable.
- Clamped the human client surface to four seats and replaced the stale
  immediate-launch/eight-player playable-lane test with the private-room proof.
- Preserved finite well presentation data across staggered component arrival
  and made spatial well audio fail safe instead of crashing on a transient
  non-finite pan value.
- Finished the human multiplayer front door: copyable invitations, labeled-text
  paste parsing, explicit offline play, and stream as the configured product
  default while retaining explicit HTTP diagnostics.
- Added honest durable failures for invalid, full, expired, unavailable, and
  incompatible-version rooms. Retired invitation hashes are bounded and room
  codes rotate without reuse across the retained window.
- Extended the browser proof through unavailable-authority offline recovery,
  invite copy/paste, wrong-code recovery, fifth-seat rejection, shared launch,
  and reconnect; added authority proof for expired invitations and protocol
  proof for incompatible builds.
- Started shared-run readability with stable public P1–P4 seat/link identity,
  plus a compact edge crew rail that distinguishes the local pilot from remote
  crew under Three.
- Added four-browser agreement checks for ordered crew identity and pure HUD
  state coverage for alive, link-lost, dead, and extracted presentation.
- Removed cargo count from the public extraction event; teammate cargo and
  individual signal remain owner-private and are not inferred by presentation.
- Added public authority lifecycle events for link loss and successful resume,
  including stable seat/name context for observers and explicit leave events.
- Added low-clutter crew callouts for death, extraction, link loss/recovery,
  and leave while keeping persistent outcome truth in the P1–P4 crew rail.
- Added an honest public world-pressure meter from Inhibitor pressure rather
  than presenting private pilot signal as shared crew state.
- Extended the four-browser journey through observer-visible death, real portal
  extraction, delayed disconnect/recovery, and explicit UI leave, with captured
  evidence for each transition.
- Prevented malformed portal coordinates from leaking `NaN` into the route HUD.

### External playtest

- Replaced the Cloudflare-first proposal with a disposable Tailscale shared
  node that external testers access from their own tailnets.
- Selected Tailscale Serve on one loopback-only HTTPS origin, exact-user
  port-443 grants, and identity-bound one-use LBH invitations.
- Added tester onboarding, bounded start/stop procedure, share revocation,
  direct-versus-DERP evidence labeling, and explicit teardown gates.

### Planning truth

- Kept S20 as the admitted one-through-four product path and eight-player v0.4
  closed.
- Corrected hosted wording: provider-neutral SQLite/HTTP services are proven as
  a local reference; production provider composition and public deployment
  remain open.
- Kept additional costing, packing, regional hosting, and high-count work behind
  the completed four-human product gate.
