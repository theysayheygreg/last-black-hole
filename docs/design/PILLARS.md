# Design Pillars

> Non-negotiable principles. Every decision gets tested against these.
> If a feature, cut, or compromise violates a pillar, it's wrong.

---

## 1. Art Is Product

The visual identity is not polish. It is not a reward for finishing the systems. It is the thing we are making.

The ASCII-over-fluid look IS the game. If the game played identically but looked like colored circles on a white background, it would be a different (worse) game. The aesthetic creates the tone, the tone creates the tension, the tension creates the gameplay.

**What this means in practice:**
- ASCII shader goes in Monday, not Friday
- Visual quality is never "nice to have" — it's a shipping requirement
- If we're behind schedule, we cut systems before we cut visual identity
- "Does it look right?" is as valid a blocker as "does it run at 60fps?"
- Pre-vis and art direction happen before implementation, not after

**The test:** If someone watches 10 seconds of gameplay footage with no context, do they stop scrolling? That's the product.

---

## 2. Movement Is the Game

Surfing spacetime is the core verb. Everything else — looting, signal, extraction, threats — exists to make movement interesting. If movement isn't fun, nothing we layer on top will save it.

**What this means in practice:**
- Layer 0 gets as much time as it needs. No skipping ahead.
- Control feel is tuned by Greg, not agents. This is a taste call.
- Every new system must answer: "how does this make movement more interesting?"
- Wrecks are terrain, not just loot nodes. Portals are destinations that shape routes, not just exits.
- The fluid sim is gameplay, not backdrop. Players who read the flow should outperform players who fight it.

**The test:** Is it fun to just fly around with no objectives? If yes, proceed. If no, nothing else matters yet.

---

## 3. Signal Is Consequence, Not Currency

Every action worth doing creates signal. Signal is the tax on ambition — the unavoidable cost of playing the game. It is not a resource to spend, not a meter to optimize, not a dial with a sweet spot.

**What this means in practice:**
- Signal never buys capability. The actions that generate signal are the upside.
- There is no "optimal signal level." You want to be as low as possible, always.
- Skilled play (surfing, reading currents) is quiet. Unskilled play is loud.
- The game teaches you to surf by making non-surfing expensive.

**The test:** Does the player feel clever for being quiet, or punished for being loud? Clever = working. Punished = broken. (If playtesting shows punishment, this pillar gets revisited.)

**Note:** This is Greg's position. Forge pushed for signal-as-capability. The pillar stands until playtesting proves it wrong. See DECISION-LOG.md for the full debate.

---

## 4. The Universe Is the Clock

No countdown timer. No arbitrary time limit. The world visibly, physically dies around you. The pressure comes from the environment, not the HUD.

**What this means in practice:**
- Every time-pressure mechanic must be spatial and visible: wells grow, portals evaporate, flow thickens, space shrinks
- The player should be able to SEE that time is running out by looking at the world, not the UI
- HUD warnings supplement the environment, they don't replace it
- "How much time do I have?" should be answered by reading the fluid, not a number

**The test:** Mute the HUD. Can the player still feel the urgency? If yes, the universe-as-clock is working.

---

## 5. Dread Over Difficulty

The game should be scary, not hard. The Inhibitor is terrifying not because it's mechanically complex but because it's inevitable, unstoppable, and your fault.

**What this means in practice:**
- Threats change the emotional register, not just the difficulty number
- The Inhibitor doesn't need complex AI. It needs to feel wrong.
- Losing should feel like consequence, not unfairness
- The tone is cosmic dread, not action game intensity
- Audio, visual corruption, and environmental change do more than damage numbers

**The test:** Does the player's stomach drop when the Inhibitor wakes? Not "do they die" — do they FEEL it?

---

## 6. Run It Twice

When we face a technical fork and both paths have merit, run both as parallel experiments. Merge if possible, pick the winner if not. Agent compute is cheap. Design regret is expensive.

**What this means in practice:**
- The dual-sim question (Navier-Stokes vs. wave equation) gets two parallel experiments, not a premature commitment
- If two agents can explore two approaches simultaneously, they should
- "Fake the theorem, ship the feeling" is still true — but we can also check if the theorem ships just as fast
- Dead experiments get committed and documented, not deleted. They're future options.

**The test:** Are we choosing between approaches because we tested both, or because we only had time for one? The first is a decision. The second is a guess.

---

## Using the Pillars

When making a decision, check it against the pillars in order:

1. Does it serve the visual identity? (Art Is Product)
2. Does it make movement more interesting? (Movement Is the Game)
3. Does it respect signal-as-consequence? (Signal Is Consequence)
4. Is the pressure environmental, not UI? (Universe Is the Clock)
5. Does it create dread, not just difficulty? (Dread Over Difficulty)
6. Did we test the alternatives? (Run It Twice)

If a proposed feature fails pillar 1 or 2, it's cut regardless of how clever it is. If it fails 3-5, it needs redesign. If it fails 6, it needs more exploration before committing.
