# v0.4 Multiplayer Open Decisions

> Architecture defaults are recommendations until Greg ratifies the product
> choices. Technical experiments should not silently decide them through
> implementation convenience.

## Recommended Defaults

### Verified Authority

Dedicated one-run authority is the only source of verified public progression.
Private player-hosted sessions remain local or visibly unverified.

### Hosted Identity

Use a narrow platform-ticket adapter and avoid LBH passwords. Steam ticket
authentication is the recommended implementation only if Greg chooses a
Steam-only, every-seat-entitled MVP; storefront/friend-pass scope remains a
product decision.

### Save Lineages

Keep `LOCAL` and `CLOUD` progression separate. Linking may copy name,
accessibility, controls, and safe cosmetic choices, not currency, vault,
upgrades, or competitive history.

### Transport

Start with JSON WSS at existing map clocks and keep messages transport-neutral.
Add binary encoding, AOI, or WebTransport/QUIC only after packet evidence shows
the simpler shape is materially insufficient.

### Authority Loss

Fail closed for dedicated sim loss until signed checkpoint restore is proven.
Never accept a client snapshot as canonical recovery.

### Public Session Shape

Start with invite/join-code parties of 4–8 humans, not global anonymous
matchmaking. AI fill is a separate game-mode choice.

## Decisions Greg Owns

### 1. Private-Host Progression

**Recommendation:** local/unverified progression only.

Should a trusted player-hosted run write normal cloud progression, a visibly
unverified lane, or no durable progression? A host can forge outcomes; signing
its result does not make it honest.

### 2. Local-To-Cloud Import

**Recommendation:** copy safe non-economic fields only.

Is a one-time capped `legacy_import` worth the economy/leaderboard contamination
risk for existing players?

### 3. Reconnect Body Policy

**Recommendation:** 90 seconds; release thrust/one-shots, preserve inertia,
current, hazards, and consequences.

Should a disconnected pilot drift, receive a cautious AI takeover, become
temporarily sheltered, or abandon immediately? Invulnerability is not the
default.

### 4. Late Join

**Recommendation:** protocol supports it; competitive mode closes admission at
a declared run phase.

Can a new player join any live run, only before first salvage/signal threshold,
or only at run start?

### 5. Lobby Leader Powers

**Recommendation:** start/reset/map/invite and kick proposal only; never
gameplay or durable-state power.

Should the leader kick directly, require a vote, or only block future rematch
membership? Abuse handling needs a player-legible rule.

### 6. Voice

**Recommendation:** out of v0.4 gameplay scope; prefer Steam/platform party
voice first.

Built-in voice adds relay, privacy, moderation, reporting, blocking, and cost.
Is it necessary for the first four-to-eight-player release?

### 7. Movement Rate

**Recommendation:** start at existing 15/12/10 Hz map clocks. Run a blind
15/20/30 Hz WAN-emulated comparison only if prediction/sweep/interpolation do
not preserve feel.

Greg owns the feel verdict at 80/120/160 ms. Automated correctness cannot
decide whether surf timing and correction feel honest.

### 8. Chronicle Visibility

**Recommendation:** private-by-default in hosted MVP.

Should echoes be private to the owner, shared only with the party/run, or
published by seed? Broader sharing creates moderation and deletion work.

### 9. AI Fill

**Recommendation:** allow an explicit private/co-op mode to fill to four; keep
verified competitive tests honest about human count.

Does “minimum four” mean four human players are always required, or can one to
three humans launch with server-owned AI seats?

### 10. Vendor Commitment

**Recommendation:** no commitment before Phase 6.

Benchmark a Node-compatible regional host first and a Durable Object authority
second. Choose from observed tick/bytes/cost/ops, not provider branding.

### 11. High-Count Product Modes

**Recommendation:** 24 is the first optional large-crew target; keep 48 and 96
as benchmark/event tiers until their normal workloads pass without TiDi.

Are 24/48/96 intended shipped modes, private experiments, rare fleet events,
or only capacity probes? The answer determines whether their content density,
UI, moderation, matchmaking, and infrastructure deserve product work.

### 12. High-Count Visibility

**Recommendation:** keep a tiny low-rate global roster/objective lane; use
near/mid/far AOI for detailed transforms and world bodies by 48/96.

Which rival, signal, death, portal, route, and Chronicle facts must remain
globally visible in a 96-player match? Networking cannot decide the game-design
meaning of an off-screen fleet.

### 13. High-Count Clock And TiDi

**Recommendation:** do not promise 30 Hz at 48/96. Choose the highest clock
whose representative/heavy workload and Greg feel gate pass; reserve TiDi for
exceptional overload, not normal capacity.

Is a large fleet-event mode allowed to advertise a lower base clock or visible
shared time dilation as part of its identity? If not, cap participant or sim
density when the writer misses its budget.

## Rejected Unless New Evidence Reopens Them

- true no-authority public P2P;
- current full snapshots as the production wire protocol;
- Vercel Functions as the live run server;
- client-chosen ids as authorization;
- client-authored or temporarily client-credited hosted outcomes;
- sharding one four-to-eight-player run;
- moving gameplay truth into Three, UI, VFX, audio, or GPU fluid;
- calling a listen server “true P2P.”
