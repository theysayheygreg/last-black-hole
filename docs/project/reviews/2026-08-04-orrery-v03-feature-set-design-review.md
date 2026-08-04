# Orrery Review: v0.3 Feature-Set Design Audit

> Reviewer: Orrery. Date: 2026-08-04. Reviewed HEAD: `3157ffc1` on
> `codex/v0.3-ballpark-roadmap`. Read-only review; no source changed.
> Method: four parallel deep-reads (core mechanics, threat/ecology/clock,
> screens/run-loop, orphan audit) over src/, scripts/, tests/, docs/, then
> synthesis. Scope: what everything does, what is confusing, what is
> orphaned, what is not working at all.

## Verdict

The inner ring of the game — movement, fabric, wells, noise, the inhibitor
ecology, waves, portals, contacts — is genuinely built, server-authoritative,
disciplined (zero TODO/FIXME in ~160 source files), and mostly coherent. The
rot is not in the core. It is concentrated in three outer rings:

1. **The meta/progression layer is mostly theater.** Items, rig levels,
   signatures, and profile upgrades all *display* mechanics that do not
   exist. The game's promises outrun its truth exactly where players form
   long-term attachment.
2. **The evidence layer has a hole.** 36–43 test files — including the
   retirement guards and the only proofs of the ecology caps, the noise
   budget, and the FREE-step ordering — are absent from
   `tests/suite-manifest.cjs` and never run anywhere. Many "proved by
   focused suite" claims in the docs are unenforced.
3. **The design-doc layer describes a different game.** Most of
   `docs/design/` predates the Noise/ecology rewrite and carries no
   historical banner. Anyone reading top-down builds the wrong model.

On top of those: one live movement exploit (grapple tap-spam), one pacing
hole (the Shallows exit drought + a HUD that counts down to apertures that
never appear), and an RC gate that is still recorded red on the packaged
build (`docs/v0.3/RC-GATE.md`).

---

## Part 1 — What the game actually is right now

One authority (`scripts/sim-runtime.cjs`, 15 Hz, per-map durations
480/600/720 s), one client (`src/main.js` immediate-mode canvas), three maps
(Shallows 5×5 / Expanse 15×15 / Deep Field 25×25), two public hulls
(drifter/breacher), four-player sessions with server-side AI rivals.

**The loop:** title → pilot select → home terminal (SHIP/VAULT/RIG/
CHRONICLE/LAUNCH) → survey-based map select (coarse aggregates only, seed
reroll) → drop in → fly/salvage/listen → extract (Salvage Report → home) or
die (results → home). EM from survival time (0.5/s, half on death); cargo →
vault → manual sell; rig levels are the EM sink.

**Moment to moment:** analog thrust/brake with a heat budget (overheat = 3 s
lockout), one continuous fabric current field (seeded sea + well rotation),
per-hull carry cap at 20% of calm-space speed, grapple-arc anchors on
wells/stars/planetoids (hold-release, flat boost, no cooldown), swept
body-aware contacts for pickups/portals/wells/waves.

**Threat:** wells kill inside an invisible inner third of their visual body
and grow four ways; the Noise system (all canonical meters) feeds exactly two
listeners — swarms and signal blooms; the inhibitor ecology escalates on map
fronts at 15/30/45% progress (Glitches → Swarms → Vessels, total cap 11);
vessels overdrive wells they pass, permanently; event waves shove you a
constant 25% of hull reference speed; scavengers/sentries/jellies are
ambient pressure, no combat anywhere — every answer is navigational.

That core hangs together. The gears mesh. What follows is everything that
doesn't.

---

## Part 2 — Not working at all

### 2.1 `blocker` — Grapple tap-spam banks unbounded speed
Every capture grants the full flat boost (+0.61 sim/s at a well) with no
cooldown, no minimum arc, and release requires only button-up
(`scripts/sim-runtime.cjs:5003-5056`, `engagePlayerSlingshot`). Alternating
the button each tick inside `hookRadius` adds boost per cycle; grapple
velocity is never speed-clamped while engaged. GRAPPLE-ARC-v3's rule
"holding longer never banks more speed" is true and beside the point —
*tapping* banks more speed and is strictly dominant. The only guard test for
hold-invariance is vacuous (`tests/slingshot-contract.cjs:76-78` compares an
expression to itself). Fix shape: per-anchor re-hook cooldown or a
minimum-arc gate before the boost re-arms.

### 2.2 `blocker` — The test manifest hole
36+ test files exist in `tests/` but are not in `tests/suite-manifest.cjs`
and are referenced by nothing: `inhibitor-ecology.cjs`,
`inhibitor-cap-run-reset.cjs`, `noise-radius.cjs`, `free-movement-step.cjs`,
`interaction-volumes.cjs`, `honest-environment-channels.cjs`,
`fabric-simplification.cjs`, the slingshot input suites, and the retirement
guards (`time-slow-retirement.cjs`, `fabric-readability-cleanup.cjs`, …).
These are exactly the files the docs cite as proof. There is no manifest
completeness guard. Fix shape: one test that diffs `readdirSync('tests')`
against the manifest plus an explicit exclusion list; then wire or delete
each orphan deliberately.

### 2.3 `blocker` — The Shallows exit drought + lying aperture timer
The portal guard cascade pushes windows 2–5 past the phase-3 front, and
`latePhaseRules` zero their counts: Shallows' effective schedule is one
optional window (36–126 s) and then **nothing until the final exfil at
480 s** — a 354-second stretch with no exit on the *teaching map*
(`tests/portal-clock.cjs:90` asserts this shape verbatim). Meanwhile the HUD
takes `next: aperture` from `portalSchedule.windows[].openTime` with no
reference to `effectiveCountRange` (`src/ui/hud-presentation.js:36-41`), so
it counts down to windows that open with `portalCount: 0`. Two decisions
needed: is the drought intended pacing (commit to it and make the HUD
honest) or a schedule bug (rebalance the guard cascade)? Either way the HUD
must skip empty windows.

### 2.4 `broken` — Progression is two half-systems, both mostly inert
- The legacy profile upgrades (`UPGRADE_TRACKS`, `performUpgrade`,
  `VAULT_CAPACITY` ladder, `src/profile.js:155,492-540`) have **zero
  callers** — persisted, normalized, unbuyable. The only reads of
  `upgrades.*` are client-side in the legacy sandbox path
  (`src/main.js:1830-1833`); the authority reads none.
- Rig levels, the system that replaced them, are applied only in
  `scripts/player-brain.cjs:204-311`, where ~45 of 75 level rules are empty
  blocks with comments claiming "applied in ability tick" — no such
  application exists in `sim-runtime.cjs`. The shipped caps also lock out
  some levels that *do* work.
- `OPEN-DECISIONS.md` §Progression says rig tracks are the player-facing
  promise; in code the retired system has more live effect (in sandbox)
  than the promised one (on the authority).

### 2.5 `broken` — Loot that lies
- 22 artifact `special` ids exist in `src/content/items.data.json`; **no
  parser for the effect grammar exists anywhere.** 17 ids appear nowhere
  outside the JSON.
- **11 items are fully inert** (no coefficients AND unimplemented special),
  including the tier-1 `burn-canister`: they drop, display an effect
  string, occupy slots, sell for EM, and change nothing.
- Cosmic signatures roll per run and render "mechanical" claims in the
  briefing ("low gravity / high drift"), but the entire `mods` block has
  **zero readers** (`src/content/signatures.data.json:183`). The old
  template system (`applySignatureConfig`, `src/signatures.js`) is wired to
  nothing. Signatures are pure flavor text presented as physics.

### 2.6 `broken` — Small dead ends in the shipped loop
- CHRONICLE tab accepts no input — `src/main.js:4224-4306` has branches for
  tabs 0,1,2,4, none for 3.
- `recentEchoes` is in-memory only; Chronicle's echo panel empties on every
  reload (`src/main.js:482,2632`).
- Extraction shows two results screens back to back: the design-system
  results overlay, then the legacy hardcoded `meta` "SALVAGE REPORT"
  (`src/main.js:6663-6755`). Death gets neither Salvage Report nor `meta`.
- Title-screen "back" calls `requestPackagedQuit()`, a no-op outside
  Electron (`src/main.js:512`).
- `wellsVisited` results row can never render — the server never sends the
  field (`src/run-results.js:158`).
- Chronicle shows 50 run records in sandbox but only 5 after any remote run
  (`replaceActiveProfile` overwrites `runRecords` with the server's 5).
- Remote-path `runEmEarned({cargoValue})` passes an argument the function
  doesn't take (`scripts/sim-runtime.cjs:2113`) — reads as if cargo pays
  out; it doesn't.

### 2.7 `broken` — RC state
`docs/v0.3/RC-GATE.md` records the packaged playtest build RC Red: 120/124
suites, AgentPlay red on the portal controller, not rerun. Nothing in this
review supersedes that; it is the standing gate.

---

## Part 3 — Confusing (behavior that will cost playtest trust)

### Player-facing
1. **Heat.** Invisible below 2% (contextual bar only), hidden two-rate
   cooling (0.03 base, +0.12 only after 0.5 s hands-off — feathering
   silently forfeits 4× cooling), braking *generates* heat (0.6×), heat is
   frozen entirely while grappled, and overheating resumes you at 25% heat
   — which reads as a reward. None of this is taught anywhere.
2. **The carry cap is hull-relative and invisible.** Same eddy, a Breacher
   is carried at 749 m/s and a Hauler at 291. The Drifter — the "current
   mastery" hull — has the *fastest* coupling but a *small* cap. No HUD
   signal explains any of it.
3. **The collapse timer reads as death when it means exit.** `COLLAPSE
   0:00` is exactly the moment the guaranteed final exfil opens. Orange/red
   urgency colors on a timer that ends in your ride arriving.
4. **Wave size is a lie of emphasis.** Ring amplitude scales with cause
   (mass-3 well vs planetoid crumb) but the crossing impulse is a constant
   25% of hull speed. Big ring, small ring, identical shove.
5. **Wells: the visible edge means nothing, the lethal edge is invisible.**
   Visual core is killRadius/3 by design ("die before you see black") —
   defensible as horror, but combined with sentries that shove you *inward*
   from just outside the kill radius, the teaching map teaches by killing.
6. **Join-live silently discards your map choice.**
   `selectedDiffersFromLive` is computed and never rendered
   (`src/main.js:2113`); reroll silently does nothing when joining.
7. **Vault sell is one keypress, no confirm** — while profile delete gets a
   two-step confirm. Inverted stakes.
8. **Two back buttons, two destinations** on map select: ESC → title,
   gamepad B → home. And map select's X binding is "host reset," the same
   physical button that deletes pilots one screen earlier.

### Structural (doc/code disagreements that will misdirect the next builder)
9. **Gravity differs by map.** `useCoarseField: false` on Shallows means
   the teaching map computes exact per-well gravity while Expanse/Deep
   Field sample the coarse grid — different numerical profile, and anomaly
   gravity multipliers are silently dead on Shallows
   (`scripts/sim-runtime.cjs:3195-3214`).
10. **Growth contract inverted.** `OPEN-DECISIONS.md` says growth changes
    *reach*, strength fixed. Code does the opposite: mass multiplies
    magnitude and killRadius; reach constants never move.
11. **Vocabulary triples.** heat/deltaV are one thing with two names;
    slingshot/grapple are one mechanic with two names (docs say grapple,
    every event/test/HUD key says slingshot); "grace" means three different
    things (a distance, a confirm window, a survival timer); "Deck" in code
    means Steam Deck, not the home surface; player thrust noise is
    classified `VESSEL THRUST`; retired Signal vocabulary still ships in
    the RIG tab's player-facing strings (`src/profile.js:190-205`).
12. **Phase numbering is 0-indexed in code and 1-indexed in
    OPEN-DECISIONS.** Same schedule, two numberings.

---

## Part 4 — Orphaned

### Ghosts (documented, never built)
- `docs/design/THREAT-MODEL.md` systems A & D (Hunter archetype, cargo
  steal, universe heat map) — zero code hits. No historical banner.
- `docs/design/SCORE-SCREEN.md` — score, wave multiplier, count-up: zero
  occurrences. The real results screen has an unrelated model.
- `docs/design/MEGASTRUCTURES.md` — zero hits, still cited as future-tense
  in two live docs.
- `docs/design/UNIVERSE-CLOCK.md`, `PORTALS-V2.md`, `SCAVENGERS-V2.md`,
  `FAUNA.md`, `AI-PLAYERS.md` (stale path, and the adversarial premise is
  unbuilt — AI rivals don't hunt or steal) — all read as live specs, all
  superseded, none stubbed. ~19 March/April docs total lack v0.3 status
  headers (the X-B versioning program explicitly skipped them).

### Orphans (built, nothing uses them)
- **Bench inspector stack:** 5 of 6 `src/bench/` modules are reachable only
  from tests; `contract-registry.js` has no reference at all. Meanwhile
  `BENCH-TUNING-MODE.md` still says "proposal… not ratified" with an
  unchecked F0 list that is, in fact, shipped. Code and doc disagree in
  *both* directions.
- Three internal hulls (resonant/shroud/hauler): full stat blocks, ~60
  lines of rig-effect copy, live client render branches, three sim
  abilities implemented and uninvocable — and three declared abilities
  (`slipStream`, `smashGrab`, `dampeningField`) with no sim implementation
  at all.
- Dead knobs and channels (selection): `environmentAcceleration.wave`
  constructed every step, never applied; `fieldFlowScale` multiplied into
  nothing; `deltaVRegenDelay` unreachable duplicate; `unstable`/`rift`
  portal types unreachable in product play (only window 0 spawns, type
  `standard`); ~13 dead keys each in `hulls.data.json` and
  `anomalies.data.json`; `TUNING_CONTRACTS.signal` kept alive purely by a
  red-flag test; `src/render-three/renderable-hints.js` duplicated by the
  live path; `src/content/inhibitor-ecology.js` referenced by nothing.
- Small fry: `mapRiskLabel`, `menuBack` cue, `p.totalItemsSold`,
  `reel.duration_ms: 0` diagnostic, ~25 unused exports across
  coords/items/units/ruler modules.

### Zombies (retired, still present)
- Signal-system strings in shipped RIG progression text and inventory
  aliases; `inhibitor.wake` event; `portal.wave = 99` / `finalInhibitor`
  flags; `DILATED` overload state that dilates nothing.
- Verified *cleanly* retired (zero residue): time-slow, global mute, the
  old wave-push/halo/surf fabric vocabulary, "Last Black Hole".

---

## Part 5 — What to do about it

### Smallest coherent wave (in order)
1. **Grapple re-hook cooldown** (2.1). One authority change + a real
   (non-vacuous) hold/tap invariance test.
2. **Manifest completeness guard** (2.2), then triage the 36 orphan tests:
   wire the ecology/noise/movement proofs into a lane; delete what's
   superseded. This is the cheapest trust repair in the repo.
3. **Portal schedule decision + honest HUD** (2.3). Greg call on drought
   vs bug; HUD skips zero-count windows either way.
4. **Progression honesty pass** (2.4, 2.5): delete the unbuyable upgrade
   system; make the RIG tab display only implemented effects; pull the 11
   inert items from the loot table (or implement their top 3); signatures —
   Greg call: implement `mods` (the wiring point exists) or relabel the
   briefing as flavor and delete the `mods` block.
5. **Dead-end fixes** (2.6): Chronicle input, persist `recentEchoes`, merge
   `meta` into the results overlay, drop the browser quit button.
6. **Doc hygiene:** historical banners on the ~19 stale design docs (one
   mechanical pass), fix BENCH doc status, reconcile the growth contract
   (10) in whichever direction is intended.

### Greg decisions — RATIFIED 2026-08-04

1. **Grapple tap-spam: bug.** Release must not allow immediate re-grapple —
   add a re-hook cooldown (per-anchor or global) so tap cycling cannot bank
   boost. Replace the vacuous hold-invariance assertion with a real one.
2. **Test manifest hole: fix.** Add a manifest completeness guard; triage
   the ~36 orphan tests (wire or delete deliberately).
3. **Portal drought: orchestrator mismatch, confirmed by trace.** Three
   composing faults: (a) window durations are absolute seconds while
   cadence is progress-normalized, so short maps collide immediately;
   (b) the front guard is forward-only and displaces a window's *open*
   past a front when merely its *close* grazes it
   (`sim-runtime.cjs:545-551`); (c) latePhaseRules ×0 at phase 3 = 45%
   progress annihilates everything displaced there — the back half of
   every map is exit-less, Shallows worst (one window at 36–126 s).
   Fix direction: progress-normalize window durations, make the guard
   band-preserving (shrink/clamp within the declared phase band, as
   conducted waves already do), then re-judge whether phase-3 ×0 is
   intended. `tests/portal-clock.cjs` is the contract to rewrite.
4. **Progression: flesh out and fix.** Delete the zero-caller upgrade
   system; make rig levels real on the authority (implement the empty
   rules or remove them from player-facing text); one progression truth.
5. **Signatures: implement the mods.** Wire the existing `mods` block
   (gravity/drag/coupling/growth/portal-lifespan multipliers) into the
   authority so the briefing's mechanical claims are true.
6. **Inert artifacts: cull now, implement later.** Pull the 11 inert items
   from the loot table immediately; the special-effect grammar (parser +
   top effects) becomes its own follow-up work item.
7. **Internal hulls: keep as v0.4 roster.** Leave the data; delete the
   three ability declarations with no sim implementation (`slipStream`,
   `smashGrab`, `dampeningField`) so the roster is honest; mark v0.4.
8. **Well growth: reach-first — fix the code to match OPEN-DECISIONS.**
   Growth expands `fullGravityRadius`/`falloffEndRadius` per-well while
   strength stays fixed; wells claim territory rather than deepening.
   Known cost: late-game re-tune on every map and a re-check of this
   week's fabric-visual tuning. Kill-radius growth unchanged unless Greg
   says otherwise.
9. **Results flow: merge into one.** Fold the Salvage Report's content
   into the results overlay's cargo column; delete the `meta` phase;
   death and extraction get symmetric treatment.

## Honest limits

This review is code-and-doc archaeology, not play. Feel claims (heat
teaching, drought pacing, wave readability) need the playtest the RC gate
is waiting on. Numbers were cross-read from source by four independent
passes but not re-executed; the unmanifested tests mean some cited
assertions have never actually run.
