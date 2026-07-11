# v0.3 Timbre Soundscape Implementation Plan

> Date: 2026-07-10
> Status: planning only — no production audio or gameplay changes in this plan
> Scope: the v0.3 Three/authoritative candidate line

## Purpose

Turn the present procedural Web Audio implementation into a restrained, readable soundscape. The target is not “a sound for every object.” It is an audio grammar that tells the player what changed, where attention belongs, and when the universe has gone quiet enough to be feared.

This plan preserves the current v0.3 contract:

- The authoritative sim remains the only owner of movement, collision, pickup, signal, Inhibitor state, portal residence/extraction, death, results, and profile writes.
- Audio is a client-side presentation consumer of snapshots and authoritative events. It never infers or creates a gameplay outcome.
- World-to-screen position, wrapped distance, and any spatial projection continue through `src/coords.js`; audio must not introduce local wrap or coordinate math.
- Rendering remains Three-first, the ASCII-fluid fabric remains the visual product, and audio must improve its legibility rather than blanket it.
- Client render pacing remains 60 fps where available. Audio scheduling must be event/edge-driven and fixed-rate/control-rate based, not a source allocation or graph rebuild in the frame loop.
- “Art Is Product” applies to sound: the sonic system is a designed part of the product, not a post-RC pile of decorative beeps.

## Current-state inventory

### Runtime and architecture

| Surface | Exact current files | Observed state | Implication |
|---|---|---|---|
| Audio engine | `src/audio.js` | One procedural Web Audio engine: voices feed `duckGain`, dual low-pass “SNES” filters, bit crusher, shared feedback echo, then master. It has title/menu/meta/gameplay contexts, an always-running drone, four well voices, one Inhibitor voice, 27+ one-shot cue branches, stereo panning, and a bounded `EventVoiceBudget`. | A good procedural-first base, but it is a single broad bus/duck system rather than a role-based mix. |
| Audio configuration | `src/config.js:392-408`; `src/dev-panel.js:184-188` | Global master/drone/well/event levels plus pulse duck duration/amount are tunable. The dev panel exposes only five broad knobs. | There is no per-bus level, accessibility mode, dynamic-range policy, or route/state mix policy. |
| Event adapter | `src/audio-events.js`; `tests/audio-events.cjs` | Only seven authoritative cue specs are declared. Local-player filtering maps loot, slingshot edges, portal proximity/confirm, escape, scavenger bump, and selected Inhibitor events. It reserves voices for extraction/Inhibitor vessel. | This is the correct boundary but has incomplete coverage, no event priority model, no payload-driven variants, and a separate local-event path in `main.js`. |
| Event consumption | `src/main.js:2375-2534` | Remote events call `playAuthoritativeEvent`, then several event types add direct local cue calls (`pulse`, effect use/expiry/absorb, death, star consumed, scavenger consumed, Inhibitor drain/final portal). | A future cue can be doubled or omitted because one event is split across adapter and switch logic. |
| Local/sandbox gameplay calls | `src/main.js:4404-4598`, `src/main.js:5369` | Local loop directly triggers pulse, loot, shield, death, extract, star-consumed, and scavenger-death cues. | The local and authoritative routes need one explicitly tested presentation-event bridge, without moving truth out of the sim. |
| Menu and UI calls | `src/main.js:3973-4147` and subsequent phase handlers | Title confirm, profile selection, Home tabs, hull switches, vault equip/sell, rig upgrade/failure, map selection, reroll, and launch call individual cues. Several navigation paths are silent or share generic tones. | UI presently has feedback but no state-family grammar, focus hierarchy, debounce policy across all input paths, or screen-transition sound. |
| Presentation boundary | `src/presentation/presentation-frame.js`; `src/render-three/vfx/vfx-events.js` | The renderer receives normalized frame facts and event metadata. It already models wells, rings, stars, wrecks, portals, planetoids, scavengers, remote players, fauna, sentries, player motion/slingshot state, and title glyph faults. | Audio needs an equivalent renderer-neutral, client-consumable presentation adapter; it can use the same source facts but must not couple itself to Three. |
| Coordinate discipline | `src/coords.js`; `src/audio.js:15,214-225,391-409,416-434` | Existing audio uses `worldToScreen`, `worldDistance`, including toroidal well and Inhibitor proximity. | Preserve this seam; all new spatial attenuation/pan helpers must call `coords.js`, never calculate wrapped deltas locally. |
| Existing audio production tools | `tools/audio_workbench.py`, `tools/audio_workbench/core.py`, `tools/analyze-audio.py`, `tools/audio-requirements.txt`, `docs/tools/AUDIO-WORKBENCH.md`, `docs/tools/AUDIO-ANALYSIS.md`, `tests/audio-toolkit.cjs` | The repo has a reference-analysis/workbench pipeline that can write JSON analysis, prompt/brief, recipe, preview WAV, manifest, and optional audio.js starter stub. No authored runtime audio files are currently committed; engine audio is synthesis-only. | Keep procedural runtime synthesis for latency and packaging, but use the workbench as the auditable design/render/analysis pipeline for reference and optional authored accents. |
| Automated audio coverage | `tests/audio-events.cjs`, `tests/audio-toolkit.cjs`, `tests/suite-manifest.cjs` | Adapter/locality/voice-reserve tests are in fast/core/static/full. Toolkit smoke is static/full only. | Tests prove a narrow translation and tool output, not sound-state coverage, mix limits, duplicate suppression, browser graph health, or listening quality. |

### Present audible language in `src/audio.js`

- World bed: title/gameplay drone is a 60 Hz/sub/fifth stack that drops toward 35 Hz across a run; nearest four wells are sine/sub harmonics; the Inhibitor has one band-passed square voice.
- Current interaction vocabulary: C-major loot and upgrade arpeggios; square-wave menu blip/confirm/back; triangle portal and slingshot tones; noise/oscillator impacts for pulse, scavenger contact, shield, stars, and debris; noise/saw/square treatments for Inhibitor forms.
- Current mix behavior: all sources route through the same `duckGain`; only pulse, star consumption, Inhibitor wake, and vessel use `_duck`; death ramps master to zero.
- Current allocation behavior: `EventVoiceBudget` limits only events admitted by `playEvent`; persistent drone/well/Inhibitor sources and bypass-like direct scheduling are not represented as bus budgets.
- Current randomness: noise buffers and debris/item pitch use `Math.random()`, so repeated cue variants are not deterministic or seeded for repeatable captures.

### Product, visual, and UX state inventory

The following state inventory is grounded in `src/main.js`, `src/hud.js`, `src/run-results.js`, `src/presentation/presentation-frame.js`, the route docs, and target frames under `docs/reference/target-visuals/2026-06-28-ui/`.

| State / beat | Visual or authority read | Sound job, not a mandatory one-shot |
|---|---|---|
| Title attract | `title`; title glyph faults; target title frame has a large white wordmark over cyan fabric, distant debris/wells, red entropy warning and quiet system telemetry | Establish distant mass and degraded terminal space; sparse fault ticks only when a visible title fault occurs; no looping melody that competes with the title. |
| Title → profile / profile create, select, delete confirmation | `title`, `profileSelect`; UI terminal-window and directional transition system | Acknowledgement and threshold crossing; use one quiet terminal family, with destructive confirmation darker and lower. Do not chirp on every reveal/type-on character. |
| Home: Ship, Vault, Rig, Chronicle, Launch | `home`; tab/focus/motion states | Orient and confirm material changes. Distinguish focus movement, equip/load, sale/drop, upgrade, unaffordable refusal, and launch readiness without casino reward language. |
| Route select / reroll / launch | `mapSelect`; seeded briefing and authority launch | Give route commitment a low, controlled spool; reroll is a soft data rotation, not a reward. Leave a short quiet gap before launch. |
| Loading / drop into play | `loading` → `playing`; context changes at `src/main.js:1800,1851` | Crossfade from interface vacuum to fabric pressure; a single descent/airlock gesture may state entry, then yield to navigation audio. |
| Normal flight / drift / thrust / brake | player motion, fuel/delta-v, fluid/fabric, `pathState` | Make player intent and momentum readable at low density. Continuous propulsion must be rate-limited/control-rate and quieter than hazards; coasting must be audibly valuable through reduced texture, not literal silence bugs. |
| Well approach, surf, slingshot readiness/engage/release | wells, rings, `slingshot` presentation facts; Shallows teaches this | Give a navigational relationship: low mass pressure, a subtle alignment cue when eligible, compact latch on engage, directional snap/release. Do not make every well sing a chord. |
| Wreck sight/approach/pickup/echo/looted | wreck family / player.loot; amber visual affordance | Communicate salvage and its completion. Pickup is one short warm resolved fragment, with echo wrecks replacing extra sparkle with a fragile memory texture. No continuous loot ping. |
| Stars, planetoids, wave/ring, consumption | star/planetoid/wave families and authoritative consumption events | Keep landmark sounds mostly ambient/spatial; reserve a brief low-frequency event for a nearby, meaningful consumption or wave. |
| Portal: distant, proximity, ready, confirm, exit abort, blocked/final | portal visual states and authoritative residence / confirmation | Cyan route language needs a recognizable two-interval identity. Proximity is once-per-entry; ready is a held spatial condition, not a repeating prompt; confirm is a short commitment; abort is a soft release; blocked/final uses altered timbre rather than louder volume. |
| Signal escalation / haunt / Inhibitor form 1/2/3, drain/final portal | signal UI, text corruption, Inhibitor events and forms | Progressively remove spectral safety and rhythmic certainty. The wake must create a stomach-drop contrast through short ducking and a state transition, not a permanent alarm loop. |
| Rival/scavenger presence, bump, death, extraction | active entity states and events | Keep distant rivals mostly represented by motion/space. Contact needs physical impact; death/extraction gets one concise spatial consequence. No chatter for every AI state. |
| Consumables, pulse, shield, time slow, breach flare | `player.effectUsed`, expiry/absorb, `player.pulse` | Action identity must outrank spectacle. Pulse gets brief world duck and body; shields are glass/field; time dilation changes mix temporarily; expiry ends cleanly. |
| Warnings: hull, portal, signal, inhibitor | HUD warning surfaces and world conditions | Warnings must be threshold/edge-triggered, cool down, and escalate by state. Prefer changing the bed or a low-timbre tick over repeating high beeps. |
| Death linger → results | `dead`, `DEATH_LINGER_DURATION`, result view; target results frame says COLLAPSED and foregrounds cause/cargo | The death event should collapse the sound field and make room for 1.2 s of near-silence. Results reveal uses one grave low resolution, then no item-by-item score machine. |
| Extraction → results/meta/home | `escaped`, `meta`, result writeback | Extraction should resolve the portal motif without becoming triumphal. Let the portal tail bridge to results; give earned cargo/EM one compact ledger confirmation after the screen settles. |
| Pause / resume / reduced motion / accessibility | `paused`, `CONFIG.ui.motion`, Deck target | Pause attenuates/freeze-fades world buses while preserving one non-looping interface cue. Reduced motion changes visual timing but must not remove essential state audio or cause extra repeats. |

### Visual evidence reviewed

The target title, in-match HUD, and post-match result reference frames were inspected at `docs/reference/target-visuals/2026-06-28-ui/title-screen.png`, `in-match-hud.png`, and `post-match-results.png`.

- The title is a dark cyan ASCII field centered on a large white title with sparse amber objects, a red entropy panel, and quiet telemetry. It calls for low-density depth and restrained interaction, not menu music.
- The in-match HUD creates simultaneous cyan navigation, warm salvage/route marks, magenta anomaly/Inhibitor pressure, and red immediate warning. Sound must preserve those roles: cyan = direction/confirmed route, amber = material value, magenta = invasive corruption, red = urgent consequence.
- The collapse frame foregrounds the consequence, exact cause, cargo split, signal values, and a small set of return/upgrade/new-run choices. It needs a deliberate silence window and a low-information result bed rather than stacked reward sounds.

## Findings ranked by severity

### P0 — authoritative event coverage and duplicate prevention are incomplete

`src/audio-events.js` maps only a small subset of the events that `src/main.js:2375-2534` handles. The same remote event path can call `playAuthoritativeEvent()` and a direct `playEvent()` branch, while local simulation calls are separately authored in the main loop. This makes future cue additions vulnerable to doubled pulse/star/scavenger cues or to remote/local parity gaps.

**Required correction:** create one client presentation-audio router that consumes normalized authoritative/local presentation events, performs locality and edge filtering once, and dispatches audio once. Keep `AudioEngine` synthesis-only. This is a presentation refactor; it must not move authoritative decisions into the client.

### P0 — current one-bus mix has no reliable priority, intelligibility, or accessibility policy

`src/audio.js` routes persistent ambience and most events through one `duckGain`; `EventVoiceBudget` only limits a subset of event source counts. The result cannot consistently protect death/extraction/Inhibitor cues, keep UI intelligible during chaos, or expose category volumes.

**Required correction:** add explicit buses, priority admission, bus-aware ducking, ceiling/limiter behavior, and category controls before expanding cue count.

### P1 — state grammar is generic and inconsistent with the current visual language

Major positive actions use conventional bright major arpeggios; menu and error sounds are generic square/beep patterns. The audio does not yet preserve the visual distinction between cyan route, amber salvage, red consequence, and rare magenta corruption. It also lacks a shared motif that survives as UI, portal, slingshot, and result material.

**Required correction:** design and document a small motif/timbre family, then replace/retune cues by function rather than adding unrelated effects.

### P1 — ambience is too static and too close to “one drone plus nearby wells”

The title, menu, gameplay, and late-run states are controlled mostly by drone level/frequency. Wells use mass-derived sine frequencies and can produce arbitrary musical relationships; no adaptive layer responds to signal zone, map signature, portal readiness, or risk density as a mix state.

**Required correction:** separate the sparse base bed from low-rate adaptive layers, quantize/constraint-map tonal relations, and make silence a designed state.

### P1 — missing or underdescribed UX transitions and warnings

The build has a rich UI-motion system, title faults, profile/home/map phases, result states, portal residence/abort, warning surfaces, and contextual entity visuals, but the sound implementation has no explicit screen transition, focus, pause, ready/abort, collapse-linger, or result-settle policy. Existing `thrustOn`, `wellProximity`, `hullWarning`, `portalDeath`, `scavengerExtract`, `wreckConsumed`, and `itemReveal` engine branches are not all visibly wired through current v0.3 routes.

**Required correction:** inventory every call site and authoritative event, delete dead cue assumptions or wire only gameplay-meaningful edges, and document intentional silence.

### P2 — verification is structural, not audible

`node tests/audio-events.cjs` passes in this worktree. `npm run test:audio` currently fails before analysis because the worktree lacks `librosa` and `soundfile`; the failure is environmental, not a source assertion failure. Existing tests do not assert cue duplicate suppression, bus caps, transition edges, audio-context graph cleanup, source timing envelopes, or browser listening/capture evidence.

**Required correction:** add deterministic unit tests and browser instrumentation, provision the documented local `.venv` only for audio-tool runs, and require a human listening pass. Do not claim that a waveform test is taste approval.

### P2 — repeatability and performance need explicit limits

Several cue variants use `Math.random()`. `_createNoise()` creates a new buffer per event. `_createVoice()` schedules a five-second timeout per voice. These may be acceptable at present scale, but a sustained 60 fps run with active effects needs observable allocation/active-source ceilings and event-rate budgets.

**Required correction:** use pooled/reusable noise buffers where appropriate, seeded or bounded deterministic variations for captureable events, and expose audio diagnostics without adding per-frame allocation.

## Target system and sonic style

### North star

**“A damaged instrument panel listening to a dying ocean.”**

The world is not a chiptune soundtrack with effects on top. It is black negative space, cyan current information, warm salvage, and a rare magenta invasion. The bed is subharmonic pressure, filtered particulate hiss, and isolated resonances; player action cuts through it in short tactile gestures. The sound should make quiet drift feel like skill and high-signal play feel increasingly acoustically compromised.

Do not imitate a named game, artist, or protected track. The implementation uses procedural Web Audio as the default runtime medium; optional externally generated/source-recorded material must have documented provenance and be converted through the asset pipeline below.

### Motif and role grammar

Use one compact interval cell, not a full melody:

- **Route / cyan motif:** rising perfect fourth followed by a downward whole step. It should be recognizable as a 70–350 ms portal-confirm, a stretched sparse pad gesture, or a slingshot release tail.
- **Salvage / amber motif:** a warm imperfect fifth with a lightly detuned upper partial, resolving downward rather than a bright major triad. It says “material acquired,” not “jackpot.”
- **Consequence / red motif:** compressed minor second or low falling semitone, short and dry. It says “loss/commitment/hazard,” never a cartoon alarm.
- **Inhibitor / magenta signature:** a narrow-band unstable interval between a tritone-adjacent pair with a descending spectral tear. It must be rare; form progression changes filtering, pulse irregularity, and stereo instability rather than merely adding volume.
- **Player action signature:** a filtered thrust texture with a faint two-pulse rhythm; slingshot engage/release inherits the route cell, making movement and extraction part of the same language.

Tonal material is constrained to a dark modal center per map/run (default D minor/Dorian-adjacent palette, not a fixed song key). Well and ambience frequencies may drift, but selectable partials should be constrained to a small ratio/scale set so nearby wells produce tension without arbitrary beating.

### Spectral and temporal allocation

| Role | Main spectral band / space | Temporal behavior | Density rule |
|---|---|---|---|
| Void/fabric bed | 35–300 Hz weight; filtered 1–3 kHz particulate detail | 8–30 s crossfades; no regular beat | One base layer, optional one texture layer. |
| Navigation / route | 500 Hz–2.5 kHz, narrow and clear; cyan “air” without piercing treble | 80–700 ms gestures; portal readiness is held spatial texture | One proximity onset per enter; no reminder chirp loop. |
| Player movement | 120 Hz–1.6 kHz, directionally panned but centered enough for speakers | continuous controls update 10–20 Hz, not every frame | One thrust/brake state voice plus one transient maximum. |
| Salvage / warm landmarks | 650 Hz–3.2 kHz with softened high partials | 100–900 ms | One pickup cue; distant landmarks stay low-detail/spatial. |
| Threat / consequence | 45–250 Hz body plus selective 1.2–4 kHz edge | short attacks, uneven 0.5–4 s state transitions | At most one foreground threat cue plus one warning tick. |
| UI | 700 Hz–2.8 kHz, dry, near-center | 25–180 ms except launches/results | One focus event per debounced input; UI must surrender to terminal events. |
| Results / pause | sparse 80–1.2 kHz, reduced stereo movement | 0.6–3 s settle tails | No score-counting cadence; silence carries outcome weight. |

Protect the 2–4 kHz intelligibility range: UI/error text readouts and critical cues may occupy it briefly, but ambient noise, debris clatter, and continuous thrust should be filtered away from it. Keep most world mass low/mid and use high-frequency detail only for an edge, warning, or tiny tactile confirmation.

### Buses, priorities, ducking, and density budgets

Implement a mixer topology in `src/audio.js` (or a focused `src/audio/mixer.js` module if extraction keeps the engine smaller):

```text
ambientBus ─┐
worldBus ───┼─> worldDuckBus ─> tone/character chain ─> safetyLimiter ─> masterBus ─> destination
playerBus ──┤
uiBus ──────┤
criticalBus ┘
```

- **Ambient bus:** title/gameplay base bed, wells, broad state layers. Normal target is roughly -28 to -20 dBFS equivalent; it may be ducked most.
- **World bus:** spatial landmarks, scavengers, impact textures, wave/portal conditions. Normal target roughly -24 to -14 dBFS equivalent.
- **Player bus:** thrust/brake/slingshot/pulse/ability cues. Normal target roughly -20 to -10 dBFS equivalent.
- **UI bus:** focus/confirm/back/inventory/transition. Normal target roughly -28 to -14 dBFS equivalent and dry.
- **Critical bus:** extraction commitment, Inhibitor transitions, death/collapse, unavoidable shield absorption. Reserve headroom and never reject solely because low-priority debris is active.

Priority order: `critical > action > warning > navigation > ui > world-detail > ambience`. Admission must consider both active voice count and class budget. Suggested initial concurrent caps: ambience 6 persistent/control voices, world 6, player 4, UI 2, critical 5, global scheduled transient sources 16; validate on target hardware and expose values in config rather than treating these as final mix values.

Ducking is selective, not a single global multiplier:

- pulse briefly ducks ambient/world 4–8 dB while preserving its transient;
- Inhibitor wake ducks UI/world 3–6 dB for 250–500 ms, then changes the ambient state instead of repeated ducking;
- extraction ducks ambience/world 4 dB and gives the route motif space;
- death ramps all non-critical buses down quickly, then leaves a 1.2 s near-silent linger matching `DEATH_LINGER_DURATION`;
- menu confirmation never ducks active gameplay; during paused/menu states world buses fade but do not abruptly zero unless the phase ends.

### Adaptive layer policy

Keep adaptive audio low-rate and derived from authoritative/presentation facts only:

1. **Base state:** title / menu / gameplay / pause / results. Crossfade, never restart on ordinary phase redraws.
2. **Run pressure:** derive a 0–1 presentation mix parameter from authoritative run progress, signal zone, and Inhibitor form. It may darken/filter/slow the bed; it may not decide those facts.
3. **Spatial fields:** nearest relevant well/portal/Inhibitor use `worldDistance` and `worldToScreen` from `src/coords.js`, updating control parameters at 10–20 Hz. Cap audible wells to the closest two in normal play; choose one dominant landmark in high-pressure states.
4. **Route state:** portal entry, ready, blocked, final are edge/state transitions. Ready can add a restrained spatial harmonic while resident; it must stop immediately on authoritative abort/exit.
5. **Movement state:** presentation frame `pathState`, velocity, thrust/brake and sim-owned slingshot facts control player texture. They do not change physics and must not use raw frame rate as an audio-event rate.
6. **Quality/degradation:** minimal quality reduces decorative density first (extra well partials, particulate/noise layers, tails), never critical cues or event translation.

### Intentional silence

- Title starts with only a nearly inaudible bed after browser unlock; no automatic flourish.
- Menu idle and Home remain mostly silent apart from a very low status hum; no tab-loop ambience.
- Clean drift reduces player-layer activity, making quiet mastery audible.
- Portal ready has a soft held condition but no countdown beep.
- Death owns a near-silent linger before results; result panels do not narrate every statistic with sound.
- After extraction or collapse settle, no new ambient layer begins until the next chosen screen/state requires it.

## Implementation plan

### Task 1 — Freeze the audio contract and event inventory

**Files to add/modify**

- Add `docs/v0.3/audio-soundscape-contract.md`.
- Add `src/audio/cue-spec.js` (or expand `src/audio-events.js` only if it remains small).
- Modify `src/audio-events.js`.
- Modify `tests/audio-events.cjs`.
- Add `tests/audio-cue-spec.cjs` and register it in `tests/suite-manifest.cjs`.

**Work**

1. Enumerate every current audio call in `src/main.js`, every authoritative event in `scripts/sim-event-journal.cjs`/`scripts/sim-runtime.cjs`, and every relevant presentation/VFX fact in `src/presentation/presentation-frame.js`.
2. Define one declarative cue spec per *meaningful state edge*, including: source event/state, local/remote visibility, cue family, priority, bus, max voices, cooldown, spatiality, duration ceiling, and whether it is edge-triggered, held, or continuous.
3. Explicitly mark unused existing `AudioEngine` branches as either retained but unwired by design, wired through a named event, or removed in a later cleanup. Do not silently leave misleading dead cues.
4. Define event idempotency and duplicate rules: an authoritative event sequence/event id is eligible once; local sandbox events use an explicit local presentation id; a remote event may not be independently re-sounded in the downstream UI switch.
5. Preserve private-event filtering: only local player inventory/loot/effect/portal interactions may become local audio. Do not leak another player’s private consequences into this client.

**Acceptance**

- Every v0.3 audio-bearing state in the inventory above has exactly one documented audio policy: cue, continuous layer, or intentional silence.
- Cue specs prove critical reserve, locality, and duplicate suppression deterministically.
- No test or implementation treats audio as gameplay authority.

### Task 2 — Introduce one presentation-audio router without changing simulation truth

**Files to add/modify**

- Add `src/audio/audio-router.js`.
- Modify `src/main.js` at the remote event path around lines 2375–2534 and local presentation call sites around lines 4404–4598/5369.
- Modify `src/audio.js` only to expose a narrow playback/control API.
- Add `tests/audio-router.cjs`; update `tests/audio-events.cjs`, `tests/systems.cjs` or an authority/browser fixture as appropriate.

**Work**

1. Make `AudioRouter` the sole client endpoint for authoritative event delivery, local sandbox presentation events, phase transitions, and sampled presentation state.
2. Keep event-to-cue translation in data modules, and keep synthesis/envelopes in `AudioEngine`.
3. Route `player.pulse`, effects, death, star/scavenger consequences, Inhibitor drain/final portal, and UI warning-associated cues through the router once; leave visual warning/text handling in `main.js`.
4. Use snapshot/presentation state only for continuous layers and state changes; never manufacture a pickup/death/extraction from proximity.
5. Provide an explicit `reset(runId)`/session-boundary path that clears event dedupe, held portal state, active continuous layers, and voice leases safely.
6. Keep `setPortalProximity()` only as a documented local prediction bridge if the sim does not yet publish the necessary edge; reconcile it against the authoritative event and ensure it cannot double-fire.

**Acceptance**

- A remote authoritative event produces at most one corresponding cue.
- The local and remote routes express the same semantic cue for the same outcome.
- New router tests cover stale/duplicate/out-of-run events, remote-player privacy filtering, portal enter/exit, and reset.

### Task 3 — Build the bus mixer, priority admission, and diagnostics

**Files to add/modify**

- Add `src/audio/mixer.js` and `src/audio/audio-diagnostics.js` if the engine split is justified.
- Modify `src/audio.js` and `src/config.js`.
- Modify `src/dev-panel.js` only for developer-facing mix diagnostics/tuners; do not turn the player HUD into a mixing console.
- Add `tests/audio-mixer.cjs` and browser coverage in `tests/smoke.cjs` or a new browser audio suite.

**Work**

1. Build the five buses and character/safety output stages described above with click-free gain ramps.
2. Replace broad `_duck()` behavior with named, bus-scoped duck requests that stack predictably and expire safely.
3. Extend the voice budget to track bus/category costs, active sources, priority preemption/drop reasons, and persistent voices. Critical events reserve capacity.
4. Expose read-only diagnostics through `window.__TEST_API` (active voices by bus, admitted/dropped cue counts and reasons, current phase/mix state, no raw audio nodes) so browser tests can make boundedness assertions.
5. Add config defaults for bus gains, dynamic-range preset, caps, and control update Hz. Keep user-facing controls simple: master, ambience, effects/UI, dynamic-range (Night/Default/Wide), and mute. Persist only after product/UI review.
6. Add a conservative master protection stage; it is not permission to mix every cue loudly.

**Acceptance**

- A burst of low-priority world cues cannot prevent death, extraction, or Inhibitor vessel audio.
- Event source counts and scheduled sources stay within configured ceilings in a long active fixture.
- No per-frame source allocation or graph reconstruction is introduced; continuous parameter writes are rate-limited.

### Task 4 — Rebuild the core procedural palette around roles, not object count

**Files to add/modify**

- Modify `src/audio.js` or split generators into `src/audio/voices/*.js`.
- Modify `src/config.js`.
- Add `docs/v0.3/audio-cue-sheet.md`.
- Add deterministic recipe JSON files under `assets/audio/recipes/` only if the project wants committed machine-readable tuning data; otherwise keep recipes in `src/audio/cue-spec.js`.

**Work**

1. Retune/rewrite shared procedural building blocks: filtered noise bed, low oscillator mass, constrained well resonators, player propulsion texture, tactile UI click, route interval cell, salvage partial, consequence thud, and Inhibitor instability.
2. Replace generic major-triad reward and bright square-beep patterns where they conflict with LBH’s dread/terminal identity; preserve distinction by function, not by more layers.
3. Make random variation bounded and reproducible for capture/analysis: use event id/run seed-derived choices where variation matters; use non-determinism only for nonsemantic texture where repeatability is not required.
4. Keep all runtime sounds procedural by default. Do not add sample files merely to make a sound “bigger.”
5. Define each cue with attack/body/tail, spectral target, pan/spatial rules, cooldown, and bus/priority in the cue sheet.

**Acceptance**

- The route motif is recognizable in slingshot release, portal confirm/extraction, and at least one restrained UI confirmation without sounding like three unrelated assets.
- Amber salvage, cyan route, red consequence, and magenta Inhibitor states are distinguishable by timbre/interval as well as screen color.
- Repeated menu movement, loot pickup, and warning exposure are non-fatiguing in a 10-minute loop check.

### Task 5 — Implement adaptive ambience and controlled continuous states

**Files to add/modify**

- Modify `src/audio.js`, `src/audio/audio-router.js`, `src/config.js`.
- Potentially add `src/audio/ambience.js` and `src/audio/spatial-state.js`.
- Add `tests/audio-ambience.cjs` and an authority/browser fixture.

**Work**

1. Separate title, terminal/menu, gameplay, pause, collapse, and results beds. Reuse voices/crossfade instead of creating fresh long-lived graphs at each phase.
2. Replace arbitrary nearest-four well harmony with a two-dominant-well policy and constrained partial/ratio mapping; preserve mass/proximity information through timbre/filter/gain more than pitch alone.
3. Map sim-owned run pressure and Inhibitor form to filtering, instability, and density in a documented control curve. Use fixed/control updates, not per-frame voice construction.
4. Add portal-ready held spatial texture and immediate authoritative-abort release behavior.
5. Add movement control voices for thrust/brake/coast that reflect presentation state but do not create a literal engine loop at every speed.
6. Implement pause and results attenuation; honor reduced motion without tying audio essentials to visual animation completion.

**Acceptance**

- Title, menu, gameplay, pause, death linger, extraction result, and collapse result are audibly distinct with no abrupt clicks or orphaned continuous voices.
- At most the configured landmark layers are audible simultaneously.
- Leaving a portal immediately removes its ready layer after authoritative state changes.

### Task 6 — Complete transition, action, warning, and outcome coverage

**Files to add/modify**

- Modify `src/main.js` through router calls only.
- Modify `src/audio/cue-spec.js`, `src/audio.js`, `src/hud.js` only if warning state exposes needed presentation edges.
- Add/update tests in `tests/audio-router.cjs`, `tests/meta-flow.cjs`, `tests/agent-play-eval.cjs`, and `tests/ui-motion*.cjs` where assertions belong.

**Work**

1. Add restrained policies for profile/Home/map select focus and confirm/back, destructive profile deletion, tab changes, vault/equip/sell, rig upgrade/refusal, seed reroll, route launch, pause/resume, and screen transition settle.
2. Cover flight, thrust/brake, slingshot readiness/engage/release, pulse, shield use/absorb, time-dilation start/end, breach flare, salvage/echo, star and planetoid consumption, scavenger contact/death/extraction, portal proximity/ready/confirm/abort/blocked/final, hull/signal threshold warnings, and each Inhibitor transition.
3. Design death/extraction sequences as envelopes across state changes: event onset, controlled bus fade, linger/portal tail, results settle, then sparse UI availability.
4. Ensure warnings follow thresholds and cooldowns, with escalation changing timbre/density rather than producing repeating alarm spam.
5. Keep title glyph faults and visual-only phantoms optional accent sources; they must be rate-limited and never imply an authoritative threat or alter gameplay.

**Acceptance**

- A fresh agent-eval journey can produce the intended cues for slingshot, salvage, Inhibitor pressure, portal ready/confirm, extraction, death, and recovery with no debug mutation.
- The listener can identify active/ready/confirmed/aborted portal states without watching a label, but no periodic prompt sound appears while waiting.
- Death and extraction do not overlap with stale gameplay loops after the result state settles.

### Task 7 — Establish asset/reference pipeline and listening evidence

**Files to add/modify**

- Add `docs/v0.3/audio-production-pipeline.md`.
- Add `assets/audio/README.md`, `assets/audio/references/.gitkeep`, and `assets/audio/renders/.gitkeep` only when actual approved audio artifacts need a repository home.
- Modify `tools/audio_workbench.py` / `tools/audio_workbench/core.py` only if a concrete pipeline gap is found.
- Update `docs/tools/AUDIO-WORKBENCH.md` if the validation workflow changes.
- Add `tests/audio-render-manifest.cjs` only if committed rendered assets are introduced.

**Work**

1. Treat procedural Web Audio recipe data as the primary runtime asset. For each final cue family, store an auditable cue sheet with source provenance, synthesis recipe, output role, loudness target, and revision owner.
2. If a reference clip is used, record rights/provenance and analyze it with the local workbench; use broad technical attributes, never an instruction to copy a protected recording or living artist.
3. Use generated/rendered WAV previews for review only until an approved runtime asset requires packaging. Verify any committed WAV/OGG with duration, sample rate, channels, peak/true peak proxy, and loop seam.
4. Provision the worktree-local `.venv` using the documented `uv venv .venv` / `uv pip install -r tools/audio-requirements.txt` flow before relying on `npm run test:audio`. Do not commit the environment.
5. Create a concise listening checklist and reviewer log template: headphones and Deck speakers; normal and Night dynamic-range presets; quiet drift, active combat/event burst, portal, Inhibitor wake, death, extraction, and 10-minute menu repetition.

**Acceptance**

- Every generated or imported audio artifact has provenance, format metadata, and a listening/analysis record.
- The workbench smoke passes in a provisioned local environment.
- No unlicensed source material or opaque binary asset is silently added.

### Task 8 — Integrate audio into the v0.3 release evidence without pretending tests can hear

**Files to add/modify**

- Modify `tests/suite-manifest.cjs`.
- Add/update targeted `tests/audio-*.cjs` files.
- Update `docs/design/TEST-HARNESS.md`, `docs/v0.3/RC-GATE.md`, and `docs/project/BUILD-STATUS.md` only after actual implementation/evidence changes.
- Add a planned audio section to `tests/agent-play-eval.cjs` report output only if it can report structural cue trace evidence honestly.

**Work**

1. Place pure cue/mixer/router tests in fast/core/static where deterministic; reserve browser graph/context and long-run voice checks for a browser/visual-adjacent focused lane, not every tiny edit.
2. Add an audio trace mode for test only: cue id, event id/sequence, bus, priority, admission/drop reason, duration ceiling, and phase. Do not record or expose private gameplay payloads unnecessarily.
3. Add a browser flow asserting unlock after user gesture, phase crossfades, no duplicate event trace, portal exit release, collapse silence state, extraction settle, and no active voices after reset/dispose.
4. Add stress cases against authoritative event bursts and the Deep Field/performance fixture; assert caps and absence of unbounded timers/nodes rather than a subjective waveform score.
5. Require a human listening review as a separate RC evidence item; capture concise findings and blockers, not fabricated pass/fail audio taste claims.

**Acceptance**

- `npm run test:fast`, `npm run test:authority`, relevant browser/playtest coverage, and the audio-toolkit smoke all pass after implementation.
- The candidate gate records structural audio evidence and a real listening verdict separately.
- No audio test weakens server authority, coordinate, Three, visual, or 60 fps gates.

## Exact planned file surface

### Expected new files

- `docs/v0.3/audio-soundscape-contract.md`
- `docs/v0.3/audio-cue-sheet.md`
- `docs/v0.3/audio-production-pipeline.md`
- `src/audio/audio-router.js`
- `src/audio/cue-spec.js`
- `src/audio/mixer.js`
- `src/audio/audio-diagnostics.js` (if diagnostics do not fit cleanly in mixer)
- `src/audio/ambience.js` and/or `src/audio/spatial-state.js` (only if extraction reduces, rather than grows, `src/audio.js` complexity)
- `tests/audio-cue-spec.cjs`
- `tests/audio-router.cjs`
- `tests/audio-mixer.cjs`
- `tests/audio-ambience.cjs`
- optional `assets/audio/README.md`, recipe manifests, and empty asset directories only when an approved asset pipeline needs them

### Expected modified files

- `src/audio.js`
- `src/audio-events.js`
- `src/config.js`
- `src/main.js`
- `src/dev-panel.js`
- `src/presentation/presentation-frame.js` only if a missing presentation-safe fact must be explicitly normalized for audio
- `src/test-api.js` only for read-only audio diagnostics
- `tests/audio-events.cjs`
- `tests/audio-toolkit.cjs`
- `tests/suite-manifest.cjs`
- focused browser/flow tests chosen from `tests/smoke.cjs`, `tests/meta-flow.cjs`, `tests/agent-play-eval.cjs`, `tests/perf-probe.cjs`, and `tests/ui-motion*.cjs`
- `docs/tools/AUDIO-WORKBENCH.md` only if actual workflow/commands change
- `docs/design/TEST-HARNESS.md`, `docs/v0.3/RC-GATE.md`, and `docs/project/BUILD-STATUS.md` only after implementation evidence exists

### Files explicitly not in scope for audio ownership changes

- `scripts/sim/*` and authoritative event semantics, except a later small additive event field if the existing event lacks a required presentation fact and its ownership/privacy is reviewed.
- physics, collision, movement, portal, inventory, signal, results, or profile truth.
- `src/coords.js` behavior; new audio spatial code consumes its existing helpers.
- Three entity lifecycle ownership and visual asset generation, except optional presentation facts/visual review coordination.
- existing ignored/untracked screenshot directories.

## Test, build, visual, and listening verification

### Before coding

```sh
cd /private/tmp/lbh-v03-overnight-20260710-230616/timbre-plan
git status --short
node tests/audio-events.cjs
npm run test:fast
```

Provision audio analysis only when needed, inside this worktree:

```sh
cd /private/tmp/lbh-v03-overnight-20260710-230616/timbre-plan
uv venv .venv
.venv/bin/python -m pip --version
uv pip install --python .venv/bin/python -r tools/audio-requirements.txt
npm run test:audio
```

### Per implementation slice

1. Run the focused deterministic audio tests for cue mapping, router dedupe, mixer priority, and ambience state.
2. Run `npm run test:fast` after changes to cue specs/engine contracts.
3. Run `npm run test:authority` whenever authoritative-event routing or private/local filtering changes.
4. Run `npm run test:three`, `npm run test:visual`, and `npm run test:ui` when phase/presentation/HUD changes could affect the visual contract.
5. Run `npm run test:playtest` and `npm run test:agent-eval` for real menu-to-run-to-result routes.
6. Run `npm run test:perf` or a focused audio stress probe after mixer/control-loop changes; confirm no regression to the existing 60 fps client expectation and Three ceilings.
7. Run `npm run test:full` before handoff/RC claim, from a clean committed tree.

### Browser and audio evidence

Use a fresh stack, normal input, and Three renderer for listening review:

```sh
cd /private/tmp/lbh-v03-overnight-20260710-230616/timbre-plan
npm run stack:stop
npm run stack -- --no-open
```

Then verify, on headphones and target/Deck speakers where available:

- first user gesture unlocks audio cleanly; no autoplay error or first-event loss;
- title idle is sparse; title confirm, profile, Home, route select, launch, and pause have restrained state feedback;
- drift, thrust, braking, wells, slingshot engage/release, wreck pickup, portal proximity/ready/confirm/abort, pulse/effects, warnings, and Inhibitor forms retain hierarchy under an event burst;
- extraction resolves without reward-machine overload; death reaches a real quiet linger before collapse results;
- result/home screens do not retain gameplay continuous voices;
- UI focus is intelligible after repeated navigation and never becomes a metronome;
- 1280x800 visual captures still show audio-corresponding state edges without audio code changing rendering or coordinates;
- browser diagnostics report voice/bus caps and zero lingering nodes after run reset.

For any rendered/approved audio artifact, run the workbench or `ffprobe`-equivalent verification and retain duration/sample-rate/channel/peak records. Spectrograms and structural analysis can validate envelopes and density but cannot replace the human listening verdict.

## Acceptance criteria

1. The audio system consumes authoritative events and presentation state without creating gameplay truth or leaking another player’s private events.
2. All spatial audio uses `src/coords.js` helpers; seam-safe well/portal/Inhibitor behavior remains correct.
3. Each UX/gameplay state in this plan has a documented cue, continuous layer, or intentional silence policy.
4. The cue router prevents duplicates across remote event, local simulation, and UI switch paths.
5. The mix has explicit ambient/world/player/UI/critical buses, category budgets, critical reserve, bus-scoped ducking, and read-only diagnostics.
6. Audio scheduling introduces no per-frame source allocation/graph rebuild and does not reduce the current 60 fps presentation target.
7. Cyan route, amber salvage, red consequence, and rare magenta Inhibitor language are distinct by sound design as well as visuals.
8. Portal ready/confirm/abort, Inhibitor wake/forms, death linger/results, and extraction/results are clear, restrained, and free of stale loops.
9. Deterministic and browser tests pass; the audio workbench smoke passes in the documented provisioned environment.
10. A real listening review on headphones and target speakers records a human verdict; automation is not represented as subjective approval.
11. Existing server-authority, coordinates, Three-first renderer, ASCII-fluid identity, UI motion, visual, package, and Deck gates remain intact.

## Explicit non-goals

- No movement, collision, signal, portal, extraction, death, inventory, AI, profile, or result rule changes.
- No client-side inference that changes gameplay or substitutes for a missing server event.
- No full soundtrack, combat-music layer, continuous beat, or object-by-object sound spam.
- No requirement to replace procedural Web Audio with a sample library.
- No use of a specific copyrighted recording or living artist as a copy target.
- No public multiplayer/audio-chat work, streaming audio, voiceover, localization voice production, or native engine migration.
- No visual redesign, coordinate rewrite, Three scene ownership rewrite, or broad UI rewrite.
- No claim that desktop screenshots certify Steam Deck sound, controller feel, physical speakers, or final taste.
- No modification of existing untracked screenshot directories.

## Rollback notes

1. Land implementation in small, independently reversible commits: contract/tests; router; mixer; palette; ambience; state coverage; evidence/docs. Do not combine all sound changes with unrelated gameplay or visual work.
2. Keep the old `AudioEngine` cue implementation behind a temporary internal compatibility adapter until router parity tests and a listening pass prove each migrated family. Remove the adapter only after no callers use it.
3. Feature-gate the new mixer/ambience path with a runtime-safe config default during rollout. The fallback must still preserve user mute/master control and critical cue safety; it must not become a second gameplay path.
4. If an adaptive layer harms readability or frame timing, disable that layer/bus first while retaining authoritative event cues. Do not disable or weaken the sim contract to solve an audio issue.
5. If a cue or bus change regresses the 60 fps/voice-cap/perf evidence, revert the smallest cue family or mixer slice and retain the tests that exposed it.
6. If a generated/imported asset fails provenance, format, loop, or listening review, remove it from the runtime manifest and fall back to the documented procedural recipe.
7. For release rollback, restore the previous atomic audio commit(s), rerun fast/authority/browser/audio evidence, and record the residual listening issue in the RC gate rather than silently shipping a degraded or doubled cue path.
