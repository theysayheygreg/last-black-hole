# Orrery Prompt: v0.3.1 Scale And RC Follow-Up Review

> Bundled E2/E3 implementation review. Produce one opinionated read-only memo,
> not code, another test run, or a per-commit review.

## Purpose

Review the playable scale correction made after the prior v0.3.1 RC memo.
Judge whether movement, perception, pursuit, and extraction navigation now use
one coherent ruler, whether the current machine evidence is described
honestly, and whether Greg should put this build on the physical Steam Deck.

Write the requested memo to:

`docs/project/reviews/2026-07-28-orrery-v03-scale-rc-followup-review.md`

This is an early private indie game. Be demanding about play, readability,
atmosphere, iteration speed, and gameplay truth. Reject speculative security,
generalized recovery, production-service, and framework work that does not
help the current game.

## Pinned Comparison

- Branch: `codex/v0.3-ballpark-roadmap`
- Original reviewed product source:
  `a958a8c68b6c9f14054fe012882326dcae32f910`
- Original Orrery memo:
  `docs/project/reviews/2026-07-27-orrery-v03-rc-creative-technical-review.md`
- Final implementation/product source:
  `61ecc534a0a90bb64d360ee85850ddcb21feb8ef`
- Implementation range:
  `a958a8c68b6c9f14054fe012882326dcae32f910..61ecc534a0a90bb64d360ee85850ddcb21feb8ef`
- Test-only descendant:
  `6f0ca0ecba48f50dd83061bb9d10da5d255a5089`
  (retires one stale blocked-portal lifecycle expectation)
- Build label: `0.3.1.61ecc534`

The later evidence/prompt commit is documentation-only. Review gameplay and
package identity against exact source `61ecc534`.

## Implemented Result

### One scale

- Camera view: `3.0` world units.
- Physical scale: `1000m` per world/simulation unit.
- Reference frame: `1280x800`, with a `20px` edge margin.
- The nearest off-screen edge is derived from those live owners as `1425m`;
  it is not a separately authored gameplay constant.
- World-emitter radii: Glitch `1600m`, Swarm `2200m`, Vessel `3200m`, EXFIL
  `4200m`.
- Swarm speed by state: silent `0.25`, light `0.6`, heavy `1.1`, flare `1.6`
  world units/s.
- Vessel speed: `0.5` world units/s.
- `cadenceSeconds` affects restrained contact-pulse alpha only. It never
  toggles gameplay audibility.

The canonical data owners are `src/content/noise.data.json` and the existing
camera/physical-unit sources consumed by its adapters. The authority still
owns movement, ecology, and world truth.

### Contact and navigation language

- EXFIL/extraction contacts use cyan.
- Glitch, Swarm, and Vessel contacts use the magenta/anomaly family.
- Other audible contacts remain neutral rather than borrowing extraction
  identity.
- Before a true active EXFIL emitter is heard, the aperture rail reads
  `ROUTE: LISTEN` and reveals no omniscient distance.
- Hearing `EXFIL TONE` unlocks the nearest active aperture distance in
  canonical `m`/`km`. Discovery remains earned for that authority run even
  after the short contact memory fades.
- Optional standard/unstable/rift portals do not emit EXFIL and cannot unlock
  route discovery.
- Empty `HEARD`/`TRACKED`/`LOCKED` counters collapse. Existing authoritative
  heard/tracked seconds appear in results.
- The slingshot tuning surface presents the accepted `50 ms` coyote value and
  fixed `267 ms` transport allowance separately.
- Full-HUD per-frame jitter/filter was removed; the slower ecology pulse
  remains.

### Deliberate deferrals

- Player hearing remains presentation-side for this private v0.3 model.
  Server-side hearing migration is deferred until multiplayer reuse or proven
  gameplay truth requires it.
- No generalized perception framework, recovery architecture, production
  service work, or broad security/reliability program was added.
- Settled 15 Hz movement, physical units, held slingshot design, Heat,
  map-relative schedule, accumulating ecology, and aperture discovery were not
  reopened.

## Current Machine Evidence

### One no-retry full candidate gate

Exact product source `61ecc534` ran once from a clean, normally provisioned
isolated worktree:

- command: `npm run test:full -- --no-retries`;
- result: red;
- 112 passed / 7 failed / 119 suites;
- 387.89 s wall time; 570.02 s summed suite time;
- zero retries.

Current product-path failures:

- `RulerLive`: timed out waiting for authoritative slingshot engagement;
- `SlingshotV2Live`: timed out waiting for live selected-well lock;
- `AgentPlayEval`: timed out waiting for `player.slingshotEngaged`.

Stale-contract failures:

- `ThreeEntityLifecycle`: old blocked-portal visual expectation, corrected in
  test-only descendant `6f0ca0ec`;
- `Systems`: old HUD DOM contract;
- `RunResults`: old Signal/scalar-Inhibitor result copy;
- `RemoteAuthority`: old scalar-Inhibitor debug and Signal expectation.

Evidence:

- receipt:
  `/private/tmp/lbh-v03-orrery-rc-61ecc534-receipt-20260728T011650Z`;
- full log:
  `/private/tmp/lbh-v03-orrery-rc-61ecc534-receipt-20260728T011650Z/full-run.log`
  (SHA-256
  `d674fedec8ec14a946b1a06a92d0c4f9f9128c09440d28f1d1b6d5d2c761b9fd`);
- AgentPlay evidence:
  `/private/tmp/lbh-v03-orrery-rc-61ecc534/tests/screenshots/agent-play-eval-2026-07-28T011834914Z/`;
- controller capture:
  `/private/tmp/lbh-v03-orrery-rc-61ecc534/tmp/harness-artifacts/1785201444718-12395/089-controller-three-a1/controller-remote-2026-07-28T012212096Z.png`;
- keyboard/mouse capture:
  `/private/tmp/lbh-v03-orrery-rc-61ecc534/tmp/harness-artifacts/1785201444718-12395/090-keyboardmouse-three-a1/keyboard-mouse-remote-2026-07-28T012241699Z.png`.

The AgentPlay evidence reached title, profile, route briefing, authoritative
Shallows start, natural well death, and Home recovery. It did not complete the
extraction route because normal slingshot engagement timed out. Separate
machine captures are evidence of rendered states, not a claim that Orrery or
Greg played the build.

### Fresh build and package

The same immutable source built all internal targets once through the
supported `--skip-tests` artifact path after the full lane:

- build root:
  `/private/tmp/lbh-v03-orrery-build-final-61ecc534/builds/v0.3.1.61ecc534`;
- web:
  `last-singularity-web` (24,196 KiB);
- iPad:
  `last-singularity-ipad-webapp` (24,204 KiB);
- macOS:
  `Last Singularity.app` (292,976 KiB);
- Windows:
  `Last Singularity-win32-x64` (376,112 KiB);
- Linux:
  `Last Singularity-linux-x64` (327,352 KiB);
- `release:status`: green;
- `test:package`: green, including staged desktop authority boot and package
  closure.

Playtest archive:

- path:
  `/private/tmp/lbh-v03-orrery-build-final-61ecc534/builds/last-singularity-playtest-v0.3.1.61ecc534.zip`;
- size: 441,835,825 bytes;
- SHA-256:
  `ad381bb2152b5fa18c8c4226e9a1cbb78acd7b3008904dc4571b024c6ce2b200`.

Payload identity:

- macOS/Windows/Linux `app.asar` SHA-256:
  `e6fafc45913d02242a8834f5ca61fe8efd0df39d6fefad466f2a09675cc8bf98`;
- macOS executable:
  `91914b9b9ab924a9426d5652fbe2e2d4d1d43c6366f30464907a917f142f31b4`;
- Windows executable:
  `2855e243679ca064b3c9367214b899a1561ebaefd52ad86c165b6b3936f1ebe`;
- Linux executable:
  `b0d127772d2983a93771055a93b673d5fdd1726d6e47db8e269b204e665972d6`.

Package-green is not play-green. No Deck deployment, physical controller
acceptance, promotion, or cross-version action occurred.

## Read First

Design and release truth:

- `docs/v0.3/noise-radius-v1.md`
- `docs/v0.3/inhibitor-ecology-v2.md`
- `docs/v0.3/DECISIONS.md`
- `docs/v0.3/RC-GATE.md`
- `docs/v0.3/CHANGELOG.md`
- `docs/v0.3/reviews/2026-07-27-orrery-v03-rc-contract-corrections.md`
- `docs/design/PILLARS.md`
- `docs/design/MOVEMENT.md`

Implementation and evidence:

- `src/content/noise.data.json`
- `src/content/noise.js`
- `src/presentation/audible-contact-memory.js`
- `src/presentation/presentation-frame.js`
- `src/hud.js`
- `src/main.js`
- `scripts/sim-runtime.cjs`
- `scripts/sim/inhibitor-ecology.cjs`
- `tests/noise-radius.cjs`
- `tests/orrery-route-teaching.cjs`
- `tests/hud-deck.cjs`
- `tests/inhibitor-ecology.cjs`
- `tests/ruler-live.cjs`
- `tests/slingshot-v2-live.cjs`
- `tests/agent-play-eval.cjs`

## Review Questions

1. Compare the implementation against the prior memo. Do movement,
   perception, pursuit, and threat now use one coherent extraction-game ruler?
2. Are ahead-of-player contacts, identity falloff, EXFIL discovery, Swarm
   pursuit, late-match ecology, Heat/Noise teaching, and Deck-sized
   readability likely to feel legible rather than oppressive or inert?
3. Review actual captures and AgentPlay evidence where available. Clearly
   separate observed evidence, source inference, and taste.
4. Did the correction create a new imbalance across Shallows, Expanse, or Deep
   Field?
5. Did the implementation stay simple and appropriate for a private indie
   game? Reject speculative security, generalized recovery, and
   production-service architecture.
6. Is the RC evidence honest? Current and historical results must be
   unmistakable, and package-green must not masquerade as play-green.
7. What are the most important remaining findings? Return at most six,
   classified `blocker`, `fix-forward`, `backlog`, or `Greg decision`, with
   exact evidence and the smallest playable next action.
8. Give a go/no-go recommendation for Greg's physical Deck playtest and name
   the next single v0.3 product vertical, not another architecture program.

Do not provide neutral option soup. State what you would do.

## Guardrails

- Read-only: no edits, tests, builds, branches, implementation, promotion, or
  cross-version work.
- Do not claim a build was played unless you actually play it.
- Do not reopen settled movement Hz, physical units, held slingshot, Heat,
  map-relative schedule, accumulating ecology, or heard-EXFIL aperture
  discovery unless concrete implemented evidence proves a contradiction.
- Do not request broad test expansion as a substitute for playing the build.
- Do not recommend speculative production security, reliability, failover,
  generalized recovery, or framework work.
- Preserve **Art Is Product**, **Movement Is the Game**, **Noise Is
  Consequence**, **Universe Is the Clock**, **Dread Over Difficulty**, and
  **Run It Twice**.
- Treat physical Deck feel, visual taste, audio quality, and fun as Greg gates.
- This is one milestone review, never per-commit review.
