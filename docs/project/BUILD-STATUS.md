# Build Status

> Document revision: v0.3. Updated 2026-07-10. This file answers “what can I
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

**Source status:** green candidate.

**Package status:** final hash artifact pending after the last docs/source
commit.

**Physical Steam Deck status:** pending Gaming Mode acceptance. Automated
1280x800 evidence exists; that is not a substitute for the real device.

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
  wreck, and portal families;
- centralized projection, quality, palette, route cyan, and corruption magenta;
- 1280x800 HUD hierarchy, controller prompts, reduced motion, and event-driven
  bounded audio;
- staged desktop/package tests that boot embedded authority runtimes.

### Current Automated Evidence

Completed on 2026-07-10:

- `npm run test:fast`: pass.
- `npm run test:authority`: pass.
- `npm run test:agent-eval`: pass from a fresh sim and disposable browser.
- focused package closure: staged control plane and sim boot pass.
- focused HUD, audio, presentation, lifecycle, protocol, route, world geometry,
  Ballpark, bounded-growth, and Deep Field budget suites: pass.

Latest Deep Field measurement:

| Measure | Observed |
|---|---:|
| authority tick | 7.68 / 8 Hz |
| snapshot p95 latency | 2.73 ms |
| snapshot p95 size | 107.88 KiB |
| estimated transport | 0.33 MB/s |
| heap growth | 4.16 MiB |
| Ballpark sync p95 | 0.652 ms |

### Natural Playable Evidence

Latest passing report:

`tests/screenshots/agent-play-eval-2026-07-09T202554776Z/summary.md`

It contains fourteen 1280x800 screenshots and proves a fresh protocol-v2
Shallows journey through:

1. title, profile, Home, and route briefing;
2. authoritative launch and intentional controller movement;
3. well slingshot engage/release;
4. natural wreck salvage;
5. signal spike and Inhibitor pressure;
6. portal ready state before explicit A confirmation;
7. authoritative extraction and salvage report;
8. Home rig and Chronicle continuity;
9. a rerolled second run with a different run/seed and new movement.

The agent journey does not call sim debug mutation endpoints.

### What Still Must Happen

- commit final docs/source;
- run the complete candidate lane from that commit;
- build `0.3.0.<final-hash>` with `npm run release:internal`;
- record artifact path/checksum and boot its embedded authority;
- deploy to the physical Deck if reachable;
- verify Gaming Mode, Steam Input, readability, suspend/resume, and logs;
- Greg reviews feel, route pleasure, visual hierarchy, and polish;
- Greg explicitly promotes v0.3 to `main` when ready.

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
| release manifest | artifact/hash/checksum identity | Gaming Mode acceptance |

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
