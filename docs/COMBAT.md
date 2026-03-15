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

## Recommendation for the Jam

**No lethal combat for v1. Build the interaction tools instead.**

Reasons:
1. Signal flare + force pulse + tether give players meaningful agency against threats without a damage system
2. These tools integrate with the fluid sim (force injection, signal mechanic) — they feel like part of the world, not bolted on
3. They work identically in solo (vs AI) and multiplayer (vs humans)
4. They're each 1-2 hours of implementation vs 8+ hours for a full combat system
5. If playtesters want combat after playing, we add it post-jam. If they don't miss it, we saved a week.

### Implementation Priority (if we have time)
1. **Signal flare** (simplest — just spawn a signal source entity)
2. **Force pulse** (natural extension of fluid force injection)
3. **Tether** (needs spring physics but could be amazing for navigation)
4. **EMP** (needs scavenger AI to respond to sensor states)

### If We DO Add Combat Later
- Projectiles ride the fluid (they have velocity from the current + their own thrust)
- Shooting generates signal proportional to weapon power
- Kills drop the victim's loot (extraction game standard)
- Near the Inhibitor threshold, combat becomes mutually assured destruction
- The fluid makes combat positioning deep: fight with the current at your back, force enemies into wells
