# Branching And Release Lines

> Status: v0.2/v0.3 current process truth. This document supersedes the
> original jam-era "merge everything to main immediately" habit.

## Principle

Last Singularity now has a public/demo line and a next-version line. They have
different risk profiles, so they need different branch behavior.

**Big changes go forward. Small demo fixes stay public.**

- `main` should stay playable and demoable.
- Next-version architecture should move fast without destabilizing `main`.
- Fixes discovered on one line should be deliberately merged or cherry-picked
  into the other line, not smuggled through accidental branch drift.

## Branch Roles

| Branch | Role | Default Work |
|--------|------|--------------|
| `main` | Current public/demo build line | v0.2 fixes, playability polish, Deck deploy fixes, public README/play instructions, build status, release artifacts |
| `codex/v0.3-ballpark-roadmap` | Current v0.3 integration branch | Ballpark authority, ECS-ready data shape, event/snapshot spine, renderer contracts, structural harness work, next-version docs |
| `codex/v0.3/<slice>` | Optional child branch | One risky or overlapping v0.3 slice with a clear owner |

Greg can rename or replace the active next-version branch. Until then,
`codex/v0.3-ballpark-roadmap` is the v0.3 integration branch.

## Work Routing

### Route To `main`

Use `main` when the change should improve the current demo build:

- movement/control bug fix;
- UI readability or Deck prompt polish;
- release/deploy/build packaging fix;
- README/play instruction update;
- build-status update;
- small safe regression fix discovered while testing v0.3;
- process rule that affects all agents immediately.

Validate the current v0.2 surface before committing. If the same fix matters
to v0.3, merge `main` forward or cherry-pick the commit after it lands.

### Route To The v0.3 Branch

Use the next-version branch when the change is bigger than a demo fix:

- sim authority kernel or body registry;
- event journal, snapshot ring, replication lanes;
- renderer contract/material registry/render plan;
- broad harness reshaping;
- large cleanup after a major refactor;
- feature work that depends on v0.3 scaffolding;
- docs that describe v0.3-only design truth.

Do not let v0.3 scaffolding leak into `main` unless it independently fixes or
protects the current demo build.

### Route To A Child Branch

Use a child branch off v0.3 when:

- multiple agents may touch the same high-conflict file;
- the work may need review before joining the integration branch;
- the slice is risky enough that reverting it should be one merge/revert;
- the worker needs more than one commit before the branch is stable.

High-conflict files include:

- `scripts/sim-runtime.cjs`
- `src/main.js`
- `src/render-three/three-renderer.js`
- `tests/suite-manifest.cjs`
- shared content manifests
- roadmap/process docs

## Subagent Prompt Template

Every delegated task should include:

```markdown
Target branch: [main / codex/v0.3-ballpark-roadmap / child branch]
Owned write scope:
- [files/modules]

Avoid:
- [high-conflict files or unrelated systems]

Validation:
- [targeted commands]

Commit behavior:
- [commit directly / report patch / wait for integrator]
```

Also tell workers:

- they are not alone in the codebase;
- they must not revert unrelated edits;
- they must check the branch before editing;
- they should report changed files, tests, commit hash, and integration notes.

## Merge Cadence

### From `main` To v0.3

Merge forward often:

- after every meaningful v0.2 demo fix;
- after build/deploy process fixes;
- at least daily during active parallel work;
- before any v0.3 release-candidate gate.

Resolve conflicts on the v0.3 branch. `main` should not absorb next-version
conflict resolution noise.

### From v0.3 To `main`

Do not merge v0.3 back to `main` until Greg calls the version promotion.

Allowed exceptions:

- narrow cherry-pick of a fix that is independently safe for v0.2;
- docs/process wording that applies to current work and should have landed on
  `main` first;
- emergency revert/fix needed to keep `main` deployable.

If a change needs more than a narrow cherry-pick, it probably belongs in the
promotion window, not the demo line.

## Promotion Flow

When Greg calls v0.3 promotion:

1. Freeze new v0.2-only work except urgent fixes.
2. Merge current `main` into the v0.3 branch.
3. Resolve conflicts on the v0.3 branch.
4. Run full automated gates.
5. Run fresh local playtest and Deck acceptance.
6. Update version docs, release notes, README, build status, and public train.
7. Create the release build.
8. Merge v0.3 into `main` intentionally.
9. Tag/build according to the release process.

Promotion is a product decision, not the natural end of a branch getting "green
enough."

## Required Branch Check

Before any non-trivial edit:

```sh
git branch --show-current
git status --short
```

If the branch is wrong, switch before editing. If switching would strand local
changes, stop and decide whether to commit, stash, or move the changes. Never
use `git reset --hard` as branch hygiene.

## Validation By Line

For `main`:

- prioritize the risk-matched v0.2 validation lane;
- update `docs/project/BUILD-STATUS.md` when playability changes;
- run release/build checks before any public push or Deck handoff.

For v0.3:

- run targeted scaffold/unit tests first;
- run the branch integration gate before merging slices together;
- keep release-build claims clearly separate from v0.2 demo readiness.

## Commit And Journal Rules

- Commit meaningful work on the branch where the truth applies.
- Add `docs/journal/CHANGELOG.md` when process docs change.
- Add `docs/journal/DECISION-LOG.md` when branch/release policy changes.
- If a main-line fix gets merged forward, the v0.3 merge commit should say why
  it was merged.
- If a v0.3 fix gets cherry-picked back, the `main` commit should say why it is
  safe for v0.2.
