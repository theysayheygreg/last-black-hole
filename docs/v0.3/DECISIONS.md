# v0.3 Decisions

## Grapple Arc v3 Replaces Slingshot v2

Decision (2026-08-01): replace W1-D's orbital-energy assist with the simple
server-authoritative arcade contract in [`GRAPPLE-ARC-v3.md`](GRAPPLE-ARC-v3.md).
Capture and swing radii now derive from current anchor size; swept reach and a
150 ms reel forgive fast near-misses; any nonzero approach can engage. A held
grapple exclusively owns one fixed-radius arc at entry speed plus one flat
size-based bonus. Button-up exits tangent with at most 10 degrees of compatible
outward assist; brake aborts without the bonus.

Retire tangential gating, energy accumulation, arc-length payoff, mechanical
chains, coyote/transport windows, gravity cancellation, range-break clamps, and
fractional hull coupling modifiers. Preserve authority, reliable held/edge
input, toroidal coordinates, contact/extraction truth, reconciliation, and
presentation telegraphs. Consecutive grapples compound only through their real
entry velocity. All feel constants are centralized in
`src/content/grapple-arc.data.json`.

> Document revision: v0.3. Updated 2026-07-26. This file records accepted
> implementation decisions for the current source line. Remaining Greg-owned
> decisions stay in `OPEN-DECISIONS.md`.

## Canonical Authority Movement Clock

Decision: `src/content/movement.data.json` owns the one authoritative movement
clock as `MOVEMENT.authority.integrationHz = 15`. ESM and CommonJS session
profile adapters derive public `session.tickHz` from that source; map data may
not author a gameplay rate. Shallows, Expanse, and Deep Field now advance
players, AI, wells, flow coupling, collision/contact, fuel, slingshot, portals,
growth, scavengers, waves, fauna, and seeded sea with `dt = 1 / 15`.

Snapshot transport, rendering/presentation cadence, map duration, coarse-field
resolution, content density, and byte/Ballpark budgets remain independently
named map properties. Ballpark still owns authority queries, but it no longer
applies map-specific relevance or candidate caps that could omit world updates,
forces, pickups, portal contact, or collision. Overload is pressure telemetry
plus optional snapshot transport reduction; it never changes `tickHz`,
`timeScale`, a gameplay system cadence, or force/contact selection.

The 60 Hz no-flow route data remains diagnostic only. The product-rate fixture
uses the shared 15 Hz source and the existing finite 100 delta-v tank:

| Tier | Product leg seconds | Delta-v remaining after each leg | Route total |
|---|---|---|---:|
| Shallows | `1.53` | `81.60` | `1.53s` |
| Expanse | `1.60 / 18.00 / 5.87` | `80.80 / 0.10 / 0.50` | `25.47s` |
| Deep Field | `2.13 / 64.07` | `74.40 / 0.00` | `66.20s` |

This is the approved movement-rate delta from `BASELINE_SHA`
`20184fae84b559abf27717c046811673040d987a`; it is not a physics retune.

## Authority Deadline Delivery And Compact Runtime JSON

Decision: authority delivery uses monotonic fractional deadlines at the shared
15 Hz source. A normal late timer may receive one fixed-dt recovery step; after
a longer stall, stale deadlines are counted and dropped rather than producing a
physics burst. This preserves the fixed dt/order during ordinary delivery and
makes exceptional host stalls inspectable instead of silently simulating time
in a burst.

`/health.scheduler` is intentionally additive diagnostic surface only:
`tickHz`, `intervalMs`, `catchUpTicks`, and `skippedDeadlines`. A normal-host
cadence acceptance sample requires `skippedDeadlines = 0`. It does not create a
new protocol dependency or gameplay knob.

Snapshot admission and HTTP responses use the same compact JSON serializer.
The deliberate wire change removes indentation and trailing newline only;
JSON values, shapes, status codes, and content type remain compatible. Byte
budgets now measure the exact delivered representation. Heap movement remains
diagnostic because host GC is variable; bounded snapshot-ring and serialized
payload gates remain the enforceable limits.

## W2-A4 Authoritative Map Scale

Decision: keep exactly three active maps. The canonical registry in
`src/content/map-scales.data.json` owns map id, map class, square dimensions,
profile identity, canonical module filename, and authored legacy dimensions:

| Map id | Class | Dimensions | Profile |
|---|---|---:|---|
| `shallows` | `shallows` | 5x5 | `small` |
| `expanse` | `expanse` | 15x15 | `medium` |
| `deep-field` | `deep-field` | 25x25 | `large` |

The browser wrapper is `src/content/map-scales.js`; the authoritative Node
wrapper is `scripts/content/map-scales.cjs`. Their field names and values are
parity-tested. `src/maps/playable-map-loader.js` owns the browser's static
module table and proves each imported map's `id` and `sourceFile` against the
registry. Active map modules expose `AUTHORED_MAP` and a canonical `MAP` export
produced by `migrateAuthoredMap()` in `src/maps/map-migration.js`.

Migration is deterministic normalized composition: authored coordinates are
scaled from each registry entry's `legacyDimensions` into its canonical
dimensions. No authored route, seeded anomaly cast, portal/extraction rule,
toroidal rule, Conductor rule, or entity authority rule changes.

The declared authored contract is linear density per world unit:

- wells: `0.5` to `1.0`
- stars: `0.7` to `1.25`
- wrecks: `1.0` to `2.0`
- planetoids: `0.4` to `0.8`

Route legs must be at least `0.75` world units and no more than `0.7` of the
map width. The 60 Hz no-flow integration is retained as a diagnostic baseline,
not as product-rate closure. The canonical 15 Hz product route fixture and its
finite-tank observations live in the authority-clock decision above. No
movement constant was tuned. The long Deep Field route and its exhausted final
delta-v reserve are a playtest/route-content risk, not a hidden retune or a
blocker for the map-scale authority.

All three authored maps pass without a population correction or movement
retune. Currents, slingshots, and other route assistance remain gameplay
effects rather than assumptions in this contract.

Portal placement is centralized in `AUTHORED_MAP_CONTRACT.portalPlacement` and
resolved by both map-scale adapters. `map-center-fractional-bands-v1` scales
the existing Shallows policy by canonical map width, preserving the Shallows
absolute bands while making Expanse and Deep Field placement intentional rather
than copied numeric folklore. Optional and final-exfil placement consume this
policy; the server remains authoritative.

The 25x25 tier uses the existing coarse-field seam. Browser allocations remain
`192` fluid, a `3` world-unit local window, and a `64` coarse texture; no
full-map 25x25 GPU texture is introduced. Deep Field constructs `3136` of its
`4096` coarse-cell ceiling. The pre-compaction W2-A4 observation was `323430`
bytes against a `500000`-byte ceiling; the terminal source budget sample is
`212.76 KiB` after the whitespace-only compact JSON change. Coarse-field
construction and packet serialization, and snapshot-ring serialization, fail
closed before retaining over-budget state. Expanse's executable coarse-cell
ceiling is `2304` for `2209` cells.

S24 catalog population is explicitly deferred. W2-A4 only proves the current
authored population is playable under the density/travel contract; it does not
begin a new encounter catalog or add a Map Select surface. The local/offline
seeded-sea presentation split remains backlog work; it is not a Goal D movement
or map-scale blocker.

## v0.3.1 Map-Relative Run Schedule

Decision: the selected map scale owns the canonical match duration. The shared
`MAP_SCALE_REGISTRY` declares `shallows = 480s`, `expanse = 600s`, and
`deep-field = 720s`; ESM, CommonJS, server, build, snapshot, client clock,
results, and ruler/presentation consumers resolve that same field. Product code
does not retain a global `600s` policy. `LBH_SIM_MAX_SIM_TIME` remains only as an
explicit short-fixture/test override.

Whole-run fronts use normalized match progress: collapse epochs at `0`, `0.25`,
`0.50`, and `0.75`; Inhibitor fronts at `0`, `0.15`, `0.30`, and `0.45`;
optional portal targets from `0.075` with `0.20` cadence; and final exfil at
`1.00`. The collapse vectors remain ambient `1/1.08/1.16/1.24` and wave
`1/1.05/1.10/1.15`. Expanse preserves its prior 600-second schedule, except
epoch 3 intentionally moves from 65% to 75%.

Local real-time intervals remain absolute: portal open durations, tells,
cooldowns, action windows, effect lifetimes, offset guards, and
reconnect/reservation timers. The final exfil has a fixed 60-second close, so
the hard end is `runDuration + 60s`. On shorter map tiers, the existing
10-second front guard may resolve an optional portal target forward; it does
not change the nominal normalized target or the portal's absolute duration.
This locked baseline is the schedule proof boundary; later multiplier balance
remains playtest-tunable.

## Locked Physical Units Centralization

Decision: lock the physical presentation scale for v0.3.1. The sole shared
code-data authority is `src/content/units.data.json`, whose `inputs` are:

| Input | Locked value |
|---|---:|
| meters per sim/world unit | `1000 m` |
| Drifter hull length | `12 m` |
| ruler presentation default | `100 m` |

The manifest's `ratification` records owner `Greg`, date `2026-07-17`, status
`locked`, and the decision source. Browser and CommonJS wrappers expose the
same raw manifest and derive `drifterHullLengthSimUnits` as `12 / 1000`.
Ruler, measurement, dev-panel, force-ledger, fixture, and runtime consumers
must import or derive from those wrappers. The wrappers also retain the
existing flat `UNIT_SCALE` compatibility view for callers already on this
version line; derived values are never stored in the manifest.

This locks labels and conversion math only. It does not retune physics, maps,
cameras, sprites, collision, or radii.

## Pause And Resume Reconciliation

**Status:** accepted on `341268b17f76a58303531c57743b461b4d7c9e83`.

Pause is a local presentation overlay. The remote authority world continues:
authority, network health, snapshot intake, and covered event intake remain
live, and pause never auto-unpauses. Entry neutralizes held and edge inputs
exactly once, clears pending action flags, and leaves server truth untouched.

Covered presentation coalesces to the latest authority snapshot. A short resume
under `1500ms` follows the current phase normally. A long resume at or above
`1500ms` applies the newest authority truth atomically, settles camera, fluid,
and presentation, and clears stale UI motion. Terminal, phase, and run changes
route directly from current authority truth; cached terminal events are scoped
to the exact authority run.

The local debug/sandbox freeze is separate and may freeze client simulation for
debugging only. Deck/controller prompts use the accepted graphical glyph family
without raw keyboard fallback copy. Reduced motion keeps required pause,
recovery, terminal, and resume copy settled and readable.

This decision changes no protocol or server authority behavior. Visual feel and
headed proof remain deferred; this source acceptance does not require visual
proof.

## W1-D Slingshot Input-Path RC Ratification

Decision: accept the v0.3.1 slingshot input path as the packaged local-authority
contract. Physical F and Deck/controller Y have complementary edge and level
semantics: button-down queues the rising edge that initiates authority
engagement, the held level sustains the owned orbit, and button-up releases at
the chosen exit angle. InputManager and main own those inputs, SimClient
acknowledges their transport, and only authority owns the resulting orbit and
release. The client presents the authoritative aim ring and device-correct
engage/release prompt; a press without an eligible anchor reports that no
anchor is in range and does not invent a local outcome.

The five gameplay values remain centralized in
`scripts/sim/slingshot-contract.cjs` and ratified as:

| Value | Baseline |
| --- | ---: |
| capture radius | `450 m` |
| magnetism | `30 deg` |
| coyote time | `50 ms` |
| payoff curve | `1.4x` per quarter-turn |
| chain window | `0.5 s` |

Lock telegraph (`0.25 s`) and release ghost (`1.0 s`) are internal
presentation durations. This ratification preserves server authority and the
accepted movement, sea, Conductor, timeSlow, and unit contracts.

Fixed-step transport interpretation: the canonical gameplay value remains
`50 ms`, but prompt-originated edge eligibility uses the internal runtime
allowance `50 ms + 4 * current authority dt`. Aim retention, affordance lookup,
and effective/transport remaining-time telemetry use that duration; telemetry
keeps canonical coyote and transport allowance distinct. For Shallows
(`dt = 1/15 s`, about `66.7 ms`), an edge within `316.7 ms` is accepted and an
edge beyond that effective window is rejected. The four-tick allowance is
transport behavior, not a new gameplay knob, and changes no capture radius or
broader movement behavior.

The authority also publishes the current aim's `tangentialSpeed` and boolean
`engageEligible` result against the internal `0.05` minimum. HUD guidance shows
`align with current` without an actionable glyph until that result is true;
eligible aim retains the device-correct Y/F engage prompt. This is derived
telemetry and presentation gating, not a sixth gameplay value.

## Noise Radius v1

Decision: retire the player-facing Signal 0-1 meter, bands, and threshold-wake
interpretation. The server/sim now owns an emitter-derived audible radius in
canonical meters. Player presentation receives category and range only inside
the source's live radius; public identification may upgrade at `40%` of that
radius only for event-carried `VESSEL` or `VESSEL THRUST` classes. Identified
contacts retain that public class through the bounded `2.5s` last-heard fade;
loss freezes bearing/range/category and expiry resets the memory.

Heat remains a separate engine-stress presentation, not a Noise source. Gravity
only slingshot and Inhibitor contact are quiet. Signal Blooms are local enemy
listeners, Swarm acquisition uses Noise plus its existing search/lock behavior,
and the Conductor remains the sole Inhibitor arrival authority.

## Orrery Route Teaching

The aperture rail is discovery-gated per run. Before the player genuinely hears
an `EXFIL TONE`, it shows `ROUTE: LISTEN` and no distance. A live EXFIL contact
unlocks the existing rail with the nearest active aperture's canonical meter or
kilometer distance; that discovery remains earned until the authority run ID
changes, even after the two-and-a-half-second contact memory fades. The HUD
surfaces only non-zero Noise listener counters, and results include the existing
authoritative heard/tracked seconds. The ruler labels the fixed coyote transport
allowance separately from the accepted `50 ms` gameplay value.

Noise emitter radii are universal across Shallows, Expanse, and Deep Field; no
map-specific hearing multiplier exists. Shallows is deliberately the
recognition route: before an exfil opens it teaches `ROUTE: LISTEN`, and its
universal tone may become immediately audible when it opens so the player can
learn sound, cyan identity, and distance. Expanse and Deep Field retain the
larger navigation-by-ear space. Lethal threat warnings are authored from
seconds at representative cruise and closure speeds, not only viewport
multiples.

## Locked Noise Radius And Inhibitor Ecology Ownership

Decision: the current v0.3 design owners are
[`Noise Radius v1`](noise-radius-v1.md) and
[`Inhibitor Ecology v2`](inhibitor-ecology-v2.md). The former v0.2 bodies are
frozen under [`v0.2 history`](../v0.2/history/design/) and stable legacy paths
are pointers only.

Noise is emitter/action-owned audible radius. Player hearing is binary against
the live emitted radius with no receiver stats. The current starting radii and
`90m/s` / `120m/s` decay values remain tunable. Actual source range, category,
inner-`40%` allowlisted public identity, `2.5s` remembered fade, stable exit,
and contextual under-ship Heat are the live presentation contract. Authored
enemy awareness may distinguish `HEARD` from `LOCKED ON`; it is not a player
hearing system. Noise never schedules or advances Inhibitor phases.

Inhibitor Ecology v2 is an accumulating Conductor-owned cast across the locked
`0/.15/.30/.45` fronts. It retires the pressure meter, one-creature form morph,
Glitch dissipation by meter, Swarm cargo/control/recursive-Noise effects, Vessel
well consumption, and the old post-Vessel portal rule. The ecology document
separates this locked target from the current scalar-form, portal-block,
`consumedByInhibitor`, and Swarm cargo/control runtime gaps; those gaps are not
claims of shipped behavior.

## Total Active Inhibitor Cap And Run Reset

Decision: `src/content/inhibitor-ecology.data.json` owns one tunable
`population.totalActiveCap`, initially `11`, alongside the existing kind caps.
The authority counts every non-expired Glitch, Swarm, and Vessel before each
Conductor admission. A blocked scheduled arrival advances its own cadence and
increments `inhibitor.ecology.suppressedByTotalCap`, so the public snapshot
reports honest suppression rather than pretending the entity arrived. The
initial cap is deliberately below the observed uncapped steady density of `12`
live bodies (`5` Glitches, `4` Swarms, `3` Vessels), while preserving late
crowding and all three kinds as `5 + 4 + 2`. It is not the sum-of-kind-caps
value `13`, and it is not a tiny single-digit ecology.

Starting a new run or map creates fresh session-owned players, Noise state,
ecology entities, map wells, wave rings, event/snapshot lanes, and Ballpark
identity. The same sim process remains the owner when reused: one PID, one
port, and one `simInstanceId`, with a new session/run ID and a Ballpark epoch
reset. Three presentation reset now also clears pooled entity-family state,
temporal visibility, and VFX particles/event memory; renderer disposal records
the entity and VFX lifecycle counts. Movement, player speed, map scale,
ecology behavior, and the shared 15 Hz authority clock are unchanged.
