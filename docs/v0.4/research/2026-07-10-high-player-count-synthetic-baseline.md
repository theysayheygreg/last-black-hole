# High-Player-Count Synthetic Authority Baseline

> Measured 2026-07-10 on GregBot from
> `codex/v0.4-multiplayer-architecture`. This is a short diagnostic baseline,
> not a production capacity claim.

## Purpose

Anchor the 24/48/96-client forecasts in one live measurement of the current
v0.3 authority. The test intentionally used the unmodified HTTP protocol and
current full-snapshot path so later WSS/projection work has a before case.

## Scenario

For each human count `4, 8, 24, 48, 96`:

1. Start a fresh Deep Field sim with `maxPlayers` equal to the human count.
2. Join that many human players. The current runtime also spawns three AI
   pilots, so total player bodies are `humans + 3`.
3. Observe the tick for two seconds with joined players idle.
4. Send 15 rounds of input about 10 times/second through concurrent HTTP
   requests for every human.
5. Set `pulse=true` for all humans in round eight, creating one simultaneous
   player-to-player scan burst.
6. Read five full `/snapshot` bodies and the final `/health` state.

This was an inline diagnostic command and did not edit source or fixtures.

## Results

| Humans | Total player bodies | Effective target Hz | Idle observed Hz | Input observed Hz | Full snapshot KiB | Max sampled snapshot response | Heap used | Ballpark rebuild | Overload |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| 4 | 7 | 8 | 7.97 | 8.14 | 112.53 | 8.20 ms | 10.05 MiB | 1.426 ms | DILATED |
| 8 | 11 | 8 | 8.98 | 7.99 | 122.92 | 9.06 ms | 14.61 MiB | 1.436 ms | DILATED |
| 24 | 27 | 8 | 8.99 | 7.72 | 152.18 | 8.79 ms | 10.89 MiB | 1.147 ms | DILATED |
| 48 | 51 | 8 | 8.98 | 7.95 | 188.11 | 14.82 ms | 12.41 MiB | 1.503 ms | DILATED |
| 96 | 99 | 8 | 8.98 | 7.83 | 261.25 | 12.63 ms | 23.49 MiB | 1.150 ms | DILATED |

Heap is process heap at one sample, not controlled incremental growth. Snapshot
response time is a maximum of five local loopback requests, not a p95. The idle
window can observe nine ticks because interval boundaries and measurement
requests are not synchronized.

## What This Supports

- Current per-player movement/contact work and one simultaneous-pulse burst do
  not immediately collapse the fixed-step loop at 96 humans on GregBot.
- Full snapshot size grew by about 1.58 KiB per added human across the 4-to-96
  range in this scenario: `(261.25 - 112.53) / 92 = 1.62 KiB/human` using the
  table's rounded endpoints.
- Ballpark rebuild stayed around 1.1–1.5 ms because the world/entity catalog
  stayed capped; player count alone did not create a larger map or a richer
  ecology.
- Current full-snapshot body size at 96 is still locally cheap to build/read
  once. It is not cheap to fan out independently at snapshot cadence.

At six snapshots/second, 261.25 KiB is about 1.60 MB/s for one uncompressed
recipient. Sending that full body independently to 96 recipients would be
about 154 MB/s or 554 GB/hour before framing, TLS, input, events, or voice.
This is a deliberately naïve ceiling, but it proves that 96-player support
requires shared public-frame encoding, owner-private overlays, deltas, and
likely relevance/LOD.

## Important Overload Finding

All scenarios reached `DILATED`. Deep Field's base profile is 10 Hz; the
current DILATED projection makes it 8 Hz.

The live overload input uses `relevance.alivePlayers.length` as `playerCount`.
That includes the three AI pilots. `measurePressure()` divides this value by
`base.maxPlayers`, whose session meaning is the human admission cap, while
scavenger pressure is also added separately. At four humans, the player ratio
is therefore `7 / 4`, not `4 / 4`. This can push ordinary configured sessions
toward overload before CPU cost alone requires it.

The high-count model must distinguish:

- human seats;
- AI pilot bodies;
- scavenger/ecology counts;
- actual measured tick cost;
- configured capacity pressure.

Do not extrapolate current DILATED clocks as the natural 96-player design until
that denominator and intended AI-fill semantics are resolved.

## What This Does Not Measure

- real persistent WebSocket traffic or on-wire bytes;
- recipient-specific owner/public projection;
- encoding and sending 24/48/96 distinct payloads;
- multiple simultaneous pulses over many ticks or adversarial ability spam;
- player-player body collision if later designed;
- a world/entity population scaled for 24/48/96 humans;
- heavy AI, fauna, sentry, wave, portal, wreck, or field growth;
- 15/20/30 Hz movement clocks;
- WAN latency, loss, jitter, backpressure, reconnect, or slow readers;
- multiple match authorities sharing the same physical host;
- GC p95/p99, CPU core saturation, resident memory, or long-soak leaks.

## Next Benchmarks

1. Repeat with fixed overload state and report base/effective clocks separately.
2. Measure quiet, representative, and worst-case action mixes for 15 minutes
   at every population.
3. Scale world entities independently of players: 1x, 2x, 4x, and 8x current
   public bodies.
4. Capture per-system tick timings and O(P), O(P*E), and O(P^2) families.
5. Encode one shared public frame plus owner overlays, then compare against
   naïve per-recipient full serialization.
6. Run one authority per host, then 2/4/8 authorities per host, with one noisy
   96-player match beside normal 4–8-player matches.
7. Repeat under the chosen hosted CPU classes and actual transport.
