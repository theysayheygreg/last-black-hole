# v0.3.1 Lane B: Thrust Fuel Recovery

Outcome: done for the bounded depletion-to-recovery movement contract.

What changed: `src/content/movement-step.js` no longer spends a partial final
fuel sample when the current request cannot be afforded. It holds that request
while the existing ambient and delayed delta-v regeneration refills the tank,
then resumes a full usable thrust sample. The same step remains the browser
and authority source. A fresh hull reset clears recovery state. Remote HUD and
Three fuel presentation consume `deltaVRatio` from the authoritative snapshot.

Evidence: `node tests/fuel-recovery.cjs` compares an actual local `Ship` with
the authority step for 180 depleted/held-thrust ticks and proves recovery,
usable thrust, and matching position, velocity, fuel, timer, and delivered
thrust. Existing movement golden, trajectory parity, force-ledger,
authoritative-field, and input-timeout checks remain green.

Scope boundary: no thrust baseline, regen rate, hull economy, renderer, map,
package, merge, or push changes. Fuel-cell refill remains the existing
consumable recovery path; this fix only closes ordinary thrust depletion.

Verification boundary: the browser `RemoteAuthority` suite was not runnable
from this isolated worktree because its expected stack was not active; its
pre-existing boot failures are reported separately from this pure movement
proof.
