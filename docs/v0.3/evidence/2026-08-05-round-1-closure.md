# v0.3 Repair Program Round 1 Closure

> Evidence checkpoint prepared from `codex/v0.3-ballpark-roadmap` at
> `f87c0a0f282c605659ddcd0584e401d2b580c7f5`.

## Checkpoint result

The required one-shot full lane ran once at `c6eb45e6` with no retries. It
reported 149/162 suites passing and 13 failures in 390.22 seconds. Manifest
completeness passed at 182 registered contracts: 164 wired and 18 explicitly
excluded. The retained log is
`/private/tmp/lbh-v03-round1-full-c6eb45e6-artifacts/full-lane.log`.

The failures were split into product/current-contract corrections, stale
contracts, and infrastructure. Each accepted correction below received a
focused proof and pinned review before same-version integration. The broad lane
was not rerun merely to manufacture a green receipt.

## Integrated corrections

- `36d38731` proves retired-artifact profile migration; `780fd353` sanitizes
  retired vault items during legacy migration.
- `c6eb45e6` makes grapple capture proof event-driven.
- `05351801` stages the shared coarse-flow physics dependency in desktop
  packages.
- `9e9c1dca` applies saved drag rig ranks through the local Ship path.
- `2b0c8e10` guards diagnostic short-run final-exfil schedules without changing
  authored product pacing.
- `c69ca1e2` aligns the Inhibitor decoy/Vessel fixture with current authority
  truth.
- `b7eca472` proves consumption events publish the canonical wave cause.
- `cc940787` aligns the UI motion, Three lifecycle, HUD Deck, and rematch audio
  fixtures with established product truth.
- `d1e42447` skips optional diagnostic portal windows too narrow for the
  Conductor guard; normal authored windows are unchanged.
- `457bde29` and `1806f6fe` correct remote grapple proof to use the shipped
  held-input path.
- `167e2957` and `8cb4624d` keep AgentPlay salvage routing clear of wells and
  reacquire moving wrecks from live public snapshots.
- `f87c0a0f` preserves outward hazard-escape thrust and suppresses reverse
  braking once the test controller is already inside dynamic clearance.

Focused closure remained green for desktop package boot, migration/items,
drag compatibility, final-exfil lifecycle, Inhibitor authority/ecology, wave
cause mapping, portal schedule/HUD, rig effects, manifest completeness, UI and
Three lifecycle contracts, and remote grapple input. Authority cadence remains
a host-sensitive diagnostic: scheduler-focused proof preserved the fixed
66.6667 ms deadline and zero skipped-deadline contract; no product scheduler
change was justified.

## Agent-readable journey evidence

Across the bounded normal-input attempts, AgentPlay directly observed:

- authoritative slingshot engage, held arc, release, and presentation;
- natural live-wreck salvage, cargo growth, and the authoritative `PULSE 800m`
  Noise consequence;
- named well death and normal return to Home.

The strongest successful salvage receipt is
`/private/tmp/lbh-v03-round1-agentplay-cargo-fix/tests/screenshots/agent-play-eval-2026-08-05T032154584Z/summary.md`.

AgentPlay did **not** pass end-to-end at the final checkpoint. Its remaining
nondeterministic natural salvage/optional-portal energy route is classified as
an asynchronous test-controller/harness follow-up, not a demonstrated product
source failure. The two final bounded receipts are:

- `/private/tmp/lbh-v03-round1-final-agentplay-f87c0a0f/tests/screenshots/agent-play-eval-2026-08-05T033644388Z/summary.md` — slingshot, salvage, cargo, and Noise succeeded; the controller later died approaching the optional portal while low on delta-v and high on heat.
- `/private/tmp/lbh-v03-round1-agentplay-energy/tests/screenshots/agent-play-eval-2026-08-05T033958027Z/summary.md` — the single follow-up run passed slingshot but did not reproduce natural salvage, so the unvalidated recharge proposal was reverted.

No further AgentPlay run belongs to Round 1. This checkpoint does not claim a
green full suite or green end-to-end AgentPlay result.

## Human gates remain open

This evidence does not judge movement feel, route pleasure, art/readability,
audio taste, or physical Steam Deck behavior. Those remain Greg-owned gates.
It also makes no package, deploy, push, promotion, or cross-version claim.
