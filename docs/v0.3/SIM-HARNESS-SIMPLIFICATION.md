# v0.3 Simulation, Harness, and Human-Clarity Simplification

> Status: source/harness acceptance complete at source `3b2cb022`.
> Updated 2026-07-26 on `codex/v0.3-sim-harness-simplification`.
>
> Branch: `codex/v0.3-sim-harness-simplification`
>
> `BASELINE_SHA=20184fae84b559abf27717c046811673040d987a`

This ledger owns the v0.3-only movement-clock normalization, harness throughput
work, and behavior-preserving clarity refactors. The older `6a98e396` checkpoint
is superseded. No v0.2, `main`, or v0.4 commits may enter this branch.

## Program contract

- Every map integrates authoritative gameplay at one shared 15 Hz movement
  clock. A dense map is optimized rather than simulated less faithfully.
- Snapshot polling, rendering, client presentation, visual LOD, transport
  budgets, and non-gameplay diagnostics are named and scheduled separately.
- Outside the movement-rate change and measured performance work, product and
  authority behavior matches `BASELINE_SHA` by elapsed wall time.
- The ordinary and candidate harness paths must each report comparable wall
  time. The primary 2x claim uses `npm test`; `test:full -- --no-retries` is the
  secondary candidate receipt. Relevant coverage cannot disappear to create
  the speedup.
- Refactors proceed by owned vertical, prefer deletion, and land as separable
  commits. Vanilla JS and the current ESM/CJS packaging boundary remain.

## Phase 0 receipt

Machine baseline: `gregbot.lan`, macOS 27.0 arm64, Node 22.22.3, npm 10.9.8.
The isolated worktree was restored with `npm ci` before valid timings. The first
13.60-second `test:fast` attempt is excluded because dependencies were absent.

| Lane | Baseline wall time | State | Suites / browser suites | Notes |
| --- | ---: | --- | ---: | --- |
| `test:fast` cold | 17.55 s | pass | 46 / 1 | No retries. |
| `test:fast` warm | 13.04 s | pass | 46 / 1 | No retries. |
| `npm test` | 93.62 s | red | 65 / 7 | `Coordinates` randomized-layout assertion; zero retries. Ordinary comparable path. |
| `test:authority -- --no-retries` | 126.53 s | red | 47 / 5 | `RemoteAuthority` passed 2/18 assertions before fixture/session-state failures cascaded. |
| `test:sim-structure -- --no-retries` | 32.55 s | pass | 35 / 0 | Instrumented child total 32.36 s. |
| `test:full -- --no-retries` | 1,028.63 s | red | 95 / 19 | Instrumented once; 1,028.41 s was child execution and 0.22 s runner overhead. |

The requested five lanes invoke 193 suite children for only 87 unique suites.
`fast` is an exact subset of `core`. The runner uses serial `spawnSync`, emits
no per-suite duration or process ledger, and can launch at least 19 Chrome
process groups in `full`. Fixed ports and shared temp/server paths currently
prevent safe browser or authority parallelism. Pure Node suites are the first
parallelization target; browser/sim shards require explicit resource groups,
unique ports, profiles, temp roots, and artifact roots.

The full baseline spent 75.60 seconds in 76 Node suites and 952.81 seconds in
19 browser suites. Its largest costs were `UIVisual` 466.65 s (pass),
`Renderer` 132.77 s (red), `AgentPlayEval` 63.00 s (red), `MetaFlow` 56.73 s
(red), `Controller` 38.54 s (red), `RemoteAuthority` 30.82 s (red),
`KeyboardMouse` 29.54 s (pass), and `Flow` 27.43 s (pass). Other full failures
were `AudioToolkit` (missing Python numpy), `RulerLive`, and `Coordinates`.
These are baseline facts, not failures introduced by this program.

The measured targets are:

- ordinary `npm test`: at most **46.81 seconds** with the same relevant
  checkpoint coverage;
- candidate `test:full -- --no-retries`: at most **514.32 seconds** with the
  same relevant candidate coverage.

Node batching alone cannot halve `full`; `UIVisual` plus `Renderer` already cost
599.42 seconds serially. Resource isolation must let those visual shards overlap
or reduce at least 85.10 seconds of their deterministic setup/capture cost while
the Node work runs independently.

Baseline nonblank JS-family lines:

| Surface | Lines |
| --- | ---: |
| `src/` | 29,847 |
| `scripts/` | 19,732 |
| `desktop/` | 639 |
| Production total | 50,218 |
| `tests/` | 22,567 |

The largest owners are `scripts/sim-runtime.cjs` (7,499 lines),
`src/main.js` (6,896), `src/fluid.js` (1,245), `src/audio.js` (1,223),
`src/hud.js` (1,069), and `src/render-three/three-renderer.js` (1,027).
Production and test LoC are measured separately after every milestone.

## Baseline behavior manifest

The compatibility boundary is product behavior by elapsed wall time. The
approved movement-rate change replaces the old per-map rates with one 15 Hz
authority clock; it is not a physics retune. Existing representative proof
owns these outcomes:

| Boundary | Baseline proof |
| --- | --- |
| Movement by elapsed time | `movement-golden`, `movement-trajectory-parity`, `movement-contract` |
| Fuel burn and recovery | `fuel-recovery`, delivered input and delta-v snapshot fields |
| Slingshot windows and release | `slingshot-v2`, `slingshot-edge-queue`, `slingshot-dt-static` |
| Gravity, contact, and consequences | `gravity-family`, `force-ledger`, `sim-well-grace`, `swept-authority` |
| Spawn, maps, and routes | `w2a4-map-scale`, `route-briefing`, `sim-scale` |
| Protocol and snapshot shape | `sim-protocol`, `protocol-v2-authority`, `snapshot-rebase` |
| Renderer-neutral presentation | `presentation-frame`; renderers consume the sanitized presentation frame |
| Menu, results, and continuity | `run-results`, `agent-play-eval`; `__TEST_API` fixture injection is not product proof |
| Package and entrypoints | `desktop-package`, package scripts for play/stack/sim/control |

Phase 1 derives every exported session `tickHz` from
`MOVEMENT.authority.integrationHz`, removes map and overload gameplay clocks,
and advances wells, world objects, portals, growth, scavengers, waves, seeded
sea, AI, fauna, contacts, fuel, and slingshot on that one dt. Ballpark remains
the authoritative query owner but no longer applies map-specific force/contact
or world-update caps. Existing tick-indexed fixtures now express the matching
15 Hz elapsed-time boundary; protocol shape, routes, spawn identity,
presentation semantics, UI phases, results/profile continuity, and package
entrypoints remain unchanged.

## Ownership map and ordered verticals

1. **Canonical authority clock.** One movement owner controls
   `scripts/sim-runtime.cjs`, overload policy, session/map data and adapters,
   protocol defaults, and representative rate contracts. Introduce one shared
   named 15 Hz source; remove per-map movement Hz and overload time dilation;
   convert residual per-tick math to per-second math.
2. **Measured Deep Field hot path, only if red.** Profile the 5/15/25 maps by
   subsystem. Optimize measured Ballpark rebuild/query churn, relevance
   queries, snapshot construction, repeated normalization/allocation, AI
   decisions, or content work. Never restore lower movement fidelity.
3. **Harness runner and manifest.** One integrator owns
   `tests/run-all.cjs` and `tests/suite-manifest.cjs`: first add timing and
   resource receipts without changing execution, then classify isolation
   groups, parallelize pure Node work, isolate browser/sim shards, and finally
   consolidate only evidenced duplicate or superseded assertions.
4. **Authority clarity.** Centralize duplicated toroidal geometry through
   `scripts/sim/world-geometry.cjs`, then extract narrow lifecycle/HTTP,
   snapshot, and tick-composition owners while keeping `tickSim` as the sole
   system-order authority.
5. **Client authority presentation.** Extract snapshot acceptance, event
   consumption, local reconciliation handoff, and renderer presentation-source
   construction from `src/main.js` without changing UI or runtime contracts.
6. **Three/UI, build, tests, and docs.** Split only after their upstream
   presentation/authority seams are stable. Preserve one Three backend loop and
   existing visual-family lifecycle ownership. Build/platform simplification is
   last and does not trigger package or Deck gates without an RC selection.

High-conflict files are serialized through one owner:
`scripts/sim-runtime.cjs`, `src/main.js`, `tests/run-all.cjs`,
`tests/suite-manifest.cjs`, shared map/session data and adapters, and this
program's shared truth docs.

## Deletion and clarity targets

- Remove map-specific movement-rate fields, product-rate metadata, overload
  movement/time scaling, and gameplay-affecting relevance/contact caps.
- Replace duplicated authority wrap/distance/direction helpers with the
  existing world-geometry owner (expected 50-100 production lines removed).
- Classify the 37 test files not registered in the 95-suite manifest as commit,
  exposure, candidate, manual-probe, or retired coverage.
- Replace source-text assertions only where a product/runtime contract can own
  the same defect sensitivity. Retain deliberate packaging and banned-API
  boundary scans.
- Delete narration and stale architectural comments; preserve comments about
  units, lifecycle, compatibility, tricky math, and authority invariants.

`scripts/sim-runtime.cjs`, `src/main.js`, and renderer shells are split for
human ownership, not to manufacture a LoC claim. Overall net production
deletion remains expected.

## Milestone evidence

Each vertical lands as a meaningful commit with focused proof, before/after
production and test LoC, and an independent risk-selected review. Broad lanes
run at harness milestones and final comparison, not after every refactor.
Final acceptance also includes the 5/15/25 performance receipt, one fresh
natural movement journey, and one basic product-loop smoke.

## Phase 1 receipt

The canonical source is `src/content/movement.data.json` at
`MOVEMENT.authority.integrationHz = 15`. Both ESM and CommonJS session-profile
adapters derive their public `tickHz` from it; map profiles keep only
map-specific transport, visual, coarse-field, and content budgets. Overload
records pressure and may reduce snapshot transport frequency, but always keeps
authority dt, time scale, force/contact selection, and gameplay cadence fixed.

The travel-time artifact and finite-fuel route fixture were regenerated at the
shared rate. Focused proof passes for the manifest/adapters/protocol, movement
and fuel parity, slingshot wall-time, overload invariance, map session shape,
authoritative field behavior, and the travel probe. The Deep Field budget is
deliberately red only on short-soak heap growth (`+38.6 MiB`): a 6.3-second,
95-tick profile recorded 2,280 Ballpark queries, 243,058 candidates, and
236,074 duplicate candidates; sampled allocation also attributes 4.65 MiB to
snapshot/ring cloning and 2.08 MiB to coarse-field rebuilding. Phase 2 owns
that 5/15/25 subsystem work; it must optimize these measured paths without
restoring caps or lowering the authority rate.

Nonblank JS-family lines at this milestone are 49,986 production (`-232` from
the pinned baseline) and 22,493 tests (`-74`).

## Integrated source and harness receipt

The accepted source checkpoint is `3b2cb0227414f8567e12a821c64d3190b82e1f42`
on `codex/v0.3-sim-harness-simplification`. It remains a v0.3-only descendant
of `BASELINE_SHA`; no package, Deck, promotion, or public-release claim is made
for this checkpoint.

### Movement and Deep Field

- `src/content/movement.data.json` is the sole authority-rate source:
  `MOVEMENT.authority.integrationHz = 15`. Map data has no gameplay-rate
  field; rendering, snapshot publication, transport, visual LOD, and content
  budgets remain separately named schedules.
- All map tiers use the same fixed authority dt for player/AI movement, flow,
  gravity, contact, fuel, slingshot, and time-based consequences. The
  compatibility boundary is the authority/product outcome, not private helper
  ordering.
- The measured relevance pass reduced Deep Field from 24 to 12 queries/tick,
  candidates from 194,970 to 49,242, and duplicate candidates from 203,532 to
  51,072. It preserves Ballpark as the authority query owner.
- Runtime JSON is now compact at both snapshot admission and HTTP delivery.
  This intentionally removes whitespace/newlines only: JSON values, shapes,
  status codes, and content type are unchanged. Deep Field snapshot payloads
  fell from roughly 335 KiB to 204–213 KiB; stringify time was about 52% lower.
- The authority loop uses monotonic fractional deadlines rather than a rounded
  interval. It permits one fixed-dt jitter recovery, then drops stale deadlines
  after a long stall rather than bursting gameplay. `/health.scheduler` adds
  only `tickHz`, `intervalMs`, `catchUpTicks`, and `skippedDeadlines`; normal
  host acceptance requires zero skipped deadlines. Heap delta is diagnostic
  because GC is host-sensitive; bounded snapshot/ring gates remain enforced.

The current 5/15/25 ten-second cadence receipt is:

| Map | Delivered Hz | Snapshot p95 | Ballpark p95 | Queries/tick | Catch-up / skipped |
| --- | ---: | ---: | ---: | ---: | ---: |
| Shallows | 14.983 | 7.869 ms | 0.459 ms | 12 | 0 / 0 |
| Expanse | 14.995 | 18.493 ms | 0.774 ms | 12 | 0 / 0 |
| Deep Field | 14.988 | 22.760 ms | 0.788 ms | 12 | 1 / 0 |

The authority receipt also passed 57/57 in 195.47 s (197.36 s summed suite
time; 12 browser, 3 static, 66 sim, 3 control launches). Its Deep Field sample
delivered 15.000 Hz, 17.36 ms snapshot p95, 212.76 KiB payload p95, 0.722 ms
Ballpark p95, 12 queries/tick, two ordinary catch-ups, zero skipped deadlines,
and +1.56 MiB diagnostic heap change. This closes the former 13.9/15 rounded
timer artifact without restoring profiles; it is not a claim that pathological
host stalls cannot be observed through `skippedDeadlines`.

The terminal full-lane Deep Field budget sample also delivered 14.99/15 Hz,
26.06 ms snapshot p95, 212.76 KiB payload p95, 0.735 ms Ballpark p95, 12
queries/tick, and zero catch-ups or skipped deadlines. Heap moved +52.8 MiB in
that host-sensitive sample and remains diagnostic.

### Harness and behavior evidence

The manifest now registers 121 current contracts: fast 60, core 87, authority
57, sim-structure 45, full 119, bench 6, and audio-tools 1. The runner permits
four workers total and two browser workers, gives every isolated shard unique
ports/profiles/temp/artifact roots, serializes fixed services, buffers ordered
receipts, records launches/timings/retries, and terminates child process groups.

| Comparable path | Baseline | Current | Result |
| --- | ---: | ---: | --- |
| Fast warm | 13.04 s, 46 pass | 10.20 s, 60 pass | 1.278x; more coverage |
| Ordinary core | 93.62 s, 65 red | 45.72 s, 87 pass | 2.047x; meets the <=50% target |
| Authority | 126.53 s, 47 red | 195.47 s, 57 pass | slower: fresh isolation and cadence proof added |
| Sim structure | 32.55 s, 35 pass | 93.81 s, 45 pass | slower: 5/15/25 cadence proof added |
| Candidate full | 1,028.63 s, 95 red | 442.18 s, 119 pass | 2.326x; 43.0% of baseline |

`test:bench -- --no-retries` is 6/6 green in 0.45 s. `test:audio-tools` is
intentionally outside candidate/full and remains red in 0.57 s only because
the optional local audio toolkit cannot import Python `numpy`; it is not a
product gate. The bench endpoint likewise remains behind its explicit bench
gate, not normal authority behavior.

Focused behavior evidence remains representative rather than exhaustive:
UIVisual is 18/18 in 12.21 s (from 466.65 s); Smoke passes in fast/core; and
the terminal full lane passed Renderer in 86.16 s, FluidWindow in 10.18 s,
SlingshotV2Live in 8.04 s, and AgentPlayEval in 123.32 s. The two AgentPlay
journeys retain 18 captures, normal authority/input, slingshot, extraction,
profile/Chronicle continuity, second run, and natural death recovery. The live
slingshot proof records the complete selected-well event stream: two visual
capture legs end in validated range-breaks, and a third leg proves the explicit
requested release without discarding any authority event.

Meaningful vertical commits centralize the movement clock, toroidal geometry,
authoritative JSON serialization, deadline scheduling, runner isolation, and
current-contract fixtures. Current nonblank JS-family lines are 50,173
production (`-45` from baseline) and 23,954 tests (`+1,387`); production and
tests remain reported separately. The test increase is deliberate current
contract and fresh-process coverage, not hidden runner deletion.

The exact-head candidate run passed 119/119 with zero retries in 442.18 s
(442.39 s external wall, 619.60 s summed suite time), using 34 browser
launches, 18 static starts, 71 sim starts, and 3 control starts. Package and
Deck gates are historical evidence only until Primary explicitly selects an
RC. Greg still owns feel, visual/audio taste, physical Deck acceptance, and
promotion.
