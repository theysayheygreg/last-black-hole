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
