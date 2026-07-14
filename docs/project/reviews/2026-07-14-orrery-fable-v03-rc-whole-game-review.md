# v0.3 RC Whole-Game Review — Last Singularity `f07e809`

> Reviewer: Orrery (independent). Date: 2026-07-14. Target: v0.3 RC `f07e809`
> (`0.3.0`). This is an acceptance-evidence memo, not an implementation task. No
> production code, assets, tests, roadmaps, or decision logs were modified. The
> only tracked output is this memo; review captures live under the ignored
> `tests/screenshots/v03-rc-review-20260714/`.

---

## 1. Executive Verdict

**The architecture is sound and much of the landed work is genuinely good. But
this RC should be fixed before it goes in front of Greg's final taste gate — not
promoted after it, and not reopened.**

Recommendation: **Fix before acceptance.**

v0.3 does what it set out to do. The one-authority / one-world / one-presentation
-boundary shape is real, the ASCII-fluid identity survives the production pass,
the entity/texture lifecycles are clean and bounded, and the protocol-v2 /
Ballpark work is disciplined. This reads as Last Singularity, and the seams that
mattered in v0.2 are mostly gone.

The problem is that two promotion-relevant defects survive the green gate, and
both distort the exact things Greg's taste gate exists to judge:

- **The well grace timer is broken** (F1, S1). A grace-equipped hull — reachable
  on the public Drifter/Breacher through the normal rig loop — becomes *immortal*
  to a well on slow entry, and floods the bounded event journal with a
  per-tick `player.hullGraceStarted`. This violates Pillar 5 (wells must kill)
  and no test catches it because the default grace is 0.
- **The flagship extraction journey intermittently strands on fuel** (F2, S1/S2).
  `test:agent-eval`'s "fresh Shallows journey reaches a changed second run"
  failed 2 of 3 runs here — including **once in isolation**, so it is not just my
  machine's load. The one playable story is not reliably completable, and the RC
  gate leans on this exact flaky test as journey proof.

Fix those two, and the RC deserves Greg's feel/visual/audio pass. The rest of
what I found is Greg's-taste, honest tuning, or post-v0.3 cleanup — not blockers.

### Method boundary (stated honestly)

I reviewed via the project's own headless-Chrome harness driving **real** menu
and flight input (not debug fixtures) for journeys, plus source/contract
inspection, the focused test lanes, and live introspection. Three things I could
**not** do, and do not claim:

- **I cannot hear the mix.** Headless has no audio device. I inspected the audio
  graph, routing, budgets, and lifecycle in code; subjective sound quality stays
  a Greg-only gate, exactly as `RC-GATE.md:128-131` already says.
- **My own screenshots capture the 2D overlay but not the WebGL/Three layer**
  (headless WebGL isn't read back without `preserveDrawingBuffer`). So I ground
  visual-composition claims in the passing `UIVisual` (18/18) and `Renderer`
  (5/5) harness captures, the `agent-play-eval` 18-frame journeys, and code —
  not my own stills. Full visual taste is Greg's gate.
- **The packaged Electron desktop app was not input-driven by me** (automation
  can't pilot the Electron client). I confirmed the artifact exists and matches
  the RC, and rely on the existing `test:package` closure evidence + my
  browser-path natural journeys for the playable-loop proof. **Physical Steam
  Deck was not exercised — residual physical risk, as the gate already flags.**

---

## 2. Review Conditions

- **RC / build:** `f07e809`, version `0.3.0`. Custody verified: worktree branch
  `codex/v0.3-rc-review-packet` @ `0284220` (a docs review branch), but
  `git diff --quiet f07e809 -- src scripts tests assets package.json package-lock.json`
  is **clean** — production surfaces match the RC exactly. Packaged playtest ZIP
  present (`builds/last-singularity-playtest-v0.3.0.f07e809.zip`, 436 MB).
- **Machine:** macOS (darwin 27.0.0), Apple Silicon. Headless Chrome via the
  repo's CDP harness (`tests/browser-driver.cjs`), viewport 1280×800 and 1280×720.
- **Renderer:** Three (`index-a.html?renderer=three`). Authority: local sim on an
  isolated loopback port; the running dev stack untouched.
- **Seeds / hulls:** Shallows seed 424242 (diagnostic census); `agent-play-eval`
  natural journeys use their own fresh seeds, Drifter + Breacher.
- **Journeys completed:**
  - Real-key menu flow `title → profileSelect → home` (my smoke driver; Three
    renders, 0 page errors).
  - `agent-play-eval` natural extraction+second-run and Breacher death-to-Home
    (protocol-v2, remote authority, no debug mutation) — re-run for this review.
  - Diagnostic Shallows play (fixture-started, local authority) for entity
    census, movement/tuning read, HUD overlay capture.
  - Reduced-motion title probe (RM on vs off, frame-diff).
- **Focused lanes I ran on `f07e809`:** `test:ui-motion` PASS, `test:audio` PASS,
  `test:visual` PASS (HudDeck 2/2, Renderer 5/5, UIVisual 18/18), `test:agent-eval`
  **flaky** (see F2).

---

## 3. Findings First

Severity: **S0** release-breaking · **S1** must fix before promotion · **S2**
worthwhile v0.3 polish · **S3** later. "Verified" = I confirmed it myself in code
or by run; "reported (high-confidence)" = surfaced by a source-digest pass with a
concrete file:line I spot-checked but did not fully re-derive.

### F1 · S1 · Well grace timer is broken → immortality + per-tick event flood — *verified*

- **Observed:** `applyWellGravity` unconditionally zeroes `hullGraceRemaining = 0`
  *every tick* (`scripts/sim-runtime.cjs:2750-2752`), after `resolveWellContact`
  re-grants it from `brain.wellGraceDuration` whenever it is 0
  (`:2689-2697`). So each tick a grace-equipped player sits inside a kill radius:
  grace is re-granted, `player.hullGraceStarted` is re-published, then zeroed
  again. The normal decrement branch (`:2686-2688`) is dead via this path.
- **Expected:** grace protects for `wellGraceDuration` seconds, then the player
  dies. Instead: **discrete-path entry → never dies + emits `hullGraceStarted`
  at tick rate (~30–60/s); swept-path entry → grace zeroed ~1 tick later → dies
  almost immediately** despite grace. The mechanic is broken in both directions.
- **Reproduction:** equip any rig that raises `wellGraceDuration > 0` (base is 0,
  but rig upgrades raise it up to 1.0 — `scripts/player-brain.cjs:178`, range
  `[0,1.0]`; the public Drifter hydrates to ~0.4–0.5 in `tests/player-brain.cjs:58,91`).
  Drift slowly into a well's kill radius. Player is not killed; the event stream
  fills with `hullGraceStarted`.
- **Root cause:** the reset at `:2750-2752` should only clear grace when the
  player is **not** currently within any well's kill radius; as written it runs
  unconditionally after the well loop, defeating the timer.
- **Why it matters:** violates Pillar 5 (Dread Over Difficulty — wells must be
  lethal); the per-tick event re-publish inflates the *bounded* event journal and
  snapshot ring (a protocol concern), and would machine-gun any audio/UI keyed on
  grace. Reachable through the core v0.3 rig loop on a shipped hull, and invisible
  to CI because every suite runs the default `wellGraceDuration = 0`.
- **Source:** `scripts/sim-runtime.cjs:2686-2698, 2748-2752`; `scripts/player-brain.cjs:178`.

### F2 · S1/S2 · Flagship extraction journey intermittently strands on fuel — *verified*

- **Observed:** `test:agent-eval` → "fresh protocol-v2 Shallows journey reaches a
  changed second run" **failed 2 of 3 runs** for me: once under concurrent load,
  and **once in a clean isolated re-run** (isolated Run 1 passed, Run 2 failed).
  Failure is consistent: the AI pilot runs out of delta-v (`fuelRatio ≈ 0.096,
  recharging:false`) and cannot reach `well-2-inner-current` on the slingshot
  route (`closest = 0.107`, dist 0.586 to target).
- **Expected:** the one playable teaching story completes reliably, and the gate
  evidence is stable. `RC-GATE.md:38-40` claims this journey passes "without a
  retry."
- **Reproduction:** `npm run test:agent-eval` repeatedly from a fresh stack; it
  fails intermittently on the extraction/second-run half, not the death half.
- **Root cause (likely chain):** the delta-v economy on the Shallows slingshot
  route has too little headroom for the provisional `2.5` server thrust baseline +
  ambient regen; an imperfect approach spends enough fuel that the next well is
  unreachable. Not a crash — a tuning/margin defect. It also means the gate's
  "green agent-eval" is itself flaky (a test that proves the wrong thing by
  passing often enough to look green).
- **Why it matters:** Movement Is the Game, and this is the route the RC ships to
  teach it. If an automated pilot strands ~half the time, a mediocre human will
  too, and the RC's own journey proof is unreliable.
- **Source / evidence:** `tests/agent-play-eval.cjs`; my run log
  `tests/screenshots/v03-rc-review-20260714/agent-eval-isolated.log`.

### F3 · S2 · Reduced-motion does not suppress the title fault system — *verified (code + run)*

- **Observed:** title glyph jitter + corruption overlay are gated only on
  `glitchState.active`, never on `motion.reducedMotion`
  (`src/main.js:3415-3431`); `collectTitleVfxEvents` (`:3305`) + `CONFIG.vfx`
  spawn `titleGlyphFault` particles regardless of `CONFIG.ui.motion`. My run: with
  `reducedMotion:true, intensity:0`, title frames ~1.5s apart differ in **1748/1897
  sampled bytes (92%)** — essentially identical to motion-on (223/236, 94%). The
  title surface does not settle under reduced motion.
- **Expected:** `UI-VISUAL-SYSTEM.md` + `RC-GATE.md:117` ("Reduced-motion … tested")
  promise the same settled state without animation. The tokenized UI layer
  (`src/ui/motion.js`) *does* honor RM correctly — this is only the ad-hoc title
  fault layer.
- **Reproduction:** set `CONFIG.ui.motion.reduced = true`, sit on title; jitter +
  glyph corruption + ember bursts continue every ~2.15s glitch period.
- **Root cause:** the title fault + VFX path never reads the reduced-motion flag;
  it's a separate clock from the tokenized grammar.
- **Source:** `src/main.js:3305-3321, 3415-3431`; `src/render-three/vfx/vfx-manager.js`.
- **Note:** the *particle pool itself is correctly bounded* — this is an
  accessibility leak, not an unbounded-growth bug.

### F4 · S2 · Remote-mode audio double-fire (`starConsumed`, `scavDeath`) — *verified*

- **Observed:** `applyRemoteEvents` routes **every** event through
  `audioRouter.authoritative(event)` (`src/main.js:2384`) — which maps
  `star.consumed → starConsumed` and `scavenger.consumed → scavDeath` via
  `LOCAL_EVENT_CUES` (`src/audio/audio-router.js:14-15`) — and then the *same*
  switch calls `audioEngine.playEvent('starConsumed')` (`:2495`) and
  `playEvent('scavDeath')` (`:2521`) again. Two plays per event; the router's
  dedup does not cover the manual call.
- **Expected:** one cue per authoritative event (`audio-soundscape-contract.md:10-14`).
- **Effect:** doubled voices + stacked `_duck` (`src/audio.js:896`) → audible
  pump/clip on star and scavenger death in the **remote (shipped) path**.
- **Root cause:** two ingress paths (router + manual) both sound the same event.
- **Fix:** drop the manual `playEvent` for these two cases and let the router own
  them (keep the visual `waveRings`/`showWarning` side effects).

### F5 · S2 · Client 1.7 vs server 2.5 thrust; `physics.cjs` tests the wrong path — *verified*

- **Observed:** authoritative server thrust is a hardcoded `2.5`
  (`scripts/sim/player-movement-step.cjs:66`); the client-local `ship.js` path is
  `1.7` (`src/config.js:37`). The shipped packaged/loopback build runs the **2.5**
  server sim (the provisional intended value); `1.7` is the offline/fallback path,
  and it **is reachable** — my diagnostic fixture play reported
  `remoteAuthorityActive:false`, `thrustScale 0.7`, running `ship.js`. Meanwhile
  `tests/physics.cjs` exercises **only** the 1.7 client path
  (`tickShipPhysicsForTest`) and its well-pull test **counts death as a pass**
  (`:171-174`), while `MovementGolden` pins the 2.5 server value.
- **Expected:** one movement truth, or an explicit, tested divergence. Today the
  two paths differ ~47% for the same input and no test proves parity; the path
  physics.cjs validates (1.7) is not the path most players feel (2.5).
- **Fix:** reconcile 1.7 → 2.5 (or delete the dead client-physics path), and fix
  the death-as-success assertion so it can't green-light the opposite of its name.

### F6 · S2 · Sentries (threat) render with the ecology-shared sprite — *verified*

- **Observed:** `fauna` and `sentries` both select `'sentryFauna'`, differing only
  by radius (`src/render-three/entities/world-sprite-visual-family.js:31-32`).
  Fauna is initialized empty in the RC (`scripts/sim-runtime.cjs:1317`) while
  sentries spawn (`:1318`) — my Shallows census: 0 fauna, sentries present,
  3 scavengers. So the fauna↔sentry *collision* is currently latent (no fauna in
  play), but a **lunging sentry threat renders with an ecology-coded sprite** and
  has no distinct threat silhouette.
- **Expected:** Pillar 1 — "the player should tell ship, threat, loot/wreck, route
  anchor, ecology, and anomaly apart before reading a label"
  (`docs/design/PILLARS.md:20-23`). The palette plan calls this the category-truth
  failure; the swarm review confirms no new runtime art landed.
- **Why S2 not S1:** it ships under a green presentation gate (families are
  "lifecycle-managed," not category-distinct), and Greg's visual verdict is the
  intended gate for this class — but it's a live Pillar-1 gap worth naming before
  that verdict, not after.

### F7 · S2 · Color role collisions (semantic hue reuse) — *reported (high-confidence), spot-verified*

- **Observed:** `inhibitorMagenta === anomalyMagenta` (exact hex `0xe636ff`,
  `src/presentation/presentation-style.js:35-36`); `flow`, `player`, and `tech`
  all resolve to one cyan (`src/ui/canvas-primitives.js:11-13`, cyan is the default
  fallback); item tier colors reuse role hues (`src/ui/design-tokens.js:88-93`);
  four distinct magentas exist with no documented boundary. Separately, ~148
  hardcoded `rgba()` literals in `src/main.js` vs 86 `roleColor()` calls — the
  overlay layer largely bypasses the role system.
- **Expected:** `UI-VISUAL-SYSTEM.md:76-77` — "when color appears, it has a role
  the player can learn." Inhibitor ≡ anomaly by hue is the sharpest collision.
- **Why it matters:** answers Priority-1-A Q4 directly; the role language is the
  discipline that keeps the palette readable, and it's leaking.

### F8 · S2 · Thrust/brake/coast have no audio cue — *verified*

- **Observed:** thrust/brake/coast are continuous input states, not events, and
  no cue is fired for them (`thrustOn`/`_playThrustOn` exist with **zero call
  sites**; no continuous thrust loop). Not on the contract's intentional-silence
  list (`audio-soundscape-contract.md:32-34`).
- **Expected (Priority-1-C Q2):** the player can hear their own thrust/brake/coast.
  Today the ship's core verb is silent; movement audio comes only from the
  well/fluid beds.
- **Correction to note:** the sim **does** emit `player.slingshotEngaged/Released`,
  `player.portalProximity/Confirmed`, `player.scavengerBumped`, `player.loot`,
  `star/scavenger.consumed`, `player.died/escaped` (`scripts/sim-runtime.cjs`),
  and the router maps all of them (`src/audio-events.js:31-38`). So on the shipped
  remote path those cues **do** fire — the coverage hole is specifically the
  continuous flight triad + a silent universe-collapse death (`src/main.js:4600`
  sets phase `dead` with no `playEvent('death')`).

### F9 · S2 (perf) / S3 (smell) · Ballpark full rebuild every tick — *reported (high-confidence)*

- **Observed:** `refreshBallparkMirror` runs a full `rebuildFromRuntime` every tick
  including never-moving wells/stars/portals (`scripts/sim-runtime.cjs:1031-1040`);
  it is load-bearing (pickup/extraction throw without it, `:2806, 2837`), so O(N)
  create/update/remove churn sits on the gameplay-critical path.
- **Status:** within Deep Field budget today (`ROADMAP.md` records Ballpark sync
  p95 1.142 ms), so not a live regression — but a scaling smell for an
  "observation layer," worth an incremental-update pass before maps grow.

### F10 · S3 · Latent correctness seams — *reported (high-confidence)*

- Extraction is endpoint-only, no sweep — a high-speed portal fly-through can be
  missed where pickup/well would sweep-catch it (`sim-runtime.cjs:2958-2961`).
- No input timeout — a dropped client's last `thrust` keeps applying until the
  next packet (`:6276-6285`).
- `Math.random()` in id/entity creation breaks byte-determinism for repro
  (wave/wreck/fauna ids) even under a fixed seed.
- `metaPhaseTimer` is advanced inside the meta **render** block
  (`src/main.js:6337`) — if that render is ever skipped, the salvage-report gate
  never advances → soft-lock.
- Uncapped `transitionTimer` (`:3899`) collapses a transition into one frame after
  a multi-second tab-away (no glitch cover).
- The remote-death early-return path mirrors `_prev` edge state but omits
  `_prevExtract`/`_prevSlingshot` (`:4194-4207`) — benign today, fragile to reuse.

### F11 · S3 · Dev-panel / diagnostics gaps — *reported (high-confidence)*

- `AudioEngine.getDiagnostics()` and the mixer's drop stats exist but have **zero
  consumers** — admission failures are silently swallowed, so a human tuner has no
  readout for "why did that cue drop" (`src/audio.js:37`, `src/audio/mixer.js:31`).
- `config.audio.scavengerMaxDist` / `portalMaxDist` are dead knobs (0 refs).
- `loot` is a fixed arpeggio, no variation, 0.08s cooldown → machine-guns on
  multi-wreck pickup (`src/audio.js:554`).

### F12 · S3 · Documentation drift — *verified*

- `docs/design/AUDIO.md` says `maxWellVoices: 4`; the v0.3 contract says two
  nearest layers (self-labels "Jam Scope," so a labeling gap).
- `docs/design/CONTROLS.md` tuning table still lists "Thrust force TBD" vs the
  concrete provisional 2.5.
- `docs/v0.2/DESIGN.md` (surfaced in the "read as current" list) lists 5 live
  hulls + the old slot contract, contradicting v0.3's Drifter+Breacher-only + rig
  tracks — worth a "superseded by v0.3" note.
- There is no `AGENTS.md` at the worktree root; the agent-instructions file is
  `CLAUDE.md`. `UI-VISUAL-SYSTEM.md` still self-labels v0.2.

---

## 4. UI & Motion Scorecard

| Dimension | Read |
|---|---|
| Hierarchy | Strong in the tokenized layer (terminal frames, staggered reveal, focus). Weak spot: the overlay layer bypasses the role system (~148 inline `rgba()`), and the in-match velocity/zone readout sits **dead-center** over the playfield (echoes my v0.2 "keep center clean" note). |
| Readability | Deferred to Greg + the passing `UIVisual` canary (18/18, named-region contrast + dual-size). Not independently re-judged (WebGL not read back headless). |
| Identity | Holds — one failing-instrument read; the `titleGlyphFault` / renderer-neutral event split is the strongest architectural decision in the stack and is cleanly enforced (`presentation-frame.js` is facts-only). |
| Input readiness | Mostly good; the uncapped transition timer (F10) can eat input for ~0.2s after a tab-away with no visual feedback. |
| Transition grammar | One grammar in the tokenized layer; a **second, un-tokenized sinusoidal layer** (title/meta/profile/loading blinks) runs on its own clocks and ignores reduced motion. |
| Corruption restraint | Conceptually right (intermittent overlay, not a resting color) — but **not reduced-motion aware** (F3). |
| Reduced-motion parity | **Fails on the title fault + VFX layer** (F3). Tokenized surfaces settle correctly. |
| Deck/couch legibility | `HudDeck` 1280×800 rails don't overlap (2/2); full couch/handheld read is Greg's gate + physical Deck (not exercised). |

## 5. Audio Scorecard

| Dimension | Read |
|---|---|
| Identity | Cannot judge timbre (headless). Structurally coherent: five buses, priority ladder, motif grammar defined. |
| Event coverage | Better than it first looks — the sim emits and the router maps slingshot/portal/scavenger/loot/extract/death on the remote path. **Genuine holes:** thrust/brake/coast (no cue), universe-collapse death (silent), menu back/cancel (silent). |
| Mix / read order | No auto-duck of continuous beds under critical cues — `death`/`portalConfirm` may be masked by a loud Inhibitor bed (lead for Greg's mix pass). |
| Spatial truth | Pan is screen-projected from real world position (good) but static-at-trigger, horizontal-only; several discrete cues forced mono. |
| Repetition | `loot` and `menuMove` have no variation → machine-gun risk over a run. |
| Lifecycle / budget | Two independent budgets + mixer caps + `criticalReserve`; persistent beds idempotent; continuous updates throttled to 15 Hz. **Real issues:** remote double-fire (F4); event voices cleaned by a 5s timer rather than `onended` (the robust `_wireAndPlay` helper is dead code). No cross-run leak. |
| Tooling | `getDiagnostics`/drop-stats never surfaced; dead config knobs (F11). |
| Target-device risk | Headphone/speaker verdict is Greg's; the open gate item "browser audio-graph/source-count inspection" is partially closed here (graph is bounded; the defects above are the exceptions). |

## 6. Movement & Physics Scorecard

| Dimension | Read |
|---|---|
| Intentional control | Best evidenced by `agent-play-eval` natural journeys (death + extraction via protocol-v2, no mutation). My own fixture thrust-injection didn't cleanly engage on the local path, so I don't claim feel numbers from it — feel is Greg's gate. |
| Thrust/brake/coast | Server composition is clean (split-integration, external forces land between drive and integrate). **But two thrust truths exist (1.7 vs 2.5) and the wrong one is unit-tested** (F5). |
| Fluid influence | Coupling model consistent across paths (0.8/1.2), clamped per tick — sound. |
| Slingshot | Fully server-side, deterministic, perceivable (capture snaps to tangential, stored energy scales, poor release has real consequence). Good. |
| Contact fairness | Swept toroidal contact for well/pickup/scavenger; ship modeled as a point; kill radius sits inside the drawn accretion disk (fair direction). **Extraction is endpoint-only** (F10). Collider-vs-visual parity for portal/pickup rings not renderer-cross-checked. |
| Authority correction | Not stress-tested for jitter here; the 1.7-vs-2.5 gap is a rubber-band risk **if** the client predicts at 1.7 against a 2.5 server — worth a targeted check. |
| Route teaching / reset stability | **The Shallows route's fuel margin is too tight** (F2). No physics leak between runs found; per-player state is on player objects, Ballpark bumps epoch on session start. |

## 7. Systemic Risks

- **Green gate ≠ correct game.** F1 (grace), F3 (reduced-motion), F5 (thrust path),
  F6 (sentry silhouette) all pass CI while being wrong, because the tests assert
  presence/wiring, not the property that matters. F2 shows a gate test that is
  itself flaky. The gate proves contracts; it does not prove the game.
- **Two implementations of the same truth.** Movement (1.7 client / 2.5 server)
  and toroidal math (`coords.js` client / `world-geometry.cjs` server, plus inline
  re-derivations in `spatial-index.cjs`) currently agree but are not single
  sources — divergence risk on any future edit.
- **Bounded-lifecycle claim vs event-flood reality.** The protocol/journal are
  carefully bounded, but F1 re-publishes an event every tick — a correctness bug
  that also pressures the very bounds v0.3 built.
- **Ownership drift in audio.** Two ingress paths (router + manual `playEvent`)
  produce the double-fire; the offline authoring pipeline (`tests/audio-toolkit.cjs`)
  is a second, unreconciled source of cue definitions.

## 8. Prioritized Action Plan

### Pre-promotion (fix before Greg's acceptance) — max 5

1. **Fix the well grace timer (F1).** Guard `sim-runtime.cjs:2750-2752` so grace
   only clears when the player is outside all kill radii. **Acceptance:** a new
   test sets `wellGraceDuration > 0`, expects death after the window, and asserts
   `hullGraceStarted` fires **once** per contact. Files: `scripts/sim-runtime.cjs`,
   new case in `tests/physics.cjs` or a sim-structure suite.
2. **De-flake + re-margin the extraction journey (F2).** Give the Shallows
   slingshot route enough delta-v headroom that `agent-play-eval`'s extraction
   half passes deterministically; run it ≥10× green. Files:
   `tests/agent-play-eval.cjs` (route/margin), tuning constants, `docs/v0.3/RC-GATE.md`
   (record the stabilized evidence).
3. **Reduced-motion title parity (F3).** Gate `main.js:3415-3431` title jitter/
   corruption and `collectTitleVfxEvents` (`:3305`) on `motion.reducedMotion`.
   **Acceptance:** extend the reduced-motion UI test to sit on title across one
   glitch period and assert a settled frame.
4. **Kill the remote audio double-fire (F4).** Remove the manual `playEvent`
   for `star.consumed`/`scavenger.consumed` (`main.js:2495, 2521`); let the router
   own them. **Acceptance:** an audio test asserts one voice admission per event.
5. **Reconcile the thrust path + fix the false test (F5).** Decide 1.7 vs 2.5 as
   one truth (or delete the dead client path), and fix `physics.cjs:171-174` so
   well-death is not a pass. **Acceptance:** a client-vs-server parity assertion.

### Post-v0.3 polish — max 5

1. Sentry threat silhouette (F6) — distinct sprite once the art wave lands.
2. Color role hygiene (F7) — resolve inhibitor≡anomaly hex, route the overlay
   layer through `roleColor()`.
3. Thrust/brake/coast audio + silent-death cue (F8); loot variation (F11).
4. Surface `getDiagnostics`/mixer-drop stats in the dev panel (F11).
5. Ballpark incremental-update pass (F9); extraction sweep + input timeout (F10).

### Belongs in v0.4 (not this line)

- Any client prediction/rollback for the 1.7-vs-2.5 gap under real latency — the
  divergence only becomes a rubber-band problem in the multiplayer transport,
  which is explicitly v0.4. Fix the *value* now; leave prediction to v0.4.
- Input-timeout/stale-input semantics matter most for networked disconnect (v0.4);
  a minimal single-player guard is fine now.

## 9. Open Calls for Greg (taste / product only)

1. **Grace fix intent (F1):** I recommend "protect for the full duration, then
   die." Confirm that's the intended feel and not "grace = one-well immunity."
2. **Thrust truth (F5):** I recommend standardizing on **2.5** (the value your
   fixtures and shipped loopback already use) and retiring 1.7. Your call, since
   this is the feel you'll tune.
3. **In-match center readout:** the velocity/zone text sits dead-center over the
   playfield. I'd dock it to an edge (keep center clean). Taste call.
4. **Reduced-motion title (F3):** confirm you want the title to fully settle under
   reduced motion (my assumption) vs. a reduced-but-present fault.

## 10. What Is Already Excellent (protect this)

- **The presentation boundary.** `presentation-frame.js` is a genuinely clean,
  facts-only frozen frame; "gameplay truth never in particles" is confirmed and
  enforced, not aspirational. This is the load-bearing decision and it holds.
- **Entity/texture lifecycle.** My run: `pooledMeshes 131`, `textureCount 7` (peak
  7, `disposeCount 0`, `loadErrors 0` — no growth), VFX bounded (pool 350, dropping
  over budget as designed), families bounded (worldSprites 8/288, wreck 10/144).
  No leaks. The bounded-lifecycle gate claim is real.
- **Slingshot.** Deterministic, server-owned, perceivable capture/energy/release
  with real poor-release consequence. The best-realized movement verb.
- **Protocol-v2 / swept toroidal contact.** Disciplined identity, credentials,
  sequencing, gap detection, rebase; wrap-seam contact is correct. Don't let a
  future refactor erode this.
- **The tokenized UI motion grammar** (`src/ui/motion.js`) — one clean grammar
  that settles correctly under reduced motion. The fault is only the *other*
  (ad-hoc) motion layer; this one is right.

---

*Evidence bundle:* `tests/screenshots/v03-rc-review-20260714/` — focused test-lane
log, isolated agent-eval log, reduced-motion title frames, diagnostic HUD/entity
census, and working findings notes. Custody, method boundaries, and every file:line
above are reproducible from that directory + the cited sources.
