# Build Status

> Document revision: v0.3. Updated 2026-08-02. This file answers “what can I
> play?” separately for the public/demo line and the next-version branch.

## Two Build Lines

| Line | Branch | Meaning |
|---|---|---|
| Current public/demo | `main` | v0.2 build line for weekend demos, small fixes, and existing Deck deploys |
| Current v0.3 source checkpoint | `codex/v0.3-ballpark-roadmap` | v0.3.1 integration and release-candidate lineage; do not promote to `main` until Greg approves it |

When someone asks “what is the build status,” name the branch and evidence.
Git activity alone is not a playability verdict, and an old build-health ledger
does not erase newer committed work.

## v0.3 Candidate

**Source status:** `codex/v0.3-ballpark-roadmap` is the current v0.3.1
integration and release-candidate lineage. Exact product source `00cca067`
contains the completed fabric-readability V1-V6 candidate plus the accepted
Ballpark, Noise, Heat, slingshot, Inhibitor ecology, extraction, Pilot Delete,
master mute, and audible-contact work. Promotion to `main` remains a separate
explicitly approved operation.

**Current RC status:** red and not built. The one accepted no-retry full lane
selected 124 suites and finished 96 passed / 28 failed in 280.73 seconds wall
time (434.59 seconds summed), using four workers and two browser workers. Its
isolated worktree lacked `three` and `@electron/packager`, invalidating 23
dependency/browser suites and all current AgentPlay, Renderer, UIVisual, and
package evidence. Four failures were stale fixtures, and AuthorityCadence
measured 14.77/15 Hz while AuthorityBudget independently passed at 14.96/15 Hz.
No release build, ZIP, package closure, or Deck artifact exists for
`00cca067`. See `docs/v0.3/RC-GATE.md` for exact evidence and classification.

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
  all 65 catalog item icons, and terminal UI frame parts;
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

Exact-head evidence at `ffbcc0ba`, not package, Deck, or RC evidence:

- `npm test -- --no-retries`: 87/87 in 45.36 s with zero retries, 8 browser
  launches, 8 static starts, 16 sim starts, and 1 control start. This is 2.064x
  faster than the 93.62 s baseline.
- The single `npm run test:full -- --no-retries` run passed 119/119 in
  432.91 s with zero retries and 611.61 s summed suite time. It used 34 browser
  launches, 18 static starts, 71 sim starts, and 3 control starts. This is
  2.376x faster than the 1,028.63 s baseline and 42.1% of baseline wall time.
- AgentPlay passed 2/2 in 117.41 s. Flow 7/7, MetaFlow 8/8, RemoteAuthority
  18/18, Renderer 5/5, and UIVisual 18/18 passed in the same full run.

Final direct Deep Field measurement:

| Measure | Observed |
|---|---:|
| authority tick | 14.99 / 15 Hz (Deep Field budget sample) |
| snapshot p95 latency | 15.49 ms |
| snapshot p95 size | 212.88 KiB |
| transport | 1.31 MB/s |
| relevance queries | 12 / tick |
| heap change | +31.64 MiB diagnostic |
| Ballpark sync p95 | 0.869 ms |
| scheduler delivery | 1 catch-up / 0 skipped |

The direct 5/15/25 cadence receipt delivered 14.981, 14.998, and 14.996 Hz with
zero skipped deadlines. Deep Field covered 157 ticks and 1,884 queries
(12/tick), with 101,794 candidates and 115,756 duplicates. This closes the
earlier roughly 13.9/15 residual under final host conditions; no extra hot-path
slice is needed. Map-rate profiles stay removed and heap change stays
GC-sensitive diagnostic data.

From `c97a41b1` to final source, production moves from 54,886 physical / 50,173
nonblank lines to 54,750 / 50,069; tests move from 26,365 / 23,954 to
26,990 / 24,549. Production files move from 201 to 214; test files remain 138.

### Natural Playable Evidence

The final AgentPlay receipt records two fresh protocol-v2 Shallows journeys
through:

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

The journey passed 2/2 in 117.41 s, does not call sim debug mutation endpoints,
and wrote its worker-local report to
`tests/screenshots/agent-play-eval-2026-07-26T213311262Z/summary.md`.

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

That historical v0.3 package passed `release:internal`, `release:status`, and
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
product-loop changes belong on the v0.3 branch and remain version-isolated
until Greg explicitly promotes an accepted source commit.

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

## Preserved Playable History

The final known-good v0.2 playable is preserved as the immutable
[`v0.2.2-final`](https://github.com/theysayheygreg/last-black-hole/releases/tag/v0.2.2-final)
GitHub Release:

- Source: `83953aa1f9f7cc7c39cfc2cd84610ee9a3dec104`
- Build: `0.2.2.83953aa`
- Combined archive SHA-256:
  `6dfc0a0f35c400c877bc4fe12b42fc6699365b66c1e3a1468e4fb89d11042ac7`
- Linux executable SHA-256:
  `b0d127772d2983a93771055a93b673d5fdd1726d6e47db8e269b204e665972d6`
- Linux `app.asar` SHA-256:
  `26aa6c59f498b5f8b7a376f435d389ab8c459852c102b6bca02adf7d8d6fd457`
- Greg's Deck copy remains at
  `/home/deck/Games/last-singularity-v02` with the separate
  **Last Singularity v0.2 Demo** Steam shortcut.

The release's one-click installers use version-specific install, save-data,
log, launcher, and shortcut identities. See
[`OLD-VERSIONS.md`](../public/OLD-VERSIONS.md) for commands and per-platform
archive hashes. New public versions must deploy beside this copy rather than
replace or repoint it.

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
