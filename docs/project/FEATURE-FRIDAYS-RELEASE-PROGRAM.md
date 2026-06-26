# Feature Fridays Release Program

> Weekly feature releases for Last Singularity across builds, storefronts, and social channels.
> Status date: 2026-06-22.

## Position

Feature Friday is a shipping rhythm, not a scope excuse. Each Friday should prove one player-facing promise from the roadmap with a playable build, a clear QA record, useful release notes, and real captured footage.

The release unit is:

- one feature or feature cluster;
- one player benefit that can be shown in 10 seconds;
- one tested build or explicitly scoped page/update;
- one store/devlog update;
- one Twitter/X post and one Instagram post;
- one feedback question for the next Monday.

Steam, itch, Twitter/X, and Instagram should tell the same story at different depths. If the feature cannot be explained cleanly, captured honestly, and tested against the current harness, it is not a Friday feature yet.

## Cadence

Use a Monday-to-Friday loop. The loop is deliberately conservative because LBH's risk is feel, readability, and runtime truth, not just code completion.

| Day | Owner Focus | Output |
|-----|-------------|--------|
| Monday | Select the feature, cut scope, name the player-facing promise | Feature brief, QA matrix, capture plan, release tier |
| Tuesday | Implement and integrate the narrow slice | Feature commits, smoke evidence, updated docs/changelog |
| Wednesday | Freeze feature scope and harden | Test fixes, UX copy, capture fixture, no new scope after end of day |
| Thursday | Release candidate, manual playtest, capture | Passing gates, build artifact, screenshots, clips, known-issues note |
| Friday | Publish, post, and monitor | itch/Steam update, social posts, feedback link, issue triage window |
| Monday after | Learn and route | Short retrospective, metrics/feedback, backlog adjustments |

If the feature is still changing materially on Thursday afternoon, downgrade it to a devlog/capture Friday and ship the playable build the following week. The audience should learn to trust Friday drops.

## Release Tiers

Not every Friday should imply a public Steam release. Pick the tier on Monday and hold it.

| Tier | Use When | Build / Page Target |
|------|----------|---------------------|
| Internal | The feature needs Greg/team feel approval | Source build, local stack, optional private Deck deploy |
| Private playtest | Trusted testers can give useful feedback | itch unlisted/restricted page, packaged desktop zip, Deck weekly asset |
| Public demo update | The slice is stable and honest for strangers | itch HTML5 demo or downloadable channels, public devlog, social posts |
| Steam page/update | Store presence needs a public beat | Steam Coming Soon page assets/news or internal-beta build branch |
| Steam release candidate | The build is near commercial/public milestone | SteamPipe desktop depots, Steam Deck pass, store checklist, review prep |

The current v0.2 architecture makes itch HTML5 the fastest public demo lane, but that artifact is sandboxed. Steam and serious desktop playtests should use desktop packages with embedded authority.

## Feature Selection Criteria

Choose features by this order:

1. Serves Art Is Product or Movement Is the Game directly.
2. Comes from the v0.2 roadmap or backlog, not from a new parallel wishlist.
3. Has a visible/capturable moment: slingshot release, route comparison, result screen clarity, Inhibitor pressure, hull ability identity.
4. Can pass the relevant harness lane before Thursday capture.
5. Fits one week without changing the authority model, renderer model, save contract, and store promise all at once.
6. Improves the next playtest question.
7. Avoids overpromising public multiplayer, final procedural maps, final balance, or finished progression.

Cut or defer a candidate if it needs more than one pillar-level judgment from Greg, cannot produce truthful footage, or only matters to agents reading internals.

## Per-Release Checklist

### Monday Brief

- Name the Feature Friday, for example `FF-02: Slingshot Route Chains`.
- Point to the roadmap/backlog anchor.
- State the player promise in one sentence.
- Pick the release tier.
- List the exact build targets: source, web, desktop, Deck, itch, Steam.
- List the required test lanes.
- List the capture moments and aspect ratios.
- Write the feedback question testers should answer.

### Implementation

- Keep the slice narrow enough to commit atomically.
- Update `docs/journal/CHANGELOG.md` for the user-facing change.
- Update design docs only if the feature changes a real decision or invalidates old guidance.
- Avoid changing public copy until the footage exists.
- Do not move gameplay truth into renderer-only state for the sake of a prettier clip.

### QA Gates

Minimum gate for any Friday with code:

```sh
npm run test:fast
npm test
node scripts/build-health.cjs status
```

Add the relevant gates:

| Change Type | Required Extra Gate |
|-------------|---------------------|
| Renderer, VFX, screenshot-worthy art | `npm run test:three`, `npm run test:visual`, Codex app browser screenshot pass |
| Authority, sim, remote play, inventory, results | `npm run test:authority` |
| Menu, launch, extraction/death flow | `npm run test:playtest` plus one human browser/Electron pass |
| Build or packaging | `npm run release:internal` for hash-named release/handoff builds, inspect `BUILD-MANIFEST.json`, launch target artifact |
| itch release | `LBH_ITCH_TARGET=... npm run deploy:itch -- --dry-run` or preview |
| Steam prep | `npm run deploy:steam`, inspect staged depots and `STEAMPIPE-MANIFEST.json` |
| Steam Deck claim | Deck runbook acceptance: Gaming Mode launch, embedded authority online, controller path, 1280x800 legibility, suspend/resume |

For docs-only or marketing-only Fridays, replace gameplay gates with `git diff --check`, link checks where practical, and a human review of every pasted post/store update.

### Release

- Confirm `git status --short` only shows intended files before packaging.
- Build release artifacts from the intended commit.
- Record the commit SHA and build version in release notes.
- Publish to the selected channels only after the build and footage match.
- Keep known issues honest and short.
- Save final screenshots/clips in the project asset/capture location chosen for that week.

### Aftercare

- Watch for install, launch, and confusion reports for at least one hour after posting.
- File bugs from tester/social feedback while the context is fresh.
- On Monday, decide whether to tune, deepen, or move on.

## Build Target Expectations

| Target | Expectation |
|--------|-------------|
| Source/local | `npm run play` or `npm run stack` is the truth path for development and local authority. |
| Browser sandbox | `npm run stack:sandbox` is a debug/demo fallback, not the product promise. |
| itch HTML5 | Use the staged sandbox artifact. It must not depend on Node authority. Position it as demo/playtest if the full embedded-authority loop is unavailable. |
| itch desktop channels | Use Linux/Windows/macOS downloadable artifacts when the Feature Friday needs embedded authority and full local play. |
| Packaged desktop | Use `npm run release:internal` for a hash-named all-target handoff, or `npm run release:public` only when Greg calls a public train bump; the desktop package should be self-contained with embedded control plane and sim. |
| Steam Deck | Use the Linux Electron package and the public weekly installer contract. Gaming Mode is the real acceptance surface. |
| Steam | Use desktop depots, not raw HTML5. Internal beta branches are fine for weekly testing; public Steam updates should be reserved for page-worthy beats. |

## Store And Page Update Checklist

### itch

- Upload to the chosen channel: `html5-private`, `html5-beta`, `linux-beta`, `windows-beta`, or `mac-beta`.
- Confirm the page launch button starts the intended artifact.
- Update "What's New" with 3 bullets: feature, why it matters, known limit.
- Add or rotate 2-4 screenshots if the visual changed.
- Add a short devlog when the feature needs explanation.
- Keep access level honest: restricted, unlisted, or public.
- Include controls and first-run flow when a new tester can receive the link.
- Add one feedback prompt and where to send feedback.

### Steam

- Stage desktop depots with `npm run deploy:steam`; upload only when Steamworks credentials and IDs are configured.
- Use an internal beta branch for weekly validation until a real public milestone is approved.
- Update Coming Soon/store assets only with real gameplay footage from the current build.
- For a News post, lead with the feature promise, then 3 bullets, 1 clip, 1 known limit.
- Re-check Steam Deck language before using any Deck-ready wording.
- Do not mention public hosted multiplayer, matchmaking, or final release timing unless those gates are actually satisfied.

### Twitter/X

- Lead with the clip or screenshot, not an explanation.
- First line names the hook: "Slingshot chains now turn the map into routes."
- Add one sentence of design context.
- Add one call to action: playtest link, devlog link, wishlist link, or feedback question.
- Use alt text for screenshots and clips.
- For larger beats, reply with a 3-5 post mini-thread: what changed, why, how it plays, what feedback is wanted.

### Instagram

- Prefer a Reel for motion features and a carousel for UI/store/progression features.
- First frame must show the game surface, not a title card.
- Caption format: hook, feature, player decision, feedback/wishlist CTA.
- Use Story follow-ups for polls: "Would you risk one more wreck?" / "Which route is cleaner?"
- Crop and caption for 9:16 separately; do not rely on a 16:9 clip being legible on mobile.

## Social Post Format

Use this template for every Feature Friday, then tune per platform.

```text
Feature Friday: <feature name>

<One-line hook tied to the player decision.>

This week: <what changed in plain language>.
Why it matters: <how it changes movement, dread, extraction, or progression>.
Try/watch for: <feedback question or build link>.
Known limit: <one honest caveat, if needed>.
```

Example:

```text
Feature Friday: Slingshot Route Chains

The best route is no longer the straight line.

This week, stars and wells become chainable anchors: engage, hold, release, and carry the saved delta-v into the next wreck run.
Why it matters: movement starts to feel like route planning instead of constant thrust.
Try/watch for: does the Shallows route read before the release?
Known limit: numbers are still first-pass tuning.
```

## Asset Capture Needs

Each Friday should leave a small reusable capture package:

- 1 hero clip, 10-20 seconds, 16:9.
- 1 vertical clip, 7-15 seconds, 9:16, cropped for Instagram.
- 3 screenshots: clean gameplay, UI/result/detail, late-run or high-pressure state.
- 1 "before/after" pair when the feature improves readability or feel.
- 1 raw capture with audio if audio or dread changed.
- 1 store-safe image with no debug UI, no dev panel, and no misleading prototype-only state.
- Build SHA, version, map, hull, and runtime mode used for capture.
- Short alt text for every image/clip.

Capture priorities by feature type:

| Feature Type | Must Capture |
|--------------|--------------|
| Movement/slingshot | engage, hold, release, route outcome, delta-v state |
| Maps/world content | route overview, early/late pressure, one risky destination |
| Meta-loop/loadout | before run, result, upgrade/vault consequence |
| Renderer/VFX | same scene before/after, 5x5 or 10x10 scale if relevant |
| Threat/dread | signal rise, Inhibitor cue, player route change |
| Build/platform | first launch, controller flow, target device proof |

## Sample Eight-Week Schedule

This is a sample, not a commitment. It assumes the next useful Friday after this plan is June 26, 2026, and that the team keeps v0.2's current architecture direction.

| Friday | Roadmap Anchor | Feature Friday | Implementation Focus | Release / Marketing Beat |
|--------|----------------|----------------|----------------------|--------------------------|
| 2026-06-26 | v0.2.1 prep / v0.2 baseline | Authority + Three Playtest Baseline | Refresh build health, capture current run loop, confirm weekly artifacts and first-run instructions | "The foundation is playable": private itch/desktop/Deck baseline, public clip only if footage is honest |
| 2026-07-03 | v0.2.1 Feel And Route Pass | Slingshot Route Chains | Tune slingshot energy/release/chain numbers; make one Shallows route visibly intentional | Clip: engage-release-chain; ask whether the route reads before the release |
| 2026-07-10 | v0.2.1 Feel And Route Pass | Shallows As Onboarding Map | Redesign Shallows around 2-hop routes, quiet detours, and a clear extraction line | Itch playtest update: "learn the route"; Instagram carousel shows route decision |
| 2026-07-17 | v0.2.2 Meta-Loop And Loadout Pass | Results That Explain The Run | Improve result causality: earnings, cargo loss, signal peak, Inhibitor state, notable events | Store/social focus on "every wreck is a question"; screenshots of result screen before/after |
| 2026-07-24 | v0.2.2 Meta-Loop And Loadout Pass | Upgrade Write-Back | Finish upgrade purchase/write-back for one clear hull track and prove next-run effect | Devlog: "the run now changes the next run"; private build for progression feedback |
| 2026-07-31 | v0.2.3 Renderer Ownership Pass | Semantic Route Cues | Move or strengthen visual cues for slingshot lanes, signal, current lanes, and near-well danger | Renderer clip/screenshot pair; Steam page asset candidate if clean enough |
| 2026-08-07 | v0.2.3 Renderer Ownership Pass | Inhibitor Presence Pass | Tune visual/audio/HUD degradation so signal pressure changes the emotional register | Reel: quiet run becomes wrong; feedback asks if dread arrives before death |
| 2026-08-14 | v0.2.4 Private Playtest Build | Trusted Tester Build | Produce web + desktop builds, controls primer, screenshots, short gameplay clip, known issues | Unlisted/restricted itch page, packaged desktop zip, Deck weekly asset, Steam internal beta prep |

Possible weeks 9-10 if the eight-week pass lands cleanly:

| Friday | Roadmap Anchor | Feature Friday | Implementation Focus | Release / Marketing Beat |
|--------|----------------|----------------|----------------------|--------------------------|
| 2026-08-21 | v0.3 candidate | Public Demo Page Prep | Pick itch HTML5 demo versus downloadable desktop position; polish public copy and capture | Public itch page draft, Steam Coming Soon asset review, trailer beat sheet refresh |
| 2026-08-28 | v0.3 candidate | Demo Candidate | Lock one understandable run loop with tuned movement, readable results, stable renderer identity | Public demo candidate only if QA and honest-boundary checks pass |

## Sources Considered

- `AGENTS.md`
- `docs/design/PILLARS.md`
- `docs/design/DESIGN.md`
- `docs/design/MOVEMENT.md`
- `docs/design/TEST-HARNESS.md`
- `docs/design/AGENT-TESTING.md`
- `docs/journal/DECISION-LOG.md`
- `docs/journal/CONTENT-PLAN.md`
- `docs/project/ROADMAP.md`
- `docs/project/BACKLOG.md`
- `docs/project/BUILD-PLAN.md`
- `docs/project/BUILD-HEALTH.md`
- `docs/project/PUBLIC-OVERVIEW.md`
- `docs/v0.2/README.md`
- `docs/v0.2/DESIGN-CODE-DELTA.md`
- `docs/v0.2/DESIGN.md`
- `docs/v0.2/ROADMAP.md`
- `docs/v0.2/V0.2-RELEASE-NOTES.md`
- `docs/reference/BUILD-PIPELINE.md`
- `docs/reference/DEPLOYMENT-PIPELINES.md`
- `docs/reference/PLATFORM-TARGETS.md`
- `docs/reference/RUNTIME-MODES.md`
- `docs/reference/DEPLOY-TO-DECK.md`
- `docs/reference/STEAM-DECK-RUNBOOK.md`
- `docs/reference/RENDERER-HARNESS.md`
- `package.json`

## Unresolved Assumptions

- Steamworks AppID, DepotIDs, credentials, and public page state are not confirmed in the repo docs.
- itch target slug and preferred visibility are assumed to be `theysayheygreg/last-singularity` until Greg says otherwise.
- Twitter/X and Instagram account names, posting authority, and asset storage location are not documented here.
- Public Steam updates may require current Steamworks dashboard checks before posting or release submission.
- Platform-specific image dimensions and trailer requirements should be verified in the storefront dashboards before final public asset export.
- The sample schedule assumes one Feature Friday can absorb normal bug fixing; if authority, renderer, or Deck gates go red, the schedule should trade public scope for trust.
