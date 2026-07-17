# v0.3 Audio Cue Sheet

Runtime remains procedural Web Audio. Recipes are declared in `src/audio/cue-spec.js`; no opaque authored audio assets are shipped in this slice.

| Family | Grammar | Envelope / mix | Cues |
|---|---|---|---|
| Route / cyan | rising perfect fourth, descending whole step | dry 70–650 ms gesture; narrow 500 Hz–2.5 kHz | slingshot engage/release, portal proximity/confirm, extraction, menu confirm |
| Salvage / amber | imperfect fifth with detuned upper partial, resolves downward | 100–550 ms warm fragment; no jackpot arpeggio | loot |
| Consequence / red | compressed minor second / falling semitone | dry low body, short edge, no alarm loop | death, shield absorb, refusal |
| Inhibitor / magenta | unstable tritone-adjacent pair, descending spectral tear | 450 ms–1.3 s; narrow instability rather than loudness | glitch, wake, vessel, drain, final portal |
| Player action | filtered texture with two-pulse motion | 120 Hz–1.6 kHz, rate-limited state voice | pulse, shield, flare |
| UI | tactile terminal contact | 25–180 ms, center/dry, UI cap 2 | move, confirm/back, tabs, vault, upgrade |

Every emitted cue has a bounded duration/cooldown, bus, priority, and voice cost in the cue spec. Legacy synthesis branches not yet represented in that spec are intentionally admitted as bounded world-detail compatibility cues until their individual migration is complete.

Listening checklist: verify quiet drift, event burst, portal enter/abort/confirm, Inhibitor wake, death linger, extraction settle, and ten minutes of repeated menu movement on headphones plus target speakers. Record a human verdict separately from automated results.
