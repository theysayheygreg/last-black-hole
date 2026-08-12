# LAST SINGULARITY — Audio Style Guide v1 (DRAFT for ratification)

> Status: **draft awaiting Greg's ratification**, authored 2026-08-06 by
> Orrery from Greg's interview (spine, ranking, intake, voice all
> Greg-ratified) and a sourced survey of established practice (§10).
> Custody after ratification: **Timbre owns this guide** — maintains it,
> proposes amendments, Greg ratifies. Timbre's department-guide
> consolidation (currently in REWORK) rebases onto this document: its
> cue-ID inventory, bus caps, and runtime specifics merge in here or
> attach as normative appendices; the listening sheet remains its
> audible companion. The existing `audio-cue-sheet.md` and
> `audio-soundscape-contract.md` stay runtime truth until that merge.
>
> **How to read this guide:** every rule is a human sentence first —
> the law — with its checkable anchor in italics underneath. The
> anchors are fences around a meadow, not rails: they say where the
> family ends, never which note to play. Numbers appear only where
> practitioners actually use numbers (BPM, LUFS, Hz bands, counts).

---

## 0. The sound of the game

Last Singularity sounds like a haunted instrument remembering music.
The universe is dying; what's left is signal — thin, precise, reluctant
— and underneath it, the mechanical grief of a machine that used to be
an orchestra. Everything audible is in the game's own voice: even
warnings are music in this language, never generic beeps borrowed from
another world.

**The ranking, which wins every conflict: IDENTITY > SIGNAL > WORLD.**
The game must be recognizable in three notes. Signals speak inside that
identity. The world bed yields to both. When a beautiful ambience masks
a threat cue, the ambience loses; when a generic-but-clear alert would
break the voice, we write a clear alert *in* the voice instead.

## 1. Identity: the motif economy

The whole game runs on a handful of melodies, transformed — never on
new ones. Three to five motifs, total, forever: the game's signature,
the exit's call, the wrongness, and at most two more earned later.
When a new place or system needs music, it gets an existing motif
re-instrumented, re-registered, or re-moded — the way one melody on a
lute is the underworld and the same melody on an electric guitar is
the man walking out of it.

*(anchors: motif budget ≤5, tracked by name in this guide; a proposed
"new theme" must first be argued as a transformation of an existing
motif and rejected; identity transformations = instrumentation,
register, mode, tempo — never new pitch material. Practice: Hades'
timbre-swap identity, §10.4.)*

## 2. The families

Each family is written as a musician's brief. The bolded sentence is
the law; the anchors mark the fence. Inside the fence, surprise us.

**Route (the way out).** The sound of the exit calling: clear, high,
and getting closer to home. These cues sing rather than strike — tones
that open and resolve, like an answer to a question you asked minutes
ago. Made of glass and clear air, never metal, never grit. The closer
to extraction, the more the notes settle onto the home chord.
*(anchors: the game's home scale · upper-middle register · glass/pure
material · swelling-resolving shapes · resolves, never cut off.)*

**Salvage (the find).** Small weights landing in your hold: short,
warm, physical. A pickup is one object's worth of sound — a single
contact, a brief ring, done. Better finds ring longer and lower, the
way heavier coins ring differently, but a jackpot is still one coin,
never a slot machine.
*(anchors: warm material — wood, brass, muted metal · middle register ·
struck/pluck shapes with short natural decay · tier expressed by decay
length and register drop, never by adding voices or fanfare.)*

**Consequence (the cost).** Damage and death sound like structure
failing, not like punishment. Low, physical, and final — the hull is a
body and it is being hurt. Death is the one moment the whole mix gets
out of the way: the failure sound, then the 1.2-second near-silence
the results screen already honors.
*(anchors: low register, felt-more-than-heard foundations · dry
physical material — stressed metal, deep impacts · hard attacks with
honest decays · death cue owns the mix alone; nothing else survives
its onset.)*

**Inhibitor (the wrongness).** The sound of something that shouldn't
be in the signal. These cues don't play notes — they *interfere* with
them: static where tone should be, rhythms that stutter instead of
pulse, pitches that sit deliberately between the notes of the game's
scale so your ear can't file them anywhere. A Glitch is a tick of
corruption, brief and dry. A Swarm is many small wrongs overlapping.
A Vessel is the only one with a voice — low, sustained, slightly
detuned from everything else in the mix, the way a machine sounds when
it's pretending to breathe. Inhibitor sounds never resolve; they stop.
*(anchors: off-scale/microtonal placement · static and granular
material, no pure tones · dry truncated endings, never reverb tails ·
Vessel only: sustained low register, detuned. Analysis confirms
endings are cut, not faded.)*

**Player action (the ship answering).** Thrust, brake, grapple,
abilities: the ship is an instrument the pilot plays, and it answers
in kind — immediate, proportional, mechanical-musical. Effort sounds
like effort (heat building is audible strain), release sounds like
release. These are the most-repeated sounds in the game; they must be
almost boring on purpose, interesting only in aggregate.
*(anchors: middle-low register · mechanical material with a tonal core
· attack tied to input within one frame's perception · intensity maps
to the real delivered value (honesty rule) · quietest family by
default level.)*

**UI (the terminal).** The menus speak in taps and ticks — tiny,
dry, confident. A confirmation resolves; a refusal rubs two notes for
a moment and gives up; nothing whines, nothing celebrates. After the
400th press it should be furniture.
*(anchors: short — tens of milliseconds of body · quiet, dry, minimal
tail · built from the earcon grammar (§4) · destructive actions get
the darkest, lowest variant in the grammar.)*

## 3. The mix: a caste system with a quiet floor

**Priority is architecture, not hand-tuning.** Every sound belongs to
a tier — identity, signal, world — and the tiers duck automatically:
when a signal speaks, the world steps back; when the identity motif
carries a moment, both make room. No individual sound is ever "turned
up to be heard over" anything; if it can't be heard, its tier is
wrong or something above it is hogging the window.
*(anchors: numeric voice tiers on every registered sound · declared
ducking window per tier pair · world-tier content that falls below
the window is culled, not left rumbling. Practice: Wwise HDR /
Frostbite adaptive mixing, §10.3. Deterministic check: every cue has
a tier; no world sound exceeds a concurrent signal sound post-duck.)*

**The spectral budget.** Signals live where hearing is sharpest — the
2–5 kHz clarity band — spread across enough harmonics that no single
masked partial can kill the message. The world bed is carved *out* of
that band: it owns the depths and the air, never the center of the
ear.
*(anchors: signal fundamentals/formants in 2–5 kHz with ≥4 spread
partials (Patterson) · beds shelf-carved out of the signal band ·
FFT-checkable across the asset library. Practice: ISO 226 equal
loudness + critical-band masking, §10.5.)*

**States, not scores.** Music is a bed plus named layers, and the
layers enter on states a player could name — safe, contact, hunted,
extracting. Escalation is continuous (the dread parameter rises, gains
and detune follow), never a scripted stinger playlist.
*(anchors: every layer declares its entry state · dread is a 0–1
parameter driving layer gain/detune · state names shared with the
game's actual sim vocabulary. Practice: vertical layering (Hades),
parameter-driven dread (Alien: Isolation, Dead Space), §10.1/10.6.)*

**The silence floor.** Quiet is a feature with a budget. Every zone
has a named floor state that is genuinely near-silent — room tone and
breath, no bed — and the mix must pass through it regularly enough
that loud still means something. No new cue may be added to the game
without naming what it displaces.
*(anchors: floor state per zone, near-silent by contract · the
"what does it displace" question is part of every cue proposal ·
target ~20 dB of real dynamic range across a run. Practice: LIMBO's
restraint, Bridgett's dynamic-range argument, §10.7.)*

## 4. Signals: a small language, strictly grammatical

The game speaks at most **six immediate-action signals and two
attention signals** — that's the whole alarm vocabulary, capped by
design, and the cap is load-bearing: aviation warning research found
humans stop reliably distinguishing beyond that. Every signal is
built from the same tiny musical grammar (the game's intervals, the
game's rhythms), so a new signal sounds like a new *word* in a known
language, not a new language. Wrongness warnings are Inhibitor-family;
route signals are Route-family; there is no "generic alert" anywhere.
*(anchors: vocabulary cap 6+2 — adding a ninth requires retiring one ·
all signals derive from the shared grammar · fundamentals ~150–1000 Hz
with harmonics reaching the clarity band, distinctive in BOTH rhythm
and spectrum (Patterson, §10.4/10.5).)*

**Repetition discipline.** Any cue a player hears more than a few
times per run ships as a family of at least four takes, never the
same take twice in a row, each landing slightly differently — the way
a real object never makes exactly the same sound twice.
*(anchors: ≥4 round-robin variants per repeatable cue · no
back-to-back repeat · small pitch/level jitter within the family
fence · deterministically checkable: variant count and no-repeat
assertion per event. §10.4.)*

## 5. Loudness: measured, not vibed

The game masters to the industry couch standard: **−24 LUFS
integrated** over a representative recorded run for desktop, **−16
LUFS** for the Deck/handheld build, true peaks never above **−1
dBTP**. A script measures a recorded run; ears judge everything else.
*(anchors: ITU-R BS.1770 measurement · ASWG-R001 / EBU R 128 lineage,
§10.8 · tolerance ±2 LU · the measurement script is part of the
verification harness, run per RC.)*

## 6. The synthesis boundary

Synthesize where *variation* is the design; author where *identity*
is the design. Hazard proximity, creature voices, distance, and the
procedurally-reshuffled world get synthesis — that's where infinite
variation earns its complexity. The motifs, the extraction call, the
death sound — the things that must be *these exact notes* — are
authored assets, made once, with intent.
*(anchors: the boundary is declared per cue family in the inventory ·
synthesis lives in Timbre's deterministic bench + the runtime's
procedural Web Audio · authored assets follow the Stage A/B package
pipeline with manifests and rights labels. Practice: Paul Weir's No
Man's Sky lesson — hybrid wins, §10.10.)*

## 7. References: how taste becomes law

### 7.0 The founding reference

The original vision for LBH's sound AND its ASCII aesthetic is Nous
Research's *"The Ballad of Hermes"* — a generated song with an ASCII
music video made entirely by Hermes Agent
(x.com/nousresearch/status/2029978375880597911; video:
video.twimg.com/amplify_video/2029977207875993600/vid/avc1/1920x1080/OKQ-6BQYU4tHFtiC.mp4).
The prompt that allegedly generated it
(x.com/shl0ms/status/2032865970318884924), verbatim:

> warm, dark, slow, suspenseful, beautiful, punchy, downbeat,
> nostalgic, experimental, catchy, earworm, 2-minute composition,
> saturated, vocoded harmonized deep guttural throat singing, formant
> sweeps, swelling legato pads and 8-bit crunchy arpeggios, textured,
> searing contrapuntal fretless leads. simple chord progression.
> cyclic harmonic minor. circuit bending. lorenzo senni, moroder,
> the durutti column. omnichord, trautonium. retro video game
> soundtrack beat, dragging rhythm

Decomposed, this prompt is the guide's own anatomy — mode (`cyclic
harmonic minor`, simple progression), material (vocoded throat voice,
legato pads, 8-bit arpeggios, fretless leads, omnichord, trautonium,
circuit bending), envelope/rhythm (swelling, punchy, formant sweeps,
dragging retro-game beat), reference artists (Senni, Moroder, Durutti
Column), and form (2 minutes) — with mood adjectives as seasoning on
top. The founding song validates the hybrid spine empirically.

**Proposed (awaiting Greg's ratification with this guide):** the
founding reference seeds the identity — home pitch language in the
harmonic-minor family; the material palette candidates above
(vocoded/choral voice, warm pads, 8-bit grit, fretless lead, haunted
electro-mechanical instruments) as the game's core instrumentarium;
"dragging rhythm" as the tempo character. First Timbre task after
ratification: pull the video's audio, run full analysis, and propose
the founding entry's formal fence.

Greg's ears are the constitution; the reference library is its
amendments. The loop: **Greg sends a clip with one line of intent →
Timbre analyzes it and proposes** what it anchors (which family, which
motif, what the fence becomes) with a before/after against current
law → **Greg ratifies** → the library and this guide update. Nothing
becomes law without the ratify step. References are described in this
guide's voice — the human sentence carries the meaning; the analysis
rides underneath.
*(anchors: library lives beside the listening sheet with provenance
per clip (source, rights posture, date, what it governs) · proposals
follow the intake template Timbre defines · fences move only through
this loop.)*

## 8. Review rubric — verdicts by listening

A review answers each check by **listening to a capture** (a recorded
run or cue audition), with scripts only where noted. Verdict language:
`SHIP / SHIP WITH WAIVER (ids) / REWORK (gate ids)`.

| ID | Gate? | Check (answer by listening) | FAIL when | What to do |
|---|---|---|---|---|
| A1 | ✅ | Three-notes test: is this recognizably Last Singularity? | A cue could belong to any space game | Rebuild from a motif transformation, not from scratch |
| A2 | ✅ | Does every signal cut through at couch volume? | Any signal masked by bed/identity at −24 LUFS playback | Fix the tier or the spectral carve — never boost the cue |
| A3 | ✅ | Is the family voice held? | A cue breaks its family's material/register/ending law (e.g. an Inhibitor sound that resolves) | Re-voice within the family fence |
| A4 | | Signal vocabulary within cap? | >6 action + >2 attention signals live | Retire one before adding one |
| A5 | | Repetition fatigue: play the cue 20× | Identical takes back-to-back, or the 20th play annoys | Add variants / re-jitter / quiet it |
| A6 | ✅ | The silence floor exists and recurs | A full run recording never drops to the floor state | Restore the floor; name what each added cue displaced |
| A7 | | Loudness script over a recorded run | Outside target ±2 LU, or true peak above −1 dBTP | Master pass, not per-cue gain chase |
| A8 | | Honesty: does intensity match the sim value it voices? | Audio dramatizes what the game didn't do | Tie the parameter to the real delivered value |
| A9 | | Provenance: manifests + rights labels complete | Any asset without provenance class/rights status | Complete the manifest before the asset ships |

Review output format matches the UI guide's: capture set, FAIL table
(`ID — evidence — remedy`), verdict line. Re-reviews re-check failed
IDs + A1.

## 9. Custody and boundaries

Timbre owns this guide after ratification and its audible companions
(listening sheet, reference library). Lyrics and narrative wording:
Troubadorb. UI surfaces the cues serve: Mosaic coordinates timing and
restraint. Runtime integration: Forge via the bindings contract.
Substantive amendments — new motifs, moved fences, new signals —
require Greg's ratification through the §7 loop.

## 10. Sources (the practice this stands on)

1. Vertical/horizontal dynamic music — M. Sweet, *Writing Interactive
   Music for Video Games*; Audiokinetic dynamic-music design docs;
   W. Phillips, *A Composer's Guide to Game Music* (MIT Press).
2. Motif economy / timbre-swap identity — Darren Korb on Hades (JSMG
   interview; instrumentation coverage).
3. Mix priority / HDR — Audiokinetic Wwise HDR best practices; DICE,
   "Adaptive Mixing in Frostbite" (GDC 2007); Returnal mix coverage
   (A Sound Effect).
4. Earcons/auditory icons + warning caps — Blattner et al. 1989;
   Gaver 1986; R. Patterson, auditory warning guidelines (Phil.
   Trans. R. Soc. 1990).
5. Psychoacoustics — ISO 226 equal-loudness; critical-band masking.
6. Parameter-driven dread — "Building Fear in Alien: Isolation" (GDC
   2015); Dead Space fear emitters.
7. Silence/restraint — M. S. Andersen on LIMBO (Designing Sound);
   R. Bridgett, "Dynamic Range: Subtlety and Silence in Video Game
   Sound."
8. Loudness — Sony ASWG-R001; EBU R 128 / ITU-R BS.1770.
9. Roguelike/extraction adaptive audio — Hades; Returnal procedural
   ambience (S. Gumbleton); Hunt: Showdown audio-readability posts.
10. Synthesis-first practice — P. Weir, "The Sound of No Man's Sky"
    (GDC 2017); Ape Out (M. Boch).

---

## Appendix A — v0.3 runtime binding and production state

This appendix is the normative v0.3 attachment to the style guide. It carries
the existing runtime specifics forward without turning this guide into a
second cue sheet. On a conflict, `docs/v0.3/audio-cue-sheet.md` and
`docs/v0.3/audio-soundscape-contract.md` remain runtime truth until Greg
ratifies a replacement; this appendix is the binding Timbre direction for
authored treatments and review.

### A.1 Spectrum, duration, and headroom

| Family | Frequency / space | Runtime duration and policy |
|---|---|---|
| Void / fabric bed | 35–300 Hz weight; filtered 1–3 kHz particulate | 8–30 s crossfades; one base and at most one texture layer |
| Route / navigation | 500 Hz–2.5 kHz, narrow and clear | 70–650 ms gesture; held portal presence is spatial, never a reminder chirp |
| Player action | 120 Hz–1.6 kHz, panned but speaker-stable | control-rate continuous voice plus one transient maximum |
| Salvage | 650 Hz–3.2 kHz, softened upper partials | **100–550 ms runtime ceiling**; one privacy-filtered pickup gesture |
| Consequence | 45–250 Hz body plus a selective 1.2–4 kHz edge | hard, dry attack; state transitions may last 0.5–4 s |
| UI | 700 Hz–2.8 kHz, dry and near-center | 25–180 ms except launch/result settles |
| Results / pause | sparse 80 Hz–1.2 kHz, reduced stereo motion | 0.6–3 s settle; no score-counting cadence |

The older 100–900 ms figure described an authored-review envelope, not a
runtime admission allowance. It is withdrawn for salvage: every runtime
salvage cue is 100–550 ms. A longer source render may exist only as an
unintegrated review/reference tail, is not a cue candidate until edited to the
ceiling, and may not be used to bypass the cue spec.

Protect 2–4 kHz for brief critical/UI intelligibility and keep bass below
140 Hz mono-compatible. Source-layer masters target **−3 dBFS sample peak**
before the runtime/master chain. Final captured delivery separately obeys §5's
−1 dBTP true-peak ceiling and platform LUFS targets; neither target replaces
the other.

### A.2 Runtime inventory, variation, and authority

The normative live cue inventory is `src/audio/cue-spec.js` (`CUE_SPECS`):
`loot`; `slingshotEngage`, `slingshotRelease`; `portalProximity`,
`portalReady`, `portalAbort`, `portalFinal`, `portalConfirm`, `extract`;
`death`; `pulse`, `shieldActivate`, `shieldAbsorb`, `breachFlare`;
`starConsumed`, `scavengerBump`, `scavDeath`; `inhibitorGlitch`,
`inhibitorWake`, `inhibitorVessel`, `inhibitorFinalPortal`;
`fabricWaveTelegraph`; `hullWarning`, `fuelWarning`, `signalWarning`;
`pause`, `resume`, `results`; and `menuMove`, `menuConfirm`, `menuBack`,
`tabSwitch`, `sellItem`, `equipItem`, `upgrade`, `cantAfford`, `launch`.
That file, not a copied row list, owns each cue's bus, priority, cooldown,
voice cost, spatiality, and duration.

Repeated UI, movement, impact, and salvage events use at least four
round-robin takes where authored takes exist: no adjacent repeat; small
within-family pitch/level offsets only; interval, family, and semantic role do
not change. Captureable choices derive deterministically from event ID/run
seed using the existing `src/rng-stream.js` helpers. Nonsemantic particulate
texture may vary freely only when it cannot alter a cue's identity or result.
Audio remains presentation: `AudioRouter` is the authority-event entry;
authoritative events render at most once; snapshots control only already-owned
continuous voices; contact identity comes only from admitted audible-contact
records; spatial helpers come from `src/coords.js`.

### A.3 Authored production state

**Stage A — ratified direction:** `lbh_direction_restraint`, **32 s, 82 BPM,
D Dorian**. Sparse subharmonic floor, particulate fabric breath, and an
occasional glass route cell protect Shallows navigation and make later melody
meaningful. **Direction B is rejected for the first vertical:**
`lbh_direction_assertive`, 32 s, 96 BPM, D minor; its tracker-adjacent melody
and pulse crowd the learning space. This is a recorded design decision, not a
new choice in this revision.

**Stage B — produced original review material:** `lbh_title_theme`,
`lbh_pregame_suite`, `lbh_shallows_phase_1`, `lbh_shallows_phase_4`,
`lbh_results_extract`, and `lbh_results_death`. These are deterministic
original renders/review material, not an assertion that files are bound into
the runtime. Expanse/Deep Field adaptive suites, phases 2–3, transitions,
alternate results, and the remaining authored mappings are Stage C and must
not be claimed complete.

### A.4 Binding claim and change control

This is a **draft submitted to Greg for ratification**. Until ratified it is
not a runtime-integration authorization and it does not supersede the cue
sheet or soundscape contract. Once ratified, §§0–10 plus this appendix bind
Timbre-authored direction, reference intake, motif/family treatment, and
review; Forge remains the runtime-binding owner. New motifs, moved fences, new
signals, source assets, runtime duration changes, or a replacement of either
runtime source require a recorded proposal and Greg's ratification. Human
listening and device acceptance remain Greg's gate; a mechanical check cannot
manufacture that verdict.
