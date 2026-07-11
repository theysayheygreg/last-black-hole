# Multiplayer Identity, Authentication, And Data Model

> Research memo for v0.4. Evidence checked 2026-07-10. This is an architecture recommendation, not an implementation claim or legal opinion.

## Recommendation

Keep LBH local-first, but make hosted progression server-authoritative. For the first 4–8-player release:

1. Use Steam session tickets as the only hosted sign-in and entitlement path. Exchange the ticket at the LBH control plane, verify it with Steam, map the returned SteamID to an internal account, and issue LBH-scoped sessions. Do not collect passwords.
2. Keep offline profiles fully playable and clearly labeled `LOCAL`. A local profile can be linked to an account, but local currency, vault contents, upgrades, and run history are not silently merged into the authoritative online ledger. Linking creates or selects a `CLOUD` profile and may copy non-economic settings and the display name.
3. Extend the existing split: the control plane owns accounts, entitlements, profiles, progression, parties, session placement, bans, audit, and settlement; one disposable sim owns each live run; clients own presentation and input intent.
4. Replace caller-chosen `clientId` authority with a server-created run membership and short-lived command grant. Preserve protocol-v2 `runId`, `playerId`, two monotonic sequences, event watermarks, and snapshot rebase.
5. Use a small relational database for hosted truth. Store inventory and currency as explicit records/ledger entries, not a mutable profile JSON blob. Use JSON only for versioned, bounded payloads such as loadout snapshots and run telemetry.

This is the smallest secure design for a $4.99 game. It avoids a custom password system, preserves offline play, and does not pretend a compromised local client can prove earned progression.

## Current LBH Truth And Gaps

The v0.3 architecture already has the correct coarse boundary:

- `scripts/sim-runtime.cjs` owns run truth and emits one result package per human outcome.
- `scripts/control-plane-store.cjs` owns profiles, sessions, run records, and Chronicle echoes outside the sim.
- `lbh-local-v2` scopes commands to `runId` + `playerId`, issues a command credential, uses independent command/input sequences, rotates authority on reconnect, and supports event/snapshot recovery.
- Profiles currently begin in browser `localStorage`; the control plane stores the durable copy after bootstrap.
- `applyOutcome()` writes profile and then run data to a JSON file. A repeat call can credit EM and update counters twice even though the run row is overwritten by `runId`.

Those are good local/private foundations, not internet-safe APIs. Current hosted blockers include:

- `/profile?profileId=...`, `/profile/save`, `/profile/outcome`, session mutation, and echo mutation have no end-user or service authentication.
- `profileId`, `clientId`, profile snapshots, run results, and whole profile objects are caller supplied. An opaque UUID reduces guessing; it does not confer authorization. OWASP identifies object-ID manipulation as the defining API object-authorization failure and requires an authorization check for every operation that uses a client-supplied object id ([OWASP API1:2023](https://owasp.org/API-Security/editions/2023/en/0xa1-broken-object-level-authorization/)).
- Long-lived command credentials are held in process memory but are effectively bearer secrets. There is no expiry, authority epoch, durable revocation, or device session.
- Writes are whole-file and non-transactional. Profile mutation, run recording, and echo persistence cannot commit atomically across crashes or concurrent sims.
- A reconnect currently accepts profile/loadout fields that could mutate the live player after authority validation. Hosted reconnect must rehydrate from server state, not accept durable or run inventory from the client.
- Session host is a gameplay-control role, but is represented as `hostClientId`. It needs a versioned membership lease, not special account privilege.
- Echoes include a pilot display name. They need visibility, moderation, anonymization, and deletion behavior before becoming shared hosted content.

## Trust Boundaries

```mermaid
flowchart LR
    C["Untrusted client\ninput + presentation"]
    P["Platform identity\nSteam"]
    E["Edge/API\nTLS + rate limits"]
    CP["Control plane\nauth + durable truth"]
    S["Disposable run sim\nlive gameplay authority"]
    DB[("Relational store\nledger + metadata")]
    K["Secret manager\nservice keys"]

    C -->|"platform ticket; then access token"| E
    E --> CP
    CP -->|"verify ticket / ownership"| P
    CP --> DB
    CP -->|"signed run assignment + player bootstrap"| S
    S -->|"authenticated settlement + audit facts"| CP
    C -->|"short-lived run command grant"| S
    S -->|"snapshots/events"| C
    K --> CP
    K --> S
```

Trust rules:

- The client may choose intent, display name candidates, local settings, invite codes, and which owned profile to use. It never chooses authorization, entitlement, balances, inventory, outcome, host power, or membership ownership.
- The platform proves a platform subject and ownership to the backend; it does not become LBH's database key.
- The control plane is authoritative for durable state and which sim owns a run.
- The sim is authoritative for live state and produces the only acceptable settlement facts. The control plane verifies the sim identity, run assignment, result schema, and idempotency key before committing.
- An id is a locator. A token or verified server-side relationship grants authority.
- No long-lived secret appears in snapshots, events, replay files, URLs, telemetry, crash reports, invite codes, or database plaintext.

## Identifier Taxonomy

Use UUIDv7 for new database primary keys: it is opaque enough for public locators, time-sortable for indexes, and standardized with a 48-bit Unix-millisecond time field plus random bits ([RFC 9562](https://www.rfc-editor.org/info/rfc9562/)). Continue accepting existing UUIDv4 local profile ids during migration. Never infer permission, creation order, or shard from an id.

| Identifier | Lifetime / creator | Exposure | Security role |
|---|---|---|---|
| `account_id` | Stable until account deletion; control plane | Private internal; may appear in owner export/admin audit | Principal joining platform identities and cloud profiles. Never a public player handle. |
| `provider_subject` | Stable per provider; Steam supplies SteamID | Private to backend/support; unique with `provider` | Verified external identity. Store canonical value and a keyed lookup hash if logs/search require pseudonymization. |
| `entitlement_id` | One record per account/provider/app/grant | Private | Evidence and cache of product ownership; not an auth session. |
| `device_id` | Random per physical-device registration; control plane acknowledges | Owner-visible, backend-visible, rotating/revocable | Names a device for session inventory and notifications. Not authority by itself. |
| `install_id` | Random on install; client creates, backend registers | Backend-visible, reset on reinstall | Diagnostics and local migration correlation only. Never ban or authorize by install id. |
| `device_key_id` | Per install/device keypair | Public key private to backend; private key in OS credential store | Optional proof-of-possession and refresh-session binding. Secret key never leaves device. |
| `local_profile_id` | Stable inside an offline save lineage | Local/private | Local save key. It can be recorded as import provenance, never used to fetch another account's cloud profile. |
| `profile_id` | Stable cloud pilot; control plane | Owner and authorized session participants receive bounded presentation form | Owns progression/vault/Chronicle. Authorization derives from `profile.account_id`, not possession of id. |
| `party_id` | Until party disbands/expires | Party members | Matchmaking grouping, no gameplay authority. |
| `session_id` | Lobby/session lifecycle; control plane | Members/invite resolution | Social container and placement. Survives a run reset only if product design wants a rematch lobby. |
| `run_id` | Exactly one authoritative simulation epoch; control plane | Members, sim, run history | Coarse EVE-style authority unit. Reset creates a new run id. |
| `membership_id` | One account/profile seat in one run | Member, sim, control plane | Stable reconnect subject and role holder. Unique `(run_id, account_id)` and `(run_id, seat_no)`. |
| `player_id` | Server-issued public alias for membership within a run | All clients in that run | Protocol subject and presentation identity. Stable across reconnect; not globally linkable. Prefer random per run. |
| `incarnation_id` | Each spawned/live body generation; sim | Run participants | Rejects stale body references after death/rejoin/respawn. Complements Ballpark generation handles. |
| `connection_id` | Each transport connection; gateway/sim | Client + services, short-retention logs | Rotates on reconnect. Carries no durable identity. |
| `authority_grant_id` | Each join/reconnect authority epoch; control plane/sim | Identifier may be logged; token is secret | Server-side record for command capability, scopes, expiry, revocation, and last accepted sequences. |
| `authority_secret` | Random 256-bit bearer value or signed proof; server | Secret, shown once to client over TLS; store only hash if opaque | Actual command capability. Rotate on reconnect and host-role change; expire shortly after run/reconnect window. |
| `authority_epoch` | Monotonic per membership | Run services/client | Invalidates commands from an earlier connection or stolen old grant. Included in command MAC/claims and settlement evidence. |
| `join_ticket_id` / secret | Single-use, short TTL | Invite exchange only; secret never in URL/log | Claims a reserved membership. Store a hash, audience, expiry, use count, and intended account/party where known. |
| `command_seq` | Monotonic per authority epoch/membership | Client/sim | Idempotency and ordering for mutations. Do not reset merely because the socket reconnects unless the authority epoch also rotates. |
| `input_seq` | Monotonic per input stream | Client/sim | Drops stale continuous input independently of command mutations. |
| `event_seq` / `snapshot_id` | Per run, server | Run participants | Recovery watermarks, not secrets. |
| `result_id` | One per `(run_id, membership_id)` outcome | Services and owner history | Immutable run-result identity. |
| `settlement_id` | One per result settlement attempt/finalization | Private services/audit | Transaction and idempotency boundary for durable writes. |
| `idempotency_key` | Caller-generated only for safe client APIs; service-derived for settlement | Header/body, short retention | Deduplicates retries. Settlement key should be derived from `run_id + membership_id + result_version`, not trusted client randomness. |

Public player presentation should contain only `player_id`, sanitized display name, hull/affiliation, and game-visible state. Never expose `account_id`, provider subject, device/install ids, email, IP, access/refresh tokens, command secrets, or internal moderation fields.

## Authentication, Entitlement, And Account Flows

Steam documents that a client can obtain a session ticket, a secure backend can validate it through `AuthenticateUserTicket`, and a successful response yields the 64-bit SteamID; the backend can separately check app ownership ([Steamworks authentication and ownership](https://partner.steamgames.com/doc/features/auth?l=english&language=english)). Treat identity verification and entitlement as two records even when one exchange supplies evidence for both.

### Hosted Steam account

1. Client gets a fresh Steam Web API auth ticket and sends it once to `POST /v1/auth/steam/exchange` over TLS.
2. Control plane validates ticket audience/AppID and nonce/replay state with Steam, receives SteamID, and checks ownership.
3. In one transaction, upsert `(provider=steam, provider_subject)`, internal account, entitlement observation, device/install registration, and an auth session.
4. Return a 10–15 minute audience-restricted access token plus a rotating refresh token. Store refresh token in Keychain/credential storage, not `localStorage` or a save file. Persist only its hash/family/reuse state server-side.
5. On refresh reuse, revoke the token family and require sign-in. OAuth security BCP requires public-client refresh tokens to be sender-constrained or rotated and recommends short, least-privilege, audience-restricted access tokens ([RFC 9700](https://www.rfc-editor.org/info/rfc9700/)). LBH need not expose generic OAuth to implement those session properties.

### Local-only / offline

- Create a random `local_profile_id` in the existing three-slot save system. No account, email, device fingerprint, or internet requirement.
- Local control plane/sim remain authoritative within that machine, but the save is explicitly untrusted by hosted services.
- Offline runs, vault, progression, and Chronicle stay available. Local multiplayer may use the host's local control plane with ephemeral guests, provided the UI labels host authority and save ownership.
- Steam Cloud may back up the local save as a convenience, but it is not transactional hosted truth: Steam says Auto-Cloud replicates configured files after the game exits ([Steam Cloud](https://partner.steamgames.com/doc/features/cloud?l=czech&language=english)). Concurrent/conflicting cloud files therefore need save-level conflict UX, not currency-ledger merge.

### Guest

- **Offline/local guest:** ephemeral `guest_id`, no entitlement, no durable cloud progression. The local host may persist a named couch/LAN profile locally.
- **Hosted guest for MVP:** do not allow one. Requiring an entitled Steam identity gives bans, reconnect ownership, and support a stable principal without building guest-upgrade/account-link abuse paths.
- A later friend-pass can be a distinct, expiring entitlement grant attached to a real platform identity, not an anonymous device id.

### Hybrid link / migration

1. User signs into Steam, then explicitly chooses `Create cloud pilot`, `Use existing cloud pilot`, or `Keep this slot local`.
2. Linking records `profile_import {account_id, local_profile_id_hash, source_install_id, imported_at, source_schema_version}`.
3. Safe automatic copy: sanitized name, accessibility/input/settings, cosmetic selections already entitled, and optionally aggregate history marked `legacy_local`.
4. Do not automatically copy EM, vault items, upgrades, competitive stats, bans, or run settlements. A client-controlled local save cannot prove them.
5. If Greg decides preserving all progress is worth accepting cheating in private/co-op play, make it a one-time, clearly tagged `legacy_import` grant with capped values and keep it out of leaderboards/trading. That is a product risk decision, not a cryptographic solution.
6. Cloud-to-local cache is allowed for offline presentation. Any offline mutation forks a local lineage; it does not merge back into authoritative currency/inventory.

### Other stores later

Add another `auth_identity` and `entitlement` provider adapter. Do not add LBH passwords. For a DRM-free storefront, choose either local-only play or a managed passwordless provider; prove demand before accepting email-delivery, account-recovery, bot, and support burden.

## Ownership And Source Of Truth

| Concern | Offline/local | Hosted source of truth | Conflict rule |
|---|---|---|---|
| Authentication | None | Auth/session service + verified provider identity | Provider proof maps to internal account; client id never wins. |
| Entitlement | Installed owned build/platform offline behavior | Entitlement service, provider evidence cached with observed/expiry timestamps | Hosted join fails closed when no valid grant; brief provider outage may use a bounded cached grant. |
| Profile name/settings | Local profile | Profile service | Name is validated/moderated; settings may LWW by server receipt time. |
| Currency/progression | Local save | Append-only progression ledger + materialized profile balance | Server ledger only; no bidirectional merge. |
| Vault/loadout | Local save | Inventory service/control-plane transaction | Sim checks out a loadout snapshot; only settlement returns durable changes. |
| Live movement/collision/loot/signal/death/extraction | Local sim | Assigned run sim | Sim only. No database writes on tick path. |
| Parties/invites/matchmaking | Optional local discovery | Party/session service | Membership and leader changes use version/lease checks. |
| Host privileges | Local host process | Versioned run membership role | Host can choose lobby/run controls, never mutate outcomes or other profiles. Auto-promotion is a compare-and-swap lease. |
| Run results | Local run record | Immutable sim result + atomic settlement | Unique result per run membership; repeated delivery returns prior result. |
| Chronicle | Local store | Profile run history; shared echoes are moderated projections | Owner history private. Shared echo strips account/platform identifiers and is anonymized on deletion. |
| Bans | Optional local blocklist | Moderation service | Account/provider grant scoped; device/IP are evidence, not sole identity. |
| Audit/abuse | Local logs | Security/audit service | Append-only, access-controlled, minimized, retained by policy. |

## Relational Data Model

```mermaid
erDiagram
    ACCOUNT ||--o{ AUTH_IDENTITY : has
    ACCOUNT ||--o{ ENTITLEMENT : owns
    ACCOUNT ||--o{ DEVICE : registers
    DEVICE ||--o{ INSTALLATION : contains
    ACCOUNT ||--o{ PROFILE : owns
    PROFILE ||--o{ INVENTORY_ITEM : stores
    PROFILE ||--o{ LEDGER_ENTRY : receives
    PROFILE ||--o{ PROFILE_REVISION : versions
    PARTY ||--o{ PARTY_MEMBER : contains
    ACCOUNT ||--o{ PARTY_MEMBER : joins
    SESSION ||--o{ RUN : contains
    RUN ||--o{ RUN_MEMBERSHIP : seats
    PROFILE ||--o{ RUN_MEMBERSHIP : pilots
    RUN_MEMBERSHIP ||--o{ PLAYER_INCARNATION : spawns
    RUN_MEMBERSHIP ||--o{ AUTHORITY_GRANT : commands
    RUN_MEMBERSHIP ||--o{ CONNECTION : connects
    RUN_MEMBERSHIP ||--|| RUN_RESULT : concludes
    RUN_RESULT ||--|| RUN_SETTLEMENT : settles
    RUN_SETTLEMENT ||--o{ LEDGER_ENTRY : posts
    ACCOUNT ||--o{ BAN : constrained_by
    ACCOUNT ||--o{ PRIVACY_REQUEST : requests
```

### Core tables and constraints

Use the following logical schema. Exact SQL types may change, but constraints may not be relaxed.

```text
account(account_id PK, state, created_at, deleted_at, data_region, row_version)
auth_identity(identity_id PK, account_id FK, provider, provider_subject,
              verified_at, last_seen_at, UNIQUE(provider, provider_subject))
entitlement(entitlement_id PK, account_id FK, provider, app_id, grant_type,
            status, observed_at, valid_until, evidence_version,
            UNIQUE(account_id, provider, app_id, grant_type))
device(device_id PK, account_id FK, display_name, first_seen_at, last_seen_at, revoked_at)
installation(install_id PK, device_id FK NULL, platform, app_version, created_at, last_seen_at)
auth_session(auth_session_id PK, account_id FK, device_id FK NULL,
             refresh_family_id, refresh_token_hash, expires_at, rotated_at, revoked_at,
             UNIQUE(refresh_token_hash))

profile(profile_id PK, account_id FK, display_name, state, source,
        created_at, updated_at, row_version,
        UNIQUE(account_id, profile_id))
profile_progress(profile_id PK/FK, em_balance, hull_type, rig_levels_json,
                 lifetime_stats_json, revision, CHECK(em_balance >= 0))
inventory_item(item_instance_id PK, profile_id FK, catalog_item_id, state,
               slot_type, slot_index, acquired_settlement_id FK NULL, row_version,
               UNIQUE(profile_id, slot_type, slot_index) WHERE slot_index IS NOT NULL)
ledger_entry(ledger_entry_id PK, profile_id FK, currency, delta, balance_after,
             reason, settlement_id FK NULL, created_at,
             UNIQUE(profile_id, settlement_id, reason, currency))
profile_revision(profile_id FK, revision, changed_at, change_kind, payload_json,
                 PRIMARY KEY(profile_id, revision))
profile_import(import_id PK, account_id FK, local_profile_id_hash,
               source_install_id, source_schema_version, policy, imported_at,
               UNIQUE(account_id, local_profile_id_hash))

party(party_id PK, state, leader_account_id FK, version, expires_at)
party_member(party_id FK, account_id FK, role, joined_at,
             PRIMARY KEY(party_id, account_id))
session(session_id PK, party_id FK NULL, state, visibility, region,
        max_players CHECK(max_players BETWEEN 4 AND 8), version, created_at, expires_at)
run(run_id PK, session_id FK, sim_instance_id, state, map_id, seed_commitment,
    protocol_version, result_schema_version, created_at, live_at, ended_at,
    UNIQUE(sim_instance_id, run_id))
run_membership(membership_id PK, run_id FK, account_id FK, profile_id FK,
               player_id, seat_no, role, state, authority_epoch, joined_at,
               disconnected_at, reconnect_until,
               UNIQUE(run_id, account_id), UNIQUE(run_id, player_id), UNIQUE(run_id, seat_no))
player_incarnation(incarnation_id PK, membership_id FK, ordinal, body_public_id,
                   spawned_tick, retired_tick, reason,
                   UNIQUE(membership_id, ordinal))
connection(connection_id PK, membership_id FK, authority_epoch, transport,
           opened_at, closed_at, close_reason)
authority_grant(authority_grant_id PK, membership_id FK, authority_epoch,
                secret_hash, scopes, issued_at, expires_at, revoked_at,
                last_command_seq, last_input_seq,
                UNIQUE(membership_id, authority_epoch))
join_ticket(join_ticket_id PK, session_id FK, intended_account_id FK NULL,
            secret_hash, expires_at, redeemed_at, max_uses, use_count)

run_result(result_id PK, run_id FK, membership_id FK, outcome, result_version,
           sim_instance_id, final_tick, result_hash, payload_json, received_at,
           UNIQUE(run_id, membership_id), UNIQUE(run_id, result_hash))
run_settlement(settlement_id PK, result_id FK UNIQUE, profile_id FK,
               status, profile_revision_before, profile_revision_after,
               settled_at, failure_code)
chronicle_echo(echo_id PK, source_result_id FK, owner_profile_id FK NULL,
               map_id, seed, public_pilot_name, payload_json, visibility,
               created_at, expires_at, anonymized_at)

ban(ban_id PK, account_id FK, provider, scope, reason_code, evidence_ref,
    starts_at, ends_at, revoked_at, appeal_state)
audit_event(audit_id PK, occurred_at, actor_type, actor_id, action,
            target_type, target_id, outcome, request_id, metadata_json)
privacy_request(request_id PK, account_id FK, kind, state, requested_at,
                verified_at, completed_at, failure_code)
```

Recommended operational indexes:

- `auth_identity(provider, provider_subject)` and `auth_session(refresh_token_hash)` for sign-in.
- `profile(account_id, state)`; every profile query still checks the authenticated account relationship.
- `run(state, region, created_at)`, `run(sim_instance_id, state)`, `session(state, expires_at)`, and `run_membership(account_id, state, reconnect_until)` for placement/reconnect.
- `run_result(run_id, membership_id)` and `run_settlement(status, settled_at)` for settlement/retry queues.
- `ledger_entry(profile_id, created_at DESC)` and `profile_revision(profile_id, revision DESC)` for Chronicle/export/conflict checks.
- `ban(account_id, scope, ends_at)` plus provider subject lookup through `auth_identity` for join checks.
- `audit_event(actor_id, occurred_at DESC)`, `audit_event(target_id, occurred_at DESC)`, and time partitioning. Keep sensitive metadata out of general analytics.
- `chronicle_echo(map_id, seed, visibility, created_at DESC)` with the existing maximum-eight policy enforced in the write transaction.

## Atomic Settlement And Idempotency

The sim must never call a generic profile-save endpoint. It sends a versioned immutable result to an internal endpoint authenticated as the sim assigned to that run.

Settlement transaction:

1. Verify service identity, run-to-sim assignment, run state, result schema, membership, final outcome, payload limits, and result hash.
2. `INSERT run_result ... ON CONFLICT (run_id, membership_id)`; if the existing hash matches, return the prior settlement. If it differs, quarantine and audit `conflicting_result`.
3. Lock the profile/progression row or use `revision = expected_revision` compare-and-swap.
4. Insert `run_settlement` and all currency ledger/inventory grants with unique settlement references.
5. Materialize balance, vault, stats, run history, and eligible Chronicle echo from those immutable facts.
6. Increment profile revision and commit everything together.
7. Acknowledge only after commit. Retries are safe because the result and settlement keys are unique.

If the database is unavailable, the sim retains the final result in a bounded durable outbox and the control plane keeps the run `SETTLING`; the player sees `result pending`, not a fabricated balance. Never credit on the client and reconcile later.

## Lifecycle And State Machines

```mermaid
stateDiagram-v2
    [*] --> LocalProfile
    LocalProfile --> LocalProfile: offline play
    LocalProfile --> LinkPending: sign in + choose migration
    LinkPending --> CloudProfile: safe fields copied / server baseline
    LinkPending --> LocalProfile: cancel
    CloudProfile --> CloudProfile: authoritative hosted settlement
    CloudProfile --> LocalFork: play offline with mutations
    LocalFork --> LocalFork: local-only continuation
```

```mermaid
stateDiagram-v2
    [*] --> Reserved
    Reserved --> Joined: ticket redeemed + account entitled
    Joined --> Connected: command grant issued
    Connected --> Disconnected: transport lost
    Disconnected --> Connected: reconnect before deadline / epoch rotates
    Disconnected --> Abandoned: deadline expires
    Connected --> Finished: death / extraction / explicit leave
    Finished --> Settling: immutable result accepted
    Settling --> Settled: transaction committed
    Settling --> SettlementPending: store unavailable
    SettlementPending --> Settled: idempotent retry
```

Reconnect policy for MVP: reserve the authoritative live body for 60–120 seconds, neutralize/continue it according to game design, and rotate `connection_id`, command secret, and `authority_epoch` on successful reconnect. The stable membership/player id preserves private event lanes and sequences. A new device may reconnect only after normal account authentication; possession of `player_id` is insufficient.

Host migration is control-plane role migration, not sim migration. Update `(membership.role, session.version)` with compare-and-swap, increment the promoted member's authority epoch, and issue a new host-scoped grant. If the authoritative sim dies, MVP ends the run as `failed` and settles only already-finalized per-player results; restoring a live sim from a signed checkpoint is a later feature and must create a new sim lease/epoch.

## API Surface

Public account/control-plane API:

```text
POST   /v1/auth/steam/exchange             Steam ticket -> LBH session
POST   /v1/auth/refresh                    rotate refresh session
POST   /v1/auth/logout                     revoke this session/device
GET    /v1/me                              bounded account/session view
GET    /v1/me/devices                      list/revoke auth sessions
POST   /v1/me/export                       asynchronous export request
DELETE /v1/me                              verified deletion request

GET    /v1/profiles                        own cloud profiles
POST   /v1/profiles                        create pilot
PATCH  /v1/profiles/{profile_id}           allowlisted name/settings + If-Match revision
POST   /v1/profiles/{profile_id}/link-local create tagged import/fork
GET    /v1/profiles/{profile_id}/chronicle own run history

POST   /v1/parties                         create party
POST   /v1/parties/{party_id}/invites      leader creates opaque short invite
POST   /v1/invites/redeem                  authenticated redemption; secret in body
POST   /v1/sessions                        entitled party -> session
GET    /v1/sessions/{session_id}           authorized member view
POST   /v1/sessions/{session_id}/join      reserve membership + run assignment
POST   /v1/runs/{run_id}/reconnect         rotate run grant for own membership
POST   /v1/runs/{run_id}/leave             own membership intent
```

Internal service API:

```text
POST /internal/v1/runs/{run_id}/claim       sim lease/assignment
POST /internal/v1/runs/{run_id}/heartbeat   lease + health
POST /internal/v1/runs/{run_id}/bootstrap   bounded player/loadout snapshots
POST /internal/v1/runs/{run_id}/results     immutable idempotent result
POST /internal/v1/runs/{run_id}/ended       lifecycle close
```

The streaming gameplay endpoint accepts only the run command grant and derives `membership_id`, `player_id`, scopes, and active run from it. Profile APIs derive `account_id` from the access token and enforce object ownership at every endpoint. Avoid generic `profile/save`, arbitrary field binding, admin endpoints on the public router, and secrets in query parameters.

## Threat Model And Controls

| Threat | Consequence | Minimum control |
|---|---|---|
| Change `profile_id`/`run_id` in request | Read or mutate another pilot | Account-derived row authorization on every object operation; negative authorization tests; opaque ids only as defense in depth. |
| Mass-assign profile/result JSON | Free EM/items/upgrades, fake outcome | Allowlist cosmetic/settings patches; durable mutations only through domain commands and sim settlement. |
| Steal/replay Steam ticket | Account takeover | TLS; exchange immediately; validate audience/AppID and provider response; reject replay; never log ticket. |
| Steal access/refresh token | Account/session takeover | Short access TTL, audience/scope restrictions, rotated or device-bound refresh token, OS secret storage, family revocation on reuse. |
| Steal command credential | Pilot hijack | Run-only scope, short TTL, secret hash at rest, authority epoch, sequence checks, rotate on reconnect/role change, rate limit. |
| Guess/share invite | Unauthorized join/harassment | At least 128 random bits, hash at rest, body redemption, short TTL/use count, bind to party/account when possible. |
| Replay/conflict result | Duplicate rewards or divergent history | Sim service authentication, run lease, immutable result hash, unique `(run,membership)`, atomic idempotent settlement. |
| Compromised player host | Cheats, kicks, outcome fraud | Host role controls lobby choices only. Hosted sim retains all gameplay and settlement authority. |
| Host-role race | Two hosts/reset conflict | Versioned session/membership compare-and-swap and host-scoped authority epoch. |
| Local save edit/import | Polluted online economy | Separate local/cloud lineages; no trusted economic merge; tag any approved legacy grant. |
| Reconnect with stale body | Duplicate pilot or old commands | Stable membership + new connection/grant epoch; explicit incarnation; revoke old connection/grant. |
| Public event/snapshot leaks private state | Inventory/position/privacy leak | Existing player-local lanes plus server-derived visibility; schema-based outbound projection; never serialize internal objects. |
| DDoS/resource abuse | Downtime/cost spike | Edge limits before sim allocation, per-account/session quotas, bounded payloads, invite redemption throttles, idle expiry, overload policy. |
| Account-link substitution | Attacker binds victim provider | Require fresh provider proof in same session, show target identity, prevent linking provider subject already owned, audit and recovery flow. |
| Ban evasion / false positives | Abuse or unjust exclusion | Account/provider-centered bans, evidence and appeals; device/IP are weighted signals only. Steam notes game bans require the game server to exclude banned users and can be surfaced through Steam authentication ([Steam anti-cheat and game bans](https://partner.steamgames.com/doc/features/anticheat%20?l=english)). |
| Logs/backups retain secrets or PII | Breach/privacy exposure | Structured allowlisted logging, secret redaction at ingress, restricted audit store, encryption, retention/deletion jobs, restore-time deletion ledger. |

OWASP also calls unrestricted resource consumption an API risk; for LBH, fake session allocation and unbounded history/export endpoints are direct cost attacks ([OWASP API Security Top 10 2023](https://owasp.org/API-Security/editions/2023/en/0x11-t10/)). Rate limits must apply before creating a sim, and all lists/payloads need hard bounds.

## Privacy, Export, Retention, And Deletion

Data minimization is an architecture requirement, not a later policy page. GDPR Article 5 requires personal data to be adequate, relevant, and limited to what is necessary, and Article 17 establishes erasure rights and downstream notification duties in applicable cases ([official EUR-Lex text](https://eur-lex.europa.eu/eli/reg/2016/679/art_17/oj/eng)). Exact legal bases and regional obligations need counsel before launch.

Collect for MVP:

- internal account/profile ids, SteamID/provider evidence, entitlement observations;
- display name, progression, vault/loadout, private run history;
- device/auth-session inventory sufficient for revocation;
- bounded security/audit events and moderation evidence;
- coarse region and short-lived network security data if operationally necessary.

Do not collect email, legal name, address, contacts/friend graph, voice recordings, precise location, hardware fingerprint, or raw input/replay history unless a shipped feature has a documented need and retention policy.

Initial retention proposal:

| Data | Retention |
|---|---|
| Active account/profile/progression | Account lifetime; exportable; erase/anonymize on completed request subject to documented exceptions. |
| Auth ticket/access token | Never persist ticket/access token; transient processing only. |
| Refresh session record | Until expiry/revocation plus 30 days of minimal reuse/security evidence. |
| Live connection/session routing | Live run plus 7 days; aggregate non-identifying operations metrics may remain. |
| Private run results/Chronicle | Account lifetime or user deletion; offer per-profile deletion if product permits. |
| Shared echo | 30 days or bounded per-seed eviction, whichever comes first; anonymize immediately when source account/profile is deleted or name moderated. |
| General application logs | 14 days. No secrets; pseudonymized ids where possible. |
| Security/audit events | 90 days by default; up to 180 days only for an active abuse/fraud case. |
| Raw IP | Avoid; if required for incident response, 7 days, then delete or convert to a keyed/coarsened abuse signal. |
| Ban evidence | Ban/appeal duration plus 90 days; retain only minimal non-reversible exclusion token longer when legally justified and disclosed. |
| Backups | Encrypted, access-controlled, 35-day rolling expiry; deletion tombstones replayed on restore. |

Export should be a versioned machine-readable archive containing account/provider metadata, profiles, progression ledger, inventory, run history, device/session list, bans/appeals, and shared-content references. Exclude other players' private data, service secrets, anti-abuse rules, and internal security evidence that cannot lawfully be disclosed.

Deletion flow:

1. Require recent authentication, revoke all auth/run grants, disable hosted joins, and enqueue a verified request.
2. Delete or irreversibly detach provider identity, devices, sessions, profiles, inventory, private Chronicle, and analytics identifiers within the published completion window.
3. Anonymize shared echoes and run presentation (`Lost Pilot`), while retaining non-personal aggregate gameplay facts if allowed.
4. Keep only documented minimal ban/fraud/legal records with access restrictions and expiry. A plain SteamID tombstone kept forever “just in case” is not minimization.
5. Record a non-personal deletion tombstone so backup restores and downstream stores reapply deletion; age backups out on schedule.

## Migration From v0.3

### Phase 0 — close internet-unsafe surfaces

- Keep current unauthenticated control-plane endpoints loopback/private only.
- Add explicit API versioning and schema validation.
- Remove reconnect mutation from client-supplied profile/loadout snapshots.
- Add a result id/hash and make local `applyOutcome` idempotent before changing storage.

### Phase 1 — relational local control plane

- Replace the JSON store with SQLite behind the existing control-plane client boundary.
- Add normalized profile revision, inventory, ledger, run result, settlement, membership, and authority-grant records.
- Import existing `lbh_profile_*` and control-plane JSON with an import report and preserved source ids.
- Prove crash/retry behavior, concurrent outcome delivery, export/delete, and backup/restore deletion tests.

### Phase 2 — hosted identity/control plane

- Add Steam ticket exchange, provider identity, entitlement, account, device session, and rotating refresh flow.
- Add ownership checks to every profile/session API and service authentication to sim APIs.
- Add local/cloud profile UX and the conservative migration policy.
- Keep local/offline stack fully functional when hosted services are unavailable.

### Phase 3 — 4–8-player session identity

- Introduce party, session, run membership, per-run public `player_id`, incarnation, connection, authority epoch, and short reconnect reservation.
- Move host promotion to versioned membership roles.
- Bind event privacy, snapshot relevance, and command sequences to membership/grant, not request-body ids.
- Run adversarial tests for stolen/stale grants, cross-profile access, reconnect races, duplicate settlement, and host migration.

### Phase 4 — operations and later providers

- Add moderation/ban/appeal, deletion/export, retention jobs, support tools with least privilege, and privacy/incident runbooks.
- Add another storefront provider only through the identity/entitlement adapter and only when there is a concrete distribution need.

## MVP Acceptance Gates

- Four and eight separately entitled players can join one run; each has a stable membership/player id and rotating connection/grant identity.
- Changing any id in a profile, session, reconnect, or result request never changes authorization.
- A dropped client can reconnect within the configured window without spawning a duplicate body or accepting stale commands.
- Host departure promotes exactly one eligible membership without granting gameplay or profile authority.
- Delivering the same result 100 times produces one run result, one settlement, one set of inventory grants, and one currency/stat delta.
- Killing the control plane between result receipt and commit either commits once or retries to the same result; the client never becomes durable truth.
- Offline launch, local profiles, local sim, and local Chronicle work without network/account services.
- Linking a modified local save cannot create hosted EM/items/upgrades unless an explicit capped legacy-import policy was enabled and tagged.
- Account export is complete and another player's private fields are absent. Deletion revokes access, removes/anonymizes all mapped records, and survives backup restore.
- Logs, snapshots, events, replays, URLs, and crash reports contain no Steam tickets, refresh/access tokens, command secrets, invite secrets, raw profile snapshots, or platform subjects outside the restricted audit boundary.

## Decisions For Greg

1. **Recommended:** Steam-authenticated hosted play only for MVP; no anonymous hosted guests and no LBH passwords.
2. **Recommended:** keep local and cloud progression as separate lineages. Copy settings/name on link, not economic state.
3. **Recommended:** 90–120 second reconnect reservation; disconnected bodies remain sim-owned and cannot be locally frozen or restored.
4. **Recommended:** host controls lobby/reset/kick proposals only; the dedicated authority controls all gameplay outcomes and settlement.
5. Decide whether Chronicle echoes are private-by-default or shared with the lobby/seed. Shared echoes create moderation and deletion work; private history does not.
6. Decide whether a one-time capped legacy import is worth accepting economy/leaderboard contamination. The secure default is no.

## Primary Sources

- Valve, [Steamworks: User Authentication and Ownership](https://partner.steamgames.com/doc/features/auth?l=english&language=english), accessed 2026-07-10.
- Valve, [Steamworks: Steam Cloud](https://partner.steamgames.com/doc/features/cloud?l=czech&language=english), accessed 2026-07-10.
- Valve, [Steamworks: Anti-cheat and Game Bans](https://partner.steamgames.com/doc/features/anticheat%20?l=english), accessed 2026-07-10.
- IETF, [RFC 9700: Best Current Practice for OAuth 2.0 Security](https://www.rfc-editor.org/info/rfc9700/), January 2025.
- IETF, [RFC 9562: Universally Unique IDentifiers](https://www.rfc-editor.org/info/rfc9562/), May 2024.
- OWASP, [API1:2023 Broken Object Level Authorization](https://owasp.org/API-Security/editions/2023/en/0xa1-broken-object-level-authorization/), accessed 2026-07-10.
- OWASP, [API Security Top 10 2023](https://owasp.org/API-Security/editions/2023/en/0x11-t10/), accessed 2026-07-10.
- European Union, [Regulation (EU) 2016/679, Articles 5 and 17](https://eur-lex.europa.eu/eli/reg/2016/679/art_17/oj/eng), official consolidated text accessed 2026-07-10.
