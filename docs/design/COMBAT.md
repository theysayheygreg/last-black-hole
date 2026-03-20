# Combat: Should This Game Have Weapons?

> Design analysis. Not a decision — a framework for deciding.

---

## The Case FOR Combat

**It's an extraction game.** Tarkov, Hunt: Showdown, Dark and Darker — every extraction game in the genre has PvPvE combat. Players expect it. The tension of "that other surfer might kill me" is foundational to extraction design.

**Signal mechanic enables interesting combat.** Weapons that generate massive signal — you can shoot, but you're screaming into the void. Shooting near the Inhibitor threshold is suicide. Combat becomes a cost-benefit calculation, not just aim.

**Dark forest logic demands it.** If you see another surfer, the rational move is to eliminate them — they're competition for portals and loot, and their signal contributes to the Inhibitor threshold. Without weapons, the only answer is avoidance. With weapons, you get the full dark forest dilemma: shoot (eliminate the threat but spike your signal) or hide (preserve stealth but leave a competitor alive).

**Fluid physics makes combat unique.** Projectiles that ride the fluid. Weapons that inject force into the sim. Gravity well slingshots. No other game has physics-based combat in a fluid simulation. This is a differentiator.

---

## The Case AGAINST Combat

**The skill axis is navigation, not aim.** The game's core fantasy is "surfing spacetime." Combat shifts attention from reading waves and managing signal to mouse-aim and DPS calculations. It could dilute the thing that makes the game unique.

**Complexity budget.** It's a 7-day jam. Combat needs: projectile physics, hit detection, damage model, death/respawn (in an extraction game — permadeath per run?), weapon variety, balance. That's an entire layer's worth of work that competes with polish, sound, procgen, and juice.

**The Inhibitor IS the combat.** The existential threat isn't other players — it's the universe itself. The Inhibitor is unkillable. Black holes are unkillable. The game is about survival against entropy, not about killing each other. Adding PvP combat changes the tone from cosmic dread to arena shooter.

**Avoidance is already interesting.** Scavengers that race you for portals. Fauna that swarm signal sources. The Inhibitor that hunts you. These threats don't require the player to shoot — they require the player to navigate, hide, and make risk/reward decisions. That's the unique loop.

---

## The Middle Ground: Non-Lethal Interaction

What if you can affect other entities (and future: other players) without weapons?

### Signal Flare / Decoy
- Eject a signal source that attracts fauna and draws Inhibitor attention
- Costs: burns exotic matter, briefly spikes your own signal
- Uses: distract fauna from a wreck, redirect Inhibitor, bait a scavenger away from a portal
- **This is a weapon, but the target is attention, not health**

### Gravity Bomb / Force Pulse
- Inject a massive force into the fluid at a point
- Creates a shockwave that pushes everything outward (or inward)
- Costs: enormous signal spike
- Uses: clear fauna, deflect a scavenger's course, push yourself away from a well, create a wave to surf
- **This affects physics, not hitpoints**

### EMP / Signal Scramble
- Temporarily blind a scavenger's sensors — they lose track of their target
- Costs: moderate signal
- Uses: make a scavenger miss a portal entrance, confuse fauna swarms
- **This disrupts information, not health**

### Tether / Harpoon
- Connect yourself to a wreck or another entity with a tether
- Physics: tether acts as a spring in the fluid — you pull each other
- Uses: anchor to a wreck in strong current, drag loot through dangerous areas, slingshot around a gravity well
- Costs: continuous signal while tethered
- **This creates physical connection, not damage**

---

## Decision: Non-Lethal Interaction Tools (Confirmed 2026-03-20)

**No lethal combat. Build the interaction tools.** Greg confirmed this direction on day 5 — the game needs "teeth" but through physics tools, not damage numbers.

### Implementation Priority (REVISED — building these for the jam)

1. **Force pulse** (spacebar) — massive radial force injection at ship position. Shoves fluid, scavengers, fauna outward. Creates surfable wave ring. Emergency well escape. Cooldown 3-5s. Signal cost: +20-25%.

2. **Signal flare** (shift) — launch a decoy signal source in facing direction. Drifts with fluid. Scavengers/fauna/Inhibitor track it. Duration 8-10s. One active at a time. Absorbs player signal while active. Depends on signal system.

3. **Tether** (hold right-click / L1) — attach to wreck or planetoid. Ship dragged along. Zero signal while tethered. Good for hiding, anchoring during loot, free travel on planetoids. Thrust to detach.

### Detailed designs in separate docs
- Force pulse: see implementation in `src/combat.js` (building Friday)
- Signal flare: see SIGNAL-DESIGN.md (depends on signal system — Saturday)
- Tether: building Saturday

### EMP / Signal Scramble
Deprioritized. Needs scavenger sensor states to respond to. Revisit post-jam or if ahead of schedule.

### If We DO Add Lethal Combat Later
- Projectiles ride the fluid (they have velocity from the current + their own thrust)
- Shooting generates signal proportional to weapon power
- Kills drop the victim's loot (extraction game standard)
- Near the Inhibitor threshold, combat becomes mutually assured destruction
- The fluid makes combat positioning deep: fight with the current at your back, force enemies into wells
