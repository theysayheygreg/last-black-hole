# Build Status

> Document revision: v0.4. Updated 2026-07-14. This file answers “what can I
> play?” separately for the public/demo line and the next-version branch.

## Two Build Lines

| Line | Branch | Meaning |
|---|---|---|
| Current public/demo | `main` | v0.2 build line for weekend demos, small fixes, and existing Deck deploys |
| Next candidate | `codex/v0.3-ballpark-roadmap` | v0.3 authority/Ballpark/product candidate; do not merge backward until Greg promotes it |
| Multiplayer program | `codex/v0.4-multiplayer-architecture` | v0.3-forward branch with Phase 0 trust/proof implementation; not yet a playable internet multiplayer build |

When someone asks “what is the build status,” name the branch and evidence.
Git activity alone is not a playability verdict, and an old build-health ledger
does not erase newer committed work.

## v0.4 Multiplayer Program

**Branch status (2026-07-14):** research and architecture are complete and
decision-ready. Public hosted multiplayer is not implemented. The final packet
is `docs/v0.4/MULTIPLAYER-DECISION-PACKET.md`.

**Playable status:** local loopback authority and browser journeys are
automation-green. S20 negotiated compression is the admitted product
replication path for one through four players. Four is the supported multiplayer
target; a fifth seat must reject at every trust boundary. This is local evidence,
not WAN, hosted, public-matchmaking, human-feel, or physical-device proof.

**Eight-player status:** closed for v0.4. S23 and S23P remain executable
default-off research paths and are not admitted. The final split-fragment
prototype crossed its short-screen abort at 55.9045 ms projection/publish p95,
was not rerun, and was fully reverted. Split-fragment is historical only and
absent from live source. Do not describe the build as a 4–8-player product and
do not select another v0.4 eight-player optimization.

**Authority contract:** one dedicated logical gameplay authority exists per
live match/group. Concurrent matches multiply independent, fenced authorities.
Measured packing may place several authorities on a host; there is no global
gameplay authority and no unmeasured density claim.

**Hosted status:** identity, entitlement, local/cloud lineage, match placement,
one fenced writer lease per run, opaque admission/resume tickets, immutable
result outbox, and exactly-once relational settlement are designed but not
implemented. Fly performance CPU is the first authority benchmark; Cloudflare
edge plus Postgres is the control-plane reference; Hetzner CCX is the fallback.
Cloudflare Container/Durable Object and ordinary containers are measured
comparators. Vercel is web/control-plane only.

**Economics status:** the refreshed four-seat Fly envelope is
$0.0590/$0.0693/$0.0903 per authority-hour and
$0.014750/$0.017325/$0.022575 per occupied player-hour best/base/worst.
Central cohort break-even is 614/11,598/none. Full $4.99 contribution tables at
1K/10K/100K/1M copies are reproducible from
`docs/v0.4/evidence/unit-economics/`. Host density remains one in the model
until a real noisy-neighbor benchmark proves otherwise.

**High-count status:** S24 measured a synthetic H24 component fixture:
0.828/1.417 ms writer p95/p99, 3.417/4.333 ms dense sensitivity,
13,468 B/s/client, and 2.586 Mbit/s/match. It did not admit a live 24-client
cohort and the raw capture never started. H48/H96 are far extrapolations
(1.207/2.646 ms base, 26,354/50,150 B/s/client,
10.120/38.515 Mbit/s); X96 is a modeled rejection at 86.769 ms and
118,219 B/s/client. None is a live capacity claim.

**Next gates:** finish the four-player product journey and Greg feel/art review;
Greg selects central/hybrid/local service posture; implement Phase 5 identity,
settlement, and placement; run Phase 6 same-scenario two-region 90-minute
four-player authority soaks; then derive `safeAuthoritiesPerHost` from measured
packing. Only after those gates may a production-valid exact H24 live fixture be
revisited.
## v0.3 Candidate

**Source status:** green visual-production candidate.

**Package status:** green. `release:internal` built all targets, the release
checker found the matching hash directory, and the Linux artifact's actual
`app.asar` booted its embedded control plane and `lbh-local-v2` sim with live
registration. The macOS package also reaches a rendered Three title, keeps its
idle authority resident through an extended attract-screen wait, and joins a
live run through normal keyboard input. `npm run release:status` is the
authority for the exact current HEAD hash.

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

Completed on 2026-07-10:

- `npm run test:fast`: pass.
- `npm run test:authority`: pass.
- `npm run test:agent-eval`: pass from a fresh sim and disposable browser.
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
| authority tick | 7.74 / 8 Hz |
| snapshot p95 latency | 5.72 ms |
| snapshot p95 size | 107.88 KiB |
| estimated transport | 0.33 MB/s |
| heap growth | 4.12 MiB |
| Ballpark sync p95 | 1.555 ms |

### Natural Playable Evidence

Latest complete passing report:

`tests/screenshots/agent-play-eval-2026-07-10T205224580Z/summary.md`

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

### Latest Representative Promo Evidence

The 2026-07-10 promo batch used a fresh profile, Home, route briefing, and
authoritative gameplay flow. It contains no fixture injection, reference-scene
composition, or debug mutation:

`docs/journal/screenshots/social-promo-2026-07-10-234309/manifest.json`

The batch contains ten 4K stills plus two 30 fps MP4/GIF motion pairs. Capture
validation found no weak frames or browser errors and measured nonzero motion
in both clips. The shareable copies are mirrored to:

`~/Library/Mobile Documents/com~apple~CloudDocs/LastSingularity/promo-media/social-promo-2026-07-10-234309/`

### What Still Must Happen

- deploy to the physical Deck if reachable;
- verify Gaming Mode, Steam Input, readability, suspend/resume, and logs;
- Greg reviews feel, route pleasure, visual hierarchy, and polish;
- Greg explicitly promotes v0.3 to `main` when ready.

### Steam Deck Side-by-side Comparison

Installed and checksum-verified on 2026-07-10:

| Steam entry | Source | Install directory | App id |
|---|---|---|---:|
| Last Singularity v0.2 Demo | `main` at `83953aa`, build `0.2.2.83953aa` | `/home/deck/Games/last-singularity-v02` | `2947990413` |
| Last Singularity v0.3 Preview | v0.3 at `fb2432a`, build `0.3.0.fb2432a` | `/home/deck/Games/last-singularity-v03` | `3771676273` |

Both branches passed their clean `release:internal` gate from detached
worktrees. The v0.3 package also passed `test:package`. Remote executable and
`app.asar` SHA-256 values match the local artifacts. The two launchers use
separate log and Electron user-data namespaces, so profiles and caches do not
contaminate the comparison.

This proves installation and shortcut identity, not physical Gaming Mode
acceptance. Steam was shut down safely while `shortcuts.vdf` was updated;
return to Gaming Mode so Steam reloads both entries, then compare controller
navigation, movement feel, readability, suspend/resume, and runtime logs.

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
