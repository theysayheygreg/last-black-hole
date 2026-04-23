# Project Review — 2026-04-20

Scope: overall Last Singularity repo review after the Composer renderer migration, server/client architecture work, and nightly-build cleanup.

## Verified

- GitHub Actions `Nightly Playables` is currently green on `origin/main` at `312118b`.
- Latest scheduled run: <https://github.com/theysayheygreg/last-black-hole/actions/runs/24662754838>
- Latest `nightly-latest` release contains web, Windows, and macOS assets.
- GitHub Pages deployment is intentionally optional and currently skipped because `LBH_ENABLE_GITHUB_PAGES` is not enabled.
- Local `node scripts/build-health.js status` reports current health via the health-record commit.
- Local `npm run build:web` succeeds. The current artifact naming target is `last-singularity-web/` plus `last-singularity-playtest-v<version>.zip`.
- The harness now exposes `npm run test:title-prototype` for the standalone Composer title visual canary.
- Echo persistence is map+seed scoped in code and covered by control-plane tests.
- Remote snapshots include `inhibitor.threshold` and `inhibitor.pressureFrac`; remote-authority tests assert both.

## Fixed In This Pass

- `README.md` now describes current Node expectations, build output paths, optional GitHub Pages behavior, the expanded harness, the Composer renderer, control-plane persistence, and current project structure.
- `scripts/build-health.js` now includes the title-prototype Composer probe alongside `npm test` and renderer fixtures.
- User-facing packaging and nightly asset names now use **Last Singularity**.
- `ROADMAP.md` and `BUILD-PLAN.md` current-status blocks now reflect the April 20 renderer/harness/nightly state.

## Findings

### Resolved — Public naming split

Decision: the public product name is `Last Singularity`. The repository path can remain `last-black-hole` as an implementation/location detail until the remote is intentionally renamed.

### Resolved — Roadmap/build plan status drift

`docs/project/ROADMAP.md` and `docs/project/BUILD-PLAN.md` now present April 20 as the live current-status snapshot while preserving the historical jam plan below it.

### Superseded — Production renderer and prototype renderer differ by design

This April 20 note is superseded by the April 23 production chain. The game now defaults to the rich Composer chain and keeps `?minimalrender=1` as the cheap perf baseline. The standalone title prototype remains a focused visual probe, not the only Bloom path.

Recommended next step: after 5x5/10x10 perf work, decide whether Bloom belongs in production behind a config flag.

### P3 — Nightly Pages wording can drift again

The workflow supports optional Pages deployment, but the public outcome is the rolling `nightly-latest` release unless `LBH_ENABLE_GITHUB_PAGES=true`. README now says this, but release posts and bot summaries should use the release URL as the stable default.

Recommended next step: keep daily automation language pointed at `nightly-latest`; mention Pages only when the repo variable is enabled.

## Recommended Next Queue

1. Push the local green commits so nightly can build the current renderer/harness/product-name work.
2. Decide whether Bloom belongs in production, title-only, or config-gated after the 5x5/10x10 perf pass.
3. Add one CI-side `npm test` or `build-health verify` workflow if nightly artifacts should be blocked by the full harness instead of build-only success.
