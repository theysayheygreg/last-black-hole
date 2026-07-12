# T1 Managed Per-Browser TCP Proxy Implementation

> Decision-ready implementation contract for
> `codex/v0.4-multiplayer-architecture`, 2026-07-12. T1 proves configured
> userspace TCP-stream proxy latency/rate headroom and gameplay outcomes. It
> does not prove IP packet loss/reorder, congestion/retransmission behavior,
> receive-window pressure, WAN, TLS, or hosted behavior.

## Decision

Use one dedicated Toxiproxy v2.12.0 daemon for each harness run and create four
independently named loopback proxy listeners, one per browser. Every listener
forwards to the same `127.0.0.1:<simPort>` process:

```text
browser 0 -> proxy 0 --+
browser 1 -> proxy 1 --+
browser 2 -> proxy 2 --+-> one match authority -> one sim/gameplay writer
browser 3 -> proxy 3 --+
```

The proxies are independent client paths, not authorities. The runner must
retain the existing same-run assertion, record one sim PID and registry, and
fail if browser traffic bypasses its assigned listener. Harness health and
events oracles continue to address the authority directly and remain outside
client latency samples.

Manage Toxiproxy as a test child process and cached external tool. Do not add a
game runtime dependency or edit production source. Provisioning must verify the
exact binary hash before execution; an existing Homebrew binary is not accepted
merely because its command name matches.

## Pinned tool

Pin the MIT-licensed [Toxiproxy v2.12.0 release](https://github.com/Shopify/toxiproxy/releases/tag/v2.12.0),
published 2025-03-18 from commit
`3ccd6a79cbc6c6a72b884d295ad314b75cdf3962`.

| Asset | SHA-256 |
|---|---|
| `toxiproxy-server-darwin-arm64` | `aa299966b52f16a8594f1cd0d1e9049dc2e8fe2c04a90c19860e2719b2b95d15` |
| `toxiproxy-server-darwin-amd64` | `9625bba4bd96117eedae49f982aba4c2f462b268dd406c9ff18186f9b1ef8afe` |
| `toxiproxy-server-linux-amd64` | `556d891134a3c582dc1e1a3f7335fd55142e5965769855a00b944e13e48302fc` |
| `toxiproxy-server-linux-arm64` | `53e770c1c3035b5a9f1bc629fce537db1f95f62b26f4ebe6e756afd701cf077c` |

The launcher binds the control API to loopback and enables directional byte
metrics:

```text
toxiproxy-server -host 127.0.0.1 -port <control-port> -proxy-metrics
```

`GET /version` must return HTTP 200 and JSON `{ "version": "2.12.0" }`; the
launcher parses and validates that exact field rather than comparing raw
response text. `listen: "127.0.0.1:0"` requests an ephemeral listener; the
returned `listen` address is authoritative and must be persisted rather than
reconstructed. The pinned
[HTTP API contract](https://github.com/Shopify/toxiproxy/blob/v2.12.0/README.md#http-api)
and [proxy implementation](https://github.com/Shopify/toxiproxy/blob/v2.12.0/proxy.go)
establish this behavior.

## Scenario contract

Add `T1-cap-headroom` as a four-browser PR-smoke variant using root seed
`0x0411CA90`, 5 seconds warm-up, 30 seconds active, and 10 seconds recovery.
This 45-second local profile does not replace the canonical 90-second T1 row,
which remains 15 seconds clean warm-up, 60 seconds active, and 15 seconds
recovery for nightly/pre-hosted evidence. Both profiles use the same scenario
identity, topology, fixed toxic values, and gates; every artifact labels its
duration profile.

Before admission, create each proxy's four toxics with `toxicity: 0` in the
same documented order: upstream latency, upstream bandwidth, downstream
latency, downstream bandwidth. Verify and persist the complete inactive chains.
This prevents concurrent HTTP arrival from making same-direction chain order
nondeterministic while keeping admission and the first common aligned baseline
clean.

At the runner's future dispatch deadline, issue every pre-created toxic PATCH
to `toxicity: 1` concurrently. Toxiproxy has no scheduled or atomic multi-proxy
activation. Journal each request-send and successful-response monotonic time;
measured apply skew is last successful response minus first successful response
and must be at most 100 ms for the PR smoke. This is a best-effort harness gate,
not an exact daemon-side barrier. Exclude the measured activation interval plus
a 250 ms guard from steady-state samples.

Each pilot receives:

| Direction | Fixed latency | Target rate | Toxiproxy rate | Nominal applied rate |
|---|---:|---:|---:|---:|
| upstream, browser to authority | 25 ms | 65,536 B/s (64 KiB/s) | `66` decimal kB/s | 66,000 B/s (64.453125 KiB/s) |
| downstream, authority to browser | 45 ms | 327,680 B/s (320 KiB/s) | `328` decimal kB/s | 328,000 B/s (320.3125 KiB/s) |

Toxiproxy's pinned bandwidth implementation uses integer decimal kB/s, exactly
`rate * 1000` nominal bytes per second. Exact 64/320 KiB/s values are therefore
not representable. The fixture records target, integer rate, nominal applied
bytes/s, nominal applied KiB/s, and
`roundingPolicy: "nearest-integer-decimal-kBps"`. The runner must never label
the toxic value itself KiB/s. See the pinned
[bandwidth test](https://github.com/Shopify/toxiproxy/blob/v2.12.0/toxics/bandwidth_test.go)
and [implementation](https://github.com/Shopify/toxiproxy/blob/v2.12.0/toxics/bandwidth.go).

Use `jitter: 0`. Toxiproxy v2.12.0 does not provide replayable seeded jitter;
its server seed does not govern the latency toxic's package-global RNG. Do not
use `packet_loss`. The proxy terminates two TCP connections and manipulates
ordered stream chunks; Linux receiver-ingress netem remains the packet-truth
lane.

## Gates and claim boundary

After the exclusion window, every pilot must provide at least 100 input-ACK
samples, 100 aligned public/owner pairs, and two reliable actions. Provisional
T1 PR-smoke gates are:

- input ACK p95 at most 250 ms;
- aligned snapshot cadence p95 at most 300 ms;
- reliable consequence p95 at most 700 ms;
- zero post-admission reconnects or rebases;
- bidirectional proxy byte-counter growth for every named proxy;
- zero direct browser WebSocket connection to the authority port;
- no proxy timeout/reset, adapter high-water crossing, or queue-policy action;
- authority remains `NORMAL`, exact-once/privacy ledgers pass, and no hot-path
  HTTP request bypasses the assigned proxy; and
- paused final pages drain pending input and action work before teardown.

This profile is configured headroom. Passing does not prove the bandwidth cap
was saturated or measure its throughput accuracy. T1 may claim configured
fixed TCP-stream proxy latency/rate plus observed browser/gameplay outcomes. It
may not claim packets, retransmissions, congestion, receive-window behavior,
slow-reader pressure, WAN, WSS, or TLS. Record packet capture as
`required: false`, `status: "not-run"`, and a TCP-stream-only reason; pcap is
mandatory only for later packet claims.

## Files and ownership

New owned files:

- `tests/fixtures/network-impairment/toxiproxy-tool-v1.json`: release, platform
  assets, SHA-256 values, expected version, and cache schema;
- `tests/network/provision-toxiproxy.cjs`: explicit fetch-to-cache plus atomic
  hash/version verification; ordinary test runs never silently download;
- `tests/network/toxiproxy-control.cjs`: typed loopback API, daemon/proxy/toxic
  lifecycle, command journal, metrics/config snapshots, rollback, and bounded
  process cleanup;
- `tests/toxiproxy-control.cjs`: no-browser two-listener control and echo proof;
  and
- `tests/network/tcp-proxy-browser-transport.cjs`: four-listener T1 schedule,
  profile dispatch deadline, measured apply skew, mapping, observations, gate
  window, and cleanup verdict.

The integrator alone edits these shared files:

- `tests/fixtures/network-impairment/phase2-browser-v1.json`;
- `tests/network/multiplayer-browser-cohort.cjs`;
- `tests/multiplayer-network-impairment.cjs`;
- `tests/suite-manifest.cjs`; and
- `package.json`.

Change `launchPilot` to accept a per-pilot `simBaseUrl` and assigned proxy
metadata. Do not replace the direct authority oracle URL. The response rewrite
remains protected by the existing exact `src/main.js` hash, and no production
query/hook surface is added.

## Lifecycle and failure behavior

The transport state machine is:

```text
NEW -> DAEMON_READY -> LISTENERS_READY -> ADMITTED -> APPLYING -> ACTIVE
  -> RESTORING -> RESTORED -> STOPPED
```

Any error or abort jumps to `RESTORING`. Create each listener and its inactive
toxic chains in deterministic order before browser admission. Dispatch only
the `toxicity: 1` PATCH operations concurrently across the cohort after the
common runner deadline. Activation is non-atomic. If any request fails or the
completed active configuration is incomplete, immediately PATCH every toxic
back to zero or remove all toxics from every proxy. Unmeasured sequential
activation is invalid.

Cleanup order is evidence-bearing:

1. stop stimulus and sampling, pause pages, and drain client work;
2. remove toxics and capture final config/metrics;
3. close browsers so listener connections drain;
4. delete the four proxy objects;
5. terminate the dedicated daemon with bounded `SIGTERM`, then `SIGKILL` only
   if required;
6. verify daemon death plus closed control and returned listener ports;
7. remove temporary tool/control resources; and
8. stop the one sim authority and static server.

Partial creation and signal interruption must persist allocated PID, control
port, returned listener addresses, and first failure before cleanup. Global
`/reset` is a fallback only because the daemon is dedicated to one run; normal
cleanup deletes explicitly owned toxics and proxies.

## Evidence

Add bounded, redacted artifacts:

- `toxiproxy-commands.jsonl`;
- `toxiproxy-config-before.json`, `toxiproxy-config-active.json`, and
  `toxiproxy-config-final.json`;
- `toxiproxy-metrics.jsonl`, filtered by proxy name and direction;
- daemon stdout/stderr logs;
- `t1-proxy-transport.json`; and
- manifest entries for binary version/hash, one authority PID/port, the four
  pilot-to-listener-to-single-upstream mappings, exact requested/applied
  profile, all ports, capture status, and claim boundary.

Cleanup adds only observable facts: `toxicsRemoved`, `browsersClosed`,
`proxiesDeleted`, `daemonStopped`, `controlPortClosed`, and `proxyPortsClosed`.
Toxiproxy's proxy metrics expose directional bytes, not an active-connection
gauge, so byte stability or proxy deletion must not be labeled graceful
connection drain. Hash gameplay identifiers; listener names and loopback ports
are safe evidence.

## Atomic implementation order

1. Land pin/provisioning, control helper, and standalone two-listener proof.
   Verify hash/version, syntax, focused control behavior, and the full
   multiplayer-network lane. Commit `Tests: pin managed TCP proxy control`.
2. Land T1 fixture, transport helper, cohort/runner/manifest/package wiring.
   Run a dirty T1 diagnostic, then fresh F0/F1/F3/F6/T0 regressions and the full
   multiplayer-network lane. Commit `L0: add per-browser TCP proxy cohort`.
3. From clean committed HEAD, run the no-retry T1 command once. Audit one
   authority, four mappings, exact profile, steady sample floors/gates,
   bidirectional metrics, no bypass, final drain, and cleanup. Record immutable
   acceptance in a docs-only commit.
4. Implement F5 blackout/reset only after T1 acceptance. Do not combine F5,
   T2 slow-reader pressure, netem, or hosted WSS evidence with T1.

## Slice A status — implemented

Commit `b5b3d38` pins and explicitly provisions the v2.12.0 binary, adds the
loopback-only dedicated-daemon controller, and registers the standalone
two-listener lifecycle proof. Ordinary test runs never download the tool; an
absent cache fails with the exact opt-in provisioning command.

The accepted proof verifies binary hash/version, deterministic inactive toxic
chains, exact create/PATCH state, independent ephemeral listeners, both exact
received/sent byte-counter families, requested-name cleanup after deliberately
malformed successful API responses, bounded first-failure evidence, direct
child `error`/`close`/TERM/KILL handling, idempotent deletion, and closed ports.
Provisioning is bounded by size, an absolute deadline, and the observed HTTPS
host chain `github.com -> release-assets.githubusercontent.com`. The focused
proof and all 11 multiplayer-network suites pass. This slice is explicitly a
non-timing control/lifecycle proof; active latency/rate evidence remains T1.
