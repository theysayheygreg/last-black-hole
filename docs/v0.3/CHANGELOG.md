# v0.3 Changelog

- **Selected route restart:** remote restarts now carry the Map Select route
  and preview seed through the normal authority launch handoff instead of
  reusing the previous session's map id. The focused lifecycle browser journey
  proves return-home selection and direct restart agree with authority map
  truth.

- **Dev telemetry shutdown crash:** the live dev panel now renders an
  unavailable placeholder when an authority metric is null or non-finite
  during disconnect/shutdown. Valid integer, fractional, scientific, and
  decimal formatting is unchanged; losing telemetry no longer throws through
  the main UI loop.

- **Local run lifecycle recovery:** local player launch now pins the authority
  process for the Electron/local-host session, matching packaged-app behavior.
  If a prior local session left an otherwise healthy but unpinned sim on the
  managed local port, local-host replaces only that sim before it opens the
  client. A persistent sim is reused.
  A player can read a terminal result, return Home, and start a fresh map
  without the only local sim retiring underneath the client. The focused
  browser smoke drives death -> Home -> normal map-select second launch and
  verifies one fresh running authority session; disposable test/sandbox sims
  keep their existing idle shutdown behavior.

## UI recovery — 2026-08-04

- Anchored the map destination footer, Home crew footer, and profile footer to
  measured Deck-safe rails so wrapped controller/keyboard affordances remain
  inside their panels at 1280x800 and 960x720.
- Made map scale/risk pills share the briefing width instead of allowing the
  risk pill to extend beyond the right panel.
- Made terminal result overlays deliberately obscure the active HUD and reserve
  the CTA rail from summary/cargo/notable content.

## Rendered UI containment repair — 2026-08-04

- Ship hull controls reserve their measured prompt rail before rig and loadout
  rows. Launch reserves its support glyph before operation facts and keeps the
  route CTA inside its terminal rail.
- Map briefing scale/risk pills use their center-anchored bounds, reserve
  title/body/contact/authority bands, and wrap supporting copy by measured
  word boundaries on short surfaces.
- Results reserve the `RETURN HOME` support glyph inside the terminal frame.
  Focused checks cover map briefing bounds at 1048x576, 960x720, and 1280x800;
  `tests/ui-rendered-repair-capture.cjs` captures the affected live-canvas
  surfaces.

- **Well landmark and terrain-stability recovery:** gameplay restores a
  restrained, presentation-only blackbody corona around each existing compact
  analytic well body. The void and immediate rim remain the authoritative
  danger read, while the larger corona makes a well visible as an angry
  landmark several ship lengths before contact; title keeps its authored
  composition. Ordinary fabric corridors now filter the accepted coarse field
  at each world position rather than at the moving camera center, so camera
  translation reveals stable terrain and only downstream material marks move.
  No gameplay coordinates, authority field, gravity/current/hit radii, or
  movement constants changed.

- **Well material correction:** gameplay wells now keep that larger dark void
  but use a lower-intensity red/orange danger corona instead of the title
  screen's white-hot blackbody peak. The title retains its authored spectrum;
  ordinary play concentrates energy at the rim and fades into dark violet so
  the well reads as a hostile cause, not a bright field diagram.

- **Rich ordinary-current corridors (Area 1):** `5f9c0e4b` changes only
  `FRAG_DISPLAY` presentation. Existing accepted coarse authority flow is
  spatially filtered before it orients aspect-correct current corridors; a
  bounded visual backtrace supplies local curvature without contributing to
  movement. At 1280x800, the 200px corridor body is 4.55 default-hull widths
  (4.17 Breacher widths), with 50% broad-body coverage and deliberately dark
  rest between lanes. Broad cyan material, medium filaments, and clipped fine
  ASCII weave replace the earlier sparse mark-only read; density history is
  limited to current or source-wave material. No simulation, authority,
  movement values, camera, HUD, or entity behavior changed. The focused
  capture and proof receipt is `reviews/completions/2026-08-03-rich-current-area1.md`.

- **Navigable fabric channels:** each sparse authored current now owns a faint
  screen-stable channel envelope about 4–5 visible ship widths across at
  gameplay zoom. Broken cyan strokes remain the directional texture inside
  that usable space rather than a pencil-thin proxy for it. Default spacing
  produces roughly one or two active corridors across the gameplay view, with
  genuinely calm negative space between them. Current strength
  changes emphasis and mark motion without adding lanes; the full envelope
  renders as a coherent body with soft shoulders through ASCII quantization,
  then bends and splits through the existing well deformation. Calm substrate
  outside active channels is nearly black. Gameplay forces,
  authority truth, camera behavior, and lane count are unchanged. Wells use a
  larger presentation-only minimum silhouette at Deck scale so their compact
  body/rim visibly causes the channel bend; mechanical core and force radii do
  not change.

- **Compact well material:** retired the twelve-point initial well-density seed
  and four-per-tick remote density anchors that accumulated into rectangular
  white patches. Snapshot wells now rely on the existing analytic body, a
  compact body-relative accretion rim, and authored lane deformation. This is
  presentation-only; mechanical accretion/current/gravity radii and authority
  behavior are unchanged.

- **Fabric readability follow-through:** ordinary current marks now occupy less
  than half their prior lane area, travel as longer coherent cyan strokes, and
  sit over a darker calm substrate. Authored current, falloff, and full-gravity
  reaches produce a much broader bend/compression/split around wells, while a
  presentation-only minimum keeps the lethal body and compact accretion rim
  visible at 1280x800. The immediate lethal neighborhood also suppresses
  anonymous excitation while curved lanes receive a local gravity-envelope
  lift. Gameplay radii, authority forces, Noise, and event waves are unchanged.

- **Fabric display correction:** `FRAG_DISPLAY` now shares one 64-well product
  budget with the renderer upload path. Conservative WebGL2 accounting drops
  the display program from at least 1,149 to 381 fragment-uniform vectors,
  below the minimum 1,024-vector contract; overflow retains the nearest visible
  wells deterministically. Local-flow lanes now leave substantially more dark
  rest, use sparse cyan/blue-white strokes, and communicate stronger current
  through longer/faster downstream marks rather than green density. Authority
  physics, field caps, Noise, event waves, entities, and HUD are unchanged.

- **Hazard-priority playtest build:** exact source `c467916b` makes active
  AgentPlay hazard clearance/braking override recharge coast until the ship is
  outside dynamic clearance plus stopping margin. The retained tick-1388
  portal state is now a pure regression. `0.3.1.c467916b` built web, iPad,
  macOS, Windows, and Linux via `release:internal -- --skip-tests`; matching
  `release:status` and `test:package` passed. Its playtest archive SHA-256 is
  `ab74b953c78d07cf376ae16eba4158782225520c44c01a2c11add2072b9f09d5`.
  This is not RC-green: the preceding full gate was 120/124, AgentPlay was
  red before this harness-only priority fix, and it was intentionally not
  rerun afterward.

- **Fabric candidate RC receipt:** exact source `00cca067` completed one
  accepted no-retry full lane with 124 selected suites: 96 passed and 28
  failed in 280.73 seconds wall time, with zero suite retries. Twenty-three
  failures were missing-dependency/browser-bootstrap infrastructure, four were
  stale direct contracts, and the remaining AuthorityCadence sample measured
  14.77/15 Hz despite a passing 14.96/15 Hz AuthorityBudget sample. AgentPlay,
  Renderer, UIVisual, and package evidence were invalidated by missing `three`
  and `@electron/packager`; no build or playtest archive was produced. The
  next release checkpoint must provision normally, correct the stale fixtures,
  and re-evaluate cadence before packaging.

- **Fabric readability V6 cleanup:** removed the inert collapse-epoch
  `liveWavePushMultiplier`, zeroed coarse `wave`/surf-shadow channels, and
  retired gravity-contour renderer vocabulary. The live source-bound wave
  presentation and universal Noise contract remain unchanged. The earlier V2
  bounded Shallows capture did not produce an image; its bootstrap log is not
  retained in this worktree, so no V2 visual acceptance is claimed. The one
  final 1280x800 live capture attempt also stopped at HTML bootstrap after 12s
  with `window.__TEST_API` unavailable and no browser errors; it was not
  retried. V6 keeps Greg's final visual/readability gate open.

- **Localized well-gravity design lock:** separated radial-gravity reach from
  strength. Wells will own a full-strength radius, falloff-end radius, minimum
  edge fraction, and eased falloff with zero pull outside the localized
  envelope. Initial growth expands reach only; authored large wells and
  large-map variants may later opt into stronger gravity explicitly. This
  records design direction only and changes no runtime behavior.

- **Wider rotational-eddy design lock:** well rotational current will extend
  beyond localized radial gravity, initially using a `1.5x` reach multiplier
  derived from the gravity falloff end. Growth expands the shared reach basis
  without increasing strength. Persistent eddies and discrete emitted
  wavefronts remain separate gameplay truths. No runtime behavior changed.

- **Broad standard-eddy profile:** standard wells will ramp rotational current
  outside the lethal core, hold a broad full-strength plateau across the
  gravity-falloff region, and ease to zero at the wider current reach. The
  profile reuses existing radii; narrow precision bands remain future unusual
  well identities. No runtime behavior changed.

- **Source-bound wave design lock:** well waves become one visible front and
  one outward delta-v impulse per player crossing rather than a per-tick
  acceleration band. Every front must identify and telegraph its source and
  cause; match-relative Conductor surges, visible mass consumption, and Vessel
  overdrive are the initial causes. Anonymous periodic pulses are retired as
  design direction. Conducted fronts are staggered one source at a time with a
  quiet readability interval, never emitted by every well simultaneously. The
  initial four-phase match-relative cadence is locked at 0 / 1 / 2 / 3 waves,
  distributed inside each phase and independent of well count. No runtime
  behavior changed.

- **Wave impulse and fabric grammar lock:** a standard wave crossing now has a
  design baseline of one radial-outward delta-v equal to 25% of hull calm-space
  reference speed, added without normalization or lingering acceleration. The
  player-facing fabric is constrained to three dominant layers: broad local
  flow, persistent well distortion, and brief source-bound event waves. Other
  contributions must support those layers, become quiet ambience, or defer. No
  runtime behavior changed.

- **Broad-flow presentation candidate:** grounded the first fabric layer in the
  current display shader and proposed sparse world-anchored flow lanes driven
  by accepted authority current truth. Downstream motion communicates
  direction; mark length and travel speed communicate strength without adding
  density. Random hash noise, whole-frame speed brightening, and the generic
  well surf band are removal candidates. No runtime behavior changed.

- **Flow-lane concept sheet:** generated and checked in three comparative
  broad-flow treatments. Panel A is the readability baseline, Panel C provides
  well-bending topology, and Panel B marks the maximum acceptable tactile
  density rather than the default. No runtime behavior changed.

- **Broad-flow art direction lock:** Greg approved Concept A's sparse visual
  rest plus Concept C's well-bending topology, with only restrained tactile
  grain borrowed from Concept B inside the lanes. This composite is now the
  implementation target for local-flow presentation. No runtime behavior
  changed.

- **Well-distortion presentation candidate:** proposed making persistent wells
  deform the approved flow lanes rather than adding another overlay. Lanes bend
  broadly with orbital direction, compress inward through gravity falloff, and
  split around the lethal core; the visible well owns causality and immediate
  danger. Generic halos, surf bands, and gravity contours become removal
  targets. No runtime behavior changed.

- **Well-distortion concept sheet:** generated and checked in orbital,
  convergence, and combined treatments. Panel A proves broad rotation; Panel B
  is recorded as a scientific-diagram anti-target; Panel C is the preferred
  combined topology after reducing its line count and near-core density. No
  runtime behavior changed.

- **Well-distortion art direction lock:** Greg approved Concept A's restrained
  rotational bend plus Concept C's split/rejoin topology, with fewer lanes and
  much less near-core detail. Concept B's uniform radial field-line treatment
  is explicitly rejected as too scientific and visually dense. No runtime
  behavior changed.

- **Event-wave concept sheet:** generated detached-ring, material-swell, and
  hybrid-crest treatments. Panel A is the generic sonar-ring anti-target;
  Panel B supplies the fabric-native swell; Panel C supplies a thinner sparse
  leading crest while its bright intersection nodes are rejected. The source
  remains visibly charged as the single front departs. No runtime behavior
  changed.

- **Event-wave art direction lock:** Greg approved Panel B's fabric-native
  material swell plus a thinner, sparser Panel C leading crest. Detached sonar
  rings and bright lane-intersection nodes are rejected. The well telegraphs,
  emits one front, fades, and leaves calm fabric behind it. No runtime behavior
  changed.

- **Honest FREE environment channels:** renamed the authority movement and
  diagnostic boundaries to `currentCoupling`, `wellGravity`, `solarWind`,
  `bodyPush`, and `wave`. Planetoid proximity push no longer hides inside a
  generic gravity row. The accepted current -> well -> star -> planetoid ->
  wave order, force values, fixed timestep, field sampling, contacts, and
  renderer behavior are unchanged.

- **Title/local authority separation:** the live title backdrop now advances
  through a presentation-only owner in the existing frame loop. Its fluid,
  well, star, wreck, portal, planetoid, combat-decay, growth-wave, and attract
  ordering is unchanged, but it no longer enters the legacy local gameplay
  step. The remaining `LocalSandboxSimCore` is named explicitly for Bench,
  local fallback, renderer fixtures, and remote visual hydration; product
  gameplay truth remains in the authority runtime.

- **Remote well and growth-wave presentation:** the client now preserves each
  well's authoritative orbital direction and each growth wave's source well.
  The fabric shader uses effective overdrive mass for well intensity, while
  the existing pooled Three semantic layer renders exactly one named,
  source-bound front for a live authoritative well-growth wave. This changes
  no authority force, wave, map, movement, or grapple tuning.

- **Star solar-wind parity:** centralized shared star gameplay tuning in
  `src/content/stars.data.json`. Authority now honors the existing visual
  subtype promise: red giant 0.6x, yellow dwarf 1x, white dwarf 2x, and neutron
  star 3x outward acceleration. The force ledger attributes this continuous
  force to `solarWind` instead of gravity while preserving the accepted FREE
  application order and all well, planetoid, wave, map, and visual behavior.

- **Fast small-contact cleanup:** post-movement authority sweeps now preserve
  existing planetoid push, lunge-sentry bump, fauna consumption, and Swarm
  hull-damage consequences when a fast ship crosses their small contact radius
  between 15 Hz endpoints. Endpoint and swept hits share the same consequence
  owners; radii, damage, impulse, cooldown, movement tuning, and authority
  cadence are unchanged. Portal extraction deliberately remains residence plus
  explicit confirmation: crossing the full cyan aperture between endpoints is
  still not an extraction.

- **Movement, physics, and fabric design review:** diagnosed the centralized
  movement stack as still too complex at player level and the fabric as pretty
  but illegible route terrain. Follow-up design correction keeps fabric
  influence continuous throughout FREE flight—no SURF state or alternate
  physics. Greg locked a moving-reference-frame model: the ship owns velocity
  relative to local space, fabric contributes a current vector capped at 20%
  of hull calm-space reference speed, and world velocity is their sum. Stars, solar
  wind, wells, moving masses, direct hazards, stations, and future
  megastructures are now cataloged by gameplay ownership before the shader
  language is selected. Only seeded sea, wells, and event rings currently own
  shared fabric motion. Graphic Cosmic Swell, isotropic projection, a closer
  restrained Deck camera, and a Shallows-only comparison remain prototype
  directions. No runtime behavior changed.

- **Grapple Arc v3:** replaced the layered Slingshot v2 orbital-energy model
  with a forgiving arcade grapple. Anchor scale now owns hook/swing radii and
  flat boost; swept capture catches fast fly-bys; a 150 ms reel enters one
  exclusive held arc; release is tangent with a bounded outward assist; brake
  aborts without bonus. Held input retries capture until the player enters
  range and always releases on button-up; quick-tap edges cannot latch. The
  reel preserves the entry line before blending to tangent, and collision
  truth cannot knock a held arc off its line. Energy banking, arc payoff,
  mechanical chains,
  tangential gate, coyote transport, gravity cancellation, range-break clamps,
  and the divergent local simulator are retired. Current design truth is
  `GRAPPLE-ARC-v3.md`; constants are centralized in
  `src/content/grapple-arc.data.json`.

## 2026-08-01

- **Movement and fabric simplification:** retained the player-facing
  `TERMINAL / GRAPPLED / FREE` vocabulary and Grapple Arc v3 while giving FREE
  one authority field sample and one ordered movement owner at the fixed 15 Hz
  rate. `src/content/fabric.data.json` now owns seeded sea, well current, and
  event-wave tuning for browser and authority. Disabled unauthoritative
  planetoid wake code, duplicate local planetoid advancement, and split
  authority gravity/star/planetoid/wave velocity mutators are removed. Named
  Drifter Flow Lock and Glitch/Vessel fabric pulls now enter FREE as continuous
  ability/Inhibitor ledger inputs instead of mutating velocity elsewhere.
  Entity collisions, pulse, Eddy Brake, and damage contacts remain discrete
  impulses rather than gaining a new event wrapper. This changes no movement
  tuning, maps, Heat, Noise, collision, extraction, schedule, or Grapple Arc
  behavior. Movement feel and the fabric/camera/viewport hierarchy remain Greg
  playtest gates.

- **Movement continuity correction:** fixed the post-RC held-slingshot range
  guard introduced in `8f98f948`. Its player-to-anchor radial vector was used
  as if it pointed outward, so an out-of-range held orbit could snap through
  the anchor, retain its actual outward velocity, and repeat. The guard now
  returns the ship to the same capture-boundary side and removes only outward
  velocity. Button-up release now preserves the established orbital tangent
  instead of accepting a concurrent stick vector that could reverse the exit
  into a well. Local reconciliation blends lock, arc, and release-ghost
  snapshots rather than hard-snapping on those presentation phases. The
  canonical 15 Hz rate, movement coefficients, Heat contract, map scales, and
  portal residence policy are unchanged. Focused authority proof covers the
  held-range discontinuity, tangent release, fifteen post-release alive/bounded
  ticks, edge transport, portal extraction, and reconciliation blending.

## 2026-07-28

- **CANCEL-first RC contract correction:** updated MetaFlow to read the
  authoritative Pilot Delete modal state and require the safe initial
  `choice: cancel` rather than demanding destructive `delete` copy before the
  player deliberately changes the choice. Focused MetaFlow is green; no
  production UI, input, profile, or deletion behavior changed.

- **Version scope and v0.3.2 design packets:** moved the authored-soundscape
  vertical from v0.3.2 into active v0.3.1 scope without invalidating the
  current contact-audio RC as an intermediate playtest build. Split the later
  Fabric/Surfing and Camera/Viewport questions into separate E3 Orrery prompts;
  both require annotated visual concepts grounded in current playable
  functionality, or an explicit smallest-enabling seam when current truth is
  too narrow.

- **Audible-contact RC, package, and Deck candidate:** reviewed and integrated
  the authoritative audible-contact sound bridge while preserving Pilot Delete
  and session-local `M` master mute. Exact product source `29997fb7` passed
  120/121 selected full-lane suites with zero retries; the sole red is a stale
  MetaFlow expectation that contradicts the intentional `CANCEL`-first Pilot
  Delete confirmation, while direct Pilot Delete/mute, UI, AgentPlay,
  extraction, audio lifecycle, and package closure are green. All five targets
  built as `0.3.1.29997fb7`. The playtest ZIP SHA-256 is
  `11e3b8b6cdf56dec983fef1d28fd92932c63997c43a7c645f32914211aadf892`;
  Linux executable and `app.asar` hashes are
  `b0d127772d2983a93771055a93b673d5fdd1726d6e47db8e269b204e665972d6`
  and
  `a405dd15dd5b0df23da190527664fd48b0b20d1a1167500f782da4ba014ecd57`.
  The matching Linux build is deployed to the existing v0.3 Deck install and
  v0.2 remains preserved. Later branch history is docs-only; promotion to
  `main` remains a separate pinned operation.

- **Pilot Select and audio usability:** highlighted saved pilots can be deleted
  only through an explicit `CANCEL`-first confirmation; remaining pilot
  selection is deterministic and deleting the final pilot opens the existing
  create flow. Keyboard `M` toggles the existing master audio owner and shows a
  restrained `MUTED` / `AUDIO ON` acknowledgement while preserving the prior
  mix. Mute is session-local because no simple persisted audio-settings store
  exists.

- **Green `774bd71b` RC and package:** normal keyboard F now uses a true held
  Ruler input, and portal confirmation resolves against authoritative residence
  at command receipt before movement can carry the ship out. Retired
  Signal/scalar-Inhibitor fixtures now assert current Noise/ecology truth. The
  exact source passed 119/119 suites with zero retries in 393.47 seconds, then
  built all five targets as `0.3.1.774bd71b`; release status and package
  authority boot passed. The playtest ZIP SHA-256 is
  `173a70ab2f812134e217399160ae7a2b99931c5cc199514d981c06f99cdc4e5f`.
- **Immutable `a58b5921` RC receipt:** the exact provisioned source ran the
  119-suite full gate once with retries disabled: 111 passed, eight failed,
  zero retries, 395.73 seconds wall time, and 576.08 seconds summed suite time.
  Deep Field sustained 14.957/15 Hz with zero skipped deadlines. Stale
  Signal/portal/result contracts and one host-sensitive Flow FPS sample remain
  distinct from two current player-path blockers: Ruler live slingshot
  engagement and AgentPlay optional-portal extraction. The clean build lane was
  provisioned but intentionally stopped before build/package commands, so no
  `0.3.1.a58b5921` artifact or package-green claim exists.
- **Deck entity readability vertical:** Three now owns one bounded presentation
  scale policy with family/subtype pixel minima, retains authority radii as
  untouched inputs, and gives Scavenger Drifter plus Glitch/Swarm/Vessel named
  sprite cards. Generic Inhibitor rings/cores are retired from product mode;
  wells remain fabric-first and labels remain secondary.
- **Inhibitor population and run reset:** `src/content/inhibitor-ecology.data.json`
  now owns a conservative total active cap of `11`. Accelerated full-length
  ecology measured an uncapped steady `5 Glitch + 4 Swarm + 3 Vessel` density;
  the cap preserves late crowding and type mix as `5 + 4 + 2` while recording
  suppressed Vessel arrivals. Same-process new-map reset proof clears Inhibitor,
  Ballpark wave, Noise-contact, and well-overdrive state under a new run ID,
  while retaining one PID/port owner. Renderer run reset now clears VFX memory
  and reports reset/dispose counts. The focused probe records compact ecology
  and authority tick timing; no movement, map scale, ecology speed, or 15 Hz
  clock change is included.
- **Deferred v0.3.2 visual review:** queued a gated Fabric, Surfing, and Camera
  presentation review after v0.3.1 RC work. It will compare settled low-to-capped
  scenes and three Deck camera models before Greg chooses a direction; no
  renderer, camera, simulation, capture, or tuning work starts in v0.3.1.

- **Post-Orrery playable correction:** portal lifecycle changes now refresh the
  Ballpark mirror before same-tick authority residence queries, so optional
  and final apertures publish ready state, abort on exit, and confirm through
  normal input. Slingshot truth is explicit: edge engages, hold sustains, and
  button-up releases.
- **First-heard threat and Noise identity:** force pulse is `1600m`, decoy is
  `1900m`, and Swarm/Vessel warnings are `4600m`, derived from a centralized
  three-second representative-cruise budget with threat-specific closure
  margins. Hull and loadout Noise radius/decay modifiers now reach live
  authority; legacy saved Signal coefficient names map once to the new fields.
- **Presentation and evidence clarity:** optional residence leads with
  `OPTIONAL APERTURE`, missing world names receive safe labels, ship-local
  labels use ordered collision slots, death clears prompts and makes abilities
  inert in the same frame, and partial AgentPlay stages persist after a later
  failure.
- **Normal-input slingshot proof repaired:** the live keyboard F and controller
  Y journeys now keep the button held after transport acknowledgement, observe
  authoritative engagement and held orbit, then release on button-up. No
  product movement, authority, tuning, Heat, or Noise source changed.
  `RulerLive` and `SlingshotV2Live` pass.
- **AgentPlay Noise truth:** replaced the retired `player.signal.level`
  assertion with the canonical force-pulse contract: source `PULSE`, live
  radius `600m`, and peak at least `600m`. The focused Noise fixture passes
  77/77. The one natural AgentPlay run passed slingshot, salvage, Noise, and
  death/Home recovery before exposing a later optional-portal
  `portalInteraction.ready` timeout. No gameplay or portal code was changed,
  and the full RC was not rerun.

## 2026-07-27

- **Orrery scale correction checkpoint:** product source `61ecc534` now
  derives the Deck off-screen hearing floor from the live camera ruler, makes
  world Noise contacts readable before entering view, gives Swarms and Vessels
  physically relevant pursuit speeds, keeps EXFIL cyan and Inhibitors magenta,
  and uses cadence only for restrained presentation pulsing.
- **Heard-route navigation:** the aperture rail shows `ROUTE: LISTEN` without
  leaking distance until a true active EXFIL emitter is heard. That discovery
  remains earned for the authority run; optional portals cannot unlock it.
  Results expose existing heard/tracked time, empty listener counters collapse,
  and the ruler separates the `50 ms` coyote value from its `267 ms` transport
  allowance.
- **Corrected RC evidence:** exact product source `61ecc534` ran the full
  no-retry lane once: 112/119 passed, 7 failed, zero retries, 387.89 s wall
  time. Three live rows share a normal-input slingshot engagement timeout;
  four rows are stale post-Noise/portal/HUD contracts. The AgentPlay death and
  Home recovery journey passed, but the slingshot route did not, so this is
  package-green rather than play-green.
- **Fresh corrected package:** all five targets built as `0.3.1.61ecc534`;
  `release:status` and `test:package` passed staged authority boot and package
  closure. The playtest ZIP is 441,835,825 bytes with SHA-256
  `ad381bb2152b5fa18c8c4226e9a1cbb78acd7b3008904dc4571b024c6ce2b200`;
  desktop `app.asar` payloads share SHA-256
  `e6fafc45913d02242a8834f5ca61fe8efd0df39d6fefad466f2a09675cc8bf98`.
  No Deck deployment or promotion was performed.

- **Orrery route teaching:** the aperture rail now reads `ROUTE: LISTEN` until
  the current run genuinely hears an `EXFIL TONE`. Discovery then persists for
  that run and reveals the nearest aperture in canonical `m`/`km` distance;
  zero-value Noise listener counters are hidden, existing heard/tracked timing
  appears in results, and the ruler names fixed coyote transport separately.

- **Selected RC evidence:** exact product source `a958a8c6` ran the full
  no-retry candidate lane once: 86/119 passed, 33 failed, zero retries,
  300.10s wall time. The first red is stale Validation coverage for retired
  scalar Inhibitor shader state; other failures include retired pre-Noise and
  portal-block expectations, isolated dependency gaps, browser bootstrap
  cascades, and two host-timing cadence samples. The candidate is therefore
  full-lane red, not promotion-ready.
- **Fresh internal package:** the already-gated immutable source built all five
  targets as `0.3.1.a958a8c6` through the release tool's supported
  `--skip-tests` artifact path. `release:status` passed and `test:package`
  passed staged authority boot plus package closure. The playtest ZIP is
  441,826,786 bytes with SHA-256
  `3f001bc1ce15dafcdd57af395084a810258c651c8045dc8d44cb3b6b4cac9b31`;
  desktop `app.asar` payloads share SHA-256
  `42a6959d5a438ae6d754b653c916239b7d4a01864b2ca6994ed19f2bb0f35374`.
  No Deck deployment or promotion was performed.
- **Bundled E3 review packet:** committed one RC-level Orrery creative and
  technical review packet spanning held slingshot, Heat, loadout/results,
  Noise Radius v1, accumulating Inhibitor Ecology v2, well overdrive, and
  audible exfil. Primary owns delivery and intake; no review result is implied.
- **Orrery scale/contact correction:** the Noise data owner now derives the
  `1425m` reference `1280x800` off-screen threshold from the locked camera and
  physical-unit rulers. Glitch/Swarm/Vessel/EXFIL starting radii are
  `1600/2200/3200/4200m`; Swarm pursuit speeds are `0.25/0.6/1.1/1.6` and
  Vessel movement starts at `0.5` world-units/s. World cadence now pulses
  contact presentation without changing audibility, and EXFIL remains cyan
  while Inhibitor contacts remain magenta/anomaly.
- **Inhibitor Ecology v2 completion:** finished the player-facing collection
  migration. Glitches, Swarms, Vessels, and active exfils now project as
  deterministic world Noise emitters with `STATIC`/`CORRUPTION`/`THRUST`/
  `EXFIL TONE` categories, truthful inner identities, and no increase to player
  Noise. HUD, audio, Three, ASCII, renderer-neutral presentation, and results
  consume accumulated ecology counts/kinds. The shared `2.5s` audible-contact
  memory is now the only off-screen indicator path; the privileged exit arrow,
  scalar inhibitor compatibility projection, portal-block fields, and well
  consumption fields are retired.

- **Design ownership versioning:** archived the complete v0.2 Signal and
  Inhibitor design bodies, replaced their stable paths with pointers, and
  locked the current v0.3 Noise Radius v1 and Inhibitor Ecology v2 owners.
- **Noise Radius v1:** replaced the player-facing Signal meter and bands with
  an authoritative decaying meter-based Noise envelope, local listener state,
  emitter-owned audible contact memory, contextual Heat presentation, and
  truthful Noise result stats. This is a source/focused-proof checkpoint;
  browser, package, and Deck evidence remain separate.
- **Phase-1 Inhibitor Ecology:** shipped the Conductor-owned bounded Glitch
  collection with stable ids, deterministic drift, lifetime expiry, listener-free
  behavior, bounded core hull damage, `inhibitor.entities` public projection,
  and procedural magenta/fabric presentation. World Noise contact projection is
  completed in the v0.3.1 ecology vertical below.
- **Phase-2 Inhibitor Ecology:** added Conductor-owned mobile Swarms with
  stable ids, an independent cap/cadence/lifetime, per-Swarm Noise and decoy
  acquisition, last-heard search, restrained magenta/fabric presentation, and
  heavy hull contact through the Glitch authority damage/death seam. Retired
  Swarm cargo deletion, control sluggishness, recursive player-Noise spikes,
  and their event/audio/UI routing; world `CORRUPTION`/`SWARM` contacts now ship
  with the final ecology projection.
- **Phase-3 Inhibitor Ecology:** added Conductor-owned capped Vessels with
  deterministic edge inbound tells, strategic nearest-alive targeting,
  outer/core authority damage, procedural magenta presentation, and persistent
  capped well overdrive. Vessels never block exfil or consume, move, reduce, or
  delete wells; their bounded multiplier feeds authoritative force, current,
  and slingshot mass. The final ecology projection below carries Vessel and
  active-exfil Noise contacts.

## 2026-07-26

- **Human-clarity completion:** tested source `ffbcc0ba` completes the named
  authority, client, renderer/UI, content, deployment, and service owners.
  Core passed 87/87 in 45.36 s and the single full candidate run passed
  119/119 in 432.91 s, both with zero retries. Final 5/15/25 cadence delivered
  14.981/14.998/14.996 Hz with no skipped deadlines; the Deep Field budget
  sample delivered 14.99/15 Hz, closing the earlier measured delivery
  residual. Production moved 50,173→50,069 nonblank lines while tests moved
  23,954→24,549. The fresh AgentPlay journey and product-loop contracts passed.
  This is source evidence only: no package, Deck, RC, promotion, or Greg-taste
  claim is implied.
- **Historical human-clarity checkpoint:** `19bb70b6` split authority
  HTTP/snapshot/session state, remote session/snapshot/scene projection, fluid
  shaders, Three world presentation, HUD presentation/inventory, audio cue
  synthesis, deployment CLI parsing, and service supervision into named owners
  while preserving the existing facades and runtime contracts. Canonical ESM
  content now feeds the synchronous CommonJS adapters. The rejected
  service-lock experiment was deleted; direct start/stop/status/PID cleanup
  remains the contract.
- **Historical interim evidence:** whole production nonblank LoC moved
  50,173→50,095 while tests moved 23,954→24,600. Three no-retry core runs
  passed 87/87 in 48.67 s, 45.20 s, and 49.11 s. At that checkpoint the final
  full, journey, product-loop, Deep Field, and LoC receipts were still pending;
  the completion entry above supersedes that interim status.
- **Unified authority clock:** `src/content/movement.data.json` now owns the
  one 15 Hz gameplay integration rate for Shallows, Expanse, and Deep Field.
  Map-specific movement profiles and overload time dilation are removed;
  rendering, snapshot, transport, visual, and content schedules remain
  separate. This is the approved `BASELINE_SHA` movement-rate change, not a
  movement retune.
- **Initial measured Deep Field delivery:** relevance work reduced 24 to 12
  queries per tick, 194,970 to 49,242 candidates, and 203,532 to 51,072
  duplicates. The runtime now sends the same JSON values/shapes/status/type
  without formatting whitespace, cutting Deep snapshot payloads to roughly
  204–213 KiB. The gameplay contract remained fixed at 15 Hz. The then-open
  roughly 13.9/15 Hz delivery result is historical; the final-host completion
  entry above closes it without restoring map profiles or chasing GC-sensitive
  heap movement.
- **Authority cadence:** the runtime uses monotonic fractional deadlines,
  allowing one fixed-dt jitter recovery and counting/dropping stale deadlines
  after a long stall. `/health.scheduler` adds delivery diagnostics; normal
  host acceptance requires zero skipped deadlines.
- **Accepted harness at `3b2cb022`:** the manifest has 121 registered contracts and the runner
  uses up to four workers (two browser workers) with isolated resources,
  ordered timing/launch receipts, and child-process cleanup. The ordinary core
  gate was 87/87 in 45.72 s versus the 93.62 s baseline (2.047x). Its
  exact-head full lane was 119/119 in 442.18 s versus 1,028.63 s (2.326x),
  with no retries.
  Host timing probes and the four stateful browser journeys have explicit
  exclusive resources; renderer fixture stepping uses exact elapsed client
  chunks, and live slingshot evidence records every range-break and requested
  release event. No package, Deck, or promotion claim is implied.

## 2026-07-25

- **Movement completion tranche 2:** normal slingshot input now explains the
  difference between no anchor and an in-range anchor that still needs
  tangential speed. Local prediction consumes the authority force ledger's
  fluid-coupling vector and refreshes authoritative fuel parameters on every
  snapshot rebase, reducing current-driven correction and stale depletion
  behavior without adding a second sim or changing movement tuning.
- **Goal D map-rate movement contract (superseded):** this entry recorded the
  then-current 15/12/10 Hz profiles. The 2026-07-26 unified 15 Hz authority
  clock supersedes those product-rate values; the 60 Hz route remains a
  diagnostic baseline rather than product closure.
- **Wall-time slingshot transport:** the canonical `50ms` gameplay coyote is
  preserved while the internal four-tick prompt transport allowance is stored
  as fixed wall time, so slower map profiles do not silently widen the window.
- **Map-relative portal placement:** optional and final-exfil placement now
  consume `map-center-fractional-bands-v1` from the canonical ESM/CJS map-scale
  adapters. Shallows preserves its existing bands while larger tiers scale
  intentionally from map width.

## 2026-07-17

- **v0.3.1 RC package:** built all five targets from source `dd9e5149` as
  `0.3.1.dd9e5149`; `release:status` and staged/extracted `test:package` are
  green under `lbh-local-v2`. Linux `resources/app.asar` SHA-256 is
  `561cf3d4c6fb0784ce4c5ba19d1f3e07d0c48afb397b4107b1be3881178c12ef`;
  the playtest ZIP SHA-256 is
  `9cfd14b433cb4b0113a6f1a84cb8a643eb1e35752e1fce1bd679c9a70c8bbeba`.
- **v0.3.1 Deck deployment:** after Greg completed Tailscale SSH's additional
  authorization check, the verified `0.3.1.dd9e5149` Linux artifact was
  deployed without rebuilding to `/home/deck/Games/last-singularity-v03`.
  Remote executable and `app.asar` hashes match local, and the v0.2 Demo
  remains unchanged. Gaming Mode key `19` now reads `Last Singularity v0.3.1
  Preview`; the display-name change deterministically changed its non-Steam app
  id to `3696252517`.
- **Deck runtime smoke:** the exact deployed wrapper reached embedded control
  and sim startup, authority registration, WebGL2 readiness, and
  `init.completed` on the Three title screen. It produced no snapshot-budget
  error, `sizeMult` fatal, or coredump. Remote `steam -applaunch` returned
  `AppError_9`, so a physical Library launch remains a Greg gate; the bounded
  Gamescope-session wrapper smoke is not claimed as Steam Input acceptance.

- **v0.3.1 map-relative schedule:** canonical map durations are now `480s`,
  `600s`, and `720s` across ESM/CJS, server, build, snapshot, UI clock, and
  results consumers. Whole-run collapse, Inhibitor, optional portal, and final
  exfil fronts resolve from normalized progress; local intervals remain
  absolute. The 600-second Expanse anchor is preserved, with epoch 3 at 75%.

- **W1-D slingshot input-path RC:** preserved the five-knob authority contract,
  ratified the internal `0.25 s` lock telegraph and `1.0 s` release ghost,
  added an authoritative aim/engage/release prompt that follows keyboard or
  Deck/controller input family, and report a visible no-anchor range gate on
  an otherwise valid press. Focused proof covers normal F/Y action input,
  authority engagement, and deliberate release without debug injection. The
  runtime coyote seam keeps the canonical `50 ms` value while allowing the
  internal prompt-to-command transport allowance of four current authority
  ticks, preserving the presented aim across the Shallows `66.7 ms` snapshot
  and command hops without changing range or movement.
  Authority aim telemetry now publishes tangential speed and `engageEligible`
  against the internal `0.05` minimum; HUD guidance says `align with current`
  without a glyph until eligible, and the normal-input proof applies tangent
  thrust from the live aim anchor before engaging.

- **Locked physical units:** `src/content/units.data.json` is now the sole
  shared authority for `1000 m` per sim/world unit, `12 m` Drifter length, and
  the `100 m` ruler default, with Greg/date/source ratification metadata.
  Browser and CommonJS wrappers derive the `0.012` sim-unit hull length and
  keep ruler, force-ledger, dev-panel, fixture, and runtime conversions in
  parity without changing gameplay geometry.
- **Retired per-player time dilation:** removed Time Dilator and Dead-Air
  Ampoule from the consumable/drop catalog, deleted `timeSlowLocal` authority
  state/use/expiry, client presentation, and audio routing, and added direct
  retirement coverage. Historical IDs and their old effect ID remain only in
  load-boundary sanitization so existing profiles lose the retired slots
  cleanly; no replacement effect was added.

- **Lane A payoff crash guard:** compact remote scavenger rows now restore the
  client-owned death presentation anchor when authority provides it, while
  partial rows remain safe to render and update without inventing gameplay
  state. Focused coverage lives in `tests/renderer-authority.cjs`.
- **Lane B Wave-1 gate repair:** Conductor event-front spacing now resolves its
  ten-second production guard against short match fixtures, preserving stable
  ordering and overlap rejection; the live ruler proof derives force activity
  from authoritative `{x, y}` snapshot vectors; and the eight Wave-1 contract
  suites are registered under their narrow authority, static, or browser lanes.
- **Lane C packaged Solo authority:** normal Map Select launch now always uses
  the local protocol-v2 authority path. Desktop renderer builds carry a
  required-authority identity, and authority startup or launch failures return
  visibly to Map Select with a retry/home warning instead of starting the
  legacy analytic solo path. The old path remains available only to the
  explicit development gate `?legacySolo=1` or the named sandbox target.

## 2026-07-16

- **Lane B fuel recovery:** the shared authority/browser movement step now
  protects the last unaffordable thrust sample, allowing the existing delta-v
  regen loop to refill a depleted tank and resume usable thrust. Remote HUD and
  Three presentation read fuel ratio from the authoritative player snapshot.
  Focused local/authority depletion, recovery, and parity proof is in
  `tests/fuel-recovery.cjs`.
- **Lane C Deck snapshot repair:** remote launch now treats the authority's
  empty boot session as idle, starts the selected canonical map tier, and
  verifies that returned identity. Repeated joined Deep Field snapshots are
  checked against the `large` 500000-byte ceiling, while compact remote star
  rows restore the renderer fields required when optional data is absent.
- **v0.3.1 Deck UI Lane A:** added the controller-visible title `B EXIT` path
  through the packaged Electron quit bridge; centralized Deck-safe spacing,
  icon/detail-aware rows, and backed action rails across title, Home, lists,
  inventory, and Map Select; replaced Map Select box clusters with deterministic
  coarse contour surveys for `5x5`, `15x15`, and `25x25`; replaced misleading
  possible-content meters with canonical aggregate descriptions; and separated
  nearby in-match wreck labels with local presentation mattes.
- **Version train:** development now targets `0.3.1`; internal candidates use
  `0.3.1.<commit-hash>`.
- **v0.3.1 RC package:** `release:internal`, `release:status`, and
  `test:package` are green at source `2b93b077` and build
  `0.3.1.2b93b077`. The playtest ZIP SHA-256 is
  `5ccc4c23955785f71600241548145e6475fbe37a737b856e217bb8043dd75525`;
  Linux `resources/app.asar` is
  `d29e3639823fb15e8b25c6a0bc7e345054c624571443b79c2d703f76946ca0b1`.
- **Deck deploy:** reused that checksum-verified v0.3.1 Linux artifact without
  rebuilding and deployed it to
  `/home/deck/Games/last-singularity-v03`. Remote executable and `app.asar`
  hashes match local. Installed launchers now identify `Last Singularity v0.3.1
  Preview`, but the supported shortcut refresh could not safely stop Steam
  within its timeout. Gaming Mode key `19` therefore still displays `Last
  Singularity v0.3 Preview` under app id `3771676273`; no shortcut file was
  rewritten.
- **Side-by-side preservation:** the v0.2 Demo remains at
  `/home/deck/Games/last-singularity-v02`, shortcut key `18`, app id
  `2947990413`. The v0.3 log namespace and launchers exist and no Last
  Singularity coredumps were recorded after deployment. A fresh Gaming Mode
  launch and current logs, controls, readability, suspend/resume, feel, and
  audio remain Greg gates.

## 2026-07-14

- W2-A4 made `shallows`, `expanse`, and `deep-field` authoritative at 5x5,
  15x15, and 25x25 through one ESM/CJS map-scale registry.
- Authored bounds and positions now migrate deterministically by normalized
  composition; scale-encoded active map modules were renamed accordingly.
- Session profiles, signature eligibility, authority `/maps` metadata, coarse
  fields, and fixed local render resources consume the canonical tiers.
- Added density/travel floor and ceiling proofs and bounded 25x25 coarse-field
  and snapshot/resource proofs. No authored population correction was needed.
- Corrected the travel proof to integrate canonical drag and zero-flow
  coupling: authored observations are `1.48 / 1.55 / 8.52 / 1.22 / 1.98 /
  14.22` seconds, with tier-aware bounds rather than the invalid `0.4` to
  `4.5` range. No movement constants changed.
- Repaired validation to consume the shared loader and canonical filenames,
  moved the static browser module table into `src/maps/playable-map-loader.js`,
  and made coarse-field and snapshot byte ceilings fail closed. Deep Field is
  `3136/4096` cells and an observed `323430/500000` snapshot bytes; client
  resources remain `192` fluid, `3` world units local, and `64` coarse.
- Deferred the broader S24 population catalog to a later decision.

## 2026-07-15

- **Consolidated RC boot correction:** fixed the merged title-scene path so
  id-less presentation fixtures preserve their authored scale while anomaly
  lookup receives canonical `shallows` identity. Playable 5/15/25 maps remain
  strict. Accepted source commit `ba39606f` is integrated at `f56175f6`.
- **RC build receipt:** `release:internal`, `release:status`, and
  `test:package` are green for all five targets at build
  `0.3.0.f56175f6`. The playtest ZIP SHA-256 is
  `5d53dd2d5305f09cd284ac9e25fbc4c9ae938b1a2894333842d41a2ef080fb66`;
  Linux `resources/app.asar` is
  `cedaeb57c5d72feb373f71d1fb924ba754ca4cb367165faa1b9e9852431daece`.
- **Evidence boundary:** the no-retry full lane was stopped after 215 seconds
  when its isolated checkout lacked Python audio packages, `three`, and
  Electron packager dependencies. It was not retried. Package boot is green;
  broad RC CI remains unclaimed for this hash.
- **Deck boundary:** preflight resolved the Deck at `100.77.19.24`, but
  Tailscale ping and SSH port 22 timed out. No deployment or Gaming Mode update
  occurred, and the v0.2 Demo slot remains untouched.

- X-D measured current cruise and Breacher Burn travel at live profile dt for the 5x5, 15x15, and 25x25 registry, including raw runs, authority read radii, and a derived decisions-per-minute proxy; no gameplay constants changed.
- X-A completed the bounded config red-flag audit: movement drag, wreck drift,
  and signal rates now use readable units with exact parity conversions; dead
  client knobs were removed. The former per-player `timeSlow` path remained
  flagged at audit time and was retired in the v0.3.1 follow-up under the
  durable "never per-player time" ruling.
- Corrected X-A compatibility coverage: Spacecraft/Surfer preset drag, saved
  profile drag ranks, all hull/item drag scales, and Ship wake terminal velocity
  now share the canonical half-life seam with parent-literal parity fixtures.
- Restored the parent wake boundary: Ship wake terminal velocity uses converted
  base drag only; composed `dragScale` remains movement-only.
- X-B froze the bounded jam/v0.2 design family into versioned history archives,
  retained stable pointer paths, and added `DESIGN-INDEX.md` as the living
  v0.3/v0.3.1 ownership route. See
  [`X-B completion`](reviews/completions/X-B-design-doc-versioning.md).
- **Map Select survey terminal:** documented the shipped three-panel hierarchy:
  map-class register, uncertain `SURVEY RECONSTRUCTION`, and possible-contents /
  confidence rail. Player-facing route anchors, path sequence, exact wells,
  portals, wrecks, spawn, object layout, and signal pressure are no longer
  style-guide claims.
- **State and accessibility contract:** valid rows expose launch; locked rows
  expose no action and use withheld/redacted data. Reduced motion uses static
  corruption. Deck/controller surfaces use the accepted graphical glyph family
  without raw keyboard fallback.
- **Scale labels:** Map Select consumes the canonical W2-A4 authority tiers:
  Shallows `5x5`, Expanse `15x15`, and Deep Field `25x25`.
- **Accepted Map Select proof:** valid Deck capture
  `/private/tmp/lbh-map-select-survey-proof-20260715T064922Z/map-select-valid-expanse-deck.png`
  (`2a5d7ee301f2aafbc4b6a341f270559078c2420299b0c1b8495a0a5a8d1a3290`), locked
  Deck capture
  `/private/tmp/lbh-map-select-survey-proof-20260715T064922Z/map-select-locked-sector-05-deck.png`
  (`6525190afc7d3a65220ddd5bf65909e503d1961cd155973d8eacd504ae504ea1`), and
  manifest
  `/private/tmp/lbh-map-select-survey-proof-20260715T064922Z/manifest.json`
  (`1eb4fbfb5ac7f8bf9e1fa240281490103ce9735c2533a6e2d31e2e248950bb04`).
- **Pause/resume reconciliation:** accepted the local-overlay contract: remote
  authority and snapshot intake continue under pause, held/edge input is
  neutralized once on entry, covered presentation coalesces to newest authority
  truth, short resume follows normally, and `1500ms` long resume settles
  camera/fluid/presentation and clears stale UI motion. Terminal, phase, and run
  changes route directly, with cached terminal events scoped to the exact run;
  local sandbox freeze remains separate.
- **Acceptance boundary:** accepted source commits are `59b1646b` plus the
  run-scoping correction `341268b1`; focused proof is `PauseResume 49/49` with
  syntax/diff clean. No headed or visual proof is required for this docs
  acceptance; visual feel remains deferred.
