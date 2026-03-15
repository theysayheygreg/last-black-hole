# Pre-Monday Research & Prep

> No code until 12:01a Monday March 16. Everything here is research, reference collection, and design decisions.

---

## Fluid Sim Research

### Must-Read Sources
- [ ] [PavelDoGreat/WebGL-Fluid-Simulation](https://github.com/PavelDoGreat/WebGL-Fluid-Simulation) — fork this. Understand the shader pipeline: `splat → curl → vorticity → divergence → pressure → gradient subtract → advection`
- [ ] GPU Gems Chapter 38 (Jos Stam, "Stable Fluids") — the algorithm behind it
- [ ] Understand how to inject forces at arbitrary positions (this is how gravity wells work)
- [ ] Understand how to read velocity at a world position (this is how the ship surfs)
- [ ] Understand viscosity parameter — we need to increase it over the run

### Key Questions to Answer
- How does the existing sim handle boundaries? (We need wreck obstacles)
- What's the performance ceiling on a 256×256 grid with the ASCII post-process on top?
- Can we add a second data channel (wave equation) without doubling GPU cost?
- How do we sample fluid velocity at an arbitrary point from JavaScript? (readPixels? Separate small FBO?)

---

## ASCII Shader Research

### Font Atlas Preparation
- [ ] Select monospace font for the ASCII characters (JetBrains Mono or similar)
- [ ] Generate a texture atlas: grid of all ASCII glyphs we'll use
- [ ] Characters needed: `. : ; - = + * # % @ ~ | / \ ! > < ( ) [ ] { } ○ ◇ ▶ █ ▓ ▒`
- [ ] Plus directional variants: `═ ║ ╱ ╲ ≡ ‖`
- [ ] Atlas layout: 16×8 grid (128 characters), each glyph in an N×M pixel cell

### Shader Architecture
- [ ] Study `pmndrs/postprocessing` ASCIIEffect — our recommended starting point
  - `src/effects/ASCIIEffect.js` — effect config, cell size, color modes
  - `src/effects/glsl/ascii.frag` — the actual GLSL shader
  - `src/textures/ASCIITexture.js` — glyph atlas generation (1024×1024, 16×16 grid)
- [ ] Study the fragment shader approach: pixelate UVs → sample luminance → atlas lookup → color multiply
- [ ] Plan the velocity-to-direction extension (not in pmndrs — we add this)
- [ ] Evaluate braille characters (U+2800-U+28FF) for fluid density layer vs ASCII for entities

### References
- [ ] [pmndrs/postprocessing ASCIIEffect](https://github.com/pmndrs/postprocessing) — production-ready WebGL ASCII shader
- [ ] [SHL0MS ASCII dithering](https://x.com/SHL0MS/status/2032619306689720726)
- [ ] [Hermes ASCII Video Skill](https://github.com/NousResearch/hermes-agent/tree/main/skills/creative/ascii-video) — multi-density grids, 38 shaders, feedback buffers (Python, concepts port to GLSL)
- [ ] [davidedc/Ascii-fluid-simulation-deobfuscated](https://github.com/davidedc/Ascii-fluid-simulation-deobfuscated) — CPU ASCII fluid (reference, not for use)
- [ ] ShaderToy "ascii" search for additional implementations
- [ ] Three.js AsciiEffect (DOM-based, NOT suitable for game — reference only)

---

## UI/HUD Research

### nerv-ui Evaluation
- [ ] Clone/read [TheGreatGildo/nerv-ui](https://github.com/TheGreatGildo/nerv-ui)
- [ ] Identify which CSS we can lift directly
- [ ] Plan CRT effect implementation (CSS filter vs canvas overlay)
- [ ] Test font options: Chakra Petch, Orbitron, JetBrains Mono

### HUD Layout Mockup
- [ ] Sketch panel positions (corners + center warning zone)
- [ ] Define all warning messages and their trigger conditions
- [ ] Plan the degradation stages (how does each CSS property corrupt?)

---

## Sound Research

### Synthesis Reference
- [ ] Web Audio API oscillator types and their characteristics
- [ ] Tone.js — do we need it or is raw Web Audio sufficient?
- [ ] Study: what does a gravitational wave "sound like"? (LIGO chirp as reference)
- [ ] Plan the ambient drone: what parameters change as the universe dies?

### Sound Palette
- [ ] Thrust sound: filtered noise, what filter parameters?
- [ ] Well hum: which oscillator type? Sine? Triangle?
- [ ] Inhibitor sound: how to create "wrongness" in audio? (frequency modulation, bit crushing, reverb feedback?)

---

## Asset Prep (Can Do Now)

### Color Palette
```css
:root {
  /* Background */
  --void: #000011;
  --deep-space: #000033;

  /* HUD Colors (NERV scheme) */
  --hud-bg: #000053;
  --nominal: #58F2A5;
  --warning: #F0903A;
  --critical: #E81900;
  --data: #54A2D4;

  /* Entity Colors */
  --player: #E8E8E8;
  --scavenger-passive: #A8D86E;
  --scavenger-hostile: #F0903A;
  --wreck-fresh: #D4A843;
  --wreck-looted: #555555;
  --portal-active: #58F2A5;
  --fauna: #B8D4E8;
  --inhibitor: #FF2D7B;
  --well-ring: #FF6B35;

  /* Fluid Temperature Gradient */
  --temp-cold: #1a1a4e;
  --temp-cool: #2a4a6e;
  --temp-warm: #8a5a2a;
  --temp-hot: #cc4411;
}
```

### Word Lists for Procedural Generation

**Civilization name components:**
```
Prefixes: Ascending, Hollow, Silent, Burning, Crystalline, Fractal,
          Recursive, Terminal, Inverted, Resonant, Collapsed, Woven,
          Prismatic, Eternal, Forgotten, Nth, Zero-Point

Suffixes: Chorus, Archive, Lattice, Communion, Engine, Manifold,
          Covenant, Orchestra, Theorem, Meridian, Recursion, Axiom,
          Tesseract, Helix, Directive, Confluence, Singularity
```

**Death causes:**
```
dimensional transit failure, entropy cascade, inhibitor contact,
self-annihilation (theological schism), vacuum decay exposure,
gravitational resonance collapse, dark energy overcorrection,
information paradox breach, timeline bifurcation error,
heat death acceptance (voluntary), stellar engineering accident,
quantum observation catastrophe, brane collision,
false vacuum nucleation, chronological feedback loop
```

**Ship class names:**
```
Surveyor, Remnant-Walker, Horizon-Singer, Drift-Lancer,
Wake-Cutter, Void-Tender, Signal-Ghost, Tide-Runner,
Wave-Breaker, Entropy-Diver, Flux-Dancer, Null-Skipper
```

---

## Day-of Scaffold (Monday 12:01a)

What to build first, in order:

1. **HTML file** with fullscreen canvas + HUD container div
2. **WebGL context** + fluid sim shaders (fork PavelDoGreat)
3. **Single gravity well** injecting force into fluid
4. **Ship triangle** + mouse-thrust controls
5. **Ship reads fluid velocity** → adds to its own velocity
6. **Drift when not thrusting** → feel the current
7. **Does surfing feel good?** If yes → Layer 1. If no → tune physics.
8. **ASCII post-process shader** → apply over the fluid sim
9. **Does it look right?** If yes → entities. If no → tune character mapping.

Everything else is Layer 1+ and can wait.
