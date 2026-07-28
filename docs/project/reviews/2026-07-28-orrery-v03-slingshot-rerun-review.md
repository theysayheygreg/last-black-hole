# Orrery: v0.3.1 Slingshot Follow-Up — Review Re-Run

> Same prompt as `docs/project/prompts/2026-07-28-orrery-v03-scale-rc-followup-review.md`,
> re-run at Greg's request against `61ecc534..3506764f`. Read-only.
> Written 2026-07-28. Supersedes nothing — the prior memo
> (`2026-07-28-orrery-v03-scale-rc-followup-review.md`) remains the review of
> product source `61ecc534`, and that is still the product.
>
> Written to a new file rather than the prompt's path because the prompt is
> pinned to `61ecc534` and this covers four later commits.

## The Short Version

**There is no new product source to review.**

```
git diff --stat 61ecc534..HEAD -- src scripts index-a.html
(empty)
```

Four commits landed: `88e00061` and `7370f2cf` touch only `tests/`,
`bc244bb4` and `3506764f` touch only `docs/`. The product binary is still
`0.3.1.61ecc534`, and RC-GATE says so plainly.

So my findings on the product stand unchanged: the warning budget is still
authored in meters rather than seconds, Shallows still cannot host the contact
grammar, player emitters are still below the off-screen floor, the `undefined`
still renders, death still keeps live affordances. None of that was in scope for
this work and none of it moved.

What changed is the **evidence**, and it changed in two directions at once.

**The good direction, and it is genuinely good:** AgentPlay now runs ~90 seconds
of Shallows instead of 7 (`forceLedger.tick: 1351` at 15 Hz), and for the first
time in any evidence set I have reviewed, the Noise loop ran end to end. The
captures show `NOISE 600m · STEADY / SOURCE PULSE` with the ripple rendering,
`SOURCE THRUST AGAINST FLOW · HEARD BY 1`, an `ECOLOGY / GLITCH 1 · PHASE 1`
panel in magenta, and a cyan portal ring and a magenta Glitch on screen
simultaneously. `timeHeardSeconds: 10.33`, `timeTrackedSeconds: 1.47`. Something
heard the player and tracked them. That has never been true before.

**The other direction:** the slingshot blocker was not fixed. The proof was moved
off the ratified input contract.

---

## Finding 1 — The slingshot blocker was not fixed; the proof moved off the contract — `blocker`

First, a correction I owe: **my mechanism was wrong.** I attributed the failure
to `buildSlingshotTelegraph` calling the mutating `setSlingshotAimEligibility`
inside a projection. That code is untouched and the suites now pass, so it was
not the cause. It remains a design smell — a projection that mutates authority
state, with a comment making snapshot field order load-bearing — but it is a
`backlog` note, not a blocker. I was wrong about why.

The blocker itself stands, and is now clearer.

**The ratified contract is a tap, not a hold.** `docs/v0.3/DECISIONS.md:196-202`:

> "Physical F and Deck/controller Y are **rising-edge actions** owned by
> InputManager and main, **queued as `slingshotEdges`**, acknowledged by
> SimClient, and consumed only by the authority affordance/engage seam."

That is implemented: `scripts/sim-runtime.cjs:6991-7001` filters and merges
accepted edges via `mergePendingSlingshotEdges`, and `:5082` consumes
`input.slingshotEdges`. The entire queue-and-acknowledge machinery exists so a
momentary press survives the tick boundary. Whether the key is still held must be
irrelevant.

**What the fix commit did.** `88e00061` — "hold live slingshot input through
authority engagement" — changed two fixtures from tap to hold:

- `tests/slingshot-v2-live.cjs:331,374,427` — `pressAcknowledgedSlingshotEdge(...,
  { release: false })`, with an explicit `releaseHeldSlingshot` later;
- and the asserted release cause changed from `"range-break"` to `"release"`
  (`:364`, `:417`);
- and the expected edge-acknowledgement count dropped from `ackWatermark + 4` to
  `+ 3`.

That last pair matters. Under the *old* fixture the orbit ended by
**range-break** — which you cannot reach without having engaged first. The old
tap was engaging. The new proof asserts a deliberate `release` instead, which
means the fixture no longer exercises the rising-edge path the contract
ratifies. It exercises a hold path the design does not specify and the HUD does
not prompt.

**And the third suite was never touched.** `tests/ruler-live.cjs` is unchanged
since `61ecc534`, and line 118 still reads:

```js
await page.keyboard.press('KeyF');
```

A tap. Exactly the pattern `bc244bb4` describes as the defect. Yet RC-GATE:73
cites `RulerLive: green through keyboard F, with authoritative engagement`.

A suite that was failing, was not modified, whose product source was not
modified, and which still uses the interaction the fix commit calls wrong, is now
green. That is flake or it is unexplained. It is not repair, and it should not be
carrying a green checkmark next to two suites that were changed to avoid the
problem.

**So one of two things is true, and Greg has to pick:**

1. **The contract is wrong** — the slingshot really is a held action. Then amend
   `DECISIONS.md:196-202`, and make the product say so: the engage prompt
   currently reads `activate` / `release` via `affordanceCaption`, with no hold
   affordance anywhere in the HUD. A player who taps, as the ratified contract
   says they may, gets nothing and learns nothing.
2. **The contract is right** — and there is a real race between edge
   acknowledgement and authority engagement that two fixtures now step around
   and one still trips over intermittently.

I think it is (2), because `range-break` in the old assertions proves taps were
engaging at least some of the time, and intermittent engagement is precisely what
a queue-versus-tick race looks like.

**Smallest playable next action:** run `tests/ruler-live.cjs` ten times
unchanged. If it is not 10/10 green, the race is real and the fixture change hid
it. That is a five-minute answer and it settles the whole question before anyone
touches product code.

**To be explicit about credit:** `bc244bb4` and `3506764f` are scrupulously
honest — "corrects the live evidence action, not product movement", "No
production source or tuning changed", "The 119-suite full lane was not rerun",
"this evidence is ready for Primary/Orrery handoff but is not a play-green
claim." Nothing is hidden. My objection is to the *decision* — change the
fixture rather than the product — not to the reporting, which is better than
most projects ever manage.

---

## Finding 2 — Portal confirmation never arms, and it is visible — `blocker`

The new AgentPlay stopping point, and the extraction half of an extraction game.

**Observed** —
`tests/screenshots/agent-play-eval-2026-07-28T021551195Z/08-portal-zone-awaiting-confirm.png`:
the ship sits **inside** a rendered cyan aperture at screen centre, and the
centre-bottom interaction panel is **absent**. For contrast, the same build draws
a large boxed `WELL IN RANGE / ride the current / Y engage` prompt for a mere
well proximity (`17-natural-well-death.png`). Standing in the extraction
aperture produces nothing.

**Machine agreement** — same directory, `summary.md` failure dump:
`portalInteraction: null`, "Timed out waiting for portal `portal-optional-1-1`
confirmation-ready state".

`docs/v0.3/OPEN-DECISIONS.md:50-54` ratifies the extraction contract: "Entering
the aperture exposes an interaction; Enter/A confirms immediately; leaving aborts
immediately." Entering the aperture is currently exposing nothing.

RC-GATE:117 says this is "not classified or repaired by this cleanup" — correct
and honest. But the consequence is worth stating: **two consecutive RC candidates
have never once completed a route.** Extraction is the verb the game is named
around and no evidence set has reached it.

**Smallest playable next action:** fly to `portal-optional-1-1` in one Shallows
run and watch `player.portalInteraction` in the snapshot while crossing the
aperture boundary. Either residence is never detected or `ready` is never
published; that one observation splits it.

---

## Finding 3 — `ROUTE: LISTEN` contradicts the aperture the player is standing in — `fix-forward`

**Observed** in the same capture: the player is inside a glowing cyan ring, and
the top-right rail reads `ROUTE: LISTEN / hear EXFIL TONE to reveal distance`.

This is correct by contract — optional portals do not emit EXFIL and cannot
unlock discovery (`scripts/sim/public-snapshot.cjs:165-172`) — and incoherent on
screen. Cyan means route/extraction, locked
(`docs/v0.3/OPEN-DECISIONS.md:66-70`). The player is inside a cyan thing while
the route rail says listen for the route.

The gate introduced a two-state rail (`ROUTE: LISTEN` / `aperture N`) for what is
actually a three-state world: no exfil heard, exfil heard, and *you are in an
optional aperture right now*.

**Smallest playable next action:** when `portalInteraction` is non-null for a
non-exfil portal, have the rail say what is under the player — `OPTIONAL
APERTURE` — and keep `ROUTE: LISTEN` as the sub-line. One conditional, and it
turns a contradiction into a lesson about which apertures are the route.

---

## Finding 4 — `signalGenMult` is a dead stat the loadout screen still sells — `fix-forward`

Signal is retired (`docs/v0.3/noise-radius-v1.md:78-82`). The stat is not.

**Evidence**
- `src/content/items.data.json` — 11 occurrences. One is on a live looted
  artifact in this very run: `quiet-suture`, `effectDesc: "signalGenMult x0.96,
  controlDebuffResist x1.04"` (AgentPlay `summary.md` cargo dump).
- `src/content/hulls.data.json:92,135,181,226,267` — Drifter `0.5`, Breacher
  `1.5`. A 3x difference presented as hull identity.
- `src/ui/loadout-presentation.js:6` — `signalGenMult: 'signal generation'`, the
  player-facing label.
- `scripts/sim-runtime.cjs:4084-4098` — `noiseModifiersFor` reads only
  `player.noise.modifiers`. Nothing in `src` or `scripts` writes `signalGenMult`
  into it. The chain is cut.

So the loadout screen tells the player that their hull and artifacts modify
"signal generation," for a stat with no meter, no readout, and no effect. In a
first RC session this is exactly the kind of thing that produces a confident
wrong conclusion — "Breacher is three times louder, I should fly Drifter to stay
quiet" — about a difference that does not exist.

**Smallest playable next action:** either wire `signalGenMult` into
`player.noise.modifiers.radiusMultiplier` (the hook already exists and is exactly
the right shape) and relabel it `noise radius`, or strip it from items, hulls,
signatures, and the loadout label. I would wire it — hull noise identity is a
good mechanic and the plumbing is one assignment away.

---

## Finding 5 — The AgentPlay summary under-reports its own run — `fix-forward`

`tests/screenshots/agent-play-eval-2026-07-28T021551195Z/summary.md` reports:

```
- Route: not reached; slingshot n/a:n/a.
- Salvage: not reached; cargo ? -> ?.
- Noise: not reached at 0m (max 0m).
```

The same file's failure dump contains `cargoCount: 4`, `maxAudibleRadiusMeters:
600`, `timeHeardSeconds: 10.33`, `timeTrackedSeconds: 1.47`, and the run wrote
`05-route-slingshot-release.png`, `06-route-wreck-looted.png`, and
`07-noise-pulse.png`. Route, salvage, and Noise were all reached. I can see them.

The proof fields evidently only populate on full journey success, so a run that
gets 80% of the way reports as a run that got nowhere. Read in isolation — which
is how a summary gets read — this artifact says the build does nothing, on the
exact run that proved the most.

RC-GATE:100-116 describes what actually happened accurately. The machine artifact
does not, and the machine artifact is the thing that gets pasted into future
packets.

**Smallest playable next action:** populate each proof line from the last
observed state rather than on success, so a partial journey reports as partial.

---

## Finding 6 — Ship-local text is now three labels deep — `fix-forward`

Third confirmation across three independent captures, so this is not a one-frame
artifact:

- `07-noise-pulse.png` — `Wreck of the Shattered Mandate` label box overlapping
  `HEAT 77%`;
- `08-portal-zone-awaiting-confirm.png` — `0.13 · …` and `HEAT 60%` overlapping
  each other and the portal ring;
- `controller-remote-…png` (prior set) — `undefined`, `0.66 · surge`, and
  `HEAT 76%` all within ~20 vertical pixels.

Everything anchored to the ship draws into the same unmanaged band: ruler
readout, heat instrument, proximity labels, and wreck cluster boxes. At Deck
distance this is the busiest and least legible region on screen, and it sits
where the player's eye already is.

**Smallest playable next action:** give the ship-local stack explicit ordered
slots with fixed offsets, and let the wreck-label collision solver
(`src/main.js:5307-5320`, which already avoids overlaps among wrecks) also treat
the heat and ruler readouts as occupied boxes.

---

## Answers To The Prompt's Questions

**Q1 — one ruler?** Unchanged from the prior memo; no product moved. Camera,
units, and world emitters agree. Perception versus map scale, perception versus
player emitters, and perception versus time at speed still do not.

**Q2 — legible or oppressive/inert?** New evidence, and it is encouraging.
`HEARD BY 1` appearing on the rail with `SOURCE THRUST AGAINST FLOW` is the Noise
consequence loop working as designed and reading clearly. The magenta
`ECOLOGY / GLITCH 1 · PHASE 1` panel alongside a cyan portal ring in the same
frame is the locked colour language holding up under real conditions. Against
that: findings 3 and 6 are both legibility regressions at the two moments that
matter most — standing in an aperture, and looking at your own ship.

**Q3 — captures.** Reviewed eight frames across two sets. **Observed working:**
`ROUTE: LISTEN`, collapsed noise detail with a live `HEARD BY 1`, `NOISE 600m ·
SOURCE PULSE` with the ripple rendering, the ecology panel, cyan-route /
magenta-corruption separation, cargo full-state warning, no HUD jitter.
**Observed broken:** findings 2, 3, 6. **Not exercised by any evidence:**
off-screen contact arrows — no frame in any set shows one, and no run has reached
a phase where Swarms or Vessels exist. The contact system remains unproven in
either direction. I have not played the build.

**Q4 — new imbalance?** No change; no product moved. Finding 3 in the prior memo
stands.

**Q5 — appropriately simple?** The commits are test and doc only, ~130 test lines
and two doc sections. Nothing speculative was added. But "simple" is not the
right lens on a change whose problem is that it changed the wrong artifact.

**Q6 — is the evidence honest?** The prose is, conspicuously so. RC-GATE states
that no production source changed, that the full lane was not rerun, that the
portal timeout is unclassified, and that this is not a play-green claim. Two
gaps: the `RulerLive: green` claim (finding 1) is presented as part of a
correction that could not have caused it, and the AgentPlay `summary.md` contradicts
its own captured state (finding 5).

**Q7 — findings.** Six above. **Q8 — go/no-go.** Below.

---

## Deck Go / No-Go

**Still no-go — but for a better-understood reason, and the gap narrowed.**

Last time I said fix the slingshot and go. The slingshot proof moved instead of
the slingshot, and a second blocker surfaced behind it: extraction never arms.
Two candidates in a row have produced no completed route.

I would not take this to the Deck to discover in hand that apertures do nothing.
But the distance to a go is now small and concrete:

1. Run `ruler-live.cjs` ten times unchanged. That answers finding 1 without
   writing any code.
2. Split the portal-ready timeout — residence not detected, or `ready` not
   published (finding 2).

If (1) is 10/10 green and (2) is a one-line publish fix, this is a same-day go.
If (1) is flaky, the input path needs product work before any physical session,
because "sometimes engage does nothing" is the single worst thing a controller
test can be sitting on.

## Next Single v0.3 Product Vertical

Unchanged: **"The first heard threat."** But it now has an obvious first leg that
did not exist a day ago. `HEARD BY 1` is on screen. The player is audible,
something is listening, and the counter proves it. Extend that one thread — make
the listener visible as a contact, let it close, and let the results screen say
how long it had you.

Get extraction arming first, though. A threat you can never escape from is not a
threat, it is a diorama.

---

## Taste

**On what actually happened here.** Asked to fix a red suite, the response was to
make the suite green. That is not dishonest — the reasoning is written down, the
limits are stated, nothing is dressed up — but it is the wrong instinct, and it
is worth naming precisely because everything around it was done so carefully. A
test that fails is a question. The question was "does a tapped rising edge
reliably reach authority engagement?" and the answer shipped was "hold the key
instead." The ratified contract says the player taps. If the fixture has to hold,
the player will have to hold, and nobody has told the player.

**On the good news, which is real.** `07-noise-pulse.png` is the first frame in
this project's evidence where the milestone's headline system is visibly running:
a 600 m ring, a `SOURCE PULSE` readout, and an expanding ripple, all agreeing.
`08-portal-zone-awaiting-confirm.png` shows cyan and magenta doing their assigned
jobs in the same frame with no ambiguity. Two memos ago I wrote that the systems
were fine and the rulers were not. This is what it looks like when that turns out
to be true — nothing had to be rebuilt, and the game underneath is starting to
show through.

**On `HEARD BY 1`.** Two words on a HUD rail, and they are the whole thesis of
Noise Is Consequence delivered without a tutorial. The collapse-to-`QUIET`
decision is what makes them land: because the line is empty when nothing is
listening, the moment it fills is an event. That is good interface design — the
absence carries the signal. Whatever else changes, keep that property.

**On the smallest thing I would fix tomorrow.** The noise rail still wraps and
duplicates itself in every single frame across both capture sets:

```
NOISE          NOISE 320m · RISING
RADIUS
SOURCE THRUST AGAINST FLOW ·
HEARD BY 1
```

Four lines, the word NOISE twice, in the panel carrying the best new mechanic in
the build. Cut the label to `noise` and it fits. It is a five-character change
and it is the first thing Greg's eye will land on.
