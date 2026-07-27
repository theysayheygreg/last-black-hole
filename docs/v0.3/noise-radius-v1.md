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
| force pulse / decoy / contact | 600m / 700m / 300m |

Continuous emission decays at `90m/s` after release. Discrete emissions hold
for `0.35s`, then decay at `120m/s`. Passive echo proximity is silent. Heat,
gravity-only slingshot, and Inhibitor contact do not mirror into player Noise.
The narrow modifier hooks are data-owned idle floor, radius multiplier, and
decay multiplier.

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
source as `VESSEL` or `VESSEL THRUST`. Identification never exposes private
identity, equipment, cargo, cooldown, hidden state, or exact position beyond
the justified bearing/range.

Edge indicators are limited to the stable active exit/extraction marker and a
small deterministic set of genuinely audible contacts. Wells, wrecks,
objectives, unheard enemies/Inhibitors, teammates, inactive portals, and other
entities have no omniscient edge marker. The exit marker is visually distinct
and does not blink with audible-contact memory.

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
