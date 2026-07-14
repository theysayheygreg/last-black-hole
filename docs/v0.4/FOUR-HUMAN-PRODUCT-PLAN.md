# v0.4 Four-Human Product Plan

> Status: **ACTIVE** on `codex/v0.4-multiplayer-architecture`
>
> Product target: one through four humans on the admitted S20 authority path.
> Four humans are the acceptance gate, not the minimum required party size.

## Goal

Turn LBH's proven multiplayer machinery into a good human multiplayer game. A
player can create a private crew, bring in up to three other people, understand
every seat and connection state, complete a truthful shared run, survive a
reconnect, see a coherent result, and leave or rematch without terminal work or
operator intervention.

The authority contract does not change: one logical single-writer gameplay
authority owns each match. Clients own input sampling, prediction,
interpolation, Three, fluid presentation, UI, VFX, and audio.

## Current Product Gap

The focused private-room journey now proves four human-surface clients,
copy/paste invitation, authority-owned launch, fifth-seat rejection, explicit
offline recovery, and reconnect continuity. The remaining product gap begins
after admission:

- reconnecting and recovered states need persistent player-facing treatment;
- multiplayer result/rematch is not yet a coherent crew flow;
- the strongest run evidence uses test assistance to shorten traversal.

## Player Journey

```text
front door -> crew muster -> synchronized launch -> shared run
           -> reconnecting/recovered -> shared result -> rematch or leave
```

Every phase must answer three questions without debug tools: where am I, who is
with me, and what action is required next?

## Delivery Slices

### P1 — Crew Muster And Synchronized Start

**Implementation status:** complete. Authority-matrix and focused five-browser
human-surface proofs are green.

- create a four-seat private crew on the existing authority;
- keep sim time, AI, hazards, and world consequences frozen while staging;
- admit one through four humans and show host/crew role plus occupied seats;
- allow only the host to launch the shared run;
- move every joined client into the same running authority;
- fail closed on join/admission errors; never start a separate local run;
- preserve existing offline/local launch behavior.

Proof: four browsers remain staged with unchanged sim time, a non-host cannot
launch, the host launches once, all four enter play, and a fifth seat rejects.

### P2 — Invitations, Readiness, And Crew Clarity

**Implementation status:** complete. Private room creation/join, copyable and
paste-tolerant six-character invitations, deterministic four-seat roster,
connection-bound readiness, host launch gating, explicit host/join/offline
choices, stream-default transport, and durable wrong/full/expired/version/
unavailable errors are live. The five-browser journey proves the player-facing
path; authority tests prove retired invitations and protocol mismatch rejection.

- expose Host Private Game and Join Game as distinct choices;
- display/copy a bounded private invitation or join code;
- show four seat cards with human/AI/empty, connected, ready, and leader state;
- explain full, expired, incompatible-version, and unavailable-room failures;
- require the selected party/readiness policy before host launch.

### P3 — Shared-Run Readability

**Implementation status:** in progress. The first slice preserves public seat
and link identity after launch and adds an edge-mounted P1–P4 crew rail.
Automated four-browser proof verifies that every client sees the same ordered
crew while clearly identifying itself. Spatial labels in the ASCII fluid still
need a visually proven treatment that does not obscure movement or the fabric.

- make local identity and remote crew identity readable in the ASCII fluid;
- present teammate alive/dead/disconnected state without cluttering the center;
- clarify salvage ownership, shared signal pressure, extraction, and death;
- keep all UI and VFX presentation-only.

### P4 — Failure Continuity

- show connecting, reconnecting, recovered, and failed states persistently;
- reserve a disconnected seat/body under the ratified timeout policy;
- prove old connection epochs cannot control the resumed body;
- make leave, host departure, and fifth-seat rejection understandable;
- keep local/offline play independent of platform or cloud availability.

### P5 — Shared Result And Rematch

- show one canonical match outcome to the crew;
- show each player only their private reward/write-back details;
- let the crew rematch into a new run lineage without rebuilding the party;
- provide a clean leave-to-home path from both result and lobby.

### P6 — Product Evidence And Greg Gate

- automate coherent one-, two-, three-, and four-browser journeys;
- automate a real fifth-browser rejection at the human surface;
- produce a named four-human playtest pack with no debug navigation;
- repeat at controlled 80, 120, and 160 ms conditions;
- obtain Greg's movement honesty, readability, correction-feel, and dread gate.

## Product Acceptance

The milestone is complete when four humans can create/join one crew, launch
together, finish extraction or death, reconnect one player, reject a fifth,
see the same result, and rematch without terminal intervention.

## Immediate Next Slice

Continue P3 from the live identity rail into authoritative death, extraction,
leave, and recovered-state callouts. Present public Inhibitor pressure as world
pressure, not “crew signal”; teammate cargo and individual signal remain
private and must not be inferred. The green browser proof does not yet claim
completed consequence readability, result, or rematch.

Engineering guardrails remain:

- S20 stays `NORMAL`, every active recipient receives at least 9 Hz, and mean
  application downlink stays at or below 64 KiB/s/client;
- no owner-private leak, duplicate irreversible consequence, authority split,
  unbounded queue, or stale-epoch control;
- local launch and run completion work while platform/cloud is unavailable;
- Three, fluid, UI, VFX, and audio never become gameplay authority.

## Provisional Playtest Defaults

These unblock product work without pretending Greg has ratified the final
service policy:

- one through four humans may play; AI fill is optional and clearly labeled;
- the lobby leader may invite, choose the map, launch, and propose rematch;
- late join remains mechanically permitted during early testing;
- built-in voice is out of v0.4;
- private-host results are local or visibly unverified;
- disconnect reserves the seat/body for 90 seconds while inputs are released.

## Explicit Non-Goals

- S23/S23P or another eight-player optimization;
- 24/48/96-player live capacity work;
- more provider costing or host-packing forecasts;
- public matchmaking, social graphs, moderation, or built-in voice;
- verified cloud progression or production provider deployment;
- replacement of the S20 protocol or authority architecture.
