# Visual Density Buffer Architecture

> What it is, who uses it, what broke, what could break next.
> Written after removing star clearing splats (2026-03-25).

## What It Is

A single RGB float texture (256x256), double-buffered. Stores cosmetic-only density that doesn't affect fluid physics. Fades at 0.92x per frame (~1 second persistence). Systems inject color via `fluid.visualSplat()`, and the display shader reads it to boost brightness/color in the accretion band.

## Who Writes

| System | RGB values | Splats/frame | Purpose |
|--------|-----------|-------------|---------|
| Stars | [0.2, 0.19, 0.12] (core) | ~7/star | Bright core glow |
| Wrecks | [0.04, 0.03, 0.01] (gold) | 1/wreck | Position marker |
| Loot | [0.006, 0.012, 0.015] (cyan) | 5/piece | Shimmer |
| Portals | [0.006-0.016, ...] (purple) | ~76/portal | Spiral arms |
| Planetoids | [0.03, 0.04, 0.05] (blue) | 5/planetoid | Trail |
| **Wells** | **nothing** | **0** | Rings are analytical in shader |

Total budget at full game state: ~300-400 splats/frame.

Notably: **well accretion rings don't use visual density at all.** They're computed analytically from shape data and mass in the display shader. The visual density buffer provides `ringSignal` which acts as a *boost* on top of the analytic ring — it doesn't create the ring.

## Who Reads

The display shader splits the buffer:

```glsl
vec3 posVis = max(visDens, vec3(0.0));      // positive → ring brightness boost
vec3 negVis = max(-visDens, vec3(0.0));      // negative → liveSpace suppression

float ringSignal = 1.0 - exp(-length(posVis) * 0.06);
float voidField = 1.0 - exp(-max(negVis.r, negVis.g, negVis.b) * 3.5);
float liveSpace = 1.0 - voidField;
```

`liveSpace` multiplies all per-well ring/halo/horizon contributions. If negative density accumulates, entire wells go dark.

## What Broke

Stars injected `-0.2` per tick as a "clearing bubble." This accumulated frame-over-frame in the visual density buffer, driving `liveSpace` toward zero near stars. Wells within ~0.7 world units of a star (W0 and W2 on the 3x3 map) had their accretion visuals completely suppressed.

**Root cause:** A single shared buffer with competing additive and subtractive signals. The subtractive signal (star clearing) was persistent and had no ceiling — it grew without bound relative to the fade rate.

**Fix:** Removed the negative splat. The star's physics push already creates a natural low-density clearing zone.

## Current State (Post-Fix)

The buffer is now **purely additive** — no system injects negative values. The `negVis` / `voidField` / `liveSpace` path in the shader is effectively dead code (voidField is always 0, liveSpace is always 1).

## Remaining Cross-Talk Risks

Low, but worth monitoring:

1. **Portal spirals near wells** — 76 splats/portal during active waves could spike `ringSignal`, making ring brightness noisy as portals spawn/die. Not suppressive, just visually jumpy.

2. **Planetoid trails near wells** — a planetoid orbiting close to a well for 10+ seconds could create persistent `ringSignal` brightness, making the ring look "always on" instead of dynamic.

3. **No per-entity throttling** — any system that increases splat count (bug or feature) could saturate the buffer. No guard rails.

All of these are additive (too bright, not too dark) — annoying but not game-breaking like the star suppression was.

## Architectural Options

### A: Status quo (recommended for jam)

Keep the buffer purely additive. Monitor during tuning passes. The analytical ring system means wells can't be suppressed by density cross-talk.

**When it breaks:** If a future system needs darkness signals (voids, absorption events, collapse visuals). Don't solve this with negative splats in the shared buffer.

### B: Separate buffers per system

Give wells, stars, and everything-else their own visual density textures. Display shader samples all three.

- Cost: 3x GPU memory (still small at 256x256), 3x fade passes
- Benefit: complete isolation, per-system dissipation rates
- Verdict: **post-jam.** Not worth the complexity during the jam. The analytical ring system already provides most of the isolation we need.

### C: Clear buffer each frame (no accumulation)

Wipe to zero before splats. Each frame is independent.

- Breaks: trails, shimmer persistence, gradual density buildup. Everything would strobe.
- Verdict: **never.** The fade is intentional and creates the game's visual atmosphere.

### D: Tag channels (R=system1, G=system2, B=system3)

Pack different systems into different RGB channels.

- Breaks: color expressiveness. Current splats use all three channels for actual color (cyan loot, purple portals, gold wrecks).
- Verdict: **never.** Wrong tool for the problem.

## Design Rule

**No subtractive signals in the accumulated buffer.** If a future system needs darkness:
- Use the shader's analytical path (like well core masks)
- Or implement option B (separate buffer)
- Never inject negative values into the shared visual density texture

## Tuning Levers

| Knob | Config path | Effect |
|------|------------|--------|
| Fade rate | `fadeVisualDensity(0.92)` | Higher = more persistence, lower = quicker decay |
| Ring signal sensitivity | shader `0.06` | Higher = brighter rings from less density |
| Star core brightness | `CONFIG.stars.coreBrightness` | How bright star glow appears in buffer |
| Portal density rate | `CONFIG.portals.densityRate` | How much portal spirals inject per frame |
| Wreck glow | `CONFIG.wrecks.wreckGlow` | Baseline wreck marker brightness |
