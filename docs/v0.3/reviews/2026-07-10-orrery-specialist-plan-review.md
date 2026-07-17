# Orrery Review — v0.3 Specialist Plans (Palette, Timbre, Troubadorb)

> Date: 2026-07-10. Reviewer: Orrery. Branch: `codex/v0.3-ballpark-roadmap`.
> Scope: `docs/v0.3/plans/2026-07-10-palette-art-direction.md`,
> `docs/v0.3/plans/2026-07-10-timbre-soundscape.md`, and the requested
> `docs/v0.3/plans/2026-07-10-troubadorb-theme-text.md`.

## Verdict

Two of the three plans exist, and both are strong — grounded in real source,
correct about the authority boundary, and honest about what automation cannot
prove. The third plan (Troubadorb theme/text) **was never written**: its
overnight branch `overnight/20260710-230616-troubadorb-plan` has zero commits
and a clean worktree. That lane's output is a reconstruction (see below), not a
review of specialist work.

The plans are approvable **as post-candidate polish plans**, with the
amendments integrated in each file. They are not approvable as
pre-promotion gate work: the v0.3 candidate is green, and the only remaining
gates are physical-Deck evidence and Greg's feel/taste verdict. Both plans
exist to serve that verdict, so the verdict comes first — Greg's review should
*direct* the art and sound passes, not audit them after the fact.

Three things are moving here, and two of them are about to intersect. The
palette lane and the timbre lane both need the same new presentation facts
(portal state, wreck state, player motion state), and both plan to edit
`src/main.js`, the largest and highest-conflict file in the repo. Right now
the plans don't know about each other. The amendments below make the
conjunction explicit before the shape sets.

## What was verified

Every load-bearing source claim in both plans was checked against the
integration branch on 2026-07-10.

### Palette plan — claims confirmed

- `src/render-three/entities/world-sprite-visual-family.js:31-32` maps both
  `fauna` and `sentries` to the single `sentryFauna` asset. The S0 category
  failure is real.
- `src/render-three/visual-style.js:36` sets wreck `matteRadius: 2.35`.
- `src/render-three/entity-assets.js:44-48` selects portal assets from
  `visualState`/`variant` only.
- Player sprite radius `0.044` in `player-visual-family.js:32`; star `0.045`,
  fauna `0.018 + size * 0.003`, sentry `0.027` as quoted.
- All sixteen runtime entity PNGs, `well-instrument.png` and
  `inhibitor-shard.png` as reference-classified assets, the three source
  atlases, and every cited design doc exist.

### Palette plan — one claim corrected

The plan's second S0 finding ("the visual test command is not currently
executable") is a **worktree environment artifact, not a product defect**.
`sharp` is a declared devDependency and is installed in the integration-branch
checkout; `npm run test:full` (which includes the visual lane) passed on this
branch on 2026-07-10 per `RC-GATE.md`. The overnight `/tmp` worktree simply
lacked `node_modules`. Task 1 is reframed in the plan: provision the
implementation worktree (`npm ci`), confirm the lane is green, and only then
treat any residual failure as a real blocker. It stays a prerequisite; it is
no longer an S0 product finding.

### Timbre plan — claims confirmed

- `src/audio.js` (1072 lines) matches the described topology: voices →
  `duckGain` → SNES filter stack → crusher → echo → master, with
  `EventVoiceBudget`, four well voices, one Inhibitor voice, and broad one-shot
  cue branches.
- `src/config.js:392-408` is the audio config block; `src/dev-panel.js`
  exposes exactly five broad audio knobs.
- `playAuthoritativeEvent` consumption begins at `src/main.js:2381`; local
  cue calls exist in the cited ranges (e.g. `scavDeath` at 5369); ~40 direct
  `playEvent(` call sites confirm the
  scattered-call-site finding.
- `DEATH_LINGER_DURATION = 1.2` at `src/main.js:363` — the 1.2 s near-silence
  design hook is real.
- The audio workbench tools, docs, and the three cited target-visual frames
  all exist. `run-results.js:63` renders `COLLAPSED` for the collapse cause,
  matching the plan's language.

### Timbre plan — one claim corrected

`EVENT_AUDIO_SPECS` in `src/audio-events.js` declares **ten** cue specs, not
"seven" (loot, slingshotEngage, slingshotRelease, portalProximity,
portalConfirm, extract, scavengerBump, inhibitorGlitch, inhibitorWake,
inhibitorVessel). The direction of the finding — coverage is a small subset of
what `main.js` handles — still holds. Corrected in the plan.

### Troubadorb plan — missing

`overnight/20260710-230616-troubadorb-plan` sits at the base commit `f4b6cfb`
with a clean tree; no plan file exists anywhere in the repo or in dangling git
objects. The lane's surface is real and needed: the title says
`LAST SINGULARITY` (`src/main.js:3319`), 65 named items live in
`src/content/items.data.json`, hulls/rigs/signatures carry authored names in
`src/content/*.data.json`, `src/text-corruption.js` owns the Inhibitor's
language damage, and both other plans lean on color-role words (cyan, amber,
red, magenta) that no glossary currently pins down. I have written a
reconstructed plan at `docs/v0.3/plans/2026-07-10-troubadorb-theme-text.md`,
clearly marked as an Orrery reconstruction pending ratification. It is
deliberately narrower than the other two.

## Findings

### F1 (structural) — Shared presentation facts have two prospective owners

Palette Task 6 adds portal/wreck/player-motion state facts "at the
presentation boundary." Timbre Tasks 2/5/6 need the same facts (portal
ready/blocked/expiring/final, abort edges, thrust/brake/coast, run pressure).
If each lane adds its own shape to `src/presentation/presentation-frame.js`,
the game ends up with two vocabularies for one truth — a gear slipping in
slow motion.

**Position:** one shared pre-task ("Task 0" in both plans) defines the
presentation-fact schema once. The **palette lane owns**
`presentation-frame.js` and `presentation-style.js` writes; the timbre lane
consumes facts read-only and files schema requests against the palette lane's
Task 0 rather than editing the boundary itself. Quality-tier degradation for
audio keys off the same presentation quality tier the renderer uses — no
second quality knob.

### F2 (structural) — `src/main.js` is a three-lane collision

Palette edits draw/frame call sites; timbre rewrites the event and menu cue
call sites (that's the point of its router); troubadorb ultimately touches
player-facing strings. A 6,589-line file with three simultaneous editors
violates the AGENTS.md parallel-agent rule directly.

**Position:** ownership by region, sequenced. The **timbre router slice lands
first** — it *removes* ~40 scattered call sites and shrinks the conflict
surface for everyone after it. Palette rebases its `main.js` draw-path edits
after the router merge. Troubadorb's string sweep lands **last**, as a
mechanical pass over settled code. Each lane works on a child branch off the
integration branch and merges promptly per AGENTS.md cadence.

### F3 (sequencing) — Both plans add scope to a green candidate

`RC-GATE.md` records source and packaged candidates green; the remaining gates
are evidence and Greg's calls. Landing either plan's code invalidates that
evidence.

**Position:** split each plan into a doc/evidence wave and a code wave.
Doc-only tasks (palette Tasks 2–3, timbre Task 1, troubadorb glossary/voice
inventory) may proceed now in parallel — they sharpen Greg's review rather
than churning under it. All code waves wait for Greg's feel/taste verdict
(Open Decisions 1–2), which sets priorities among these passes. Any landed
code slice re-opens the automated candidate gate: rerun the full
`RC-GATE.md` candidate lane before any renewed RC claim. RC-GATE edits go
through the integrator, not per-lane commits (timbre Task 8 amended
accordingly).

### F4 (shared test surface) — Four test files have multiple writers

`tests/agent-play-eval.cjs`, `tests/perf-probe.cjs`, `tests/ui-motion*.cjs`,
and `tests/suite-manifest.cjs` appear in both plans' modify lists.

**Position:** additions are append-only, labeled per lane (a clearly named
section or fixture per lane), and each lane runs the full affected suite
before merge. `suite-manifest.cjs` registrations are one-line and low-risk;
everything else follows the F2 sequencing.

### F5 (terminology) — Small drift, worth pinning now

- **Amber vs gold.** The palette plan uses both for the value color. Ruling:
  **amber** is the semantic value/salvage color everywhere (docs, cue sheet,
  strings); "gold" may appear only as a raw description of source-art pixels.
  Timbre already says amber consistently.
- **One thesis, three renderings.** Palette: "the failing astronomical
  instrument." Timbre: "a damaged instrument panel listening to a dying
  ocean." These mesh — they are the same product metaphor seen and heard. The
  shared identity is named **"the failing instrument"** and the troubadorb
  plan writes text to the same metaphor. Each plan keeps its own rendering;
  none may drift to a different metaphor without changing all three.
- **Executor naming.** The palette plan is addressed "For Hermes"; the timbre
  plan names no executor. Lane-to-executor routing is Greg's call (naming
  canonical things); the plans now say "assigned implementer" with the Hermes
  note retained as a proposal.
- **Product name.** Player-facing text says Last Singularity; the repo path
  saying `last-black-hole` is implementation history. The troubadorb plan owns
  enforcing this in strings.

### F6 (approval boundaries) — Two palette items need Greg's explicit sign-off

Breacher's resting-palette retint and any replacement of
`world-entities-atlas.png` (including new fauna/sentry cells) change shipped
visual identity while Greg's visual verdict is an open decision he owns. The
plan already says "after approval"; it now says whose: **Greg's**. Same for
timbre's user-facing volume-control persistence ("after product/UI review" →
Greg).

### F7 (minor corrections integrated)

- Timbre plan's verification commands referenced the `/private/tmp` overnight
  worktree; corrected to repo-relative.
- Timbre Task 4's seeded variation should reuse the existing deterministic
  RNG (`src/rng-stream.js` — `mulberry32`/`hashString`, already mirrored
  client/server) rather than inventing a new scheme.
- Splitting `src/audio.js` (1,072 lines) into `src/audio/*` modules is
  consistent with the repo's ~500-line rule — endorsed, not just permitted.
- Palette Task 3's style-guide expansion should reconcile with the existing
  `docs/design/VISUAL-DENSITY.md` and `VISUAL-SCALE.md` rather than creating
  parallel density/scale rules.

## Rejected recommendations

1. **Palette S0-2 as a product blocker — rejected as framed.** The
   `test:visual` failure is worktree provisioning, not source truth. Kept as a
   Task 1 prerequisite, removed from the S0 severity tier.
2. **Timbre's optional committed recipe JSON under `assets/audio/recipes/` —
   rejected for v0.3.** No authored runtime asset exists; cue recipes live in
   `src/audio/cue-spec.js` where tests can reach them. Revisit only when an
   approved authored asset actually needs packaging.
3. **Timbre's option to put browser audio coverage in `tests/smoke.cjs` —
   rejected.** Smoke stays fast and universal; audio browser assertions get a
   dedicated focused lane, as the plan's own Task 8 step 1 already prefers.
4. **Any pre-verdict code landing — rejected** per F3. This includes
   "harmless" retunes; a tuning pass is a code wave.

## Lane ownership map (post-integration)

| Surface | Palette | Timbre | Troubadorb |
|---|---|---|---|
| `src/render-three/**`, `src/ui/**` (draw), `assets/**`, `scripts/build-visual-assets.cjs` | **owns** | — | — |
| `src/presentation/presentation-frame.js`, `presentation-style.js` | **owns (Task 0)** | consumes read-only | — |
| `src/audio.js`, `src/audio-events.js`, new `src/audio/**` | — | **owns** | — |
| `src/config.js` | — | **owns audio block only** | — |
| `src/dev-panel.js` | — | **owns audio rows only** | — |
| `src/main.js` | draw/frame call sites, after router lands | **event/menu cue call sites, lands first** | string literals, lands last |
| `src/content/*.data.json` names/descriptions, `src/text-corruption.js` vocabulary | — | — | **owns** |
| Visual design docs | **owns** | — | reviewed for glossary terms |
| Audio docs (`docs/v0.3/audio-*.md`) | — | **owns** | reviewed for glossary terms |
| Glossary / voice guide / string inventory | consumes | consumes | **owns** |
| Shared tests (F4 files) | append-only labeled | append-only labeled | append-only labeled |
| `docs/v0.3/RC-GATE.md` | integrator only | integrator only | integrator only |

## Recommended sequence

1. **Wave 0 (now, parallel, docs only):** palette Tasks 2–3 (evidence board +
   style guide), timbre Task 1 (contract + cue inventory), troubadorb Tasks
   1–3 (glossary, voice guide, string inventory). No production code.
2. **Gate:** Greg's feel/taste review (Open Decisions 1–2) and troubadorb
   plan ratification. His verdict sets priorities across all three lanes.
3. **Wave 1:** palette Task 0 (shared presentation facts), then timbre Task 2
   (router — the `main.js` de-scattering) and palette Tasks 4–6 on child
   branches; timbre's router merges before palette's `main.js` edits.
4. **Wave 2:** timbre Tasks 3–6, palette Tasks 7–8, in parallel (disjoint
   surfaces per the map).
5. **Wave 3:** troubadorb string sweep; both evidence tasks (palette Task 9,
   timbre Tasks 7–8); rerun the full automated candidate gate; update
   RC-GATE through the integrator.

## What is well-built

Worth saying plainly: both plans hold the authority line without exception —
every new visual and audio behavior consumes sim truth through the
presentation boundary, coordinates stay in `src/coords.js`, and neither plan
lets automation impersonate taste. The timbre plan's "intentional silence"
section and the palette plan's read-order test are the right shape: they
define what *loses* when signals conflict, which is the part most plans skip.
The gears mesh. With the conjunctions above made explicit, these lanes can
run in parallel without grinding.
