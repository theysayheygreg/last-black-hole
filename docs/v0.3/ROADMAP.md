# v0.3 Roadmap: Ballpark Authority

> Document revision: v0.3. Updated 2026-08-17 from the recovered integration
> line. Earlier mirror-scaffold plans are retained as history in the review
> documents they came from, not as current implementation claims.

## Status

**Current integration branch:** `codex/v0.3-ballpark-roadmap`

**Public/demo line:** `main` remains the v0.2 line until Greg explicitly calls
the version promotion.

**Current product source:**
`b584350e2469ca5af96a57dfcf7ebe6aa7ab075b` is the current v0.3.1
integration checkpoint. It retains the accepted Ballpark/protocol/product-loop
architecture and adds the complete Endless Sky Phase 1 replacement program:

- one typed condition store replaces parallel scalar profile/run ownership;
- player, AI, and Journey movement share desired-heading/thrust/brake
  affordances before the existing authority-force order;
- one data-authored Journey runtime replaces the durable bespoke scenario and
  AgentPlay controllers;
- analytic category geometry, stable label placement, and signal-gated audible
  rim presentation replace one-off spatial HUD paths.

The same line integrates Palette's world-art guide, Timbre's authored-audio
direction, and Mosaic's generated map-contact family. Since the historical
`1ecabcc5` receipt, accepted fixes service Journey authority frames and input,
portal, extraction, and Noise-listener lifecycles; establish player-owned,
product-selected salvage targeting; and rebind invalidated targets.

The current RC is red only because Gate 5's representative Journey naturally
timed out while approaching selected `wreck-3`. The authority player remained
alive, continued delivering thrust, and had hazard assist; this is a real
navigation/playable-path failure rather than missing authority. A separate
package run passed the 105-suite fast lane, built all five targets, passed
`release:status`, and passed `test:package` as `0.3.1.b584350e`. This is a
package-green playtest artifact, not an RC-green or deployed build. The prior
`1ecabcc5` cadence, Journey-player-loss, and Keyboard retry findings remain
historical rather than current blockers.

The last checksum-verified physical Deck preview remains historical
source/build `dd9e5149` / `0.3.1.dd9e5149`. The current package has not been
deployed, physically reviewed, or promoted.

The v0.3.1 map-relative schedule migration is source-complete: map-scale
content owns the 480/600/720-second durations, the match Conductor resolves
whole-run fronts from normalized progress, and client/server/build/result
surfaces consume the selected duration. The focused contract preserves the
600-second Expanse anchor, with epoch 3 intentionally at 75%. This locked
baseline is ready for playtest; later multiplier balance remains tunable.

The product-rate movement contract now uses one 15 Hz authority integration
clock from `src/content/movement.data.json` for all 5/15/25 maps, canonical
drag/fluid coupling, and one finite delta-v tank. The old 15/12/10 profiles are
superseded. Slingshot transport allowance remains wall-time based; portal/exfil
placement remains one map-center fractional policy. Deep Field route generosity
is a playtest/content risk, not hidden tuning. Ballpark remains the
spatial/materialized-payload layer; the local/offline seeded-sea presentation
split is backlog work.

Historical 2026-07-25 movement-tranche note: the second completion tranche
closed three remaining player-facing
seams without retuning the game: F/Y reports why an in-range slingshot cannot
engage yet, reconciliation consumes authoritative fluid coupling, and snapshot
rebases refresh fuel truth. Ordered replay of rapid pending inputs remains a
bounded presentation backlog for the separate movement/refactor program. Its
one-shot browser smoke stopped at Home before map launch; the later terminal
AgentPlay and full-lane receipts below supersede that historical smoke status.

### Production Polish Candidate

Branch `codex/v0.3-production-polish` carries a focused post-review batch over
the then-green candidate:

- sentries use a distinct directional threat sprite instead of sharing fauna's
  organic silhouette;
- delivered thrust, braking, coast, and idle drive one bounded movement-audio
  voice in both local and authoritative play;
- portal residence uses centralized toroidal endpoint contact while swept
  fly-throughs remain non-resident and cannot extract;
- stale held human input expires after 750 ms so a silent client cannot thrust
  forever;
- meta progression is state-owned rather than render-owned, transition clocks
  cannot skip after tab suspension, and remote result exits preserve all input
  edge latches.

Historical focused receipts passed on 2026-07-14: Three entity lifecycle 9/9, movement
audio 10/10, swept authority 5/5, input timeout 1/1, movement golden 5/5, and
meta flow 8/8. Broader candidate lanes were asynchronous at that checkpoint;
the later accepted `3b2cb022` receipt is recorded below.

v0.3 converts the successful game-jam stack into a small production-shaped
game architecture without replacing the custom physics or ASCII-fluid visual
identity. The server owns gameplay truth; Three, UI, VFX, and audio consume
explicit presentation contracts.

## Release Pillars

1. **One authority.** Death, movement, contact, loot, Noise, extraction,
   inventory, outcomes, and durable profile writes are server/sim facts.
2. **One world model.** Toroidal geometry, swept contact, stable body identity,
   lifecycle, relevance, and replication lanes use shared modules.
3. **One playable story.** Shallows teaches movement, slingshot, salvage,
   Noise consequence, and confirmed extraction in a truthful seeded route.
4. **One presentation boundary.** The Three renderer receives a neutral frame,
   visual hints, and events; it does not infer gameplay.
5. **Evidence before Greg.** Contract proof, playable proof, and visual proof
   must exist before human feel and polish review.

## Implemented In v0.3

### Authority And World Geometry

- `scripts/sim/world-geometry.cjs` owns wrapped position, shortest deltas,
  distance, closest segment approach, and moving-circle sweep math.
- Well death, wreck pickup, portal residence, and scavenger bump paths use
  deterministic contact handling across ordinary space and wrap seams.
- High-speed portal fly-through cannot extract. The player must remain in the
  cyan aperture and explicitly confirm; leaving aborts immediately.
- The provisional server thrust baseline remains `2.5`, with hull and rig
  coefficients layered on top. Movement golden fixtures protect this baseline.
- Overlapping-well shield, grace, and death resolution continues across all
  relevant wells rather than returning after the first protected contact.
- Match lifetime, terminal-player shutdown, event history, snapshot history,
  retired body identity, wave counts, and other long-run structures are bounded.

### Persistent Ballpark Lite

- `BodyRegistry` provides stable public ids and private generation-checked
  handles.
- `BallparkMirror` now preserves handles across updates, tracks epochs and
  incarnations, records lifecycle ticks, rejects stale references, and bounds
  retired identity history.
- The wrapped spatial index has deterministic codepoint ordering and exact
  toroidal period quantization.
- Players, wells, stars, wrecks, portals, planetoids, scavengers, sentries,
  fauna, and waves have component-shaped body records and replication lanes.
- Load-bearing relevance, wreck pickup, and portal candidate selection require
  Ballpark. The old array-scan fallback paths were removed.
- Materialized runtime arrays remain protocol/gameplay payload storage during
  this release; they no longer act as an alternate spatial authority.

### Protocol v2 And Recovery

- Wire version is `lbh-local-v2`.
- Every run and player has explicit identity. The server issues command
  credentials and host join tickets.
- Commands and inputs use independent monotonic sequences; queued slingshot
  edges survive transport cadence.
- Stale run, stale command, stale input, wrong player, and invalid credential
  failures are deterministic.
- Reconnect preserves player continuity and rotates authority intentionally.
- Player-local event lanes keep inventory, loot, effects, Noise impulses,
  and portal interaction facts private to their owner.
- The bounded event journal and live snapshot ring expose watermarks, gap
  detection, run invalidation, and valid client snapshot rebase behavior.
- Empty AI-only sessions idle instead of becoming ghost matches; terminal runs
  stop ticking while remaining briefly inspectable.

### Product Loop

- Seed previews and authority launches agree on map, signature, well names,
  counts, loot preview, and route anchors.
- Shallows route order is movement/slingshot, salvage, Noise consequence,
  then cyan zone-plus-confirm extraction.
- Expanse and Deep Field have distinct route identities and scale budgets
  rather than extra shallow catalog promises.
- Cyan is the route/extraction family. Magenta is reserved for Inhibitor,
  corruption, and anomaly language.
- Authoritative loot uses one item shape from wreck through cargo, loadout,
  result, vault, and Chronicle.
- Death preserves authored residue/echo consequences without a percentage tax.
- The public hull roster is Drifter and Breacher. Resonant, Shroud, and Hauler
  definitions remain internal test/design material and are rejected at human
  join boundaries.
- Player progression presents hull-specific rig tracks only. Legacy global
  upgrade data remains migration input, not a visible promise.
- Chronicle shows the career strip and the newest five authoritative runs.
  Results, loadout, vault, EM credit, and restart continuity share the same
  control-plane ledger.

### Three Presentation And Readability

- `src/presentation/presentation-frame.js` sanitizes the renderer-neutral live
  frame, palette roles, quality tier, scene facts, and VFX events.
- Three adapts that frame into lifecycle-owned player, wreck, portal, star,
  planetoid, scavenger, fauna, and sentry visual families with bounded object
  budgets and explicit texture cleanup.
- Projection, toroidal seam handling, square fluid alignment, route cyan,
  corruption magenta, and quality ownership are centralized.
- The ASCII-fluid fabric remains the visual product. Entity backing, silhouette,
  emissive accents, and UI hierarchy improve separation without cutting out the
  fluid identity.
- The 1280x800 HUD uses fixed rails, minimum support text/gauge sizes,
  controller-aware prompts, explicit extraction affordance, hull state, and
  non-overlapping interaction panels.
- Reduced-motion behavior and event-driven audio cover loot, slingshot, portal,
  scavenger, Inhibitor, extraction, and UI actions with bounded voices.
- The visual source kit contains auditable entity, item-family, and UI-frame
  atlases. A deterministic build produces transparent top-down runtime sprites,
  stable icons for all 65 catalog items, and sliced terminal frame parts.
- The generated UI kit now frames Profile, Home, route select, pause, results,
  and inventory surfaces with stronger local backing and restrained shadows.
- One deterministic motion clock owns terminal expansion, content reveal,
  focus, stagger, and directional screen transitions. Reduced motion reaches
  the same settled states without animation.
- Wells, the ASCII-fluid fabric, and Inhibitor corruption remain procedural;
  generated sprites complement rather than replace simulation-driven visuals.

### Build And Performance

- Desktop/Deck packaging follows the transitive CommonJS dependency graph for
  embedded control plane and sim runtimes.
- Package tests stage the actual resources and boot both authority processes;
  string-presence checks are not accepted as closure evidence.
- The semantic train is `0.3.1`; internal artifacts use `0.3.1.<commit-hash>`.
- Deep Field has explicit tick, snapshot latency/size, transport, heap-growth,
  and Ballpark-sync budgets.

Final direct authority evidence at `ffbcc0ba` on 2026-07-26 (not package or
Deck evidence):

| Measure | Observed |
|---|---:|
| authority tick | 14.99 / 15 Hz (Deep Field budget sample) |
| snapshot p95 latency | 15.49 ms |
| snapshot p95 size | 212.88 KiB |
| transport | 1.31 MB/s |
| heap change | +31.64 MiB diagnostic |
| Ballpark sync p95 | 0.869 ms |
| relevance queries | 12 / tick |
| deadline delivery | 1 catch-up / 0 skipped |

The direct 5/15/25 receipt delivered 14.981, 14.998, and 14.996 Hz with zero
skipped deadlines. This closes the earlier roughly 13.9/15 Deep Field residual
under the final host conditions; no extra hot-path slice is needed. The shared
gameplay rate remains fixed at 15 Hz without map-rate profiles, and heap delta
remains GC-sensitive diagnostic data.

### Noise Radius v1

The historical Signal meter and bands are retired. The authority now emits a
decaying audible radius in canonical meters, with local fauna listeners,
Noise-only Swarm acquisition, a compact Deck HUD, capped emitter-owned edge
memory, and truthful result learning stats. Noise never advances Inhibitor
arrival; the Conductor remains the only phase owner. See
[`noise-radius-v1.md`](noise-radius-v1.md).

## Playable Evidence

The natural agent journey starts a fresh sim and disposable browser at
1280x800 Deck dimensions. It uses normal menus, protocol-v2 authority, real
controller input, and world contact. It does not mutate player, portal, wreck,
or Inhibitor debug state.

The final no-retry AgentPlay pass completed 2/2 in 117.41 s. Its worker-local
report is
`tests/screenshots/agent-play-eval-2026-07-26T213311262Z/summary.md`; the
recorded receipt proves:

- title, profile, Home, route briefing, and authoritative launch;
- intentional movement and a well slingshot engage/release;
- natural wreck salvage and Noise/Inhibitor pressure;
- portal ready state before explicit confirmation;
- authoritative extraction and result writeback;
- Home rig and Chronicle continuity;
- a rerolled, changed second run with renewed movement;
- a second fresh journey that selects Breacher, dies to a visible named well,
  and returns Home through normal controller input;
- eighteen screenshots covering both outcome branches and UI surfaces,
  including generated entity sprites and a populated icon-bearing salvage
  report.

The same exact-head full run passed Flow 7/7, MetaFlow 8/8, RemoteAuthority
18/18, Renderer 5/5, and UIVisual 18/18 without retries.

## Remaining Release Gates

The human-clarity evidence gates are complete:

- [x] Final core: 87/87 in 45.36 s, zero retries; 2.064x baseline.
- [x] Final full: 119/119 in 432.91 s, zero retries; 2.376x baseline.
- [x] Fresh natural AgentPlay 2/2 and product-loop contracts passed.
- [x] Final 5/15/25 and Deep Field receipts sustain the shared 15 Hz clock.
- [x] Final production/test physical and nonblank LoC are recorded.

The remaining release gates are intentionally separate:
- [ ] If Primary selects an RC, build a hash-named artifact and rerun package
  proof from that exact committed source.
- [ ] If the physical Deck is online, deploy and verify Gaming Mode launch,
  Steam Input, 1280x800 readability, suspend/resume, and log paths.
- [ ] Greg reviews movement feel, route pleasure, visual hierarchy, and final
  polish.
- [ ] Greg reviews the target-speaker/headphone mix; browser audio-graph
  inspection and the prioritized runtime copy retunes remain polish follow-up.
- [ ] Greg explicitly decides when v0.3 promotes to `main`.

## Inhibitor Consequence Follow-Up

- Inhibitors must create real player consequences and be capable of killing
  the player. Each Inhibitor form needs its own later behavior and design pass;
  implementation waits for Greg's follow-up notes rather than inventing those
  behaviors inside unrelated feature work.

## v0.3.1 Authored Soundscape Follow-Up

- The
  [Authored Soundscape Plan](reviews/v0.3.1-authored-soundscape-plan.md) is
  active v0.3.1 scope. The procedural contact/navigation voices and current
  Hermes/Maestro integration are the functional baseline, not final content.
- The currently running RC and Deck build remain an intermediate playtest
  checkpoint. After it lands, continue the authored-audio vertical on the same
  version line rather than deferring it to v0.3.2.
- v0.3.1 audio content-complete requires a representative authored mix and
  Greg's listening verdict. Machine checks own routing, lifecycle, packaging,
  and performance; they do not grade taste.

## Parked Design Queue — Needs Revisiting (Greg, 2026-08-04)

Held deliberately, not stale; each returns to the table after the current
review-driven program and the Shallows movement/readability proving
milestone:

- **Bench goal-prompt dispatch** — the Bench F1/F2 expansion prompt,
  undispatched.
- **Areas 3–5 ratification** — night-ideation output awaiting Greg
  review.
- **The Undertow: Drain-Basin revision** — area design revision pending.
- **Death-economy call** — Orrery's standing recommendation on record:
  tax carried cargo only, never banked EM (matches shipped behavior);
  formal ratification pending.
- **S9a** — parked by name.

Also parked by design (same date): per-cause wave impulses (see the
feature-set repair program's out-of-scope note) and the
Shallows-vs-coarse-field gravity unification — Shallows stays the exact-
math testbed until the movement/fabric simplification is proven, then
the proven configuration propagates outward.

## Deferred Beyond v0.3

- v0.3.2 begins with the gated
  [Fabric, Surfing, and Camera presentation review](reviews/v0.3.2-fabric-surfing-camera-review.md)
  after the settled v0.3.1 Deck baseline. It is a presentation and physical
  readability review, not a simulation or physics redesign.
- Public multiplayer transport, matchmaking, prediction, and rollback.
- A full ECS runtime. v0.3 creates stable component-shaped seams but does not
  adopt ECS ceremony without measured need.
- Public Resonant, Shroud, and Hauler promises. Their mechanics need complete
  sim, UI, balance, and journey evidence first.
- Native engine, Godot, Metal, or console renderer ports.
- Broader catalog/content breadth that does not deepen routes or consequences.
- Advanced replication deltas and neighborhood transport once multiplayer
  traffic provides real measurements.
- Incremental Ballpark updates after map/entity growth makes the measured full
  rebuild material; current Deep Field sync remains inside budget.
- Network stale-input timeout semantics, deterministic runtime ids, and any
  prediction reconciliation belong with the multiplayer transport contract.

## Post-RC Visual And Audio Polish

Orrery's 2026-07-14 review found worthwhile presentation work that is not an
architecture or automated-acceptance blocker:

- give sentries a threat-specific silhouette instead of sharing the ecology
  sprite family;
- separate Inhibitor and general-anomaly hue roles, then continue moving the
  canvas overlay away from inline colors;
- add a designed thrust/brake/coast audio layer, collapse-death cue, and loot
  variation after Greg's target-speaker mix review;
- surface mixer admission/drop diagnostics in the dev panel; the same data is
  now available to agents through `window.__TEST_API.getAudioDiagnostics()`.

These remain visible work, not silent RC waivers. Their final shape needs the
visual and listening taste gates rather than an opportunistic code-only retune.

## Historical Context

The July 4 mirror plan and Orrery review remain useful records of how the
architecture was selected:

- `docs/project/2026-07-04-orrery-v0.3-deep-review.md`
- earlier commits on this branch before persistent Ballpark and protocol v2

Those documents describe intermediate scaffolds. This roadmap is the current
product and release truth.
