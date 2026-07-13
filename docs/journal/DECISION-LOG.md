# Decision Log

## 2026-07-12 — Long evidence separates infrastructure longevity from natural match lifecycle

**Decision:** The 45-minute steady transport/memory profile may use a guarded,
test-only authored-collapse suppression seam while retaining all ecology,
hazards, replication, and the finite `LBH_SIM_MAX_SIM_TIME=7200` fence. The
90-minute product-realism/churn profile instead runs nine sequential natural
matches under one stable process/control plane. Each active match has exactly
one logical authority; adjacent match authorities never overlap.

**Why:** A natural LBH universe correctly collapses around ten minutes, so one
unmodified 45-minute run cannot measure continuously active per-match queues,
CPU, GC, or retained heap. Disabling/faking the product clock is unacceptable
for gameplay evidence, while repeated natural matches can hide single-match
retention. The split keeps Universe Is the Clock intact and labels synthetic
post-collapse longevity honestly.

**Door status:** Open only for a strict `NODE_ENV=test` plus soak-diagnostics
guarded seam that suppresses authored terminal kill/endSession, never ordinary
death/extraction, ecology, reset, terminal-all-players, or max lifetime. Closed
for changing product duration, freezing/dilating the sim, treating one process
as a fleet-wide authority, or crediting the preserved FAIL artifact as soak.

## 2026-07-12 — Product traffic gates replace aggregate smoke ceilings

**Decision:** Preserve the historical 2.5 MiB/s smoke and decimal 2.5 MB/s
canonical outcomes exactly as recorded, but do not use either fixed aggregate
number as the future architecture gate. Add per-class bytes/frame and cadence
accounting, then gate steady traffic at <=64 KiB/s/player with <=80 KiB/s as a
declared sensitivity. Implement content-addressed static manifests and
recipient baseline/delta public replication before binary, AOI, or compression.

**Why:** The canonical active minute measured 308.4 KiB/s/player, 4.82x target;
about 99.93% was authority-to-client, and public state was 95.4% of state bytes.
Owner-only work cannot close the gap, cadence-only full snapshots would damage
feel, and compression would hide application debt. Baseline-dependent dirty
entity/component deltas attack the measured dominant source while preserving
one canonical authority and reliable consequences.

**Door status:** Closed for reinterpreting the failed decimal gate as MiB,
raising a ceiling to pass, using whole-run averages diluted by collapse, or
advancing hosted/high-count claims before the supported 4–8 envelope meets its
product budget. Binary, AOI, and compression remain measured follow-ups.

## 2026-07-12 — T2 splits drainable pressure from hard fencing

**Decision:** Replace the single T2 slow-reader row with `T2a` drain-before-
timeout, `T2b` hard timeout/fence/replay, and later `T2c` Linux/browser ingress
corroboration. Attribute every primary pressure fact to one privacy-safe
authority connection ordinal; aggregate worst-connection metrics cannot pass.

**Why:** The shipping policy closes after two seconds of continuous transport
backpressure plus sweep/grace. The former 20-second reliable-event requirement
could not coexist with that policy, and a proxy or delayed browser callback can
buffer away from the authority. Splitting the cases proves both bounded drain
and bounded isolation without weakening production limits.

**Where it landed:**
`docs/project/reviews/2026-07-12-t2-slow-reader-pressure-implementation.md`.

**Door status:** Closed for lowering thresholds, extending timeouts, synthetic
giant frames, aggregate-only attribution, or mixing raw pressure with netem,
WAN, WSS, TLS, hosted, or 24/48/96 capacity claims. The adapter prerequisite is
accepted at `381f435` plus causal fix-forward `c09882d`. T2a is accepted through
`3cfc9a8`; T2b is accepted at `98498b9` plus ledger fix-forward `0955171`.
The product-maximum eight-player extension is accepted through `b6a2513`.
T2c remains a separate later Linux/browser corroboration lane.

## 2026-07-12 — F5 uses timeout drop plus a one-client proxy fence

**Decision:** F5 will precreate inert bidirectional `timeout:0` toxics on pilot
3's listener, activate them for at least 25 verified seconds alongside Layer A
discard, then disable, clean, and re-enable only that proxy. Recovery requires
a distinct WebSocket and greater authority connection epoch. Global `/reset`,
dynamic `reset_peer`, and live proxy counters are not used as truth.

**Why:** Pinned v2.12.0 timeout zero consumes and discards chunks without a
release buffer. Disabling the one proxy fences its tracked connections, while
global reset would mutate healthy paths. Dynamic reset-peer does not establish
immediate RST semantics, and proxy counters settle only when link copies end;
endpoint progress is the honest outage clock.

**Where it landed:**
`docs/project/reviews/2026-07-12-f5-one-client-blackout-implementation.md`.

**Door status:** Closed for global proxy reset, synchronous-RST claims,
shortening the verified 25-second drop, or combining F5 with T2/netem/hosted
evidence. The controller and isolated four-browser cohort are accepted at
`271b7a8` and `8f5133a`; T2 slow-reader and Linux packet truth remain separate
open lanes.

## 2026-07-12 — T1 uses four proxy paths into one match authority

**Decision:** T1 will run one pinned Toxiproxy v2.12.0 daemon per harness run,
create one independently controlled listener per browser, and forward all four
listeners to the same match authority. Fixed latency uses zero jitter. The
integer bandwidth toxic records both the intended 64/320 KiB/s targets and its
nearest representable 66,000/328,000 B/s values.

**Why:** Independent listeners isolate per-client paths without creating a
second gameplay writer or one authority per client. Toxiproxy is portable
across local macOS and ordinary Linux CI, but it manipulates userspace TCP
stream chunks rather than IP packets. Its stable bandwidth unit is decimal
kB/s and its jitter is not replay-seeded, so precise labels and fixed values
are necessary for reproducible, honest evidence.

**Where it landed:**
`docs/project/reviews/2026-07-12-t1-managed-tcp-proxy-implementation.md`.

**Door status:** Closed for a shared browser listener, production proxy
dependency, ambiguous KiB/s labels, seeded-jitter claims, Toxiproxy packet-loss
claims, or combining T1 with F5/T2/netem. Open for the pinned control-helper
slice, then the four-browser T1 cohort.

**Metrics clarification:** v2.12.0 received/sent proxy byte counters settle when
the corresponding stream copy ends. T1 therefore gates finalized per-proxy,
per-direction counters after browser close; it does not treat periodic values
as live throughput, queue depth, or connection-drain evidence.

## 2026-07-12 — T0 proves a Chrome transport stall, not a reconnect

**Decision:** The zero-dependency T0 browser lane uses
`Network.emulateNetworkConditionsByRule` and `Network.overrideNetworkState`
after admission. Its five-second offline interval is classified as a Chrome
transport stall unless CDP lifecycle evidence independently proves a socket
rotation. Steady-state latency excludes the impaired pilot's offline-through-
settled interval; that interval remains visible in a separate recovery
distribution. The 500 ms steady-state input-ACK p95 gate is provisional local
harness calibration, not a product or WAN SLO.

**Why:** Chrome 150 can stop progress and queue an existing WebSocket while
offline without closing it. Labeling that behavior reconnect, packet loss, or
TCP pressure would overstate the injector. Separating steady-state and recovery
latency prevents the known outage from contaminating the shaped baseline while
preserving every recovery sample for review.

**Where it landed:** `tests/network/cdp-browser-transport.cjs`, the T0 scenario
in `tests/fixtures/network-impairment/phase2-browser-v1.json`, the browser
cohort runner, and the Phase 2 impairment review documents.

**Door status:** Closed for CDP packet-loss, receive-window, WAN, TLS, or
automatic reconnect claims. Open for the managed per-browser TCP proxy lane,
Linux netem packet evidence, and later hosted WSS validation.

## 2026-07-11 — Browser impairment injection stays test-owned

**Decision:** The four-browser Layer A harness will exercise the real client and
adapter scheduling seams without adding an impairment control surface to normal
product code. Chrome DevTools response interception will patch the exact
SimClient construction call in memory after asserting its expected source; a
guarded Node preload will inject the adapter scheduler only into the test sim
child. Fresh-cohort decisions use stable pilot-slot/phase/ordinal keys, while
runtime IDs and payload hashes remain evidence only.

**Why:** A production query, environment read, or global scheduler hook would
ship a fault-control path. A generic WebSocket facade would stay test-owned but
bypass the seams Phase 2 is meant to validate. Runtime-generated IDs and
timestamps also make strict payload-fingerprint tapes non-replayable across
fresh browsers. Test-owned source interception plus stable compiled decisions
keeps the shipped path clean and the evidence reproducible.

**Where it landed:**
`docs/project/reviews/2026-07-11-phase2-browser-cohort-implementation.md`.
Implementation starts with an isolated F0 PR-smoke runner after bounded adapter
and authority quantile instrumentation lands.

**Door status:** Closed for product impairment flags, automatic retries, and
calling browser callback delay packet loss or WAN latency. Open for the staged
F0/F1/F3/F6 Layer A runner and later separate proxy/netem/WAN evidence.

## 2026-07-11 — Reliable delivery faults wait for contiguous ACK semantics

**Decision:** The first authority-to-client impairment seam may schedule only
complete non-reliable frames. Any frame carrying `deliveryId`, plus every
terminal `error` or `close`, keeps the existing immediate transport path.
Reliable delay, omission, duplication, and reorder remain deferred until the
send queue records physical delivery correctly and the client ACKs only the
highest contiguous delivery ID.

**Why:** The current queue marks a reliable ID sent when it drains, before an
injected delay physically reaches the socket. The client also ACKs a received
delivery ID cumulatively. Releasing ID 2 before ID 1 could therefore retire an
unseen consequence and turn a test harness into a source of false correctness.
Terminal frames likewise cannot be delayed safely while the adapter closes the
transport immediately afterward.

**Where it landed:** `scripts/sim-ws-adapter.cjs`,
`tests/multiplayer-ws-adapter-impairment.cjs`, the `multiplayer-network` lane,
and the queue/client/barrier contract in
`docs/project/reviews/2026-07-11-reliable-impairment-prerequisite.md`.

**Door status:** Closed for reliable or terminal impairment through the first
adapter seam. Open for a separate queue/client slice that adds physical-send
accounting, contiguous delivery ACKs, and focused hole/replay regressions.

## 2026-07-11 — Phase 1 WebSocket is an I/O face on the match authority

**Decision:** Phase 1 will pin a reviewed `ws` 8.x production dependency and
attach `/stream` with `noServer: true` to the existing match authority's HTTP
server. It gets no second process, port, gameplay writer, or timer. Projection
is tick-coupled at the existing 15/10, 12/8, and 10/6 authority/snapshot
clocks. Full JSON proves transport truth first; binary, AOI, compression,
prediction, and higher clocks remain evidence-gated. Strict frames and the
bounded send queue are transport-neutral prerequisites, not socket-owned
copies.

**Why:** Hand-writing RFC 6455 is security-sensitive work, while a separate
stream service would blur one-match/one-authority ownership and duplicate
scheduling. The same-process adapter can remove request-per-input and polling
hot paths without changing gameplay truth. Explicit queue bounds keep one slow
client from consuming the match authority.

**Where it landed:** `scripts/multiplayer-wire-protocol.cjs`,
`scripts/multiplayer-send-queue.cjs`, their focused tests,
`docs/v0.4/phase1-json-wss-adapter-plan.md`, and the
`multiplayer-network` harness lane.

**Door status:** Closed for a second socket authority process, bespoke
WebSocket framing, unbounded send buffers, silent reliable-event loss, and
compression by default. Open after prerequisite gates for the pinned package
version, executor extraction, tickets, field revision, adapter, client
cutover, and staged Electron proof.

## 2026-07-11 — Reconnect rotates connection authority; history stays public

**Decision:** A run membership survives reconnect, but its connection id,
connection epoch, and command credential rotate immediately; the old
connection is fenced. Reconnect rehydrates only server state and ignores
caller-supplied profile, hull, rig, loadout, and consumable mutations. Live
snapshots are public projections plus only the authenticated owner's private
overlay. Retained snapshot history is public-only; authenticated history adds
one separately stamped current `ownerState` instead of copying present private
state into historical ticks. Result settlement is keyed by `(runId, profileId)`,
exact-retry idempotent, conflict-rejecting, atomically persisted, and service
authenticated when the local service token is configured.

**Why:** Membership continuity and connection authority are different
lifetimes. Preserving a credential across reconnect lets a stale socket keep
control, while accepting reconnect loadout state turns transport recovery into
a gameplay mutation API. Grafting current cargo/signal/input onto old snapshots
would falsify replay time. Idempotent authenticated settlement keeps network
retry from duplicating progression without moving outcome truth to clients.

**Where it landed:** `scripts/session-registry.cjs`, `scripts/sim-runtime.cjs`,
`scripts/control-plane-runtime.cjs`, `scripts/control-plane-store.cjs`,
`scripts/control-plane-client.cjs`, `src/sim/sim-client.js`, the four
`tests/multiplayer-*.cjs` fixtures, and
`docs/v0.4/research/phase0-multiplayer-baseline.md`.

**Door status:** Closed for credential-preserving reconnect, caller-authored
reconnect state, rival-private snapshots, present-state historical overlays,
and duplicate settlement credit. Open for durable admission claims,
process-loss resume, per-authority workload identity/lease fencing, and later
checkpoint/replay recovery.

## 2026-07-10 — Multiplayer authority is per match and horizontally multiplied

**Decision:** v0.4 keeps one logical single-writer gameplay authority for every
live match. Concurrent matches create concurrent authority instances, packed
across a regional fleet by measured safe density; the rule does not require
one VM per match and does not create one global simulation. The first playable
slice keeps existing map clocks and uses JSON WebSockets, server-created
membership/connection epochs, owner/public projection, and idempotent results.
Binary deltas, AOI, prediction, higher clocks, hosted progression, and vendor
runtime choices must earn adoption through measured traces.

For higher-count experiments, 24 remains one isolated writer process, 48 adds
mandatory AOI/deltas/quota and optional projection workers, and 96 remains one
logical authority implemented as a canonical writer plus deterministic
internal workers. Independently writable spatial shards stay rejected until an
optimized 96-player service fails and a sharding prototype proves at least 2x
benefit with correct handoff.

**Why:** v0.3 already has Ballpark identity, sim-owned consequences, stamped
events, snapshot recovery, and an explicit overload model. Per-match authority
extends that truth and keeps contested movement/loot/extraction canonical.
Horizontal fleet placement solves concurrent-match scale, while bounded
internal parallelism addresses heavier single matches without introducing
split-brain gameplay.

**Where it landed:** `docs/v0.4/README.md`, `docs/v0.4/ARCHITECTURE.md`,
`docs/v0.4/ROADMAP.md`, `docs/v0.4/OPEN-DECISIONS.md`, and the research memos
under `docs/v0.4/research/`.

**Door status:** Closed for calling a player-hosted listen server true P2P,
using client ids as authority, or treating one logical authority as one global
server/one VM per match. Open and evidence-gated for 24/48/96 product modes,
movement clocks, replication codec, hosted identity/progression, vendor,
private-host rewards, voice, late join, and any future sharding experiment.

## 2026-07-10 — Specialist polish lanes run behind Greg's verdict, with one presentation-fact owner

**Decision:** The v0.3 palette, timbre, and troubadorb plans execute as
post-candidate polish: docs-only tasks may proceed now; all code waves wait
for Greg's feel/taste verdict, which directs them. The palette lane owns all
writes to `src/presentation/presentation-frame.js`/`presentation-style.js`
via a shared Task 0 fact schema; timbre consumes read-only. In `src/main.js`,
the timbre audio-router slice lands first, palette draw-path edits rebase
after it, and the troubadorb string sweep lands last. `docs/v0.3/RC-GATE.md`
is integrator-edited only, and any landed code slice re-opens the automated
candidate gate. Terminology: "amber" is the semantic value color; the shared
cross-lane metaphor is "the failing instrument."

**Why:** Both existing plans independently need the same new presentation
facts and the same 6,589-line `main.js`; without named ownership the lanes
converge on a collision two decisions from now. The candidate is green — churn
under Greg's review would invalidate the evidence the review depends on.

**Where it landed:** `docs/v0.3/reviews/2026-07-10-orrery-specialist-plan-review.md`,
integrated amendments in all three `docs/v0.3/plans/2026-07-10-*.md` files.

**Door status:** Open where marked: Breacher retint, atlas replacement,
volume-control persistence, executor routing, and troubadorb plan ratification
are Greg's calls. The troubadorb plan is an Orrery reconstruction because the
overnight lane produced no output.

## 2026-07-10 — Promo evidence must disclose how the state was reached

**Decision:** A social capture manifest must distinguish product-flow,
fixture/beauty, and reference evidence. “Representative” is reserved for a
fresh player-reachable flow whose required phases and browser health pass; a
test API composition can still be useful art, but it must say that it is staged.

**Why:** A visually plausible frame is not proof that the current profile,
authority, map, and result flow can produce it. Promo tooling should help us
market the real game without turning fixtures into accidental product claims.

**Where it landed:** the LBH social screenshot skill and its capture manifest,
plus Forge review guidance in the visual harness docs.

**Door status:** Closed for unlabeled fixture-based “representative” captures.
Open for richer natural extraction/death choreography as the agent play lane
becomes faster and more reliable.

## 2026-07-10 — Measure sprite batching need before adding atlas machinery

**Decision:** Keep the current lifecycle-owned sprite implementation for v0.3,
but bound renderer calls, pooled meshes, and asset-load errors in the production
perf probe. Move to atlas/instancing when representative scenes approach those
ceilings or physical Deck evidence requires it.

**Why:** The first visual review found a plausible worst-case draw-call risk,
but current production measurements remain well below the new catastrophic
ceilings. A speculative batching rewrite would add material/atlas complexity
before the actual bottleneck is proven.

**Where it landed:** `tests/perf-probe.cjs`, Three lifecycle diagnostics, and
the v0.3 entity visual plan.

**Door status:** Open, measurement-gated.

## 2026-07-10 — Generated assets are source material with deterministic runtime slices

**Decision:** v0.3 keeps the image-generated atlases as auditable source art,
then derives stable transparent entity sprites, catalog-keyed item icons, and
UI frame slices through `npm run assets:visual`. Generated pixels do not decide
gameplay identity or state; code selects the appropriate asset from canonical
sim and catalog facts. Wells, the fluid fabric, and corruption stay procedural.

**Why:** Directly dropping concept sheets into runtime code would make crop,
alpha, naming, and catalog coverage fragile. A deterministic slice step gives
the game a complete visual kit that can be regenerated and tested while
preserving the animated systems that define LBH's identity.

**Where it landed:** `assets/source/generated/v0.3/`, `assets/visual/`,
`scripts/build-visual-assets.cjs`, `src/ui/asset-kit.js`, and the Three entity
visual lifecycle.

**Door status:** Closed for runtime use of unsliced concept sheets. Open for
future hand-authored replacements that preserve the manifest ids and style
contracts.

## 2026-07-10 — UI motion has one deterministic presentation clock

**Decision:** LBH uses its own deterministic UI timeline for terminal-frame
construction, content reveal, focus, stagger, and screen transitions. Reduced
motion resolves the same states immediately. Browser view-transition machinery
does not become a second timing authority over the continuously animated canvas.

**Why:** UI motion needs to be testable, work in packaged Chromium, cooperate
with canvas and Three rendering, and remain incapable of blocking authoritative
state changes. One clock keeps those guarantees explicit.

**Where it landed:** `src/ui/motion.js`, screen drawing paths in `src/main.js`,
`tests/ui-motion.cjs`, and `tests/ui-visual.cjs`.

**Door status:** Closed for multiple competing transition clocks. Open for new
motion motifs built from the shared vocabulary and bounded VFX accents.

## 2026-07-10 — Packaged authority lives for the app lifetime

**Decision:** Electron owns its embedded control plane and sim from app launch
through app exit. An empty sim remains idle but does not terminate while the
player watches the title attract loop. Release acceptance boots the exact HEAD
artifact, proves the packaged Three title, waits past the former idle timeout,
and joins a real authoritative run.

**Why:** Process idle shutdown is correct for detached test/server sessions but
made a self-contained desktop build silently unplayable after 30 seconds on the
title screen. Staged require-closure tests could not catch that lifecycle bug.

**Where it landed:** `desktop/electron-main.cjs`, `tests/desktop-package.cjs`,
`tests/release-package.cjs`, the package scripts, RC gate, and build process.

**Door status:** Closed for app-owned sim self-termination and source-only
package claims. Open for platform-specific suspend/resume policy after physical
Deck evidence.

## 2026-07-10 — v0.3 closes on confirmed extraction and required Ballpark queries

**Decision:** Portal extraction is an authority-owned interaction, not a
collision side effect. A player must remain inside a cyan aperture and confirm
with Enter/A; leaving clears readiness immediately. Load-bearing relevance,
wreck pickup, and portal selection require persistent Ballpark identity and no
longer fall back to bespoke array scans.

**Why:** Touch-to-win made high-speed fly-throughs ambiguous and gave UI no
honest interaction state. Optional Ballpark paths allowed the production sim to
silently preserve two spatial authorities after parity had already been proven.

**Where it landed:** `scripts/sim-runtime.cjs`, `scripts/sim-protocol.cjs`,
`scripts/sim/ballpark-mirror.cjs`, controller/HUD wiring, and the authority,
swept-contact, Ballpark, and natural agent journey suites.

**Door status:** Closed for v0.3. Future extraction charge time or multiplayer
prediction may change presentation and transport, but not server ownership or
the residence-plus-explicit-intent rule.

## 2026-07-10 — Product proof is a fresh natural journey, not debug choreography

**Decision:** A v0.3 handoff requires AgentPlayEval to create a disposable
browser and fresh sim, use normal menus/controller input and public protocol,
capture 1280x800 evidence, and reach a changed second run. Debug mutation can
support focused contract fixtures but cannot count as playable proof.

**Why:** Contract tests can prove consequences in isolation while leaving a
broken player journey between them. Greg should be the final judge of feel and
taste, not the first person to discover that launch, movement, extraction, or
writeback does not work.

**Door status:** Closed for release evidence. Open for deeper agent navigation,
visual understanding, and multi-route evaluation after v0.3.

## 2026-07-09 — Protocol v2 binds commands to run and player authority

**Decision:** Every gameplay mutation carries the active run, player authority,
and a monotonic command identity backed by a server-issued credential. Shared
snapshots omit private event tails, and event reads filter player-local facts.

**Why:** Client ids are labels, not authority. Future multiplayer and reconnect
traffic need deterministic rejection of stale runs, reordered commands, and
cross-player mutation before more entities or prediction increase the blast
radius.

**Door status:** Closed for raw client-id-only mutations and successful stale
input no-ops. Open for transport encryption and internet-facing identity when
LBH leaves trusted local/embedded networks.

## 2026-07-09 — Routes are seeded authoritative content

**Decision:** A map route is authored metadata whose briefing, anchors,
signature, named wells, and initial loot derive from the same seed the server
launches. Shallows teaches slingshot, salvage, signal, then confirmed cyan
extraction; larger maps vary route shape rather than merely adding objects.

**Why:** A beautiful preview that describes a different run is false UI. Route
truth must survive the client/sim boundary before it can teach movement.

**Door status:** Closed for unseeded client-only briefing rolls. Open for route
tuning after natural journey evidence.

## 2026-07-09 — Three consumes renderer-neutral presentation frames

**Decision:** Three receives sanitized presentation frames and lifecycle-owned
visual families. Projection, quality, and palette roles are shared presentation
policy; gameplay consequences remain sim-owned and the ASCII fabric remains the
dominant product surface.

**Why:** A renderer should be replaceable without rewriting authority, and
entity managers must have bounded create/update/dispose behavior instead of
growing beside the scene graph.

**Door status:** Closed for new ad hoc entity managers and sim-internal payloads
inside Three. Open for richer assets and VFX behind the same frame contract.

## 2026-07-09 — Deck HUD uses stable rails and event audio budgets

**Decision:** The in-match HUD has non-overlapping 1280x800 rails, minimum text
and gauge sizes, command/caption separation, and reduced-motion rules. New
authoritative audio cues enter through a bounded voice budget.

**Why:** Readability and audible consequence are product behavior on a couch,
not optional desktop polish. Event bursts also need resource ownership just as
renderer objects do.

**Door status:** Closed for overlapping handheld HUD clusters and unbounded
event voices. Physical Deck taste remains a release gate.

## 2026-07-09 — Authority budgets measure rates and bytes, not only counts

**Decision:** Keep bounded-count canaries, but require a Deep Field authority
probe with explicit tick, latency, snapshot, bandwidth, heap, and Ballpark sync
ceilings before a v0.3 candidate can call its sim healthy.

**Why:** A fixed entity ceiling can stay green while every tick becomes slow or
every snapshot becomes expensive. The measured contract catches performance
shape regressions while leaving physical Deck rendering to its own evidence
lane.

**Where it landed:** `tests/authority-budget.cjs` and the authority/structural
suite manifest.

**Door status:** Closed for count-only authority health claims. Budget values
can tighten after more hardware and multiplayer samples, but must not silently
disappear.

## 2026-07-09 — Drifter and Breacher are the v0.3 public roster

**Decision:** Expose Drifter and Breacher as the v0.3 player roster. Keep
Resonant, Shroud, and Hauler definitions intact for AI, fixtures, and future
work, but do not present them as finished player promises.

**Why:** Two legible, mechanically distinct hulls produce a more honest demo
than five uneven ones. This preserves authored work without making internal
coverage indistinguishable from public product scope.

**Where it landed:** `src/content/hulls.data.json`, client/server hull wrappers,
`src/profile.js`, and `tests/public-roster.cjs`.

**Door status:** Closed for the v0.3 first-demo roster. Reopen each internal
hull only after its complete authority, UI, visual, audio, and journey evidence
passes the same gate.

## 2026-07-09 — The v0.3 branch builds as 0.3.0.<commit-hash>

**Decision:** Activate `0.3.0` as the public base on the dedicated v0.3 branch.
Every internal build appends the current commit hash as the fourth field. Patch
increments remain intentional public releases; major/minor train changes remain
Greg's call.

**Why:** A v0.3 candidate labeled `0.2.2` makes artifacts, logs, screenshots,
and Deck deployments lie about which architecture they contain. Branch isolation
lets the next train identify itself honestly without promoting it to `main`.

**Where it landed:** `package.json`, `package-lock.json`,
`scripts/version.cjs`, `scripts/release.cjs`, and `tests/versioning.cjs`.

**Door status:** Closed for v0.3 artifact identity. Open for Greg to call a
future `0.4` or `1.0` train.

## 2026-07-09 — Chronicle ships as career totals plus the last five runs

**Decision:** The first remote-authority Chronicle surface carries compact
career totals and the five most recent authoritative run records. Deeper
records, milestones, and behavioral profiling stay hidden until they have an
equally truthful persistence and presentation path.

**Why:** Five runs are enough to show consequence and changing play without
turning Home into a database browser. The shape is bounded for network and UI
budgets and can be proved end to end before broader Chronicle scope returns.

**Where it landed:** `scripts/control-plane-store.cjs`,
`scripts/control-plane-runtime.cjs`, `scripts/control-plane-client.cjs`, and
`tests/control-plane.cjs`.

**Door status:** Closed for the v0.3 first-demo scope. Open for later record and
milestone views after the five-run bridge is exercised by the natural journey.

## 2026-07-09 — Load-bearing contacts use swept toroidal geometry

**Decision:** Resolve player crossings against wells, wrecks, portals, and
scavengers over the full authoritative movement segment. Point overlap remains
valid, but no gameplay consequence may depend only on the two 15 Hz endpoints.

**Why:** A player can move farther than several interaction radii in one tick.
Endpoint sampling therefore allowed invisible well survival, missed loot and
portals, and inconsistent bumps. One server-only toroidal primitive keeps seam
handling and collision timing identical across consequence families.

**Where it landed:** `scripts/sim/world-geometry.cjs`,
`scripts/sim-runtime.cjs`, `tests/world-geometry.cjs`,
`tests/swept-authority.cjs`, and `tests/suite-manifest.cjs`.

**Door status:** Closed for point-only load-bearing player contacts. Open for
moving-vs-moving continuous collision if future entity speeds make stationary
targets within one tick insufficient.

## 2026-07-09 — Full snapshots are the event-gap rebase boundary

**Decision:** Give live authoritative snapshots monotonic ids and retain a
bounded full-snapshot window. The client reads events from the run-stamped event
journal; if that bounded history cannot bridge its cursor, it accepts the full
snapshot as current truth and resumes after the snapshot event watermark.

**Why:** Replaying whichever events happen to remain after a gap can apply an
incomplete consequence history to fresh world state. Full snapshots already
carry the complete gameplay view, so they are a deterministic recovery point
without introducing delta-state ambiguity or renderer ownership.

**Where it landed:** `scripts/sim-runtime.cjs`, `src/sim/sim-client.js`,
`src/main.js`, and `tests/protocol-runtime.cjs`.

**Door status:** Closed for using snapshot `recentEvents` as the v0.3 live
transport. Open for compact delta snapshots only after baseline and recovery
semantics remain equally explicit.

## 2026-07-08 — Cloudflare Drop is a temporary sandbox share lane

**Decision:** Add a dedicated Cloudflare Drop build target for quick links to
other people, but keep it explicitly sandboxed. The Drop artifact forces
`localSandbox=1`, clears remembered sim URLs, defaults to the Three renderer,
and does not bundle or imply the embedded Node control plane/sim.

**Why:** Cloudflare Drop can turn a folder or zip into a temporary public URL
without account friction, which is ideal for "look at this today" demos. LBH's
product-faithful v0.2 architecture still depends on an embedded/local authority
stack for real play, so the share target must not masquerade as the final
runtime.

**Where it landed:** `scripts/build.cjs`, `scripts/release.cjs`,
`package.json`, `tests/cloudflare-drop.cjs`, `tests/suite-manifest.cjs`,
README, and deployment/build pipeline docs.

**Door status:** Closed for quick public browser-share builds. Open for a later
durable website/itch/Steam release channel with clearer public-demo semantics.

## 2026-07-05 — Results EM means ledger credit, not cargo valuation

**Decision:** `emEarned` now means the EM credited to the profile ledger for a
run. Extracted or lost cargo keeps a separate salvage value. Cargo that fits in
the vault is not sold into EM; overflow cargo may still auto-sell and add to the
same ledger credit. For the v0.2 demo path, death no longer taxes existing EM
and instead credits the reduced survival residue.

**Why:** The result screen, chronicle, run record, and durable profile were
telling different economy stories. Showing `+290 EM` while the profile only
received overflow cargo value made the meta loop feel arbitrary. Separating
ledger credit from salvage value makes the post-run screen honest and preserves
the future choice between vaulting, selling, and upgrading.

**Where it landed:** `src/content/balance.js`,
`scripts/content/balance.cjs`, `src/profile.js`,
`scripts/control-plane-store.cjs`, `src/run-results.js`, `src/main.js`,
and the balance/control-plane/run-results/meta-flow/UI-visual tests.

**Door status:** Closed for labeling vaulted cargo as earned EM. Open for
future economy tuning around death penalties, overflow sale rules, and manual
sell/upgrade pacing.

## 2026-07-04 — Ballpark spatial grid period must equal world scale

**Decision:** Quantize `SpatialIndex` cell size so `columns * cellSize` and
`rows * cellSize` exactly equal the toroidal world scale. Preserve the requested
cell size in stats for diagnostics, but use the snapped size for indexing.

**Why:** A raw `ceil(worldScale / cellSize)` grid creates a phantom seam beyond
the wrapped world. On non-divisible cell sizes, query boxes near the right/top
edge can wrap into the wrong cell period and miss bodies near zero. Ballpark
now feeds live pickup/relevance work, so this must be an invariant rather than
a caller convention.

**Where it landed:** `scripts/sim/spatial-index.cjs` and
`tests/spatial-index.cjs`.

**Door status:** Closed for broadphase grids whose period differs from
`worldScale`. Open for replacing the rebuild mirror with incremental upserts
after the perf/budget gate justifies that complexity.

## 2026-07-04 — Server input and signal use delivered movement truth

**Decision:** Clamp authoritative move vectors to unit magnitude at protocol
ingest, keep scalar actions separate, and generate thrust signal from delivered
thrust after delta-v gates instead of requested trigger pressure.

**Why:** The server must not award diagonal free thrust, and an empty-tank ship
holding thrust should not radiate full thrust signal while producing no thrust.
This keeps "Signal Is Consequence" tied to output and makes future
multiplayer-minded input validation stricter before prediction or ECS work
adds more moving pieces.

**Where it landed:** `scripts/sim-protocol.cjs`,
`scripts/sim-runtime.cjs`, `tests/sim-protocol-input.cjs`, and
`tests/remote-authority.cjs`.

**Door status:** Closed for trusting client vector magnitude. Slingshot edge
latching closed on 2026-07-04 through queued press edges and accepted-edge
acknowledgements.

## 2026-07-04 — Map Select reroll owns controller X; host reset waits for hold-confirm

**Decision:** Move Map Select seed reroll to the controller X/Square path and
remove controller Y from the host-reset path. Host reset remains keyboard-only
until it gets a proper hold-confirm controller interaction.

**Why:** The previous prompt advertised Y for reroll while Y was also wired to
remote host reset. That made controller players unable to reroll and made the
visible hint capable of resetting a live authoritative session. The safer
interim is to make reroll real and keep destructive controller reset out of
the path until the UI can communicate consequence.

**Where it landed:** `src/main.js`, `src/input.js`,
`src/ui/input-prompts.js`, and `tests/controller.cjs`.

**Door status:** Closed for duplicate controller prompt labels on Map Select.
Open for a real hold-confirm host reset screen/state.

## 2026-07-04 — Bounded-growth soak is a structural gate, not a benchmark

**Decision:** Add a short deep-field bounded-growth soak to the structural
harness. The gate verifies body counts stay under a fixed ceiling, Ballpark ids
do not duplicate, event journal retention stays within capacity, snapshot
payloads stay below a hard size ceiling, and ended sessions stop ticking and
stop changing body/event counts.

**Why:** v0.3 needs protection against the class of leak Greg observed during
long-running sessions, but a CI soak should catch structural runaway first, not
pretend to be a Deck or local FPS benchmark. Longer perf probes and hardware
captures remain separate evidence.

**Where it landed:** `tests/sim-bounded-growth.cjs` and
`tests/suite-manifest.cjs`.

**Door status:** Closed for calling the architecture playable-ready without a
bounded-growth structural pass. Open for adding a longer manual/overnight perf
probe once the RC gate is closer.

## 2026-07-04 — Renderer contract becomes live diagnostics before ownership

**Decision:** Expose the v0.3 render-plan descriptor through Three backend
stats and assert it in renderer fixtures. The renderer now reports its contract
id, active quality tier, canonical surface, product capture surface, budget
target, and required pass ids through `getRendererBackendStats()`.

**Why:** The render plan should guide diagnostics before it owns more runtime
data. Surfacing it through the live backend lets tests catch drift between the
planned pass graph and the running Three renderer without making Three own
gameplay state or forcing renderable hints into snapshots prematurely.

**Where it landed:** `src/render-three/three-renderer.js` and
`tests/renderer.cjs`.

**Door status:** Closed for treating the render-plan files as inert docs only.
Open for the later renderable-hints slice, where snapshots/events can start
feeding renderer-neutral presentation hints.

## 2026-07-04 — Event journal is live before snapshot rebase

**Decision:** Route live sim events through `SimEventJournal` while preserving
the existing `/events` and snapshot `recentEvents` compatibility surfaces.
Snapshots now expose `lastEventSeq`, `/events` supports run and lane filters,
and `/health` exposes bounded journal stats. The snapshot ring remains a
debug/rebase scaffold until a later runtime slice wires it deliberately.

**Why:** Events are the safer protocol productization step. They are already
the source for remote authority assertions and VFX triggers, and adding run ids,
tick stamps, lane filters, retention stats, and stale/future/reset responses
improves debuggability without forcing the renderer or client to adopt a new
snapshot format all at once.

**Where it landed:** `scripts/sim-runtime.cjs`,
`tests/protocol-runtime.cjs`, and `tests/suite-manifest.cjs`.

**Door status:** Closed for claiming snapshot rebase is live. Open for wiring
`SimSnapshotRing` around produced snapshots after event watermarks have stayed
stable through the authority lane.

## 2026-07-04 — Movement fixtures pin server drive math before deeper migration

**Decision:** Extract the deterministic server movement drive/brake/integrate
phases into a shared module and pin their numeric behavior with golden fixtures.
The authoritative loop still owns external forces and consequences around that
core: wells, slingshot, stars, planetoids, waves, scavenger bump, pickup,
extraction, signal, and death.

**Why:** Ballpark and future ECS-shaped work should not accidentally retune
movement. A small shared movement core gives tests and the live sim one source
for delta-v burn, current coupling, braking, regen, drag, speed clamp, and
world wrapping while leaving subjective feel changes to explicit tuning commits.

**Where it landed:** `scripts/sim/player-movement-step.cjs`,
`scripts/sim-runtime.cjs`, `tests/movement-golden.cjs`, and
`tests/suite-manifest.cjs`.

**Door status:** Closed for moving more movement logic without a fixture.
Open for adding well/slingshot/external-force golden cases as the next movement
extraction slice.

## 2026-07-04 — Wreck pickup is the first Ballpark consequence adapter

**Decision:** Move wreck pickup candidate selection to Ballpark nearest queries
first, while leaving the actual loot transfer, `wreck.looted` mutation, signal
spike, and `player.loot` event in the existing authoritative runtime path.

**Why:** Pickup has the smallest consequence surface: no run-ending state, no
death edge cases, and no renderer-owned behavior. It is still meaningful enough
to prove the v0.3 pattern of "Ballpark supplies candidates; the sim commits the
gameplay fact."

**Where it landed:** `scripts/sim-runtime.cjs`,
`tests/ballpark-pickup.cjs`, and `tests/suite-manifest.cjs`.

**Door status:** Closed for migrating additional consequence families without
their own outcome tests. Portal extraction candidate selection subsequently
moved to Ballpark; final availability, capture, escape, and result consequences
remain sim-owned.

## 2026-07-04 — Nearest parity before first consequence migration

**Decision:** Treat nearest well, wreck, and portal Ballpark helpers as
parity-gated infrastructure before letting them change live gameplay outcomes.
The test harness now compares legacy nearest selection against
`collectNearestBodies()` for normal and toroidal wrap cases, while pickup,
extraction, death, and movement consequences stay on the existing runtime paths.

**Why:** Nearest selection is small enough to prove precisely and central
enough to break several systems if it drifts. Locking selection parity first
lets v0.3 migrate wreck pickup, portal capture, and well contact one family at
a time without smuggling in coordinate or lifecycle changes.

**Where it landed:** `tests/ballpark-queries.cjs` and
`scripts/sim/ballpark-mirror.cjs`.

**Door status:** Closed for live-wiring nearest helpers without family-specific
outcome tests. Open for migrating wreck pickup first, because it is the lowest
risk consequence family once candidate selection is proven.

## 2026-07-03 — Ballpark relevance before Ballpark consequences

**Decision:** Let the v0.3 Ballpark mirror answer read-only relevance queries
before it owns gameplay consequences. Live sim relevance for stars, wrecks,
planetoids, and non-dying scavengers now routes through `scripts/sim/sim-queries.cjs`
and the mirrored `SpatialIndex`. Normal snapshots remain unchanged, and
movement, collision, pickup, extraction, death, signal, and renderer projection
still use the existing authoritative runtime paths.

**Why:** Relevance is the safest first query migration because it reduces
hand-rolled per-category scans without deciding whether the player died,
looted, extracted, or moved. It also gives useful broadphase/query stats while
the mirror is still rebuild-based and observational.

**Where it landed:** `scripts/sim/sim-queries.cjs`,
`scripts/sim-runtime.cjs`, `scripts/sim/ballpark-mirror.cjs`,
`tests/ballpark-queries.cjs`, `tests/suite-manifest.cjs`, and
`docs/v0.3/ROADMAP.md`.

**Door status:** Closed for migrating consequence checks by implication. Open
for the next explicit parity-gated query family: nearest well/portal/wreck,
then pickup/extraction/contact only after the test harness proves equivalent
outcomes.

## 2026-07-02 — Ballpark enters runtime as a mirror before authority

**Decision:** Wire the v0.3 Ballpark kernel into the live sim as an
observational mirror first. The mirror rebuilds `BodyRegistry` and
`SpatialIndex` state from the current v0.2 runtime arrays/maps and exposes
stats through health/debug endpoints, but normal snapshots, movement, collision,
pickup, extraction, death, signal, and renderer projection remain owned by the
existing authoritative sim paths until parity tests exist for each migration
lane.

**Why:** This gives the branch structural truth without creating duplicate
gameplay truth. Agents can now inspect body counts, categories, lifecycle,
masks, broadphase stats, duplicate ids, and skipped bodies while the current
demo protocol remains stable. It also creates a safe stepping stone for moving
one interaction family at a time onto shared body/query helpers.

**Where it landed:** `scripts/sim/ballpark-mirror.cjs`,
`scripts/sim-runtime.cjs`, `tests/ballpark-mirror.cjs`,
`tests/suite-manifest.cjs`, `package.json`, and
`docs/design/TEST-HARNESS.md`.

**Door status:** Closed for making Ballpark authoritative by implication.
Open for migrating individual gameplay lanes after each lane has parity tests
and a clear removal/demotion path for the old helper.

## 2026-07-01 — Branch by version line, not by convenience

**Decision:** Treat `main` as the current v0.2 demo/public build line and keep
larger next-version work on a dedicated integration branch. For the current
cycle, `codex/v0.3-ballpark-roadmap` is the active v0.3 branch. Small demo
fixes land on `main`; structural v0.3 work lands on the v0.3 branch or
short-lived children; `main` merges forward into v0.3 regularly; v0.3 does not
merge back until Greg explicitly calls the promotion.

**Why:** LBH now has two different risks. The public/demo build needs frequent
small fixes without absorbing architecture churn. The v0.3 Ballpark/snapshot/
renderer-contract work needs room to move fast without destabilizing the build
Greg may show this weekend. Branching by version line makes that split obvious
to agents and keeps handoffs honest.

**Where it landed:** `docs/project/BRANCHING-AND-RELEASE-LINES.md`,
`docs/project/JAM-CONTRACT.md`, and local agent instructions.

**Door status:** Closed for casual large refactors directly on `main` while a
public/demo line is active. Open for narrow cherry-picks from next-version work
when the fix independently helps the current demo.

## 2026-07-01 — v0.3 Ballpark work branches away from v0.2 demo fixes

**Decision:** Plan v0.3 as a branch-first structural release centered on
Ballpark Lite sim authority, ECS-ready data shape, stamped events, snapshot
watermarks, replication lanes, renderer contracts, and harness gates. Keep
`main` focused on v0.2 demo fixes and weekend-build polish. The initial
planning branch is `codex/v0.3-ballpark-roadmap`.

**Why:** The v0.2 line is close enough to demo that it should not absorb a
large architectural migration while Greg is trying to show the build. At the
same time, the Carbon Engine read and recent sim/renderer audits point to a
real structural next step: stop letting dynamic bodies, contacts, snapshots,
events, and renderer projection live as scattered game-jam loops. v0.3 should
install production-style contracts without prematurely adopting Carbon, a full
ECS, a generic physics engine, or native runtime work.

**Where it landed:** `docs/v0.3/README.md`, `docs/v0.3/ROADMAP.md`,
`docs/v0.2/ROADMAP.md`, and `docs/project/ROADMAP.md`.

**Door status:** Closed for doing v0.3 structural migration directly on `main`.
Open for small v0.2 fixes on `main`, then merging those fixes forward into the
v0.3 branch.

## 2026-07-01 — Carbon Engine is reference material, not a migration target

**Decision:** Mine CCP's open-source Carbon Engine repos for durable patterns,
not dependencies. The useful LBH transfers are stamped sim authority,
snapshot/rebase tests, relevance lanes, explicit render-pass contracts,
material/asset manifests, profiler surfaces, and audio/VFX budgets. Carbon,
Destiny, Trinity, Blue, and Wwise are not v0.2 runtime adoption targets.

**Why:** Carbon is a mature C++/Python MMO stack with EVE-specific movement,
visibility, topology, backend, and build assumptions. LBH's current direction is
Three-first, server-authoritative local/web/Deck play with renderer-neutral sim
events. Copying Carbon's machinery would slow the project down; borrowing its
contracts makes LBH easier to debug, port, and scale.

**Where it landed:** `docs/reference/CARBON-ENGINE-RESEARCH.md`,
`docs/project/EVE-ARCHITECTURE-RESEARCH.md`, `docs/v0.2/README.md`, and
`docs/project/ROADMAP.md`.

**Door status:** Closed for direct Carbon/Trinity adoption in v0.2. Open for
Carbon-informed follow-up tickets: sim action journal, snapshot/rebase harness,
render-plan descriptor, material registry, route graph fixture,
asset/capture manifests, and audio priority budgets.

## 2026-06-28 — Command buttons separate actions from input affordances

**Decision:** Command-button labels are action labels only. Keyboard/controller
affordances render as smaller support text below the button, using the active
input mode from `src/ui/input-prompts.js`. Examples: button label `BEGIN DROP`
with subprompt `A begin drop` on Deck, or `Space begin drop` on keyboard.

**Why:** Fusing prompts into labels (`SPACE BEGIN DROP`, `A RETURN HOME`) makes
the button harder to scan, reads keyboard-first on Deck, and fights Steam
Input's action-oriented presentation. The player should learn the command first
and the current input binding second.

**Where it landed:** `src/ui/canvas-primitives.js`, `src/ui/motion.js`,
`src/main.js`, `src/run-results.js`, `tests/ui-primitives.cjs`,
`tests/ui-motion.cjs`, `tests/steam-deck-compat.cjs`,
`docs/design/UI-VISUAL-SYSTEM.md`, `docs/reference/STEAM-DECK-RUNBOOK.md`, and
`docs/reference/DEPLOY-TO-DECK.md`.

**Door status:** Closed for command buttons. Open for future Steam Input glyph
art, where the subprompt may become an icon+text row instead of plain text.

## 2026-06-28 — UI readability lands before more motion polish

**Decision:** Treat static composition, token brightness, local backing, and
couch readability as prerequisites for additional UI motion or VFX on a screen.
Plain-left remains the shipped v0.2 title layout, while opposite-left stays as a
comparison/taste challenger. The next UI visual slice is Home, then Map Select;
new VFX families wait until those per-loop surfaces read clearly.

**Why:** Orrery's visual review agreed that the visual direction holds, but
flagged sequencing drift: title and results received real composition work,
while Home and Map Select received timing polish over weaker static reads. Motion
can sell a surface that already reads, but it cannot rescue dim actions,
unbacked text over fabric, or missing hierarchy.

**Where it landed:** `docs/project/reviews/2026-06-28-orrery-visual-review.md`,
`docs/design/UI-VISUAL-SYSTEM.md`,
`docs/project/UI-VISUAL-PASS-PLAN.md`,
`docs/project/THREE-VFX-PASS-PLAN.md`, `docs/v0.2/ROADMAP.md`,
`docs/project/ROADMAP.md`, and the UI harness docs.

**Door status:** Closed for ordering. Open for Greg's taste call on whether
plain-left or opposite-left becomes the long-term title composition.

## 2026-06-28 — v0.2 roadmap uses reviewable slices

**Decision:** Organize the next v0.2 work around six reviewable slices instead
of only system buckets: Attract Mode + UI/VFX Identity, Feel + Route Pass,
Entity Visual Language, Loop + Meta Clarity, Playable Build Targets, and
Process + Harness.

**Why:** The project now has enough systems that "renderer," "UI," "sim," and
"platform" buckets hide the player-facing question. The day-shift/night-shift
cadence works better when each pass ends in something Greg can play, capture,
or compare. System roadmaps remain the implementation ledger, but the slice is
the unit of review.

**Where it landed:** `docs/v0.2/ROADMAP.md`, `docs/project/ROADMAP.md`,
`docs/project/UI-VISUAL-PASS-PLAN.md`,
`docs/project/THREE-VFX-PASS-PLAN.md`, and this decision log.

**Door status:** Closed for v0.2 planning cadence. Open for exact weekly
ordering as playtest feedback shifts priority.

## 2026-06-28 — Deck compatibility is a first-class UI contract

**Decision:** Treat Steam Deck compatibility as a dedicated presentation mode,
not only as a Linux packaging target. The Deck launcher passes `deck=1`, the UI
routes visible prompts through action-based helpers, and the HUD keeps
handheld/couch minimums for text, gauges, panel backing, and bottom-left stack
spacing.

**Why:** The game could boot on Deck while still presenting keyboard-first copy,
hairline fuel bars, and overlapping HUD clusters. That fails the actual SteamOS
play surface even if the executable is healthy. Centralizing prompts and sizing
rules lets local browser, packaged desktop, and Deck tests share one contract.

**Where it landed:** `src/ui/input-prompts.js`, `index-a.html`, `src/hud.js`,
`src/main.js`, `src/run-results.js`, `desktop/electron-main.cjs`,
`tests/steam-deck-compat.cjs`, and the Steam Deck runbooks.

**Door status:** Closed for v0.2 prompt/layout ownership. Open for true native
16:10 playfield support, Steam Input action-set artwork, and a final visual
brand pass.

## 2026-06-28 — UI motion can trigger VFX, but UI keeps the truth

**Decision:** Reframe the UI motion pass as a two-layer contract. DOM/canvas UI
motion owns screen state, focus, hierarchy, text reveal, panel expansion, and
reduced-motion fallbacks. Three VFX may respond to approved UI events such as
`titleGlyphFault`, `launchTransition`, `portalTransition`,
`collapseReportFault`, `inhibitorUiFault`, and `commandConfirmPulse`, but those
effects are accents around readable UI, not the source of navigation or state
truth.

**Why:** The new VFX plan can make the title, launch, extraction, collapse, and
Inhibitor moments feel much more alive, but the UI style pass is deliberately
about contrast and couch readability. If every hover, tab, prompt, and number
emits particles, VFX becomes noise and the UI loses authority. Keeping normal
menu motion pure UI while allowing a few ritual moments to echo into Three
preserves both directions.

**Where it landed:** `docs/design/UI-VISUAL-SYSTEM.md`,
`docs/project/UI-VISUAL-PASS-PLAN.md`,
`docs/project/THREE-VFX-PASS-PLAN.md`, and this decision log.

**Door status:** Closed for the ownership split. Open for exact animation
timing, first VFX event payloads, and whether the title wordmark eventually
moves into Three after the behind-canvas bridge is tested.

## 2026-06-28 — Three VFX uses renderer-neutral events

**Decision:** Build the v0.2 VFX kit in Three.js for the current PC/web/Steam
Deck path, but describe every effect through renderer-neutral events such as
`thrusterBurst`, `titleGlyphFault`, `portalCollapse`, `pickupGlint`, and
`inhibitorScreenFault`. The Three renderer can implement those events with
pooled particles, instancing, additive sprites, screen-space passes, or future
text surfaces, but particles and materials never own gameplay truth.

**Why:** Three is the right near-term tool for making the default renderer rich
and motionful, but future Switch/iPad/native/console paths should port the
behavior and visual contract, not inherit the literal Three scene graph. This
lets the web/Deck version become the visual reference while preserving the
sim/client/renderer separation that makes later ports possible.

**Where it landed:** `docs/project/THREE-VFX-PASS-PLAN.md`,
`docs/design/THREE-SCENE-VISUAL-HIERARCHY.md`,
`docs/design/THREE-ENTITY-VISUALS.md`, and `docs/project/ROADMAP.md`.

**Door status:** Closed for the VFX architecture stance. Open for exact first
implementation details: whether title particles stay behind canvas text or
promote the title wordmark into Three, which fixture owns VFX review, and which
fullscreen shader impulse earns a prototype.

## 2026-06-28 — Title screen becomes an attract loop, not a static logo

**Decision:** Treat the title screen as a short looping attract-mode scene. The
wordmark keeps a strong clean bone/cyan base and uses brief Inhibitor-pink
corruption bursts as disturbances, not as the default title color. Title-scale
bursts use a glyph-slot overlay rather than mutating the title text: intensity
means more glyph slots flicker and the swaps happen more often. Subtitles,
status copy, and the primary CTA stay clean and locally backed. The live title
map should carry some story with a larger central well, peripheral readable
objects, and a repeatable rift wink.

**Why:** The title is a product read, not just navigation. It should show the
ASCII fabric, cosmic object language, and dread tone before the player starts a
run. At the same time, the first action must remain couch-readable, so
corruption belongs only to identity text and not to prompts or menu decisions.
Keeping the resting title clean also preserves the new base aesthetic instead
of making the anomaly color feel normal.

**Where it landed:** `src/main.js`, `src/maps/title-screen.js`,
`src/maps/renderer-fixtures.js`, `src/text-corruption.js`,
`tests/text-corruption.cjs`, `tests/ui-visual.cjs`,
`docs/design/UI-VISUAL-SYSTEM.md`,
`docs/project/UI-VISUAL-PASS-PLAN.md`, and the test-harness docs.

**Door status:** Closed for the title corruption boundary, clean-resting
wordmark rule, and glyph-overlay model. Open for exact object density,
wordmark art, and future title-loop beats after fresh captures.

## 2026-06-28 — UI rebuild starts with shared primitives, not a framework jump

**Decision:** Keep the current v0.2 UI ownership split while rebuilding the
visual language: DOM remains responsible for live HUD/dev surfaces, and canvas
remains responsible for title, profile, menus, map select, pause, and run
results. Add a shared `src/ui/canvas-primitives.js` kit before migrating
screens, then add a UI-focused visual harness with deterministic captures and
couch-proxy outputs.

**Why:** The current UI is already wired into input, game state, and the test
API. A framework rewrite would delay the visual/readability work we actually
need. Shared primitives give menus and results one role-color/focus/backing
vocabulary now, while the harness gives future changes a repeatable way to
check whether the player can read the decision.

**Where it landed:** `docs/project/UI-VISUAL-PASS-PLAN.md`, this decision log,
`src/ui/canvas-primitives.js`, `src/run-results.js`,
`tests/ui-primitives.cjs`, `tests/ui-visual.cjs`, `tests/suite-manifest.cjs`,
and `package.json`. The first implementation slice is live for shared canvas
primitives, result-screen migration, and baseline UI captures.

**Door status:** Closed for the next UI implementation slice. Open later if
text-heavy menus become painful enough to justify moving them to DOM or another
UI layer.

## 2026-06-28 — UI uses role color, local contrast, and the couch test

**Decision:** Treat UI readability as part of the v0.2 visual contract. The UI
uses the same role palette as the Three scene, with black void and translucent
blue-black panels as the base; cyan for player/flow/tech; amber for value;
red for direct danger; magenta/violet for anomaly/Inhibitor; and bone-white for
primary text. Major screens must pass a couch read, not only a desktop monitor
read.

**Why:** LBH is supposed to be dark, but the player still needs to make fast
decisions. The entity pass already established "dark scene, punchy
affordances." Menus, HUD, map select, and results need the same rule so UI
mood does not become squinting. The couch test gives future reviews a plain
language gate: if the screen, selected action, danger state, and next input
cannot be read from across the room, the hierarchy is wrong.

**Where it landed:** `docs/design/UI-VISUAL-SYSTEM.md`,
`docs/reference/UI-MOODBOARD.md`, `docs/project/UI-VISUAL-PASS-PLAN.md`,
`docs/reference/target-visuals/2026-06-28-ui/`,
`docs/design/DESIGN-SYSTEM.md`, `docs/v0.2/DESIGN.md`,
`docs/v0.2/ROADMAP.md`, `docs/project/ROADMAP.md`,
`src/ui/design-tokens.js`, and `index-a.html`.

**Door status:** Closed for the UI visual contract. Open for implementation:
canvas UI primitives, screen rebuilds, UI visual harness coverage, and exact
color/size tuning after live captures.

## 2026-06-27 — Typography roles use Oxanium and Monaspace

**Decision:** Use Oxanium for title-scale headings and Monaspace as the
primary UI/data/glyph voice. The ASCII atlas uses Monaspace first and bundled
Noto Sans Mono / Noto Sans Symbols as fallback coverage for math, symbol, box
drawing, and combining-mark edge cases.

**Why:** Oxanium matches the sci-fi title direction without forcing a display
font into dense HUD data. Monaspace feels native to LBH's terminal/ASCII
identity and gives the UI, entity labels, and shader glyphs one instrument.
Noto should protect the weird alphabet, not replace Monaspace as the visual
target.

**Where it landed:** `assets/fonts/`, `index-a.html`,
`src/ui/typography.js`, `src/ui/design-tokens.js`, canvas overlay callers,
the ASCII atlas generator, and `tests/typography.cjs`.

**Door status:** Closed for the v0.2 typography roles. Open for a future
wordmark and for adding a browser-level runtime glyph coverage probe if a
target platform renders tofu despite the bundled fallbacks.

## 2026-06-27 — Inhibitor can corrupt language, but only in bounded surfaces

**Decision:** Use Zalgo-style combining marks as an Inhibitor-owned HUD effect
for the Inhibitor form label and Inhibitor-origin event warnings. Do not apply
it globally to timers, fuel, cargo counts, inventory, or normal prompts.

**Why:** The Inhibitor should feel like a wrong alphabet entering the UI, but
the game still needs readable operational information. Bounded corruption gives
us dread and a live-tunable aesthetic without turning play-critical text into
noise or creating unbounded DOM strings.

**Where it landed:** `src/text-corruption.js`, `src/hud.js`, `src/main.js`,
`src/config.js`, `src/dev-panel.js`, `index-a.html`,
`tests/text-corruption.cjs`, and `tests/validation.cjs`.

**Door status:** Closed for global corruption. Open for adding more
Inhibitor-specific surfaces, provided they use the same bounded helper and keep
plain source text recoverable.

## 2026-06-27 — Player ship asset choice needs a fixture bakeoff

**Decision:** Keep the player ship sprite-card versus pixel-textured
top-down mesh comparison in a renderer fixture named `shipBakeoff` until one
path wins at gameplay scale.

**Why:** The final ship family should be chosen from evidence, not taste in a
vacuum. Both candidates need the same contact matte, rim, scale, and noisy
ASCII background so the comparison answers the real question: which path reads
best in LBH's actual scene stack?

**Where it landed:** `src/maps/renderer-fixtures.js`,
`src/render-three/visual-style.js`, `src/render-three/three-renderer.js`,
`src/main.js`, `tests/renderer.cjs`, `docs/design/THREE-ENTITY-VISUALS.md`,
`docs/project/THREE-ENTITY-VISUAL-PASS-PLAN.md`, and renderer harness docs.

**Door status:** Open for art direction. Closed for process: future ship asset
work should update the bakeoff before replacing the live player hull.

## 2026-06-27 — Pre-ASCII scene captures are debug artifacts

**Decision:** Treat `rendererView: "scene"` captures as raw pre-ASCII shader
diagnostics only. The final ASCII/post view is the visual target for
`visualReference`, promo review, and player-facing capture.

**Why:** The raw scene path bypasses glyph quantization and can produce smooth,
hot, rainbowed well bands that are useful for diagnosing shader input but
misleading as art direction. LBH's product identity still lives in the ASCII
fabric and the readable entity layers above it.

**Where it landed:** `tests/renderer.cjs`, `docs/reference/RENDERER-HARNESS.md`,
`docs/reference/TEST-HARNESS.md`, `docs/design/TEST-HARNESS.md`, the LBH social
screenshot skill, and its capture script.

**Door status:** Closed for default captures. Open for tuning the raw scene
debug view if it stops explaining useful shader-input problems.

## 2026-06-27 — visualReference is a validation scene, not a promo scene

**Decision:** Keep `visualReference` out of default promo/social captures, but
include it in the default renderer harness as a coarse contrast and readability
gate. The scene is a dev-only lineup for comparing object families against the
ASCII fabric and final post stack.

**Why:** Player-facing builds still need real title/gameplay/result smoke, but
the reference scene catches a different class of bug: an entity family can
render, submit the right layer, and still disappear against bright fabric or
post-processing. This is especially important while non-fluid objects are still
bridge primitives and the art direction is moving toward stronger silhouettes.

**Where it landed:** `tests/renderer.cjs`, `src/test-api.js`, `src/main.js`,
`src/render-three/three-renderer.js`, `src/render-three/visual-style.js`,
`docs/reference/RENDERER-HARNESS.md`, `docs/design/TEST-HARNESS.md`, and
`docs/reference/TEST-HARNESS.md`.

**Door status:** Closed for the harness role. Open for tuning thresholds,
sampling strategy, and which object families join the reference scene as new
assets and mechanics land.

## 2026-06-27 — Promo captures stay representative

**Decision:** Default LBH promo captures should use player-reachable material:
the warmed title screen, live gameplay, and run-result/death frames. Custom
renderer fixtures and entity arrays belong in explicit reference passes such as
`visualReference`, not in the default social handoff.

**Why:** The latest high-quality batch exposed a useful distinction. Fixture
shots are excellent for reviewing readability and entity language, but they can
look like bespoke maps or staged compositions when presented as promo images.
Social/store captures need to tell the truth about the actual game screen.

**Where it landed:** `src/maps/renderer-fixtures.js`,
`tests/renderer.cjs`, `docs/reference/RENDERER-HARNESS.md`,
`~/.codex/skills/lbh-social-screenshot-pass/SKILL.md`, and the social capture
script's `--reference-only` / `--include-reference` modes.

**Door status:** Closed for default promo capture policy. Open for expanding
the reference scene as new entity families and asset treatments land.

## 2026-06-26 — Substantial LBH sessions write memory checkpoints

**Decision:** After any substantial Last Black Hole / Last Singularity Codex
session, write one concise memory checkpoint note under
`~/.codex/memories/extensions/ad_hoc/notes/`.

**Why:** LBH repo docs have stayed current, but Codex memory is a separate
routing layer. Without regular checkpoints, future sessions can miss recent
context and spend time rediscovering repo state, build status, and current
architecture decisions. Memory should point agents to the right current docs and
commands first; repo docs remain the source of truth.

**Where it landed:** `AGENTS.md`, `docs/project/JAM-CONTRACT.md`, this decision
log, `docs/journal/CHANGELOG.md`, the personal `$lbh-forge-pass` skill, and the
ad-hoc memory note
`~/.codex/memories/extensions/ad_hoc/notes/20260626T173222-0700-lbh-memory-checkpoint.md`.

**Door status:** Closed for the daily habit. Open for tuning what counts as
"substantial" if memory notes become too noisy or too sparse.

## 2026-06-26 — Entity readability starts with backing and contrast

**Decision:** Start the visual target implementation by increasing contrast and
adding entity backings before replacing primitive shapes. Every important Three
entity should get a small local separation stack: transparent dark backing,
bright core, rim/halo, then later pixel-authored or pixel-textured top-down
asset surfaces.

**Why:** The current challenge is not only icon shape; complex objects need to
sit on top of a noisy ASCII fabric without disappearing into it. A backing pass
proves the z-depth/layering approach immediately and gives future pixel assets a
stable readability contract. Wrecks and other larger clusters should soften or
partially occlude the whole footprint underneath them, not draw a tiny symbol on
unmodified fabric.

**Where it landed:** `src/render-three/visual-style.js`,
`src/render-three/three-renderer.js`, `src/maps/renderer-fixtures.js`,
`tests/renderer.cjs`, `tests/suite-manifest.cjs`,
`docs/design/THREE-SCENE-VISUAL-HIERARCHY.md`, and
`docs/project/THREE-ENTITY-VISUAL-PASS-PLAN.md`.

**Door status:** Closed for first slice ordering. Open for tuning exact matte
opacity/radius, replacing bridge primitives with pixel surfaces, and deciding
which post-processing effects move into the eventual final combined pass.

## 2026-06-26 — Non-fluid objects move to a Three entity language

**Decision:** Treat the current Three entity primitives as bridge markers, not
final art direction. Wells and Inhibitors remain fabric-first because their
identity lives in the ASCII/fluid shader stack. Ships, stars,
planetoids/comets, wrecks, portals, rivals, fauna, sentries, slingshot
affordances, and future megastructures should move toward a coherent
Three-owned object language.

**Why:** The Three migration made the scene graph real, but several objects now
look like simple vector leftovers sitting on top of the richer fabric. The fix
is not to abandon the flat top-down view or make realistic spaceship models. The
fix is tiny, readable, higher-fidelity scene objects with shared silhouettes,
materials, trails, and affordances.

**Where it landed:** `docs/design/THREE-ENTITY-VISUALS.md`,
`docs/v0.2/DESIGN.md`, `docs/v0.2/ROADMAP.md`,
`docs/v0.2/DESIGN-CODE-DELTA.md`, `docs/project/ROADMAP.md`,
`docs/project/BUILD-PLAN.md`, `docs/project/BACKLOG.md`, and
`docs/project/THREEJS-MIGRATION-PLAN.md`.

**Door status:** Closed for v0.2 visual direction. Open for implementation
details: hand-authored sprites versus generated pixel masks versus
pixel-textured top-down meshes, how much hull-specific silhouette ships need,
and which object effects should also bite into the ASCII fabric.

## 2026-06-26 — Three scene hierarchy is dark-first, not low-contrast

**Decision:** Treat black space as the dominant visual field while requiring
bright, deliberate contrast affordances for anything the player must read:
contact mattes, rim shells, halos, local backplates, brighter object colors, and
clean HUD surfaces. The renderer hierarchy should run from black void through
ASCII fabric, semantic lanes, entity layers, near-camera atmosphere, global post,
and HUD.

**Why:** The current screenshots prove that the ASCII fabric can be beautiful
and too high-frequency at the same time. Keeping the void scary is correct, but
dark-on-dark icons and subtle low-saturation colors make the game feel like it
requires squinting. The right direction is a dark scene with punchy local reads.

**Where it landed:** `docs/design/THREE-SCENE-VISUAL-HIERARCHY.md`,
`docs/design/THREE-ENTITY-VISUALS.md`,
`docs/project/THREE-ENTITY-VISUAL-PASS-PLAN.md`,
`docs/reference/THREE-ENTITY-MOODBOARD.md`, `docs/v0.2/README.md`,
`docs/v0.2/ROADMAP.md`, and `docs/project/ROADMAP.md`.

**Door status:** Closed for v0.2 visual hierarchy. Open for exact brightness,
bloom, matte, and halo tuning after the style kit exists.

## 2026-06-26 — Entity assets stay pixel-resolved

**Decision:** Discrete entity assets, including player ships and enemy ships,
must be either 2D pixel assets or simple 3D assets with pixelated top-down
textures. Directional lighting, parallax, post-processing, bloom, trails, and
depth staging are allowed, but the visible asset surface should not become
smooth low-poly, glossy miniature, or vector-clean generic 3D. Octopath-style
depth-of-field is not the recipe; the useful vibe is pixel surfaces inside a
modern staged scene.

**Why:** LBH can raise fidelity through Three scene staging without abandoning
its pixel/ASCII heritage. Heavy DOF works for dense scenic dioramas, but LBH's
black negative space would usually become blurred emptiness. The better depth
tools here are parallax, contrast pockets, source-driven glow, lens flecks,
restrained bloom, CRT treatment, and sharp pixel-readable entity surfaces.

**Where it landed:** `docs/design/THREE-ENTITY-VISUALS.md`,
`docs/design/THREE-SCENE-VISUAL-HIERARCHY.md`,
`docs/project/THREE-ENTITY-VISUAL-PASS-PLAN.md`,
`docs/reference/THREE-ENTITY-MOODBOARD.md`, `docs/v0.2/DESIGN.md`, and
`docs/reference/target-visuals/2026-06-26/README.md`.

**Door status:** Closed for v0.2 entity asset direction. Open for deciding
which first pass uses hand-authored sprites, generated pixel masks, or
pixel-textured top-down meshes.

## 2026-06-26 — Silhouette carries category before affiliation

**Decision:** Treat strong, well-differentiated silhouettes as a visual pillar
for non-fluid entity categories. The first read is broad category: ship, threat,
loot/wreck, route anchor, ecology, or anomaly/Inhibitor. Friend/foe/neutral,
hull subtype, urgency, and state are layered through color, halo, trail, motion,
and state accents inside those categories.

**Why:** LBH's background is intentionally dark, noisy, and alive, but the
player-ship footprint is small enough that one outline cannot honestly carry
category, affiliation, state, and five hull subtypes at once. If entity shape
language is weak, brighter colors alone will still collapse into confusing
glow. If shape language is overloaded, it will fail at Deck scale. The honest
read order is category first, then affiliation/state through the rest of the
separation stack.

**Where it landed:** `docs/design/PILLARS.md`,
`docs/design/THREE-ENTITY-VISUALS.md`,
`docs/design/THREE-SCENE-VISUAL-HIERARCHY.md`,
`docs/project/THREE-ENTITY-VISUAL-PASS-PLAN.md`, and `docs/v0.2/DESIGN.md`.

**Door status:** Closed for read order. Open for exact category silhouettes,
color/halo/trail affiliation cues, and hull subtype treatment after the player
ship asset bake-off.

## 2026-06-25 — Build versions use public train plus commit hash

**Decision:** Use `major.minor.public.commit` for LBH build identifiers.
`package.json.version` stores the public train (`0.2.x`). Build, release, and
deploy scripts compute the full build version as `0.2.x.<current-git-hash>`.
Internal handoff builds consume the hash field automatically. Public releases
advance the third number only when Greg calls it. Large `0.3` or `1.0` moves are
also Greg-call milestones only.

**Why:** A numeric fourth counter creates bookkeeping without adding much truth.
The commit hash is the real internal build identity, and a committed file cannot
contain its own future commit hash. Keeping the hash computed at build time makes
artifacts traceable while preserving a human-controlled public release train.

**Where it landed:** `scripts/version.cjs`, `scripts/release.cjs`,
`scripts/build.cjs`, deploy scripts for Deck/itch/Steam, iOS wrapper metadata,
README build instructions, `docs/reference/BUILD-PIPELINE.md`,
`docs/reference/DEPLOYMENT-PIPELINES.md`, and
`docs/project/JAM-CONTRACT.md`.

**Door status:** Closed for v0.2 build identity. Open only for future public
release-channel rules once website/itch/Steam publishing is real.

## 2026-06-25 — v0.2 patch numbers are temporary build-train counters

**Decision:** Keep `0.2.x` as a practical v0.2 remote-build counter while LBH is
still using a lightweight local CI/build discipline. Real build or milestone
handoff pushes should still run `npm run release:patch`. Intentional
docs/process-only pushes that do not publish a build may skip the guard with
`LBH_SKIP_RELEASE_PREP=1`.

**Why:** A single commit does not always deserve a public version increment, but
LBH does not yet have a public playable location whose release cadence needs
stricter semantics. Right now the higher-value invariant is that remote build
handoffs carry a visible patch number and complete artifacts. Once there is a
website, itch page, or Steam branch where people can actually play, local build
IDs and public release versions should split.

**Where it landed:** `scripts/release.cjs`, README build instructions,
`docs/reference/BUILD-PIPELINE.md`, and `docs/project/JAM-CONTRACT.md`.

**Door status:** Closed for private v0.2 build-train policy. Open for replacing
it with separate CI build IDs and public release versions once LBH has a public
playable channel.

## 2026-06-25 — Remote handoff pushes require a v0.2 patch build

**Decision:** Treat `0.2.x` as the v0.2 release/handoff train. Before pushing a
real build or milestone handoff to `origin`, run `npm run release:patch`. The
helper increments `package.json` and `package-lock.json`, runs the fast gate,
builds every release target (`web,ipad,mac,win,linux`), stages weekly assets,
and verifies the output shape. The tracked pre-push hook runs a non-mutating
guard so pushes fail if the patch version is not ahead of upstream or the
matching all-target build is missing.

**Why:** The repo had enough build/deploy surfaces that "build it" was becoming
ambiguous. A remote push should carry a visible patch number and a real artifact
set, not just source changes plus hope. The hook refuses to mutate during push
because changing package files mid-push would make the commit being sent
different from the working tree.

**Where it landed:** `scripts/release.cjs`, `.githooks/pre-push`,
`package.json`, `package-lock.json`, README build instructions,
`docs/reference/BUILD-PIPELINE.md`, `docs/reference/DEPLOYMENT-PIPELINES.md`,
and `docs/project/JAM-CONTRACT.md`.

**Door status:** Closed for v0.2 handoff policy. Open for replacing the local
hook with a CI-required check once public release cadence hardens.

## 2026-06-25 — Local build status is separate from build health

**Decision:** Add `docs/project/BUILD-STATUS.md` as the canonical local
playability snapshot and make agents check it before reconstructing status from
memory, chat, or `git log`. `BUILD-HEALTH.json` remains the formal automated
health record for a specific commit, while `stack:status` remains live process
health only.

**Why:** The Three/authority migration produced a long sequence of real fixes,
but the tracked build-health record stayed stale and the old project board still
described March L0 work. That made "what does the local build do right now?"
ambiguous: git history proved work happened, but there was no concise current
playability answer. Stale memory should not become stale project truth.

**Where it landed:** `docs/project/BUILD-STATUS.md`,
`docs/project/BUILD-HEALTH.md`, `docs/project/JAM-CONTRACT.md`,
`docs/design/TEST-HARNESS.md`, `docs/project/PROJECT-STATE.json`,
`docs/project/PROJECT-BOARD.md`, and `docs/project/ROADMAP.md`.

**Door status:** Closed for process shape. Open for automating a status prompt
or verifier once the manual status format proves stable.

## 2026-06-25 — Forge pass audits contracts; daily tests enforce them

**Decision:** Keep the everyday harness and `$lbh-forge-pass` separate. Daily
test lanes catch known regressions quickly. The Forge pass is an occasional
architecture hygiene pass that asks whether code, comments, docs, central
helpers, and tests still match current v0.2 LBH truth.

**Why:** Turning the Forge pass into "run more tests" would duplicate the
harness while missing the real risk after major shifts: stale assumptions,
client-only authority, obsolete docs, old comments, orphaned code, and tests
that still protect superseded behavior.

**Where it landed:** Personal Codex skill
`~/.codex/skills/lbh-forge-pass`, `docs/design/TEST-HARNESS.md`,
`docs/project/JAM-CONTRACT.md`, and `docs/journal/CHANGELOG.md`.

**Door status:** Closed for process boundary. Open for tightening the skill
after real passes expose recurring blind spots.

## 2026-06-25 — Matches are finite authority sessions, not forever sims

**Decision:** A live match ends when the last human pilot is terminal or when
the configured run cap expires. The authoritative sim preserves run results and
health visibility for a short grace window, but the tick loop stops after
session end. Post-schedule wreck repeats are disabled by default and only exist
as a bounded tuning/stress option.

**Why:** LBH runs are fresh maps. Leaving a browser on a death, extraction, or
title/result surface should not keep world growth, wreck spawning, AI, fields,
and physics running for hours. Long-lived processes are still useful for
testing, but they should be explicit probes with health/memory evidence, not an
accidental product mode.

**Where it landed:** `scripts/sim-runtime.cjs`, `tests/sim-lifecycle.cjs`,
`docs/design/TEST-HARNESS.md`, and `docs/journal/CHANGELOG.md`.

**Door status:** Closed for v0.2 sim lifecycle. Open for tuning the terminal
grace window and any future multiplayer spectator/rematch flow.

## 2026-06-22 — iPad is a native Apple-platform bench, not just a wrapper

**Decision:** Treat iPad like Switch: a hardware and platform-competence bench.
The current Safari and `WKWebView` surfaces are useful first rungs, but the
purpose of the target is to get competent with SwiftUI, Metal, iOS lifecycle,
signing/provisioning, controller behavior, audio/WebKit limits, and handheld
Apple GPU performance.

**Why:** A wrapper-only iPad target would teach too little. LBH may never need a
full native production renderer, but we should learn the native shape before
making that call. As with Switch, the bench must consume shared LBH truth and
recorded snapshots before any gameplay logic is ported, or it risks becoming a
second game.

**Where it landed:** `docs/reference/IPAD-IOS-BUILD.md`,
`docs/reference/PLATFORM-TARGETS.md`, `docs/reference/BUILD-PIPELINE.md`,
`docs/reference/DEPLOYMENT-PIPELINES.md`, `README.md`, and the backlog's iPad
SwiftUI / Metal Bench Probe entry.

**Door status:** Open as a local native bench target. Closed as a wrapper-only
target.

## 2026-06-22 — Switch 1 is a port probe, not a desktop wrapper target

**Decision:** Do not try to carry the current Electron/Three/Node desktop
package directly onto Switch 1. Greg's Atmosphere-prepared Switch is a viable
private hardware test bench for renderer/input/performance probes, but the
probe should wait for engine-neutral snapshot, input, content, save, and
golden-sim contracts. The commercial/public path is still the official Nintendo
developer route.

**Why:** The expensive mismatch is runtime shape. The current app depends on
Chromium/Electron, Node authority processes, browser WebGL/DOM affordances, and
desktop packaging. Switch 1 needs a console-shaped client: likely one process,
native or constrained WebGL-like rendering, no DOM HUD, and a much stricter
handheld performance budget.

**Where it landed:** `docs/project/SWITCH1-ATMOSPHERE-FEASIBILITY.md`,
`docs/reference/PLATFORM-TARGETS.md`, and the backlog's Switch 1 Renderer Probe
entry.

**Door status:** Open as a local test-bench build target. Closed as a near-term
product packaging target.

## 2026-06-22 — Godot is a future console probe, not the default split

**Decision:** Do not make "Three.js for PC/web and Godot for console" the
default LBH platform plan. Steam Deck stays on the Three/Electron Linux package
for current playtesting. Godot is parked as a later feasibility probe once the
snapshot, input, content, save, and golden-sim contracts are portable enough
that Godot can act as a renderer shell instead of a second game.

**Why:** The expensive risk is not drawing LBH in Godot; it is preserving sim
truth. Porting movement, slingshot, signal, AI, inventory, run results, and
progression into Godot before the contract is engine-neutral would duplicate
the product and create drift.

**Where it landed:** `docs/project/GODOT-CONSOLE-FUTURE-INVESTIGATION.md` and
the backlog's Godot / Native Client Port Probe entry.

**Door status:** Open as a future Run It Twice probe. Closed as a default
platform split for v0.2 Deck work.

## 2026-06-22 — Three renderer is flat-view 3D, not a 2D copy target

**Decision:** The Three path should be a first-class 3D scene even when the game keeps its top-down, flat visual language. The current implementation uses an orthographic top-down camera, z-separated backdrop/fabric/foreground layers, pooled dynamic world meshes, motion-driven parallax, and a screen-space present pass. The Composer frame remains the ASCII/fabric source for now, but Composer and Three share `fluid-canvas` and a WebGL2 context; Three layers transparent scene output over the Composer frame without CPU canvas copies.

**Why:** LBH needs depth infrastructure for parallax, player-motion cues, screen-space effects, entity projection, and eventual Three-owned fluid/entity passes. Keeping the viewpoint flat protects readability and aesthetic continuity; making the scene graph real prevents every future visual upgrade from becoming another fullscreen shader special case.

**Where it landed:** `src/render-three/three-renderer.js`, `src/main.js` frame context, and `tests/renderer.cjs` scene-contract assertions for `sharedContext: true`, `canvasUploads: 0`, and pooled world meshes.

**Door status:** Closed for renderer direction. Open for tuning the amount of parallax, backdrop reveal, and which overlay/entity layers migrate from canvas to Three first.

## 2026-06-22 — Product launches use authority, sandbox launches say sandbox

**Decision:** `npm run stack:browser` now starts the local host stack rather than a browser-only client. Client-only play is still available as `npm run stack:sandbox`, but it is explicitly deprecated for renderer/debug use rather than treated as a product mode.

**Why:** The project direction is separate sim and client renderer processes. A convenient command named "browser" should not silently bypass authority and make client-only behavior look normal.

**Where it landed:** `package.json`, `scripts/stack.cjs`, `docs/reference/RUNTIME-MODES.md`, and `docs/reference/DEV-SERVER.md`.

**Door status:** Closed for public launcher naming. Open for removing the local `SimCore` fallback when the last harness/dev-only dependency is gone.

## 2026-06-22 — Slingshot authority is shipped, not deferred

**Decision:** Server-side slingshot resolution is no longer a deferred feature. Remote-authority presentation should render slingshot affordance/engagement/release from sim-owned snapshot state, while local prediction remains a sandbox/dev path.

**Why:** Slingshot is now part of movement identity. Leaving it client-only would make the primary runtime mode less expressive than local play and would hide multiplayer divergence under renderer polish.

**Where it landed:** Server/client authority tests and roadmap/backlog docs now treat slingshot as regression-watch and tuning work rather than missing architecture.

**Door status:** Closed for authority ownership. Open for playtest tuning and map redesign around routes.

## 2026-05-09 — Movement is an economy, not a free verb

**Decision:** Thrust is no longer free. The ship has a finite delta-v fuel resource that thrust drains and time refills. Brake converts from drag-add to a real reverse-thrust that costs delta-v at a smaller rate than forward (`brakeThrustScale: 0.4`, `brakeFuelScale: 0.6`). Drag drops 4× (0.06 → 0.015) so coasting actually preserves momentum.

**Why:** Pillar 2 ("Movement Is the Game") was quietly broken when there was no reason to ever release the gas. Currents and slingshots become flavor instead of strategy if thrust is free. Making thrust an economy gives every choice an economic dimension: fight current = pay, surf current = save, slingshot = gain.

**Where it landed:** `src/ship.js` step 2 / 2b, `src/config.js` ship section, `src/content/hulls.data.json` per-hull deltaV stats. Color-coded HUD gauge top-right. Velocity readout under the ship sprite as the sibling legibility fix.

**Door status:** Open for tuning — the numbers are first-pass and will need playtest iteration. Server-side movement parity is now regression-watch instead of a known architecture gap.

## 2026-05-09 — Slingshot is a designed feature, not emergent physics

**Decision:** Slingshotting off massive objects becomes an explicit verb with a button-press engagement model (skitching / Tony-Hawk grinding / Sonic-rails reference). Three-tier anchor catalog: wells (high reward, high risk), stars (medium / medium, time-limited by consumption), planetoids (low / low, moving). Per-anchor keyed snap-to ranges; chains are first-class (multiplicative bonus when re-engaging within `chainWindow` of a release).

**Why:** The previous behavior — gravitation curving your trajectory if you happened to fly past a well — was a *transitive consequence of forces*, not a feature. Players didn't know they had pulled one off and didn't get rewarded for doing it deliberately. Naming it as a verb and rewarding the maneuver lets map geometry become *route puzzle space*.

**Where it landed:** `docs/design/SLINGSHOT-NETWORK.md` is the design doc. `src/slingshot.js` is the implementation. Hull modifiers in `hulls.data.json` give each hull a route-style identity (Drifter specialist, Breacher brute-force, Resonant forgiving chains, Shroud silent slings, Hauler mass-penalized).

**Door status:** Open for tuning and map redesign. Server authority shipped on 2026-06-22, so future slingshot work should preserve sim-owned truth.

## 2026-05-09 — Single-source content via JSON instead of mirrored modules

**Decision:** The five content manifests (balance, items, signatures, session-profiles, hulls) move their data into `*.data.json` files in `src/content/`. Both the ESM browser side and the CJS Node sim import the same JSON. Drift on data is now structurally impossible.

**Why:** The mirrored ESM/CJS module pair was clean architecturally but tedious to maintain. Validation tests caught divergence at PR time, but PRs that touched one file and forgot the other failed unnecessarily. JSON-as-canonical removes the diff burden for ~90% of each file (the data) at the cost of duplicated 5-line helper functions (which validation still covers).

**Where it landed:** `src/content/*.data.json`, `src/content/*.js` (ESM wrappers), `scripts/content/*.cjs` (CJS wrappers). Project-wide `package.json` flipped to `"type": "module"`; Node-side files renamed `.js` → `.cjs`.

**Door status:** Closed for now. A future cleaner version would convert all of `scripts/` to ESM and remove the wrappers entirely, but the cost-benefit didn't justify it this session.

## 2026-04-13 — Runtime telemetry needs its own smoke canary

The harness has grown into a real multi-process operator surface, so telemetry can no longer be treated as an incidental nicety. The right move is not to bloat the basic client smoke test, but to add a dedicated telemetry smoke that boots the real control-plane/sim/client path and asserts the structured events we actually depend on: runtime boot, profile bootstrap, session start, and player join. That keeps the original intent intact — small canaries for specific questions — while making the logging contract explicit and testable.

## 2026-04-13 — Build health should tolerate its own bookkeeping commit

The tracked health record exists to make the repo honest, not to instantly invalidate itself. After a successful `verify`, it is normal to land a follow-up commit that only updates `docs/project/BUILD-HEALTH.json`. The tool should treat that one case as still current instead of calling the tree stale immediately. Any broader code/doc drift still counts as stale.

## 2026-04-12 — Productization should expose the embedded stack, not hide it

LBH's packaged desktop app is now self-contained enough that the next honest move is not more invisible process magic. It is a visible stack-status surface. The app should be able to tell us whether the embedded control plane and sim are healthy, what session is live, and whether the sim is idling toward shutdown. That keeps the original architecture intent intact — authoritative run truth, local rendering client — while making the product understandable to humans.

## 2026-04-12 — Content manifests should begin with hull identity, not the noisiest file

The first extracted content manifest should be the hull layer. Hull coefficients, rig tracks, and AI hull assignment are descriptive game truth used by multiple systems and design docs. They belong in content space sooner than seeded-generation or session profiles because they reduce drift immediately without forcing a broad runtime rewrite.

## 2026-04-12 — Structured telemetry should stay lightweight and local

LBH does not need a separate telemetry service yet. The right step is to emit structured JSON events into the existing process logs for the dev server, control plane, sim, and stack launcher. That gives us much better diagnosis of multi-process failures without changing the architecture or introducing another system to maintain. This keeps the three-process architecture legible while preserving the current jam-speed toolchain.

> What we considered, what we tried, what we rejected, where it landed.
> Each entry tracks the full decision tree — not just the outcome.
> If we revisit a question, we add a new dated entry, not overwrite.

---

## PlayerBrain: server-owned resolved player truth (2026-04-01)

**Question:** After the first client/server migration, where should durable upgrades, hull coefficients, and loadout-derived gameplay modifiers actually resolve?

**Options considered:**
- Keep the existing inline brain math inside `scripts/sim-runtime.js`
- Let the browser continue applying profile upgrades locally and treat the server as “good enough”
- Move the whole thing into a real server-side module and hydrate it from durable profile data

**Where it landed:** Real server-side module. `PlayerBrain` now lives in `scripts/player-brain.js`, resolves from hull + durable profile upgrades + equipped artifacts, and refreshes on live loadout mutation. The server, not the browser, now owns the resolved movement/pickup/signal/well-contact coefficients for remote-authority play.

**Important consequence:** profile upgrades are no longer just a local `CONFIG` hack in the browser. Remote-authority runs now get real server-side hull grace and resolved coefficients at join time.

**Door status:** Closed for the authority model. Open for richer hull-specific progression later.

## Canonical live loadout shape: keep `2 equip + 2 consumable` until the whole stack moves (2026-04-01)

**Question:** Should the persistence/control-plane layer get ahead of the live client and start storing `3` equipped artifact slots because some design docs already assume that future shape?

**Options considered:**
- Let persistence drift ahead and accept temporary UI mismatch
- Freeze the durable contract at the shipped runtime shape until one explicit cross-stack migration changes it everywhere

**Where it landed:** Freeze it. The durable profile, local profile normalization, remote snapshot sync, and tests now all treat `2 equipped + 2 consumable` as canonical live truth.

**Important consequence:** the `3 artifact slots` idea is still valid design work, but it is back in the backlog where it belongs. The runtime will not pretend it already shipped.

**Door status:** Open for a future one-slice migration. Closed for silent drift.

## How to Read This

Each decision has:
- **Question**: The design fork we faced
- **Options considered**: What was on the table, who advocated what
- **Where it landed**: Current answer
- **Door status**: Closed (won't revisit), Open (might revisit with new info), Playtesting (answer depends on feel)
- **Dates**: When the question surfaced, when it was last updated

---

## Entity Hierarchy: Four Tiers (2026-03-28)

**Question:** How should non-player entities be organized? The existing scavenger/fauna split was jumbled — fauna doing active-tier work (eels lunging you into wells), scavengers split between ambient (drifters vibing) and pseudo-adversarial (hunters), and no true adversarial layer at all.

**Framework (from Greg):** Four tiers with distinct gameplay contracts:
1. **Ambient** (LOW impact) — texture, tells, atmosphere. Birds in Marathon.
2. **Active** (MODERATE impact) — singular directive, constant obstacle. ARC in Arc Raiders.
3. **Adversarial** (HIGH impact) — full toolkit, same game as the player. Runners in Marathon.
4. **Existential** (ABSOLUTE) — inescapable, non-interactive. Blue circle in BR.

**Where it landed:** ENTITY-CATALOG.md. 17 entity types across 4 tiers. Seed picks from catalog per run (1-3 ambient, 1-2 active, always adversarial, always Inhibitor). Supersedes SCAVENGERS-V2.md and FAUNA.md.

**Key reframes:**
- Drifter scavengers → absorbed into AI players (Ghost/Prospector personalities)
- Vulture scavengers → absorbed into AI players (Raider/Vulture personalities)
- Rift eels → promoted from ambient to active tier (Gradient Sentries)
- Signal moths → simplified to Signal Blooms (ambient visual tell, not mechanical threat)
- Hunters → active tier (Current Hunters), not adversarial
- NEW: AI players as true adversarial tier (same toolkit, same game loop)

**Door status:** Tier structure closed. Individual entity types within each tier are open to addition/removal.

---

## AI Players: Adversarial Tier (2026-03-28)

**Question:** What fills the adversarial tier? Smarter scavengers or genuinely new entities running the full player loop?

**Where it landed:** Full AI players. Same Ship class, same inventory, same physics, same combat tools. 5 personalities as weight tables on shared decision code (Prospector, Raider, Vulture, Ghost, Desperado). Solo = 1 human + 3-7 AI. Multiplayer replaces AI slots with humans.

**Key decisions:**
- Player count: 4-8 per run (matches Codex server architecture scope)
- AI visibility/detection range: deferred
- AI lives server-side in `tickAIPlayers()`
- Analytical flow model for navigation (no GPU needed server-side)
- AI sees same info as human player (no map hacks, perception has noise/delay)
- Character classes emerged from first principles: same toolkit + different weights = distinct playstyles

**Door status:** Architecture closed. Personality weights open to extensive tuning. Perception fidelity (noise/delay amounts) open to tuning. Additional personalities can be added to catalog.

---

## Ship Classes: Five Decisions (2026-03-31)

**Question 1: Hull count**
Options: A) Start with 3 (Drifter/Breacher/Shroud), add 2 later. B) All 5 from the start.
**Where it landed:** B — all five. We have the design horsepower. Hulls need distinct ability kits, not just signal coefficient variations.

**Question 2: Rig respec**
Options: A) No respec (permanent). B) EM-cost respec with cooldown. C) Free respec (D4-style).
**Where it landed:** A — no respec. Deleting a pilot to start over is the old-school roguelike answer. Greg: "we'll deal with the implications later."

**Question 3: AI hull assignment in solo**
Options: A) Random. B) Complementary (avoid duplicating human hull). C) Fixed composition per hull.
**Where it landed:** B — complementary, no duplicates. Marathon's all-assassin lobbies prove that duplicate compositions change gameplay pace in undesirable ways. Personality constrains hull (Raider→Breacher, Ghost→Shroud, etc).

**Question 4: Rook (zero-risk entry)**
Options: A) Implement now. B) Backlog. C) Never.
**Where it landed:** B — backlogged. Marathon's Rook does a lot right, but LBH's loss curve is softer (cargo/salvage, not hull/rig). The dread of loss IS the game. Revisit if onboarding proves too harsh.

**Question 5: Artifact hull-locking**
Options: A) All universal. B) All hull-locked. C) Mixed (universal + affinity + exclusive).
**Where it landed:** C — three categories. Universal (~50% of drops), affinity (~35%, any hull equips, +50% on matching hull), exclusive (~15%, one hull only, strongest effects). Every drop is relevant; some create "save for my other pilot" moments.

**Door status:** Hull count closed. Ability kits open to tuning. Loot affinity ratios open to playtesting. Respec may reopen if pilot deletion proves too punishing.

---

## Dead Config Audit: extractionRate and collisionSpike (2026-03-30)

**Question:** SIGNAL_CONFIG defined extractionRate (0.003/s) and collisionSpike (0.08) but neither was wired to any code path. Bug or intentional?

**Where it landed:** Intentional — removed both configs with comments explaining why.
- **extractionRate:** Extraction is instant (player enters portal radius → escaped). A continuous signal rate during extraction only makes sense with a charge timer. If extraction gains a charge period, re-add at 0.003/s.
- **collisionSpike:** No generic entity-entity collision system exists. Fauna and sentries have per-type bumpSignal values tuned to their gameplay role (0.01 for jellies/blooms, 0.05 for sentries). A single global collision spike would override these per-entity values.

**Door status:** Closed unless extraction gains a charge timer (which would reopen extractionRate).

---

## Signal System: Three Open Decisions (2026-03-28)

**Question 1: Inhibitor wake mechanic**
Options: A) Hard threshold (fixed per run), B) Probability ramp (per-tick RNG), C) Threshold + variance (random threshold 0.82–0.98 set at run start)
**Decided: C.** EVE wormhole pattern — consistent rules, hidden parameters. Each run the line is different. Variance IS the dread.

**Question 2: Signal equipment**
Options: A) No signal equipment (pure skill), B) Signal shaping (changes shape, not magnitude), C) Shaping with costs (every signal benefit has a non-signal downside)
**Decided: C.** Dampened Thrusters = slower signal ramp but 15% less max thrust. Signal Sink = faster decay but eats a cargo slot. Every module is a tradeoff. Hardest to balance but richest decision space.

**Question 3: Multiplayer signal visibility**
Options: A) Hidden (audio only), B) Visual cues (glow/trail reveals approximate level), C) Exact HUD numbers
**Decided: B.** Ship glow and trail brightness communicate signal state — GHOST vs BEACON is visible, exact numbers aren't. Note: this requires the fabric/shader layer to reliably render per-entity visual state, which is the same surface the Inhibitor needs. Both problems solve together or not at all.

**Door status:** All closed. Equipment balance values open to tuning. Multiplayer implementation blocked on fabric-layer rendering.

---

## Star Clearing: Physics vs Visual Density (2026-03-25)

**Question:** Should stars inject negative visual density to create a clearing bubble?

**Context:** Stars push fluid outward (negative gravity). They also injected `-cfg.clearing` into the visual density buffer every tick to create a visible dark zone. This negative density accumulated and was interpreted by the display shader's `liveSpace` calculation, which multiplies all well ring/halo contributions. Wells near stars (W0/W2 on the 3×3 map) had their accretion visuals suppressed to near-invisible.

**Root cause:** The visual density buffer is a single shared RGB channel. Negative injectors (stars) stomp on positive signals (well rings, wreck glow). No isolation between systems.

**Where it landed:** Remove the negative visual splat. The physics push already creates a natural low-density clearing — the visual shortcut was redundant and harmful. Visual density buffer is now purely additive (positive signals only). If we need per-system visual channels later, option B (separate buffers) is on the table.

**Door status:** Open for option B if other cross-talk issues emerge.

---

## Inventory Equip/Load Path (2026-03-25)

**Question:** How should equippable artifacts and consumables move from cargo to their active slots?

**Options considered:**
- A) Submenu on confirm (select action from list)
- B) Auto-dispatch: confirm on equippable → equip, consumable → load, other → drop
- C) Separate keybind for equip vs drop

**Where it landed:** B. Confirm does the right thing based on item subcategory. If target slots are full, swaps with slot 0. Simplest UX that works — no submenu, no extra keybinds. Action hints in the HUD update to show `[equip]`/`[load]`/`[drop]` so the player knows what will happen.

**Door status:** Closed for now. May revisit if we add more slot types or the swap-with-0 feels wrong.

---

## Shader Distance Units (2026-03-25)

**Question:** What unit space should the display shader's per-well distance calculation use?

**Options considered:**
- A) Reference-scaled: `dist = length(diff) / uvS` — divides by FLUID_REF_SCALE/WORLD_SCALE. Produces world_distance/FLUID_REF_SCALE. Was the original code.
- B) World-space: `dist = length(diff) * u_worldScale` — multiplies UV distance by WORLD_SCALE. Produces true world-space distance.

**Where it landed:** B. Shape values from `getRenderShapes()` are in world-space (accretionRadius × WORLD_SCALE). dist must match. Option A was 3× off on the 3×3 map, making ring gradients invisible for large wells.

**Door status:** Closed.

---

## Toroidal Wrapping in Simulation Shaders (2026-03-25)

**Question:** Do GPU shaders that compute point-to-point distance need explicit toroidal wrapping?

**Context:** The fluid texture is toroidal (GL_REPEAT). Texture *sampling* wraps automatically, but *distance calculations* between two UV positions don't — `length(a - b)` gives straight-line distance, not shortest-path-on-torus distance.

**What broke:** `FRAG_SPLAT` and `FRAG_WELL_FORCE` used straight-line distance. Wells near UV boundaries (e.g., W0 at UV 0.33 on 3×3 map) had their gravity and density splats cut off at the texture edge instead of wrapping. This created hard edges in the velocity field that were visible as sharp fabric boundaries in the display.

**Fix:** `diff = diff - round(diff)` before any distance calculation. Now documented as TOROIDAL WRAPPING RULE in fluid.js header.

**Door status:** Closed. All 4 point-to-point shaders verified. The 7 neighbor-sampling shaders don't need it (GL_REPEAT handles their lookups).

---

## Ring Scale vs Map Size (2026-03-25)

**Question:** Should accretion ring screen coverage be consistent across map sizes, or scale with WORLD_SCALE?

**Current behavior:** CONFIG.wells.accretionRadius is UV-space (0.023). Multiplied by WORLD_SCALE for world-space shapes. Ring screen coverage grows with map size: ~23% on 3×3, ~51% on 5×5, ~126% on 10×10 for the largest wells.

**Options:**
- A) Keep current: rings are physically larger on bigger maps. Mega-wells feel massive.
- B) Normalize: divide accretionWorld by some scale factor so rings have similar screen presence across maps.
- C) Per-map tuning: override accretionRadius in each map definition.

**Where it landed:** Open. Current math is correct but needs design review. Revisiting today.

**Door status:** Open.

---

## Incident: Map Select Crash (2026-03-18)

### What happened
Removed `portals` array from map files (portal wave system replaced static portals). The map select screen still referenced `map.portals.length` to display stats. Crash on entering map select — game stopped functioning.

### Why tests didn't catch it
All tests use `triggerRestart()` which bypasses the title→mapSelect→startGame user flow. The crash only occurred on the path real users take (select map from menu).

### What we learned
1. When removing data fields, grep for ALL consumers before committing
2. Validation tests that flag "dead data" must also verify no live references exist
3. Test suite needs at least one test that exercises the actual user flow (title→mapSelect→play), not just the shortcut API

### Changes made
- Fixed the crash (display wreck count instead of portal count)
- Added memory: always grep for all consumers before removing data
- Documented in decision log for future reference

---

## Map Scale

### Q: How big should the world be?

| Date | Event |
|------|-------|
| Mar 17 | Greg playtest feedback: "world is too cramped, everything crammed into one screen, can't see effects of stars/loot at this scale" |
| Mar 17 | Night shift implements 3x3 world expansion with camera follow. Entities spread across the map. Toroidal wrapping for seamless edges. |

| Mar 17 (night) | Map file system implemented. WORLD_SCALE now mutable via `setWorldScale()`. Three maps created: 3×3 (current), 5×5, 10×10. Force culling by camera distance for large maps. Fluid `reinitialize()` for resolution changes. |

**Where it landed:** Multiple map sizes supported (3, 5, 10). Map select screen lets player choose. WORLD_SCALE is per-map. Fluid resolution scales with map size (256 for 3×3/5×5, 512 for 10×10).

**Door status:** Open — playtesting needed on 5×5 and 10×10 feel. Cull distance may need tuning. More maps easy to add.

---

## Extraction Loop

### Q: How does the player extract?

| Date | Event |
|------|-------|
| Mar 17 | Portals added as extraction points. Two portals placed in safe zones far from wells. |
| Mar 17 | Extraction is instant (fly into capture radius → "ESCAPED"). No charge time. |

**Where it landed:** Instant extraction via portal capture radius (0.08 world-units). Two portals at (0.3, 0.3) and (2.7, 2.7). "ESCAPED" screen mirrors "CONSUMED" death screen.

**Door status:** Open — may add charge time, loot requirements, or multi-portal extraction in L1.

---

## Well Growth

### Q: How should wells grow over time?

| Date | Event |
|------|-------|
| Mar 17 | Greg: "set auto growth to low but let other stuff continually spawn and see what happens" |
| Mar 17 | growthInterval 20→45s, growthAmount 0.05→0.02. Planetoid consumption supplements passive growth. |

**Where it landed:** Slow passive growth as floor, planetoid consumption as bonus. Wells grow when they eat planetoids (adds mass + spawns wave ring).

**Door status:** Playtesting — balance depends on how many planetoids orbit near wells.

---

## Controller Input

### Q: Roll our own input manager or use a library?

| Date | Event |
|------|-------|
| Mar 17 | Greg reports stick flicker, spring bounce, neutral drift during playtest |
| Mar 17 | Surveyed 8 JS gamepad libraries (gamepad-api-mappings, Gamepads.js, joypad.js, gamecontroller.js, etc.) |
| Mar 17 | None have the full pipeline: radial deadzone + hysteresis + angular smoothing. Best one (gamepad-api-mappings) only has deadzones. |
| Mar 17 | Decision: keep our input.js, add ~40 lines of proper processing using proven patterns from Warhawk and JoyShockMapper. |

**Where it landed:** Custom input pipeline. Scaled radial deadzone, aim state hysteresis with hold timer, soft tiered angular smoothing, last-known-angle hold. All constants tunable in dev panel. No library dependency.

**Why not a library:** Every candidate either lacked critical features (smoothing, hysteresis), was framework-coupled, or would still require us to write the hard parts. 40 lines of well-understood math beats a dependency that doesn't solve the actual problem.

**Door status:** Closed — the pipeline works. May tune constants per-controller.

---

## Physics Architecture

### Q: One fluid sim or two?

| Date | Event |
|------|-------|
| Mar 14 | Initial design assumes single fluid sim (Navier-Stokes) |
| Mar 15 | DESIGN-DEEP-DIVE proposes dual system: Navier-Stokes for local flow + wave equation solver for gravity wave propagation. Technically elegant, would give true surfable wavefronts |
| Mar 15 | Forge review kills it: "Fake the theorem, ship the feeling." Two physics systems is a research project, not a jam decision |
| Mar 15 | Greg ambivalent — could parallelize as a sidequest if single sim proves the feel. Not opposed to revisiting |

**Options:**
1. **Single fluid sim + oscillating force injection** (Forge's recommendation) — fake waves through periodic force patterns from gravity wells. Simpler, proven, shippable.
2. **Dual solver** (deep dive design) — Navier-Stokes + wave equation on separate grids, coupled. Physically accurate surfing. Research-level complexity.
3. **Wave equation only** (never seriously considered) — would lose the fluid feel entirely.

| Mar 15 (late) | Greg reopens: "let's parallelize here. run two experiments, maybe we merge them." Aligns with new Pillar 6 (Run It Twice) — agent compute is cheap, design regret is expensive. |

**Options:**
1. **Single fluid sim + oscillating force injection** (Forge's recommendation) — fake waves through periodic force patterns from gravity wells. Simpler, proven, shippable.
2. **Dual solver** (deep dive design) — Navier-Stokes + wave equation on separate grids, coupled. Physically accurate surfing. Research-level complexity.
3. **Wave equation only** (never seriously considered) — would lose the fluid feel entirely.
4. **Parallel experiments** (Greg's current position) — run both approaches simultaneously as two agent tasks. Compare results. Merge if they complement each other, pick the winner if not.

**Where it landed:** Option 4. Both get built in parallel Monday night. Two agents, two sims, compare Tuesday morning.

| Mar 16 (1am) | V1 prototype (single sim + oscillating force injection) built and playtested. Ship gets trapped in wells, oscillation creates chaotic unreadable movement, "surfing" feels like a washing machine. Root cause: pulsing force at the source ≠ propagating waves. The N-S sim dampens oscillation before it becomes a coherent wavefront. |
| Mar 16 (1:30am) | Greg + Claude rethink the physics model entirely. Real black holes don't pulse — they pull constantly. Waves should come from events (mergers, growth, collapses), not from wells existing. |

5. **Steady currents + event waves** (V2, Greg + Claude) — wells create constant pull + orbital flow (the readable, navigable terrain). Waves only come from discrete events (mergers, growth pulses, collapses). Two movement regimes: steady currents (90% of play, skill = reading flow) and event waves (10%, skill = positioning for the big moment). See PHYSICS-V2.md.

**Where it landed:** Option 5. Oscillating force injection is dead. V2 design: steady currents for navigation, event-driven waves for drama.
**Door status:** Open — V2 needs to be built and playtested. If steady currents aren't interesting enough, we may need to add more flow complexity.
**Key learning:** Faking waves through force oscillation doesn't work in a Navier-Stokes sim. The sim dampens them before they propagate. Real wave propagation needs explicit ring entities, not source oscillation.
**Door status:** Open. Experiments will converge or one will win.

---

## Entity Expansion (Experiments 1-5)

### Q: What should populate the world besides wells?

| Date | Event |
|------|-------|
| Mar 16 | Playtesting reveals the world needs more things to navigate around. Wells alone create interesting flow, but there's nothing to route between, shelter behind, or interact with. |
| Mar 17 | Five experiments implemented: ship slowdown, bullet wake, stars, loot anchors, controller support. |

**Options considered:**
1. More wells — rejected, already have 4, more = visual chaos
2. Moving obstacles (planetoids) — deferred to night shift, medium complexity
3. Static radiant sources (stars) — implemented, low complexity, high visual payoff
4. Flow obstacles (loot anchors) — implemented, low complexity, tests lee zones
5. AI traffic ships — deferred to night shift, linked with well consumption mechanic

**Where it landed:** Stars and loot anchors shipped. Creates equilibrium zones, navigable channels, and flow obstacles. Planetoids and AI traffic deferred.

**Door status:** Open. Playtesting will determine which entities earn their keep.

---

### Q: Ship too fast to read currents?

| Date | Event |
|------|-------|
| Mar 16 | Ship at thrustAccel 2500 / drag 0.03 = terminal velocity ~1333 px/s. Overpowers all fluid flow. |
| Mar 17 | Slowdown: thrustAccel 800, drag 0.06, fluidCoupling 1.2. Terminal ~213 px/s. Ship settles into flow faster. |

**Where it landed:** Ship is 6x slower. Currents now carry the ship meaningfully. Risk: wells may be inescapable. `shipPullStrength` may need reduction from 250 to ~150.

**Door status:** Playtesting. If wells are inescapable, reduce shipPullStrength.

---

### Q: Controller support timing?

| Date | Event |
|------|-------|
| Mar 15 | DualSense listed as Tuesday/Wednesday stretch goal |
| Mar 17 | Pulled forward to Monday night. Mouse lacks granularity for the slower ship — analog thrust from R2 trigger is the big win for navigating fabric. |

**Where it landed:** Gamepad API implemented with auto-detection. Left stick = facing, R2 = analog thrust, L2 = brake. Mouse still works as fallback.

**Door status:** Closed for API. Open for feel-tuning (dead zones, response curves).

---

## Signal Mechanic

### Q: Does signal buy capability?

| Date | Event |
|------|-------|
| Mar 14 | Signal conceived as risk/reward dial — more signal = faster loot discovery but attracts threats |
| Mar 15 | Forge review flags signal as potentially punitive: "If every meaningful action increases signal and signal mostly causes bad things, players will learn the wrong lesson: do less" |
| Mar 15 | Forge recommends signal should buy short-term power: better scans, wider loot radius, reveals unstable portals, increases ship-wave coupling |
| Mar 15 | Greg reframes through Tarkov: signal is the TAX on ambition, not a currency. Shooting in Tarkov is loud — that's bad. But shooting kills enemies — that's good. The noise is a byproduct of the valuable action, not a resource |
| Mar 15 | SIGNAL-DESIGN.md locks this down: signal buys nothing. The actions that generate signal are the upside |

**Options:**
1. **Signal buys nothing** (Greg's position) — pure tax. Skilled play minimizes it. The game teaches surfing by punishing non-surfing. Clean, intuitive, no optimization sweet spot.
2. **Signal buys capability** (Forge's position) — high signal reveals wrecks, widens loot radius, strengthens wave coupling. Creates a genuine temptation to run hot. Risk: adds a "sweet spot" optimization target.
3. **Signal buys different things at different tiers** (hybrid, never fully explored) — low signal is pure stealth, mid signal gives discovery benefits, high signal attracts threats. Risk: complexity.

**Where it landed:** Option 1. Signal is consequence, not resource.
**Door status:** Playtesting. If playtests show players just tiptoeing around (the "do less" failure mode Forge warned about), we revisit. Forge may be right. The Tarkov analogy holds only if there are enough reasons to take loud actions.

### Q: Signal decay curve — linear or exponential?

| Date | Event |
|------|-------|
| Mar 15 | SIGNAL-DESIGN.md raises the question. Notes exponential feels better (fast initial drop, slow tail) but is harder to learn |

**Options:**
1. **Linear** — predictable, easy to learn, boring
2. **Exponential** — fast initial decay rewards brief loud bursts, slow tail punishes sustained noise. More interesting but less readable.
3. **Piece-wise** (not yet discussed) — fast decay below 50%, slow decay above. Would create a "danger zone" that's hard to leave.

**Where it landed:** Undecided.
**Door status:** Playtesting. Start with exponential, see if players can read it.

### Q: Inhibitor threshold — fixed or randomized?

| Date | Event |
|------|-------|
| Mar 15 | SIGNAL-DESIGN.md raises the question. Random (±10%) adds uncertainty, fixed is easier to learn |
| Mar 15 | EVE wormhole research reinforces engineered uncertainty: "less than 4h" not "3h47m" |

**Options:**
1. **Fixed** (e.g., always 90%) — learnable, speedrunnable, less tense once you know the number
2. **Randomized ±10%** — you never know exactly when. More tension. Harder to learn the system.
3. **Hidden fixed** — threshold is fixed but the HUD doesn't show exact signal %. You see tiers (GHOST, WHISPER, etc.) not numbers. Best of both?

**Where it landed:** Leaning toward option 3. Fixed threshold, imprecise display.
**Door status:** Open. Needs playtesting.

---

## Combat

### Q: Should the game have weapons?

| Date | Event |
|------|-------|
| Mar 15 | COMBAT.md analyzes the full case for and against. Extraction genre practically demands PvP. Fluid physics would make projectiles novel. |
| Mar 15 | Conclusion: combat would eat the entire complexity budget. The fluid sim IS the interaction system. "The Inhibitor IS the combat." |
| Mar 15 | Non-lethal interaction tools proposed: signal flares, force pulses, tethers, EMP. These affect physics and information, not hitpoints |
| Mar 15 | Forge review endorses: "Do not add lethal combat in the jam build" |

**Options:**
1. **No weapons, ever** — pure evasion/navigation game
2. **Non-lethal tools** (current plan) — force pulse, signal flare, tether. Affect physics, not HP.
3. **Lethal weapons** (rejected) — projectiles through fluid, ship destruction, loot drops. Full extraction PvP.

**Where it landed:** Option 2. Non-lethal tools as stretch goals mid-week.
**Door status:** Closed for jam week. If the game goes post-jam, weapons conversation reopens.

---

## Threats

### Q: How many threat types for the jam?

| Date | Event |
|------|-------|
| Mar 14 | Design doc establishes three tiers: Scavengers, Fauna, Inhibitors |
| Mar 15 | Forge review: "The current scope of threats is too wide." Recommends Inhibitor as the only essential threat. Fauna and scavengers are stretch. |
| Mar 15 | Greg pushes back on experience density: "the ratcheting danger is important and i think needs a min of X density to feel good" |

**Options:**
1. **Inhibitor only** (Forge's position) — single existential threat. Clean, focused.
2. **Inhibitor + one lower threat** (compromise) — fauna OR scavengers, not both. Provides experience density without three systems.
3. **Full threat stack** (original design) — scavengers + fauna + Inhibitor. Rich but expensive to build.

**Where it landed:** Inhibitor is core. One simpler threat (likely fauna — simpler AI than scavengers) as stretch for Wednesday. Scavengers only if ahead of schedule.
**Door status:** Open. Depends on Monday/Tuesday velocity.

---

## Multiplayer

### Q: Solo only or multiplayer for the jam?

| Date | Event |
|------|-------|
| Mar 14 | Design doc: single-player with AI opponents. Multiplayer stretch goal. |
| Mar 15 | SCALING.md designed full 1-100 player architecture |
| Mar 15 | Greg: "2-3 player should be the jam goal not just the future goal" |
| Mar 15 | Forge review: multiplayer is "poison during a jam if it starts steering implementation" |
| Mar 15 | Resolution: build clean data boundaries (separate sim from rendering, entity state as plain data), write zero networking code this week |

**Options:**
1. **Solo only, clean architecture** (Forge's position, current plan) — no networking code. Architecture that happens to be multiplayer-ready.
2. **2-3 player WebSocket** (Greg's aspiration) — authoritative server, client prediction. Aggressive but feasible with agent horsepower.
3. **Local multiplayer** (never discussed) — split screen or shared screen. Sidesteps networking entirely.

**Where it landed:** Option 1 for the build plan. Option 2 stays as a labeled stretch goal if we're ahead by Thursday.
**Door status:** Open. Greg wants this. It depends entirely on velocity.

---

## Visual Stack

### Q: How many render layers?

| Date | Event |
|------|-------|
| Mar 14 | Three-layer stack: background grid, ASCII fluid, HUD overlay |
| Mar 15 | DESIGN-DEEP-DIVE adds: feedback buffer (motion trails), multi-grid layering, screen distortion, star particles, chromatic gravity warps |
| Mar 15 | Forge review: "Use one killer visual move, not six." Cut to fluid + ASCII post + clean ship + clean HUD |
| Mar 15 | Greg pushes back: "the visual sauce we should keep early not late. the art is the product." |

**Options:**
1. **Minimal stack** (Forge's recommendation) — fluid field → ASCII post → ship overlay → HUD. Four passes.
2. **Full stack** (deep dive design) — fluid → scene render → feedback buffer → ASCII post → distortion → HUD → particles. Seven passes.
3. **Progressive stack** (compromise, implicit current plan) — start with Forge's minimal, add layers as time allows and performance permits.

**Where it landed:** Option 3. Start minimal, add sauce. But Greg is clear: visual identity is not polish, it's product. ASCII shader goes in Monday, not Friday.
**Door status:** Open. Depends on GPU performance budget.

---

## Naming

### Q: What do we call the portals?

| Date | Event |
|------|-------|
| Mar 15 | EVE wormhole research prompts the question. "Portals" feels generic. |
| Mar 15 | "Breaches" proposed — violent, urgent, implies damage to spacetime |

**Options:**
1. **Portals** — generic but clear
2. **Breaches** — violent, implies spacetime damage, fits the dying-universe tone
3. **Rifts** — similar to breaches, more sci-fi standard
4. **Exits** / **Gates** — functional but flat

**Where it landed:** Leaning "breaches." Not locked.
**Door status:** Open. Low priority — naming can change anytime.

### Q: What do we call the Inhibitors?

| Date | Event |
|------|-------|
| Mar 15 | "Inhibitors" is from Revelation Space. Need our own name. |
| Mar 15 | "The Silence" floated — evocative, fits dark forest (you go silent to survive) |
| Mar 15 | Stellaris reference adds naming insight: use evocative English, not alien syllables. Alexis Kennedy: real words in wrong combinations. |

**Options:**
1. **Inhibitors** — borrowed from Alastair Reynolds, legally/creatively questionable
2. **The Silence** — evocative, thematic (you manage signal to avoid waking silence)
3. **The Threshold** — meta (you cross a threshold to wake them, they ARE the threshold)
4. **The Warden** / **Wardens** — implies enforcement, galaxy-scale policing
5. TBD — more options welcome

**Where it landed:** Undecided. Placeholder "Inhibitor" in all docs.
**Door status:** Open. Needs a decision before the game has UI text (Thursday-ish).

---

## Dev Panel & Tuning Architecture

### Q: Is the dev panel a mandatory build requirement or optional polish?

| Date | Event |
|------|-------|
| Mar 15 | TUNING.md written. Dev panel defined as "Monday morning task — ships alongside or immediately after the physics prototype. It's not optional." Without it, every tuning cycle requires agent code changes + Greg reloads. |
| Mar 15 | ROADMAP.md assigns Task N2 (Dev Panel + CONFIG Object) as a Monday night deliverable, ordered after N1a/N1b but before morning review. |

**Options:**
1. **Mandatory Monday deliverable** (current position) — Greg cannot tune without it. Every hour without sliders is an hour of "change code, reload, play for 2 minutes" loops.
2. **Nice-to-have, build when convenient** (rejected) — risks burning Greg's most valuable time (Monday morning review) on the reload cycle.

**Where it landed:** Option 1. Dev panel is a first-night deliverable, not polish.
**Door status:** Closed.

---

### Q: How should tunable constants be organized in code?

| Date | Event |
|------|-------|
| Mar 15 | TUNING.md and AGENT-PROMPTS.md define the CONFIG object pattern: single object, every system reads every frame (not cached at init), dev panel sliders write to it, "Copy Config" serializes to JSON. |

**Options:**
1. **Single CONFIG object** (current position) — all tunables in one place, live-editable, serializable. Dev panel binds directly.
2. **Per-system constants** (rejected) — scatter tunables across fluid.js, ship.js, etc. Dev panel has to hunt for them. No single "Copy Config" export.
3. **External config file** (never considered for jam) — adds a build/load step.

**Where it landed:** Option 1. Single CONFIG object is an architectural requirement enforced in agent prompts.
**Door status:** Closed.

---

### Q: How do agents verify their own work?

| Date | Event |
|------|-------|
| Mar 15 | AGENT-TESTING.md written. Puppeteer-based test harness. Game exposes `window.__TEST_API` for automated access to game state. Tests run after every commit. |

**Options:**
1. **Puppeteer smoke + physics tests** (current position) — headless Chrome, ~690 lines total across 6 test files, built incrementally per layer. Agents run after every commit.
2. **No automated testing** (rejected) — Greg spends morning review time on "does it load? does it crash?" instead of "does it feel good?"
3. **Unit test framework** (rejected) — overkill for a jam. WebGL state is hard to unit test. Puppeteer tests the actual game.

**Where it landed:** Option 1. Puppeteer + `__TEST_API`.
**Door status:** Closed.

---

### Q: Which mouse control model should be the default?

| Date | Event |
|------|-------|
| Mar 15 | CONTROLS.md analyzes three mouse models. Model 1 (distance = thrust intensity) ranked as RECOMMENDED START. Model 2 (binary click) as safe fallback. Model 3 (drag magnet) as "probably wrong for LBH." |

**Options:**
1. **Model 1: Mouse = aim, distance = thrust intensity** (recommended) — gives analog thrust from a mouse. Cursor distance from ship = thrust power. Risk: managing position AND direction simultaneously.
2. **Model 2: Mouse = aim, click = binary thrust** (fallback) — simpler. No nudge/burn distinction. Fluid does the analog work.
3. **Model 3: Mouse = velocity target (drag magnet)** (likely rejected) — intuitive but removes "fighting the current" as a skill.

**Where it landed:** Model 1 recommended start, Model 2 as fallback if Model 1 feels bad. Model 3 worth 20 minutes of testing to confirm it's wrong. Dev panel should include a dropdown to swap models live.
**Door status:** Playtesting. Monday morning will decide.

**2026-04-20 update:** Model 1 is now implemented for the browser-install path. Mouse cursor sets facing, left click applies distance-scaled thrust using the CONFIG mouse curve, right click brakes, and W/S/Space/Ctrl provide laptop-friendly keyboard equivalents. `tests/keyboard-mouse.js` covers local and remote-authority input so this does not regress back into a docs-only promise.

---

### Q: When does DualSense controller support get added?

| Date | Event |
|------|-------|
| Mar 15 | CONTROLS.md defines full DualSense mapping (analog triggers, adaptive resistance, HD haptics). ROADMAP.md places it as Tuesday/Wednesday work. |

**Options:**
1. **Monday night alongside physics** (rejected) — adds complexity to the critical first build. Two input methods to debug on day one.
2. **Tuesday/Wednesday after physics is locked** (current position) — physics experiment runs mouse-only (simpler). Once the winning physics is chosen, add Gamepad API. Affordance tuning may need separate values per input.
3. **Never (mouse-only jam)** (fallback) — if behind schedule, controller support is cut.

**Where it landed:** Option 2. Tuesday/Wednesday stretch. Mouse-only for Monday.
**Door status:** Open. Depends on Tuesday velocity.

---

## Signal Upside Contingency

### Q: Signal Upside Contingency (if tax-only fails Wednesday)

| Date | Event |
|------|-------|
| Mar 15 | Forge Review #2 flags that signal-as-pure-tax may teach players to "do less." Recommends pre-speccing the contingency now so Wednesday is implementation, not debate. |

**Options:**
1. **High signal improves wreck detection** (Forge's recommendation) — above 50% nearby unrevealed wrecks pulse, above 70% loot radius +20-30%, above 85% portal direction improves. Gives signal a clear upside without inventing a second economy.
2. **Signal increases loot pickup radius only** (simpler) — ugly but fast to implement and easy to understand.
3. **Do nothing** (current design) — signal remains pure tax. The actions that generate signal are the upside.

| Mar 15 (late) | Greg + Orrery pushback on Forge's approach. The "do less" problem is real but the fix is wrong. Signal-as-buff solves a mechanical problem with a mechanical hammer. The game wants players to make their own calculus — is this wreck worth the noise given the portal situation, the current map, what entities I can see? That's emergent and situational. A loot radius buff flattens it into "am I above or below the threshold?" Forge is thinking like a machine optimizing a system, not like a player reading a situation. |

**Where it landed:** Option 3 (do nothing) is the current position. Signal remains pure tax. The "do less" failure mode is addressed by making the things that generate signal irresistibly valuable AND making inaction costly (portals evaporate, universe dies, you leave empty-handed).

**Greg's framing:** The tension isn't "loud vs quiet." It's "ambitious vs conservative." Both are valid strategies with different risk/reward curves. The game doesn't need to mechanically reward noise — it needs to make the *rewards of noisy actions* worth the risk. That's a content/tuning problem, not a systems problem.

**Three levers if "do less" appears in playtesting (before reaching for signal-as-buff):**
1. Make loot more tempting — core wrecks near wells have dramatically better rewards
2. Make safe routes unreliable — drifting is quiet but unpredictable, you go where the flow goes
3. Make time pressure real — portal evaporation forces action, you can't tiptoe forever

**Alternative considered but not acted on:** "Mapped terrain" — areas you've traveled through stay slightly brighter in the ASCII, giving route knowledge. Not a buff from signal level, but a natural consequence of having moved through space. Interesting but adds complexity. Backlogged.

**Door status:** Open — awaits Wednesday playtest. If all three levers fail AND the game still rewards passivity, then Forge's Option 1 is the emergency fallback. But we try the design-coherent fixes first.
**Advocates:** Greg (Option 3), Forge (Option 1 as contingency).

---

## Coordinate Systems

### Q: How do we handle coordinate systems across rendering and physics?

| Date | Event |
|------|-------|
| Mar 16 | Y-axis mismatch discovered: visual black holes (dark voids in ASCII shader) don't align with physics wells (where ship gets pulled). Multiple attempts to fix by ad-hoc Y flips in various places all failed — some fixes corrected one display path while breaking another. |
| Mar 16 | Root cause diagnosed: no single source of truth for coordinate conventions. Well positions used directly by both the fluid sim (WebGL Y-up) and the screen overlay (canvas Y-down). A well at y=0.3 appeared at 30% from the bottom in the shader but 30% from the top in the overlay. |

**Options:**
1. **Ad-hoc flips at each boundary** (what we tried — failed) — sprinkle `1.0 - y` wherever things look wrong. Creates double-flips, triple-flips, and a debugging nightmare. Every new feature that crosses the coordinate boundary risks introducing a new mismatch.
2. **Single conversion module with tested helpers** (what we're doing now) — create `coords.js` as THE coordinate authority. All coordinate spaces named and documented. All conversions go through named functions. No inline `1.0 - y` anywhere in the codebase.

**Where it landed:** Option 2. Create `coords.js` as the single coordinate authority. Three named spaces: screen (Y-down, pixels), well (Y-down, 0-1 normalized), and fluid UV (Y-up, 0-1 normalized). Every conversion between these spaces goes through a named function in coords.js. No inline flips allowed.

**Key learning:** Coordinate mismatches across WebGL (Y-up) and canvas (Y-down) WILL recur as we add features. Must be solved once structurally, not per-bug. 30+ minutes of Greg's playtesting time was wasted on a bug that should have been caught automatically.

**Door status:** Closed. This is now an architectural rule.

---

## Fluid Sim Tuning

### Q: Why did the display shader produce a washed-out white screen?

| Date | Event |
|------|-------|
| Mar 16 | Shader tuning session: adjusted display colors, contrast, tone mapping — everything still white. Velocity field arrows triggering across entire screen. |
| Mar 16 | Root cause analysis: density values accumulate to ~3850x the display range. Accretion injects ~7.7 density/frame across 4 wells. Dissipation 0.998 = only 0.2% decay/frame. Steady-state = 7.7 / 0.002 = 3850. Display shader clamps at 1.0 → everything white. |
| Mar 16 | Velocity is non-zero everywhere because wells pull constantly — explains direction chars triggering across whole screen. |

**Options:**
1. **Increase dissipation uniformly** — quick fix but kills the accretion disk richness that looked good initially
2. **Lower accretion injection rate** — would fix brightness but produce anemic accretion disks
3. **Distance-based dissipation** (chosen) — near wells: persistent (0.998), far from wells: fast fadeout (0.985). Creates natural gradient matching the pre-vis look. Steady-state near wells: 3850 (still high, but that's the display shader's job to map). Far from wells: ~0.013 (appropriately faint).
4. **Log/tone mapping in display shader only** — cosmetic fix, doesn't solve the underlying accumulation problem

**Where it landed:** Option 3 + diagnostic overlay. Distance-based dissipation creates spatial structure in the density field. Diagnostic overlay (`showFluidDiagnostic` debug flag) shows actual values at key positions so future tuning sessions work from real data, not guesswork.

**Key learning:** An aesthetically pleasing early result doesn't mean you understand the sim. The fluid looked alive because density was accumulating unchecked — it was always going to saturate. Building diagnostic readouts BEFORE tuning sessions prevents blind parameter sweeps.

**Door status:** Open — display shader still needs to be revisited with the diagnostic data. Log mapping or moderate amplification should now work since the density field has real spatial contrast.

---

## Renderer Recovery

### Q: What contract should the renderer follow for the last 3 days of the jam?

| Date | Event |
|------|-------|
| Mar 20 | Greg pauses the feature churn and asks for a renderer-specific recovery plan. The problem is no longer "the shader is buggy" in a narrow sense. The problem is that one output channel is trying to mean too many things at once: void, heat, flow, surfability, and glitch texture. |
| Mar 20 | Forge proposes a stricter three-layer contract: physics truth, scene shaping, and ASCII presentation. Black-hole readability becomes the first checkpoint, not an emergent side effect of density math. |

**Options:**
1. **Keep tuning the current combined shader** — quickest in theory, but every change keeps colliding with multiple meanings at once. High churn, low trust.
2. **Refactor around three visual signals only** — better than current state, but still too fuzzy; black holes and surf lanes would remain mixed with general "brightness."
3. **Adopt a three-layer renderer contract** (chosen) — physics truth stays honest, scene shaping defines phenomena, ASCII presentation expresses them. Void, accretion, flow, and surf opportunity become explicit player-facing reads.

**Where it landed:** Option 3. For the rest of the jam, renderer work is split into:
- physics truth
- scene shaping
- ASCII presentation

Black holes must read in the scene-shaping layer before ASCII quantization. "Density" is no longer treated as the player-facing concept; the useful interpretation is **fabric excitation**.

**Door status:** Open — this is the active renderer recovery contract until the jam ends or a playtest proves it wrong.

---

## Renderer Evaluation

### Q: How should renderer work be evaluated during the jam?

| Date | Event |
|------|-------|
| Mar 20 | Greg points out that the current screenshot-based smoke/flow harness is producing false confidence for renderer work because it samples a single convenient frame from a fluid animation. |
| Mar 20 | Forge adds a dedicated renderer harness with deterministic fixtures, timed captures, pre-ASCII scene views, final ASCII views, and a debug overlay capture. |

**Options:**
1. **Keep using smoke/flow screenshots** — easy, but they are runtime health checks, not renderer truth.
2. **Judge only by live manual play** — useful, but too hard for agents to compare and too easy to misremember.
3. **Add a dedicated renderer harness** (chosen) — stable fixtures, multiple timestamps, scene-vs-ASCII capture, one manifest per run.

**Where it landed:** Option 3. Smoke and flow remain health checks. Renderer work is evaluated through the dedicated harness.

**Door status:** Open — this remains the default evaluation path for renderer work unless something simpler proves equally trustworthy.

---

## Non-Lethal Combat Tools

### Q: What gives the player "teeth" beyond fly/loot/escape?

| Date | Event |
|------|-------|
| Mar 15 | COMBAT.md analyzes lethal vs non-lethal. Conclusion: no lethal, build interaction tools. Priority: signal flare → force pulse → tether → EMP. |
| Mar 20 | Greg: "it needs some teeth. i think AI + big threat + dying universe actually working + some non-flight gameplay feels like a good outcome for the jam." Confirms non-lethal tools should ship this week. |
| Mar 20 | Three tools designed in detail: force pulse (spacebar, radial shove, wave ring, emergency escape), signal flare (shift, decoy signal source, misdirects AI), tether (right-click, attach to wreck/planetoid). |

**Options:**
1. **No combat tools** — pure fly/loot/escape. Clean but thin.
2. **Non-lethal physics tools** (chosen) — force pulse, signal flare, tether. Affect physics and information, not HP.
3. **Lethal weapons** (rejected for jam) — projectiles through fluid, kill/loot.

**Where it landed:** Option 2. Force pulse Friday, tether Saturday, signal flare Saturday (depends on signal system).
**Door status:** Open — order and details may shift based on playtesting.

---

## AI Scavengers

### Q: Should the world have AI opponents?

| Date | Event |
|------|-------|
| Mar 15 | Design doc establishes scavengers as one of three threat tiers. Forge downgrades to stretch. |
| Mar 20 | Greg pulls scavengers forward as a Friday priority. "We need to make parts of this anyway to make inhibitors." Scavenger AI shares movement architecture with Inhibitor. |
| Mar 20 | Two archetypes designed: drifters (passive, ride currents, loot conservatively) and vultures (aggressive, race player for wrecks/portals). Same ship physics as player. |

**Key decisions:**
- Portals consumed on scavenger extraction (confirmed by design doc)
- Scavengers die to wells (same kill radius as player)
- Same fluid physics as player (thrust + coupling + drag + gravity)
- 70/30 drifter/vulture split

**Where it landed:** Building Friday. See SCAVENGERS.md for full design.
**Door status:** Open — archetype behaviors will be tuned by playtesting.

---

## Gravity Slingshot

### Q: Can wells be used as movement tools, not just threats?

| Date | Event |
|------|-------|
| Mar 20 | Greg proposes a "slingshot" feature — intentionally use gravity and rotational velocity around wells to hook-and-swing between stellar objects. Like grappling hooks or rail grinding. |
| Mar 20 | Full design: approach → catch → orbit → release → boost. Hybrid input model (auto-catch, thrust-to-release). Orbital assist force prevents turbulence from breaking the maneuver. 2-3x speed boost on release. |

**Why it matters:** Wells are currently pure threats. Slingshot makes them the fastest route IF you're skilled enough. Creates a movement skill ceiling that ties directly to Pillar 2 (Movement Is the Game).

**Where it landed:** Designed. Prototype priority TBD — may build Friday/Saturday or cut if time collapses. See SLINGSHOT.md.
**Door status:** Open — most feel-dependent feature on the list, needs dedicated tuning session.

---

## Cosmic Signatures

### Q: How do we make runs feel different from each other?

| Date | Event |
|------|-------|
| Mar 20 | Greg confirms cosmic signatures for the jam: per-run universe personality that tweaks CONFIG and gives a name. |
| Mar 20 | 6 signatures designed: the slow tide, the shattered merge, the thick dark, the graveyard, the rush, the deep. Each has flavor text and CONFIG overrides. |

**Where it landed:** Building Friday. Pure JS, ~100 lines, no dependencies. See SIGNATURES.md.
**Door status:** Open — signature list will grow. Balance depends on base CONFIG values being stable.

---

## Audio for the Jam

### Q: How much of MUSIC.md ships this week?

| Date | Event |
|------|-------|
| Mar 15 | MUSIC.md designs full 5-layer procedural soundscape. |
| Mar 20 | Jam-scoped audio plan: Layer 1 (drone), Layer 2 (well harmonics), event sounds. Layers 3-5 deferred. All Web Audio API, no libraries. |

**Where it landed:** Building Friday. See AUDIO.md for jam scope. ~175 lines total.
**Door status:** Open — additional layers slot in when their prerequisite systems exist (signal choir needs signal, Inhibitor tone needs Inhibitor).

---

## Workstream Split

### Q: How do Forge, Claude/Orrery, and Orb divide remaining jam work?

| Date | Event |
|------|-------|
| Mar 20 | Forge writes RENDERER-RECOVERY-PLAN.md. Proposes clean split: Forge owns renderer, Claude owns gameplay/content, Orb owns routing. |
| Mar 20 | Greg confirms. Signal system parked until renderer stabilizes. |

**Where it landed:**
- Forge: renderer architecture, display shader, ASCII, diagnostics, scaling
- Claude/Orrery: AI scavengers, combat tools, audio, cosmic signatures, slingshot, game systems
- Orb: routing, handoffs, keeping workstreams isolated

**Door status:** Active until jam ends.

---

## Template for New Entries

```
### Q: [The question]

| Date | Event |
|------|-------|
| [date] | [what happened] |

**Options:**
1. **[Option name]** ([who advocated]) — [description]. [Tradeoffs].
2. ...

**Where it landed:** [Current answer]
**Door status:** Closed / Open / Playtesting
```

---

## Sim / Client Decoupling

### Q: How should LBH split simulation from the player executable for scale and future multiplayer?

| Date | Event |
|------|-------|
| Mar 20 | Greg asks for a design to split the authoritative sim out of the player executable, both to prepare for multiplayer and to separate render performance from world-sim performance. |
| Mar 20 | Current architecture review identifies the main seams: ship/scavengers sample GPU fluid directly, several systems mutate fluid as a side effect, some updates are camera-culled, and the main loop mixes fixed `simDt` and frame `dt`. |
| Mar 20 | Decision: the current WebGL fluid sim will **not** become the authoritative server model. The authoritative side will own gameplay truth and a cheaper flow-field model; the client will own high-frequency visual reconstruction and ASCII presentation. |
| Mar 20 | Recommended clocks set: 15 Hz authoritative sim, 10-15 Hz snapshots, 30-60 fps client render. Lower-frequency bands (5-10 Hz AI decisions, 1-2 Hz macro collapse systems) are explicitly allowed. |
| Mar 20 | First implementation slice lands in-process: `FlowField.sample(wx, wy)` becomes the new gameplay-facing velocity interface, `SimState` centralizes run timers, and `SimCore` takes over the fixed world-update block from `main.js`. The app still runs in one process, but the client loop now talks to a sim boundary instead of owning the sim step directly. |
| Mar 20 | Second implementation slice: the world update no longer depends on camera position and now runs on a fixed-step accumulator inside `SimCore`. Loot, wreck, and portal systems still inject visual/fluid effects, but they are no longer culled by the render camera during the sim step. |
| Mar 20 | LBH now has a canonical local process model: dev server on `8080`, harness server on `8719`, and no separate sim PID yet. The future dedicated sim/server process is explicitly backlogged instead of being implied by the current app shape. |

**Options:**
1. **Keep one-process app forever** — simplest now, but scale and multiplayer both get worse from here.
2. **Authoritative server runs the full WebGL fluid sim** — sounds pure, but it is the wrong shape: GPU-bound, expensive to replicate, and too tightly coupled to rendering.
3. **Authoritative sim owns gameplay + coarse flow truth, client owns visual fluid reconstruction** (chosen) — clean separation, better scale, direct path to multiplayer.

**Where it landed:** Option 3. First milestone is interface decoupling inside one app: `flowField.sample(wx, wy)`, `SimState`, and a fixed-step `SimCore`, before any actual second process exists.
**Door status:** Open — exact field representation can evolve, but the split between gameplay truth and visual fluid is now the working direction.

---

## Large-Map Client Performance

### Q: Why do `5x5` and `10x10` maps collapse in frame rate, and what is the right first fix?

| Date | Event |
|------|-------|
| Mar 20 | Greg reports current playtest reality: `3x3` holds around 60 fps, `5x5` falls to ~15 fps, and `10x10` drops below 5 fps. |
| Mar 20 | Perf review shows the main culprit is not view frustum or world size directly. The viewport still only shows roughly one world-unit. The real problem is that larger maps contain many more entities, and each entity was causing full-screen fluid passes every fixed sim tick. |
| Mar 20 | Wells identified as the worst offender. Old path cost roughly `41–122` full-screen passes per well per sim step depending on point count. `Deep Field` was spending well over a thousand well-only passes per step before even counting the base fluid solver. |
| Mar 20 | Stars identified as the second offender. Old path cost `27` full-screen passes per star per step. |
| Mar 20 | `Deep Field` also forces `fluidResolution = 512`, compounding the pass-count explosion with ~4× the pixel cost of the default `256` sim. |
| Mar 20 | Decision: stop using the sim as a paintbrush. Decorative accretion bands and star spikes move toward the renderer/presentation layer; the fluid sim keeps only the force field and the minimum scene-shaped signals needed for readable hazards. |
| Mar 20 | First cuts land: distance-based dissipation only tracks wells + stars, well accretion splat storms are removed from the sim path, and star ray splats are removed from the sim path. |

**Options:**
1. **Tune frustum/camera first** — tempting, but wrong as the primary fix because the viewport is not what is scaling up.
2. **Keep the current entity splat model and only lower resolution/tick** — helps, but preserves the real structural waste.
3. **Move visual-only field shaping out of the sim path, then tune map-scale budgets** (chosen) — reduces the biggest cost center without giving up the long-term client/server direction.

**Where it landed:** Option 3. The first perf fix is structural: cut per-entity full-screen splat work. Then revisit large-map resolution and sim tick budgets with the new baseline.
**Door status:** Open — `10x10` likely still needs map-specific resolution or fixed-tick tuning after the structural cuts.

---

## Renderer / Tile-Boundary Propagation

### Q: Why were hard seams showing up near apparent world/tile edges?

| Date | Event |
|------|-------|
| Mar 21 | Greg flags renderer boundaries that look like tile seams and asks for a review of both physics propagation and renderer propagation across world tiles. |
| Mar 21 | Code review confirms the core physics sim is toroidal in the GPU path: fluid textures use `REPEAT`, world-space entity math uses shortest-path wrap, and well/dissipation shaders already use `diff - round(diff)`. |
| Mar 21 | Two non-toroidal seams are found outside the core sim: the renderer was mixing wrapped sim samples with unwrapped world-noise/cell anchoring, and the CPU flow-field readback path was clamping UVs instead of wrapping them. |
| Mar 21 | A second visual artifact is identified: wells were still writing subtractive visual density every fixed sim tick. The sim stayed continuous, but the accumulated negative field turned into large blocky dark slabs after the ASCII quantization pass. |
| Mar 21 | Decision: world-edge behavior must match across all three layers — GPU sim, CPU readback, and ASCII presentation. The renderer should own well silhouettes analytically; the sim should not keep painting persistent subtractive well blobs into `visualDensity`. |

**Options:**
1. **Treat it as only a shader bug** — too narrow; misses the CPU readback mismatch and the per-tick visual accumulation.
2. **Treat it as only a sim/topology bug** — incorrect; the core fluid sim was already toroidal.
3. **Make wrapping consistent end-to-end and move well silhouettes fully into the renderer** (chosen) — fixes the real seam and removes the fake one.

**Where it landed:** Option 3. The sim stays toroidal, CPU readback now wraps like the sim, the ASCII layer now anchors from wrapped world-space, and the renderer owns the black-hole core directly instead of inheriting a saturated subtractive splat field.
**Door status:** Open — if boundary artifacts persist after this, the next suspect is cell-space quantization or scene-specific shaping, not world-topology mismatch.

| Mar 21 | Follow-up review on real gameplay maps finds a second bug: the display shader was applying `voidField` inside the per-well loop. That meant scene-level darkness was being compounded once for every well, which made many gameplay holes vanish into broad black slabs even though the title screen still looked acceptable. |
| Mar 21 | Decision: keep `voidField` as a scene-level term and only let each well apply its own `coreMask`. Multi-well gameplay readability matters more than squeezing both concepts through one multiply. |

---

## Network Architecture Direction

### Q: What is the actual next-step network architecture after the in-process sim boundary?

| Date | Event |
|------|-------|
| Mar 27 | Greg confirms the target direction: LBH is fundamentally multiplayer-first, with solo as fallback if no other players are around. |
| Mar 27 | Greg also confirms that the correct client/server shape is a locally rendered client talking to an authoritative sim, not streamed gameplay from the mini to the MacBook. |
| Mar 27 | The architecture discussion is split into four futures instead of one rewrite: private remote play on Greg's machines, hosted authoritative sessions, native runtime migration, and possible Godot port work. |
| Mar 27 | Decision: next week should focus on the first two together — prove mini-hosted authoritative sim + MacBook client over Tailscale/LAN, and freeze the first local client/server protocol at the same time. |
| Mar 27 | Hosted future is tentatively defined as run-scoped authoritative instances for 4-8 players, with solo fallback and likely AI fill. |
| Mar 27 | Native/Godot migration is explicitly deferred until the protocol and process boundaries are real. |

**Options:**
1. **Stay effectively local for now** — keep the in-process boundary but postpone real remote play. Simpler short term, but it does not prove the architecture.
2. **Jump straight to public hosting and matchmaking** — ambitious, but premature while the protocol and authority model are still settling.
3. **Private authoritative split first, then hosted run instances** (chosen) — proves the right boundary on Greg's machines, then scales that model outward later.

**Where it landed:** Option 3. The next real milestone is private remote play between Greg's machines with a local-rendering client and an authoritative sim, plus the first stable protocol that hosted sessions can later reuse.
**Door status:** Open — the hosted shape and eventual runtime port remain future decisions, but the immediate next batch is now defined.

| Mar 27 | First implementation slice lands for the network direction: a separate local sim-server shell, PID-managed control commands, and a first plain-data protocol (`join`, `input`, `snapshot`, `events`, `session/start`). It is still a stub authority, but the process boundary and message shapes now exist in code. |
| Mar 27 | Second implementation slice lands: the sim server now loads real playable maps, owns map/entity snapshots, chooses safe spawns, and applies well death/respawn authoritatively. The server is still not the whole game, but it now owns actual run state instead of only toy movement. |
| Mar 27 | Third implementation slice lands: the browser client can now opt into remote authority with `?simServer=...`, start a fresh authoritative run from map select, join it, send player input, and render locally from authoritative snapshots. |
| Mar 27 | Follow-up decision: launching from map select should start a fresh authoritative session, not implicitly join an existing run on the same map. Real join/lobby semantics are future work once the basic remote path is stable. |
| Mar 27 | Follow-up correction: the timed auto-respawn in the sim server was too toy-like and did not match LBH's real death loop. The authoritative server now leaves the player dead and lets reset/relaunch own the restart boundary. |
| Mar 28 | Fourth implementation slice lands: the sim server now owns portal waves, extraction, wreck pickup, cargo truth, and death-time cargo loss. The remote browser path can now complete more of a real run instead of only driving a ship against static authoritative wells. |
| Mar 28 | Chrome DevTools MCP is adopted as a project-scoped browser inspection tool through `.mcp.json`. Decision: keep Puppeteer as deterministic test infrastructure, use MCP as live browser eyes for renderer/perf/debug work. |
| Mar 28 | Follow-up testing decision: do not replace the harness with MCP. Instead, add one honest menu/profile suite and one honest remote-authority suite, while keeping the existing helper-driven gameplay suites for speed. |
| Mar 28 | Next architecture choice: make remote runs feel like the real game by moving rival scavengers onto the authoritative server before chasing broader combat parity. This keeps the migration pointed at a competitive run, not just a solo movement demo. |
| Mar 28 | Next follow-through: remote consumables and pulse timing should move server-side before broader combat. Otherwise remote runs still lie about item truth and player timing. |
| Mar 28 | Implementation lands: authoritative snapshots now carry active effect state, remote join sends real loadout data, the server applies consumables and pulse events, and the remote-authority suite now verifies those protocol-level systems. |
| Mar 29 | Next correction: remote inventory mutation also has to cross the boundary. Otherwise a remote run can move and consume items honestly, but opening the inventory still edits only local UI state. |
| Mar 29 | Implementation lands: the protocol now includes discrete `inventoryAction` requests, the sim server owns equip/load/drop/unload mutations during live runs, dropped cargo spawns authoritative wrecks, and the server inventory model now uses the same fixed eight-slot cargo semantics as the client. |
| Mar 29 | Follow-through: a second remote client can now join the same authoritative run on the same map without forcing a reset. This is still not a real lobby, but it proves that current sessions can be joined instead of only restarted. |
| Mar 30 | Next correction: remote runs were still lying about moment-to-moment survival contact because star push, planetoid push, and scavenger bump collision still existed only in the local client loop. |
| Mar 30 | Implementation lands: those remaining ship-contact hazards now run on the authoritative sim, star consumption now creates authoritative remnant wrecks, and the remote-authority suite can place a player into hazard cases directly to verify the server-owned force math. |
| Mar 30 | Follow-through: once the server owned those hazard/wave consequences, the remote client also had to replay the same pulse/growth/consumption rings locally. Otherwise the protocol would be honest about force math but still visually under-report the same events on remote runs. |
| Mar 30 | Follow-through on the follow-through: `player.pulse` cannot stop at a ring event on remote clients. The browser now reconstructs the same visual-only pulse splats and temporary well disruption locally so remote authority preserves combat readability without giving gameplay ownership back to the client. |
| Mar 30 | Remote snapshots were still lying about dynamic world state because the browser only patched shared array indices. That meant server-spawned wrecks could exist authoritatively and still fail to render remotely. The client now fully reconciles dynamic stars, wrecks, and planetoids from snapshots. |
| Mar 30 | The next real multiplayer lie was scavenger consequences. If the server owned scavengers but killed them instantly while the local game still had a visible death spiral and debris scatter, remote runs would stay structurally wrong. The server now owns that consequence chain too, and the client consumes it as authoritative outcome instead of local guesswork. |
| Mar 30 | After the server owned almost all run truth, the client was still visually single-player because it discarded every remote player except the local one. The browser now keeps and renders authoritative rival-player state so the visible client finally matches the multiplayer protocol. |
| Mar 30 | Next correction: a second browser selecting a different map could still act like an accidental host reset button. For real private multiplayer, joining the live authoritative session has to be the default behavior. |
| Mar 30 | Implementation lands: remote browser startup now treats an already-running authoritative session as truth, loads that session's map locally, and joins it instead of resetting the server to the later client's selected map. |
| Mar 30 | Next correction: once multiple remote clients can join the same run, one dead or finished client must be able to leave cleanly without resetting the whole authoritative session for everyone else. |
| Mar 30 | Implementation lands: the protocol now has an explicit leave path, and remote death/extraction flows exit the client from the session instead of resetting the server run out from under other players. |
| Mar 30 | Next correction: even with join/leave working, start/reset authority was still implicit. For real multiplayer, one client has to own host control and the server has to preserve that contract when players come and go. |
| Mar 30 | Implementation lands: the first joining client now becomes host, only the host can start/reset a live session, and host promotion happens automatically when the host leaves. |
| Mar 30 | Follow-through: the browser control plane now has to expose that host contract honestly. Map select should tell the player whether a live run exists, who the host is, whether this browser is the host, and whether launch will join or host-reset instead of hiding those semantics in server behavior. |
| Mar 30 | Next scale correction: the authoritative sim cannot keep charging `3x3` clocks against `5x5` and `10x10` worlds. Larger maps now get cheaper server-side tick, snapshot, and background-world cadences, while player/contact truth stays on the main tick. |
| Mar 31 | Next scale correction after clock profiles: larger maps still cannot afford whole-world background scans. The authoritative sim now also gates stars, wrecks, planetoids, and scavenger AI by alive-player relevance, and it reuses those filtered sets for nearby player-contact systems instead of paying full-world costs every tick. |
| Mar 31 | Next scale correction after relevance gating: larger-player sessions also need explicit AI and per-player hazard budgets, not just slower clocks and wider gates. The server now advertises and enforces those budgets so 4–8 player runs have a visible cost ceiling for ambient AI and nearby hazard work. |
| Mar 31 | Next scale correction after AI budgets: authoritative player motion itself also needs a visible ceiling. The server now caps per-player well, wave, pickup, and portal checks so large sessions stop paying whole-world force-source scans on every player tick. |


## Player Brain and Overload Architecture

### Q: What is the next architecture phase after the first authoritative client/server migration?

| Date | Event |
|------|-------|
| Mar 31 | After the first authoritative migration and the first round of scale budgets land, the remaining problem changes shape: the server is real, but it still derives too much hot-path truth procedurally from scattered player, item, and world state. |
| Mar 31 | EVE research reinforces three useful lessons for LBH: boxed derived player state, explicit overload/degradation, and coarse authority boundaries under load. |
| Mar 31 | Decision: the next architecture batch is no longer “move another system to the server.” It is `PlayerBrain`, overload state, coarse authoritative field authority, and explicit session profiles. |
| Mar 31 | First overload implementation lands: the sim now tracks moving tick-cost pressure plus player/AI/force pressure, projects effective clocks and budgets from explicit overload states, and exposes that state through session snapshots instead of hiding degradation inside scattered subsystem tweaks. |
| Mar 31 | First coarse-field implementation lands: medium and large authoritative sessions now rebuild a wrapped coarse field for orbital current, well pull, and wave push, while small maps stay on the direct-force model. |
| Apr 1 | The control plane becomes a real process boundary: a dedicated runtime now owns profile/session endpoints and sim-instance registration, while the authoritative sim talks to it through a client adapter instead of directly owning the persistence implementation. |
| Apr 2 | Local LBH is not a persistent world yet. Decision: the control plane may stay hot locally, but the sim should not remain alive by default once all human clients are gone. Empty sims should idle cheaply and auto-expire by default, while `keep-alive` remains an explicit host/debug choice. |
| Apr 12 | Review through the macOS-app and game-studio lenses concludes that LBH does not need a stack rewrite. The next leverage is productization: explicit runtime modes, a canonical stack launcher/status surface, a code-side design token bridge, and later structured telemetry/content manifests. |

**Options:**
1. **Keep iterating budgets and force caps only** — useful in the short term, but it keeps the server procedural and pushes the real scale problem forward.
2. **Jump straight to hosted sessions or engine migration** — premature while the server's internal truth model is still too ad hoc.
3. **Formalize boxed player truth, overload policy, coarse field authority, and session profiles** (chosen) — turns the current migration into a durable architecture instead of a long tail of tactical patches.

**Where it landed:** Option 3. The next architecture phase is now explicitly defined in `docs/project/PLAYER-BRAIN-AND-OVERLOAD-PLAN.md`.
**Door status:** Open — implementation is intentionally deferred until the design is reviewed, but the shape of the next work is now concrete.

| Apr 12 | First productization slice lands: runtime modes become first-class (`local-browser`, `local-host`, `remote-client`), `scripts/stack.js` becomes the canonical launch/status surface, and the first HUD token/primitives bridge moves pieces of `DESIGN-SYSTEM.md` into implementation code. |
| Apr 20 | Public product identity is now **Last Singularity**. The repo path may stay `last-black-hole` as a location detail, but app chrome, package metadata, build artifacts, nightly assets, and current project docs should use Last Singularity. |
| Apr 20 | Renderer contract snapshot: production gameplay kept a cheaper `FluidDisplayPass -> ASCIIPass` chain while `title-prototype.html` owned the richer Bloom visual canary. Superseded by Apr 23. |
| Apr 20 | Chronicle echoes are loot-bearing by contract. The sim only builds echoes from non-empty death cargo, and the control plane now rejects/filter empty-loot echo records so stale or malformed data cannot create misleading empty wrecks. |
| Apr 23 | Renderer contract update: production gameplay now defaults to the rich Composer chain (`FluidDisplayPass -> BloomPass -> TonemapPass -> ColorGradePass -> VignettePass -> ASCIIPass -> ChromaticAberrationPass -> ScanlinesPass`) and keeps `?minimalrender=1` as the explicit cheap perf baseline. |
| Apr 23 | Packaged desktop authority should be app-owned and session-local: Electron embedded control/sim processes use dynamic loopback ports with identity checks, not fixed dev/test ports, and macOS dock reopen restarts authority before loading the renderer. |
| Jun 22 | Steam Deck packaged play keeps that same self-contained contract: the renderer is loaded from local app-owned `lbh://` assets, Electron starts embedded control/sim child processes on Deck loopback, and Tailscale/SSH is deployment transport only. |


## Persistence and Control Plane Architecture

### Q: Where should durable player/session state live once LBH uses instanced authoritative sim processes?

| Date | Event |
|------|-------|
| Mar 31 | Greg confirms the intended long-term shape: persistent data store, instanced sim processes, and connected rendering clients rather than a monolithic server or streamed game client. |
| Mar 31 | Decision: durable profile and session truth should live outside disposable run instances, in a persistent data/control-plane layer that can hydrate sim instances and receive run results back from them. |

**Options:**
1. **Let each sim instance own persistence directly** — simplest short term, but it turns the database into part of the gameplay loop and makes run disposal messy.
2. **Split durable persistence/control-plane from disposable sim instances** (chosen) — keeps run truth authoritative while preserving clean teardown, future hosting, and safer profile ownership.
3. **Jump straight to a larger service mesh** — unnecessary at this stage; the contracts matter more than the deployment topology.

**Where it landed:** Option 2. The durable architecture is now defined in `docs/project/PERSISTENCE-AND-CONTROL-PLANE-PLAN.md`.
**Door status:** Open — implementation is deferred, but the server-side layering is now explicit enough to build toward cleanly.

| Mar 31 | Implementation lands: the first persistent control-plane slice now exists. Browser profiles carry stable ids, the sim bootstraps durable profile state on join, the server writes back death/extraction/abandon outcomes outside the tick loop, and the client resyncs its local profile from authoritative server truth after remote runs. |


## v0.3 Ballpark Authority Follow-Through

### Q: How should remote slingshot input survive client/server cadence?

| Date | Event |
|------|-------|
| Jul 4 | Review of the remote input path found that held boolean `slingshot` state could miss quick tap edges when engage/release happened between client POSTs. |
| Jul 4 | Decision: treat slingshot press intent as a queued edge stream in the protocol, while preserving the existing boolean field as a compatibility and held-state fallback. |
| Jul 4 | Implementation lands: clients send bounded `slingshotEdges`, the sim merges and dedupes them per player, consumes one edge per authority tick, returns accepted edge ids, and exposes pending edge count in snapshots for debugging. |

**Options:**
1. **Sample only the current held button** — simple, but it drops fast taps and makes slingshot feel unreliable under normal input cadence.
2. **Raise the input POST rate** — masks the problem with more network/process work and still does not guarantee edge delivery.
3. **Queue explicit slingshot press edges with server ack** (chosen) — gives the sim every intentional toggle while keeping release/engage consequences authoritative.

**Where it landed:** Option 3. `slingshotEdges` are protocol input facts; the sim owns capture/release outcomes and the client only drops pending edges after ack.
**Door status:** Closed for slingshot. Reuse the same edge-stream shape for future quick-tap authority actions before inventing another input latch.

### Q: Which Ballpark consequence should migrate after wreck pickup?

| Date | Event |
|------|-------|
| Jul 4 | Wreck pickup proved the candidate-only Ballpark adapter pattern: Ballpark can provide nearby bodies without taking over final gameplay mutation. |
| Jul 4 | Decision: migrate portal extraction next because extraction is a clean radius/candidate query with an existing authoritative outcome path and explicit tests. |
| Jul 4 | Implementation lands: portal extraction queries Ballpark for nearby available portal candidates, rematerializes the real portal object, and still performs exact `isPortalAvailable()` plus `portalCaptureRadius()` checks before setting escape outcome and events. |

**Options:**
1. **Migrate well death/contact next** — high value, but riskier because this is where feel, grace, kill radius, and visible hazard readability meet.
2. **Migrate portal extraction next** (chosen) — smaller blast radius, proves a second consequence family, and keeps mutation/outcome authority in the sim.
3. **Pause consequence migration until full ECS** — overkill; the candidate-adapter pattern is already useful and testable without a framework jump.

**Where it landed:** Option 2. Wreck pickup and portal extraction are now the first two Ballpark-backed consequence adapters. Death/contact remain the next high-risk migration family.
**Door status:** Open — continue one family at a time with parity/outcome tests before replacing old inline helpers.


## v0.4 Replication Compaction Follow-Through

### Q: Which bounded replication slice follows S7 residual attribution?

| Date | Event |
|------|-------|
| Jul 13 | Clean post-S6 canonical evidence rejects product admission at every normal 1/4/8 population. The 64 KiB/s mean guard leaves about 6.50 KB per pair at 10 Hz after non-state traffic, versus 14.43/18.25/18.94 KB observed. |
| Jul 13 | Privacy-safe attribution identifies high-frequency `runtimePublic` updates as the dominant public payload. Four/eight cadence and overload also fail, so recovered short-run CPU is not treated as a complete product result. |
| Jul 13 | Decision: prototype schema cleanup plus explicit field cadence first, preserving authority, exact materialization, stale-field semantics, and recovery. Do not lower 10 Hz, and do not select codec or AOI from upper-bound byte proxies alone. |
| Jul 13 | Canonical normal-one records one rejected ACK. Exact cause is not persisted, so exact-zero admission remains closed and publisher/adapter rejection-reason ordering diagnostics become a separate prerequisite before root-cause classification. |

**Options:**
1. **Lower publication cadence** — can reduce bytes, but violates the configured
   movement contract and may enlarge deltas.
2. **Schema cleanup plus explicit field cadence** (chosen) — removes or slows
   semantically unnecessary high-frequency fields before changing transport.
3. **Compact binary codec** — plausible later, but current lexical totals are a
   maximum opportunity rather than a measured implementation saving.
4. **Spatial AOI** — defer until a representative distance/visibility workload
   proves categories can be omitted safely.

**Where it landed:** Option 2. Preserve S6 prepared projections, implement one
bounded payload prototype, prove exact authority/client equivalence and
recovery, then rerun the unchanged S7 gate.
**Door status:** Closed for cadence-cap, codec-first, and AOI-first. Open for the
bounded schema/field-cadence prototype and the independent ACK-reason diagnostic.

### Q: What follows the converged positional S11 admission gate?

| Date | Event |
|------|-------|
| Jul 13 | Canonical S11 binds prepared sparse positional JSON, bounded 8 MiB/client ledgers, exact normal 1/4/8 and churn 1/8 windows, and checksummed S7-S10 comparisons. Validation passes; product admission rejects. |
| Jul 13 | One client passes. Four clients are correctness-clean but deliver 6.577 Hz, normalize to 72,211 B/s, and become `DEGRADED`. Eight clients include a 0 Hz receiver, exceed burst/normalized traffic, miss the projection clock, become `DILATED`, and fail closed-world ACK terminal conservation. |
| Jul 13 | Decision: continue positional schema cleanup first. Binary remains second, compression third, and cadence fourth as an explicit product/field-age policy rather than optimization credit. AOI remains deferred. |

**Options:**
1. **Additional positional schema cleanup** (chosen) — attacks the measured
   envelope without changing authority, privacy, reconstruction, or transport
   semantics.
2. **Binary codec** — potentially broader structural savings, with higher
   protocol/versioning/debug cost and a new equivalence burden.
3. **Compression** — defer behind uncompressed cleanup because eight-client
   CPU and tail latency already fail.
4. **Deliberate cadence policy** — only after defining field age and latency;
   overload collapse receives no admission credit.
5. **AOI** — defer until representative visibility/distance evidence proves
   safe omission and lifecycle behavior.

**Where it landed:** Option 1. Close the remaining four-client 667 B/pair gap
without conflating it with eight-client CPU/cadence failures, then rerun the
same admission gate.
**Door status:** Closed for current product admission, implicit cadence
reduction, compression-first, and AOI-first. Open for one bounded positional
schema cleanup prototype with unchanged correctness and recovery contracts.

### Q: What does S13 establish about the S12 cadence collapse?

| Date | Event |
|------|-------|
| Jul 13 | S12 evaluates and serializes all four safe public/owner lane combinations, but every representative pair still chooses public delta plus owner keyframe and 4/8-player cadence collapses. |
| Jul 13 | S13 runs two fixed-seed, order-counterbalanced machine-local pairs. Both use one separate authority process for one match; only receiver placement changes from one shared coordinator process to one process per receiver. |
| Jul 13 | Decision: receiver/coordinator event-loop co-location is not the primary cause. Per-receiver process isolation changes four-player authority cadence by +0.10/0.00 Hz and eight-player cadence by +0.05/-0.05 Hz; all 4/8 runs remain `DILATED`. |
| Jul 13 | Next slice: preserve the exact S12 winner but avoid four full candidate serializations. Do not infer configured-10-Hz, concurrent-match, hosted, or 24/48/96 capacity from throttled-cadence CPU. |

**Options:**
1. **Move each receiver into its own process and call the problem solved** —
   rejected by the paired evidence; authority cadence does not materially
   recover.
2. **Remove repeated candidate serialization at the authority boundary**
   (chosen) — attacks the measured projection/publish bottleneck while keeping
   the exact pair winner and protocol semantics.
3. **Forecast larger matches or fleet packing now** — rejected until one
   authority can sustain the target cadence and heavier sim sizes are measured
   directly.

**Where it landed:** Option 2. The S13 result attributes this experiment's
collapse to work at or inside the instrumented authority boundary, not to the
receivers sharing the coordinator event loop.
**Door status:** Closed for receiver-placement as the primary fix and for
high-count/hosted extrapolation. Open for serialize-the-winner-once authority
work with unchanged correctness, privacy, recovery, and exact-wire choice.

### Q: Does S14's serialize-once selector admit four or eight players?

| Date | Event |
|------|-------|
| Jul 13 | Exact component sizing matches S12's brute-force oracle for 1,320 adversarial and representative comparisons with zero mismatch. |
| Jul 13 | Complete positional candidate compositions fall from four to one per selection; the selector microbenchmark is 2.01x faster with a 27.10% smaller positional allocation proxy. |
| Jul 13 | In the S13 isolated process boundary, one player passes. Four reaches 5.25 Hz and eight 3.05 Hz; both remain `DILATED`, miss normalized traffic, and fail admission. |
| Jul 13 | Decision: keep S14, but do not promote multiplayer admission. Reuse already-computed exact canonical lane sizes before choosing any broader codec, cadence, hosted, or high-count lane. |

**Door status:** Open for exact lane-size reuse with byte-identical output and
unchanged limits. Closed for treating S14 as 4/8 admission, crediting collapsed
cadence as bandwidth savings, or beginning hosted/24/48/96 extrapolation.

### Q: Does S15 canonical lane reuse admit four or eight players?

| Date | Event |
|------|-------|
| Jul 13 | S15 reuses four exact canonical lane texts/counts within each same-operation expanded-limit check; 1,320 oracle comparisons and both deterministic transcripts remain exact. |
| Jul 13 | Direct S15 adversarial proof covers expanded/positional sizes, boundaries, decode, and invalid canonical values; exact-source-bound, order-counterbalanced microbenchmarks remove every expanded lane reserialization and improve selector p50 15.99%, but the one-match authority still reaches only 5.35 Hz at four and 3.25 Hz at eight. |
| Jul 13 | Decision: keep the exact reuse, reject 4/8 admission, close additional positional cleanup as the default next move, and prototype a bounded binary state-pair codec against the JSON oracle. |

**Options:**
1. **Continue shaving positional JSON composition** — measurable but now
   insufficient after two exact cleanup lanes; four/eight remain clock-bound.
2. **Bounded binary state-pair codec** (chosen) — test structural and CPU
   savings while preserving JSON fallback, exact semantics, and all authority
   contracts.
3. **Compression or implicit cadence reduction** — still deferred because CPU
   tails fail and collapsed cadence cannot receive bandwidth credit.
4. **Hosted or 24/48/96 extrapolation** — remains premature until 4/8 target
   cadence and heavier sim fixtures are admitted.

**Where it landed:** Option 2. Binary is a prototype/bakeoff lane, not a
promotion; positional JSON remains the exact oracle and fallback.
**Door status:** Closed for S15 as 4/8 admission and for more unmeasured
positional shaving. Open only for the bounded binary codec prototype with
unchanged authority, ACK, recovery, privacy, cadence, and admission policy.
