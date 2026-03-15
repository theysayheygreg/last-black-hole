# Visual Scale Guide

> "Small ship in a big, messy, dying universe."
> This doc defines the relative scale of everything on screen.
> Informed by Gemini pre-vis (assets/pre-vis/) and Greg's feedback.

---

## The Core Proportion

The player is a speck. The universe is vast. This is an ocean game, not an arena game.

Think: a surfer seen from a helicopter, not a car in a parking lot. The waves dwarf the player. The black holes dwarf the waves. The player's skill is reading and navigating something much larger than themselves.

## Scale Tiers

### Tier 0: The Player and Player-Scale Objects
**Relative size: tiny. 1-3 ASCII cells.**

- **Ship** — a single directional glyph (`>`, `▶`, `◇`) or at most a 3-cell shape. NOT a sprite. NOT detailed. The ship's identity comes from its trail and behavior, not its visual complexity.
- **Fauna (Signal Moths)** — similar scale to the ship. 1-2 cells. Individually small, threatening in swarms.
- **Loot items** — not visible as discrete objects. Loot is the act of approaching a wreck, not picking up sprites.
- **Other players / scavengers** — same scale as the ship. Distinguish by color, not size.

**Why this small:** The player needs to feel *inside* the fluid, carried by it, dwarfed by it. If the ship is large, the waves feel like ripples in a puddle. If the ship is tiny, the same waves feel like ocean swells.

### Tier 1: Wrecks and Portals
**Relative size: small landmarks. 5-15 ASCII cells across.**

- **Wrecks** — clusters of dense characters. Gold/amber. Bigger than the ship but small relative to the flow field. Should feel like debris caught in a current, not like buildings. Different wreck tiers could have slightly different cluster sizes (surface: 5-8 cells, deep: 8-12, core: 10-15).
- **Portals** — pulsing rings of cyan-green characters. Similar footprint to a medium wreck but visually distinct (circular, glowing, animated). Should feel like a drain or vortex in the fluid — a small puncture in spacetime.

**Why this size:** Large enough to navigate toward, small enough to miss if the current carries you past. The approach stickiness affordance compensates for their small size.

### Tier 2: Waves and Flow Patterns
**Relative size: much larger than the player. 50-200+ cells across.**

- **Wave crests** — broad arcs of elevated ASCII density radiating from wells. A wave crest might span a quarter of the visible screen. The player surfs along one edge of it, not on top of it.
- **Interference patterns** — where two wells' waves overlap. These create zones the size of whole screen regions. The player reads them and picks lanes.
- **Current channels** — visible flow direction in the ASCII (character orientation, density gradients). Stretch across large areas.
- **Lee zones behind wrecks** — calm patches maybe 2-3x the wreck size. Small shelters in a big flow.

**Why this large:** The fluid IS the terrain. Waves need to feel like landscape features you navigate through and around, not obstacles you dodge. A wave you can see entirely on screen doesn't feel like an ocean swell. A wave that extends beyond the viewport does.

### Tier 3: Gravity Wells (Black Holes)
**Relative size: massive. Dominant screen features. 30-100+ cells for the visible influence zone.**

- **The void center** — a region of near-empty/sparse ASCII. The absence is the visual. 15-30 cells across for the "core" darkness.
- **The accretion ring** — dense, hot-colored ASCII characters orbiting the void. 30-50 cells across. This is the "shore break" zone.
- **The pull radius** — the entire gravitational influence zone. Might extend 100+ cells, fading gradually. The player feels the pull long before they see the void.
- **Multiple wells** — at 4x4 screen universe, each well dominates its quadrant. The space *between* wells is where the game happens.

**Why this massive:** These are the mountains of this world. The player navigates their foothills (the pull radius), avoids their peaks (the void), and rides the waves they generate. If wells are small, the game feels like dodging obstacles. If wells are massive, the game feels like navigating a landscape.

### Tier 4: The Inhibitor
**Relative size: ambiguous. Changes with threat level.**

The Inhibitor's scale is a design question. Options:

**Option A: Small but wrong**
- Same size as the ship (1-3 cells) but visually alien — wrong characters, wrong color (magenta), wrong motion (ignores fluid)
- Scary because it's your size and faster than you, not because it's big
- The corruption/glitch effect around it is what takes up space, not the entity itself

**Option B: Growing presence**
- Starts small (2-3 cells) when it spawns at map edge
- Its visual corruption field grows as it gets closer to you
- At close range, it's the center of a 30-50 cell zone of corrupted ASCII
- The entity is small but its *influence* is massive — like a virus

**Option C: Scale-less**
- The Inhibitor doesn't have a fixed form
- It's a region of wrongness that moves — math symbols, equation fragments, characters that don't belong in this universe's physics (from Prompt 3/8: `∑V`, `∫∫`, broken equations)
- The "entity" is the boundary between normal space and corrupted space
- Size varies: narrow when hunting (a line or beam), wide when searching (an expanding field)

**Greg's lean (from pre-vis feedback):** Options B and C are more interesting than A. The Inhibitor should feel like a *presence*, not a sprite. Prompt 3's math-symbol corruption and Prompt 8's hot-pink diagonal slash both capture the right energy — something that doesn't belong, cutting through the universe's fabric.

**Decision needed:** Lock this down during Wednesday Inhibitor implementation. All three options are implementable in ASCII.

---

## Pre-Vis Reference Notes

From Gemini pre-vis images (assets/pre-vis/), Greg's feedback:

| Image | What Works | What Doesn't | Use As Reference For |
|-------|-----------|-------------|---------------------|
| Prompt 1 | Ship tiny against massive accretion disk. Void center reads as black hole. Color gradient (amber→dark). Cyan portal at correct scale. | Ship is a detailed sprite, should be a glyph. | **Title screen composition.** Well scale. Color palette. |
| Prompt 2 | Multiple wells with interference patterns. Portal approach. | Ship too large/detailed. | Multi-well layout. Interference visual. |
| Prompt 3 | HUD corner panels (SYSTEM INTEGRITY, SIGNAL). Math-symbol glitch characters as Inhibitor corruption. | Ship too big. Inhibitor presence too ambient, should be directional. | **HUD framing. Inhibitor corruption aesthetic.** |
| Prompt 4 | Blocky `###` wreck clusters. Ship chevron closer to right scale. | Everything equally weighted, no scale hierarchy. | Wreck visual representation. |
| Prompt 5 | Best wave patterns — concentric rings with interference. Ship appropriately small. | Entity in lower-right too figurative for ASCII. | **Wave/flow pattern reference. Ship scale.** |
| Prompt 6 | Clean NERV-style HUD corners. "PORTAL EVAPORATING" warning. | Game world too empty behind HUD. | HUD layout and warning text style. |
| Prompt 7 | Ship design variety (lore interest). | Way too detailed for ASCII game. Ship is a glyph, not a sprite. | Post-jam lore art only. |
| Prompt 8 | Hot pink slash through corrupted space. Math-symbol corruption. Viscerally threatening. | Inhibitor as a "line" is wrong — should be a moving presence. | **Inhibitor energy and color. Corruption spreading.** |

---

## Rendering Layers and Visual Hierarchy

Objects exist in two places simultaneously: they disturb the ASCII substrate (Layer 0) AND render above it (Layer 1). This dual presence is what makes the world feel physical.

### The Four Layers (bottom to top)

```
Layer 0: ASCII Substrate — the fluid, the fabric of spacetime
Layer 1: Entity Overlay — physical objects (ship, wrecks, portals, Inhibitor)
Layer 2: VFX Overlay — energy events (thrust trail, explosions, Inhibitor beam)
Layer 3: HUD — DOM overlay (signal, portals, warnings)
```

### How Objects Touch Both Layers

| Object | Layer 0 (substrate disturbance) | Layer 1/2 (above substrate) |
|--------|-------------------------------|---------------------------|
| **Ship** | Thrust injects force → wake visible in ASCII behind ship. Denser, warmer characters in the wake cone. | Clean vector triangle or glyph. Always readable. |
| **Wrecks** | Deflect flow → eddies and lee zones in the ASCII. Calm patch downstream, turbulent edges. | Gold geometric cluster or vector shape on top. |
| **Portals** | Act as fluid sinks → ASCII swirls inward around them. Characters spiral toward center. | Clean pulsing cyan ring on top. Glow bleeds into substrate via color. |
| **Gravity wells** | ARE the substrate disturbance. No Layer 1 presence — they're expressed entirely through the ASCII (void center, dense ring, flow patterns). | No overlay — wells are pure environment. |
| **Inhibitor** | Corrupts the ASCII — characters shift to wrong glyphs, math symbols, equation fragments. Corruption spreads ahead of its path. | Magenta geometric form or glitch shape on Layer 1. Hot pink energy effects on Layer 2. |
| **Thrust trail** | Wake in the ASCII (Layer 0). | Fading line or particles on Layer 2. |
| **Merger shockwave** | Massive wave pulse in the ASCII (Layer 0). | Bright expanding ring on Layer 2. |
| **Wave catch** | Wave crest brightens in ASCII (Layer 0 affordance cue). | Brief flash/glow on Layer 2 confirming the catch. |

### Why This Dual Presence Matters

The substrate disturbance says "this object affects the physics." The overlay says "this object is here, you can interact with it." Without the disturbance, objects would feel like stickers on a background. Without the overlay, objects would be lost in the ASCII noise.

**The visual hierarchy:**
- Layer 0 (ASCII) is dense, noisy, alive — the ocean
- Layer 1 (entities) is clean, geometric, sparse — the things in the ocean
- Layer 2 (VFX) is bright, transient, additive — energy events
- Layer 3 (HUD) is crisp, informational — the cockpit

The contrast between messy substrate and clean overlay IS the aesthetic. It's what makes the game look like nothing else.

### What to Explore Monday

This is a visual direction, not a locked spec. Monday's parallel experiments should test:
- Do clean vector entities on top of ASCII look good, or too jarring?
- If jarring: render entities as ASCII-styled glyphs but still on the overlay layer (separate from substrate, same visual language)
- Does the entity layer need transparency/blend modes to sit naturally?
- How much substrate disturbance is enough? Subtle eddies or dramatic flow warping?

---

### Key Takeaways for Implementation

1. **Ship = glyph, not sprite.** `>` or `▶` at most. Identity through trail and color, not detail.
2. **Wells = landscape features.** The void center should be a dominant visual — the biggest dark region on screen. The accretion ring should be the densest, hottest ASCII on screen.
3. **Waves = terrain, not obstacles.** They should extend beyond what fits on one screen. The player surfs along them, not over them.
4. **Inhibitor = wrongness, not a character.** Math symbols, equation fragments, characters from a different alphabet. The corruption spreading ahead of it is as important as the entity itself.
5. **Color hierarchy:** void=black, deep space=dark blue, waves=teal/amber gradient, wells=hot amber/red, wrecks=gold, portals=cyan-green, ship=white, Inhibitor=magenta/hot pink.
