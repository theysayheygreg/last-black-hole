# v0.3 Audio Soundscape Contract

## Boundary

Audio is a client-side presentation consumer. It may render an authoritative event once, or continuously control an already-owned voice from published presentation state. It never decides movement, collision, loot, signal, portal residence, extraction, death, result, or profile truth.

Spatial projection uses `src/coords.js` only. New audio code must call its helpers; it may not calculate wrapped deltas locally.

## Event route

`AudioRouter` is the authoritative-event entry point. It owns run/sequence dedupe and player-local privacy filtering. A remote event key is `runId:seq` (or its explicit event id); replays are silent. Local sandbox presentation must provide an explicit presentation id. A run reset clears dedupe and held portal state.

The router maps a server event to at most one cue. The downstream UI switch may show warnings/VFX but must not independently re-sound that event. Snapshot/presentation state can operate continuous ambience only; it cannot manufacture an outcome.

## Audible-contact bridge

`src/audio/audible-contact-audio-bridge.js` consumes only the already-authoritative audible-contact records published for the HUD. Its input is an array of contacts with stable `id`, `live`, canonical `bearingRadians`, canonical `rangeMeters`, and `emittedRadiusMeters`; it never receives raw world entities or evaluates a hearing radius. `update(contacts, { nowSeconds })` deterministically retains a capped held-voice set in this order: EXFIL/`EXFIL TONE`, then Vessel/`VESSEL THRUST` and Swarm, then Glitch. It returns `entered`, `updated`, and `expired` voice descriptors so a Web Audio owner can start, control, and fade persistent voices without per-frame one-shots. `terminal(reason, { nowSeconds })` clears every held voice for portal confirmation, death, extraction/results, or run reset.

The bridge is presentation admission only. `main.js` must pass the same authoritative contact lifecycle that feeds the HUD, and must map its returned descriptors to bounded synthesis voices; it must not derive contacts from entities, grant EXFIL discovery, or reintroduce a receiver/perception path.

## Bus and priority policy

Buses: `ambient`, `world`, `player`, `ui`, `critical`. Initial caps: 6, 6, 4, 2, 5; global scheduled transient cap: 16. Cue costs count the actual scheduled oscillator/noise sources, not merely one recipe call. Priority order: `critical > action > warning > navigation > ui > world-detail > ambience`.

Critical (death, extraction, Inhibitor transitions) reserves space. `AudioMixer` tracks admitted/dropped bounded leases for diagnostics; `EventVoiceBudget` remains the source-scheduling safeguard. This is admission accounting, not server authority.

## State policies

- Title/menu: sparse bed; focus and confirm only. No idle melody.
- Gameplay: two nearest well layers, controlled through `coords.js`; movement texture remains rate-limited.
- Portal: proximity is once per entry; ready is held; exit/abort releases immediately.
- Inhibitor: changes spectral safety, not a permanent alarm loop.
- Death: critical onset then 1.2 seconds near-silent linger.
- Extraction: route-cell resolve and a restrained tail into results.
- Results/pause: attenuate world layers; no score-counting cadence.

## Intentional silence

No automatic title flourish after unlock, no menu tab-loop, no portal countdown reminder, no item-by-item results beeps, and no new ambience after outcome settle until the next chosen state.

## Verification

Structural tests cover cue vocabulary, locality, deterministic duplicate prevention, reset, and bus caps. Browser graph bounds and a human headphones/Deck listening verdict remain separate required evidence; waveform or unit tests do not certify taste.
