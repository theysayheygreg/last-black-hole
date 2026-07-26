# Build Status

> Document revision: v0.3. Updated 2026-07-26. This file answers “what can I
> play?” separately for the public/demo line and the next-version branch.

## Two Build Lines

| Line | Branch | Meaning |
|---|---|---|
| Current public/demo | `main` | v0.2 build line for weekend demos, small fixes, and existing Deck deploys |
| Current v0.3 source checkpoint | `codex/v0.3-sim-harness-simplification` | v0.3 authority/Ballpark/product source refactor; do not merge backward until Greg promotes it |

When someone asks “what is the build status,” name the branch and evidence.
Git activity alone is not a playability verdict, and an old build-health ledger
does not erase newer committed work.

## v0.3 Candidate

**Source status:** `codex/v0.3-sim-harness-simplification` is the current
v0.3 source-only checkpoint, based on behavioral baseline
`20184fae84b559abf27717c046811673040d987a`. It has one 15 Hz authoritative
movement clock across Shallows, Expanse, and Deep Field, plus measured
relevance, compact transport, deadline-delivery, and harness work. This is not
a newly packaged or deployed RC. The exact-head full-lane result is pending in
`docs/v0.3/SIM-HARNESS-SIMPLIFICATION.md` as `FINAL_FULL_RECEIPT`.

**Historical package status:** green for source `dd9e5149`, build
`0.3.1.dd9e5149`.
`release:internal` built all five targets, `release:status` found the matching
hash directory, and `test:package` booted the staged and extracted control
plane, sim, and Three client under `lbh-local-v2`. The playtest ZIP SHA-256 is
`9cfd14b433cb4b0113a6f1a84cb8a643eb1e35752e1fce1bd679c9a70c8bbeba`;
Linux `app.asar` is
`561cf3d4c6fb0784ce4c5ba19d1f3e07d0c48afb397b4107b1be3881178c12ef`.

**Historical physical Steam Deck status:** build `0.3.1.dd9e5149` is installed and
checksum-verified at `/home/deck/Games/last-singularity-v03`. Gaming Mode key
`19` is `Last Singularity v0.3.1 Preview`, app id `3696252517`. A bounded
Gamescope-session wrapper smoke reached healthy embedded authority and Three
`init.completed` without the prior snapshot/star fatal or a coredump. Remote
`steam -applaunch` returned `AppError_9`, so physical Library launch,
controller, readability, suspend/resume, feel, and audio acceptance remain
pending.

**Human status:** Greg approved the v0.3.1 slingshot and schedule baselines;
final movement feel, visual taste, audio, physical Deck acceptance, and any
future RC/promotion remain open.

### What Is Implemented

- server-owned movement, swept contact, pickup, signal, extraction, outcomes,
  profile writeback, AI, and Inhibitor consequences;
- centralized toroidal world geometry and seam-safe sweeps;
- persistent generation-checked Ballpark identity and lifecycle;
- Ballpark-required relevance, pickup, and portal queries with superseded
  spatial fallback paths removed;
- `lbh-local-v2` run/player credentials, monotonic sequences, queued slingshot
  edges, private event visibility, reconnect, gap recovery, and snapshot rebase;
- bounded idle/terminal session behavior and realistic large-map budgets;
- truthful seeded signatures, route briefings, and distinct Shallows/Expanse/
  Deep Field route identities;
- zone-plus-confirm portal extraction with instant abort;
- Drifter/Breacher public roster and hull-specific rig progression;
- authoritative item/result/loadout/vault/Chronicle continuity;
- renderer-neutral live presentation frames and lifecycle-owned Three player,
  wreck, portal, star, planetoid, scavenger, fauna, and sentry families;
- centralized projection, quality, palette, route cyan, and corruption magenta;
- reproducible generated source atlases and runtime slices for entity sprites,
  all 67 catalog item icons, and terminal UI frame parts;
- deterministic terminal expansion, focus, stagger, directional transitions,
  and reduced-motion equivalents across major game screens;
- stronger local backing and restrained shadows that separate windows, titles,
  and inventory content from the animated ASCII fabric;
- 1280x800 HUD hierarchy, controller prompts, reduced motion, and event-driven
  bounded audio;
- staged desktop/package tests that boot embedded authority runtimes.
- final-package extraction proof that boots the authority runtimes from the
  generated Linux `app.asar`, not source staging.
- packaged Electron proof that boots Three, survives 31 seconds on the title
  screen, and launches a human player against embedded protocol-v2 authority.

### Current Automated Evidence

Current source evidence, at the stated branch/checkpoint rather than an RC:

- `npm run test:fast -- --no-retries`: 60/60 in 10.20 s; `npm test --
  --no-retries`: 87/87 in 45.72 s (2.047x faster than the 93.62 s baseline).
- `npm run test:authority -- --no-retries`: 57/57 in 195.47 s. It is slower
  than the red 47-suite baseline because it now proves fresh authority groups
  and a ten-second 5/15/25 cadence receipt.
- current UIVisual is 18/18 in 12.21 s; current renderer fixtures are green;
  Smoke passes in fast/core; the independent natural AgentPlay journey passed
  no-retry in 164.77 s with 18 captures.
- `npm run test:bench -- --no-retries`: 6/6 in 0.45 s. Bench authority is
  explicitly gated and not normal product behavior. `test:audio-tools` remains
  an optional local-tooling red because Python `numpy` is absent.
- The full candidate lane has not yet been rerun at this exact source
  checkpoint. Do not treat earlier full/package evidence as proof for it.

Latest Deep Field measurement:

| Measure | Observed |
|---|---:|
| authority tick | 15.000 / 15 Hz (Deep Field sample) |
| snapshot p95 latency | 17.36 ms |
| snapshot p95 size | 212.76 KiB |
| relevance queries | 12 / tick |
| heap change | +1.56 MiB diagnostic |
| Ballpark sync p95 | 0.722 ms |
| scheduler delivery | 2 catch-ups / 0 skipped |

### Natural Playable Evidence

Latest complete passing report:

`tests/screenshots/agent-play-eval-2026-07-14T191436848Z/summary.md`

It contains eighteen 1280x800 screenshots and proves two fresh protocol-v2
Shallows journeys through:

1. title, profile, Home, and route briefing;
2. authoritative launch and intentional controller movement;
3. well slingshot engage/release;
4. natural wreck salvage;
5. signal spike and Inhibitor pressure;
6. portal ready state before explicit A confirmation;
7. authoritative extraction and salvage report;
8. Home rig and Chronicle continuity;
9. a rerolled second run with a different run/seed and new movement;
10. public Breacher selection, a visible well approach, authoritative death,
    an authored death label, and normal A-to-Home recovery.

The agent journey does not call sim debug mutation endpoints.

Latest no-retry slingshot evidence:

`tests/screenshots/agent-play-eval-2026-07-10T224511366Z/summary.md`

### Visual Review Evidence

The tracked review contract is
`docs/v0.3/evidence/visual-review-manifest.md`. Timestamped renderer, UI, and
agent-eval captures are intentionally ignored worker-local evidence and must be
regenerated for a new acceptance claim. Historical promo media may remain in
iCloud, but it is not repository evidence for the current source checkpoint.

### What Still Must Happen

- deploy to the physical Deck if reachable;
- verify Gaming Mode, Steam Input, readability, suspend/resume, and logs;
- Greg reviews feel, route pleasure, visual hierarchy, and polish;
- Greg reviews the target-speaker/headphone mix and agents inspect the browser
  audio graph/source counts;
- finish or explicitly defer Troubadorb's prioritized runtime text retunes;
- Greg explicitly promotes v0.3 to `main` when ready.

### Steam Deck Side-by-side Comparison

Latest local v0.3 package candidate: source `dd9e5149`, build
`0.3.1.dd9e5149`. All five targets built and `test:package` passed staged and
extracted boot. The playtest ZIP SHA-256 is
`9cfd14b433cb4b0113a6f1a84cb8a643eb1e35752e1fce1bd679c9a70c8bbeba`.
The exact existing Linux artifact was deployed without rebuilding. Remote
`app.asar` SHA-256 matches local at
`561cf3d4c6fb0784ce4c5ba19d1f3e07d0c48afb397b4107b1be3881178c12ef`;
the executable matches at
`b0d127772d2983a93771055a93b673d5fdd1726d6e47db8e269b204e665972d6`.
The v0.3 launcher, executable, desktop entry, and isolated log namespace exist.
Fresh logs reached embedded authority and Three `init.completed`; no Last
Singularity coredumps were recorded after deployment.

Installed and checksum-verified on 2026-07-17:

| Steam entry | Source | Install directory | App id |
|---|---|---|---:|
| Last Singularity v0.2 Demo | `main` at `83953aa`, build `0.2.2.83953aa` | `/home/deck/Games/last-singularity-v02` | `2947990413` |
| Last Singularity v0.3.1 Preview | v0.3 at `dd9e5149`, build `0.3.1.dd9e5149` | `/home/deck/Games/last-singularity-v03` | `3696252517` |

The current v0.3 package passed `release:internal`, `release:status`, and
`test:package`; its remote executable and `app.asar` hashes match local. The
v0.2 directory and shortcut remain key `18`, app id `2947990413`; v0.3 remains
key `19`, now app id `3696252517` after the supported display-name refresh.
The two launchers use separate log and Electron user-data namespaces, so
profiles and caches do not contaminate the comparison.

This proves installation, shortcut identity, and direct Gamescope-session boot,
not physical Gaming Mode acceptance. Launch from Library -> Non-Steam and
compare controller navigation, fuel recovery, Deep Field snapshot stability,
readability, suspend/resume, movement feel, audio, and current runtime logs.

## v0.2 Public/Demo Line

`main` remains the stable current-version line. It is the correct place for
small demo fixes, public README/play instructions, current Deck maintenance,
and v0.2 packaging. Large authority, protocol, Ballpark, renderer-contract, or
product-loop changes belong on the v0.3 branch and are merged forward only.

Do not describe a v0.3 branch build as the public `main` build. Do not merge
v0.3 backward for convenience.

## How To Verify Current State

```sh
git branch --show-current
git status --short
git log -8 --oneline
node scripts/build-health.cjs status
npm run stack:status
npm run release:status
```

Interpretation:

| Source | Proves | Does Not Prove |
|---|---|---|
| this file | recorded playable assessment and caveats | live process health |
| build-health ledger | formal gate at one commit | unrecorded later playability |
| `stack:status` | current process health | source correctness after restart |
| git log | change history | feel or package acceptance |
| agent-eval report | fresh functional/playable journey | Greg's taste or physical Deck behavior |
| release manifest/status | artifact/hash/checksum identity and package presence | Gaming Mode acceptance |

## Fresh Local Play

Use fresh processes for movement, spawn, camera, death, or sim-drift review:

```sh
npm run stack:stop
npm run stack -- --no-open
```

Open the printed Three client URL. A page reload is not a clean sim reset.

## Update Triggers

Update this file when any of these change:

- branch/version promotion;
- fresh agent or human playable verdict;
- final artifact hash or checksum;
- physical Deck deploy/acceptance;
- a gate becomes red;
- movement, authority, renderer, or package architecture changes materially.

## Historical Context

Earlier v0.2 and July 4 v0.3 scaffold entries remain in git history and the
journal. They are not copied below the current status because doing so made old
“not merged / mirror only / local-v1” claims look current.
