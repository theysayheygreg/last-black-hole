# v0.3 Simulation, Harness, and Human-Clarity Simplification

> Status: human-clarity program complete at source `ffbcc0ba`.
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

## Accepted movement and harness receipt

The final source checkpoint is
`ffbcc0ba28f8fa17f5d5d2146b7bd9ae28832844`. The earlier movement/harness
checkpoint `3b2cb0227414f8567e12a821c64d3190b82e1f42` remains supporting history.
Both are v0.3-only descendants of `BASELINE_SHA`; completion makes no package,
Deck, RC, promotion, or public-release claim.

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

The final direct 5/15/25 cadence receipt at `ffbcc0ba` is:

| Map | Delivered Hz | Snapshot p95 | Ballpark p95 | Queries/tick | Catch-up / skipped |
| --- | ---: | ---: | ---: | ---: | ---: |
| Shallows | 14.981 | 10.500 ms | 0.503 ms | 12 | 0 / 0 |
| Expanse | 14.998 | 16.361 ms | 0.794 ms | 12 | 0 / 0 |
| Deep Field | 14.996 | 18.559 ms | 0.770 ms | 12 | 1 / 0 |

The final direct Deep Field budget delivered 14.99/15 Hz across 157 ticks:
15.49 ms snapshot p95, 212.88 KiB snapshot p95, 1.31 MB/s transport,
0.869 ms Ballpark p95, 1,884 queries (12/tick), 101,794 candidates, 115,756
duplicates, one catch-up, and zero skipped deadlines. Heap moved +31.64 MiB and
remains GC-sensitive diagnostic data.

These final-host samples close the former roughly 13.9/15 delivery residual.
The shared gameplay rate remains fixed at 15 Hz with no map-specific movement
profiles, and no additional hot-path slice is warranted by this evidence.

### Harness and behavior evidence

At `3b2cb022`, the manifest registered 121 current contracts: fast 60, core 87, authority
57, sim-structure 45, full 119, bench 6, and audio-tools 1. The runner permits
four workers total and two browser workers, gives every isolated shard unique
ports/profiles/temp/artifact roots, serializes fixed services, buffers ordered
receipts, records launches/timings/retries, and terminates child process groups.

| Comparable path | Baseline | Current | Result |
| --- | ---: | ---: | --- |
| Fast warm | 13.04 s, 46 pass | 10.20 s, 60 pass | 1.278x; more coverage |
| Ordinary core | 93.62 s, 65 red | 45.36 s, 87 pass | 2.064x; meets the <=50% target |
| Authority | 126.53 s, 47 red | 195.47 s, 57 pass | slower: fresh isolation and cadence proof added |
| Sim structure | 32.55 s, 35 pass | 93.81 s, 45 pass | slower: 5/15/25 cadence proof added |
| Candidate full | 1,028.63 s, 95 red | 432.91 s, 119 pass | 2.376x; 42.1% of baseline |

`test:bench -- --no-retries` is 6/6 green in 0.45 s. `test:audio-tools` is
intentionally outside candidate/full and remains red in 0.57 s only because
the optional local audio toolkit cannot import Python `numpy`; it is not a
product gate. The bench endpoint likewise remains behind its explicit bench
gate, not normal authority behavior.

The final full run passed Flow 7/7, MetaFlow 8/8, RemoteAuthority 18/18,
Renderer 5/5, UIVisual 18/18, and AgentPlayEval 2/2. AgentPlayEval completed in
117.41 s with normal authority/input, slingshot, extraction, profile/Chronicle
continuity, second run, and natural death recovery. Its worker-local report is
`tests/screenshots/agent-play-eval-2026-07-26T213311262Z/summary.md`.

Meaningful vertical commits through `3b2cb022` centralize the movement clock,
toroidal geometry, authoritative JSON serialization, deadline scheduling,
runner isolation, and current-contract fixtures. At that checkpoint, nonblank
JS-family lines were 50,173 production (`-45` from baseline) and 23,954 tests
(`+1,387`); production and tests remain reported separately.

The final core run passed 87/87 with zero retries in 45.36 s, using 8 browser
launches, 8 static starts, 16 sim starts, and 1 control start. The single final
full run passed 119/119 with zero retries in 432.91 s (611.61 s summed suite
time), using 34 browser launches, 18 static starts, 71 sim starts, and 3
control starts. Package and Deck gates remain historical evidence only. Greg
still owns feel, visual/audio taste, physical Deck acceptance, and promotion.

## Human-clarity refactor completion

Source `ffbcc0ba28f8fa17f5d5d2146b7bd9ae28832844` is the completed clarity
checkpoint. The refactor keeps public facades and runtime behavior stable while
making lifecycle, projection, presentation, and script ownership explicit.

| Owner | Responsibility |
| --- | --- |
| `scripts/sim/http-lifecycle.cjs` | Authority HTTP server creation, request completion, and shutdown lifecycle. |
| `scripts/sim/public-snapshot.cjs` | Public snapshot projection and compact transport-safe rows. |
| `scripts/sim/session-state.cjs` | Session and player state factories; `scripts/sim-runtime.cjs` retains tick order and gameplay authority. |
| `src/sim/remote-session-state.js` | Remote session start, pause, result, reconnect, and release transitions. |
| `src/sim/remote-snapshot-presentation.js` | Accepted authoritative snapshot projection into client presentation state. |
| `src/presentation/scene-source.js` | Renderer-neutral scene-source construction from local or remote presentation truth. |
| `src/render/shaders/fluid.glsl.js` | Fluid shader source only; `src/fluid.js` retains WebGL lifecycle and uniforms. |
| `src/render-three/world-scene-presentation.js` | Three world-entity and environment presentation lifecycle; the renderer shell retains backend orchestration. |
| `src/ui/hud-presentation.js` | Pure HUD selectors and presentation formatting behind the existing HUD facade. |
| `src/ui/hud-inventory.js` | Inventory state, actions, and panel rendering behind the existing HUD facade. |
| `src/audio/cue-synthesis.js` | Transient cue recipes and held portal voice synthesis; `AudioEngine` retains graph and continuous-voice lifecycle. |
| `scripts/deploy/cli.cjs` | Shared deployment argument parsing without changing entrypoint flags. |
| `scripts/service-supervisor.cjs` | Direct control/sim/static service start, stop, status, PID-registry, and signal cleanup used by the three thin wrappers. |

The milestone commits are deliberately narrow:

| Commits | Milestone | Focused evidence |
| --- | --- | --- |
| `5994c8e5`–`71afd028` | Authority HTTP, public snapshot, session factories, and player tick composition | authority lifecycle, snapshot, shipping-trio, and sim-lifecycle contracts |
| `d4373fee`–`24112096` | Remote session, snapshot, and scene-source ownership | pause/reconcile, input feedback, renderer authority, and presentation-frame contracts |
| `f7479f0a`–`94731070` | Fluid shader, HUD, audio, and Three world-presentation owners | validation, HUD/slingshot, cue/RC recovery, and Three lifecycle/temporal contracts |
| `b066cfa0` | Canonical ESM content reused by synchronous CommonJS adapters | balance, map-rate/movement, and signature identity contracts |
| `a5b6477c` | Shared deployment CLI parsing | Deck gaming-mode argument contract |
| `93671bb9`, `19bb70b6` | Shared direct service supervision | desktop package, control-plane, and sim-lifecycle contracts |
| `0e8e0825` | Superseded owner-lock cleanup | build, remote-session, renderer-authority, and UI contracts |
| `eebac8ca`, `ffbcc0ba` | Integrated truth ledger and catalog-count correction | path, command, stale-claim, and line-count consistency checks |

The intermediate `a6e584bf` service-lock experiment was rejected. `19bb70b6`
deletes the lock/claim hooks and their tests, restores the established direct
lifecycle semantics, and leaves no new dependency or lock-file contract.

Final major-owner size is reported as physical/nonblank lines. Extracted
modules are included with their former owner:

| Vertical | Final |
| --- | ---: |
| Authority runtime + extracted owners | 7,542 / 7,046 |
| Client main + remote/presentation owners | 7,061 / 6,575 |
| Fluid runtime + shader source | 1,251 / 1,126 |
| Three renderer + world presentation | 1,058 / 985 |
| HUD facade + presentation/inventory | 1,066 / 972 |
| Audio engine + cue synthesis | 1,236 / 1,134 |
| Service wrappers + supervisor | 350 / 316 |
| Deployment entrypoints + CLI parser | 1,345 / 1,183 |

The direct shells are `scripts/sim-runtime.cjs` 7,097/6,622,
`src/main.js` 6,602/6,139, `src/render-three/three-renderer.js` 324/297,
`src/fluid.js` 735/672, `src/audio.js` 561/508, `src/hud.js` 658/603, and
`scripts/service-supervisor.cjs` 203/182. Their extracted partners are
`world-scene-presentation.js` 734/688, `fluid.glsl.js` 516/454,
`cue-synthesis.js` 675/626, `hud-presentation.js` 224/211, and
`hud-inventory.js` 184/158.

From integrated clarity baseline `c97a41b1` to final source, the whole
JS-family production tree moves from 201 files / 54,886 physical / 50,173
nonblank lines to 214 / 54,750 / 50,069 (`-136` physical, `-104` nonblank).
Tests remain 138 files and move from 26,365 physical / 23,954 nonblank lines to
26,990 / 24,549 (`+625` physical, `+595` nonblank). The production reduction
is real but secondary to explicit ownership; test growth is focused
behavior-preservation evidence.

The exact-head core, full, natural journey, product-loop contracts, cadence,
Deep Field, and LoC receipts are complete. No package, Deck, RC, promotion, or
Greg taste claim is implied.
