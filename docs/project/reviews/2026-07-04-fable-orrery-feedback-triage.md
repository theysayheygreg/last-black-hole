# Fable / Orrery Feedback Triage

> **Date:** 2026-07-04
> **Sources:** `2026-07-04-fable-feel-route-review.md`,
> `2026-07-04-fable-entity-visual-hybrid-review.md`, and
> `2026-07-04-fable-loop-meta-clarity-review.md`
> **Purpose:** classify the returned review work into implementation slices,
> roadmap items, Greg decisions, and explicit deferrals.

## Read First

The three memos agree on one uncomfortable pattern: the game often has strong
design language before the runtime has one honest source of truth. Movement
docs describe assists that do not exist. The UI displays EM numbers the ledger
does not credit. The renderer contract claims one visual stack while the code
ships another. The right response is not another broad rewrite. It is a set of
small truth-restoring slices, each with tests or captures that prove the claim.

The review output is actionable. Do not ask Orrery for a follow-up yet. The
open items are mostly Greg taste/product choices, not missing analysis.

## Accepted Immediate Work

### P0: Ledger Honesty

The loop/meta review found the sharpest user-facing bug: results can display an
EM reward that does not equal the profile ledger delta. That breaks the core
run loop harder than a rough layout does.

Accepted next slice:

- make one control-plane path credit EM for run outcomes;
- mirror the same behavior in the local profile path until local play consumes
  the same store;
- label cargo as salvage value unless it is actually sold into EM;
- add a test that asserts displayed results equal profile EM delta for
  extraction and death;
- decide death floor versus percentage tax before final numbers ship.

This belongs on the v0.2 demo line first if Greg wants weekend build polish,
then merged forward into v0.3.

### P1: Portal Palette And Well Debug Cleanup

The entity review confirms the visual direction we were circling: ordinary
portals should read as route/cyan, while magenta/violet is reserved for
Inhibitor, corruption, and blocked/sealed states. It also calls out the current
red well bullseyes as product-frame debug language that contradicts
fabric-first wells.

Accepted next slice:

- move normal portals to cyan/route;
- use violet only for blocked or Inhibitor-sealed portal states;
- move well hazard rings and red core discs behind debug views;
- add visual fixture checks so magenta does not leak into non-Inhibitor
  gameplay roles.

This is small, high-signal visual cleanup and should land before further entity
art production.

### P1: Movement Honest Baseline

The feel review's core point is right: tuning movement on top of split movement
truth and invisible slingshot feedback turns Greg into the measurement device.

Accepted next slice:

- centralize movement constants so client/config and authoritative server do
  not carry separate thrust universes;
- add a loopback latency budget probe before building prediction;
- dt-correct and normalize wave impulse behavior across map profiles;
- restore Three slingshot feedback parity: range rings, energy arc, exit ghost,
  chain badge, and screen-space circular rings;
- add behavioral probes for spawn safety, stop authority, slingshot payoff,
  portal capture, route viability, and death legibility.

The current lean is "latency diet first, prediction later only if measured
delay stays bad."

### P1: Codify The Hybrid Entity Stack

The hybrid recommendation is strong enough to treat as the default plan unless
Greg explicitly vetoes it. Tiny ship/friend/foe/wreck reads cannot survive
ASCII re-quantization at Deck scale. The ASCII ocean remains the product
surface; crisp pixel-authored entities ride above it with mattes, rims, and
bounded halos.

Accepted next slice:

- update renderer contracts so they name the hybrid stack honestly;
- unify entity tonality with the rest of the compositor instead of keeping a
  private entity post dialect;
- enforce a matte coverage budget in the visual harness;
- add warmed-fabric and Deck-native visual-reference lanes;
- run the player ship sprite-card versus pixel-textured-mesh capture as an
  asset-path confirmation, not as a blocker for accepting hybrid in principle.

## Roadmap Items

- **Portal entry confirm** is promising but product-shaping. Route it through
  open decisions before changing extraction behavior.
- **Wave magnetism** should wait until waves are honest and visibly taught by
  crest brightening. Do not add invisible wave rails first.
- **Well escape shoulder** should be the first major assist after baseline
  probes, with a visible fabric density tell and a thrust-gated implementation.
- **Chronicle bridge** should make remote-authority runs visible in the home
  chronicle. The packaged path cannot rely on local-only `runRecords`.
- **Drop briefing truth** should show 2+2 loadout, at-risk value, and applied
  rig line before launch.
- **Upgrade legibility** should translate rig effects into play language and
  prove one purchase changes a future run.
- **Wreck clusters and matte shrink** follow after the hybrid stack is named
  and measured.
- **Instancing** should land before multiplying wreck fragments or continuous
  thrust/brake VFX, but not before the first style kit proves the look.
- **Cosmic signatures** need either a small server-owned effect or demotion
  from decision-bearing briefing copy.

## Greg Decisions

These should stay explicit. Do not decide them silently while doing mechanical
cleanup.

- Is `2.5` server thrust the canonical feel, or should Greg fly `1.7` and
  `2.5` back to back before the shared constants land?
- Is a loopback latency diet enough for v0.3 if measured input-to-photon stays
  under the budget, or is client prediction required earlier?
- Should portal extraction remain fly-through, or become be-in-zone plus
  confirm and instant abort?
- Should Shallows' accidental star line become the intentional teaching route?
- Should normal portals be cyan/route with magenta reserved only for blocked
  states? The review recommendation is yes.
- Should ambient fauna be mostly fabric-coupled while sentries and hunters stay
  crisp?
- Should the matte coverage ceiling start at 15 percent on dense fixtures?
- Should death use a credited floor, a percentage tax, or both for v0.2 demo?
- Should the old component/rank upgrade grammar be retired in favor of rig
  tracks for v0.2?
- Should the separate meta salvage report be folded into results?
- Should chronicle show only career strip plus last five runs in the first
  public/demo slice?
- Should echoes remain visible in v0.2, or stay behind the curtain until the
  chronicle is deeper?

## Explicit Deferrals Or Cuts

- Cut beginner drift guard as a permanent direction unless Greg reopens it.
  Spawn safety plus a well shoulder is the honest beginner protection.
- Defer counter-steer damping until oscillation probes prove it is necessary.
- Defer wreck approach stickiness; if wreck approach needs help, prefer real
  wreck wake/lee-zone behavior later.
- Freeze mouse-model exploration. Keep mouse working, but Deck/controller
  product truth leads.
- Defer DualSense/adaptive-trigger work beyond v0.3.
- Do not show milestone UI while `milestonesUnlocked` remains empty.
- Do not revive insurance. The results/equipment-loss economy is cleaner.

## Recommended Next Order

1. **Ledger Honesty** because it fixes the loop's truth contract and is easy to
   test.
2. **Portal Palette + Well Debug Cleanup** because it removes obvious visual
   contradictions before more art is built on top.
3. **Movement Honest Baseline** because it unlocks real feel playtesting and
   reduces Greg-as-QA.
4. **Hybrid Visual Harness Gates** because the style decision needs regression
   protection as soon as it becomes policy.
5. **Chronicle Bridge + Drop Briefing Truth** because they close the first
   30-minute loop without adding new economy systems.

## Notes For Future Delegation

The prompt packets worked, but the memos caught prompt drift too. Future
packets should verify paths immediately before posting. Use `src/render-three/`
for renderer work, `scripts/sim/` for Ballpark work, and avoid naming
non-existent files like `src/three/entity-visuals.js` or
`src/shared/movement-constants.cjs` unless the task is to create them.
