# Audio Implementation — Jam Scope

> What ships for the jam. See MUSIC.md for the full vision.

---

## Philosophy

MUSIC.md designs a fully procedural soundscape where the universe is the instrument. That's the north star. For the jam, we ship the layers that give the most feel per line of code.

**Key principle: the audio engine is a canvas, not a sound.** The engine decides WHAT is audible, HOW LOUD, and FROM WHERE. Sound creation (timbre, synthesis, character) is a separate concern — the paint on the canvas. Different phenomena use different synthesis approaches. Not everything is a sine wave.

Everything is Web Audio API. ZZFX (<1KB) as optional accelerator for prototyping event sounds. No samples.

---

## Architecture: Two Layers

### Layer 1: Audio Engine (the canvas)

Runs every frame. Manages sources, distances, priorities, gains, pans. Doesn't know what anything *sounds like* — just manages the spatial mix.

**Pipeline (per frame):**
```
1. GATHER    — collect all active sources (wells, scavengers, portals, events)
2. DISTANCE  — world-distance from player to each source
3. CULL      — drop sources beyond audible range (per-type max distance)
4. ATTENUATE — distance falloff curve (per-type: inverse, inverse-square, linear)
5. PAN       — stereo position from screen-space X (LittleJS pattern)
6. PRIORITY  — voice limit per category, drop quietest
7. DUCK      — louder phenomena suppress quieter ones
8. OUTPUT    — linearRampToValueAtTime on gain + pan nodes (50ms ramp, no clicks)
```

**Stereo panning model (from LittleJS):**
```javascript
// Screen-space X → stereo pan. Camera-relative, not facing-relative.
const [sx, sy] = worldToScreen(source.wx, source.wy, camX, camY, canvasW, canvasH);
const pan = clamp(sx * 2 / canvasW - 1, -1, 1);  // -1 left, +1 right
```

**Distance models (per source type):**

| Source Type | Max Distance | Falloff | Character |
|-------------|-------------|---------|-----------|
| Well | 2.0 | Inverse (1/d) | Always present, ominous approach |
| Star | 1.5 | Inverse (1/d) | Slightly less presence than wells |
| Scavenger | 0.8 | Inverse-square (1/d²) | Inaudible until close — surprise |
| Portal | 1.2 | Inverse (1/d) | Navigation aid, steady |
| Force pulse | 1.5 | Linear decay | Shockwave: loud at source, fades with ring |
| Planetoid | 0.6 | Inverse-square (1/d²) | Local texture |
| Player events | 0.0 (self) | N/A | Always full volume |

**Voice budget:**

| Category | Max Voices | Notes |
|----------|-----------|-------|
| Wells | 4 | Nearest 4. Others silent. |
| Stars | 2 | Nearest 2. |
| Scavengers | 3 | Nearest 3 within range. |
| Portals | 2 | Nearest 2. |
| Events (one-shot) | 4 | Always play — steal lowest-priority continuous voice if needed. |
| Ambient (drone) | 1 | Always on. |
| **Total** | **~16** | Comfortable for Web Audio. |

**Ducking rules:**

| When this is loud... | ...these get quieter | Amount | Duration |
|---------------------|---------------------|--------|----------|
| Force pulse event | Everything else | -6dB | 0.5s hold |
| Nearby well (<0.3 dist) | Distant wells, stars, scavengers | -3dB | Continuous |
| Player thrust | Ambient layers | -3dB | While thrusting |
| Inhibitor (future) | Everything except drone | -9dB | Continuous, scales with proximity |
| Death event | Everything → silence | Full fade | 1.5s |

**Audio graph:**
```
                          ┌─ WellVoice[0..3] ──────┐
                          ├─ StarVoice[0..1] ───────┤
AudioEngine ─── Mixer ────├─ ScavengerVoice[0..2] ──├─ CategoryGains ─── DuckNode ─── MasterGain ─── Destination
                          ├─ PortalVoice[0..1] ─────┤
                          ├─ EventVoice[0..3] ──────┤
                          └─ AmbientVoice[0] ───────┘
```

Each Voice slot: source node → filter (optional) → GainNode → StereoPannerNode → category GainNode.

### Layer 2: Sound Palette (the paint)

Maps source types to Web Audio synthesis recipes. **Different phenomena use different timbres.** This is where "not everything is a sine wave" lives.

| Phenomenon | Synthesis | Waveform | Why this timbre |
|-----------|-----------|----------|-----------------|
| Wells (gravity) | Oscillator, pitch from mass | **Sine** | Eerie, clean, almost musical. Beating between similar masses. Cosmic. |
| Stars (radiation) | Oscillator, brighter | **Triangle** | Warmer than sine, slightly present. Not as dark as wells. |
| Drone (spacetime) | Oscillator + waveshaper | **Sine → saw blend** | Starts clean, gains harmonics as universe corrupts. The degradation IS the sound design. |
| Thrust | Filtered noise, envelope | **Noise → bandpass** | Jet/engine character. Not tonal. |
| Force pulse | Low oscillator + noise burst | **Sine (40Hz) + noise** | Initial crack (noise), then bass ring-out (sine). C from our discussion. |
| Loot pickup | Staggered oscillators | **Sine** (crystalline) | Clean, rewarding. Contrast with the dark ambient. |
| Scavenger thrust | Filtered noise, quieter | **Noise → bandpass** | Same family as player thrust but thinner/distant. |
| Portal | Pulsing oscillator | **Triangle** | Warm, inviting. The exit is alive. |
| Portal death | Frequency sweep + noise | **Saw → noise** | Something breaking. Descending. Harsh. |
| Death | All sources pitch-ramp down | **All → distorted** | Everything corrupts. Waveshaper drive increases. |
| Inhibitor (future) | Ring modulation | **Square × irrational freq** | Wrong. Alien. Doesn't belong in the harmonic series. |
| Glitch effects (future) | Bitcrushed noise, random gates | **Square / noise** | Digital corruption. Contrast with organic sine world. |

**The timbral arc of a run:**
- Early: clean sines, soft triangle, quiet. The universe hums.
- Mid: more sources active, beating patterns, filtered noise from thrust/scavengers.
- Late: drone gains saw harmonics, wells drop to low frequencies beating against drone, everything thickens.
- Inhibitor: square waves and ring modulation rupture the harmonic world. Audio becomes alien.
- Death: everything distorts and pitch-drops. Silence.

---

## ZZFX for Prototyping

[ZZFX designer](https://killedbyapixel.github.io/ZzFX/) for rapidly auditioning event sounds. Each sound is a 20-parameter array — tweak in the browser GUI, hear instantly, export. At <1KB runtime, we can ship it for one-shot events and hand-roll only the continuous/spatial sounds.

Use ZZFX for: thrust burst, loot chime, portal death, force pulse crack, scavenger pop.
Hand-roll for: drone, well harmonics, portal pulse, death sequence (these need continuous parameter control the engine manages per-frame).

**Reference:** LittleJS `engineAudio.js` for the spatial math pattern (screen-space pan, distance attenuation, voice management).

---

## CONFIG Section

```javascript
audio: {
  enabled: true,
  masterVolume: 0.7,

  // Drone
  droneVolume: 0.15,
  droneBaseFreq: 60,           // Hz, start of run
  droneEndFreq: 35,            // Hz, end of run
  droneDistortion: 0.3,        // waveshaper drive at end of run (0 = clean, 1 = harsh)

  // Well harmonics
  wellHarmonicVolume: 0.12,
  wellBaseFreq: 180,           // Hz at mass 1.0
  wellFreqScale: 0.5,          // freq = baseFreq / (mass * scale)
  wellMaxDist: 2.0,            // world-units

  // Spatial
  scavengerMaxDist: 0.8,
  portalMaxDist: 1.2,
  starMaxDist: 1.5,
  planetoidMaxDist: 0.6,

  // Events
  eventVolume: 0.3,

  // Ducking
  pulseDuckAmount: 0.25,       // multiply other gains by this during pulse (= -6dB)
  pulseDuckDuration: 0.5,      // seconds
  thrustDuckAmount: 0.7,       // -3dB on ambient while thrusting

  // Voice limits
  maxWellVoices: 4,
  maxScavengerVoices: 3,
  maxEventVoices: 4,
}
```

---

## Resolved Decisions (2026-03-20)

1. **Timbre per phenomenon, not one waveform for everything.** Sine for wells (cosmic), triangle for stars/portals (warm), noise for thrust (mechanical), square/ring-mod for Inhibitor/glitch (alien). The timbral palette has an arc: clean sine world → corrupted saw/square world over the run.
2. **Thrust sound: attack burst + quiet sustain + decay (option C).** Hear ignition and shutdown, not constant noise.
3. **Scavenger audio: thrust sounds only, within range (option C).** Same family as player thrust, quieter. Distance-culled at 0.8 world-units (inverse-square — inaudible until close).
4. **Force pulse: crack + bass ring-out (option C).** Noise burst for the shockwave, low sine for the reverb.
5. **ZZFX for prototyping event sounds.** May ship the <1KB runtime for one-shots. Hand-roll continuous spatial sounds.

## Open Questions

1. **Panning model: screen-relative or facing-relative?** Screen-relative (LittleJS pattern) is more stable. Facing-relative is more immersive but rotates the soundscape on every turn. Leaning screen-relative — the camera doesn't rotate in this game, so screen-space = stable reference frame.
2. **Doppler on scavengers?** Simple pitch shift from relative velocity. Would make approaching scavengers sound higher-pitched (incoming) and departing ones lower. Cool but adds complexity. Defer?
3. **Force pulse audio position: fixed or traveling?** The wave ring expands. If the audio source travels with the ring, you'd hear the shockwave pass you. If fixed at origin, it's just a point-source boom. Traveling is cooler, more complex.
4. **Death sound timing:** match animation duration, or fixed 1.5s? Matching feels better.
