# Orrery v0.3 RC Contract Corrections

> Review receipt for the no-retry candidate run at
> `/private/tmp/lbh-v03-rc-a958a8c6-full-20260727T235200Z`.

## Scope

- Original candidate: `a958a8c68b6c9f14054fe012882326dcae32f910`
- Correction base: `de94856de8538bff2249deae214d4e1c315a4e98`
- Worktree: `/private/tmp/lbh-v03-orrery-rc-contracts`
- Full receipt: `test-full.log` and `summary-lines.txt` in the receipt directory
- Original full result: 86/119 suites passed, 33 failed, zero retries, 300.10s wall time

This table classifies the original 33 `FAIL` rows. It is a classification of that
receipt, not a claim that every failure remains red after the focused contract
updates below.

## All 33 Failed Rows

| # | Suite row | Classification | Receipt symptom and current disposition |
|---:|---|---|---|
| 1 | Validation | stale contract | Expected retired `u_inhibitorForm`; updated to collection-shaped renderer data. |
| 2 | DesktopPackage | missing dependency/infrastructure | Isolated receipt worktree lacked `@electron/packager`; package lane dependency closure was separately green. |
| 3 | SteamDeckCompat | stale contract | Expected retired Fuel/Signal HUD rails; updated to Hull + Noise. |
| 4 | CloudflareDrop | missing dependency/infrastructure | Same isolated-worktree `@electron/packager` absence. |
| 5 | RendererAuthority | stale contract | Expected deleted `authorityDriven` early-return text; updated to verify remote visual anchors and local-force suppression. |
| 6 | BallparkQueries | stale contract | Expected retired `blockedByInhibitor`; updated to lifecycle filtering with closed portals. |
| 7 | SimLifecycle | stale contract | Expected scalar inhibitor fields and old final-portal marker; updated to Conductor schedule, collection, and live final exfil. |
| 8 | AuthorityBudget | missing dependency/infrastructure | Full-lane cadence sample lost a deadline under host contention; isolated rerun was green. |
| 9 | AuthorityCadence | missing dependency/infrastructure | Full-lane Deep Field deadline sample lost deadlines under host contention; isolated rerun was green. |
| 10 | Inhibitor | current product defect | Original row mixed retired form/portal tests with two live behavior paths; collection fixture now passes after the Vessel human-target fix. |
| 11 | VFX | missing dependency/infrastructure | Receipt worktree lacked `three/build/three.module.js`. |
| 12 | RulerLive [three] | missing dependency/infrastructure | Browser `__TEST_API` boot timed out before the fixture. |
| 13 | SlingshotV2Live [three] | missing dependency/infrastructure | Browser `__TEST_API` boot timed out before the fixture. |
| 14 | ThreeEntityLifecycle | missing dependency/infrastructure | Receipt worktree lacked `three`. |
| 15 | HudDeck | stale contract | Fixture portals omitted current exit identity and asserted Fuel/Signal selectors; updated to typed exits and Noise. |
| 16 | Smoke [three] | missing dependency/infrastructure | Browser bootstrap did not expose `window.__TEST_API` / `CONFIG`. |
| 17 | Coordinates [three] | missing dependency/infrastructure | Same browser bootstrap cascade. |
| 18 | FluidWindow [three] | missing dependency/infrastructure | Same browser bootstrap cascade. |
| 19 | Inventory [three] | missing dependency/infrastructure | Same browser bootstrap cascade. |
| 20 | Systems [three] | missing dependency/infrastructure | Same browser bootstrap cascade. |
| 21 | RunResults [three] | missing dependency/infrastructure | Same browser bootstrap cascade. |
| 22 | Flow [three] | missing dependency/infrastructure | Same browser bootstrap cascade. |
| 23 | MetaFlow [three] | missing dependency/infrastructure | Same browser bootstrap cascade. |
| 24 | Controller [three] | missing dependency/infrastructure | Same browser bootstrap cascade. |
| 25 | KeyboardMouse [three] | missing dependency/infrastructure | Same browser bootstrap cascade. |
| 26 | InfraSmoke [three] | missing dependency/infrastructure | Same browser bootstrap cascade. |
| 27 | TelemetrySmoke [three] | missing dependency/infrastructure | Same browser bootstrap cascade. |
| 28 | RemoteAuthority [three] | missing dependency/infrastructure | Same browser bootstrap cascade. |
| 29 | AgentPlayEval [three] | missing dependency/infrastructure | Browser `__TEST_API` bootstrap failed; no current AgentPlay green claim. |
| 30 | Renderer [three] | missing dependency/infrastructure | Same browser bootstrap cascade. |
| 31 | UIVisual [three] | missing dependency/infrastructure | Isolated receipt worktree lacked the renderer/browser dependency path. |
| 32 | AudioRCRecovery | stale contract | Expected retired `portalBlocked` terminal cue; updated to current portal/extract/death cues. |
| 33 | ConfigRedFlags | stale contract | Expected old tuning-module Signal ownership; updated to canonical `scripts/sim/noise-radius.cjs`. |

### Counts

| Classification | Rows |
|---|---:|
| stale contract | 8 |
| missing dependency/infrastructure | 24 |
| current product defect | 1 |
| **total** | **33** |

## Focused Correction

The one source defect was in `scripts/sim/inhibitor-ecology.cjs`: Vessel
strategic target selection considered AI pilots before the local human pilot
when an AI happened to be nearer. Vessels now prefer the nearest alive human
target, falling back to AI only when no human target exists. This keeps Swarm
decoy acquisition and Vessel pursuit distinct in a solo run without changing
Noise authority or adding a perception framework.

The remaining corrections are current-contract test/fixture updates only:

- collection-shaped Inhibitor projection replaces scalar form and pressure;
- active exfils are typed exits and no longer expose portal-block state;
- HudDeck, Steam Deck, UI source fixtures, and audio checks use Heat/Noise truth;
- RendererAuthority checks the current remote-anchor/local-force split;
- ConfigRedFlags checks canonical Noise data ownership;
- SimLifecycle checks the canonical map-duration final exfil;
- the old Swarm wreck-disturbance assertion is replaced by the current listener contract.

## Focused Proof

After `npm ci` in the pinned worktree, these direct checks were run without the
full suite, package build, or browser retry loop:

- `node tests/validation.cjs`: **47 passed, 0 failed**.
- `node tests/hud-deck.cjs`: **2 passed, 0 failed**, including the 1280x800 HUD layout.
- `node tests/steam-deck-compat.cjs`: **passed**.
- `node tests/renderer-authority.cjs`: **10 passed, 0 failed**.
- `node tests/ballpark-queries.cjs`: **7 passed, 0 failed**.
- `node tests/config-red-flags.cjs`: **6 passed, 0 failed**.
- `node tests/audio-rc-recovery.cjs`: **1 passed, 0 failed**.
- `node tests/sim-lifecycle.cjs`: **7 passed, 0 failed**.
- `node tests/inhibitor.cjs`: **6 passed, 0 failed**.
- `node tests/authority-budget.cjs`: **1 passed, 0 failed**; observed 14.99Hz.
- `node tests/authority-cadence.cjs`: **1 passed, 0 failed**; Shallows 15.014Hz,
  Expanse 14.998Hz, Deep Field 14.987Hz, zero skipped deadlines.

The current focused proof does not turn the original 119-suite receipt green.
The full candidate remains failed and the browser/AgentPlay infrastructure red
is intentionally left for the async harness lane.
