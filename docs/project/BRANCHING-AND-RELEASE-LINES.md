# Branching And Release Lines

> Status: v0.2/v0.3/v0.4 process truth. Primary Sol owns this contract and all
> cross-version merges, cherry-picks, RC selection, and main-line pushes.

## One-Way Version Hierarchy

```text
main (v0.2 current/live public)
  -> v0.3 next feature line and RC candidates
       -> v0.4 experimental multiplayer
```

Work moves forward through this hierarchy. A later version never merges
backward for convenience. Greg explicitly calls promotion into `main`.

## Branch Roles

| Branch | Role | Default work |
|---|---|---|
| `main` | Current v0.2 public/demo and governance line | Narrow live fixes, demo polish, deploy/release work, root README, cross-version roadmap and decisions, orchestration and push policy |
| `codex/v0.3-ballpark-roadmap` | v0.3 integration and RC lineage | Ballpark, feature reworks, movement/gameplay/UI iteration, renderer contracts, and v0.3 release evidence |
| `codex/v0.3.1-movement-truth` and other v0.3 children | Bounded v0.3 slices | One owned feature or risky integration slice, returned to the v0.3 integrator as committed artifacts |
| `codex/v0.4-multiplayer-product` | Stable v0.4 multiplayer product line | One-to-four-player authority, crew flow, networking, result settlement, rematch, and multiplayer UX |
| Other v0.4 children | Bounded experimental slices | One owned product or architecture slice, returned as committed artifacts |

## Documentation Ownership

The file existing on a later branch does not make it `main` truth.

| Scope | Canonical sources |
|---|---|
| Cross-version/current public | root `README.md`, `docs/project/ROADMAP.md`, `docs/journal/DECISION-LOG.md`, this file, and `docs/project/LBH-ORCHESTRATION-CONTRACT.md` on `main` |
| v0.2 | `docs/v0.2/README.md`, `DESIGN.md`, `ROADMAP.md`, and `docs/project/BUILD-STATUS.md` on `main` |
| v0.3 | `docs/v0.3/README.md`, `ROADMAP.md`, `OPEN-DECISIONS.md`, and `RC-GATE.md` on the v0.3 integration line |
| v0.4 | `docs/v0.4/README.md`, `ROADMAP.md`, `DECISIONS.md`, `OPEN-DECISIONS.md`, `CHANGELOG.md`, and `FOUR-HUMAN-PRODUCT-PLAN.md` on the v0.4 product line |

v0.3 currently uses `OPEN-DECISIONS.md` as its version decision surface; do
not invent a `DECISIONS.md` merely for symmetry. v0.4 has both resolved and
open decision files. Version-local decisions stay local until promotion. The
project journal receives only a durable cross-version rule or one summarized
promotion entry.

## Routing

Route to `main` when the result should improve the current public build or how
all workstreams operate today. Route to v0.3 for next-version features and
architecture. Route to v0.4 only for experimental multiplayer product work.

When a later line exposes a current-version bug, fix it on `main` first when
practical, then merge forward. Do not backport scaffolding that does not
independently help the current line.

Every delegated task names its branch/base SHA, owned write scope, avoided
high-conflict files, focused proof, committed deliverable, and stop conditions.
Chat or agent memory is not a handoff.

## Merge Ownership And Cadence

Workstream Sols integrate child commits inside their own version. Primary Sol
alone performs cross-version merges and release-candidate selection.

At the next clean checkpoint:

1. Commit and push the main governance checkpoint.
2. Let the v0.3 Workstream Sol finish and integrate its accepted child slice.
3. Primary Sol merges current `main` into `codex/v0.3-ballpark-roadmap` and
   resolves conflicts on v0.3.
4. After that v0.3 checkpoint is coherent, Primary Sol merges the compatible
   v0.3/main lineage forward into `codex/v0.4-multiplayer-product` and resolves
   conflicts on v0.4.

Never resolve next-version conflict noise by editing `main`. Never merge all of
v0.4 into v0.3 or all of v0.3 into `main` without Greg's promotion call.

## Validation By Checkpoint

- Feature commits run only the smallest proof for the changed contract.
- Version integrators select exposure-matched CI at coherent checkpoints.
- Primary Sol does not become the suite runner; it chooses the claim and
  delegates the lens.
- Broad, package, platform, soak, visual, and play evidence gate an RC or
  release claim, not ordinary forward development.
- v0.4 failures do not block a v0.3 RC unless a deliberately shared contract is
  affected.

## GitHub Push Policy

Primary Sol owns pushes to `origin/main`. Workstream Sols may push their owned
version branches as committed artifact handoffs, but they do not push or
promote `main`.

The tracked `.githooks/pre-push` policy is ref-aware:

- an `origin/main` update runs `node scripts/release.cjs prepush` once;
- a v0.3/v0.4 or other non-main branch push skips release preparation;
- a deliberate docs/process-only main push may use
  `LBH_SKIP_RELEASE_PREP=1 git push origin main`;
- a candidate/release push never uses that skip.

This is a release-build gate, not CI for every branch commit. GitHub branch
protection remains useful, but the ownership contract is enforced by Primary
Sol and review rather than a magic local environment variable.

## Promotion

When Greg calls a version promotion, Primary Sol freezes incompatible work,
merges current lower-version truth forward, runs the named candidate/release
gates asynchronously, obtains Greg's required taste/device acceptance, updates
the public README/version docs/build status, and performs one intentional
promotion merge. Promotion is a product call, not the automatic result of a
green branch.

## Recovery

Fix forward. Preserve committed history, do not reset shared work, and use a
narrow revert only when Greg or Primary Sol explicitly chooses it. If a merge
or push exposes a problem, record the artifact and route one bounded correction
instead of expanding the current worker into a cleanup program.
