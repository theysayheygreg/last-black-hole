# v0.3 Overnight Swarm Review

> Reviewed 2026-07-11 on `codex/v0.3-ballpark-roadmap`. Scope: Palette,
> Timbre, Troubadorb, and Orrery integration from `f4b6cfb..b868dbb`.

## Branch containment

The delivery is contained to `codex/v0.3-ballpark-roadmap`. Neither `b868dbb`
nor the follow-up fixes are ancestors of `codex/v0.4-multiplayer-architecture`,
and the v0.4 head is not an ancestor of v0.3. The primary v0.4 worktree and its
uncommitted orchestration/research files were not edited during this review.

The reviewed plans explicitly exclude public multiplayer, audio chat,
streaming audio, rollback, matchmaking, and native-engine migration. Existing
multiplayer-minded language in the v0.3 roadmap remains architectural context,
not overnight implementation scope.

## Findings fixed

- Removed 533 accidentally committed promo files (about 925 MiB in the checked
  out tree) and ignored `docs/journal/screenshots/`. The stable visual manifest
  now records the command result without pretending ignored worker-local paths
  are durable evidence.
- Reset and bounded `AudioRouter` dedupe per run so sequence reuse cannot mute a
  later run and long sessions cannot grow the set without limit.
- Removed duplicate authoritative cue playback from `main.js`; the router is
  now the single audio endpoint for those server events.
- Made owner-sensitive player cues fail closed when a remote payload lacks a
  client id.
- Corrected cue source costs for multi-oscillator recipes, rolled back the
  legacy voice reservation when bus admission fails, limited continuous audio
  control updates to the configured 15 Hz, and reduced well voices to the two
  nearest layers promised by the contract.
- Removed hidden `Hauler` and `Resonant` names from generated player-facing
  Chronicle/wreck copy on both client and authority paths, with a roster gate.
- Marked the shared presentation-fact schema as a reviewed v0.3 target rather
  than shipped runtime truth, and standardized the value role name to amber.

## Delivery truth

- **Palette:** reviewed art-direction plan, style contracts, and a repeatable
  fixture review matrix are delivered. The shared presentation schema and the
  larger visual execution tasks remain planned work; no new runtime art was
  implemented by this overnight slice.
- **Timbre:** cue specification, bounded admission, mixer/router integration,
  authoritative-event hooks, and structural tests are delivered. Human
  headphone/Deck listening and browser graph inspection remain acceptance
  gates.
- **Troubadorb:** glossary, voice guide, and prioritized string inventory are
  delivered. This is an audit and execution plan, not a completed whole-game
  copy rewrite. Only public-roster leaks found during review were fixed.
- **Orrery:** the cross-discipline review is integrated into each plan, with the
  presentation schema correctly left as a prerequisite rather than silently
  invented inside one specialist lane.

## Residual risks

- Commit `56c5b86` still contains the accidental media blobs in branch history
  even though current v0.3 source removes them. Rewriting shared branch history
  would be the only way to shrink existing Git objects and should be an explicit
  coordinated operation, not part of this review.
- Palette acceptance still needs fresh visual captures plus Greg's taste and
  physical Deck checks.
- Timbre acceptance still needs a real listening pass and browser-level source
  count/graph evidence; structural tests prove bounds policy, not sound quality.
- Troubadorb's listed runtime retunes remain a future v0.3 content task.

## Verification

- focused audio cue, mixer, event, router, and public-roster tests: pass;
- `npm run test:fast`: pass after fixes;
- `npm run test:authority`: pass after fixes;
- `npm run test:audio`: pass;
- `npm run test:ui-motion`: pass;
- Three/WebGL smoke: included in the passing fast lane.
