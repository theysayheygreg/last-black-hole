# v0.3 Playable RC Gate

> Document revision: v0.3. Updated 2026-07-17. This is branch acceptance
> truth, not a public release announcement.

## Current Verdict

**The v0.3.1 source candidate, exact package, Deck deployment, and bounded
Gamescope runtime smoke are green. Physical Gaming Mode Library launch, Steam
Input, and Greg's final review remain.**

`codex/v0.3-ballpark-roadmap` contains the intended authority, Ballpark,
protocol, route, product-loop, renderer-contract, HUD/audio, performance, and
agent-eval work, plus the v0.3 generated visual kit and UI motion system.
`main` remains the v0.2 public/demo line.

The previously deployed `0.3.1.2b93b077` artifact remains valid evidence for
that older hash, but Greg marked it needs-fix. Source `dd9e5149` adds the
Orrery blocker fixes, locked units, retired time dilation, ratified normal-input
slingshot path, and map-relative schedule. Its matching package is installed on
the Deck and checksum-verified.

Orrery's review exposed a client ownership bug during extraction: after the
phase changed, local `SimCore` could advance server-owned snapshot entities.
Remote authority now remains presentation-only through results and transitions
until the session is explicitly released. Fresh authority, controller, Three
renderer, fast, and package gates pass with that fix.

## Current Evidence

Latest package evidence, superseded as the current RC by newer source:

- Source `2b93b07781d3f123ff818826884f8fe1a4067e39` includes the accepted
  v0.3.1 fuel recovery, Deck snapshot/star repair, Deck UI, and Map Select
  work and remains on `codex/v0.3-ballpark-roadmap`.
- `release:internal` built web, iPad, macOS arm64, Windows x64, and Linux x64 as
  `0.3.1.2b93b077`.
- `release:status` found the hash-named release, and `test:package` passed
  staged plus extracted authority/client boot under protocol `lbh-local-v2`.
- Playtest ZIP SHA-256:
  `5ccc4c23955785f71600241548145e6475fbe37a737b856e217bb8043dd75525`.
- Linux `resources/app.asar` SHA-256:
  `d29e3639823fb15e8b25c6a0bc7e345054c624571443b79c2d703f76946ca0b1`.
- The earlier no-retry full lane remains parked as infrastructure-red after
  215 seconds because its isolated checkout lacked Python audio packages,
  `three`, and Electron packager dependencies. It was not rerun for this hash.
- The 2026-07-16 deploy reused the exact verified artifact without rebuilding and
  installed it at `/home/deck/Games/last-singularity-v03`. Remote `app.asar`
  SHA-256 matches local at
  `d29e3639823fb15e8b25c6a0bc7e345054c624571443b79c2d703f76946ca0b1`;
  the executable matches at
  `b0d127772d2983a93771055a93b673d5fdd1726d6e47db8e269b204e665972d6`.
- Installed launchers and desktop entries identify `Last Singularity v0.3.1
  Preview`. The supported Gaming Mode refresh stopped before writing because
  Steam and its helpers did not exit within the bounded timeout. Shortcut key
  `19` therefore retains display name `Last Singularity v0.3 Preview` and app
  id `3771676273`. The v0.2 Demo remains key `18`, app id `2947990413`, at
  `/home/deck/Games/last-singularity-v02`.
- Executable, launcher, desktop entry, and isolated log namespace exist. No
  recent Last Singularity coredumps were recorded. Existing logs predate this
  deployment and are not claimed as fresh candidate boot evidence.

Current focused source evidence after that package:

- normal-input slingshot proof exercised keyboard F engagement and controller
  Y release through InputManager, SimClient, local authority, and visible
  lock/arc/release-ghost presentation;
- Conductor `14/14`, map-relative schedule `2/2`, Inhibitor `6/6`, portal clock
  `3/3`, and bounded Deep Field `1/1` pass for the 480/600/720-second schedule;
- deployment identity and physical Deck behavior are not yet claimed.

Current package evidence:

- source/build: `dd9e5149` / `0.3.1.dd9e5149`;
- `release:internal`, `release:status`, and `test:package` passed for all five
  targets and extracted protocol `lbh-local-v2` authority/client boot;
- Linux `app.asar` SHA-256:
  `561cf3d4c6fb0784ce4c5ba19d1f3e07d0c48afb397b4107b1be3881178c12ef`;
- playtest ZIP SHA-256:
  `9cfd14b433cb4b0113a6f1a84cb8a643eb1e35752e1fce1bd679c9a70c8bbeba`;
- Deck preflight initially stopped at Tailscale SSH's additional authorization
  check. After Greg authorized it, preflight passed and the exact existing
  artifact was deployed with `--no-build` to
  `/home/deck/Games/last-singularity-v03`.
- Remote executable SHA-256 matches local at
  `b0d127772d2983a93771055a93b673d5fdd1726d6e47db8e269b204e665972d6`;
  remote `resources/app.asar` matches at
  `561cf3d4c6fb0784ce4c5ba19d1f3e07d0c48afb397b4107b1be3881178c12ef`.
- Gaming Mode key `19` is `Last Singularity v0.3.1 Preview`, app id
  `3696252517`. The v0.2 Demo remains key `18`, app id `2947990413`, at its
  separate install path.
- A 20-second foreground smoke of the deployed wrapper inside the active
  Gamescope session reached embedded control/sim startup, authority
  registration, WebGL2 readiness, and `init.completed` with no boot fatal or
  coredump. Remote `steam -applaunch 3696252517` returned `AppError_9`, so this
  does not check the physical Non-Steam Library launch box below.

Latest completed evidence from the clean 2026-07-14 RC pass:

- `npm run test:full -- --no-retries` passed after the UI visual harness budget
  was updated for its sixteen settled animation/layout captures.
- The full lane includes static, authority, sim-structure, Three, UI, visual,
  playtest, and agent-eval coverage.
- Deep Field stayed inside the explicit tick, latency, snapshot, transport,
  heap, and Ballpark-sync budgets recorded in `ROADMAP.md`.
- `npm run test:agent-eval` passed from a fresh sim and disposable browser.
- Passing playable report:
  `tests/screenshots/agent-play-eval-2026-07-14T191436848Z/summary.md`.
- The report contains eighteen 1280x800 frames across extraction/continuity and
  death/recovery journeys.
- AgentPlayEval completed both natural journeys without a retry in the final
  full lane.
- Package closure tests stage authority, extract and boot the real Linux
  `app.asar`, then boot the macOS Three client through title and authoritative
  launch after a 31-second idle wait.
- The 2026-07-14 review-fix pass produced a clean multi-target package and
  passed `test:package`. Its fresh autonomous journey showed no browser runtime
  errors, but one route attempt missed the portal after running low on fuel;
  the full no-retry promotion checkbox is therefore still open.

## Automated Candidate Gate

Start from no stale stack:

```sh
npm run stack:stop
git branch --show-current
git status --short
npm run test:fast
npm run test:authority
npm run test:sim-structure
npm run test:three
npm run test:ui
npm run test:visual
npm run test:playtest
npm run test:agent-eval
npm run test:full
node scripts/build-health.cjs status
```

Requirements:

- branch is `codex/v0.3-ballpark-roadmap`;
- only known untracked historical screenshot directories may remain;
- no suite relies on a persistent browser/sim unless persistence is the thing
  being tested;
- no player-facing test uses sim debug mutation as journey proof;
- renderer checks target Three;
- timing retries are reported rather than silently converted into passes.

## Architecture Gate

- [x] Current `main` merged forward; v0.3 was not merged backward.
- [x] Packaged authority dependency closure is discovered transitively.
- [x] Staged package test boots control plane and sim.
- [x] Toroidal geometry and swept circle contact are centralized.
- [x] Well, wreck, portal, scavenger, grace, and seam cases have authority
  coverage.
- [x] Ballpark handles remain stable, lifecycle-stamped, generation checked,
  and bounded.
- [x] Load-bearing relevance, pickup, and portal query fallbacks are removed.
- [x] Protocol v2 owns run/player identity, credentials, command/input sequence,
  queued edges, privacy, reconnect, gap detection, and snapshot rebase.
- [x] Empty and terminal sessions stop unbounded simulation.
- [x] Three consumes a renderer-neutral presentation frame.
- [x] Player, wreck, and portal visual families own bounded lifecycles.
- [x] Generated world sprites use one texture cache, nearest filtering,
  explicit disposal, and bounded lifecycle ownership.
- [x] Projection, quality, and palette ownership are centralized.
- [x] Gameplay remains sim-owned; renderer/UI/VFX/audio do not author outcomes.

## Product Gate

- [x] Seed preview matches authoritative launch truth.
- [x] Shallows teaches slingshot, salvage, signal consequence, then confirmed
  extraction.
- [x] Portal requires residence plus explicit Enter/A confirmation and aborts
  immediately on exit.
- [x] Cyan marks route/extraction; magenta remains corruption/Inhibitor.
- [x] Drifter and Breacher are the only public hulls.
- [x] Human joins cannot request internal prototype hulls.
- [x] Player-facing progression uses hull-specific rig tracks.
- [x] Result, cargo, loadout, vault, EM, and profile writeback are authoritative.
- [x] Chronicle shows career totals and newest five runs.
- [x] Expanse and Deep Field use distinct route/scale identities.
- [x] Natural agent journey reaches a changed second run without debug mutation.
- [x] A second fresh controller journey selects Breacher, dies to a visible
  named well, and returns Home without debug mutation.

## Presentation And Accessibility Gate

- [x] Three and ASCII-fluid identity remain the primary renderer target.
- [x] 1280x800 HUD rails do not overlap in the focused Deck layout test.
- [x] Interaction prompts separate the command label from Enter/A affordance.
- [x] Fuel/hull/signal gauges meet the committed minimum dimensions.
- [x] Reduced-motion and controller prompt contracts are tested.
- [x] Event-driven audio has a bounded voice budget.
- [x] All 65 catalog items have stable generated icon ids, and the UI frame kit
  is derived reproducibly from committed source atlases.
- [x] Profile, Home, route select, pause, results, and inventory surfaces use
  backed terminal frames and deterministic screen motion.
- [x] UI evidence checks named-region contrast, transition progression,
  reduced-motion settled state, and 1280x720 plus 1280x800 layouts.
- [x] Agent evidence includes in-match HUD, portal confirmation, results, rig,
  Chronicle, second-run, named death, and recovery screens.
- [ ] Greg performs final couch/handheld readability and visual-taste review.
- [ ] Greg performs the final headphone/target-speaker mix review; structural
  audio bounds and routing are automated, sound quality is not.
- [ ] Complete the browser audio-graph/source-count inspection before audio is
  treated as final polish.

## Package Gate

Run only from the final committed source:

```sh
npm run release:internal
npm run release:status
npm run test:package
```

- [x] Build `0.3.1.dd9e5149` from the current source candidate.
- [x] Current `app.asar` and playtest ZIP checksums are reported above and
  verified by `npm run release:status` plus `npm run test:package`.
- [x] Artifact version `0.3.1.2b93b077` remains prior-hash evidence.
- [x] Its historical checksum and path were reported by `npm run test:package` and
  verified by `npm run release:status`.
- [x] Embedded control plane and sim boot from staged and extracted package
  resources.
- [x] Packaged client reaches a rendered Three title, retains idle authority,
  and performs an authoritative launch.

The package checks above apply only when `npm run release:status` names the
current committed hash. `-test` drop artifacts do not satisfy this gate.

## Steam Deck Gate

Gaming Mode is the acceptance target. Desktop Mode is useful for install and
logs but cannot certify Steam Input.

```sh
npm run deck:preflight -- --host=steamdeck.tail1ac9cf.ts.net --prepare
LBH_DECK_HOST=steamdeck.tail1ac9cf.ts.net npm run deploy:deck
LBH_DECK_HOST=steamdeck.tail1ac9cf.ts.net npm run deck:gaming-mode -- --shutdown-steam --all-users
```

- [x] Deploy exact build `0.3.1.dd9e5149` without rebuilding; remote hashes
  match the release artifact.
- [x] Gaming Mode shortcut display name is `Last Singularity v0.3.1 Preview`
  at key `19`, app id `3696252517`.
- [ ] Build launches from Non-Steam Games in Gaming Mode.
- [x] Embedded authority reports healthy on loopback during the bounded
  Gamescope-session wrapper smoke.
- [ ] Steam Input reaches title, Home, map select, flight, pause, extraction,
  results, and quit.
- [ ] 1280x800 text and prompts are readable in hand.
- [ ] Suspend/resume preserves or cleanly abandons the run.
- [x] No post-deploy coredump; fresh candidate logs reached Three
  `init.completed` without the prior snapshot or star-presentation fatal.

If the Deck is unavailable, record this entire section as residual physical
device risk. Do not mark it passed from desktop screenshots.

## Promotion

Promotion requires Greg's explicit call. Before merging to `main`:

1. Merge the latest `main` forward once more.
2. Re-run the automated candidate and package gates.
3. Update version/build status and public notes.
4. Preserve the v0.2 tag/history.
5. Promote in one intentional merge, never by convenience cherry-picks.
