# v0.4 Multiplayer Open Decisions

> These are Greg's product calls. They are intentionally separate from the
> engineering acceptance gates in [`ROADMAP.md`](ROADMAP.md). An experiment
> may inform a choice; implementation convenience may not silently make it.

## Closed Architecture Decisions

- v0.4 is a one-through-four-player product architecture. Four is admitted;
  eight is closed for this version.
- verified play has one dedicated logical gameplay authority per live
  match/group. Concurrent matches multiply independent authorities.
- S20 is the admitted replication path. S23/S23P remain default-off research;
  split-fragment is reverted/history only.
- true authority-free public P2P is rejected. Relay-assisted player-hosted
  authority is a private/local fallback, not true P2P.
- hosted identity/entitlement/placement/settlement is control-plane truth;
  live run facts belong to the current-lease match authority.
- local and cloud economic lineages are separate by default; client snapshots
  never recover hosted authority or mint temporary cloud value.
- Fly performance CPU is the first authority benchmark; Cloudflare edge plus
  Postgres is the control-plane reference; Hetzner CCX is the operational
  fallback. Cloudflare Container/Durable Object and an ordinary container are
  comparator experiments. Vercel is web/control-plane only.
- no provider receives unmeasured packing credit. High-count modeled values
  are not capacity claims.

## Product Decisions Greg Owns

### 1. First multiplayer service posture

**Recommendation:** hybrid—verified central authority while economically
supported, plus relay-assisted private-host continuity with local/unverified
progression.

Choose central verified only, hybrid, or local/private-only first release. The
choice determines service promise, outage UX, long-tail continuity, support,
and whether Phase 5/6 blocks release.

### 2. Hosted identity and entitlement scope

**Recommendation:** Steam-only every-seat entitlement for MVP; no LBH password
database and no anonymous hosted guest.

If invited non-owners must play, define a provider-bound friend-pass grant,
expiry, seat limits, and abuse policy. An install/device id is not entitlement.

### 3. Private-host progression

**Recommendation:** local or visibly unverified only.

A player host can forge the run. A host-signed result proves origin, not
honesty. Decide whether private runs write local progression, a separate
unverified cloud lineage, or no durable progression.

### 4. Local-to-cloud import

**Recommendation:** safe fields only—display name, accessibility, controls,
and safe cosmetic preferences.

Decide whether a one-time capped and tagged legacy economic grant is worth
contaminating leaderboards/economy/support. Never silently field-merge currency,
vault, upgrades, or competitive history.

### 5. Human seats and AI fill

**Recommendation:** allow one-to-three humans plus explicitly server-owned AI
in private/co-op mode; label human count honestly.

Does “minimum four” require four humans, or may an undersized party launch with
AI fill? Verified tests and public claims must distinguish the two.

### 6. Disconnected-body policy

**Recommendation:** reserve the seat/body for 90 seconds; release thrust and
one-shot inputs while inertia, current, hazards, and consequences continue.

Alternative choices are cautious server AI, immediate abandon, or shelter.
Invulnerability is not the default.

### 7. Late join

**Recommendation:** protocol permits it, but competitive admission closes at a
declared run phase.

Choose run-start only, before first salvage/signal threshold, or any time.

### 8. Lobby-leader powers

**Recommendation:** start/reset/map/invite plus kick proposal or future-rematch
block; never gameplay, placement, profile, or settlement power.

Choose direct kick, vote/proposal, or rematch-only exclusion.

### 9. Voice

**Recommendation:** out of v0.4; use platform party voice first.

Built-in voice adds relay, privacy, recording, report/block, moderation,
retention, and cost obligations. Full-mesh voice also dominates P2P input
traffic in the research model.

### 10. Movement/WAN threshold

**Recommendation:** retain 15/12/10 Hz map clocks initially. Run blind
15/20/30 Hz comparisons only after prediction/interpolation at the existing
clock has real WAN evidence.

Greg owns the feel verdict at 80/120/160 ms. Automated correctness cannot
decide whether surf timing and correction feel honest.

### 11. Chronicle visibility

**Recommendation:** private by default.

Lobby/seed/public sharing creates moderation, deletion, youth/privacy, and
retention work. Choose private, party/run, or seed-public scope.

### 12. Account concurrency

**Recommendation:** one hosted run per account for MVP, regardless of how many
cloud pilots exist.

Allowing two pilots concurrently expands entitlement sharing, duplicate-body,
moderation, and support semantics.

### 13. Supported regions, ages, and social scope

**Recommendation:** invite-only, private profile/history, no stored birth date
by default; define supported region/age policy before shared social content.

Decide whether any youth-account policy class is required and which features
are disabled or guardian-controlled. Do not collect data without a shipped
purpose and policy.

### 14. Vendor and service-tail commitment

**Recommendation:** choose only after Phase 6 runs the same four-player
90-minute scenario in two regions and measures invoices, failure, and packing.

Rate cards currently favor Fly as first process proof, Cloudflare at the edge,
Postgres for durable truth, and Hetzner CCX as fallback. Greg must choose the
operating burden and finite online-service promise after evidence.

### 15. High-count product intent

**Recommendation:** treat 24 as a future experiment and 48/96 as event/R&D
tiers until live representative workloads pass without TiDi.

Decide whether 24/48/96 are shipped modes, rare fleet events, private labs, or
capacity probes. That choice controls UI, content density, moderation,
matchmaking, visibility, clocks, and infrastructure work.

### 16. High-count visibility and TiDi

**Recommendation:** low-rate global roster/objective facts plus near/mid/far
AOI; no promise of 30 Hz at 48/96; TiDi only for exceptional overload.

Decide which rival/signal/death/portal/route/Chronicle facts remain globally
visible and whether a large-event mode may advertise a lower base clock or
visible shared time dilation.

## Engineering Gates, Not Product Decisions

These do not require taste or business preference. Failure blocks the relevant
claim:

- one current writer lease and one settlement per match/member result;
- one-through-four admit, fifth/eight reject at every trust boundary;
- no BOLA/IDOR, cross-recipient private leak, secret/PII log/replay leak,
  duplicate consequence, or unbounded queue;
- four-player hosted path holds `NORMAL`, every recipient >=9 Hz, writer p95
  <50% and p99 <70% of frame budget, and <=64 KiB/s/client application average;
- two-region 90-minute soak plus startup/drain/crash/reconnect/lease-fence proof;
- `safeAuthoritiesPerHost` comes only from passing noisy-neighbor density
  evidence and a declared safety factor;
- prices are refreshed and the economics model regenerated before commitment;
- H24 must admit an exact live cohort and produce a paced raw capture before
  H48/H96 work or any high-count capacity statement;
- no P1/P2/P3 remains before hosted alpha.

## Rejected Unless New Version Evidence Reopens Them

- another v0.4 eight-player replication optimization;
- true no-authority public P2P or peer-authored verified progression;
- current full snapshots as production hot-loop protocol;
- multiple gameplay writers for one match or one global gameplay authority;
- Vercel Functions as the live run authority;
- client-chosen ids as authorization;
- client-authored or temporarily client-credited hosted outcomes;
- sharding a one-through-four-player match;
- moving gameplay truth into Three, UI, VFX, audio, or GPU fluid;
- treating S24 synthetic H24 or modeled H48/H96 as live capacity.
