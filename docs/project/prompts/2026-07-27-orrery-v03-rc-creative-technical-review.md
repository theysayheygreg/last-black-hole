# Orrery Prompt: v0.3.1 RC Creative And Technical Review

> E3 bundled milestone review for Orrery. Produce one opinionated review memo,
> not code, implementation, or another exhaustive test run.

## Purpose

Last Singularity v0.3.1 has reached a coherent multi-system checkpoint: held
slingshot movement, propulsion Heat, revised loadout/results readability, Noise
Radius v1, an accumulating Glitch/Swarm/Vessel ecology, persistent well
overdrive, and exfil guidance that is heard through the same Noise contact
grammar as other world emitters.

Judge whether those systems now form one legible and tense extraction-game
language. This is an early private indie game. Be demanding about play,
readability, atmosphere, iteration cost, and gameplay truth; reject speculative
production, security, generalized reliability, and framework work that does
not help the current game.

Write the memo to:

`docs/project/reviews/2026-07-27-orrery-v03-rc-creative-technical-review.md`

## Pinned Source And Milestone

- Branch: `codex/v0.3-ballpark-roadmap`
- Product source: `a958a8c68b6c9f14054fe012882326dcae32f910`
- Build label: `0.3.1.a958a8c6`
- Milestone range:
  `5f75c7d1c9730f31a99214d2529668154e81e840..a958a8c68b6c9f14054fe012882326dcae32f910`
- Range starts with held-action slingshot release and includes:
  - `5f75c7d1` held slingshot release;
  - `9b34e1a5` propulsion Heat;
  - `01e9655c` loadout/results readability;
  - `f5ca94c9` Noise Radius v1 foundation;
  - `f108285e` current Noise/Inhibitor design ownership;
  - `87a85310` / `2bb78ed4` accumulating Glitches;
  - `ba0bd343` Noise-hunting Swarms;
  - `8e64b0da` Vessels and persistent well overdrive;
  - `a3d6db24` collection presentation and audible contacts;
  - `a958a8c6` omitted-contact expiry and cumulative ecology results.

The later documentation evidence commit is not product source. Review gameplay
and package identity against `a958a8c6`.

## Machine Evidence

### Candidate gate

`npm run test:full -- --no-retries` ran once from a stopped stack:

- result: red;
- 86 passed / 33 failed / 119 suites;
- 300.10s wall time; 439.31s summed suite time;
- zero retries;
- first red: Validation expected retired `u_inhibitorForm`;
- remaining red categories: retired pre-Noise and portal-block expectations,
  missing isolated-worktree dependencies (`three`, `sharp`,
  `@electron/packager`), browser `__TEST_API` bootstrap cascades, and two
  host-timing cadence checks (14.53 Hz and two lost Deep Field deadlines).

No isolated product boot failure was established, but this is not a green RC.

Evidence:

- `/private/tmp/lbh-v03-rc-a958a8c6-full-20260727T235200Z/test-full.log`
  - SHA-256:
    `6ff1aaeb191fe3bb4d10f6b536579539e79876d8ee91c17192d25d49ceed2718`
- `/private/tmp/lbh-v03-rc-a958a8c6-full-20260727T235200Z/summary-lines.txt`
- `/private/tmp/lbh-v03-rc-a958a8c6/tmp/harness-artifacts/1785196327317-8890`
- `/private/tmp/lbh-v03-rc-a958a8c6/tests/screenshots/agent-play-eval-2026-07-27T235331801Z/`

Do not reinterpret stale or infrastructure failures as product regressions
without tracing them to current source. Do not reinterpret a red full lane as a
green release candidate.

### Build and package

After the full lane had run, the immutable source used the release tool's
supported `--skip-tests` artifact path once:

- `release:internal -- --skip-tests`: green, about 26s;
- `release:status`: hash-named release present;
- `test:package`: green, about 28s, including staged authority boot and
  release-package closure.

Artifact root:

`/private/tmp/lbh-v03-build-a958a8c6/builds/v0.3.1.a958a8c6`

Targets:

- web:
  `/private/tmp/lbh-v03-build-a958a8c6/builds/v0.3.1.a958a8c6/last-singularity-web`
  (24M);
- iPad:
  `/private/tmp/lbh-v03-build-a958a8c6/builds/v0.3.1.a958a8c6/last-singularity-ipad-webapp`
  (24M);
- macOS:
  `/private/tmp/lbh-v03-build-a958a8c6/builds/v0.3.1.a958a8c6/Last Singularity.app`
  (286M);
- Windows:
  `/private/tmp/lbh-v03-build-a958a8c6/builds/v0.3.1.a958a8c6/Last Singularity-win32-x64`
  (367M);
- Linux:
  `/private/tmp/lbh-v03-build-a958a8c6/builds/v0.3.1.a958a8c6/Last Singularity-linux-x64`
  (320M).

Playtest archive:

- `/private/tmp/lbh-v03-build-a958a8c6/builds/last-singularity-playtest-v0.3.1.a958a8c6.zip`
- 441,826,786 bytes
- SHA-256:
  `3f001bc1ce15dafcdd57af395084a810258c651c8045dc8d44cb3b6b4cac9b31`

Payload identity:

- macOS/Windows/Linux `app.asar` SHA-256:
  `42a6959d5a438ae6d754b653c916239b7d4a01864b2ca6994ed19f2bb0f35374`;
- macOS executable:
  `f99a091f985fdf40d0ff56b6c64568b62db488715d96b33bf259bf4b082a9b1f`;
- Windows executable:
  `99fc5c1323ced50ead5944158c808e6c239f9d50cd07334aa2cb085bd4b1308b`;
- Linux executable:
  `b0d127772d2983a93771055a93b673d5fdd1726d6e47db8e269b204e665972d6`.

No Deck deployment or physical acceptance occurred.

## Read First

Current design and release truth:

- `docs/v0.3/noise-radius-v1.md`
- `docs/v0.3/inhibitor-ecology-v2.md`
- `docs/v0.3/RC-GATE.md`
- `docs/v0.3/ROADMAP.md`
- `docs/v0.3/OPEN-DECISIONS.md`
- `docs/v0.3/CHANGELOG.md`
- `docs/design/PILLARS.md`
- `docs/design/MOVEMENT.md`

Authority and shared tuning:

- `scripts/sim-runtime.cjs`
- `scripts/sim/inhibitor-ecology.cjs`
- `scripts/sim/noise-radius.cjs`
- `scripts/sim/slingshot-contract.cjs`
- `scripts/sim/public-snapshot.cjs`
- `src/content/movement.data.json`
- `src/content/noise.data.json`
- `src/content/hulls.data.json`

Player presentation:

- `src/main.js`
- `src/hud.js`
- `src/slingshot.js`
- `src/run-results.js`
- `src/presentation/audible-contact-memory.js`
- `src/presentation/heat-instrument.js`
- `src/presentation/presentation-frame.js`
- `src/render-three/world-scene-presentation.js`

Focused evidence:

- `tests/slingshot-input-path.cjs`
- `tests/fuel-recovery.cjs`
- `tests/noise-radius.cjs`
- `tests/inhibitor-ecology.cjs`
- `tests/presentation-frame.cjs`
- `tests/agent-play-eval.cjs`

## Questions To Answer

1. Does held slingshot, propulsion Heat, emitter-owned Noise, accumulating
   Inhibitors, well overdrive, and audible exfil read as one extraction-game
   grammar, or as disconnected meters and enemy systems?
2. What will Greg most likely feel or misunderstand in the first RC session?
   Judge thrust and cooling cadence, held-orbit release, audible contact memory,
   identity/range language, late-match crowding, well overdrive, exfil
   discovery, map-scale navigation, and 1280x800 Deck readability.
3. Does the current art and sound language preserve the ASCII-fluid world,
   cyan extraction, magenta corruption, procedural dread, and Dread Over
   Difficulty while keeping actionable state legible?
4. Which current technical seams materially harm iteration, gameplay truth,
   frame cost, packaged behavior, or likely multiplayer reuse? Exclude
   hypothetical production/security/reliability concerns and generalized
   architecture cleanup.
5. Which contradictions, missing feedback, or tuning risks deserve attention
   before another RC, and which should wait for human play rather than code?
6. What are the strongest next two v0.3 development verticals after Greg's
   human RC play? What should deliberately wait for v0.4?

## Deliverable

Write one opinionated memo to:

`docs/project/reviews/2026-07-27-orrery-v03-rc-creative-technical-review.md`

Include:

- a concise verdict on the creative whole;
- at most eight prioritized findings;
- classification for each finding:
  `blocker`, `fix-forward`, `backlog`, or `Greg decision`;
- exact source evidence for each finding;
- the smallest playable next action for each finding;
- a strong recommendation for the next two v0.3 verticals;
- a short list of work that should wait for v0.4;
- a separate machine-evidence section and taste section.

Do not provide neutral option soup. State what you would do.

## Guardrails

- Read-only review: no implementation, tests, branch changes, build changes,
  broad architecture redesign, merge, promotion, or cross-version work.
- Do not claim the build was played unless you actually play it. If your
  environment cannot play or inspect a surface, label that limitation.
- Do not convert stale harness expectations into product findings without
  current source evidence.
- Do not recommend speculative production security, reliability, failover,
  migration, or generalized framework work for this private indie-game RC.
- Preserve server/sim gameplay truth and renderer-neutral presentation.
- Preserve **Art Is Product**, **Movement Is the Game**, **Noise Is
  Consequence**, **Universe Is the Clock**, **Dread Over Difficulty**, and
  **Run It Twice**.
- Treat human feel, visual taste, audio quality, and physical Deck acceptance
  as Greg gates, not machine facts.
- This is one bundled milestone review, not a review of each commit.
