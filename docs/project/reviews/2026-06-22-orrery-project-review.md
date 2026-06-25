# 2026-06-22 — Orrery Project Review

> Deep design-doc review after the Three.js renderer migration, the Steam Deck deploy work, and the v0.2 reframing.
> Author: Orrery (Claude). Intended audience: Codex acting on follow-up cleanups.
> Status date: 2026-06-22.

## What This Is

A structural review of the Last Singularity doc surface in light of three concurrent shifts:

1. The renderer migration from raw WebGL2 / Composer to a Three.js top-down 3D scene (default `?renderer=three`, shared WebGL2 context).
2. The first real platform-deploy work: Steam Deck (Linux Electron, Gaming Mode shortcut), iPad WKWebView scaffold, Switch 1 reframed as private bench, Feature Fridays release cadence.
3. The v0.2 reframing — `docs/v0.2/` as the new canonical island, everything pre-v0.2 treated as historical v0.1.

This is not a code review. It is an audit of whether the canonical design docs match the shipped system. The bottom line: the code and architecture are in good shape; the canonical doc surface is one rev behind.

## Sources Reviewed

- `CLAUDE.md`
- `docs/v0.2/README.md`, `DESIGN.md`, `DESIGN-CODE-DELTA.md`, `ROADMAP.md`, `V0.1-PATCH-NOTES.md`, `V0.2-RELEASE-NOTES.md`
- `docs/design/PILLARS.md`, `DESIGN.md`, `DESIGN-DEEP-DIVE.md`, `RENDERING-STACK.md`, `MOVEMENT.md`, `CONTROLS.md`, `META-LOOP.md`, `SLINGSHOT.md`, `SLINGSHOT-V2.md`, `SLINGSHOT-NETWORK.md`
- `docs/project/ROADMAP.md`, `BACKLOG.md`, `THREEJS-MIGRATION-PLAN.md`, `MECHANICS-SIM-RENDER-AUDIT.md`, `FEATURE-FRIDAYS-RELEASE-PROGRAM.md`, `STEAMOS-RUNTIME-PLAN.md`, `SWITCH1-ATMOSPHERE-FEASIBILITY.md`, `PUBLIC-OVERVIEW.md`
- `docs/journal/CHANGELOG.md` (recent), `DECISION-LOG.md` (recent), `DEVLOG.md` (recent)
- `docs/reference/PLATFORM-TARGETS.md`, `IPAD-IOS-BUILD.md`
- Recent commit log (last ~40 commits)

## What's Working

### `docs/v0.2/DESIGN-CODE-DELTA.md` is load-bearing

The single best doc in the repo right now. It explicitly names "older docs say X, code does Y, here is the gap." Every long-lived project should have one. The choice to call the entire pre-v0.2 era "v0.1" and to keep older docs as historical reference is the right model.

### `THREEJS-MIGRATION-PLAN.md` is structurally sound

Strangler bridge model, hard non-negotiables (sim and renderer stay separate, simulation state never lives in Three objects, aesthetic continuity comes before graphical novelty), parity gates A→G, and an honest implementation-status section that distinguishes shipped vs still legacy-owned. The decision to share the WebGL2 context rather than readback+upload is the right architectural call.

### `MECHANICS-SIM-RENDER-AUDIT.md` is the most prescient doc in the repo

Its core thesis — "the next step is not 'move more code into Three.' The highest leverage step is to make the invisible field model a shared contract" — is the correct call for the next phase. Specifically the recommendations around a typed `FlowSample` shape, client/server current-coupling parity, and remote brake intent are real bugs identified with real impact.

### The platform docs refuse the wrong-shaped temptations

`STEAMOS-RUNTIME-PLAN.md` keeps Electron as the near-term shell while gating SDL3+wgpu behind real prerequisites. `SWITCH1-ATMOSPHERE-FEASIBILITY.md` keeps Atmosphere as private research and refuses to pretend it is a release path. `IPAD-IOS-BUILD.md` is explicit that the WKWebView shell is bench rung one, not the destination. These are honest assessments that protect the project from premature rewrites.

### The release machinery is real

`FEATURE-FRIDAYS-RELEASE-PROGRAM.md` is a well-built release cadence with explicit release tiers, gate matrices, capture requirements, and an honest 8-week sample schedule. The deploy scripts (`deploy:deck`, `deck:gaming-mode`, `deploy:itch`, `deploy:steam`) exist. Nightly playables workflow exists.

## Drift And Contradictions

Listed in rough priority order. Each item names the conflicting docs, the actual state of the world, and a recommended resolution.

### 1. `CLAUDE.md` is jam-era and is still the front door

**Status:** `CLAUDE.md` still says "Game jam: March 16-22, 2026," "No code before 12:01a Monday March 16," "Multiplayer is a stretch goal — no networking code unless ahead by Thursday," and "Browser-based, WebGL, vanilla JS. Jam speed. Deploy to itch.io."

**Reality:** The jam ended three months ago. Multiplayer (local/private remote authority) is shipped and tested. The shipping product is Electron-desktop-first with itch HTML5 as a sandboxed debug fallback. The first listed onboarding doc is `docs/design/PILLARS.md`, which itself is jam-era.

**Impact:** Every new agent invocation in this repo is onboarded with the pre-rename, pre-renderer-shift, pre-platform-reframe worldview. New agents miss `docs/v0.2/` and `DESIGN-CODE-DELTA.md` entirely unless they happen to find them.

**Recommended fix:** Rewrite `CLAUDE.md`. Specifically:
- Repoint the "Read These First" list at `docs/v0.2/README.md`, `DESIGN-CODE-DELTA.md`, `DESIGN.md`, `ROADMAP.md` first; then `PILLARS.md`, `MOVEMENT.md` as anchors; demote the old `docs/design/DESIGN.md` to "historical context."
- Remove the jam constraints ("No code before 12:01a Monday March 16," "Multiplayer is a stretch goal," "code starts Monday").
- Rewrite the "Project" paragraph to name the current platform reality (Electron desktop, Steam Deck, web sandbox, iPad bench).
- Keep the Coordinate Conventions and Git Rules sections — those are still accurate.
- Single highest-leverage edit in the repo.

### 2. `PILLARS.md` predates Three.js and has not been rewritten for the new substrate

**Status:** `docs/design/PILLARS.md` is canonical, dated pre-jam. Pillar 1 ("Art Is Product") is framed around the ASCII shader as identity, with the test "if it looked like colored circles on a white background, would it be a different worse game?" `docs/v0.2/DESIGN.md` restates the pillars in one paragraph each and adds *"Three.js exists to deepen and organize that identity, not replace it with generic 3D space"* — but `PILLARS.md` itself has not been updated.

**Reality:** Three.js is now the default renderer substrate. The migration plan acknowledges the risk that "smooth 3D visuals can erase the terminal-fluid identity," and the mechanics audit calls out that most game objects are still drawn on the 2D overlay after the Three present pass while the fluid/ASCII image still comes from the legacy Composer. The "Art Is Product" rule needs to be enforceable in the Three world, not just in the canvas world.

**Recommended fix:** Rewrite `PILLARS.md` Pillar 1 in v0.2 terms. Name what Three is allowed to do to the ASCII identity and what it isn't. Concretely:
- The ASCII pass remains the final visual surface for gameplay.
- Three layers may add depth, parallax, lensing, and screen-space presentation but must read as LBH footage in 10 seconds.
- "If the new Three pass makes the ASCII less readable, it loses." Make this a pillar test, not just a migration-plan caveat.

Also worth: a short "v0.2 status" callout at the top of `PILLARS.md` pointing readers at `docs/v0.2/DESIGN.md` and `DESIGN-CODE-DELTA.md`.

### 3. Roadmap has split into four voices and no one is primary

**Status:** Four overlapping roadmaps:
- `docs/project/ROADMAP.md` — long jam-plus-post-jam doc with a "Current Status (2026-06-22)" section
- `docs/v0.2/ROADMAP.md` — the cleaner v0.2 phase plan (v0.2.1 / v0.2.2 / v0.2.3 / v0.2.4)
- `docs/project/BUILD-PLAN.md` — layer-build plan
- `docs/project/FEATURE-FRIDAYS-RELEASE-PROGRAM.md` — 8-week sample schedule with explicit feature briefs

**Reality:** Feature Fridays is the most actionable doc and the only one with concrete near-term commitments tied to release tiers. The v0.2 roadmap is the right architectural framing. The project ROADMAP is mostly current-status; BUILD-PLAN is mostly historical.

**Recommended fix:** Pick one primary roadmap. Recommend Feature Fridays as the active execution plan with `docs/v0.2/ROADMAP.md` as the architectural anchor it cites. Add a clear "this is the primary roadmap; for status see X, for jam history see Y" note at the top of each, so an agent landing in any one of them can route to the others.

### 4. The renderer audit and the v0.2 renderer phase disagree quietly

**Status:** `docs/v0.2/ROADMAP.md` v0.2.3 says: "Move more world entities and VFX out of canvas overlay into Three scene layers."

`docs/project/MECHANICS-SIM-RENDER-AUDIT.md` says: "Build field parity before more tuning. Define the shared sample shape, wire server/client adapters, and add tests. Do not change visuals yet." Its recommended build order is: field contract → movement parity repair → server-authoritative slingshot → Three entity migration → semantic render channels → route/map redesign → feel/visual tuning.

**Reality:** The audit is the more recent doc and the more specific one. It identifies real client/server divergences (current coupling, brake intent packaging, slingshot force-profile mismatch) that exist today.

**Conjunction worth flagging:** If entity migration to Three happens before the shared `FlowSample` contract exists, the current local/server field divergence will be baked into the Three scene projection and need to be redone. Cheap to adjust the order now.

**Recommended fix:** Promote the audit's build order into `docs/v0.2/ROADMAP.md` explicitly. The audit's recommendations 1–3 (field contract, movement parity, server slingshot) belong in v0.2.1 *before* slingshot number tuning and map redesign. Recommendations 4–5 (Three entity migration, semantic channels) belong in v0.2.3.

### 5. Public copy still leads with "browser/WebGL"

**Status:** `docs/project/PUBLIC-OVERVIEW.md` opens with: *"Last Singularity is a browser/WebGL extraction roguelike."* Same framing in the social bio, store short description, and the older `docs/design/DESIGN.md` ("Format: Web game (browser, canvas/WebGL)"). The "Honest Public Boundaries" section even says "Prefer 'browser/WebGL' over platform promises until the public website/download plan is chosen."

**Reality:** The shipping product is Electron-desktop-first. itch HTML5 is a sandboxed/debug fallback per `FEATURE-FRIDAYS-RELEASE-PROGRAM.md`. Steam Deck has a public install runbook and a Gaming Mode shortcut. The actual lead is "controller-first ASCII extraction roguelike, playable on Steam Deck and desktop, web demo available."

**Recommended fix:** Update `PUBLIC-OVERVIEW.md`:
- Replace the opening with platform-honest language: ASCII extraction roguelike, currently shipping on Steam Deck and desktop (Linux/macOS/Windows Electron) with a sandboxed web demo.
- Update the "Honest Public Boundaries" section to reflect that the platform reality is now clear.
- Update store short description, social bio, and any duplicated copy elsewhere.

### 6. Three legacy design docs are now actively misleading

These are not just historical — they describe systems that no longer exist as canonical:

- `docs/design/RENDERING-STACK.md`: describes a five-layer 2D-canvas + WebGL stack with explicit visual-density-buffer migration phases. No mention of Three.js anywhere. Reads as canonical.
- `docs/design/DESIGN-DEEP-DIVE.md`: renderer section is entirely the legacy Composer pipeline (font atlas, character cell grid, layered rendering pipeline). No mention of Three.js. Reads as canonical.
- `docs/design/SLINGSHOT-NETWORK.md`: Status section says "Client implementation shipped; multiplayer authority deferred." Open Decisions section #7 still says "Server authority. Slingshot state needs to be authoritative for multiplayer." `docs/v0.2/V0.2-RELEASE-NOTES.md` says: "Server-authoritative slingshot engagement, energy, release, and chain state are shipped and tested." The slingshot doc has not been updated since Codex hardened authority.

(Note: `docs/design/SLINGSHOT.md` and `SLINGSHOT-V2.md` are aspirational design-exploration docs from before the system shipped. They are correctly archival but should carry a "superseded by SLINGSHOT-NETWORK.md" banner.)

**Recommended fix:**
- Add a two-line "Superseded by v0.2" banner at the top of `RENDERING-STACK.md` and `DESIGN-DEEP-DIVE.md` pointing at `docs/v0.2/DESIGN.md` and `docs/project/THREEJS-MIGRATION-PLAN.md`. Keep the historical content; just stop letting them read as current.
- Update `SLINGSHOT-NETWORK.md` Status and Open Decisions to reflect that server authority has shipped. Move open items to whatever still actually is open (numbers tuning, map redesign for routes).
- Add a "Superseded by SLINGSHOT-NETWORK.md" banner at the top of `SLINGSHOT.md` and `SLINGSHOT-V2.md`.

### 7. The "controls degrading as the universe dies" promise is unredeemed

**Status:** `PILLARS.md`, the older `DESIGN.md`, and `PUBLIC-OVERVIEW.md` all describe a stacking pressure mechanism where spacetime viscosity ramps over the run and "the controls themselves degrade — you feel the universe dying through the input." The PUBLIC-OVERVIEW lists viscosity rising as one of the universe-collapse mechanics.

**Reality:** `docs/v0.2/DESIGN-CODE-DELTA.md` correctly notes: "Growth, portal expiry, signal/Inhibitor, wreck drift, events, overload timeScale exist; run-wide viscosity degradation is not the main pressure axis." This is one of the most evocative pieces of the pitch and one of the things the game does not actually do at the strength claimed.

**Recommended fix:** Pick one:
- Implement it. A run-wide viscosity ramp coupled to time-elapsed or inhibitor-pressure, with visible/audible cues. This is one tuning week's worth of work, plus playtest.
- Cut it from public-facing copy. Keep it in design notes as a future direction.

Right now it is a marketing promise the game does not keep. Either resolution is honest; the current state is not.

### 8. Stale gates and build-health drift

**Status:** `docs/project/ROADMAP.md` "Current Status" table says nightly playables workflow is STALE (last green `7e138cd`) and BUILD-HEALTH is STALE (predates the 2026-05-09 feature stack). `docs/journal/DEVLOG.md` notes the same.

**Reality:** Real. Both gates need a refresh pass.

**Recommended fix:** Run `node scripts/build-health.cjs verify` to refresh the health gate. Run a nightly-playables workflow pass against the current main. Update the "Current Status" table when done.

## Recommended Action Sequence

Ordered for highest leverage first. Each item is intended to be a small, independently committable change.

### Tier 1 — Make new agents land in current truth

1. **Rewrite `CLAUDE.md`.** Repoint Read These First. Kill jam constraints. Name current platform reality. Keep Coordinate Conventions and Git Rules.
2. **Add v0.2 superseded banners** to `RENDERING-STACK.md`, `DESIGN-DEEP-DIVE.md`, `SLINGSHOT.md`, `SLINGSHOT-V2.md`. Two lines each.
3. **Update `SLINGSHOT-NETWORK.md`** Status and Open Decisions to reflect shipped server authority.

### Tier 2 — Resolve the structural drift

4. **Rewrite `PILLARS.md` Pillar 1 for the Three world.** Name what Three is allowed to do to the ASCII identity. Add a "v0.2 status" callout at the top.
5. **Pick one primary roadmap.** Recommend Feature Fridays as active, `docs/v0.2/ROADMAP.md` as architectural anchor. Add cross-pointers at the top of each.
6. **Promote the field-truth contract into `docs/v0.2/ROADMAP.md` v0.2.1.** Adopt the mechanics audit's build order: field contract → movement parity → server slingshot → entity migration → semantic channels → route redesign → feel tuning. Reorder before slingshot number tuning lands.

### Tier 3 — Match public copy to product reality

7. **Update `PUBLIC-OVERVIEW.md`** to lead with platform-honest language. Steam Deck + desktop primary, web demo secondary.
8. **Decide on the "controls degrading" pitch promise.** Either implement viscosity ramp or remove from public copy.

### Tier 4 — Stale gates

9. **Refresh build-health.** `node scripts/build-health.cjs verify`. Update STALE markers in `docs/project/ROADMAP.md`.
10. **Run a nightly-playables pass** against current main. Update last-green SHA.

## Appendix: Doc-By-Doc Status

For Codex to pick from. Marked **C** = canonical and current, **C\*** = canonical but needs update, **H** = historical (correctly), **MISLEADING** = reads canonical but isn't, **TODO** = needs the explicit fix listed above.

### Top-level
- `CLAUDE.md` — **MISLEADING** — see Tier 1 item 1.

### docs/v0.2/
- `README.md` — **C**
- `DESIGN.md` — **C**
- `DESIGN-CODE-DELTA.md` — **C** (best doc in the repo)
- `ROADMAP.md` — **C\*** — needs field-truth contract promotion (Tier 2 item 6)
- `V0.1-PATCH-NOTES.md` — **C** (historical, correctly)
- `V0.2-RELEASE-NOTES.md` — **C**

### docs/design/
- `PILLARS.md` — **C\*** — needs Pillar 1 rewrite (Tier 2 item 4)
- `DESIGN.md` — **H** — has the right "historical note" banner; leave it.
- `DESIGN-DEEP-DIVE.md` — **MISLEADING** (renderer section) — needs v0.2 superseded banner (Tier 1 item 2)
- `RENDERING-STACK.md` — **MISLEADING** — needs v0.2 superseded banner (Tier 1 item 2)
- `MOVEMENT.md` — **C** mostly; the affordance catalog is still useful but some tuning numbers are speculative-not-shipped. Low priority.
- `CONTROLS.md` — **C** mostly; check that delta-v/brake/speed-cap reflect shipped reality.
- `META-LOOP.md` — **C\*** — earnings calculation may not match shipped UI. Reconcile during v0.2.2 work, not now.
- `SLINGSHOT.md` — **H** but reads canonical — needs superseded banner (Tier 1 item 2)
- `SLINGSHOT-V2.md` — **H** but reads canonical — needs superseded banner (Tier 1 item 2)
- `SLINGSHOT-NETWORK.md` — **C\*** — Status and Open Decisions out of date (Tier 1 item 3)

### docs/project/
- `ROADMAP.md` — **C\*** — stale gate markers need refresh; consider demoting to "history + current status" with Feature Fridays as primary
- `BACKLOG.md` — **C**
- `BUILD-PLAN.md` — likely **H** — confirm and banner if so
- `THREEJS-MIGRATION-PLAN.md` — **C**
- `MECHANICS-SIM-RENDER-AUDIT.md` — **C** (most prescient doc in the repo)
- `FEATURE-FRIDAYS-RELEASE-PROGRAM.md` — **C** — should be promoted to primary execution doc
- `STEAMOS-RUNTIME-PLAN.md` — **C**
- `SWITCH1-ATMOSPHERE-FEASIBILITY.md` — **C**
- `PUBLIC-OVERVIEW.md` — **C\*** — leading language out of sync with shipping reality (Tier 3 item 7)
- `PERSISTENCE-AND-CONTROL-PLANE-PLAN.md`, `PLAYER-BRAIN-AND-OVERLOAD-PLAN.md`, `NETWORK-ARCHITECTURE-PLAN.md` — **C** (shipped, content matches code)
- Dated review docs (`2026-04-12-…`, `2026-04-19-…`, `2026-04-20-…`) — **H** (correctly)

### docs/reference/
- `PLATFORM-TARGETS.md`, `IPAD-IOS-BUILD.md`, `DEPLOY-TO-DECK.md`, `STEAM-DECK-RUNBOOK.md` — **C**

## Notes On Scope

This review intentionally does not propose new features. The drift identified above is all in the doc surface, not in the code architecture. The architecture (sim/renderer split, control plane, PlayerBrain, content manifests, slingshot authority, Three substrate, platform pipelines) is in good shape.

The one architectural recommendation worth flagging — defining a shared `FlowSample` contract before further Three entity migration — already exists in `MECHANICS-SIM-RENDER-AUDIT.md`. The cleanup needed is to promote that recommendation into the active roadmap, not to re-discover it.

The mechanism works. The docs describing it are partially still describing the previous machine. Bring them up to date and the next phase will be cheaper.
