# The Force Ladder — movement rebuilt from the fun floor up

> Orrery + Greg, 2026-08-07. Strategy ratified in discussion: get to
> simplicity first, then add forces back deliberately — each rung must
> beat the rung below in a feel session or it doesn't ship. This doc is
> the concrete representation: every rung is a set of real, existing
> tunables with today's values and the rung's overrides. Nothing here
> is prose-only; everything is a change we can make now, plus named
> extension/replacement hooks from the Endless Sky study.
> Status: DRAFT for review; implementation is one small Forge task
> (the rung-profile switch) plus per-rung content values.

## The ladder at a glance

```
L4  ECOLOGY FORCES     glitch push · vessel gravity            (the hunt)
L3  EVENTS             waves · storms · per-cause impulses     (the scream)
L2  CURRENTS AS TERRAIN  bounded rivers you enter and exit     (the terrain)
L1  WELLS              gravity landmarks · slingshot anchors   (the dread)
L0  FREE FLIGHT        thrust · coast · near-zero ambient      (the fun floor)
─────────────────────────────────────────────────────────────────────────
     each rung ships only by beating the rung below in Greg's hands
```

The inversion this represents: today every force is ON everywhere and
we tune *down* for legibility. The ladder starts from OFF and earns
each force back. Free space is the default; the ocean is in *places*.

## The force matrix — what exists today, what each rung does with it

All knobs are real and live in `src/content/fabric.data.json` (F),
`src/content/movement.data.json` (M), or the sim config (C). Current
values from the instrumented probes.

| Force | Knob(s) | Today | L0 | L1 | L2 | L3 | L4 |
|---|---|---|---|---|---|---|---|
| Thrust/heat/brake | M `player.*` | full model | **ON — unchanged** | on | on | on | on |
| Drag (always-on, toward rest) | M `coastHalfLifeSeconds .764` | on everywhere | **ON (L0a) / thrust-only variant (L0b)** | as L0 | replaced inside rivers (below) | — | — |
| Seeded-sea ambient trains | F `seededSea.*`: 2–4 trains, `ambientThrustCeiling .2`, `outsideWellFloor .2` | on everywhere, never zero | **OFF** (`ambientScale 0`) | off | **REPLACED** by river features | off outside events | — |
| Well gravity | F `wellGravity`: strength .6, full r .25, falloff 1.2, min fraction .15 | on | OFF (strength 0) | **ON — unchanged** | on | on | on |
| Well orbital current | F `wellCurrent`: strength .3, plateau→1.8 reach | on | OFF | OFF (L1 is gravity-only dread) | **ON as the well's river** (the orbit ring-road) | on | on |
| Fabric carry + cap | `fabric-reference-frame`: cap = .2 × hull cruise | on | moot (no currents) | moot | **REDEFINED** (see L2) | — | — |
| Event waves | F `eventWave.*`, conducted counts [0,1,2,3], impulse .25×hull ref | on | OFF (counts 0, growth waves visual-only) | off | off | **ON + per-cause impulses** (the parked design lands here) | on |
| Solar wind (stars) | C solarWind | on | OFF | off | off | ON? (L3 decision) | on |
| Body push (planetoids) | C bodyPush | on | OFF | ON (bodies are solid) | on | on | on |
| Inhibitor forces | glitch fabric push .018 r.18 · vessel gravity .16 r.32 | on | OFF | off | off | off | **ON — unchanged** |
| Grapple/slingshot | grapple-arc.data: boost .49–.61, rehook 1.25s | on | **ON** (it's a verb, not an ambient force) | on | on | on | on |

**The visual pairing:** each rung has a rendering partner already
planned — L1 = the well landmark work (landed), L2 = the continuous-
routes ribbon plan (rivers you *see* are the rivers you *feel*), L3 =
amber wave telegraphy (charter), L4 = inhibitor override visuals
(parked pass). The ladder makes movement and rendering the same shape.

## The switch — the one build task needed now

A named rung profile the sim loads at session start:

- New `src/content/force-ladder.data.json`: per-rung override table
  (exactly the matrix above, as data — knob path → value).
- Sim honors `LBH_FORCE_LADDER=L0|L1|L2|L3|L4|live` (env or session
  option), defaulting to `live` (today's values, zero behavior change).
- Dev-panel / Bench row to switch per session.
- Acceptance: a probe (field-probe style) per rung asserting the
  disabled forces measure zero and the enabled ones measure their
  authored values. AgentPlay smoke on L0 and L1.

Small, additive, no contract rewrites — the ladder is a *lens* on the
existing sim until a rung's redesign (L2) is ratified.

## Per-rung: the feel gate and the ES extension hooks

### L0 — Free flight (the fun floor)
**Change now:** all ambient/entity forces off per the matrix; two drag
variants selectable — **L0a** today's equilibrium drag (hull cruise
speeds intact) and **L0b** ES-style thrust-only drag (coast forever,
top speed still capped while burning; ES's dot-product damper pattern
re-derived so drag can never reverse thrust).
**Feel gate (Greg's hands):** is empty-Shallows flying *fun* — v0.2
playful? Which drag variant feels better naked?
**ES hooks:** the L0b coasting model itself; the last-frame stop-snap
(already in T1.1's module); optional camera-lag/zoom-feel experiments
(T2.8) belong at this rung where nothing else muddies them.
**Risk honestly stated:** L0b breaks the carry-cap definition and the
grapple's drag-bled anti-bank — both are L2/L1 concerns and BOTH must
be re-governed if L0b wins (grapple: boost decay or speed-relative
boost; carry: redefined in L2 anyway).

### L1 — Wells (the dread)
**Change now:** + well gravity at today's exact values, kill radius,
solid bodies, grapple anchors. No currents, no waves.
**Feel gate:** object-to-object play — does approaching a well scare
you *before* the HUD speaks (the charter checklist question), and is
slingshotting between wells a game on its own?
**ES hooks:** if L0b (coasting) won the floor, wells become real
orbital mechanics — test whether emergent orbits are a gift or a
problem; ES's refusal to integrate orbits (parameterize instead) is
the fallback pattern if drift misbehaves.

### L2 — Currents as terrain (the rivers)
**The rung where the redesign lives.** Two stages:
**Stage 1 — change now (no new code):** re-enable seeded-sea trains
but with `outsideWellFloor 0` and `influenceRadius` shrunk (~.5) —
currents become *localized* around their source wells: proto-rivers
with genuine calm between them, using only existing knobs. Well
orbital current returns as the well's ring-road.
**Stage 2 — the ratified redesign (extends stage 1):** authored river
features — bounded polyline currents (the same parametric sources the
routes rendering plan draws) with **fabric-coupled drag inside**:
coupling pulls toward the *stream's* velocity (the river takes you),
zero ambient force outside. Carry cap question re-opened here as a
design pass: full physical carry vs a bound.
**Feel gate:** entering a river must feel like entering *water* —
and leaving it must feel like escaping it. Calm must be genuinely calm.
**ES hooks:** none — ES has nothing here. This rung is the moat.

### L3 — Events (the scream)
**Change now:** conducted waves + growth waves back on, and the parked
**per-cause impulse design** lands here (consumption events hit
differently than conductor waves — Greg's stated eventual design).
**Feel gate:** a wave crossing calm space must *scream* (telegraphy-
first); it must never read as ambient noise.

### L4 — Ecology forces (the hunt)
**Change now:** glitch push + vessel gravity at today's values.
**Feel gate:** vessel pull must read as *the creature's* grip, distinct
from wells; composes with the inhibitor visual-override pass (parked).

## Sequencing

1. Build the switch + L0/L1 profiles (Forge task, small).
2. **Greg's feel session on L0a vs L0b, then L1** — the floor gets
   established in one sitting; everything above re-tunes against it.
3. L2 stage 1 immediately after (existing knobs); L2 stage 2 charters
   from what stage 1 teaches, paired with the routes rendering spike.
4. L3/L4 re-enter one rung per session, each against the ladder gate:
   *does this force make the game more fun than it was without it?*

Relationship to standing work: supersedes nothing — the fabric visual
charter's ranking (telegraphy > navigation > mood) is the ladder's
gate philosophy; the routes plan is L2's rendering half; the parked
calm-density and aliveness dials get answered empirically at L0/L2
instead of by argument.
