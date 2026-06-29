# 2026-06-28 — Orrery Visual Review (response)

> Audience: Forge/Codex + Greg.
> Author: Orrery.
> Scope: cross-section design review of the v0.2 visual/UI/VFX stack before the
> next slice. Responds to `2026-06-28-orrery-visual-review-prompt.md`.
> Evidence base: the 11 read-first docs + the live captures in
> `tests/screenshots/ui-visual-2026-06-28T233408293Z/` (title variants, glitch,
> playing-hud, results, home/map/profile, and the 25%/50% couch proxies).

Note for the record: my prior (2026-06-26) entity feedback landed cleanly. The
v0.2.3 roadmap now carries the aggregate matte/bloom budget, "prove contact
matte on the current primitives first," the player-ship bake-off, and the
"category-stable" affiliation language. Gears meshed. This review is the next
layer up.

---

## 1. Verdict

**The direction holds.** This reads unmistakably as Last Singularity, not
generic neon space UI — the title and results captures prove the identity is
intact, and the UI-truth / renderer-neutral-VFX-event split is the strongest
architectural decision in the whole set. The black void still dominates, the
ASCII fabric is still the ocean, and the role palette is disciplined.

The risk is not the direction. It is **sequencing drift.** The shared UI motion
layer has been applied across *every* screen (title, profile, home, map,
results, pause) ahead of the composition + token-brightening pass, which has
only actually landed on **title** and **results**. So home and map-select now
have timing polish sitting on top of static reads that still fail the couch
contract. The doc itself says it right — "stills prove readability, clips prove
timing" — but the build did timing first on the un-composed screens. Re-order to
readability-before-motion and the pass is sound.

---

## 2. Keep (do not reopen lightly)

- **UI-truth vs. renderer-neutral VFX events.** The load-bearing decision.
  It's what lets the title feel attacked without particles owning navigation,
  and it's the only part of the visual stack that ports to a future renderer.
  Reused consistently across all five docs — that's the tell it's load-bearing
  on purpose, not by accident.
- **Left-family title composition.** It works. The 25% couch proxy keeps both
  "LAST SINGULARITY" and the CTA slab legible. (Default-vs-opposite-left is a
  taste call — see Questions.)
- **Results screen structure + tone.** Outcome → cause/reward → cargo → action,
  red death / restrained-green extraction / amber value. Most finished surface
  in the build. The "haunted relief" read is there ("this is what the universe
  kept"). Don't touch beyond the minor red-button nit below.
- **Contrast + size contract** (7:1 critical / 4.5:1 operational / couch test).
  The contract is correct. The problem is screens not yet meeting it, not the
  numbers.
- **Layer ordering** — most post below UI, CRT above only if legible. Correct.
- **Intermittent-pink corruption model.** Clean bone base, pink as an overlay
  fault, not a resting color. Right conceptual lane.
- **VfxManager-before-bespoke-effects.** Pool/stats/leak/expiry before visual
  ambition. Keep that sequencing exactly as Forge set it.

---

## 3. Change Now (low/medium risk, concrete)

1. **Home is the weakest surface and fights its own spec.** No central
   entity-style ship read, LAUNCH is just a dim tab rather than the loudest
   action, and the whole screen is muted grey-on-dark that barely reads at full
   size, let alone couch. This is the surface most in conflict with the
   `UI-VISUAL-SYSTEM` Home contract. Bring it the brightening + composition pass
   before any more motion. *(evidence: `home-ship.png`)*
2. **In-match center text breaks "keep center clean / back any text over
   fabric."** The "entering the thick dark / spacetime is already thickening…"
   zone callout sits dead-center with no local matte, over the exact well and
   fabric the player must read, and it lingers. Give it a transient local matte,
   pull it off exact-center (or dock to an edge), and make it punch-in-then-leave.
   *(evidence: `playing-hud.png`)*
3. **Wreck cluster labels collide.** The same wreck name renders once per
   fragment, stacking 3–4 identical labels ("WRECK OF THE FORGOTTEN MANDATE",
   "HULK OF THE RESONANT ORBIT"). Reads as a rendering glitch, not telemetry.
   Dedupe to one label per cluster. *(evidence: `title.png`, `title-right.png`)*
4. **Map-select has no hero preview.** The doc's central promise (map preview as
   hero, route shape before text) is unmet — it's a text list of sector counts,
   and the seed/loot panel on the right is near-illegibly dim. Brighten the
   panel to the contract now; schedule the actual preview as the Pass-5 slice.
   *(evidence: `map-select.png`)*
5. **Menu brightening lag.** home/map/profile are visibly dimmer than
   title/results — they received the motion pass but not the Pass-1 token
   brightening. Finish token cleanup on them before adding motion polish.

Minor: on the death screen, red carries title + cause + cargo-lost + the
CONTINUE button. Continue is safe navigation; tinting it red softens the danger
role. Keep red for danger, neutral/cyan for the continue action.

---

## 4. Defer

- **Title wordmark into Three** (VFX Option D / CanvasTexture). Behind-canvas
  screen VFX is enough for v0.2. Don't take the bigger UI-architecture move until
  ship/portal VFX prove the lifecycle.
- **Fullscreen shader impulses** (Option C / VFX Pass 6). Tasteful but
  readability-risky on a black + ASCII field. Wait for the particle path, as the
  plan already says.
- **Instanced particles** (Option B). Stay on pooled meshes (Option A) until
  draw calls actually climb.
- **Final wordmark art.** Oxanium stand-in is fine for v0.2.
- **Tightening harness thresholds.** Keep them loose until ≥3 composed screens
  land, or future art exploration fails its own gate.

---

## 5. Cut / Avoid

- **Do not keep layering motion onto un-composed screens.** Motion on a screen
  that fails its static read polishes the wrong axis. This is the one genuine
  anti-pattern in the current pass — stop adding motion to home/map until they
  read statically.
- **Don't let the rift aperture stay the title's hero.** On every title variant
  the bright cyan rift ellipse (bottom-right) out-competes the central well/void
  for attention. For a game named "Last Singularity," the void should be the
  hero, not a peripheral route anchor. *(composition note — see Questions)*
- **Red-as-only-cue creep** (the continue-button nit above). Hold the line on
  role-bound color.
- **No new VFX families** (ship/portal/pickup/Inhibitor) until the title VFX
  lifecycle + clip-review workflow is proven. Per Forge — agreed.

---

## 6. Next Slice Recommendation

**Home + Map-Select composition & contrast migration — NOT another VFX family.**

Why: the title and results already sell the product. The two screens a player
hits *every single loop* (home → map-select → launch) are the weakest and
dimmest in the build and fail the couch contract today. Highest
visible-improvement-per-risk slice available, and it touches nothing in movement
readability.

Acceptance:

- **Home:** a central entity-style ship read (reuse the entity contact-matte /
  silhouette kit), LAUNCH is the loudest action even when another tab is
  selected, secondary inventory in a right-side panel, selected tab + next
  action legible at couch-25.
- **Map-select:** seed/loot panel brought to ≥4.5:1; selected sector + risk +
  launch readiness legible at couch-25; route anchors distinguishable by role
  color in the proxy. (Full hero map-preview can follow; the *static reads* must
  pass now.)
- Both screens use the same role palette as title/results — no new one-off
  colors — and pass `npm run test:ui` couch proxies.
- Motion/VFX unchanged on these screens until the static read passes.

**Then** the VFX slice Forge wants: **ship thrust/brake VFX**, because the HUD
couch proxy proves the player ship is the weakest read in motion — and that's
*also* the entity-pass priority. The player ship is the conjunction: thrust/brake
VFX and the player contact-matte/silhouette target the same object and the same
readability gap. Schedule them as one combined "player ship" slice, not two.

---

## 7. Roadmap / Doc Updates

- **v0.2.3b (UI Visual Pass):** add an explicit ordering rule —
  *composition + token-brightening must land on a screen before motion polish is
  added to it.* Encodes readability-before-timing so the current drift doesn't
  recur.
- **UI-VISUAL-PASS-PLAN Pass 4 (Home):** elevate to next-up; add the "central
  entity-style ship read + LAUNCH is loudest" acceptance, tied to the couch-25
  proxy.
- **UI-VISUAL-SYSTEM, In-Match HUD section:** make the transient-callout rule
  explicit — zone/event text over the playfield gets a local matte and must
  auto-dismiss. The current center text violates the existing "keep center
  clean" line.
- **THREE-VFX-PASS-PLAN:** note that ship-motion VFX and the entity-pass player
  contact-matte/silhouette are one combined "player ship" slice (same object,
  same couch gap).
- **TEST-HARNESS / UI harness:** add couch-proxy contrast sampling on the
  selected-action and primary-value regions (fail under threshold), so a dim
  un-composed screen is caught automatically instead of by eye.
- **Title:** record the default-layout decision (plain-left vs opposite-left)
  once Greg calls it.

---

## 8. Direct Answers To The 8 Questions

1. **Left default right?** Yes — left-family is correct (couch-25 proves it).
   Between the two, I'd make **opposite-left** the default: it gives the wordmark
   the cleanest dark backing and stages depth (wordmark → void eye → rift)
   instead of letting the bright accretion crowd the text. If you keep
   plain-left, push the well center slightly right to stop the bright fabric
   crowding the wordmark's right edge.
2. **Corruption in the right lane?** Yes. Keep it as the intermittent
   `titleGlyphFault` overlay it already is. Do **not** escalate to
   particle/shader before tuning intensity — tune intensity in *clips* first;
   the still undersells it. It is correctly an animation overlay, not a base
   color.
3. **Next entity family?** **Player + rival ships.** The HUD couch proxy shows
   the player is unfindable at couch scale — the single biggest readability gap,
   and where the next VFX (thrust/brake) also lands. Player ship first: contact
   matte + category silhouette + thrust cue together.
4. **Next UI surface?** **Home, then map-select.** They're the per-loop screens
   and the weakest. Profile is basically fine; pause and HUD-hierarchy follow.
5. **Motion/VFX next focus?** Finish **title VFX tuning in clips** (cheap,
   already built), then **ship movement** (thrust/brake) — movement is the game
   and it's the weakest couch read. Portal/pickup/Inhibitor after.
6. **Palette too narrow/wide/neon?** **Well-scoped.** The actual problem is the
   opposite of neon — the menu screens are too *dim*, under-using the palette,
   not over-using it. Brighten home/map to the contract; do not narrow the
   palette.
7. **Couch rules strong enough?** The rules are strong enough; they're just not
   being *met* on home/map. Don't add harder rules yet — enforce the existing
   ones, and add the automated couch-proxy contrast sample (see Roadmap) so the
   gap gets caught by the harness instead of by eye.
8. **Smallest highest-impact slice?** The **Home brightening + composition**
   (Section 6). First thing after the title, worst-reading surface, zero
   movement-readability risk.

---

## 9. Questions For Greg (taste / product only)

1. **Title default:** plain-left (shipped) or **opposite-left** (my pick —
   cleaner wordmark backing + better depth staging)? One-line call.
2. **Title hero:** is it intentional that the cyan rift aperture is the most
   eye-catching object, over the central well/void? For a game named "Last
   Singularity" I'd expect the void to be the hero. Want the well pushed up in
   visual weight?
3. **Home metaphor:** instrument console (plan's rec) vs. something more
   in-world. This decides how the central ship read gets framed before Forge
   composes it.
