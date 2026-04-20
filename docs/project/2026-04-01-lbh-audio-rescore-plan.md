# LBH Audio Rescore Plan

> **For Hermes:** treat this as a top-to-bottom audio direction and prototype plan, not a narrow implementation ticket.

**Goal:** Rescore Last Singularity so its SFX, world audio, and music answer the game’s ASCII-first visual identity: sparse field, directional shimmer, scanline grit, gravitational dread, and hard moments of signal ignition.

**Architecture:** Replace the current SNES-flavored default reading with a stricter sonic grammar built around three interacting layers: **field hum** (the dead universe), **readability signals** (movement, danger, reward, extraction), and **rupture states** (merge, inhibitor, collapse, death). The audio should read like ASCII physics made audible: directional, sparse, high-contrast, and legible at the edge of noise.

**Tech Stack:** Raw Web Audio API in `src/audio.js`, existing LBH audio workbench (`tools/audio_workbench.py`), local preview renders for review, no middleware.

---

## What is working

- The current design docs already understand that **the universe is the instrument**.
- `docs/design/AUDIO.md` correctly separates **engine/canvas** from **timbre/paint**.
- The current system values **procedural logic over decorative soundtracking**.
- The ASCII/flow docs point to the true north star: **the visuals are directional, sparse, emergent, and physical**.
- The signatures system implies different run personalities; audio should cash that out more strongly than it currently does.

## What is clashing

- The live engine in `src/audio.js` is described as **SNES-flavored**. That gives a coherent filter chain, but it over-anchors the whole game to retro-console warmth.
- LBH’s visual identity is not merely retro. It is **scanline void + physics glyph + cosmic abrasion**.
- Several event sounds read as competent placeholders rather than part of a single universe.
- The current palette leans a little too smooth and unified where the visuals imply **thin signal, directional scrape, and dangerous contrast**.
- Reward, threat, and world-floor are not yet separated sharply enough in emotional role.

## What is missing

- A **single sonic grammar** that maps ASCII density, direction, and shimmer into audio behavior.
- A stronger distinction between:
  - world floor
  - player agency
  - navigational promise
  - hostile interruption
  - cosmic rupture
- A cue strategy for **extraction / collapse / signature-specific world identity**.
- A more deliberate use of **silence, narrow-band signal, and transient emptiness**.

---

# Rescore Thesis

LBH should sound like:
- a dying signal field,
- a physical flow map,
- a universe that sings through strain rather than through melody-first scoring.

The player should hear:
- **direction** in motion,
- **weight** in gravity,
- **distance** in emptiness,
- **hope** as a thin bright structure,
- **wrongness** as intrusion into the established harmonic order.

This is not lush synthwave, not SNES homage, not cinematic sludge.
It is **grit, void, line, pulse, drift, spark**.

---

# New Sonic Pillars

## Pillar 1: ASCII is not texture, it is notation
Translate visual rules into sound rules:
- **Sparse cells / dark space** → more silence, noise floor, distant filtered hum.
- **Dense glyph clusters** → brighter harmonic congestion, clipped overtone spray.
- **Directional flow** → stereo motion, filter sweeps, repeated transient tilt.
- **Shimmer** → probabilistic flicker in harmonics and short spectral glints, not constant chorus wash.

## Pillar 2: The world floor should feel thin, not padded
The current world bed should lose some blanket-like continuity.
Use:
- sub-bass drone
- mid-band dust/noise
- faint harmonic line
- occasional signal glint

Avoid turning the whole world into one comfortable ambient bed.

## Pillar 3: Reward must be bright because the world is not
Loot, scan, extraction, and successful route moments should feel like **signal coherence appearing inside entropy**.
Not cute. Not arcade candy. More like:
- crystalline line-up
- narrow harmonic alignment
- short, clean voltage

## Pillar 4: Danger should interrupt the grammar, not just get louder
Hostile states should not merely increase intensity. They should:
- destabilize pitch certainty
- roughen transients
- narrow the mix
- introduce wrong beating or ring-mod edges

## Pillar 5: Death should be subtraction before final collapse
Death is strongest if the mix **thins, buckles, and loses structure** before the final down-pitch and silence.

---

# Top-to-Bottom Rescore Pass

## 1. World Floor / Ambient System

### Target
A three-band universe bed:
1. **void floor** — low sine/sub mass, nearly tactile
2. **signal dust** — filtered noise / scan shimmer, very low level
3. **harmonic line** — a thin unstable tone that tracks run phase / signature

### Implementation note
Refactor the current drone to be less “retro pad” and more “field condition.”

### New behavior
- Early run: more empty space than sound.
- Mid run: directional shimmer and beating intensify.
- Late run: harmonic line roughens, sidebands appear, low end thickens.
- Collapse states: world bed narrows and becomes strained, not just louder.

---

## 2. Wells / Gravity Audio

### Current issue
The concept is strong, but the live feel risks reading as merely low synth presence.

### Rescore direction
Wells should sound like **mass warping local notation**.

### Sound design rules
- Keep pitch-from-mass.
- Add subtle inharmonic sidebands and beating tied to nearby competing masses.
- Use stereo asymmetry and slight band-limited grit so wells feel carved, not smooth.
- Close wells should create a sensation of **gravitational teeth** — interference, not just harmony.

### Result
The player hears not “ambient synth note,” but “this region is bent.”

---

## 3. Stars / Radiation / Luminous Bodies

### Direction
Stars should be less like cousins of wells and more like **irradiated vertical glare**.

### Sound design
- thinner triangle/bright partial structure
- higher spectral centroid
- more flicker than sustain
- a faint corona hiss

Stars should feel visually consistent with bright ASCII cores and vertical signal bleed.

---

## 4. Movement / Thrust / Drift

### Direction
Movement audio should teach flow direction and cost.

### Thrust family
- **thrust on**: ignition click + compressed air/noise bite
- **thrust sustain**: narrow band engine strain, responsive to thrust intensity
- **thrust off**: pressure collapse, brief downward recoil

### Drift / surfing feedback
Add a subtle non-literal flow cue layer:
- faster currents = more pronounced directional hiss / tilted shimmer
- correct surfing feels smoother and more laminar
- fighting the current creates noisier friction

This is where the ASCII flow-field becomes audible.

---

## 5. Scavengers / Hostile Presence

### Direction
Scavengers should feel like **another machine handwriting itself into your channel**.

### Rules
- player thrust family, but thinner / meaner / more clipped
- slight instability in pitch or filter center
- distance gating stays strict so they remain a presence that appears, not wallpaper

### Emotional target
Not monster roars. Not drones. **Competing intent in the same dead medium.**

---

## 6. Portals / Navigation / Promise

### Direction
Portals are not warmth in a fantasy sense. They are **coherent structure**.
They should sound like something in the universe is briefly making sense.

### Sound design
- pulse + shimmer lattice
- more harmonic stability than the rest of the world
- brighter top-end than wells, but still thin and spatial
- extraction build should feel like a narrow beam widening into release

---

## 7. Loot / Reward / Scan

### Direction
Current reward ideas are on the right track but can be more specific.

### Loot
- short crystalline chirp cluster
- not cheerful major-key game juice
- more “found signal lock” than “coin pickup”

### Scan / information sounds
- data-pulse chirps
- tiny clustered offsets
- spectral cleanliness against the dirty world

---

## 8. Merge / Pulse / Catastrophic Events

### Direction
These need to be the moments where the whole system admits violence.

### Force pulse
- transient crack
- traveling body if feasible later
- heavy ducking and temporary spectral thinning of the whole mix

### Well merge
- pre-merge pitch attraction
- impact transient with low-end compression
- short deformation of world bed afterward

These are score-shaping events, not only SFX.

---

## 9. Inhibitor / Wrongness Layer

### Direction
The inhibitor should violate the established grammar.

### Rules
- ring-mod / irrational ratios
- square-edge contamination
- less stereo openness
- progressively suppress normal readability and replace it with coercive narrowband wrongness

### Emotional target
Not generic horror. **The universe’s notation has been overwritten.**

---

## 10. Music Strategy

## Recommendation: Hybrid procedural score
LBH should not become cue-driven in a traditional sense, but it does want authored macro-shape.

### Keep procedural
- world bed
- wells
- portals
- hostile proximity
- corruption layers

### Add authored/semiauthored cue logic for:
- title
- extraction threshold
- collapse state
- death resolution
- signature-specific flavor overlays

### Why
The ASCII-first visual identity is too structural for a fully detached score, but the game still needs memorable inflection points.

---

# Signature-Driven Music Overlays

Each cosmic signature should bias the audio field.

## the slow tide
- longer tails
- softer shimmer
- lower event density
- more space between signals

## the shattered merge
- faster onset activity
- more beating and catastrophic punctuation
- harsher well interference

## the thick dark
- heavier low-mid occlusion
- slower movement articulation
- more oppressive field noise

## the graveyard
- sparse threats, brighter loot signals
- more lonely resonance

## the rush
- shorter portal phrases
- quicker UI/reward phrasing
- more forward pressure in timing

## the deep
- larger silence spans
- stronger distance impression
- less frequent but more consequential signal events

---

# Sample Prototype Set for Review

Create three prototype renders before implementation changes.

## Sample A — `void-floor-scanline`
Purpose: new world bed

Should demonstrate:
- sub drone
- sparse scan noise
- unstable harmonic line
- emptiness as a feature

## Sample B — `gravity-teeth`
Purpose: well/interference danger language

Should demonstrate:
- pitch-from-mass feel
- beating/interference
- harshened partials
- local dread without full collapse

## Sample C — `extraction-spark`
Purpose: reward / coherence / route promise

Should demonstrate:
- narrow bright harmonic alignment
- portal promise
- hopeful but not soft
- clean signal emerging from dirt

Optional fourth sample later:
- `inhibitor-override`

---

# Implementation Plan

### Task 1: Document the target palette
**Objective:** Turn this rescore into a stable review artifact.

**Files:**
- Create: `docs/project/2026-04-01-lbh-audio-rescore-plan.md`

**Verification:**
- Review document includes what is working / clashing / missing and event-family redesigns.

### Task 2: Create review prototypes
**Objective:** Render a small set of WAVs that embody the new direction.

**Files:**
- Create: `tmp/audio-rescore-review/void-floor-scanline.wav`
- Create: `tmp/audio-rescore-review/gravity-teeth.wav`
- Create: `tmp/audio-rescore-review/extraction-spark.wav`
- Create: `tmp/audio-rescore-review/README.md`

**Verification:**
- All files render locally.
- Each file demonstrates a distinct rescore pillar.

### Task 3: Review and choose the keeper grammar
**Objective:** Decide what survives into implementation.

**Review prompts:**
- Does the world bed feel too full or properly sparse?
- Do wells feel massive or merely synthy?
- Does extraction feel coherent without becoming sentimental?
- Does the score answer the ASCII look directly enough?

### Task 4: Rewrite live engine direction before code surgery
**Objective:** Update the design docs / implementation targets before major engine edits.

**Files:**
- Modify later: `docs/design/AUDIO.md`
- Modify later: `docs/design/MUSIC.md`
- Modify later: `src/audio.js`

**Verification:**
- New palette decisions map cleanly onto current engine categories.

### Task 5: Implement in slices
**Objective:** Rework the live engine in safe layers.

**Recommended order:**
1. world floor / drone rewrite
2. well / star separation
3. thrust + drift feedback
4. loot / scan / portal reward family
5. merge / pulse / collapse events
6. signature-specific overlays
7. inhibitor layer

---

# Review Criteria

A successful rescore should make LBH sound:
- less like a retro synthesis demo,
- more like a physical dead universe written in glyphs,
- more readable under pressure,
- more emotionally singular.

If the result is prettier but less legible, it failed.
If it is louder but not more inevitable, it failed.
If it sounds cool but not like **this game**, it failed.
