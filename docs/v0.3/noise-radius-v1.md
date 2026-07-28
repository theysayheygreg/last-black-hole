# Noise Radius v1

**Status:** locked v0.3 player-facing design owner at source `91e7f105`.

Noise replaces the historical Signal meter. The authority owns one simple,
decaying emitter/action envelope in canonical meters. It does not simulate
audio, create a receiver-stat system, or advance the Inhibitor clock. Heat is
engine stress and remains a separate presentation; it is never mirrored into
Noise.

## Emitter Contract

The parked baseline is `0m`. These are deliberately tunable starting values,
not permanent balance promises:

| Source | Starting emitted radius |
| --- | ---: |
| thrust with flow / neutral / against flow | 180m / 240m / 320m |
| powered brake | 220m |
| salvage tier 1 / 2 / 3 | 180m / 320m / 480m |
| force pulse / decoy / contact | 1600m / 1900m / 300m |

Continuous emission decays at `90m/s` after release. Discrete emissions hold
for `0.35s`, then decay at `120m/s`. Passive echo proximity is silent. Heat,
gravity-only slingshot, and Inhibitor contact do not mirror into player Noise.
The narrow modifier hooks are data-owned idle floor, radius multiplier, and
decay multiplier.

World contacts use the same meter ruler as the player. The reference Deck
frame (`1280x800`, `3.0` camera world-units, `20px` edge margin) derives a
`1425m` minimum distance to the nearest off-screen edge from the canonical
physical-units scale. The current playable world-emitter starting radii are
Glitch `1600m`, Swarm `4600m`, Vessel `4600m`, and EXFIL `4200m`, all owned by
`src/content/noise.data.json`; these are starting biases, not permanent balance.
Their `cadenceSeconds` values pulse contact presentation emphasis only and
never toggle the underlying distance-based audibility.

Swarm and Vessel warning ranges are also checked against a centralized
time-based starting budget: `3s` at `850m/s` representative cruise, with at
least `1.5s` Swarm and `2.5s` Vessel closure margin at their authored threat
speeds. These values are universal across maps. Shallows intentionally teaches
recognition when those radii saturate its smaller route; larger tiers teach
hunting and navigation by ear.

## Player Receiving Contract

A player hears a source iff canonical toroidal distance to that source is less
than or equal to its current live emitted radius. There are no player hearing
stats, receiver sensitivities, hearing equipment, or ship hearing classes in
v1.

While live, the edge contact shows the truthful sound category and actual
range-to-source in meters, for example `THRUST · 620m`. Direction and range
update while the player remains inside the emitted radius. Outside that radius
the contact freezes its last-heard bearing, range, category, and highest earned
identity, then blinks/fades for `2.5s` before expiring. Re-entry or re-emission
refreshes the same contact; an expired contact starts category-only again.

The outer audible zone is category-only. Within the inner `40%` of the current
emitted radius, an event-carried allowlisted public class may identify the
source as `GLITCH`, `SWARM`, `VESSEL`, or `EXFIL` (with `VESSEL THRUST`
retained for the existing authored source). Identification never exposes
private identity, equipment, cargo, cooldown, hidden state, or exact position
beyond the justified bearing/range.

Every off-screen edge indicator is an audible contact. Ecology entities emit
restrained world Noise from centralized tuning, and active exfils emit
`EXFIL TONE` with close `EXFIL` identity in the cyan family. Wells, wrecks,
objectives, unheard enemies/Inhibitors, teammates, and portals outside their
live emitted radius have no omniscient marker. Exfil contacts use the same live,
frozen-bearing, `2.5s` fade, cap, and expiry lifecycle as every other sound;
there is no stable or privileged exit arrow.

## Enemy Awareness

Enemy awareness is an authored threat contract, not player hearing. Signal
Blooms are local listeners. Swarms normally acquire player or decoy Noise and
search from last-heard state. Existing or future authored extended acquisition,
sparse strategic knowledge, or `LOCKED ON` behavior is explicit and distinct
from `HEARD`; a locked enemy clears only on its authored break condition.
No generalized perception framework or player receiver system is part of v1.

## Presentation And Results

The Deck-safe HUD reads `NOISE Xm · TREND`, source, and actual listener counts.
A restrained radius/ripple uses the existing presentation loop. Heat is a
conditional ship-centered instrument beneath the player: hidden at its cooled
baseline, visible while heating, overheat-locked, or cooling, and hidden again
after returning to baseline. It is not an enemy health bar.

Results record maximum audible radius, loudest source, and truthful heard/
tracked learning stats. The old peak-zone/time-per-zone accounting is retired.

The `0-100` Signal fill, `GHOST`/`WHISPER`/`PRESENCE`/`BEACON`/`FLARE`/
`THRESHOLD` bands, Signal pressure/wake thresholds, and any
threshold-wakes-Inhibitor interpretation are historical only. The Conductor
alone schedules Inhibitor arrivals.
