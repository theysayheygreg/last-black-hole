# v0.3 Open Decisions

> Status: v0.3 branch decision queue. These are not shipped commitments until
> Greg chooses direction or a bakeoff produces enough evidence.

This file collects the items from the 2026-07-04 Orrery deep review and the
Fable/Orrery weekend review memos that are too identity-shaping to land
silently as "cleanup." Implementation notes belong in `ROADMAP.md`; this file
is for the choice itself.

## 1. Entity Rendering Through ASCII Or Codified Hybrid

**Question:** Should non-fluid entities be rendered through the ASCII product
surface, or should LBH explicitly own a hybrid stack where crisp/pixel/low-poly
entities sit above the fabric with unified tonality and post-processing?

**Recommendation:** Run It Twice at Deck scale, then codify the hybrid if it is
more readable. The current art direction already wants strong silhouettes,
mattes, halos, and punchy friend/foe/neutral/loot differentiation; that likely
means entities are not purely fabric-textured.

**Next action:** Build two visual-reference captures from the same scene:
ASCII-through-fabric and hybrid-over-fabric. Compare readability from couch
distance and on the Deck panel before changing the render-plan declaration.

## 2. Prediction Versus Latency Diet

**Question:** Should v0.3 add client prediction, or first reduce loopback
latency in the current local-authority topology?

**Recommendation:** Latency diet first. Loopback authority is the product
topology for desktop and Deck, so reducing input/sample/snapshot/render delay
earns more than speculative prediction complexity until measured otherwise.

**Next action:** Add an input-to-photon measurement pass and inspect the current
snapshot application cadence before building prediction.

## 3. Canonical Thrust Feel

**Question:** Is `1.7` client thrust or `2.5` server thrust canonical?

**Recommendation:** Server `2.5` is canonical for v0.3 because the packaged
product and movement golden fixtures now encode it. The client should consume
shared movement data instead of maintaining a separate tuning universe.

**Next action:** Move movement constants into shared data and run a local-vs-
remote side-by-side drive test. Retune deliberately only if the canonical
server feel is wrong in play.

## 4. Viscosity And Decay Promise

**Question:** Should collapse/viscosity/decay become a small real control
pressure, or should the exposed keys be removed until the system exists?

**Recommendation:** Implement the smallest honest version: collapse-driven
control weight or current resistance that is visible in feel and telemetry.
Delete keys only if the game does not want that pressure.

**Next action:** Pair this with the collapse-pressure thread after movement
parity is stable.

## 5. Resonant Hull Truth

**Question:** Should Resonant stay selectable with a minimal honest kit, or be
pulled until its fiction is real?

**Recommendation:** Implement the minimal honest kit: one real eddy from
harmonic pulse plus a working next-pulse inversion. Pulling the hull is safer
than shipping fiction, but the eddy identity is worth a small slice.

**Next action:** Treat this as its own hull-family story with authority tests
for eddy force, pulse inversion, cooldowns, and snapshot ability state.

## 6. Portal Palette Discipline

**Question:** Should portals keep sharing the magenta/rift family, or move to a
route/cyan family while magenta remains Inhibitor-only?

**Recommendation:** Move portals to cyan/route. Magenta should stay reserved
for Inhibitor and corruption so the player can read threat versus escape at a
glance.

**Next action:** Recolor portal visual fixtures and run title/map/reference
captures before updating the broader palette doc.

## 7. Death Economy Floor Versus Tax

**Question:** Should death credit a small survival floor, apply a percentage EM
tax, or do both?

**Recommendation:** Credit the death floor for the v0.2 demo and treat
equipped-item loss as the main penalty. Defer percentage tax until player
balances are large enough that a tax solves a real economy problem.

**Next action:** Implement ledger-honesty tests first. The result screen must
display the same EM delta the profile actually receives.

## 8. Portal Entry Interaction

**Question:** Should extraction stay as fly-through collision capture, or move
to "be in the zone plus confirm" with an instant abort?

**Recommendation:** Move toward confirm, but do not change this silently. It
turns extraction into a declared decision and prevents current-nudge whiffs,
but it changes a shipped interaction.

**Next action:** Prototype capture-at-three-speeds plus abort probes before
changing product behavior.

## 9. Shallows Signature Route

**Question:** Should the accidental near-vertical Shallows star line become the
intentional first teaching route?

**Recommendation:** Yes, if Greg likes the feel after a short local playtest.
It gives Shallows a clear "I meant to do that" slingshot line without adding
UI route markers.

**Next action:** Keep the map data frozen until the movement honest-baseline
slice restores slingshot feedback and route probes.

## 10. Progression Grammar

**Question:** Should the older component/rank upgrade grammar stay live, or
should v0.2 present only rig tracks?

**Recommendation:** Present rig tracks only for the v0.2 demo. The older
component grammar can remain historical/backlog until it is deliberately
merged or removed.

**Next action:** Audit `META-LOOP.md`, `META-FLOW.md`, and profile code after
ledger honesty so the docs do not rebuild the wrong economy.

## 11. Chronicle Demo Scope

**Question:** How much chronicle should be public in the first demo slice?

**Recommendation:** Career strip plus last five runs. Hide records,
milestones, and signal-profile depth until the remote chronicle bridge is real
and the data can carry the screen.

**Next action:** Make remote-authority runs reach the chronicle, then review
whether echoes feel intriguing or unfinished in the same pass.

## 12. Cosmic Signatures In Product Copy

**Question:** Should cosmic signatures stay visible as briefing texture before
the server applies their movement/world modifiers?

**Recommendation:** Either ship a small server-owned modifier set or demote
signatures to non-decision texture. A named modifier the physics ignores is
more damaging than no modifier.

**Next action:** Pair this with the movement honest-baseline work so signature
effects do not introduce another split between client presentation and sim
truth.
