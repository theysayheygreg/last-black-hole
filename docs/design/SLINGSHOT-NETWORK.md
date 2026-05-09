# Slingshot Network — Design Document

> Space isn't empty. It's a network of anchors. The fastest pilot reads the network and rides it.

---

## What This Doc Is

`SLINGSHOT.md` proposed slingshotting *off wells*.
`SLINGSHOT-V2.md` explored mechanical patterns (rail-grind, pendulum, tether-and-release) and recommended a snap-to engagement model.

This doc extends both: slingshot becomes a **terrain mechanic available off any heavy enough object**, and that turns "swing past a well" into a **route-planning gameplay loop** that runs over the whole map. Map geography becomes the puzzle.

This doc names the system, the anchor catalog, the loop, and the design decisions already made. Numbers come later.

---

## Why It Matters Now

Delta-v shipped. Thrust costs fuel. Players can no longer just hold the gas pedal — they need *other* ways to gain or maintain speed. The fluid currents are one (surfing). Slingshots are the other.

But "slingshot" today is a transitive consequence of well-pull math: any time you fly past a well, your trajectory curves, and physics nerds call that a slingshot. It's not a *feature* — it's a side effect. Players don't know when they pulled one off, and the game doesn't reward them for doing so deliberately.

We're turning slingshot into a designed verb. And once we do, every massive object on the map becomes a potential anchor. **Place space.**

Tied to pillars:
- **2 (Movement Is the Game):** the fastest pilot routes through anchors instead of fighting the field.
- **6 (Run It Twice):** slingshot is a mastery curve, not a damage check.

---

## The Anchor Catalog

Anything with meaningful mass and a stable position can be a sling anchor. Three tiers fall out naturally:

| Anchor | Reward | Risk | Character |
|---|---|---|---|
| **Well** | High | High (kill radius) | Trade lives for distance. The big payoff. |
| **Star** | Medium | Medium (consumption events, accretion rings) | Reliable workhorse — plentiful, but stars get consumed by wells over a run, so opportunity is time-limited. |
| **Planetoid / Comet** | Low | Low | Moving target. Timing matters. Lots of them. Used as intermediate hops. |

**Excluded by design:**
- **Wrecks** — purpose is *stopping*. You want to land near them, not blast past.
- **Portals** — purpose is *exiting*. Slinging would feel like a UI conflict.
- **Scavengers** — too light, also moving with intent. Could revisit if there's a reason.
- **Fauna / sentries** — same.

Each anchor type has a unique slingshot signature: distinct color flash on engage, distinct audio cue on release, distinct visible affordance in the world. A player who's swung off all three knows the universe has a *vocabulary* — not just one trick.

---

## The Engagement Model

Locked: **the skitching / rail-grinding model.** This decision is shared with `SLINGSHOT-V2.md`'s recommendation but explicit here for the multi-anchor case.

```
APPROACH → AFFORDANCE → BUTTON-PRESS → ENGAGED → RELEASE
```

1. **Approach.** Player flies near an anchor.
2. **Affordance.** When inside the anchor's `slingshotRange`, a radial visual appears around the anchor — a faint ring that says "you can sling here." Optional UI hint near the velocity readout: "slingshot available."
3. **Button-press.** Player explicitly commits. No accidental slings, no "I didn't mean to do that." The button initiates engagement.
4. **Engaged state.** Ship is locked into a partial orbit around the anchor. Gravity pull is partly cancelled by the slingshot tether — the ship swings, doesn't infall. The player can still steer within the engagement (skitching analog: you can lean while gripping the bumper).
5. **Release.** Player presses release (same button or a dedicated one) at any time. Exit velocity = current orbital velocity in the ship's facing direction. Energy banked from the swing transfers as a velocity boost.

**Why button-press over auto-trigger:**
- It makes the verb *intentional* — the player names the move every time they do it.
- It removes ambiguity about "did I just sling or did I just curve?"
- It gives the system a clean state to communicate (you're either engaged or not).
- It allows the visual/audio language to live entirely in the engaged state, so feedback is unambiguous.

**Why manual release over timed release:**
- The release point IS the skill expression. Release angle determines exit vector.
- Different routing goals want different release points. Heading to a well? Release tangent toward the well. Heading to extract? Release toward the portal.
- The player can hold longer for a bigger swing (more accumulated energy) or release early for direction control. Pure player decision.

**Per-anchor keyed ranges.** Each anchor has its own `slingshotRange`. They can overlap. Overlapping ranges create *natural chain hubs* where the player can release-from-A-while-snapping-to-B. Level design uses this expressively.

---

## The Gameplay Loop

Three time scales, each driving the next:

### Moment-to-moment

> "I see a star ahead. If I press engage at this angle and release at *that* angle, I gain enough speed to reach the next well without burning fuel."

Reading the immediate geometry. This is the verb-level loop — engage, swing, release, exit. Skill expression lives here: the angle of approach, the duration of the hold, the angle of release.

### Run-level routing

> "My path from spawn to the nearest portal is *star → comet chain → well → coast.* My delta-v budget gets me to the first sling; everything after is harvested from the terrain."

The player reads the map and plans a route. Direct flight burns all your delta-v on a 10x10 map. A skilled pilot routes anchor-to-anchor, treating fuel as an *initiator* and slingshots as *throughput*.

### Meta loop

> "Deep Field is a route-planning puzzle. Shallows is a flight test. Different maps reward different styles."

Map choice = loop choice. Some signatures could change anchor density (a "stellar nursery" signature with extra stars, a "sparse field" with delta-v-critical voids). Map design becomes route design.

---

## Chains

The mechanic that turns *swinging* into a *system*: exit one anchor's range while still tangentially aligned with the *next* anchor's range, and you get a chain bonus on top of each individual slingshot's reward.

Two reasons this matters:
1. **It rewards thinking two moves ahead.** Pulling off a 4-hop chain across a star line should feel like making a perfect read.
2. **It lets level design speak.** Three stars in a near-line says "chain me." A well 1.5 world-units from a star says "two-hop." Geometry communicates intent.

Implementation note (numbers later): chain bonuses should be multiplicative with anchor mass, so a chain of three stars feels different from a chain of three planetoids. A well-included chain should feel like a payoff event.

---

## Map / Level Design Implications

Right now Deep Field's wells are scattered for "wells everywhere" gameplay. For slingshot-as-loop they want to be **placed with linkage in mind**.

This probably means revisiting existing maps with a route-design pass once the system is in. Specifically:
- Are there 2-hop opportunities (well + nearby star)?
- Are there 3-chain runs (three aligned anchors)?
- Are there *void corridors* between clusters that punish unplanned routes?
- Does each map have at least one "signature line" — a recognizable route a player can master?

Maps stop being "where do the threats live" and start being "what routes does this universe offer." Both of those questions can coexist, but the second one only matters when slingshot is a real verb.

---

## Hull Integration

Each hull gets a **route-style identity** in addition to its existing stat sheet:

| Hull | Slingshot character |
|---|---|
| **Drifter** | Best slingshot energy capture. Tightest chain windows. The slingshot specialist — currents *and* anchors are your fuel. |
| **Breacher** | Huge delta-v tank, modest slingshot bonus. Can ignore the system and brute-force routes. The "I don't need this game" hull. |
| **Resonant** | Wider chain timing window (forgiving chains) at the cost of per-anchor reward. Trades depth for breadth. |
| **Shroud** | Silent slings — slingshots generate less signal than for other hulls. Stealth-routing identity. |
| **Hauler** | Mass penalty on energy gained. Laden ships swing less efficiently. Trades "max distance per sling" for "more cargo at destination." |

This is more legible than `thrustScale: 1.4 vs 0.7`. Each hull names a *style of moving through space*, not just a stat profile.

---

## Visible Affordance + Feedback

Three UI/visual moments the system needs:

1. **Engage affordance.** When a slingshot anchor is in range, a faint radial ring on the anchor + a small HUD hint ("slingshot available") + optional audio cue. The ring is the snap-to indicator — visible terrain.
2. **Engaged state.** Ship's trail color shifts. Anchor glows. A line/arc traces the predicted release path based on current orbital velocity. Player sees the swing happening in real time.
3. **Release confirmation.** Velocity readout flashes. Brief audio sting tied to the anchor type (well = deep boom, star = solar flare, comet = whip-crack). The ship's wake does something distinct for the next half-second.

Without this, the system is invisible and the player can't develop mastery. **The feedback IS the feature.** A slingshot that doesn't announce itself is just physics happening.

---

## Open Decisions Deferred to Numbers Pass

Captured here so they're explicit:

1. **Engage button mapping.** Probably the existing pulse button (E / Square)? Or a new bind? Pulse is already a combat verb — overlap could be confusing. Likely a new bind.
2. **Slingshot range per anchor type.** Wells biggest, planetoids smallest. Should overlap *between* anchors but not *within* a tier (you shouldn't be able to engage two stars at once unless they're a deliberate cluster).
3. **Energy formula.** `tangentialAlignment × duration × anchorMass × hullModifier` is the rough shape. Tuning to follow.
4. **Chain window timing.** How long after release can you engage another anchor and still count as a chain? Some hull dependence (Resonant gets longer).
5. **Failure modes.** What happens if you engage too close to a well's kill radius? Does the slingshot save you (graze the lion) or condemn you (committed to a bad orbit)? My instinct: it commits you. The risk is what makes the reward real.
6. **Cooldown / cost.** Probably no per-slingshot cooldown — the cost is the geometry of the next engagement opportunity. But a hull-level "max chain length" might matter for balance. TBD.
7. **Server authority.** Slingshot state needs to be authoritative for multiplayer. Engagement decision is client-initiated, energy resolution is server-resolved. The same shape as pulse.

---

## What This Doc Is NOT

- **Not a numbers spec.** Specific ranges, multipliers, durations come in a follow-up after we agree on shape.
- **Not a map redesign.** Map updates happen after the system ships and we can playtest route-readability.
- **Not a replacement for `SLINGSHOT-V2.md`.** That doc explored mechanical alternatives; this one extends the chosen direction to the multi-anchor case.

---

## Status

**Design proposal — awaiting review.** Decisions made:
- Skitching / rail-grinding engagement model (button-press, snap-to, manual release).
- Three-tier anchor catalog (wells / stars / planetoids).
- Per-anchor keyed ranges, level design handles clustering.
- Chains as a first-class mechanic, not a tuning detail.
- Hull integration via route-style identity.

Decisions deferred:
- All numbers.
- Specific UI/HUD shape for the velocity readout + slingshot affordance.
- Map-design pass to make existing maps route-readable.
- Server-authority specifics.
