# Orrery Review — Feel + Route Pass (Fable)

> **Date:** 2026-07-04
> **Packet:** `docs/project/prompts/2026-07-04-fable-feel-route-review.md`
> **Reviewed against:** `codex/v0.3-ballpark-roadmap` — design docs, v0.3 roadmap/RC gate,
> the 2026-07-04 deep review, `scripts/sim/player-movement-step.cjs`,
> `tests/movement-golden.cjs`, `tests/agent-play-eval.cjs`, and the live map files.
> **Scope:** review and design memo only. No code changed.

---

## The Shape Of The Problem

Three things are moving here, and the packet treats them as one thing. They aren't.

1. **The substrate is dishonest.** Client and packaged play are different games
   (thrust 1.7 vs 2.5), remote control latency is structurally 150–300 ms, and
   wave push varies ~4× by map profile because ring decay is tick-rate-dependent.
2. **The affordance layer is fiction.** Every helper in MOVEMENT.md — wave
   magnetism, escape assist, stickiness, buffering, damping, drift guard — is
   unimplemented. So are CONTROLS.md's turn-rate curves and thrust ramp; facing
   is direct-set. The docs describe a control model the code never had.
3. **The feedback layer regressed.** The server-side slingshot works, but the
   Three renderer dropped the energy arc, chain badge, per-anchor colors, and
   portal states the canvas renderer had. SLINGSHOT-NETWORK.md says it plainly:
   *the feedback IS the feature.* Right now the game's best verb is invisible.

Tuning feel on top of that substrate tunes noise. The wrong plan is "add the
MOVEMENT.md assists and playtest." The right plan is: make the baseline honest,
make the existing verb visible, *then* run a short, ranked affordance ladder
with measurement in front of it.

One housekeeping note: the packet's optional reading list cites
`src/shared/movement-constants.cjs` and `src/ballpark.cjs` — neither exists.
Movement truth is `scripts/sim/player-movement-step.cjs` (hardcoded `2.5`
accel, `SERVER_INPUT` table); Ballpark lives under `scripts/sim/`. Even the
prompt drifted from code truth. That is the project's recurring disease and the
first experiment below is the cure.

---

## Q1 — The First 60 Seconds On Shallows

Second-by-second is the wrong resolution for a fluid game; beat-by-beat with
time budgets is honest:

- **0–5 s — Alive and drifting.** Spawn in calm water, visibly *carried* a
  little by current. No well within threat range (spawn-safety must be a tested
  invariant, not a hope). The fabric moves; the ship answers it. Nothing kills
  you if you touch nothing.
- **5–15 s — Hands on.** First thrust: response within one perceptual beat
  (< 100 ms input-to-photon on loopback). First brake: the ship *settles*, no
  oscillation. The player learns nudge vs burn and that delta-v is a meter.
- **15–30 s — First free ride.** A wave pulse from the big well (1.0, 1.2)
  rolls out; riding it toward the tier-1 wreck at (1.5, 0.5) is faster than
  thrusting. The crest brightens in the ASCII as it becomes rideable. First
  "the universe just paid me" moment. Loot the wreck without overshooting.
- **30–45 s — First named verb.** A star's slingshot ring is visible en route.
  Engage, quarter swing, release toward the next wreck. The trail changes, the
  exit vector ghost shows where you'll go. First "I meant to do that."
- **45–60 s — First decision.** A portal is visible and its lifetime is
  legible in the world. The player chooses: extract small, or push one wreck
  deeper. The 60-second mark should end on *choice*, not on survival relief.

The emotional contract: **never dead by accident, never carried without
consent, first intentional verb by 45 seconds.**

## Q2 — Real Mechanics vs Invisible Assists

Since none of them exist yet, the honest question is which to build, in what
role. My cut:

| Helper | Verdict | Role |
|---|---|---|
| Slingshot | **Real mechanic** (exists) | The named verb. All feedback investment goes here first. |
| Brake | **Real mechanic** (exists) | Keep as explicit verb; never auto-brake. |
| Input buffering | **Build — invisible** | 120–150 ms edge buffering for slingshot engage/release and pulse. Cheap, universal, no mental-model cost. The edge-queue work already did half of it. |
| Well escape assist | **Build — invisible with a visible tell** | Soft shoulder: reduce effective pull when actively thrusting outward in the shoulder band. The *tell* is fabric density (`·` → `:` → `#` → `█`), which MOVEMENT.md already specs. Deaths become earned; slingshot viability improves for free. |
| Portal alignment / near-miss | **Build — semi-visible** | Extraction is the loop's climax; whiffing it to a current nudge is a control failure. Correction inside 150% of entry radius plus an instant abort. |
| Wave magnetism | **Defer one slice** | Core to the fantasy, but building magnetism on waves whose impulse varies 4× by map profile tunes noise. Fix S2.4 first, then it's the headline experiment of the *next* slice, with the crest-brightening cue so it teaches rather than rails. |
| Counter-steer damping | **Defer indefinitely** | Forge was right: mushy-motion risk. The escape assist may make it moot. Revisit only with oscillation-count evidence from the probes below. |
| Wreck approach stickiness | **Defer** | Wreck wake/lee-zone deceleration is a *fluid* feature, not a control assist — do it in the fabric when wreck flow interaction lands, not in the input path. |
| Beginner drift guard | **Cut, permanently** | Both Forge and MOVEMENT.md's own risk note already lean cut. A generous well shoulder plus safe spawns does the job without lying about the wells. Wells must stay scary. |

Ruleset: at most **three** invisible assists live at once, each individually
toggleable in the dev panel, each with a debug counter (activations/min) so
affordance stacking is measurable, not vibes. That is the answer to Forge's
"can't form a mental model" concern.

## Q3 — The Five-Minute Verb List

After five minutes on Shallows a player should be able to, on purpose:

1. **Brake** to a near-stop next to a wreck without orbiting it helplessly.
2. **Orbit** — hold a slingshot engagement through a half swing and bail out safely.
3. **Slingshot** off a star with a *chosen* exit direction (±30° of intent).
4. **Recover** — enter a well's shoulder, feel the danger ramp, thrust out alive.
5. **Skim** — ride one wave pulse for visible free speed instead of fighting it.
6. **Pick up** — hit a wreck's loot radius at controlled speed on the first pass.
7. **Extract** — enter a portal deliberately, including aborting an approach.

Explicitly *not* five-minute skills: chains, shore-break looting, interference
reading, merger timing. Those are the mastery curve, and Shallows shouldn't
try to teach them.

## Q4 — Route Shapes Per Map

**Shallows — "the signature line."** Look at the map data: stars at
(1.5, 1.05), (1.5, 1.65), (1.35, 2.1) form a near-vertical three-star line,
with well 0 (1.0, 1.2) a two-hop off the top and the tier-2 wrecks sitting
adjacent. Shallows already *contains* a chain line — almost certainly by
accident. Bless it: nudge the third star onto the line, seed portal-wave
placement so one portal tends to spawn off the line's exit, and Shallows
teaches: *spawn → drift to line → single sling → wreck → portal.* Route beats:
"the free ride" (wave into wreck 1), "the first swing" (mid-line star), "the
choice" (extract vs the vault wreck at (0.9, 0.9) sitting in well 0's
influence — the first taste of shore break). The "I meant to do that" moment:
releasing the sling and watching the exit ghost line touch the wreck.

**Expanse — "two roads."** One loud road: direct burn across the middle,
delta-v-expensive, signal-hot. One quiet road: a 3-hop star/planetoid chain
around the rim that costs almost nothing but takes reads. Same destination.
The map should make the tradeoff legible from the drop briefing. Beat: the
first *void corridor* — a stretch with no anchors where committing with low
delta-v is a real mistake you can see coming. "I meant to do that": arriving
at the portal with the delta-v bar barely touched.

**Deep Field — "commitment."** Route planning as survival: anchor clusters
separated by corridors that direct flight cannot cross on one tank. Chain
hubs (overlapping slingshot ranges) as interchanges. One escalation idea worth
building: **merger events as scheduled route earthquakes** — wells orbiting
each other telegraph the merger, the pulse is the best ride in the game if
you're in the lineup and a catastrophe if you're not. That is Universe Is the
Clock expressed as a movement opportunity, and MOVEMENT.md already designed
it. Second idea, cheaper: per-run portal placement biased to opposite ends of
the signature chains, so the extraction itself demands one full read of the
network.

Route design rule for all three: geometry speaks first. Three aligned anchors
say "chain me." No UI route markers.

## Q5 — Movement Metrics For The Harness

The current agent-play-eval proves almost nothing about feel: displacement
> 0.002 after a mouse hold, FPS > 10, extraction via debug teleport. The
golden fixtures prove the math is stable but not that it's good. The gap
between "movement occurred" and "movement is intentional" is exactly where
Greg keeps becoming QA. Measurable proxies for intent, all buildable on the
existing harness (`SimClient.getMetrics()`, `/debug/player-state`, event
journal):

| Metric | Probe | Band (first pass) |
|---|---|---|
| Input-to-photon latency | existing input RTT / input-to-snapshot / presentation-age metrics, asserted not just exposed | < 80 ms loopback; fail > 120 |
| Spawn safety | spawn, zero input, 30 s | alive, and nearest-well distance never enters shoulder band |
| Stop authority | cruise at 50% max speed, full brake | stop within N world-units, ≤ 1 velocity sign flip |
| Turn settle | command a 90° velocity change at cruise | settle < 1.5 s, overshoot oscillations ≤ 2 (this is the counter-steer evidence collector) |
| Wave honesty | fixture: identical ring, three map profiles | integrated impulse equal within tolerance (S2.4) |
| Ride vs fight | scripted pilot rides a pulse vs thrusts against it | riding covers ≥ 1.3× distance per delta-v spent |
| Slingshot payoff | approach star tangentially, engage, half swing, release | exit speed ≥ 1.4× entry; exit direction within ±15° of tangent |
| Slingshot reachability | tap engage at queue-hostile timing (edge-queue test exists — extend) | 0 dropped edges |
| Portal capture | drive at portal at 3 speeds through a cross-current | capture on first pass at low/mid speed; overshoot allowed only at high |
| Death legibility | journal audit of every `player.died` in a soak run | killer well was inside visible-relevance radius for ≥ 1 s before death |
| Route viability | scripted anchor-route run per map | scripted pilot reaches a portal using ≤ 60% of tank on Shallows via the signature line |
| Chain telemetry | `movement.slingshotCaptured/Released` events with anchor type + chain count, aggregated into run results | no band — evidence collection for the route pass (deep review S5.5) |

These bands will be wrong at first. That's fine — the point is that a feel
regression fails a named probe instead of waiting for Greg's hands.

## Q6 — Reading Slingshot Opportunity And Loss Of Control

Principle: the fabric is the instrument panel. Overlays are a last resort.

- **Slingshot opportunity:** restore what the canvas renderer already had and
  Three dropped — per-anchor ring colors (well blue / star gold / planetoid
  teal), ring brightening inside activation range, energy-banked arc while
  engaged, exit-vector ghost, chain-count badge. This is wiring, not new
  systems; `collectThreeSceneState` already carries the data. Also: render the
  engagement ring screen-space-circular now — the current anisotropic stretch
  draws a ~1.78:1 ellipse for a circular truth, which actively misinforms the
  one read the mechanic depends on.
- **Loss of control:** glyph density ramp in the well shoulder (`·  : # █`)
  exactly as MOVEMENT.md specs — the terrain states the stakes; past the
  commitment point the ship trail degrades (breaks up, dims) so "thrust won't
  save you" is visible on the ship itself. Audio: pitch-bend the drone in the
  shoulder, hard cutoff past commitment. Controller rumble ramp later; don't
  spend now (Forge's DualSense cut stands).
- **Wave rideability:** crest glyphs brighten/densify inside the (future)
  catch window — the "bright = rideable" rule, one visual teaching one system.
- **Portal truth:** blocked portals must look *sealed, not absent*; restore
  countdown/critical-blink states. And take the well debug bullseyes out of
  product frames — they're currently louder than any real affordance.

Nothing above covers the ASCII fabric with UI; everything modulates what the
fabric and the entity plane already draw.

## Q7 — Cut, Defer, Simplify

- **Cut: beginner drift guard.** Covered above. Delete it from MOVEMENT.md's
  tuning table so it stops resurfacing.
- **Cut: the mouse-model exploration.** The product is controller-first with a
  Deck gate; CONTROLS.md's three-model mouse debate is a jam-era question.
  Keep the current mouse path working; stop designing for it.
- **Defer: DualSense adaptive triggers/HD haptics** (already Forge-cut, but
  CONTROLS.md still reads like a promise — mark it post-1.0).
- **Defer: counter-steer damping and wreck stickiness** (evidence-gated, per Q2).
- **Simplify: cosmic signature movement modifiers.** Six fabric-changing
  signatures are advertised; the server's seeded roll has zero consumers and
  the client rolls its own unseeded universe. Either ship the small honest
  version (server-authoritative roll + two or three multipliers that actually
  touch the movement step) or pull signatures from the briefing screen until
  they're real. A named modifier the physics ignores is worse than no modifier.
- **Simplify: the viscosity promise.** "The medium thickens" is in DESIGN.md,
  MOVEMENT.md, and the pillars, and is dead config. The ~20-line honest
  version — collapse progress nudges coupling up and thrust response down —
  redeems Universe Is the Clock. Do that or delete the promise; don't keep
  carrying it as prose.
- **Rewrite: MOVEMENT.md and CONTROLS.md against code truth.** Turn-rate
  curves, thrust ramp, facing inertia — none exist; facing is direct-set.
  Give both docs the DESIGN-CODE-DELTA treatment in the same slice that builds
  the first assists, so the next reviewer designs against the real ship.

---

## Recommendation: The Next Movement Slice

**Slice name: Honest Baseline.** Before any assist is tuned, make one game
exist instead of two, and make it measurable:

1. **One movement truth.** Promote the movement constants to shared data
   (`movement.data.json` or equivalent) consumed by both `src/config.js` and
   `player-movement-step.cjs`; kill the 1.7/2.5 fork (server number canonical
   pending Greg's hands-on check); extend the golden fixtures to import both
   entry points so a future fork fails loudly.
2. **Latency diet + probe.** Fixed-rate input send decoupled from RTT, raise
   snapshot Hz on loopback (the Deck is loopback), tighter interpolation
   delay; assert the input-to-photon budget in the controller lane. No client
   prediction yet — measure first; prediction is a v0.4 project if the diet
   isn't enough.
3. **Honest waves.** dt-correct ring decay; normalize (or deliberately
   document) wave push across map profiles, with the impulse-parity fixture.
4. **Slingshot feedback parity in Three** (ring colors, energy arc, exit
   ghost, chain badge, circular rings) plus the capture/release journal events
   for route telemetry.
5. **Two assists, no more:** input buffering and the well escape shoulder,
   implemented inside `stepPlayerMovementCore` behind options, landed *after*
   the fixtures so tolerances catch drift.

Every item is a reviewable slice; none is a rewrite; renderer stays truthless;
coordinate math stays in the shared helpers. Then — and only then — run the
feel playtest the RC gate is waiting on. This ordering is Greg's own doctrine
(measure before tuning) applied to the game's number-one pillar risk.

## Ranked Experiments

1. **Latency diet.** *Expected feel:* the ship stops feeling like it's on the
   end of a phone call; every other tuning judgment becomes trustworthy.
   *Risks:* protocol churn; none to design. *Evaluate:* input-to-photon probe
   before/after + a 5-minute blind A/B by Greg on loopback.
2. **Well escape shoulder (+ fabric density tell).** *Expected feel:* deaths
   feel earned; near-well play becomes a place you go on purpose, which is the
   precondition for the whole slingshot fantasy. *Risks:* over-generous
   shoulder deflates dread — keep it thrust-gated (no assist while coasting).
   *Evaluate:* drift-into-well probe (must still die), thrust-out-of-shoulder
   probe (must escape within band), plus the death-legibility journal audit;
   human check: "did any death feel like the game's fault?"
3. **Input buffering (slingshot + pulse edges).** *Expected feel:* taps land;
   fast chain attempts stop whiffing invisibly. *Risks:* essentially none at
   150 ms. *Evaluate:* extend the edge-queue test with buffered-timing cases;
   human check: rapid engage/release play on controller.
4. **Wave ride restoration → weak magnetism.** After honest waves land:
   crest brightening cue plus a *weak* catch assist. *Expected feel:* the
   first free ride in the first 30 seconds, on every map, at the same
   strength. *Risks:* rails feel if lock strength creeps — start at half of
   MOVEMENT.md's 10%. *Evaluate:* ride-vs-fight distance ratio probe; human
   check: "did you catch it on purpose, and did you feel when you left it?"
5. **Portal near-miss correction + entry confirm.** *Expected feel:* the
   climax stops whiffing; extraction becomes a decision, not a collision.
   *Risks:* magnetism trapping an unwanted extract — the abort must be
   instant and stronger than the pull. *Evaluate:* three-speed capture probe +
   abort probe; human check: extract and abort five times each on controller.

If the slice budget only fits three: 1, 2, 3. They're substrate; 4 and 5 are
the first true feel features and deserve a fresh slice with the substrate
solid.

## Movement Acceptance Test

Three layers, one gate:

- **Math truth (exists, extend):** movement golden fixtures stay green, plus
  the client/server kernel parity fixture and the wave impulse-parity fixture.
  Any intentional retune updates fixtures in the same commit, by hand.
- **Behavioral probes (new lane, on agent-play-eval's bones):** spawn safety
  30 s; stop authority; turn settle/oscillation count; ride-vs-fight ratio;
  slingshot payoff + reachability; portal capture at three speeds; death
  legibility audit; route viability on Shallows' signature line; latency
  budget assertion. Each with a numeric band, run per map profile, reported in
  the eval summary.
- **Human checklist (10 minutes, Greg, fresh stack per RC gate):**
  1. First thrust feels immediate (no phone-call lag).
  2. You can stop next to a wreck on the first try.
  3. You caught at least one wave on purpose and knew it.
  4. You slung off a star and landed within sight of where you meant to.
  5. You entered a well shoulder and got out; it felt scary but fair.
  6. You extracted deliberately, and aborted one approach deliberately.
  7. No death in the session felt like the game's fault.
  8. Blind check: does local feel identical to packaged? (If no, item 1 of
     the slice regressed.)

Green = fixtures pass, probes in band, checklist ≥ 7/8 with item 7 mandatory.

## Files / Systems Likely To Change

- `scripts/sim/player-movement-step.cjs` — assists, shared-constant consumption
- `scripts/sim-runtime.cjs` — SERVER_* table retirement, snapshot Hz, shoulder logic call site
- `src/config.js` + new shared `movement.data.json` — single constants source
- `scripts/sim-protocol.cjs`, `src/sim/sim-client.js`, `src/main.js` (input send) — latency diet
- `src/wave-rings.js` + server ring path — dt-correct decay, push normalization
- `src/slingshot.js`, `src/render-three/three-renderer.js`, `src/render-three/vfx/` — feedback parity, circular rings
- `scripts/sim-event-journal.cjs` wiring — `movement.slingshotCaptured/Released` telemetry
- `src/maps/shallows-3x3.js` (later `expanse-5x5.js`, `deep-field-10x10.js`) — route pass
- `tests/movement-golden.cjs`, `tests/agent-play-eval.cjs`, `tests/slingshot-edge-queue.cjs`, `tests/remote-authority.cjs` — probes and bands
- `docs/design/MOVEMENT.md`, `docs/design/CONTROLS.md` — code-truth rewrite

## Open Questions For Greg

1. **Which thrust feel is canonical — 1.7 or 2.5?** Fly both back-to-back once;
   the answer sets the shared constant. (My lean: 2.5, it's what Deck plays
   and what the fixtures encode — but this is a hands call, not a logic call.)
2. **Latency scope:** if the diet gets loopback under ~80 ms, is that good
   enough to ship v0.3 on, deferring prediction to v0.4? (My lean: yes.)
3. **Wave magnetism:** invisible assist, or visible taught mechanic with the
   crest-brightening cue? (My lean: taught — surfing is the identity; hiding
   its main assist wastes the teaching moment.)
4. **Portal entry:** keep fly-through capture, or move to be-in-zone +
   confirm? (My lean: confirm — it makes extraction a stated decision and
   kills accidental extracts, but it changes a shipped interaction.)
5. **Shallows' star line:** bless it as the designed signature line and nudge
   the map data, or keep Shallows layout frozen and do route design only in
   Expanse/Deep Field?
6. **Sign off the cut list:** drift guard (permanent), counter-steer damping
   and wreck stickiness (evidence-gated), mouse-model exploration (frozen).
7. **Signatures:** small honest server-side version now, or pull them from
   the briefing until post-v0.3?

---

*The gears that exist are good — the movement step is clean, the fixtures are
real, the edge queue works. What's missing isn't machinery. It's one truth for
the machinery to tell, and a face on the game's best verb. Build those, and
the feel pass stops being archaeology and starts being tuning.*
