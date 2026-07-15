# W1-E Units Doctrine and Ruler Layer Completion

Status: complete for the W1-E implementation vertical. The live capture file
was produced and visually inspected, but its automated post-capture gate raced
past the slingshot window; a clean rerun is deferred under the verification cap.

## Delivered

- Added one shared conversion contract beside `coords.js`: `1 sim unit = 1000
  m`, `Drifter = 12 m = 0.012 sim units`, and `100 m = 0.1 sim units`.
  Screen projection delegates to `coords.js`; no second camera or Y-flip rule
  was introduced.
- Registered draw handlers for all five S4 tunables and all six S5 force
  classes. Registry construction fails immediately when a handler is absent.
- Added a production-disabled ruler overlay with a true-scale 100 m bar,
  authority-derived 450/300/180 m capture rings, meter labels, magnetism and
  payoff vector pairs, coyote and chain temporal reads, and six force vectors.
- Added declared human units, ranges, steps, and start biases to the resolved
  dev controls. Slider input snaps against the declared range origin before it
  mutates `CONFIG`; geometry reads the new value in the same render frame.
- Added an authoritative per-tick force ledger for thrust, coupling, gravity,
  wave, impulse, and drag. The ledger records exact velocity deltas in movement
  order, reconciles residual authoritative mutations into impulse, converts to
  `m/s^2`, and travels snapshot -> scene collection -> immutable presentation
  frame -> overlay. Presentation never owns or feeds gameplay.
- Kept the overlay static under reduced motion and moved its panel and scale bar
  out of the persistent HUD bands after visual inspection.

## Scale Decision

The scale is **PROVISIONAL**, per Greg/Primary on 2026-07-14. The 12 m Drifter
fiction peg follows the S4 example and makes the 25 m spatial step about two
hull lengths. Existing S4 capture-radius code already mapped `0.45` to `450 m`,
so the shared scale is `450 / 0.45 = 1000 m per sim unit`. This changes only
conversion, labels, debug geometry, and tuning presentation. Physics constants,
movement order, and gameplay behavior were not retuned.

Migration is centralized: a later fiction-scale decision changes
`src/content/units.data.json` and corresponding labels/projections. Existing
sim values remain untouched unless a separately authorized gameplay migration
explicitly chooses otherwise. The provisional decision is also recorded on the
active v0.3 decision surface in `docs/v0.3/OPEN-DECISIONS.md`.

## Contract Coverage

S4 handlers: `slingshot.captureRadius`, `slingshot.magnetism`,
`slingshot.coyoteTime`, `slingshot.payoffCurve`, and
`slingshot.chainWindow`.

S5 handlers: `force.thrust`, `force.coupling`, `force.gravity`, `force.wave`,
`force.impulse`, and `force.drag`.

Current authority reports coyote time as explicitly disabled (`0 ms`) rather
than inventing behavior. Magnetism, payoff projection, and chain timing are
drawn from live slingshot authority facts. The presentation-only capture and
chain preview sliders use `0 = authority`; they do not tune the sim.

## Focused Proof

- `node tests/ruler-contract.cjs`: 4/4 passed.
- `node tests/force-ledger.cjs`: 3/3 passed.
- `node tests/presentation-frame.cjs`: 4 passed, 0 failed.
- `node tests/movement-contract.cjs`: 2 passed, 0 failed.
- `node tests/ruler-overlay.cjs`: 8/8 passed, including all 11 handlers,
  `100 m -> 40 px`, `450 m -> 180 px`, reduced-motion state, and a same-frame
  `463 m -> 475 m` snapped geometry update.
- `node --check scripts/sim-runtime.cjs` and `git diff --check`: passed.

No broad suite, package gate, candidate gate, or retry loop was run.

## Live Evidence

Capture path:
`tests/screenshots/ruler-live-20260714/movement-slingshot-overlay.png`
(ignored harness artifact, not committed).

The corrected browser boot had zero browser errors after the isolated worktree
received a local `node_modules` symlink to the primary checkout. The captured
frame visibly contains the 100 m ruler, 450/300/180 m true-scale rings,
magnetism lock and payoff exit vectors, all 11 readout rows, and non-zero
thrust/coupling/gravity/impulse/drag vectors during the slingshot approach.

The capture command still exited non-zero because its validation sampled a
later authority tick after the screenshot: by then the ship had left the
slingshot window and that tick's force vectors were zero. Per Primary's one
corrected-attempt cap, no retry was made. The script now gates the authoritative
slingshot and non-zero force facts immediately before capture so the next async
evidence run will not repeat that temporal race. The inspected frame also
revealed HUD overlap; source placement was corrected afterward, so a fresh
capture remains deferred evidence for the final non-overlap layout.

## Deferred and Open

- The 12 m peg and resulting `1000 m/sim unit` scale remain provisional.
- S4's five gameplay ranges and final starting values remain owned by W1-D;
  W1-E does not resolve or retune them.
- Coyote time remains a registered, drawable disabled contract until its
  gameplay owner implements it.
- A clean live rerun is needed only as asynchronous visual evidence for the
  corrected overlay placement; it is not a missing implementation contract.
