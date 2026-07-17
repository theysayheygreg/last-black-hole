# v0.3 Roadmap: Ballpark Authority

> Document revision: v0.3. Updated 2026-07-17 from live branch and harness
> evidence. Earlier mirror-scaffold plans are retained as history in the review
> documents they came from, not as current implementation claims.

## Status

**Integration branch:** `codex/v0.3-ballpark-roadmap`

**Public/demo line:** `main` remains the v0.2 line until Greg explicitly calls
the version promotion.

**Current state:** consolidated v0.3.1 source candidate through the map-relative
schedule merge `dca8beac`. Accepted W1/W2, 5/15/25 map authority, Map Select,
Deck UI, pause/resume, entity visuals, config, measurement, design versioning,
Orrery blocker fixes, locked units, retired per-player time dilation, and the
ratified normal-input slingshot path are integrated. Focused merged-surface
checks are green. The newer source has not yet replaced the deployed
`0.3.1.2b93b077` package; browser, visual, package, platform, and physical Deck
evidence remain RC work. Promotion into `main` remains closed until Greg's
explicit version call; movement feel and visual taste remain Greg's final calls.

The v0.3.1 map-relative schedule migration is source-complete: map-scale
content owns the 480/600/720-second durations, the match Conductor resolves
whole-run fronts from normalized progress, and client/server/build/result
surfaces consume the selected duration. The focused contract preserves the
600-second Expanse anchor, with epoch 3 intentionally at 75%. This locked
baseline is ready for playtest; later multiplier balance remains tunable.

### Production Polish Candidate

Branch `codex/v0.3-production-polish` carries a focused post-review batch over
the green RC:

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

Focused receipts passed on 2026-07-14: Three entity lifecycle 9/9, movement
audio 10/10, swept authority 5/5, input timeout 1/1, movement golden 5/5, and
meta flow 8/8. Broader candidate lanes remain asynchronous checkpoint work;
this feature batch does not claim a new full release gate.

v0.3 converts the successful game-jam stack into a small production-shaped
game architecture without replacing the custom physics or ASCII-fluid visual
identity. The server owns gameplay truth; Three, UI, VFX, and audio consume
explicit presentation contracts.

## Release Pillars

1. **One authority.** Death, movement, contact, loot, signal, extraction,
   inventory, outcomes, and durable profile writes are server/sim facts.
2. **One world model.** Toroidal geometry, swept contact, stable body identity,
   lifecycle, relevance, and replication lanes use shared modules.
3. **One playable story.** Shallows teaches movement, slingshot, salvage,
   signal consequence, and confirmed extraction in a truthful seeded route.
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
- Player-local event lanes keep inventory, loot, effects, signal crossings,
  and portal interaction facts private to their owner.
- The bounded event journal and live snapshot ring expose watermarks, gap
  detection, run invalidation, and valid client snapshot rebase behavior.
- Empty AI-only sessions idle instead of becoming ghost matches; terminal runs
  stop ticking while remaining briefly inspectable.

### Product Loop

- Seed previews and authority launches agree on map, signature, well names,
  counts, loot preview, and route anchors.
- Shallows route order is movement/slingshot, salvage, signal consequence,
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

Latest authority evidence on 2026-07-14:

| Measure | Observed |
|---|---:|
| authority tick | 7.65 / 8 Hz |
| snapshot p95 latency | 5.32 ms |
| snapshot p95 size | 107.88 KiB |
| estimated snapshot transport | 0.33 MB/s |
| heap growth | 1.12 MiB |
| Ballpark sync p95 | 1.142 ms |

## Playable Evidence

The natural agent journey starts a fresh sim and disposable browser at
1280x800 Deck dimensions. It uses normal menus, protocol-v2 authority, real
controller input, and world contact. It does not mutate player, portal, wreck,
or Inhibitor debug state.

Latest passing report from the clean no-retry RC pass:

`tests/screenshots/agent-play-eval-2026-07-14T191436848Z/summary.md`

It proves:

- title, profile, Home, route briefing, and authoritative launch;
- intentional movement and a well slingshot engage/release;
- natural wreck salvage and signal/Inhibitor pressure;
- portal ready state before explicit confirmation;
- authoritative extraction and result writeback;
- Home rig and Chronicle continuity;
- a rerolled, changed second run with renewed movement;
- a second fresh journey that selects Breacher, dies to a visible named well,
  and returns Home through normal controller input;
- eighteen screenshots covering both outcome branches and UI surfaces,
  including generated entity sprites and a populated icon-bearing salvage
  report.

The complete lane passed without retries after the visual integration and
harness-timeout correction. Earlier timing variability remains useful tuning
history, but it did not recur in this RC pass.

## Remaining Release Gates

These are evidence gates, not missing architecture:

- [x] Build the final hash-named artifact from the clean committed RC tree.
- [x] Boot the embedded control plane, sim, and packaged Three client from that
  exact artifact.
- [x] Run the complete no-retry automated candidate lane after the final
  source changes.
- [ ] If the physical Deck is online, deploy and verify Gaming Mode launch,
  Steam Input, 1280x800 readability, suspend/resume, and log paths.
- [ ] Greg reviews movement feel, route pleasure, visual hierarchy, and final
  polish.
- [ ] Greg reviews the target-speaker/headphone mix; browser audio-graph
  inspection and the prioritized runtime copy retunes remain polish follow-up.
- [ ] Greg explicitly decides when v0.3 promotes to `main`.

## Deferred Beyond v0.3

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
