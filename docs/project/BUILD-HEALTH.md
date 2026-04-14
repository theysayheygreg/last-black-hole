# Build Health

This file exists so humans and agents have one tracked place to check before committing work.

## Rule

If `BUILD-HEALTH.json` is missing, stale, or red for the current `HEAD`, do not assume the tree is healthy.
Run the verifier first and either fix the failures or make an explicit decision to defer them.

## Commands

- Check current status:
  - `node scripts/build-health.js status`
- Record fresh build health:
  - `node scripts/build-health.js verify`
- Run only the structured telemetry canary:
  - `npm run test:telemetry`

## What the verifier does

Right now it records:

- `npm test`
- `npm run test:renderer`

That is intentionally narrow. It covers the real architecture stack and the renderer lane without trying to turn every commit into a release build.

`npm test` now includes the telemetry smoke suite, so structured runtime logging regressions in the distributed stack are part of the normal green/red contract rather than a side check.

## Interpretation

- `ok: true` and matching `gitHead` means the recorded health is current for this exact commit.
- A different `gitHead` means the record is stale, even if the last run was green.
- `ok: false` means the last recorded verification failed and should be fixed before more work piles on.
