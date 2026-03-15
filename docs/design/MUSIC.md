# Music & Audio Design

> Beyond sound effects. How the universe sounds as it dies.

---

## Philosophy: The Universe Is the Instrument

No pre-composed soundtrack. The music emerges from the simulation state. Every sonic element is driven by a game variable. The player is hearing the universe — not a composer's interpretation of it.

This means: no two runs sound the same, the audio teaches you the game state without looking at the HUD, and the soundtrack has a natural arc because the universe has a natural arc (alive → dying → collapsing).

---

## Layers (Additive, Always Running)

### Layer 1: The Drone (Spacetime Itself)
- **Source:** Low-frequency oscillator, always on
- **Pitch:** Drops over the run as viscosity increases. Starts at ~60Hz, ends at ~30Hz.
- **Timbre:** Starts as a clean sine. Gains harmonics (sawtooth blending) as Hawking radiation increases. By collapse, it's a distorted growl.
- **Volume:** Constant. The drone IS the floor of the soundscape. Everything else sits on top.
- **Implementation:** Single oscillator + gain node + waveshaper for distortion. 3 lines of Web Audio.

### Layer 2: Gravity Harmonics (The Wells)
- **Source:** One oscillator per black hole
- **Pitch:** Proportional to mass. Small well = high pitch (~200Hz). Merged monster = low pitch (~50Hz, beating against the drone).
- **Interval:** Wells at different masses create intervals. Two wells close in mass = dissonance. One much larger = harmonic (octave, fifth).
- **Panning:** Stereo position based on well's position relative to player. Wells to your left hum in your left ear.
- **Growth:** As wells accrete mass, their pitch drops. You hear them getting heavier. When two wells merge: both pitches glide toward each other, meet, and drop to the combined mass pitch. The merge sounds like a chord resolving downward.
- **Implementation:** OscillatorNode per well, GainNode for distance attenuation, StereoPannerNode for position. Update pitch/pan every frame.

### Layer 3: Wave Rhythm (Gravity Waves)
- **Source:** Filtered noise, amplitude-modulated by wave height at player position
- **Character:** Like breathing. Waves crest and fall, the sound swells and ebbs.
- **Speed:** Matches wave propagation speed. Early game: slow, steady rhythm. Late game: faster, more chaotic as multiple wells create complex interference.
- **Frequency content:** Low-pass filtered noise. Cutoff frequency tracks wave energy — calm = rumble, energetic = whoosh.
- **This IS the surfing feedback.** Player learns to hear the wave crest before they see it. Skilled players surf by ear.
- **Implementation:** White noise → BiquadFilterNode (lowpass) → GainNode modulated by wave amplitude at ship position.

### Layer 4: Signal Choir (The Signal Level)
- **Source:** Sine cluster — 3-5 oscillators in close harmony
- **Pitch:** Fixed frequencies, detuned slightly for shimmer
- **Volume:** Proportional to signal level. Silent at 0%. Full at 100%.
- **Character:** At low signal: ethereal, almost pretty. Like distant singing. At high signal: dense, claustrophobic, alarm-like. The prettiness curdles.
- **Implementation:** Add oscillators to a gain node controlled by signal level. Slight random detuning for chorus effect.

### Layer 5: Inhibitor Presence (The Wrong Note)
- **Source:** Ring modulation of the drone + a frequency that doesn't belong in the harmonic series
- **Onset:** 5-second audio warning before Inhibitor spawns. The drone develops a tremolo. A high-pitched whine fades in.
- **Active:** Persistent dissonant tone that tracks Inhibitor distance. Closer = louder + more ring modulation artifacts. The entire soundscape sounds "wrong" — like a radio being jammed.
- **The audio inversion moment:** When the Inhibitor spawns, ALL audio briefly (0.5s) plays through a ring modulator with an extreme carrier frequency. Everything sounds alien for a heartbeat, then returns to "normal" — but now with the Inhibitor tone woven in permanently.
- **Implementation:** Ring modulation = multiply two signals (use a GainNode with one signal as input and another modulating the gain). The "wrong frequency" is an irrational ratio to the drone (e.g., drone * √2).

---

## Event Sounds (One-Shot)

These punctuate the continuous layers:

| Event | Sound | Character |
|-------|-------|-----------|
| Thrust on | Filtered noise burst, sharp attack | Jet ignition feel |
| Thrust sustain | Continuous filtered noise, pitch follows thrust magnitude | Engine hum |
| Thrust off | Noise with fast decay, slight pitch drop | Engine shutdown |
| Loot pickup | Crystalline ascending chime (3 notes, fast) | Rewarding, Caves of Qud style |
| Wreck scan | Short pulse of data-like chirps | Sonar ping |
| Portal pulse | Low bass throb + high shimmer, repeating | Heartbeat of the exit |
| Portal evaporation | Descending glissando + static burst + silence | Something dying |
| Scavenger nearby | Distant engine hum, Doppler-shifted | Another presence |
| Fauna contact | Wet organic crunch, short | Alien and gross |
| Hull damage | Low impact + metallic rattle | Metal stress |
| Extraction start | Ascending harmonic series, building | Hope |
| Extraction complete | All layers resolve to a major chord, then silence | Release |
| Death | All layers pitch-shift down, distort, cut to silence | Compression, then void |
| Well merger | Deep bass impact that compresses all other audio for 1-2s | Spacetime breaking |

---

## Dynamic Mixing

The layers compete for space. Mixing rules:

- **Proximity priority:** Whatever is nearest to the player is loudest. Wells, fauna, portals all have distance-based attenuation.
- **Signal ducking:** When signal level is high, the signal choir ducks (quiets) other layers. The player's own noise drowns out the environment. You can't hear the wave rhythm as well when you're being loud. This is both realistic and gameplay-informative.
- **Inhibitor override:** When the Inhibitor is active, it progressively takes over the mix. By the time it's close, all other audio is suppressed except the drone and the Inhibitor tone. The soundscape narrows to dread.
- **Extraction crescendo:** During the portal charge/extract sequence, all layers build to a peak and resolve. The most musical moment in the game — earned, not composed.

---

## Implementation: Web Audio API vs Tone.js

**Recommendation: Raw Web Audio API.**

Reasons:
- Everything we need is built in: OscillatorNode, GainNode, BiquadFilterNode, WaveShaperNode, StereoPannerNode, AnalyserNode
- No external dependency (jam speed, single HTML file goal)
- Tone.js adds ~150KB and an abstraction layer we don't need
- Our sounds are simple: oscillators, noise, filters, modulation. No sample playback, no sequencing, no MIDI.

**One exception:** If we want generative ambient music (stretch goal), Tone.js's Transport and Pattern classes would help. But that's post-jam.

---

## Stretch: Generative Music

If we're ahead of schedule and want music-music (not just soundscape):

- **Pentatonic/whole-tone arpeggios** triggered by game events (loot, portal proximity)
- **Notes selected from a scale that matches the well harmonics** — the music is literally in key with the gravity
- **Tempo driven by wave frequency** — the music breathes with the waves
- **Key change on Inhibitor wake** — everything shifts to a tritone-based scale (diminished, augmented). The music itself becomes wrong.

This would be beautiful but is absolutely a stretch goal. The soundscape layers above are the priority — they serve gameplay first, aesthetics second.

---

## What to Research Pre-Monday

- [ ] Web Audio API: WaveShaperNode curves for the drone distortion ramp
- [ ] Ring modulation implementation (multiply two signals via GainNode trick)
- [ ] Stereo panning math: how to map 2D game position to L/R pan
- [ ] LIGO chirp waveform as reference for the well merger sound
- [ ] How to generate filtered noise (white noise source → biquad lowpass)
