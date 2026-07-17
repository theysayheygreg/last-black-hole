# Build Status

> Document revision: v0.3. Updated 2026-07-16. This file answers “what can I
> play?” separately for the public/demo line and the next-version branch.

## Two Build Lines

| Line | Branch | Meaning |
|---|---|---|
| Current public/demo | `main` | v0.2 build line for weekend demos, small fixes, and existing Deck deploys |
| Next candidate | `codex/v0.3-ballpark-roadmap` | v0.3 authority/Ballpark/product candidate; do not merge backward until Greg promotes it |

When someone asks “what is the build status,” name the branch and evidence.
Git activity alone is not a playability verdict, and an old build-health ledger
does not erase newer committed work.

## v0.3 Candidate

**Source status:** feature-stability candidate. Orrery's S0/S1 findings are
fixed on the v0.3 line. Fresh remote-authority (18/18), controller (3/3), Three
renderer (5/5), and fast gates pass. A fresh autonomous journey no longer
crashes after extraction; one later run missed its portal after exhausting
most of its fuel, so the complete no-retry promotion gate remains open rather
than being hidden behind evaluator retuning.

**Package status:** green. `release:internal` built all targets, the release
checker found the matching hash directory, and the Linux artifact's actual
`app.asar` booted its embedded control plane and `lbh-local-v2` sim with live
registration. The macOS package also reaches a rendered Three title, keeps its
idle authority resident through an extended attract-screen wait, and joins a
live run through normal keyboard input. `npm run release:status` is the
authority for the exact current HEAD hash.

**Physical Steam Deck status:** the v0.3.1 candidate is deployed and
checksum-verified. Steam did not exit within the supported shortcut-refresh
timeout, so the Gaming Mode entry still displays the prior v0.3 Preview name.
That metadata refresh and physical launch, controller, readability,
suspend/resume, feel, and audio acceptance remain pending.

**Human status:** Greg has not yet made the final movement-feel or visual-taste
call.

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

Completed on 2026-07-14:

- `npm run test:full -- --no-retries`: pass, covering static, authority,
  sim-structure, browser play, agent-eval, renderer, and UI visual suites.
- `npm run test:agent-eval`: pass from a fresh sim and disposable browser,
  without using its timing retry.
- `npm run test:package`: staged closure plus hash artifact authority/client
  boot pass.
- focused HUD, audio, presentation, lifecycle, protocol, route, world geometry,
  Ballpark, bounded-growth, and Deep Field budget suites: pass.
- focused UI motion: pass; latest UI visual lane: 18/18 checks with named
  contrast regions, transition states, reduced motion, and dual-size captures.
- focused Three lifecycle: 9/9 checks, including visible-budget selection,
  explicit zero budgets, generated-asset classification, and clean disposal.
- AgentPlayEval's focused slingshot journey passed on its first attempt with
  exactly one acknowledged engage edge and one acknowledged release edge.
- production renderer and performance lanes: pass with zero asset-load errors;
  Deep Field remained near 60 fps and below the catastrophic draw-call and
  pooled-mesh ceilings.

Latest Deep Field measurement:

| Measure | Observed |
|---|---:|
| authority tick | 7.65 / 8 Hz |
| snapshot p95 latency | 5.32 ms |
| snapshot p95 size | 107.88 KiB |
| estimated transport | 0.33 MB/s |
| heap growth | 1.12 MiB |
| Ballpark sync p95 | 1.142 ms |

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
iCloud, but it is not repository evidence for the current RC hash.

### What Still Must Happen

- deploy to the physical Deck if reachable;
- verify Gaming Mode, Steam Input, readability, suspend/resume, and logs;
- Greg reviews feel, route pleasure, visual hierarchy, and polish;
- Greg reviews the target-speaker/headphone mix and agents inspect the browser
  audio graph/source counts;
- finish or explicitly defer Troubadorb's prioritized runtime text retunes;
- Greg explicitly promotes v0.3 to `main` when ready.

### Steam Deck Side-by-side Comparison

Latest local v0.3 package candidate: source `2b93b077`, build
`0.3.1.2b93b077`. All five targets built and `test:package` passed staged and
extracted boot. The playtest ZIP SHA-256 is
`5ccc4c23955785f71600241548145e6475fbe37a737b856e217bb8043dd75525`.
The exact existing Linux artifact was deployed without rebuilding. Remote
`app.asar` SHA-256 matches local at
`d29e3639823fb15e8b25c6a0bc7e345054c624571443b79c2d703f76946ca0b1`;
the executable matches at
`b0d127772d2983a93771055a93b673d5fdd1726d6e47db8e269b204e665972d6`.
The v0.3 launcher, executable, desktop entry, and isolated log namespace exist;
no Last Singularity coredumps were recorded after deployment. Existing logs are
not treated as fresh candidate boot evidence until Greg launches it.

Installed and checksum-verified on 2026-07-16:

| Steam entry | Source | Install directory | App id |
|---|---|---|---:|
| Last Singularity v0.2 Demo | `main` at `83953aa`, build `0.2.2.83953aa` | `/home/deck/Games/last-singularity-v02` | `2947990413` |
| Last Singularity v0.3 Preview (shortcut refresh pending) | v0.3 at `2b93b077`, build `0.3.1.2b93b077` | `/home/deck/Games/last-singularity-v03` | `3771676273` |

The current v0.3 package passed `release:internal`, `release:status`, and
`test:package`; its remote executable and `app.asar` hashes match local. The
v0.2 directory and shortcut remain key `18`, app id `2947990413`; v0.3 remains
key `19`, app id `3771676273`. Installed v0.3 launchers and desktop entries say
`Last Singularity v0.3.1 Preview`, while Steam's shortcut still says `Last
Singularity v0.3 Preview` because the supported shutdown timed out before any
shortcut write. The two launchers use separate log and Electron user-data
namespaces, so profiles and caches do not contaminate the comparison.

This proves installation and shortcut identity, not physical Gaming Mode
acceptance. Close Steam manually in Desktop Mode, rerun only the supported
shortcut refresh, then return to Gaming Mode and compare controller navigation,
fuel recovery, Deep Field snapshot stability, readability, suspend/resume,
movement feel, audio, and current runtime logs.

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
