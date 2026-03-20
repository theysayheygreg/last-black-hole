# Audio Implementation — Jam Scope

> What ships for the jam. See MUSIC.md for the full vision.

---

## Philosophy

MUSIC.md designs a fully procedural soundscape where the universe is the instrument. That's the north star. For the jam, we ship the layers that give the most feel per line of code.

Everything is Web Audio API. No libraries. No samples. All synthesis.

---

## Layer 1: The Drone (spacetime itself)

Always on after first user interaction. The floor of the soundscape.

- Single oscillator, ~60Hz sine wave
- Pitch drops linearly over run duration (maps to universe age / viscosity increase)
- Start: 60Hz (clean sine). End: ~35Hz (sawtooth blend via waveshaper — gains harmonics as universe dies)
- Volume: constant low. The drone IS the baseline. Everything sits on top.
- Implementation: OscillatorNode → WaveShaperNode → GainNode → destination

~15 lines.

---

## Layer 2: Well Harmonics (gravity made audible)

One oscillator per well. You can HEAR the wells.

- Pitch: base frequency / (mass * scale). Heavier wells = lower pitch.
- Starting well (~mass 1.0): ~180Hz. Grown well (~mass 3.0): ~60Hz (beats against the drone).
- Stereo panning: StereoPannerNode, pan value from well's angle relative to player (-1 left, +1 right).
- Volume: attenuates with distance. Nearby well = loud hum. Distant well = faint.
- When wells grow: pitch audibly drops. You hear them getting heavier.
- Two wells at similar mass: dissonance (close frequencies beating). One much larger: harmonic interval.

~40 lines (oscillator + panner + gain per well, update pitch/pan/volume each frame).

---

## Event Sounds (one-shot synthesis)

| Event | Sound | Implementation |
|-------|-------|---------------|
| Thrust on | Filtered noise burst, sharp attack | Noise source → bandpass filter → gain envelope (fast attack, sustain) |
| Thrust off | Noise with fast decay, slight pitch drop | Release the gain envelope |
| Loot pickup | Ascending 3-note chime (C5-E5-G5) | 3 sine oscillators, staggered 80ms, fast decay |
| Portal evaporation | Descending glissando + static burst | Oscillator frequency sweep down + noise burst |
| Force pulse | Low bass impact + ring-out | Low sine (40Hz) + quick decay, slight ring modulation |
| Death (well) | All layers pitch-shift down, distort, cut to silence | Ramp all oscillator frequencies down over 1.5s, increase waveshaper drive, then disconnect |
| Extraction | Ascending harmonic series → major chord → fade | Stack harmonics (1f, 2f, 3f, 4f, 5f), build volume, resolve, fade to silence |
| Scavenger extract | Distant "pop" — short filtered noise | Quick noise burst, low volume, panned to scavenger position |

~120 lines for all events.

---

## What's Deferred to Post-Jam (or Sunday Stretch)

| Layer | From MUSIC.md | Why deferred |
|-------|--------------|-------------|
| Wave rhythm | Filtered noise AM'd by wave height at player | Needs good wave ring data at player position |
| Signal choir | 3-5 detuned sines, volume = signal level | Signal system not built yet |
| Inhibitor tone | Ring modulation, wrong-frequency carrier | Inhibitor not built yet |
| Dynamic mixing | Signal ducking, Inhibitor override, proximity priority | Needs all layers present first |
| Generative music | Pentatonic arpeggios, tempo from wave frequency | Full stretch goal |

These are all additive. Each one slots in when its prerequisite system exists.

---

## Audio Gating

Browser autoplay policy requires a user gesture before audio. Implementation:
- Create AudioContext on first click/keypress
- Resume context if suspended
- All layers start after context is active
- Volume master slider in dev panel

---

## CONFIG Section

```javascript
audio: {
  masterVolume: 0.7,
  droneVolume: 0.15,
  droneBaseFreq: 60,           // Hz, start of run
  droneEndFreq: 35,            // Hz, end of run (pitch drops with universe age)
  droneDistortion: 0.3,        // waveshaper drive at end of run (0 = clean, 1 = harsh)
  wellHarmonicVolume: 0.12,
  wellBaseFreq: 180,           // Hz at mass 1.0
  wellFreqScale: 0.5,          // freq = baseFreq / (mass * scale)
  wellMaxDist: 2.0,            // world-units, beyond this = silent
  eventVolume: 0.3,
  enabled: true,               // master toggle
}
```

---

## Open Questions

1. **Audio on by default or gated behind a toggle?** Recommendation: on by default after first interaction, volume slider in dev panel. Some players will want silence.
2. **Well harmonics: sine or square?** Sine = eerie, musical. Square/saw = industrial, mechanical. The design doc says sine. Square waves beating at close masses creates a more unsettling industrial throb. Need to hear both.
3. **Spatial audio model:** simple stereo panning (left/right based on angle), or also volume-based distance? Recommendation: both. Pan for direction, gain for distance.
4. **Death sound timing:** should the pitch-shift-down happen over the death animation duration, or be a fixed 1.5s regardless? Matching the animation feels better.
5. **Thrust sound: continuous or pulsed?** Continuous filtered noise while thrusting, or pulsed bursts? Continuous is more realistic but might be annoying. Pulsed (every 0.3s) gives rhythm.
