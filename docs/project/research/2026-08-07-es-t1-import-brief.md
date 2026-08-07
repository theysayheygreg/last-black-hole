# Tier-1 Endless Sky Imports — Brief for Forge

> Orrery, 2026-08-07. Companion to
> `2026-08-07-endless-sky-compare.md` (full study). Each item below
> carries the finding, the LBH-tailored solution, pros/cons, why this
> shape over the alternatives, and Greg's ratified scope.
> **Forge: this is a brief, not a spec — you own the implementation
> and your counter-proposals are wanted before you build.** Where your
> read of the code says a different seam is better, say so in
> #last-black-hole and we'll adjudicate. ⚖️ ES is GPL-3: re-derive
> everything in our code; never port lines.

---

## T1.1 — Arrival/steering module (RATIFIED: shared module, all three customers)

**Finding.** ES ships never wobble, overshoot, or orbit-of-death
because of four small pieces of math (ES refs: AI.cpp:2531, 3695,
2990; Ship.cpp:5138): steer at the *stopping point* (which includes
time spent turning around) rather than the target; refuse to thrust
inside your own turning envelope; issue *fractional* final-frame
commands so you land exactly on heading; snap the last sub-deadband
velocity to zero instead of oscillating.

**LBH tailoring.** Our ships steer by thrust vector at 15Hz — no
ES-style turn rates — so the import is the *derivations*, not the
code: stopping-point under OUR dynamics (equilibrium drag + fabric
carry + heat headroom), an approach gate from that envelope,
fractional thrust shaping near arrival, and a velocity-deadband
stop-snap. One module in the authority (suggest
`scripts/sim/arrival.cjs`), consumed by three customers: AI
pilots/scavengers, the player-assist layer (EDDY BRAKE's stop
quality; a future aperture-approach assist), and AgentPlay.

**Pros:** rival believability (the player's theater every solo run —
results-screen lines like "redline extracted / 4 cargo" only sting if
redline flies like a pilot); the assist layer for controller/couch
play sits on this math; AgentPlay's chronic portal-approach red is
this exact failure class; 15Hz makes fractional commands MORE
valuable, not less (coarser steps = bigger bang-bang error).
**Cons:** rival behavior changes mid-Shallows-proving (accepted by
Greg — it changes for the better); stopping-point under fabric carry
is genuinely harder than ES's version (the medium moves — the module
must sample the authoritative field along the predicted path or
accept bounded error); risk of assists masking movement-clarity
issues if tuned during proving (mitigate: assists land behind
tunables, default off until Greg's feel session).
**Why this shape:** a shared module beats three bespoke fixes because
the three customers must agree about what "arriving" means or AgentPlay
stops being evidence about the game. Player-assist-only was rejected
as leaving rival believability (the biggest visible win) on the table.

**Forge questions:** where does the stopping-envelope live so both the
sim AI tick and the assist path share it without double-sampling the
field? Is bounded-error carry prediction (sample-at-current-cell)
good enough at Shallows speeds, or does the path need 2–3 lookahead
samples?

---

## T1.2 — Condition store, minimal seed (RATIFIED: seed now, expression language later)

**Finding.** ES stores all progression/state as one flat namespace of
named int64s — primary entries serialized, derived entries computed by
registered lambdas — with scope prefixes for per-run / per-pilot /
per-install, and an expression language content uses to gate on it.
Content authors can't tell stored from computed; tests assert on the
same namespace (ES refs: ConditionsStore.h:40, PlayerInfo.cpp:3920+).

**LBH tailoring (the ratified seed).** Authority-owned store with two
scopes (run, pilot), serialized through the existing control-plane
profile path; a derived registry for live values (survival time, noise
stats, ecology phase, cargo value, deaths-by-cause, per-well death
counts); migrate chronicle reads and the existing unlock/echo facts
onto it. NO expression language yet — it lands with the first content
that needs it (v0.3.2 encounter work).

**Pros:** the game gets a memory — "you've died to Charybdis three
times" content, veteran-vs-first-run variation, and gamerules-style
run modifiers all become data reads instead of engine features;
it's the substrate T1.3 asserts against; small PR now vs a migration
later when ten systems have grown their own fields.
**Cons:** an architecture PR mid-RC (why the seed is minimal); risk
of a second source of truth if migration is partial — the seed must
*replace* the chronicle-field reads it covers, not mirror them.
**Why this shape:** full-import-now was rejected as mid-RC scope
creep; bank-for-v0.3.2 was rejected because T1.3 and the department
content all queue behind it — the seed is the smallest thing that
unblocks the rest.

**Forge questions:** does the store live in the session (run scope)
with a merge-to-profile at settlement, or as one store with scoped
prefixes ES-style? Preference for collision with the existing
`runRecords`/chronicle shape?

---

## T1.3 — Integration tests as data (RATIFIED: build AFTER the condition store)

**Finding.** ES integration tests are data files in the content
format: inject an inline savegame, drive frames of input, branch/loop,
and assert in the same condition language content uses — plus
`status: known failure` so broken tests live honestly in CI, and
shared subroutines ("Depart", "Land") (ES refs: source/test/Test.h,
tests/integration/).

**LBH tailoring.** A journey-test format driving the real sim +
browser through the existing harness: seed/session-state inject →
scripted inputs at ticks → assertions against the condition store
(T1.2). Shared subroutines for launch/loot/extract. `known-failure`
status adopted so the red-classification honesty problem (reds living
only in Discord prose) gets a structural fix.

**Pros:** "the journey works" stays continuously true — regressions
surface as failing journeys, not player reports; AgentPlayEval's
chronic ambiguity becomes assertable facts; test authoring drops from
code-PR to data-file. **Cons:** waits on T1.2 maturity (Greg chose
build-once-on-the-store over a v0 on snapshot asserts — no interim
DSL that would need migrating); the browser leg keeps some flake
surface (mitigated by the harness fixes already dispatched).
**Why this shape:** building the DSL twice (snapshot-assert v0, then
condition-assert v1) was rejected as churn; adopting only the process
bits was rejected as leaving the main value (data-authored journeys)
unrealized.

**Forge questions:** none blocking now — sequenced behind T1.2. Flag
early if you want the test format to be the DataNode-ish indent style
or JSON; Orrery has no strong position, content-authorability wins.

---

## T1.4 — World-annotation grammar (RATIFIED: full grammar, via the UI style guide, Mosaic implements)

**Finding.** ES annotates the world with four tiny analytic
primitives (ring/arc-with-dash, tapered pointer, line, outline) and a
count-code: target brackets are N pointers on a ring — 4=ship,
5=landing, 3=asteroid — so class reads at any distance without color
or text; off-radar contacts clamp to the rim instead of vanishing
(ES refs: ring.frag, pointer.frag, Engine.cpp:1354, Radar.cpp:118).

**LBH tailoring + routing (Greg's call):** imported as **guide law,
not a Forge task** — now §5.1 of `UI-STYLE-GUIDE-v1.md` with rubric
check W1: count-encoded brackets (4=ship / 5=aperture / 3=salvage),
rim-clamp on the audible-contact ring, one ring/arc/dash primitive,
labels-under-entities. Mosaic implements as canvas primitives in the
component library during the HUD migration; reviews measure against
the guide. Forge's involvement: only where the migration's plumbing
meets the sim (contact data feeds).

**Why this shape:** measurable-by-guide beats direct dispatch — the
department does the work, the rubric judges it, and the grammar can't
drift per-implementer.

---

## T1.5 — Label placement (RATIFIED: statics precomputed + draw-under + anti-jitter, same guide/Mosaic lane)

**Finding.** ES places every planet label ONCE at system entry — 12
candidate angles tested against all other labels and bodies at every
zoom — then never re-runs it; labels draw under ships; text renders
non-rounded to kill jitter (ES ref: PlanetLabel.cpp:174-195).

**LBH tailoring.** Wells/portals/wrecks are static per run →
precompute their collision-free anchors at run start; moving entities
keep the existing per-frame offset ladder (`presentation-layout.js`);
world labels move below the entity layer; world-anchored text stops
rounding positions. The IN-RANGE-prompt-occludes-the-well defect is
the canonical target and rides this pass. Also guide law (§5.1 + W1),
Mosaic's lane.

**Pros:** labels stop fighting the action precisely at the moments of
maximum danger; run-start precomputation is cheap (static set is
small) and deterministic per seed. **Cons:** two placement systems
(precomputed + ladder) — acceptable because they split cleanly on
static-vs-moving; run-start cost is trivial but must not block the
drop-in transition.

---

## Sequencing (as ratified)

1. **T1.1** — Forge lane, can start now (assists behind tunables,
   default off until Greg's feel session).
2. **T1.2** — Forge lane, small PR, before or parallel with T1.1.
3. **T1.3** — queued strictly behind T1.2's store.
4. **T1.4 + T1.5** — Mosaic lane via the guide (§5.1/W1), inside the
   HUD migration; Forge only at the sim-data seams.

Tier-2 items (coasting experiment, camera feel, entity motion smear)
remain gated on the movement-clarity proving; tier-3 banked — full
list in the companion study.
