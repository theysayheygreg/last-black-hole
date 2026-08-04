# Goal Prompt: v0.3 Feature-Set Repair Program

> Author: Orrery. Date: 2026-08-04. For: Codex (Forge lanes).
> Source of truth:
> `docs/project/reviews/2026-08-04-orrery-v03-feature-set-design-review.md`
> (full audit + Greg's nine ratified decisions). Base branch:
> `codex/v0.3-ballpark-roadmap` at `3157ffc1` or later.
> Work the items **in order** — the sequence is dependency-ordered on
> purpose. One branch/PR per item, evidence receipts per house rules.

## Standing constraints

- Server authority (`scripts/sim-runtime.cjs` + `scripts/sim/*`) is the
  only gameplay truth. No client-side gameplay changes.
- Do not touch the locked fabric visual grammar, the carry cap, the wave
  impulse, or the concept composites.
- Every item ships with tests that run — i.e. listed in
  `tests/suite-manifest.cjs`. After item 2, that is mechanically enforced.
- No new tunables without units and steps. No sub-milli magic constants.

---

## Item 1 — Grapple re-hook cooldown (exploit fix)

**Decision:** tap-spam is a bug. Release must not allow immediate
re-grapple.

**Problem:** every capture grants the full flat boost (+0.61 sim/s at a
well) with no cooldown; alternating the button each 15 Hz tick banks
unbounded speed. Grapple velocity is never speed-clamped while engaged.

**Changes:**
- `scripts/sim-runtime.cjs` (`engagePlayerSlingshot` ~:5003,
  `updateSlingshotAim`, release path ~:5058): after any release
  (button-up, brake abort, anchor-lost), start a re-hook cooldown during
  which the player cannot re-engage. Recommended: per-player global
  cooldown of ~1.0–1.5 s (pick one value, name it, put it in
  `src/content/grapple-arc.data.json` with units/step). A per-anchor
  variant is acceptable if it also prevents two-anchor alternation —
  global is simpler and safer.
- Suppress the aim/lock telegraph during cooldown so presentation matches
  truth (the affordance must not show a hook you cannot take).
- Do not change boost magnitude, arc geometry, or release assist.

**Verification:**
- Replace the vacuous assertion at `tests/slingshot-contract.cjs:76-78`
  (it compares an expression to itself) with a real invariance test:
  short-hold vs long-hold exit speed equal; AND a tap-cycle test proving
  N engage/release cycles inside `hookRadius` within the cooldown window
  yield exactly one boost.
- Sim-level test: scripted 10-second tap-spam at a well caps out at
  (entrySpeed + one boost + tolerance), not a ramp.
- Confirm `tests/slingshot-v2.cjs` / `slingshot-v2-live.cjs` still pass.

---

## Item 2 — Suite-manifest completeness guard + orphan-test triage

**Decision:** fix. This repairs the evidence layer and gates all later
items' "proved" claims.

**Problem:** 36+ files in `tests/` are absent from
`tests/suite-manifest.cjs` and referenced by nothing — they never run in
any lane. Casualties include the only proofs of the inhibitor caps
(`inhibitor-ecology.cjs`, `inhibitor-cap-run-reset.cjs`), the noise
budget (`noise-radius.cjs`), FREE-step ordering (`free-movement-step.cjs`,
`continuous-free-contributions.cjs`), interaction volumes, and the
retirement guards (`time-slow-retirement.cjs`,
`fabric-readability-cleanup.cjs`, `honest-environment-channels.cjs`,
`pilot-delete-global-mute.cjs`).

**Changes:**
- New test (in the core lane): diff `readdirSync('tests')` (*.cjs,
  excluding helpers/drivers by explicit list) against the union of
  `suite-manifest.cjs` entries + a checked-in
  `tests/manifest-exclusions.cjs` where every exclusion carries a
  one-line reason. Unlisted file = red.
- Triage every orphan file into exactly one of: (a) wire into an existing
  lane; (b) delete with the superseding suite named in the commit
  message; (c) exclusion-list with reason (screenshot/capture receipts
  belong here). Priority wires: the ecology, noise, movement-step,
  interaction-volume, and retirement-guard suites listed above.
- While triaging, fix `tests/fabric-readability-cleanup.cjs` to sweep
  `src/` rather than its 11 hand-listed files, or note the gap in its
  exclusion reason.

**Verification:** full suite green with the guard in place; the triage
table (file → wired/deleted/excluded + reason) goes in the PR body and in
`docs/v0.3/evidence/`.

---

## Item 3 — Portal schedule rework + honest HUD

**Decision:** orchestrator mismatch, confirmed by trace. Not intended
pacing.

**Problem (three composing faults):**
1. Window durations are absolute seconds while cadence is
   progress-normalized (`sim-runtime.cjs:521-528`): on Shallows the 20%
   cadence gap is 96 s and window 0's duration is 90 s, so the sequential
   10 s guard displaces window 1 immediately.
2. The front-avoidance guard (`sim-runtime.cjs:538-556`) is forward-only
   and pushes a window's *open* past a front when merely its *close*
   grazes the front — displacing windows into later phases.
3. `latePhaseRules` ×0 at phase ≥3 (`:219-222`), and phase 3 begins at
   45% progress — anything displaced past it is annihilated. Net effect:
   Shallows has one aperture window (36–126 s) then nothing until the
   final exfil at 480 s; every map's back half is exit-less.

**Changes (`scripts/sim-runtime.cjs` schedule block ~:459-611):**
- Progress-normalize optional-window durations: author them as fractions
  of map duration referenced to the 600 s map (90 s @600 → 0.15), so
  Shallows gets 72/60/48/36/24-second windows and the cadence gaps hold
  on every map.
- Make the guard band-preserving: a window declared at requested progress
  p stays inside its phase band — resolve front collisions by shrinking
  the window or sliding it *within* the band (earlier allowed), never by
  displacing it across a phase boundary. Mirror the banded placement
  `createConductedWaveSchedule` (`scripts/sim/conductor.cjs:63-123`)
  already uses.
- Re-tune `latePhaseRules`: replace phase-3 ×0 with ×0.5 and shorter
  durations (exits get scarce and brief, never absent), unless a window's
  band is genuinely un-fittable. The final exfil contract is unchanged.
- HUD honesty (`src/ui/hud-presentation.js:36-41`): `next: aperture`
  must skip windows whose `effectiveCountRange` max is 0, and
  `openPortalWindow` should not publish `portal.windowOpened` with
  `portalCount: 0`.

**Verification:**
- Rewrite `tests/portal-clock.cjs` as the new contract: per-map effective
  schedules asserted; invariant tests that (a) no optional window crosses
  out of its declared band, (b) every map has ≥1 optional window with
  count > 0 in each of the first three phase bands where one is declared,
  (c) max exit-less gap between consecutive live windows is bounded
  (state the bound in the test).
- HUD test: timer state never counts down to a zero-count window.

---

## Item 4 — Honesty pass (cull + dead-end fixes)

**Decisions bundled:** artifacts cull-now; hulls stay internal for v0.4;
results screens merge; small dead ends fixed.

**Changes:**
1. **Inert artifacts** (`src/content/items.data.json` + server mirror
   `scripts/seeded-generation.cjs`): remove the 11 fully-inert items
   (`burn-canister`, `harmonic-anchor`, `phase-veil`, `cargo-brace-mk2`,
   `tidal-resonator`, `burn-extender`, `gravity-lens`, `echo-chamber`,
   `void-anchor`, `singularity-drive`, `laminar-flow-core` /
   `inhibitor-resonance`, `temporal-displacement` — reconcile the exact
   list against zero-`coefficients` + unimplemented-`special` before
   deleting) from the droppable loot table. Move their ids to the
   `RETIRED_*` list so saved vaults sanitize cleanly. Keep items with
   real coefficients.
2. **Unimplemented ability declarations**: delete `slipStream`,
   `smashGrab`, `dampeningField` from `src/content/hulls.data.json` and
   their rig-effect strings from `src/profile.js` / `RIG_LEVEL_EFFECTS`.
   The hulls themselves (resonant/shroud/hauler) stay in data, internal,
   marked v0.4 in a comment.
3. **Dead upgrade system**: delete `UPGRADE_TRACKS`, `getUpgradeCost`,
   `canAffordUpgrade`, `performUpgrade`, the `VAULT_CAPACITY` ladder
   (`src/profile.js:155,492-540`) and the sandbox-only reads at
   `src/main.js:1830-1833,3993,4688,5256`. Keep the `upgrades` field in
   stored profiles for migration but stop applying it anywhere.
4. **Results merge**: fold the `meta` Salvage Report content (vault
   deposit outcome, overflow auto-sells) into the results overlay's cargo
   column (`src/run-results.js`); delete the `meta` phase
   (`src/main.js:6663-6755`) and route `escaped` confirm → `home`.
   Death and extraction get the same screen, extraction with the salvage
   column populated.
5. **Dead ends**: add CHRONICLE input handling (`homeTab === 3` branch,
   `src/main.js:4224-4306`) so the tab scrolls; persist `recentEchoes`
   into the profile (cap it; `src/main.js:482,2632`); remove the title
   "back → quit" binding in browser context (`requestPackagedQuit` no-op,
   `src/main.js:512`); drop the `wellsVisited` results row or send the
   field from `buildRunResult`; delete the ignored `cargoValue` argument
   at `scripts/sim-runtime.cjs:2113`.
6. **Zombie strings**: retire remaining Signal-era player-facing text
   (`src/profile.js:190-205` signal wording) in the same pass, since
   item 4.2 already touches those tables.

**Verification:** roster/loot sync tests (`tests/public-roster.cjs`)
updated; a vault-migration test proving retired items sanitize without
data loss; UI layout tests for the merged results screen; manifest guard
(item 2) keeps everything wired.

---

## Item 5 — Signature mods wired into the authority

**Decision:** implement the mods; the briefing's mechanical claims must
become true.

**Problem:** `pickCosmicSignature` rolls per run
(`scripts/sim-runtime.cjs:344`) and the briefing renders `mechanical`
strings, but `signatures.data.json`'s `mods` block
(`currentCouplingMult`, `dragMult`, `wellGravityMult`, `wellGrowthMult`,
`portalLifespanMult`, `sensorRangeMult`, `signalGenMult`→noise,
`signalDecayMult`→noise) has zero readers.

**Changes:**
- Resolve the rolled signature's `mods` once at session start into a
  frozen `session.signatureMods` with explicit clamps (state ranges per
  key; reuse the noise-modifier clamp style in
  `scripts/player-brain.cjs:38-83`).
- Apply at the existing seams, not in new code paths: coupling and drag
  into the movement-step inputs; `wellGravityMult` into
  `resolveWellGravity` **both** branches (coarse-field build AND the
  direct Shallows path — do not recreate the coarse-only asymmetry);
  `wellGrowthMult` into the growth schedule; `portalLifespanMult` into
  window durations after item 3 lands; `signalGen/DecayMult` through the
  established `noiseRadiusMultiplier`/`noiseDecayMultiplier` aliases;
  `sensorRangeMult` into the client sensor scale via the snapshot.
- Rename the alias keys to noise vocabulary in the data while you're
  there (`signatures.data.json` is the last Signal-era holdout).
- Reconcile each signature's `mechanical` string against its actual mods
  so the briefing text states what the numbers do.
- Delete the orphaned template system if untouched by this work
  (`applySignatureConfig`, `SIGNATURE_DEFINITIONS`, `LAYOUT_MULTIPLIERS`
  in `src/signatures.js`) — the data path replaces it.

**Verification:** new `tests/signature-mods.cjs` in the manifest: for
each of the 6 seeded signatures, spin the sim and assert the modified
quantity moves in the stated direction and magnitude; a parity test that
Shallows (direct gravity) and Expanse (coarse) both honor
`wellGravityMult`.

---

## Item 6 — Rig progression made real

**Decision:** flesh out and fix. One progression truth, on the authority.

**Problem:** `scripts/player-brain.cjs:204-311` (`applyRigUpgrades`) is
the only consumer of `rigLevels`, and ~45 of 75 level rules are empty
blocks with comments claiming "applied in ability tick" — no such
application exists (`rigLevels` has zero reads in `sim-runtime.cjs`).
Shipped caps also lock out levels that DO work. The RIG tab displays all
of it as if live.

**Changes:**
- For every rig level inside `RIG_SHIPPED_LEVEL_CAPS`: implement the
  effect on the authority or delete the level (and its EM cost tier and
  display string). No empty blocks survive. Deferred-to-v0.4 effects for
  internal hulls may stay in data but must be unreachable AND unrendered.
- Reconcile caps: where a cap excludes an implemented level
  (breacher `smashgrab` level-5 noise reduction — note `smashGrab` the
  *ability* is deleted in item 4, the rig track may need renaming;
  drifter `laminar` level-3 coupling), either raise the cap or remove
  the level. Greg's standing intent is honesty over breadth — when in
  doubt, cut.
- `src/ui/loadout-presentation.js` / RIG tab: display only implemented
  effects; unify the two level denominators (SHIP tab shows `n/5`, RIG
  tab shows `n/shippedCap` — show shipped cap in both places).
- Retire remaining Signal vocabulary in whatever effect strings survive.

**Verification:** new `tests/rig-effects.cjs`: for each purchasable rig
level, a sim assertion that the effect measurably applies (thrust, noise
radius, coupling, etc. — same probe style as
`scripts/sim/hull-reference-speed.cjs`). A static test that every
displayed rig string maps to an implemented rule.

---

## Item 7 — Reach-first well growth (LAST — do not start early)

**Decision:** OPEN-DECISIONS wins; the code inverts. Growth must expand
*reach* while pull strength stays fixed. Kill-radius growth is unchanged.

**Problem:** growth raises `mass`, which multiplies gravity magnitude
(`src/content/well-gravity.js:38` via `effectiveWellMass`) and expands
`killRadius`; the reach envelope (`FABRIC.wellGravity.fullGravityRadius
0.25` / `falloffEndRadius 1.2`) is a global constant that never moves.

**Changes:**
- Give each well a per-well reach state seeded from the map and grown by
  the same four growth sources (schedule, star/wreck/planetoid
  consumption). Growth scales `fullGravityRadius`/`falloffEndRadius`
  (one shared ratio; author the growth-to-reach conversion with units and
  a step) while the strength term uses **base** mass, not grown mass.
- Both gravity paths must honor per-well reach: the coarse-field build
  (`scripts/coarse-flow-field.cjs`) and the direct Shallows path
  (`resolveWellGravity`). The well rotational *current* reach
  (`currentReach = falloffEnd × 1.5`) should follow the same envelope so
  fabric and gravity stay one shape.
- Decide-and-document what Vessel overdrive multiplies now (recommend:
  overdrive stays a strength multiplier — it is the one sanctioned
  "angrier, not bigger" effect, and it already has its own visual).
- `killRadius` formula untouched.
- Update `OPEN-DECISIONS.md` growth entry to "implemented"; fix the
  `UNIVERSE-CLOCK.md` stale numbers or banner it historical.

**Verification & re-tune (the real cost of this item):**
- Rewrite `tests/sim-growth-epochs.cjs` growth assertions:
  reach expands, strength-at-fixed-distance-ratio constant.
- Route the wreck/planetoid consumption paths through `applyWellGrowth`
  so all four sources emit `well.grew` per the event contract
  (`anomalies.data.json → eventContracts.wellGrowth`) — this closes the
  audit's growth-event gap in the same change.
- Late-game re-tune pass per map: verify a full-length run on each map
  stays navigable (AgentPlay full-lane receipt per map).
- Fabric-visual re-check against the readability program's acceptance
  frames: one ordinary-play capture per map at late epoch showing lanes
  still converging on the (now wider) well envelope. If the visuals
  regress, stop and flag for review before tuning shaders.

---

## Sequencing rules

- 1 and 2 first, in either order or parallel lanes; nothing else merges
  before 2's guard is green.
- 3 and 4 next, parallelizable (disjoint files except trivial overlap in
  `main.js` — coordinate the merge).
- 5 depends on 3 (portalLifespanMult) and 4 (signature data cleanup
  touches the same file family).
- 6 depends on 4 (ability/string deletions land first).
- 7 strictly last: it is the only sim-behavior change and forces the only
  re-tune; everything else must be stable underneath it so the visual
  re-check happens exactly once.

## Out of scope

Special-effect grammar/parser for artifacts (queued as its own follow-up
after this program), internal-hull promotion (v0.4), Bench F2 adapters,
doc-banner hygiene for the ~19 stale `docs/design/` files (separate
mechanical pass), anything touching the locked fabric grammar or the
carry cap.

## Done means

All seven items merged to the integration branch with green manifests,
the review doc's findings 2.1–2.6 closed or explicitly re-opened with
reasons, and a fresh AgentPlay full-lane receipt on all three maps at the
final HEAD.
