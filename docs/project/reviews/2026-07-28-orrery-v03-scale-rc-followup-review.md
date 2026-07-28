# Orrery: v0.3.1 Scale And RC Follow-Up Review

> Bundled review of the scale correction, `a958a8c6..61ecc534`, product source
> `61ecc534a0a90bb64d360ee85850ddcb21feb8ef` (build `0.3.1.61ecc534`).
> Read-only. Written 2026-07-28. Follows
> `docs/project/reviews/2026-07-27-orrery-v03-rc-creative-technical-review.md`.

## Verdict

The correction is right, restrained, and mostly landed. Roughly 236 lines of
source across eleven files — no framework, no server-side hearing migration, no
recovery architecture. Every item I flagged as cheap got fixed cheaply. That is
the correct shape of response and I want to say so before I say anything else.

`minimumOffscreenHearingMeters` in `src/content/noise.js` is the best line of
work in the pass: it derives the 1,425 m floor from `CAMERA_VIEW`,
`METERS_PER_SIM_UNIT`, the reference viewport, and the margin, so the three
rulers that drifted apart now meet in one function. That is the structural fix,
not the new numbers.

But the pass corrected **geometry** without correcting **time**, and it corrected
**world emitters** without correcting **player emitters**. Both gaps matter.

Measure warning the way a player experiences it — in seconds before contact, at
actual cruise speed — and the picture is thinner than the meters suggest:

| Emitter | radius | on-axis band | diagonal band | warning @ cruise | @ full thrust |
|---|---:|---:|---:|---:|---:|
| Glitch | 1,600 m | 175 m | **none** | 0.21 s | 0.06 s |
| Swarm | 2,200 m | 775 m | 165 m | 0.91 s | 0.28 s |
| Vessel | 3,200 m | 1,775 m | 1,165 m | 2.09 s | 0.64 s |
| EXFIL | 4,200 m | 2,775 m | 2,165 m | 3.26 s | 1.01 s |

A Glitch approaching on a diagonal is still never heard before it is seen —
1,600 m never clears the 2,035 m viewport corner. A Swarm now closing at
1.6 world/s against a player at 0.85 gives roughly **a third of a second** of
arrow before it is on top of you. Only Vessel and EXFIL are real warnings.

And the deeper thing the correction surfaced rather than caused: **Shallows
cannot host this grammar at any tuning.** The camera shows 3,000 m of a 5,000 m
map. The EXFIL radius (4,200 m) now exceeds the entire Shallows diagonal
(3,536 m), so `ROUTE: LISTEN` flips to a distance the instant the aperture opens
— the flagship new mechanic is untaught on the teaching route — while thirteen
late-match emitters compete for five contact slots on a map where nearly all of
them are always audible. Shallows currently gets the worst of both: no discovery
to learn, and no scarcity to make hearing mean anything.

Separately and more urgently: the gate's three "player-path" reds are one defect,
and it is in the slingshot. `slingshot.aim.engageEligible: true` and
`slingshot.telegraph.aimCue.engageEligible: false` appear **in the same
serialized snapshot, for the same anchor, in the same tick**. Movement Is the
Game, and the authority is currently of two minds about whether the player may
engage.

**Deck recommendation: no-go until that one is fixed.** Everything else can ride.

---

## Findings

### 1. Slingshot eligibility contradicts itself inside one snapshot — `blocker`

Three of the seven reds are one defect, and it is the game's core verb.

**Evidence** — `/private/tmp/lbh-v03-orrery-rc-61ecc534-receipt-20260728T011650Z/full-run.log:894`,
one serialized player object:

- `slingshot.aim` → `anchorId: "star-3"`, `distance: 0.29698`,
  `tangentialSpeed: 0.18904`, `engageEligible: true`
- `slingshot.telegraph.aimCue` → same anchor, same `distance: 0.29698`, but
  `tangentialSpeed: 0`, `engageEligible: false`

The outer state says engage; the cue the player actually sees says no.

**Mechanism** — `scripts/sim-runtime.cjs:4700-4702`: `buildSlingshotTelegraph`
calls `setSlingshotAimEligibility(player, state, findSlingshotAnchorByState(state))`
— a **mutating recompute inside a projection**. `scripts/sim/public-snapshot.cjs:116-118`
makes the ordering explicit and load-bearing: *"Keep this after the outer aim
fields: telegraph projection refreshes eligibility before the ruler facts below
consume it."* A snapshot whose field order changes gameplay truth is not a
snapshot.

**Why it fires here:** the star capture radius is 300 m and the aim distance is
297 m. The player sits 1% inside the boundary, so any recompute flips the answer.
`SlingshotV2Live` shows the same failure one step further along —
`phase: "idle"`, `aim: null`, and `effective_duration_ms: 0`, so the coyote grace
that would have covered the flicker is also gone.

**Smallest playable next action:** compute aim eligibility exactly once in the
authority step, store it on `state`, and have both `aim` and `telegraph` read the
stored value. Then fly one Shallows run and engage a *star* (300 m, the tightest
capture family) from just inside range — that is the cheapest repro.

---

### 2. Warning is authored in meters; it needs to be authored in seconds — `fix-forward`

The floor derivation is correct. The radii above it were chosen as multiples of
the floor rather than as a time budget, and time is what the player feels.

**Evidence**
- `src/content/noise.js:11-25` — floor = `min(horizontal, vertical)` = 1,425 m at
  1280x800 (1,417 m at the harness's 720p; confirmed live in
  `full-run.log:913` → `camera: {canvasWidth:1280, canvasHeight:720, cameraView:3}`).
- Viewport corner = `hypot(1453.1, 1425.0)` = **2,035 m**. Nothing is off-screen
  inside that on a diagonal.
- `src/content/noise.data.json:30-34` — Glitch 1,600 m is *below* the corner, so
  a diagonal Glitch has no off-screen band at all.
- Player speed: `src/content/movement.data.json` `thrustAccel 2.5`,
  `coastHalfLifeSeconds 0.7644` → terminal `2.5 / (ln2/0.7644)` = **2.76 world/s**;
  `src/content/map-scales.data.json` deep-field `productObservedLegSeconds`
  implies a route-average near **0.85 world/s**.
- `scripts/sim/inhibitor-ecology.cjs:30-33` — a flaring Swarm now closes at
  1.6 world/s, so head-on closure against a cruising player is ~2.45 world/s and
  the 775 m on-axis band collapses to ~0.32 s.

**Smallest playable next action:** pick a warning target in seconds and solve for
the radius — I would use 3 s at cruise for anything that can kill you, i.e.
`corner + 3 × 850 ≈ 4,600 m` for Swarm and Vessel, and treat Glitch as
deliberately on-screen-only rather than pretending it warns. Then fly one Expanse
run at Phase 2 and count how long an arrow is visible before contact.

---

### 3. Shallows cannot host the contact grammar — `Greg decision`

The radii are derived from the camera, which is map-independent. Their *meaning*
is not: the same absolute radius is map-saturating on Shallows and appropriate on
Deep Field.

**Evidence** — max toroidal distance by map (`src/content/map-scales.data.json`,
`metersPerSimUnit 1000`): Shallows `2.5√2` = **3,536 m**; Expanse **10,607 m**;
Deep Field **17,678 m**.

- EXFIL at 4,200 m **exceeds the entire Shallows diagonal**. Every open exfil is
  audible from every position, so `ROUTE: LISTEN` (`src/ui/hud-presentation.js:194,213`)
  flips the moment the aperture opens. Discovery — the pass's flagship mechanic —
  is structurally untaught on the teaching route.
- Vessel 3,200 m = 90% of the Shallows diagonal; Swarm 2,200 m = 62%;
  Glitch 1,600 m = 45%.
- Late Shallows population: `populationCap` 6 Glitch + 4 Swarm + 3 Vessel
  (`scripts/sim/inhibitor-ecology.cjs:10,25,51`) plus exfils, against
  `contactCap: 5` (`noise.data.json:24`). Thirteen near-always-audible emitters
  competing for five slots is a permanently saturated arrow ring, not information.
- Root cause: the camera shows 3,000 m of a 5,000 m map. You can already see 60%
  of Shallows. There is no room for an off-screen band that is not also
  map-spanning.

**Three options — I recommend the second:**

1. Grow Shallows to ~10-12 world units. Honest, but it reopens route timing,
   density, and the whole teaching curve. Too expensive for what it buys.
2. **Add a per-map radius multiplier, floored at `minimumOffscreenHearingMeters`
   for the kinds that must warn.** On Shallows, let only Vessel and EXFIL clear
   the floor (EXFIL ~2,300 m ≈ 65% of the diagonal, so discovery is real but
   generous); let Glitch and Swarm become explicitly on-screen local hazards.
   Deep Field keeps the full set. One data field, and it makes the route ladder
   mean something: Shallows teaches *what the sounds are*, Expanse and Deep Field
   teach *hunting by ear*.
3. Declare Shallows opted out of contacts entirely. Cheapest, but it ships a
   teaching route that never teaches the headline system — which is how the last
   RC happened.

**Smallest playable next action:** whichever option, first check the Shallows
exfil open on one run and confirm whether `ROUTE: LISTEN` survives more than a
frame. If it does not, the mechanic has no teaching surface today.

---

### 4. Player emitters were not rescaled; player and decoy contacts still cannot fire — `fix-forward`

The pass rescaled world emitters and left the player's own emission at its
pre-correction values, so the exact defect from the last memo survives in the
player-to-player path.

**Evidence**
- `src/content/noise.data.json:4-15` — unchanged: thrust 180/240/320 m, brake
  220, salvage 180/320/480, force pulse 600, decoy launch **700 m**.
- Off-screen floor is 1,425 m. **700 m < 1,425 m**, so a player contact
  (`src/main.js:2404-2412`, keyed `player:${clientId}`, radius
  `noise.audibleRadiusMeters`) can never be simultaneously audible and
  off-screen. In multiplayer you will never hear another pilot before you see
  them; the Shroud's decoy — a 700 m signature ability whose entire purpose is to
  be *heard* — can never produce an arrow.
- Second-order effect on the solo loop: you hear a Swarm at 2,200 m
  (`noise.data.json:31`) while the Swarm hears you at 180-320 m
  (`scripts/sim-runtime.cjs:4251`, `emitterAudibleFor` against the player's own
  radius). Before the pass that was roughly symmetric (340 vs 320). It is now a
  **7-12x asymmetry in the player's favour**, which is exactly the wrong direction
  for Noise Is Consequence: you detect everything early, and your own loudness
  governs a bubble smaller than your own ship's warning range.

To be fair to the design: `noise-radius-v1.md:59-64` says enemy awareness is an
authored threat contract, not symmetric hearing. Asymmetry is intended. The
*magnitude* is not, and the multiplayer/decoy blind spot is a straight miss.

**Smallest playable next action:** raise decoy and force pulse above the floor
(decoy ~1,900 m, pulse ~1,600 m) so the two abilities that exist to make noise can
actually be heard, and re-check the Swarm speed thresholds in
`resolveSwarmSpeed` (`inhibitor-ecology.cjs:337-342`), which are still keyed to
the old 180/320 m player values.

---

### 5. A literal `undefined` renders in the world during remote play — `fix-forward`

**Observed**, not inferred — in the packet's own controller capture
(`.../089-controller-three-a1/controller-remote-2026-07-28T012212096Z.png`),
below the well `EREBUS`, the string `undefined` is drawn in ice-blue at the
centre of the screen.

**Mechanism**
- `src/main.js:5281` — `ctx.fillText(p.name, sx, sy + 16)` for planetoids, with
  no fallback (contrast the wreck label at `:5293`, which has one).
- `src/sim/remote-snapshot-presentation.js:135-140` — remote planetoids are a
  spread of the authority row, which carries no `name`; `src/main.js:2656`
  then replaces the client `PlanetoidSystem` array wholesale, discarding the
  locally generated comet names (`src/planetoids.js:48`).
- Remote is the shipping path, so this is what a real session looks like.
- `src/main.js:5269` draws `star.name` the same way and is the same class of
  risk.

Also visible in that capture: `undefined`, `0.66 · surge`, and `HEAT 76%` are
drawn within about twenty vertical pixels of each other and overlap. The single
most important spot on the screen — under the player's ship — is three colliding
labels.

**Smallest playable next action:** one-line fallback at `:5281` and `:5269`, then
stack the ship-local readouts with explicit line offsets instead of letting three
draw calls share a band.

---

### 6. Death keeps live action affordances and the quietest text on screen — `fix-forward`

**Observed** in `.../agent-play-eval-2026-07-28T011834914Z/17-natural-well-death.png`:
`HULL — dead` in red, and simultaneously, fully opaque:

- `WELL IN RANGE / ride the current / Y engage` — a large boxed centre-bottom
  prompt inviting an action the player cannot take;
- `FORCE PULSE — ready`;
- `BURN — burning 28s` with a full meter.

Meanwhile the death notice itself is roughly 9 px dark red at screen centre,
partly occluded by the ship glyph — smaller and dimmer than the cargo counter.
For an extraction game, death is the loudest event in the loop and it is
currently the softest pixel.

`fadeHUD` (`src/hud.js:183-189`) dims the rails over the linger, but at this
captured instant the affordances read as live.

**Smallest playable next action:** on death, clear the interaction prompt and
mark ability slots inert in the same frame the status flips; give the death
notice the weight the portal prompt currently has.

---

## Answers To The Review Questions

**Q1 — one ruler?** Between camera, physical units, and world emitters: yes, and
correctly, via `minimumOffscreenHearingMeters`. Between perception and *map
scale*: no (finding 3). Between world emitters and *player* emitters: no
(finding 4). Between perception and *time at speed*: no (finding 2). Pursuit is
genuinely fixed — a flaring Swarm at 1.6 world/s against a 2.76 world/s terminal
player is a real chase for the first time.

**Q2 — legible or oppressive/inert?** Mixed, and predictably so. Vessel and EXFIL
should read well. Glitch and Swarm will read as inert on Expanse and Deep Field
(sub-second warning) and as oppressive on Shallows (saturated cap). The
`ROUTE: LISTEN` teaching copy is the strongest single piece of UX in the pass —
it converts a removed crutch into an instruction. Heat/Noise teaching is much
improved: the collapsed `QUIET` detail and the new `noise time` results row are
both right.

**Q3 — captures.** I read four AgentPlay frames and both remote captures. Stated
plainly: `ROUTE: LISTEN`, the collapsed noise detail (`QUIET`, `SOURCE THRUST`),
the `HEAT 19%` instrument, and the absence of HUD jitter are all **observed
working**. Findings 5 and 6 are **observed defects**. The absence of contact
arrows in these frames is **not evidence of anything** — the AgentPlay journey
covers roughly seven seconds of a Shallows run at Phase 0 with no inhibitors
spawned and no aperture open. Nothing in this evidence set exercises the contact
system. I did not run the build.

**Q4 — new imbalance?** Yes, and it is the most important consequence of the
pass. See finding 3. Expanse is the only map where the current radii are
proportionate; Shallows is saturated and Deep Field is comfortable.

**Q5 — appropriately simple?** Yes, emphatically. ~236 source lines, no new
subsystem, deferrals stated honestly, player hearing correctly left
presentation-side for a private v0.3. I looked for speculative architecture and
found none. Two small notes in Taste.

**Q6 — is the evidence honest?** Yes. This is a real improvement.
`RC-GATE.md:6-25` states the current verdict, its counts, and its failures
without mixing lanes, explicitly separates the three player-path reds from the
four stale ones, and says plainly that package closure "does not prove the normal
slingshot player journey." The receipt directory carries `first-red.txt` with its
own classification, `dependency-facts.txt`, and `summary-counts.txt`. The
mislabelled historical paragraph I flagged last time is gone. One correction
worth making: the packet and gate both describe the AgentPlay run as reaching
"natural well death and Home recovery" — true, but it died seven seconds in, so
it proves boot, death, and recovery and nothing about the milestone's systems.
Say that.

**Q7 — findings.** Above. **Q8 — go/no-go.** Below.

---

## Deck Go / No-Go

**No-go, on finding 1 alone.**

Not because the build is unsafe or the evidence is weak — the package is green
and the gate is honest. Because the one verb the Deck session exists to evaluate
is the slingshot, and the authority currently disagrees with itself about whether
you may engage it. A controller session where engage intermittently does nothing
produces feel notes about input latency and Steam Input that have nothing to do
with the actual defect, and it burns the session.

Finding 1 looks small — compute eligibility once, store it, read it twice. Fix
that, re-run `RulerLive` and `SlingshotV2Live` only (not the full lane), and go.
I would not hold the Deck trip for findings 2-6; they are about whether the
contact system *teaches*, and Greg's first physical session should be about
movement, readability in hand, and Steam Input.

## Next Single v0.3 Product Vertical

**"The first heard threat."** One vertical, no architecture program:

Retune the warning budget in seconds (finding 2), land the Shallows decision
(finding 3), and make exactly one Swarm acquisition legible end to end — heard
off-screen, arrow with bearing and range, it closes, you either break contact or
you eat it, and the results screen tells you how long it had you. That single
chain is the whole thesis of Noise Is Consequence, and it has never once run.

Everything else — player emitter radii, the `undefined`, death-state
affordances — rides along inside it or is a one-line fix on the way.

---

## Taste

**On the response itself.** Four data files, one colour lookup, a derived
constant, and a discovery latch. No new subsystem. The pass took the note about
the coyote knob (`src/ruler-overlay.js:128-131` now reads
`50 / 50 ms + 267 ms transport`), the note about the counters, the note about the
results stats, and the note about the double HUD motion — and did all four
without inventing anything. That restraint is worth more than any individual fix
in it, and it is why the remaining findings are small enough to state precisely.

**On `ROUTE: LISTEN`.** This is the best thing in the build. `ROUTE: LISTEN` /
"hear EXFIL TONE to reveal distance" turns an omniscient readout into a
two-state teaching device, in eight words, in the right colour, in the right
corner. It is also the clearest evidence that the design has a voice: the game
tells you what to *do with your attention*, not what it knows. Protect that
pattern — it should be the model for how every other gated reveal in v0.4 is
worded.

**On the noise rail.** Observed in all four in-match frames: the label wraps and
duplicates itself.

```
NOISE          NOISE 228m · FALLING
RADIUS
SOURCE THRUST
```

"NOISE" appears twice, adjacent, at two sizes. `#hud-noise .hud-label` is
`noise radius` at 13 px in a 270 px panel (`index-a.html:715`,
`#hud-vitals` width `270px`) and cannot share a flex row with a
`white-space: nowrap` readout. Cut the label to `noise` — the readout already
says the unit — or drop the label entirely and let `NOISE 228m · FALLING` stand
alone. It is the second-most-read value on the HUD and it currently looks broken.

**On the hull bar.** At full health it is a solid 246 px white slab and the
brightest object on the left rail. The thing that is *fine* should not be the
loudest thing in the vitals group. Consider drawing hull as an outline until it
drops below nominal.

**On `isExfilPortal`.** It now exists twice — `src/ui/hud-presentation.js:164`
and `scripts/sim/public-snapshot.cjs:165` — with identical bodies across the
client/authority boundary. That is a correct short-term call (no shared module
exists for it) but it is a five-way boolean that decides both what emits and what
the HUD believes. When it drifts, the symptom will be a route rail that unlocks
on a portal that never made a sound. Worth a comment on each copy pointing at the
other, at minimum.

**On the ruler overlay.** `0.66 · surge` and `0.02 · drift` still print raw sim
units. The aperture rail got `formatRouteDistance`; the ruler did not. 0.66 means
660 m, on a HUD where `NOISE 228m` is right there. Same one-line fix, same
function.

**On what this pass proves.** The previous memo's core claim was that the systems
were fine and the rulers were not. This build is the test of that claim, and it
holds: correcting three data files and one derived constant moved the game from
"headline system structurally inert" to "headline system needs a time budget and
a small-map policy." Nothing had to be rebuilt. That is what a well-cut gear
train looks like when you finally size it right — you turn one shaft and the
whole thing starts moving.
