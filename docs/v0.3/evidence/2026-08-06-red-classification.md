# v0.3 Round 1 Red Classification

> Retroactive evidence ledger prepared on 2026-08-06 at
> `07a9bfcfd305bed1f01b251a1688204f0529196e`.

## Checkpoint

The Round 1 integration checkpoint was
`c5694c679cc6fcb4053115224a6d8729c0feb6ff`, compared with exact base
`056af805c9abdffa0091817df6b7551b1f8ac5ac`. Its full lane reported **150/164
suites passing**. The original full-lane log was not retained at a stable path;
the aggregate and baseline comparison survive in the Round 1 orchestration
receipt. This ledger therefore does not claim more detail than that receipt and
the retained follow-up logs support.

All 14 aggregate reds were either reproduced at the exact base or classified as
baseline timing/infrastructure flakes. The only delta-related full-run red was
`SimWellGrace`; commit `95728725` retired its stale profile-upgrade expectation,
and its focused check passed before the final checkpoint.

## Suite classification

| Suite | Verdict | Reason | Evidence log or receipt |
| --- | --- | --- | --- |
| `DesktopPackage` | Exact-base reproducible; infrastructure | The later unprovisioned closure shard failed before the contract because `@electron/packager` was absent. A provisioned targeted shard later passed, so this is not product-green evidence from the 150/164 lane. | `/private/tmp/lbh-v03-round1-final-closure-artifacts-cc940787/targeted-nine-suite.log`; `/private/tmp/lbh-v03-round1-targeted-167e2957-artifacts/logs/targeted-shard.log` |
| `AuthorityBudget` | Exact-base reproducible | The Round 1 baseline comparison names it as deterministic at `056af805`; the original full/base logs are no longer retained at a stable path. | Round 1 orchestration receipt only; original log path unavailable |
| `AuthorityCadence` | Exact-base reproducible; host-timing sensitive | The baseline comparison names it as deterministic. A retained later shard again missed its wall-clock tolerance under host load (`9.65Hz` versus the canonical cadence). | `/private/tmp/lbh-v03-round1-infra-cc940787-artifacts/logs/targeted-infrastructure-shard.log` |
| `Inhibitor` | Exact-base reproducible | Named as deterministic in the exact-base comparison. The later nine-suite closure shard passed the current focused contract, so the aggregate red is not asserted current. | `/private/tmp/lbh-v03-round1-final-closure-artifacts-cc940787/targeted-nine-suite.log` |
| `UIMotion` | Exact-base reproducible | Named as deterministic in the exact-base comparison. The later nine-suite closure shard passed. | `/private/tmp/lbh-v03-round1-final-closure-artifacts-cc940787/targeted-nine-suite.log` |
| `ThreeEntityLifecycle` | Exact-base reproducible; infrastructure | The later closure shard remained red because the isolated worktree lacked `three/build/three.module.js`. A provisioned targeted shard later passed 15/15. | `/private/tmp/lbh-v03-round1-final-closure-artifacts-cc940787/targeted-nine-suite.log`; `/private/tmp/lbh-v03-round1-targeted-167e2957-artifacts/logs/targeted-shard.log` |
| `HudDeck` | Exact-base reproducible; browser harness | The later closure shard remained red when the browser fixture reached an undefined `setConfig` surface. A provisioned targeted shard later passed 2/2 at 1280x800. | `/private/tmp/lbh-v03-round1-final-closure-artifacts-cc940787/targeted-nine-suite.log`; `/private/tmp/lbh-v03-round1-targeted-167e2957-artifacts/logs/targeted-shard.log` |
| `AudioRouter` | Exact-base reproducible | Named as deterministic in the exact-base comparison. The later nine-suite closure shard passed. This is routing proof, not listening acceptance. | `/private/tmp/lbh-v03-round1-final-closure-artifacts-cc940787/targeted-nine-suite.log` |
| `FabricWaveV5` | Exact-base reproducible | Named as deterministic in the exact-base comparison. The later nine-suite closure shard passed 8/8. | `/private/tmp/lbh-v03-round1-final-closure-artifacts-cc940787/targeted-nine-suite.log` |
| `SlingshotInputPath` | Exact-base reproducible | Named as deterministic in the exact-base comparison. The original full/base logs are no longer retained at a stable path. | Round 1 orchestration receipt only; original log path unavailable |
| `BallparkExtraction` | Baseline flaky/infrastructure | Classified as a baseline flake in the exact-base comparison; no retained per-suite log was found. | Round 1 orchestration receipt only; per-suite log unavailable |
| `SimBoundedGrowth` | Baseline flaky/infrastructure | Classified as a baseline flake in the exact-base comparison; no retained per-suite log was found. | Round 1 orchestration receipt only; per-suite log unavailable |
| `RemoteAuthority` | Baseline flaky/infrastructure | Retained later targeted shards reproduce a timeout waiting for authoritative slingshot engagement while the other 17 checks pass. | `/private/tmp/lbh-v03-round1-infra-cc940787-artifacts/logs/targeted-infrastructure-shard.log`; `/private/tmp/lbh-v03-round1-targeted-167e2957-artifacts/logs/targeted-shard.log` |
| `AgentPlayEval` | Baseline flaky/infrastructure; not end-to-end green | Retained targeted shards fail the natural-wreck salvage route while the well-death/Home journey passes. The Round 1 closure explicitly says the final checkpoint did **not** pass AgentPlay end-to-end. | `/private/tmp/lbh-v03-round1-infra-cc940787-artifacts/logs/targeted-infrastructure-shard.log`; `/private/tmp/lbh-v03-round1-targeted-167e2957-artifacts/logs/targeted-shard.log`; `docs/v0.3/evidence/2026-08-05-round-1-closure.md` |

## Later targeted state and limits

The later nine-suite closure log must remain visible in the record:
`DesktopPackage`, `ThreeEntityLifecycle`, and `HudDeck` were still red in that
unprovisioned shard. Their subsequent provisioned targeted passes narrow the
failure classification; they do not turn the original 150/164 lane green.

Likewise, `RemoteAuthority` and `AgentPlayEval` remained red in the retained
provisioned targeted shard. The closure document concedes that AgentPlay did not
pass end-to-end, and no later receipt cited here supersedes that statement.

This artifact is a diffable classification of the Round 1 checkpoint, not a new
test run. It makes no movement-feel, art/readability, audio-taste, physical Deck,
package, deploy, promotion, or release claim.
