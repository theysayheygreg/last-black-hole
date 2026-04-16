# Gradient-Bang Analysis: Renderer Architecture Options for LBH

> Companion to GRADIENT-BANG-REFERENCE.md.
> That doc inventories what exists in gradient-bang/starfield. This one analyzes what LBH should do about it, given the architectural pain we've been accumulating.
>
> Intended audience: Codex, for implementation planning. Orrery wrote the analysis; Greg will direct from here.

---

## Summary

LBH's renderer is deliberately flat — fluid sim, ASCII post-pass, canvas overlay, three layers. The flatness was correct for the jam and carried through post-jam. It is now the primary blocker on visual ambition: every recent feature has been compromised by the pipeline's inability to compose effects.

Gradient-bang's starfield library demonstrates a richer visual pipeline via scene graph + post-processing chain. We cannot import that library directly. The question is whether to adopt its architecture, adopt a subset, or stay flat.

Five options are on the table, ranging from "do nothing" to "full Three.js rewrite." A hybrid approach — keep the fluid sim as-is, wrap the compositor in a scene graph — is the most likely fit if we want to move.

---

## Current Renderer Shape

```
fluid sim (WebGL 2, hand-rolled Navier-Stokes)
    ↓  [texture]
ASCII shader (WebGL 2, custom glyph atlas + density mapping)
    ↓  [canvas]
2D overlay (ctx.fillText / fillRect / drawImage)
    ↓  [to screen]
DOM HUD (index-a.html panels, CSS)
    ↓  [on top]
```

Four conceptual layers, one rendering path. The ASCII shader consumes ONLY the fluid texture. The canvas overlay sits on top of the ASCII output. The DOM HUD sits on top of the canvas. No other composition is possible without reworking the pipeline.

**Key constraints baked into the current architecture:**
- The ASCII shader cannot accept additional input textures without modification.
- There is no render-target pool. Every frame is one pass to one target.
- Scene transitions are implemented as a hardcoded glitch effect inside the ASCII shader (uniform `u_glitchIntensity`).
- Post-effects (scanlines, tints, exposures) do not exist as a chain — each has to be hand-wired.
- "Layers" are conventions (simulation vs annotation), not enforced.

---

## Concrete Pain Catalog

Features shipped in the last two months that fought the pipeline. Each row is a case where the flatness forced a shippable but compromised implementation.

| Feature | Intended | Shipped | Why compromised |
|---|---|---|---|
| Phantom (unexplained visual) | A density cluster quantized by the ASCII pass, so it reads as "in the world" | 5-glyph 2D overlay drawn on top of the ASCII canvas | ASCII shader consumes only the fluid texture; no path to inject density |
| Echo wreck halo | A magenta signal-leak aura read by the ASCII pass as density | Radial gradient stuck on top of the ASCII output | Same reason; halos read as stickers, not emanations |
| Inhibitor edge-dim | Global color warp toward inhibitor magenta, applied at shader level | Radial gradient overlay at 55% alpha on the 2D canvas | No uniform path for global color modulation |
| Death screen linger | Exposure ramps down from the inside — pilot's visor failing | Overlay alpha ramps up from the outside | No exposure hook; the black curtain reads as game-over, not pilot failure |
| Loading screen | Fluid dims to near-static while "dropping in" text resolves | Fluid runs at full intensity; text floats above | No way to ramp the simulation's luminance output |
| Signal zone visualization | Signal manifests as a field around the ship affecting shader warmth | 4px bar in the HUD | Signal is a per-player number; no shader input for "player signal density" |
| Cosmic signatures | Each signature has a visible palette — dark run actually looks darker, signal storm actually looks loud | Coefficient bundles that slightly tweak physics; no visual difference | No tint pass, no palette system, no material variation |
| Scene transitions | Rich vocabulary — hyperspace for jumps, dissolve for death, slow fade for extraction, glitch for inhibitor wake | Single "dimensional tear" glitch effect reused for all transitions | One uniform, one effect, one feel |

Pattern: each new visual feature costs approximately its design complexity *plus* the cost of inventing a one-off compositing strategy because the pipeline has no composition primitives.

---

## The Five Options

### Option 1 — Stay flat

Accept the aesthetic ceiling. Write every future visual as either:
- Additional uniforms in the ASCII shader (modulating existing output)
- 2D canvas overlay (above the ASCII)
- DOM HUD element (above the canvas)

Any effect that requires multiple inputs, z-ordering, offscreen rendering, or global modulation is off the table.

**Preserves:**
- Current pipeline legibility (3 files tell the whole story)
- No-build-step invariant (HTML imports ES modules directly)
- No framework dependency
- All existing testing infrastructure
- Fluid sim performance profile

**Does not solve:**
- Any pain point in the catalog above
- Portability of gradient-bang shaders (can't chain them)
- Future scene transition vocabulary

**Risk:** every new visual feature continues to cost 50-100% more than its design complexity. This compounds.

### Option 2 — Hand-rolled multi-pass pipeline

Build a `Pipeline` class in vanilla WebGL 2 that manages:
- A pool of render targets (ping-pong buffers)
- A chain of passes, each reading from a target and writing to another
- Per-pass uniforms and shader binding
- Debug hooks (pause-at-pass, target inspection)

Effects become composable: `pipeline.add(fluidPass)`, `pipeline.add(nebulaPass)`, `pipeline.add(asciiPass)`, `pipeline.add(exposurePass)`. Scene layer ordering is still hand-coded but ordering is enforced by the pass list.

**Preserves:**
- No external dependency
- No build step (still a vanilla WebGL module)
- Full control over render-target management
- Existing tests stay green (fluid sim unchanged)

**Adds:**
- A small internal framework (~400 LOC estimate, may be off)
- Render-target pooling logic that will have bugs

**Solves:**
- Post-effect composition (can chain nebula, scanline, sharpen, tint, etc.)
- Portability of gradient-bang shader source (strip the Three.js wrappers, keep the GLSL)
- Inhibitor global color warp (as a tint pass)
- Death screen exposure ramp (as an exposure pass)
- Loading fluid dim (as an exposure pass gated on gamePhase)
- Cosmic signature palettes (as tint pass configured per signature)

**Does not solve:**
- Z-depth layering (everything is still one target at a time; "scene layers" are still conventions)
- Phantom "in the world" problem (ASCII pass still consumes only fluid texture)
- Halos quantized by ASCII (same reason)
- Animation primitives (still hand-coded tweens)

### Option 3 — Minimal WebGL helper library

Adopt `regl` or similar. These are declarative WebGL utility layers, NOT scene graphs. They handle shader compilation, render targets, and pass composition without imposing hierarchy.

**Preserves:**
- No scene graph lock-in
- Most of the no-framework feel
- Single ES module import (regl is ~60KB minified)

**Adds:**
- One small dependency
- A different API style (declarative passes rather than imperative WebGL calls)

**Solves:**
- Same surface as Option 2, but with less boilerplate
- Render-target management is library-provided, fewer bugs

**Does not solve:**
- Scene graph problems (no z-depth, no camera)
- Animation primitives
- Anything gradient-bang's scene graph does

Effectively the same capability as Option 2, traded against external dependency for less custom code.

### Option 4 — Hybrid: fluid sim stays vanilla, compositor becomes a scene graph

The fluid sim renders to a texture the same way it does today. That texture becomes a plane in a scene graph (Three.js or equivalent). Everything else — ASCII post-pass, nebula background, star field, overlay, HUD layer — lives in the scene graph.

```
fluid sim (unchanged, renders to texture)
    ↓  [fluid texture]
Three.js scene:
  skybox layer: static nebula (pre-baked)
  background layer: star field (particle system)
  world layer: full-screen quad sampling fluid texture
  ascii layer: post-pass converting world layer to ASCII
  overlay layer: canvas-like quad for HUD visuals
Three.js postprocessing chain:
  exposure pass → tint pass → scanline pass → dither pass
    ↓  [to screen]
DOM HUD (unchanged, on top)
```

**Preserves:**
- Fluid sim: untouched, same performance, same feel
- Existing fluid sim tests stay green
- Existing HUD (DOM) stays untouched
- Hand-tuned controls and physics unchanged

**Adds:**
- Three.js dependency (~150KB minified, or a similar WebGL-native scene graph library)
- Build step likely required (Vite or esbuild, bundler of choice)
- `index-a.html` changes from loose ES modules to a bundled module

**Solves:**
- Z-depth layering (skybox behind world behind overlay, real ordering)
- Phantom "in the world" (render phantom as a density contribution BEFORE the ASCII post-pass, ASCII reads it as world)
- Halos quantized by ASCII (same reason — any 2D draw that feeds into ASCII becomes world)
- Inhibitor global color warp (tint pass with uniform)
- Death screen exposure ramp (exposure pass)
- Loading fluid dim (exposure pass gated on gamePhase)
- Signal visual field (additional texture input to ASCII pass, modulating warmth)
- Cosmic signature palettes (tint pass configured per signature)
- Scene transitions (animation controllers, multiple transition effects)
- Portability of gradient-bang shaders (they're already written for this architecture)
- Animation primitives (springs, tweens, lifecycle)

**Does not solve:**
- "No framework" invariant (that's the trade)
- Build step (that's the trade)
- Risk that the fluid-as-plane integration has unexpected color-space or DPR issues at the scene-graph boundary

**Key insight:** we use maybe 20% of Three.js. But that 20% — scene graph, post-processing chain, animation primitives — is the exact 20% that addresses the pain catalog.

### Option 5 — Full rewrite, fluid sim as a Three.js ShaderPass

Everything becomes Three.js. The fluid sim is rewritten as a `ShaderPass` inside a Three.js `EffectComposer`. Match gradient-bang's architecture fully.

**Preserves:**
- Ultimate consistency with a known-good reference architecture
- Full access to Three.js ecosystem (postprocessing, three-stdlib, R3F if desired)

**Risk:**
- The hand-tuned fluid sim's feel is the result of specific WebGL 2 choices (texture formats, blending, iteration counts). Translating those to Three.js materials risks regression.
- The sim's performance profile is the result of exactly the shader calls it makes. A Three.js pass wrapper could change that.

**Why we probably wouldn't pick this:**
- Pillar #1 ("Art Is Product") means the fluid sim IS identity. Rewriting it means spending effort to *get back to where we are* before we can move forward. Option 4 skips that step.

---

## Tradeoff Matrix

What each option actually solves:

| Pain point | O1 stay flat | O2 vanilla pipeline | O3 regl | O4 hybrid | O5 full 3D |
|---|---|---|---|---|---|
| Phantom "in the world" | no | no* | no* | yes | yes |
| Halos quantized by ASCII | no | no* | no* | yes | yes |
| Inhibitor global color warp | partial (uniforms) | yes | yes | yes | yes |
| Death exposure ramp | no | yes | yes | yes | yes |
| Loading fluid dim | no | yes | yes | yes | yes |
| Signal as visual field | no | partial | partial | yes | yes |
| Signature palettes | partial (uniforms) | yes | yes | yes | yes |
| Scene transition vocabulary | no | partial | partial | yes | yes |
| Gradient-bang shader reuse | no | yes (port) | yes (port) | yes (port) | yes (port) |
| Z-depth layering | no | no | partial | yes | yes |
| Animation primitives | no | no | no | yes | yes |

(*) O2 and O3 solve the "inject density into ASCII" problem IF we modify the ASCII shader to accept a second texture input. That is possible but is itself a refactor. O4 solves it naturally because pre-ASCII layers render into the same target the ASCII pass consumes.

---

## The Validation Prototype

If any option above needs further proof, the cheapest test is a throwaway branch that builds the title screen in Option 4 (hybrid). Requirements:

1. Keep the fluid sim module as-is. Render to an offscreen texture instead of directly to the screen.
2. Set up a Three.js scene with a full-screen quad sampling that texture.
3. Apply the existing ASCII shader as a ShaderPass.
4. Add one gradient-bang steal: the nebula background as a skybox layer behind the world quad.
5. Add a post-pass chain: exposure → tint.
6. Wire the title screen to use this path; gameplay continues to use the existing path.

Success criteria:
- Visual parity with the current title screen (fluid and ASCII look the same)
- Frame rate within 10% of current
- Nebula layer visibly behind the fluid/ASCII without breaking the ASCII feel
- Tint pass can shift the title screen color register on demand

Failure criteria (back out):
- ASCII loses its tight velocity-driven character mapping
- Frame rate drops below 60fps on integrated GPUs
- DPR or color-space issues at the scene-graph boundary
- Bundle size exceeds reasonable bounds for a browser game (~500KB gzipped for the framework layer)

If the prototype succeeds on the title screen, extend to the full game in a second pass. If it fails, we have evidence for Option 2 or Option 3 instead. Either way, we learn.

---

## Design Pillar Implications

PILLARS.md §1 "Art Is Product" is the pillar that justifies this entire question. It says visual identity is not polish — it IS the thing being built. That pillar argues FOR investing in a better visual pipeline, not against.

PILLARS.md §5 "Dread Over Difficulty" depends on visual storytelling (phantom, halos, exposure, scene transitions) — all of which the current pipeline compromises. A better compositor is directly in service of this pillar.

CLAUDE.md's "no build step unless forced" was a jam constraint. Post-jam, we have `stack.js`, an Electron app, Python tools, nightly CI, and a full test harness. The spirit of that rule (keep it simple) is already in negotiation with the reality of what LBH has become. The question is whether a build step for the browser client is now *forced* by the aesthetic ambition.

---

## Open Questions for Greg

1. **Is the pain architectural (hard to extend) or aesthetic (can't look the way you want)?** They lead to different answers. Architectural pain is fine with Option 2 or 3. Aesthetic pain needs Option 4 or 5.

2. **Is "no framework" a retirement-age rule, or still load-bearing?** If still load-bearing, Option 2 is the ceiling. If retirement-age, Option 4 opens up.

3. **How much does the "any agent can edit any file" value matter?** A scene graph introduces abstractions that some agents will fight. The payoff is consistency; the cost is learning curve.

4. **Is there a specific feature on the horizon that forces the choice?** Meta-loop UI, hologram inspection screens, signature-driven visuals — any of these could tip the scales toward Option 4.

5. **What does the validation prototype need to prove for Greg to commit?** Visual parity at the title screen + working nebula layer might not be enough. Should the prototype also demonstrate a phantom that renders "in the world" via the ASCII post-pass? That would prove the architectural claim most directly.

---

## See Also

- `GRADIENT-BANG-REFERENCE.md` — what exists in gradient-bang (inventory)
- `DESIGN-SYSTEM.md` §8 — animation and scene-transition specifications
- `PILLARS.md` §1 — Art Is Product
- `CLAUDE.md` — current architectural constraints (build step, framework, testing)
- `docs/journal/DECISION-LOG.md` — where the decision from this analysis should land once made
