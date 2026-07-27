# Noise Radius v1

Noise is the player-facing replacement for the historical Signal meter. The
authority owns one decaying audible envelope in canonical meters; it does not
simulate audio and it never advances the Inhibitor clock.

## Emitter contract

| Source | Emitted radius |
| --- | ---: |
| thrust with flow / neutral / against flow | 180m / 240m / 320m |
| powered brake | 220m |
| salvage tier 1 / 2 / 3 | 180m / 320m / 480m |
| force pulse / decoy / contact | 600m / 700m / 300m |

Continuous emission decays at `90m/s` after release. Discrete emissions hold
for `0.35s`, then decay at `120m/s`. Passive echo proximity is silent. Heat,
gravity-only slingshot, and Inhibitor contact do not mirror into player Noise.
The only modifier hooks are data-owned idle floor, radius multiplier, and decay
multiplier.

## Receiving presentation

A player receives a contact only when toroidal distance is within that source's
current emitted radius. The outer audible zone shows category and emitted range
only. At `40%` of the live radius, an event-carried allowlisted public class may
upgrade the category to `VESSEL` or `VESSEL THRUST`; no private identity,
equipment, cargo, cooldown, or hidden state is exposed. An identified contact
keeps that highest public identity while still audible and through its bounded
`2.5s` last-heard fade. Loss freezes bearing/range/category; expiry removes the
memory and a later re-entry starts category-only unless re-identified live.

Enemy listener behavior remains separate authored AI behavior. Signal Blooms are
local listeners, and Swarm acquisition requires an audible Noise source plus
its existing search/lock behavior; a shipped lock remains `LOCKED ON` and is
not disguised as player hearing.

## Presentation and results

The Deck-safe HUD reads `NOISE Xm · TREND`, source, and actual listener counts.
The world draws a restrained player radius/ripple through the existing overlay
loop. Edge indicators contain only the stable exit and capped audible contact
memory. Results record maximum radius, loudest source, and time heard/tracked.

The old 0-100 Signal fill, GHOST/WHISPER/PRESENCE/BEACON/FLARE/THRESHOLD bands,
and any threshold-wakes-Inhibitor interpretation are historical only. The
Conductor remains the sole Inhibitor arrival authority.
