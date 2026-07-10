# v0.3 Playable RC Gate

> Document revision: v0.3. Updated 2026-07-10. This is branch acceptance
> truth, not a public release announcement.

## Current Verdict

**Source and packaged candidates are green. Physical-device acceptance and
Greg's final review remain.**

`codex/v0.3-ballpark-roadmap` contains the intended authority, Ballpark,
protocol, route, product-loop, renderer-contract, HUD/audio, performance, and
agent-eval work, plus the v0.3 generated visual kit and UI motion system.
`main` remains the v0.2 public/demo line.

The final committed hash has a matching packaged artifact whose extracted
authority and Electron client boot. A physical Steam Deck Gaming Mode pass and
Greg's feel/taste pass are explicit residual gates, not claims automation
should fake.

## Current Evidence

Latest completed evidence:

- `npm run test:fast` passed on 2026-07-10.
- `npm run test:authority` passed on 2026-07-10.
- Deep Field stayed inside the explicit tick, latency, snapshot, transport,
  heap, and Ballpark-sync budgets recorded in `ROADMAP.md`.
- `npm run test:agent-eval` passed from a fresh sim and disposable browser.
- Passing playable report:
  `tests/screenshots/agent-play-eval-2026-07-10T205224580Z/summary.md`.
- The report contains eighteen 1280x800 frames across extraction/continuity and
  death/recovery journeys.
- `npm run test:full` passed after visual integration. AgentPlayEval used its
  explicit timing retry before both natural journeys passed; review the first
  attempt when tuning movement/play-eval reliability.
- Package closure tests stage authority, extract and boot the real Linux
  `app.asar`, then boot the macOS Three client through title and authoritative
  launch after a 31-second idle wait.

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
- [x] All 67 catalog items have stable generated icon ids, and the UI frame kit
  is derived reproducibly from committed source atlases.
- [x] Profile, Home, route select, pause, results, and inventory surfaces use
  backed terminal frames and deterministic screen motion.
- [x] UI evidence checks named-region contrast, transition progression,
  reduced-motion settled state, and 1280x720 plus 1280x800 layouts.
- [x] Agent evidence includes in-match HUD, portal confirmation, results, rig,
  Chronicle, second-run, named death, and recovery screens.
- [ ] Greg performs final couch/handheld readability and visual-taste review.

## Package Gate

Run only from the final committed source:

```sh
npm run release:internal
npm run release:status
npm run test:package
```

- [x] Artifact version is `0.3.0.<final-commit-hash>`.
- [x] Artifact checksum and path are reported by `npm run test:package` and
  verified by `npm run release:status`.
- [x] Embedded control plane and sim boot from staged and extracted package
  resources.
- [x] Packaged client reaches a rendered Three title, retains idle authority,
  and performs an authoritative launch.

## Steam Deck Gate

Gaming Mode is the acceptance target. Desktop Mode is useful for install and
logs but cannot certify Steam Input.

```sh
npm run deck:preflight -- --host=steamdeck.tail1ac9cf.ts.net --prepare
LBH_DECK_HOST=steamdeck.tail1ac9cf.ts.net npm run deploy:deck
LBH_DECK_HOST=steamdeck.tail1ac9cf.ts.net npm run deck:gaming-mode -- --shutdown-steam --all-users
```

- [ ] Deck is reachable over Tailscale.
- [ ] Build launches from Non-Steam Games in Gaming Mode.
- [ ] Embedded authority reports healthy on loopback.
- [ ] Steam Input reaches title, Home, map select, flight, pause, extraction,
  results, and quit.
- [ ] 1280x800 text and prompts are readable in hand.
- [ ] Suspend/resume preserves or cleanly abandons the run.
- [ ] No new coredump; logs exist under the documented state directory.

If the Deck is unavailable, record this entire section as residual physical
device risk. Do not mark it passed from desktop screenshots.

## Promotion

Promotion requires Greg's explicit call. Before merging to `main`:

1. Merge the latest `main` forward once more.
2. Re-run the automated candidate and package gates.
3. Update version/build status and public notes.
4. Preserve the v0.2 tag/history.
5. Promote in one intentional merge, never by convenience cherry-picks.
