# True P2P History, Failure Modes, And Network Budgets

> Research snapshot: 2026-07-10. Historical dates below are publication or
> presentation dates, not claims that an old implementation still describes a
> current service.

## Executive conclusion

LBH should **reject a true no-authority P2P topology as its production 4–8
player architecture**. It conflicts with the strongest v0.3 asset: one run has
one sim-owned causal truth. It would also require a near-rewrite of the
JavaScript simulation for cross-platform determinism, make every peer a trust
root for loot and progression, and turn an ordinary disconnect or partition
into an unsolved choice between pausing, forking the run, or silently electing
an authority.

LBH should **keep relay-assisted player-hosted authority as a private-play and
long-tail fallback**, but name it accurately: it is a listen server, not true
P2P. The existing run authority, credentials, stamped inputs/events, snapshot
ring, reconnect, and host promotion are the right conceptual starting pieces.
The private topology still needs prediction, a datagram transport, migration
snapshots, host election, NAT/relay service, and an explicit rule that durable
profile settlement is cloud-verified or unranked.

LBH should **prototype deterministic replay and short-horizon rollback only as
tools supporting an authoritative model**. A deterministic simulation kernel
would improve replay, reconciliation, testing, and host migration even if no
peer ever becomes an equal gameplay authority. A small authority-free lab is
worth running only as a bounded falsification exercise, not as the default
roadmap.

The bandwidth result is not the blocker at 4–8 players. A carefully bundled
input/hash mesh is roughly **82/124/165 kbit/s per peer without voice** and
**214/344/473 kbit/s per peer with full-mesh voice** at 4/6/8 players under the
model below. The blockers are determinism, all-pairs connection quality,
rollback cost, cheating, partition settlement, privacy, and operational
complexity. By contrast, naively sending the current 107.88 KiB p95 full
snapshot at 10 Hz would cost about **8.84 Mbit/s per stream** and is plainly not
a viable P2P primitive.

## Terms: four architectures that are often all called “P2P”

| Topology | Gameplay authority | Data paths | What happens when the special node leaves? | Accurate label |
|---|---|---|---|---|
| Deterministic lockstep mesh | Every peer reproduces the same state from the same ordered inputs; no permanent physics authority | Usually all-to-all input exchange | Everyone stalls, drops the peer by a shared rule, or runs a membership consensus | True replicated P2P |
| Rollback mesh | Every peer predicts and re-simulates the same deterministic state; no permanent physics authority | Usually all-to-all input exchange | Same membership problem as lockstep; late inputs may force rollback | True replicated P2P |
| Distributed object authority | Different peers own different objects or regions | Owner-to-subscribers plus arbitration/replication | Ownership must migrate; cross-owner conflicts need a serialization rule | True distributed P2P, but authority still exists per object |
| Player-hosted sim / listen server | One player process is the authoritative server | Every client talks to the host, directly or via relay | Elect a new host and restore a sufficiently recent authoritative snapshot | Peer-hosted client/server, **not** true P2P |

This distinction matters. Microsoft’s current Xbox QoS guidance separately
defines peer-to-peer, where every client must connect to every other client,
and peer-to-host, where every client connects to one common host
([Microsoft GDK, accessed 2026-07-10](https://learn.microsoft.com/en-us/gaming/gdk/docs/services/multiplayer/matchmaking/concepts/live-matchmaking-target-session)).
Valve’s APIs use `P2P` in connection names even when one endpoint is a dedicated
server; that is a transport/addressing facility, not a claim of distributed
gameplay authority
([Steam Datagram Relay documentation, accessed 2026-07-10](https://partner.steamgames.com/doc/features/multiplayer/steamdatagramrelay)).

## Historical case studies

| Example | Actual model | What worked | What failed or remained costly | LBH lesson |
|---|---|---|---|---|
| **Age of Empires I/II** (Ensemble, GDC 2001) | Replicated deterministic simulation with commands scheduled ahead; a designated host adjusted communications timing | Eight players and thousands of objects over 28.8 kbit/s modems were feasible because peers sent commands rather than world state | The game ran at the pace of the slowest machine/link. Tiny divergence compounded into later out-of-sync failures; debugging required checksums, 50 MB traces, and strict seeded-random call discipline | Lockstep is excellent when commands are sparse and latency tolerance is hundreds of milliseconds. LBH’s continuous analog movement is a much worse fit |
| **GGPO** (created 2009; author documentation current in 2026) | Deterministic input P2P with prediction, save/load, rollback, and re-simulation | Local input can take effect immediately rather than waiting for the remote input | The whole gameplay simulation must be deterministic, cheap to save, cheap to restore, and cheap to run repeatedly; corrections still exist when prediction is wrong | Use the rollback discipline for prediction/reconciliation research, not as proof that an 8-player fluid consequence sim is ready for equal-peer authority |
| **Diablo** (1996; creator postmortem in 2016) | Player machines held trusted gameplay state in a peer-oriented design | Low hosting burden and easy direct cooperative play | David Brevik’s retrospective account says the team immediately discovered uploaded cheats could let everyone cheat | Never let an untrusted peer mint authoritative loot, extraction, credits, or durable profile facts |
| **DirectPlay-era / console host migration** (protocol published by Microsoft; current archival spec updated 2024) | A player-hosted session elects another peer after the host drops | A session can survive host departure when membership and state are replicated enough | Partitions can produce multiple host candidates; name tables and state must be reconciled before migration completes | Election is only half of migration. LBH needs a canonical run snapshot, input/event watermarks, epoch change, credential rotation, and settlement fencing |
| **Destiny 1** (Bungie, GDC 2015) | Hybrid cloud plus traditional P2P with a player “Physics Host” | Low-latency cooperative physics and cloud-backed shared-world services coexisted | Bungie’s talk devotes explicit machinery to host handoff, ungraceful migration, and recovering a new authoritative simulation state | A sophisticated commercial “P2P” example still chose a physics authority; this supports player-hosted authority, not authority-free simulation |
| **Colyseus** (NSDI 2006 research) | Distributed object store: every object had exactly one primary authoritative copy and weakly consistent replicas | Quake II experiments showed prefetching and locality could distribute work and preserve low-latency reads | Ownership, discovery, prefetch, and replica freshness remained complex; it did not remove serialization authority | If LBH ever shards, keep a single writer per body/run. “Distributed” does not require multi-writer gameplay truth |
| **Donnybrook** (SIGCOMM 2008 research) | Peer-managed object ownership, interest sets, low-fidelity doppelgängers, and peer forwarding | A Quake III prototype and simulations showed attention-based updates could scale; the design targeted 100–150 ms fresh updates | Strict NAT users were excluded; relay support, Internet deployment, and defenses against unfair advantage were future work. Its 900-player result was simulation, not a shipped commercial population | Valuable relevance and low-fidelity-replica ideas; not evidence that authority-free commercial play or anti-cheat is solved |
| **Steam Datagram Relay / modern WebRTC** (current standards/services) | Direct peer paths when possible, relay paths when necessary; neither decides gameplay authority | NAT traversal, authenticated/encrypted traffic, IP hiding, and relay fallback make internet sessions practical | Relay introduces infrastructure cost and another network leg. Direct exposure can reveal player IPs and invite DoS | “No game server” does not mean “no service.” Private internet play still needs signaling, identity, NAT traversal, relay, abuse limits, and observability |

Primary accounts support the table’s main claims:

- Ensemble’s 2001 paper says AoE passed identical commands into simultaneous
  simulations, scheduled commands two communications turns ahead, and could
  only run as fast as the slowest machine and link. It also documents the
  out-of-sync debugging burden
  ([Bettner and Terrano, GDC 2001](https://www.gamedevs.org/uploads/1500-archers-age-of-empires-network-programming.pdf)).
- GGPO requires deterministic simulation plus save, load, and fast
  re-simulation; it predicts missing remote input and rolls back when the guess
  differs
  ([Tony Cannon, GGPO documentation, accessed 2026-07-10](https://www.ggpo.net/)).
- Brevik’s direct postmortem admission about Diablo’s peer-to-peer cheating is
  reported from his GDC 2016 session
  ([Ars Technica, 2016-03-18](https://arstechnica.com/gaming/2016/03/post-mortem-ms-pac-man-diablo-dissected-by-their-original-devs/)).
- Bungie describes Destiny as an intersection of traditional P2P and cloud
  servers, including ungraceful host migrations; its slides state that losing
  the Physics Host requires electing a new host and obtaining a new
  authoritative state
  ([Justin Truman, GDC 2015](https://media.gdcvault.com/gdc2015/presentations/Truman_Justin_Shared_World_Shooter.pdf)).
- Colyseus serialized every object’s updates through exactly one primary copy
  even though replicas and execution were distributed
  ([Bharambe et al., NSDI 2006](https://www.usenix.org/legacy/event/nsdi06/tech/full_papers/bharambe/bharambe_html/main.html)).
- Donnybrook measured 32-byte ordinary Quake III deltas, about 44 bytes of
  authenticated network header, and quadratic point-to-point traffic. Its
  conclusion explicitly reserved Internet deployment and cheating defenses as
  future work
  ([Bharambe et al., SIGCOMM 2008](https://www.microsoft.com/en-us/research/wp-content/uploads/2016/02/donnybrook.pdf)).

### Why true P2P remains attractive

The appeal is real. An input-only mesh moves bulk simulation compute and
bandwidth to players, avoids paying a gameplay server for every active run,
can keep private play alive after official hosting ends, gives each player
immediate access to its local simulation, and avoids one player-host bottleneck
or host advantage. Replicated peers can also provide redundant checkpoints and
forensic hashes.

Those advantages are strongest for deterministic games with small state,
sparse inputs, no valuable hidden information, no durable economy, and players
who already trust one another. LBH instead has analog movement, many dynamic
consequences, hidden/relevance-filterable information, collectible value,
extraction outcomes, and durable progression. At only 4–8 players, dedicated
one-run authorities are small enough that distributing consensus is unlikely
to save more money than it costs in engineering, support, fraud, and degraded
feel. Private trusted play is the narrow lane where the trade becomes credible.

## Fit against the current LBH simulation

### The answer today: not deterministic enough for cross-target lockstep

The current authoritative runtime is seeded in many important places, but it is
not a deterministic replay kernel. It uses JavaScript `Number` math and many
transcendental operations (`sin`, `cos`, `atan2`, `hypot`, `pow`, `exp`), live
`Map`/array traversal, some `Math.random`, `Date.now`, random UUIDs, and
runtime-generated identifiers. Some of those are cosmetic or boundary-only,
but lockstep requires proving that **every causally relevant call** is isolated
or deterministic.

This is not merely generic floating-point anxiety. The ECMAScript specification
defines functions such as `Math.sin` as returning an
“implementation-approximated” result
([ECMA-262 2024, §21.3.2.30](https://tc39.es/ecma262/2024/multipage/numbers-and-dates.html#sec-math.sin)).
That prevents a bit-identical cross-engine/cross-architecture guarantee unless
LBH supplies its own deterministic math. WebAssembly narrows the execution
surface, but the core specification still permits nondeterministic NaN signs
and payload selection outside a deterministic profile
([WebAssembly Core specification, accessed 2026-07-10](https://webassembly.github.io/reference-types/core/bikeshed/)).

The GPU ASCII/fluid presentation is an even harder boundary. Shader precision,
texture formats, drivers, and undefined or implementation-defined behavior are
not suitable gameplay consensus inputs; WebGL itself inherits and tightens a
number of OpenGL ES implementation-defined/undefined cases
([Khronos WebGL 2.0 specification, accessed 2026-07-10](https://registry.khronos.org/webgl/specs/latest/2.0/)).
The GPU fluid should remain presentation. If gameplay samples a fluid field, a
separate CPU/WASM fixed-step authoritative field must define the sample.

Making lockstep plausible would require all of the following:

1. Extract a headless, side-effect-free simulation kernel with a fixed tick and
   an explicit state schema.
2. Replace causal `Math.random`, wall clock, UUID, unordered iteration, and
   external async completion with stamped deterministic inputs.
3. Choose fixed-point/integers or a controlled software/WASM numeric profile;
   ship deterministic transcendental approximations where required.
4. Define stable ordering for every contact, pickup, AI decision, spawn,
   collision, and same-tick tie.
5. Make complete gameplay state cheap to snapshot, restore, hash, and replay.
6. Prove bit-identical results across macOS x64/arm64, SteamOS/Deck, supported
   Windows targets, and every supported web runtime over long seeded runs.
7. Separate irreversible presentation/audio effects from speculative ticks.

Those changes may be valuable, but they are a major architecture program, not a
network transport feature.

### Movement makes delay and correction a product cost

AoE could tolerate commands issued every 1.5–2 seconds and normally used
roughly 200 ms communications turns. LBH samples continuous analog intent at a
15 Hz authority tick (66.7 ms/tick), and its movement design discusses
forgiveness windows around 75–150 ms. A two-tick lockstep delay is already
133 ms before display/render latency. That consumes the whole intended feel
budget.

Rollback keeps the local ship responsive, but an 8-player analog mesh predicts
seven remote input streams. When several ships interact with the same wave,
well, wreck, pulse, or portal, a late input can revise shared consequences and
force visible position corrections, repeated effects, or revoked loot. This is
more damaging than a fighting game correcting one opponent’s animation because
the fluid movement is LBH’s terrain and identity.

## Conflict, cheating, departure, and settlement

### No-authority conflict rule

An honest deterministic mesh can resolve simultaneous actions by total order:
`(runEpoch, tick, inputSeq, playerId)`. For example, if two players reach the
same wreck on one tick, the lower stable player id wins after swept-contact
ordering. Every peer can compute the same result.

That solves honest concurrency, not adversarial timing. A peer can wait to see
others’ inputs, lie about its own, suppress a losing packet, modify hidden
state, or simply run patched code. A commit/reveal protocol prevents some
look-ahead attacks by first broadcasting a commitment and later revealing the
action, but it adds another synchronization phase. Formal cheat-proof P2P
protocol work acknowledges the performance penalty
([Baughman, Liberatore, and Levine, IEEE/ACM ToN, February 2007](https://citeseerx.ist.psu.edu/document?doi=0940bc8924d6bfc73540eafe2675644906960ebc&repid=rep1&type=pdf)).
At LBH’s 15 Hz tick, a naive commit then reveal turns one input exchange into
two network waits—unacceptable for direct movement unless heavily pipelined,
which restores a look-ahead/delay tradeoff.

### Partitions force a product decision

If a mesh splits 4–4, both halves cannot continue minting one canonical run
while also remaining available. The choices are:

- **halt:** preserves one truth, but one bad route or malicious peer can freeze
  the game;
- **fork:** preserves play, but produces two incompatible run outcomes and
  duplicate progression;
- **quorum:** only the majority continues, which strands the minority and is
  ambiguous in even splits;
- **elect an authority:** restores the existing one-authority model under a new
  name;
- **external arbiter:** restores a centralized truth/settlement service.

This is a concrete instance of the consistency/availability tradeoff under a
partition formalized by Gilbert and Lynch
([Brewer’s Conjecture and the Feasibility of Consistent, Available,
Partition-Tolerant Web Services, 2002](https://www.cs.princeton.edu/courses/archive/fall22/cos418/papers/cap.pdf)).
More generally, deterministic consensus cannot guarantee termination in a
fully asynchronous system with even one crash fault
([Fischer, Lynch, and Paterson, JACM 1985](https://groups.csail.mit.edu/tds/papers/Lynch/jacm85.pdf)).
LBH does not need a blockchain or Byzantine state machine for an eight-player
run; it needs a clear authority and recovery policy.

### Failure and cheat matrix

| Failure or abuse | Lockstep / rollback mesh | Distributed object authority | Player-hosted authority | Dedicated authority |
|---|---|---|---|---|
| One slow peer | Delays/stalls everyone or causes deep rollback | Its objects go stale; cross-owner actions block or predict | Mostly hurts that client; bad host hurts everyone | Mostly hurts that client |
| Peer disconnect | Membership agreement, deterministic AI takeover, or halt | Ownership migration and replica promotion | Host migration only if the host left; otherwise remove client | Remove/reconnect client |
| Network partition | Halt, fork, or quorum; no free canonical answer | Split-brain owners unless leases/quorum exist | Non-host side loses authority; host side can continue | Clients reconnect to the same authority |
| False movement/input | Other peers cannot know whether local input device truth is honest; commit/reveal only limits timing cheats | Owner can forge owned state | Host validates client inputs, but a cheating host can forge all facts | Server validates inputs and consequences |
| Loot/extraction forgery | Patched peers can agree dishonestly or disagree; durable settlement needs signatures/arbitration | Item owner can forge unless another service verifies | Host can forge unless session is unranked or settlement is verified | Server signs canonical result |
| Hidden-information/map hack | Full replicated state exposes it locally | Replicas expose whatever is distributed | Host sees all; clients can receive relevance-filtered views | Server can withhold irrelevant/secret state |
| Look-ahead / lag switch | Fundamental risk; commit/reveal adds delay | Owner timing can bias conflicts | Server/host timestamps and rejects late commands; malicious host remains | Server timestamps and rejects late commands |
| Host manipulation | No host, but colluding/malicious peers remain | Each owner is a smaller host/trust root | Material risk; private sessions can accept it, ranked play cannot | Operations compromise is the trust risk |
| DDoS / IP exposure | Every direct edge exposes more peers | Same | Direct host is a target; relay hides addresses | Relay/proxy hides server and client addresses |
| Forensics/moderation | Conflicting local logs | Many partial logs | Host log is useful but not trustworthy against host | Canonical event log and server telemetry |

## Connectivity and topology at 4–8 players

A full mesh has `E = N(N-1)/2` bidirectional relationships:

| Players | Mesh relationships | Remote neighbors per peer | Player-hosted relationships |
|---:|---:|---:|---:|
| 4 | 6 | 3 | 3 |
| 6 | 15 | 5 | 5 |
| 8 | 28 | 7 | 7 |

The player-hosted column has the same count of logical host-client
relationships as the host’s neighbor count, but non-host clients do not need
all-pairs reachability. In a true mesh, session quality is set by the worst of
6, 15, or 28 routes, not by an average ping. Xbox’s peer-to-peer initialization
accordingly requires every client to connect to every other client and exposes
maximum latency and minimum bandwidth constraints
([Microsoft GDK QoS, accessed 2026-07-10](https://learn.microsoft.com/en-us/gaming/gdk/docs/services/multiplayer/matchmaking/concepts/live-matchmaking-target-session)).

ICE gathers host, server-reflexive, and relayed candidates and performs STUN
connectivity checks; TURN supplies a relay allocation when a direct pair cannot
connect
([RFC 8445, July 2018](https://www.rfc-editor.org/info/rfc8445/),
[RFC 8656, February 2020](https://www.rfc-editor.org/rfc/rfc8656.html)).
Therefore an internet product must assume:

- a signaling/rendezvous service even when gameplay is direct;
- STUN plus TURN/relay capacity, not STUN alone;
- encrypted/authenticated datagrams, replay protection, rate limits, and
  bounded decode work;
- ICE restart/path change handling for Wi-Fi changes, sleep/resume, and
  reconnect;
- relay-region selection and metrics for direct versus relayed paths;
- player-IP privacy. Unity’s current documentation recommends Relay or
  distributed-authority networking over direct client hosting specifically to
  handle NAT/firewalls and hide player addresses
  ([Unity Multiplayer Services, accessed 2026-07-10](https://docs.unity.com/en-us/mps-sdk/manage-session-network-connection)).

Valve’s Steam Datagram Relay can relay P2P or dedicated-server traffic, hides
IP addresses, and authenticates, encrypts, and rate-limits traffic
([Steamworks networking, accessed 2026-07-10](https://partner.steamgames.com/doc/features/multiplayer/networking)).
It is attractive for a Steam-first private fallback, but cross-store/platform
availability is conditional and should not become LBH’s only abstract
transport.

## Quantitative network model

### Assumptions

These are planning budgets, not measurements of a future implementation. All
rates are decimal kbit/s and include an approximate encrypted datagram envelope.
IPv6, WebRTC/SCTP, relay framing, retransmission, and vendor implementation can
be higher. UDP applications must implement congestion control and avoid harmful
fragmentation
([RFC 8085, March 2017](https://datatracker.ietf.org/doc/html/rfc8085.html)).

| Lane | Assumption | Per-neighbor rate |
|---|---|---:|
| Input + rollback redundancy | 15 packets/s; each 128 bytes on wire; packet carries current and two prior compact input samples | 15.36 kbit/s |
| Ordered gameplay events | 2 packets/s; 144 bytes on wire; reliable/retransmitted selectively | 2.30 kbit/s |
| Hash, ACK, clock, liveness | 2 packets/s; 128 bytes on wire | 2.05 kbit/s |
| **Rounded deterministic core** | Sum above plus small batching variance | **20 kbit/s** |
| Voice | Opus-like 24 kbit/s payload, 20 ms packets; about 48 bytes transport/security overhead × 50/s | **44 kbit/s** |
| Repair checkpoint | 16 KiB compressed state every 5 seconds from one rotating source | **26.3 kbit/s per recipient while sourced** |
| Distributed-state delta | 1.5 KiB application delta + two packet envelopes, 10 Hz | **130.6 kbit/s per neighbor** |
| Optional cloud telemetry | Batched counters/errors, not raw snapshots | **2 kbit/s per peer upstream** |

Input-history memory is local, not network traffic. At 15 Hz, an eight-tick
rollback window covers 533 ms. If a compact rollback state were 256 KiB, nine
states (current plus eight prior) would be 2.25 MiB per peer; if it were 1 MiB,
the same ring would be 9 MiB. The real risk is CPU: a five-tick correction can
require five simulation ticks before the next render deadline, and multiple
late peers can move the earliest divergence farther back.

### Formula

For a full-mesh deterministic-input design:

```text
normal upstream(N)   = (N - 1) * (20 core + 44 voice)
                     + 26.3 * (N - 1) / N rotating-checkpoint average
                     + 2 telemetry

normal downstream(N) = same average in a symmetric mesh

no-voice(N)           = normal(N) - (N - 1) * 44

selected repair-source burst = (N - 1) * 26.3 kbit/s checkpoint upload
```

For distributed object/state ownership, replace the 20 kbit/s core per
neighbor with `20 + 130.6 = 150.6 kbit/s`. This optimistic model assumes each
peer publishes only its owned delta; shared-world arbitration traffic is not
included.

### Per-peer input/hash mesh budget

| Players | No-voice upstream | No-voice downstream | With-voice upstream | With-voice downstream | Approx packets/s with voice |
|---:|---:|---:|---:|---:|---:|
| 4 | 82 kbit/s | 82 kbit/s | 214 kbit/s | 214 kbit/s | 207 |
| 6 | 124 kbit/s | 124 kbit/s | 344 kbit/s | 344 kbit/s | 345 |
| 8 | 165 kbit/s | 165 kbit/s | 473 kbit/s | 473 kbit/s | 483 |

Packet rate assumes 19 gameplay/control packets plus 50 voice packets per
neighbor each second before batching. Voice mixing through a service would
replace full-mesh voice with one upstream and one mixed downstream stream, but
that is centralized media infrastructure. Bundling voice is generally a poor
latency trade; bundling input/control by destination is useful.

At 8 players the rotating checkpoint average is only about 23 kbit/s per peer,
but the selected source briefly sends about 184 kbit/s of checkpoint data in
addition to normal traffic. Rate-limit checkpoint fragments so this burst does
not queue fresh inputs on asymmetric home uplinks.

### Per-peer distributed-state mesh budget

| Players | No-voice upstream | No-voice downstream | With-voice upstream | With-voice downstream |
|---:|---:|---:|---:|---:|
| 4 | 474 kbit/s | 474 kbit/s | 606 kbit/s | 606 kbit/s |
| 6 | 777 kbit/s | 777 kbit/s | 997 kbit/s | 997 kbit/s |
| 8 | 1,079 kbit/s | 1,079 kbit/s | 1,387 kbit/s | 1,387 kbit/s |

This remains bandwidth-feasible on many current fixed connections, but it is
far less tolerant of asymmetric uplinks, Wi-Fi contention, tethering, relays,
and burst loss. More importantly, it assigns each peer an authoritative shard
and still needs a deterministic cross-shard transaction rule for collision,
pickup, force pulse, signal, death, and extraction.

### Optimized player-hosted authority comparison

For comparison, suppose a listen host receives the 20 kbit/s input/control
lane from every client and sends each a 150.6 kbit/s relevance-filtered
authoritative delta/event stream. This is still a planning assumption, not a
measurement:

| Players | Host upstream | Host downstream | Each non-host upstream | Each non-host downstream |
|---:|---:|---:|---:|---:|
| 4 | 452 kbit/s | 60 kbit/s | 20 kbit/s | 151 kbit/s |
| 6 | 753 kbit/s | 100 kbit/s | 20 kbit/s | 151 kbit/s |
| 8 | 1,054 kbit/s | 140 kbit/s | 20 kbit/s | 151 kbit/s |

Voice is excluded because the topology choice is separate: full-mesh voice
adds 44 kbit/s per remote player to every peer, while a media service adds one
encode upstream and one mixed downstream but creates hosted cost and moderation
surface. The listen model concentrates gameplay egress and CPU on the host but
does not require non-host clients to maintain all-pairs gameplay connectivity.
It also preserves one causal simulation, making it dramatically simpler than
the distributed-state mesh at the same approximate bandwidth order.

### Why current full snapshots cannot be the mesh protocol

The v0.3 roadmap records a 107.88 KiB p95 snapshot in the Deep Field evidence.
Using that p95 as a deliberately conservative payload and the Shallows 10 Hz
cadence:

```text
one stream = 107.88 * 1024 bytes * 10/s * 8 = 8.84 Mbit/s
```

| Players | Full-mesh upstream/downstream per peer | Listen-host upstream | Non-host downstream |
|---:|---:|---:|---:|
| 4 | 26.5 Mbit/s | 26.5 Mbit/s | 8.84 Mbit/s |
| 6 | 44.2 Mbit/s | 44.2 Mbit/s | 8.84 Mbit/s |
| 8 | 61.9 Mbit/s | 61.9 Mbit/s | 8.84 Mbit/s |

This combines a large-map size with a small-map cadence and therefore is a
stress bound, not a forecast of a production relevance-filtered stream. It
does prove the architecture requirement: multiplayer needs schema-driven
deltas, per-player relevance, event lanes, quantization, compression, and
occasional checkpoint/rebase. Replicating the current JSON-like full snapshot
is not an option.

### Session and relay aggregate

For the 8-player input/hash model with voice, aggregate endpoint upload is
approximately `8 * 473 = 3.78 Mbit/s`. If every edge is relayed, the relay fleet
must ingest and forward roughly that gameplay/media rate, plus transport
overhead and retransmits. Endpoint rates do not halve merely because a relay is
present. A player-hosted server is cheaper in relationship count for non-hosts,
but concentrates aggregate authoritative egress on the host; host selection
must enforce upstream headroom, CPU headroom, route quality, power/suspend
state, and NAT/relay reachability.

## Latency, jitter, and loss gates

These are proposed LBH prototype gates, not universal game-industry constants.
They deliberately protect Movement Is the Game.

| Measure | Green | Degraded but playable | Reject / migrate / end session |
|---|---:|---:|---:|
| Pairwise RTT p95 | ≤80 ms | 80–120 ms | >150 ms sustained |
| Jitter p95 (one-way estimate or packet-spacing variation) | ≤15 ms | 15–30 ms | >40 ms sustained |
| Packet loss over 10 s | ≤1% | 1–3% | >5% sustained |
| Reordered/late input | ≤1 tick typical | 2–3 ticks | >4 ticks recurring |
| Rollback correction | ≤2 ticks (133 ms) | 3–4 ticks (200–267 ms) | >6 ticks (400 ms) |
| Fresh authoritative/repaired state | ≤100 ms movement lane | 100–200 ms | >250 ms recurring |

Donnybrook’s review of fast action cited degradation beyond roughly 100 ms and
unacceptable experience at 200 ms, while its own design sought 100–150 ms
freshness
([Bharambe et al., 2008](https://www.microsoft.com/en-us/research/wp-content/uploads/2016/02/donnybrook.pdf)).
A controlled Unreal Tournament 2003 study found typical loss less important
than latency for its tested movement and shooting tasks, but that result is
genre- and implementation-specific rather than permission to ignore burst loss
([Beigbeder et al., NetGames 2004](https://web.cs.wpi.edu/~claypool/papers/ut2003/)).

Threefold input redundancy makes isolated loss cheap: if loss events were
independent at 3%, losing all three copies would be `0.03^3 = 0.0027%`.
Real loss is bursty, so the harness must test Gilbert-Elliott-style bursts, not
only independent random loss. No reliability queue may block current input
behind an old checkpoint or cosmetic event.

Session reliability also worsens with peer count. If each peer independently
has a 99% chance of remaining connected for an hour, all eight remain with
probability `0.99^8 = 92.3%`; at 95% individual survival it is only
`0.95^8 = 66.3%`. Reconnect and AI takeover are normal paths, not edge cases.

## Recommendation by variant

| Variant | Decision | Reason |
|---|---|---|
| Full-state mesh using current snapshots | **Reject** | Tens of Mbit/s per peer and no conflict/cheat solution |
| Cross-platform deterministic lockstep for production | **Reject for v0.4** | Continuous movement delay, current non-deterministic kernel, slowest-peer coupling, durable-economy trust |
| 4–8 player authority-free rollback mesh | **Research spike only** | Better local response, but seven prediction streams, shared-world rollback artifacts, settlement and cheating remain |
| Distributed per-object authority | **Reject for current scale** | Solves a scale LBH does not have while multiplying trust roots and cross-object transaction complexity |
| Direct-IP player-hosted authority | **LAN/dev only** | Simple and cheap, but NAT failure, player-IP exposure, host DoS, and poor migration UX |
| Relay-assisted player-hosted authority | **Keep as private fallback** | Reuses one-run/one-authority; affordable bandwidth; needs host trust labeling and migration |
| Dedicated run authority with client prediction/rollback | **Production baseline to compare elsewhere** | Best match for current Ballpark/EVE-inspired authority, anti-cheat, canonical outcomes, and recovery |
| Deterministic sim kernel under either authority | **Prototype** | Pays off in replay, reconciliation, migration, testing, and future topology options |

Private player-hosted runs should be explicitly classified:

- **trusted/private:** host authority is accepted; progression is local/private
  or marked unverified;
- **verified/private:** cloud control plane authenticates players and accepts
  only bounded, signed run summaries plus anomaly checks; still not cheat-proof
  against the host;
- **ranked/public:** requires dedicated gameplay authority. Do not pretend host
  signatures make an untrusted host honest.

## Bounded prototype plan

### Spike A — determinism audit and replay kernel (one week)

1. Record one seeded Shallows run as initial state plus stamped input/event
   log; replay headlessly without rendering.
2. Hash a canonical state projection every tick. Exclude presentation and wall
   time; include every gameplay consequence.
3. Run the same corpus on macOS arm64/x64 if available, Deck/Linux, packaged
   Electron, Node, and supported browser engines.
4. Produce the first-divergence tick, field path, causal call stack, and PRNG
   stream—not only “hash mismatch.”

Gate: 100 seeded 20-minute runs must be bit-identical across repeated runs on
one target. Cross-target failures are expected findings, not permission to
normalize hashes with wide epsilons.

### Spike B — authoritative rollback movement (one week)

1. Keep the existing sim as authority. Predict only the local player movement
   kernel and the minimum nearby force/contact inputs.
2. Store 8–12 ticks, rebase on authoritative snapshots, replay inputs, and
   smooth visual correction separately from gameplay truth.
3. Prevent speculative pickup, death, extraction, signal threshold, inventory,
   and durable effects from firing as final events.
4. Netem/test at 40/80/120/160 ms RTT, 0/1/3/5% loss, burst loss, 15/30/50 ms
   jitter, reordering, and 10-second disconnect/reconnect.

Gate: local input-to-presentation remains within the existing feel target;
95% of corrections stay within two ticks and a small screen-space threshold;
no irreversible event duplicates or reverses.

### Spike C — authority-free falsification lab (maximum one week)

1. Use 2, then 4, then 8 local/remote peers with input mesh, state hashes, and
   rotating 16 KiB checkpoints.
2. Inject simultaneous pickup, collision, pulse, portal confirm, death, and
   hostless membership changes.
3. Inject one malicious peer: future input, withheld losing input, impossible
   acceleration, altered loot, equivocated hash, and selective partition.
4. Measure bandwidth, packet rate, earliest divergence, rollback depth, tick
   replay CPU, and whether peers reach one settlement.

Go only if the team can state a simple, player-legible answer for cheating,
partition, departure, and durable settlement without recreating an authority.
Expected outcome: reject production authority-free P2P with measured evidence.

### Spike D — relay-assisted listen fallback (two weeks after transport choice)

1. Replace polling gameplay traffic with an abstract unreliable/reliable
   datagram transport; preserve protocol-v2 identity and sequences.
2. Add signaling, ICE/relay selection, path metrics, and IP-hiding verification.
3. Elect hosts using measured RTT, loss, upstream, CPU, power/suspend risk, and
   deterministic tie-break; never “oldest peer” alone.
4. Replicate a migration checkpoint plus event/input watermarks to at least two
   candidates. On migration, increment `authorityEpoch`, rotate credentials,
   fence the prior host, rebase clients, and resume only after one canonical
   state is selected.
5. Test graceful leave, process kill, Wi-Fi loss, sleep/resume, relay-only
   pairs, 4–4 partition, stale host return, and result settlement.

Gate: four and eight-player private sessions survive a non-adversarial host
loss within a product-set pause budget with no duplicate loot or outcome. A
partition never produces two verified durable settlements.

## Decisions the integrated architecture must make

1. Are player-hosted runs allowed to write normal progression, a visibly
   unverified progression lane, or no durable progression?
2. Is voice in scope? Full-mesh voice dominates input bandwidth and expands
   privacy/moderation obligations; platform party voice may be the simpler
   first release.
3. Must web clients participate as full hosts, or only as clients? Browser
   lifecycle and background throttling make them poor authority candidates.
4. Is Steam Datagram Relay acceptable as the Steam private fallback while a
   transport abstraction preserves another TURN/relay option?
5. What is the movement correction threshold Greg accepts at 80/120/160 ms?
   Automated gates can bound artifacts, but only playtesting can set this
   product line.

The simplest defensible answer is: **dedicated one-run authority for verified
play; relay-assisted player-hosted one-run authority for trusted private play;
deterministic replay and rollback beneath both; no authority-free durable LBH
economy.**
