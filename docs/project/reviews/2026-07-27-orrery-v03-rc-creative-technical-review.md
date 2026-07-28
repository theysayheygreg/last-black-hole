# Orrery: v0.3.1 RC Creative And Technical Review

> Bundled milestone review of `a958a8c68b6c9f14054fe012882326dcae32f910`
> (build label `0.3.1.a958a8c6`), range
> `5f75c7d1..a958a8c6`. Read-only. Written 2026-07-27.

## Verdict On The Creative Whole

The systems in this milestone are individually well-built and collectively
disconnected — not by architecture, but by **scale**. Movement, perception, and
threat were each authored against a different ruler, and nothing in the codebase
forces them to agree.

One number makes the case. The camera shows a fixed `3.0` world units, and a
world unit is locked at `1000 m`. So the visible slice is 3,000 m across, and the
nearest screen edge sits 1,425 m from the ship. The largest thing any world
emitter can be heard from is 800 m. The edge-indicator renderer draws **only**
when a contact is off screen.

800 m < 1,425 m. Not by a little — by 44%.

Every world Noise emitter is therefore audible only while it is already
comfortably on screen, and the code that would draw it refuses to draw anything
on screen. The entire audible-contact grammar this milestone was built to
deliver — off-screen bearing arrows, category-then-identity progression, frozen
last-heard state, the 2.5-second fade, the five-contact cap, `EXFIL TONE` as exit
guidance — **renders nothing during normal play**. The only thing that can
briefly appear is the ghost of a contact you have already flown past.

That is not a tuning miss. It means the headline system of the milestone has
never actually been seen, by anyone, in either direction.

The same ruler mismatch runs through the threat layer. Sustained-thrust terminal
velocity is ~2.76 world units/s. The fastest Swarm state moves at 0.15. A
"Noise-oriented hunter" with a full acquisition, tracking, search, and last-heard
state machine is roughly **eighteen times slower than the thing it hunts**. It
cannot chase. It can only be collided with.

And the one piece of navigation that does work — the HUD's `aperture 3.4` rail —
works precisely because it ignores Noise entirely and reads portal positions
straight from the world. Which is the omniscient exit marker the design says was
removed.

So: is this one legible extraction-game language? No. It is a well-made
perception layer, a well-made threat layer, and a well-made movement layer, built
at roughly 1:20 scale to each other, with an omniscient HUD readout quietly
carrying the whole navigation loop. **The good news is that four of the eight
findings below are data-file edits.** The gears are cut correctly. They are just
sized for three different machines.

**I would not run the human RC session on this build.** Greg would spend it
evaluating a Noise system that draws nothing and Swarms that cannot pursue, and
would come away with feel notes about a game that isn't the one on paper. Do the
scale pass first — it is hours, not days — then play.

---

## Findings

### 1. Audible contacts can never fire — `blocker`

The maximum world emitted radius is smaller than the minimum off-screen
distance, so the edge-indicator path is unreachable for every world emitter.

**Evidence**
- `src/coords.js:59` — `export const CAMERA_VIEW = 3.0;` (fixed; no zoom path
  exists — the only `OrthographicCamera` instances are constructed at unit
  extents and driven by this constant).
- `src/content/units.data.json` — `metersPerSimUnit: 1000`.
- `src/main.js:5149` — `if (Math.abs(dx) < maxX && Math.abs(dy) < maxY) return
  null; // on screen`, with `maxX = w/2 - 20`, `maxY = h/2 - 20`.
- `src/content/noise.data.json:23-31` — world radii: glitch `260`, swarm `340`,
  vessel `620`, exfil `800`.

**Arithmetic at 1280x800:** `maxX = 620 px ÷ (1280/3) = 1.453 world = 1,453 m`;
`maxY = 380 px ÷ (800/3) = 1.425 world = 1,425 m`. Every emitter radius is at
most 800 m. No contact can be simultaneously audible and off screen. Player-to-
player contacts fare no better — the loudest player emission is the 700 m decoy
(`src/content/noise.data.json:13`).

The one path that can draw is a contact that goes live on screen (drawing
nothing), then fades: the player must cross from ≤800 m to ≥1,425 m inside the
2.5 s fade, i.e. ≥250 m/s. That is easy at cruise — so the only arrow Greg will
ever see is a receding ghost, never a warning.

**Smallest playable next action:** edit `noise.data.json` world radii to clear
the viewport corner (~2,121 m) — glitch `1400`, swarm `2200`, vessel `3200`,
exfil `4200` as a starting bias — then fly one Shallows run and confirm arrows
appear ahead of contact. Follow with a guard test asserting every world radius
exceeds `CAMERA_VIEW/2 × metersPerSimUnit` so this cannot silently regress.

---

### 2. The omniscient aperture readout is the real navigation system — `Greg decision`

The HUD prints exact distance to the nearest exit portal every frame, gated on
nothing, in raw sim units with no unit suffix.

**Evidence**
- `src/ui/hud-presentation.js:141-154` — `findNearestActivePortal` iterates
  `portalSystem.portals` directly; no audibility, no contact memory.
- `src/ui/hud-presentation.js:163-164` — ``label: `aperture ${nearest.distance
  .toFixed(1)}` ``, ``detail: `${count} active · enter cyan aperture` ``.
- `src/hud.js:322-326` — rendered unconditionally into `#hud-portals`.
- Contradicts `docs/v0.3/noise-radius-v1.md:50-56`: "portals outside their live
  emitted radius have no omniscient marker … there is no stable or privileged
  exit arrow."

The independent exit *arrow* was removed (`inhibitor-ecology-v2.md:105-111`);
the same information survived as text. `aperture 3.4` also reads in sim units on
a HUD where everything else is meters — 3.4 means 3,400 m, next to `NOISE 240m`.

This is a Greg call because it is load-bearing: with finding 1 unfixed, deleting
this rail makes Deep Field (25,000 m wide, 3,000 m viewport, no minimap)
unnavigable. Three honest options — **I recommend the second**:

1. Keep it, and admit in `OPEN-DECISIONS.md` that v0.3 ships an omniscient exit
   compass. Cheapest, but retires the Noise exit-discovery pillar.
2. **Gate it on an audible `EXFIL` contact** — show `aperture 3.4 km` only once
   the tone has been heard, and show `route: listen` before that. Preserves
   discovery, keeps the crutch once earned, one conditional.
3. Delete it and let the exfil tone carry the load. Correct on paper; needs
   finding 1 fixed *and* a real navigation aid (survey compass, ruler) or Deep
   Field becomes a random walk.

**Smallest playable next action:** whichever option, first change
`${nearest.distance.toFixed(1)}` to render kilometres or meters with a unit.
That is a one-line honesty fix independent of the decision.

---

### 3. Inhibitors move 6–40x slower than the player — `blocker`

The Swarm acquisition/tracking/search machinery describes a pursuit that cannot
physically happen.

**Evidence**
- `src/content/movement.data.json` — `thrustAccel: 2.5`,
  `coastHalfLifeSeconds: 0.764`, `maxSpeedWorld: 8.0`. Drag is exponential
  (`src/content/tuning.js:91-95`), so sustained-thrust terminal velocity is
  `a / (ln2 / halfLife) = 2.5 / 0.907 ≈ 2.76` world/s. The slingshot clamp is
  `8.0` world/s.
- `scripts/sim/inhibitor-ecology.cjs:29-32` — Swarm `speedSilent 0.02`,
  `speedLight 0.05`, `speedHeavy 0.10`, `speedFlare 0.15`.
- `scripts/sim/inhibitor-ecology.cjs:59` — Vessel `speed: 0.07`.
- Corroboration: `src/content/map-scales.data.json` deep-field
  `productObservedLegSeconds: [2.13, 20.67]` against a route leg bounded at
  `0.7 × 25 = 17.5` world units implies a route-average near `0.85` world/s even
  including acceleration and Heat-limited coasting.

At terminal thrust the player is **18x** a flaring Swarm and **39x** a Vessel; at
route-average cruise, still ~6x and ~12x. `trackingIntervalSeconds: 3`,
`searchTimeoutSeconds: 5`, and `searchRadiusRate: 0.025` are all timings for a
chase that resolves before the first tracking update.

**Smallest playable next action:** raise Swarm speeds to bracket player cruise —
`speedSilent 0.25`, `speedLight 0.6`, `speedHeavy 1.1`, `speedFlare 1.6` — and
Vessel to `0.5`. Fly one Expanse run at Phase 2 and check whether a Swarm ever
closes to contact from a heard state. Tune down from "too fast," not up from
"cannot move."

---

### 4. The RC has no passing product-loop evidence, and RC-GATE reads as if it does — `blocker`

**Evidence**
- `/private/tmp/lbh-v03-rc-a958a8c6/tests/screenshots/agent-play-eval-2026-07-27T235331801Z/report.json`
  — `"verdict": "fail"`, `"screenshots": []`,
  `"failure": "waitForFunction timed out"`. Its `summary.md` reads "Route: not
  reached", "Salvage: not reached", "Extraction: not reached", "Second run: not
  reached", "protocol unavailable".
- `summary-lines.txt` — all sixteen `[three]` browser suites failed: `Smoke`,
  `Coordinates`, `FluidWindow`, `Inventory`, `Systems`, `RunResults`, `Flow`,
  `MetaFlow`, `Controller`, `KeyboardMouse`, `InfraSmoke`, `TelemetrySmoke`,
  `RemoteAuthority`, `AgentPlayEval`, `Renderer`, `UIVisual`, plus `RulerLive`
  and `SlingshotV2Live`.
- `docs/v0.3/RC-GATE.md:72-74`, inside **Current Verdict** with no historical
  marker: "The full run recorded 611.61 s summed suite time … AgentPlay passed
  2/2 in 117.41 s; Flow 7/7, MetaFlow 8/8, RemoteAuthority 18/18, Renderer 5/5,
  and UIVisual 18/18 passed in that same run." The current run is stated at
  `439.31 s` summed (`RC-GATE.md:11`), so "that same run" is a different lane.
  Every suite named in that sentence failed in the run this RC is certified on.

The packet's root-cause read is defensible: `three` is absent from
`node_modules` in both the RC worktree and this review worktree, `VFX` and
`ThreeEntityLifecycle` die on `ERR_MODULE_NOT_FOUND` for
`three/build/three.module.js`, and `Smoke` passes "Page loads without crash",
"WebGL context created", and "No JavaScript errors" while failing only "CONFIG
object exists" and "Render loop advances". No isolated product boot failure is
established. But the consequence stands: **this source has zero end-to-end
product evidence**, and the gate document currently reads as though it has a
clean natural journey.

**Smallest playable next action:** `npm ci` in a worktree that actually resolves
`three`, re-run `npm run test:full -- --no-retries`, and move `RC-GATE.md:72-74`
under a "Historical" heading with its own hash. One paragraph move prevents a
false green read.

---

### 5. Several reds are current-source product failures, not stale or environmental — `fix-forward`

The packet's four categories (retired pre-Noise/portal-block expectations,
missing worktree deps, browser bootstrap cascades, host-timing cadence)
undercount. These are none of the four:

**Evidence**
- `HudDeck` — `AssertionError` at `tests/hud-deck.cjs:113`, expected `'active'`
  got `'critical'`. That is the route-objective tone on the 1280x800 Deck rail,
  a pure-Node suite. `RC-GATE.md:248` still carries `[x] 1280x800 HUD rails do
  not overlap in the focused Deck layout test`.
- `RendererAuthority` — `FAIL: local fallback keeps existing current and defers
  seeded GPU authority … Remote authority must suppress client-authored
  well/star velocity while local presentation remains`. The client is authoring
  flow while remote authority is live. That is the architecture gate's own
  "renderer/UI/VFX/audio do not author outcomes" line failing, and it is a
  multiplayer seam.
- `BallparkQueries` — `Expected one available portal, got
  portal:blocked,portal:open`. `portal:blocked` still exists as a lifecycle
  state in the spatial authority, though `inhibitor-ecology-v2.md:107` says
  portal-block fields were removed.
- `ConfigRedFlags` — `FAIL: ESM CJS and dev panel consume canonical tuning
  metadata … authority signal must consume the canonical tuning module`. A live
  pre-Noise "signal" tuning path in the authority; Signal is supposed to be
  historical (`noise-radius-v1.md:78-82`).
- `Inhibitor` — of five failures, two describe current contracts, not retired
  ones: `Shroud decoy attracts Swarm while Vessel pursues the real player` and
  `Vessel kill publishes the Inhibitor death cause`. Both are claimed shipped in
  `inhibitor-ecology-v2.md:80-103`. Both timed out or failed.
- `AuthorityCadence` — `deep-field: idle-host receipt silently lost 2
  deadlines`. `RC-GATE.md:201` requires zero skipped deadlines. It was measured
  on an *idle* host, which weakens "host timing" as the explanation; Deep Field
  is also the heaviest entity load.

**Smallest playable next action:** triage all 33 reds into `stale` / `env` /
`real` in a checked-in table before the next gate run, and fix `HudDeck` first —
it is a five-minute read and it is the Deck readability contract.

---

### 6. World Noise has no cadence; `cadenceSeconds` is dead data — `fix-forward`

The design says world emitters use "restrained" cadence. Nothing implements it.

**Evidence**
- `src/content/noise.data.json:26-30` — `cadenceSeconds` 1.5 / 1.2 / 1.0 / 1.0.
- `scripts/sim/public-snapshot.cjs:186,201` — copied into the wire shape.
- `src/sim/remote-snapshot-presentation.js:157` — copied again on receipt.
- `tests/inhibitor-ecology.cjs:370` — asserts `cadenceSeconds > 0`.
- No other reference exists in `src/`, `scripts/`, or `tests/`. Nothing times an
  emission from it.

World emitters are therefore constant-radius auras, not heard events. That is
the difference between "Noise Is Consequence" and a proximity detector, and it
compounds finding 1: once radii are large enough to draw, a constant aura will
pin an arrow on screen permanently instead of pulsing.

**Smallest playable next action:** pulse the emitted radius in `projectWorld`
using `cadenceSeconds` and the existing `resolveImpulseRadius` decay
(`scripts/sim/noise-radius.cjs:24-30`) so a Glitch breathes 260→0→260. If that
is not wanted, delete the field — do not ship a knob that moves nothing.

---

### 7. Every Inhibitor contact is drawn in extraction cyan — `fix-forward`

**Evidence**
- `src/main.js:5175` — `drawEdgeArrow(sx, sy, \`rgba(100, 220, 220, …)\`, 7)`,
  one hard-coded cyan for all contacts.
- `src/main.js:5180` — label fill `rgba(160, 235, 235, …)`, same.
- `docs/v0.3/OPEN-DECISIONS.md:66-70` (locked): "Cyan means route/extraction.
  Magenta means Inhibitor, corruption, or anomaly. Do not share those roles for
  convenience."

`GLITCH`, `SWARM`, and `VESSEL` arrows are painted in the exit colour. The
contact record already carries `identity` and `category`, so the information
needed to colour correctly is in hand at the call site. This is invisible today
because of finding 1, and becomes the most misleading pixel on screen the moment
finding 1 is fixed — fix them together.

**Smallest playable next action:** map `contact.identity || contact.category`
through the existing `UI_COLORS` inhibitor/portal families; cyan only for
`EXFIL` / `EXFIL TONE`.

---

### 8. Audibility is decided by the client, from a full-position broadcast — `fix-forward`

**Evidence**
- `scripts/sim/public-snapshot.cjs:176-206` — `projectWorld` emits `wx`/`wy` for
  every non-expired Inhibitor entity and every live portal to every client,
  ungated by hearing.
- `src/main.js:2396-2432` — the client walks that list and decides what is
  audible, identified, and remembered.
- `src/main.js:2405-2428` — a second, near-duplicate resolution path for the
  local (non-remote) case, keyed `world:inhibitor:${id}` where the remote path
  keys `world:${id}`. Two implementations of one rule.
- Contradicts `RC-GATE.md:226` — "Gameplay remains sim-owned; renderer/UI/VFX/
  audio do not author outcomes."

This is the seam that breaks first under multiplayer reuse: hearing is a
per-player fact, so it belongs in the per-player projection, not in a shared
broadcast plus client-side filtering. It also guarantees the two paths drift —
they already differ in key scheme.

**Smallest playable next action:** move `projectAudibleContact` /
`prioritizeAudibleContacts` behind the authority and ship a resolved
`player.noise.contacts[]` in the per-player projection. Delete the local branch
in `main.js` and let solo run through the same path. Prove it with one test
asserting the snapshot contains no unheard Inhibitor position.

---

## Recommendation: Sequence And Verticals

### Before Greg plays — the scale pass (hours, mostly data)

Findings 1, 3, 6, and 7 are three data files and one colour lookup. Ship them as
one change, rebuild, and *then* run the human RC session. Playing the current
build means evaluating a milestone whose headline system is invisible and whose
hunters cannot hunt — Greg's feel notes would be about a different game than the
one the docs describe. This is the single highest-leverage half-day in the
project right now.

Add the guard test in the same pass: world Noise radii must exceed the viewport
corner. That constant is what silently drifted, and only a test will hold it.

### Then, the two v0.3 verticals

**Vertical A — one authority-owned hearing model.** Finding 8 plus finding 2.
Move audibility, identification, and contact prioritisation into the sim; ship a
per-player contact list; delete the duplicate client path; and land Greg's
navigation decision (my recommendation: gate `aperture` on a heard `EXFIL`
contact). This is the vertical that turns Noise from a presentation effect into
a gameplay fact, and it is the one that survives into multiplayer unchanged.

**Vertical B — Swarm pursuit that reads.** Once speeds bracket the player,
`HEARD` → `TRACKING` → `INVESTIGATING` has to be legible from the cockpit at
2,000 m/s: commit to an acquisition tell, a visible last-heard marker at the
searched position, and a decoy that demonstrably peels a Swarm off. Tune it
against whatever Greg's post-scale-pass session says about cruise speed, not
against the spec.

I would deliberately **not** open a third vertical. The ecology has three kinds,
overdriven wells, and an exfil tone that have never been observed working
together. Watching those land is the work.

### Wait for v0.4

- Combat, destructible Inhibitors, and Heat-as-weapon interactions.
- Multiplayer transport, prediction, rollback, matchmaking.
- ECS migration — nothing measured here justifies it.
- Per-receiver hearing stats, sensitivity, or hearing equipment (v1 correctly
  refuses these; keep refusing).
- Reinstating portal-block in any form — finish removing it first.
- Native/console renderer beyond Three/Electron.
- Route content beyond Shallows / Expanse / Deep Field.
- Steam Deck acceptance is not v0.4 work, but it is also not reviewable until a
  build with visible contacts is deployed. Re-deploy after the scale pass.

---

## Machine Evidence

What the receipts actually say, separated from what they were summarised as.

- **Full lane, `a958a8c6`, no retries:** red. 86 passed / 33 failed / 119
  suites, 300.10 s wall, 439.31 s summed, zero retries. Log
  `/private/tmp/lbh-v03-rc-a958a8c6-full-20260727T235200Z/test-full.log`
  (SHA-256 `6ff1aaeb…ceed2718` per the packet — not independently recomputed).
- **Root cause of the browser block is credible:**
  `/private/tmp/lbh-v03-rc-a958a8c6/node_modules/three` does not exist. `VFX`
  and `ThreeEntityLifecycle` fail with `ERR_MODULE_NOT_FOUND` on
  `three/build/three.module.js`. `Smoke [three]` passes page load, WebGL context
  creation, and "No JavaScript errors" while failing only `CONFIG object exists`
  and `Render loop advances`; `Physics [three]` reports
  `SKIP: window.__TEST_API not found`. Consistent with a missing dependency, not
  a product boot fatal. The packet's "no isolated product boot failure was
  established" is fair.
- **But the reds are not all stale or environmental.** `HudDeck`,
  `RendererAuthority`, `BallparkQueries`, `ConfigRedFlags`, and at least two of
  five `Inhibitor` failures assert current contracts and run outside the browser.
  See finding 5 for the exact assertion text.
- **AgentPlayEval produced no journey.** `verdict: fail`, `screenshots: []`,
  `waitForFunction timed out`. There is no in-match HUD, portal confirmation,
  results, rig, Chronicle, second-run, named-death, or recovery frame for this
  source. `RC-GATE.md:259-260` still carries those as `[x]`.
- **`RC-GATE.md:72-74` mixes lanes.** Its 611.61 s / 34-browser-launch /
  "AgentPlay passed 2/2" paragraph belongs to an earlier run than the 439.31 s
  one this RC is certified on, and sits unmarked inside **Current Verdict**.
- **Cadence:** `AuthorityCadence` failed with `deep-field: idle-host receipt
  silently lost 2 deadlines` against a documented zero-skip requirement. Idle
  host weakens the host-noise explanation.
- **Package and boot closure are real.** `release:internal --skip-tests`,
  `release:status`, and `test:package` green for all five targets; `app.asar`
  `42a6959d…f0b35374` shared across macOS/Windows/Linux; playtest ZIP
  441,826,786 bytes / `3f001bc1…b4cac9b31`. This proves artifact and packaged-
  runtime closure and nothing about play.
- **Not established by me:** I did not run the build, deploy to Deck, recompute
  any SHA-256, or view a rendered frame at this source — the AgentPlay screenshot
  directory contains only `report.json` and `summary.md`. Every visual and
  readability claim in this memo is derived from source constants and CSS, not
  from observation. **All findings about what the screen looks like should be
  confirmed against one real frame before being treated as settled.**

---

## Taste

**On the mismatch itself.** This is the most instructive failure I have seen in
this project, because nothing is broken. Every module is competent. The Noise
envelope is a genuinely elegant piece of design — one decaying radius, no
receiver stats, honest meters. The ecology is clean. The movement integrator is
principled. They were simply authored in separate sessions against separate
mental rulers, and the codebase has no place where those rulers meet. `CAMERA_VIEW`
lives in `coords.js` as a rendering constant; the emitter radii live in
`noise.data.json` as gameplay data; the entity speeds live in
`inhibitor-ecology.cjs` as behaviour. Nothing imports the others. The fix is not
just new numbers — it is making one of them derive from another so the drift
becomes impossible.

**On what Greg will feel first.** Assuming the scale pass lands: thrust cadence
should read well. Full-throttle to overheat is ~8.3 s, lockout is 3 s, and post-
lockout reset is 0.25 — that is a legible rhythm you can learn in two runs. The
`HEAT 42%` bar under the ship (`src/main.js:3650-3676`) is the right instrument
in the right place. But the "conditional" promise in the design — hidden at
cooled baseline — will almost never be felt: cooling from a mid-route 53% takes
~3.4 s of no thrust, and route play never gives you that. Expect it to read as
"always on." That is fine; just stop calling it conditional.

**On the noise rail.** `SOURCE THRUST AGAINST FLOW · HEARD BY 0 · TRACKED BY 0 ·
LOCKED ON 0` at 13 px in a 270 px column is the longest string on the HUD and it
reads zero-zero-zero for most of a run. Three counters earning their pixels only
in the last two minutes. Collapse to one line that appears when a count is
non-zero. The `NOISE 240m · RISING` readout above it is genuinely good — it is
one number, in the right unit, that changes when you act. Protect that one.

**On the results screen.** `noise max 480m · SALVAGE` and `ecology PHASE 3 ·
GLITCH 6 / SWARM 4 / VESSEL 3` are the right two rows. But
`noiseTimeHeardSeconds` and `noiseTimeTrackedSeconds` are computed
(`scripts/sim-runtime.cjs:4268-4269`), written to the run record
(`scripts/control-plane-store.cjs:229-233`), and never shown
(`src/run-results.js:237-239`). "Your loudest moment was 480 m" teaches nothing
without "and you were tracked for 41 s." The lesson is in the second number and
it is already in the database. Put it on the screen — that is the cheapest
teaching in the whole build.

**On the coyote knob.** `coyoteTime` presents as a 0–500 ms tunable with value
50, but both authority call sites use `effectiveCoyoteTimeMs`, which adds a fixed
`4 / 15 Hz ≈ 267 ms` transport allowance. The real window is 317 ms, and moving
the knob 50→100 moves it 317→367. The knob is honest about its intent and
dishonest about its range. Either fold the allowance into the declared value or
declare the allowance.

**On dread.** The corruption language is working — the magenta/fabric identity,
the announced arrivals, the zalgo text corruption scaled by live entity
intensity. That is real atmosphere and it is not what needs attention. But
`#hud-ecology` runs a 2.4 s `inhibitorPulse` opacity animation while `hud.js`
simultaneously applies a per-frame `transform` jitter and a `hue-rotate` +
`saturate` filter to the entire `#hud` element. Two uncorrelated motions on the
same pixels, and a full-overlay CSS filter recomputed every frame is the kind of
cost that shows up on a Deck and nowhere else. Pick one dread motion. Dread is
better when it is *slower* than the player expects, not busier.

**On what is genuinely well-built.** The five-knob slingshot contract is the best
piece of design work in the repo — a real payoff curve, an honest chain window,
and an explicit `INTERNAL` block that refuses to become a sixth knob. The unit
lock is right. The contact-priority table putting `EXFIL` above everything is
right. `resolveHeatInstrumentState` returning a frozen four-field object is
exactly the right size. When the scale pass lands, most of this milestone is
going to work.
