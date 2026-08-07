# Movement Design

> **Canonical movement-affordance contract.** This stable path owns the shared
> player, AI, and AgentPlay movement grammar. Version-specific mechanics and
> implementation status remain indexed from
> [`docs/v0.3/DESIGN-INDEX.md#movement`](../v0.3/DESIGN-INDEX.md#movement).
> The frozen v0.1 body remains historical context at
> [`docs/v0.1/design/MOVEMENT.md`](../v0.1/design/MOVEMENT.md).

## Design priority

Movement is the game. The ship should feel deliberate without asking the
player to fight tick-scale error or invisible helper modes. Simplicity,
player-readable cause and effect, and one learnable grammar outrank physical
accuracy.

Assistance resolves intent that the pilot has already made unambiguous. It
never invents intent. Free flight remains free, and all existing authoritative
forces and movement still apply after intent shaping.

## Endless Sky Phase 1A — locked v0.3 decision

**Status:** design locked; implementation has not started.

Player control, AI control, and AgentPlay use the same movement grammar. They
differ only in who supplies desired heading and thrust/brake intent. No actor
gets a separate turning, braking, approach, or settling model.

The canonical conceptual pipeline is:

```text
intent
  -> desired heading + thrust/brake
  -> turn convergence
  -> useful-thrust gate
  -> stopping-envelope assistance
  -> existing authoritative forces/movement
  -> negligible-motion resolution
```

### Shared affordances

1. **Fractional final-frame turn convergence is universal.** When the remaining
   angle is smaller than a normal authority-tick turn, settle exactly onto the
   requested heading instead of overshooting and correcting on later ticks.
2. **Useful-thrust gating is universal.** During a major requested heading
   change, smoothly reduce forward thrust until that acceleration helps the
   requested line. Never silently discard thrust input. Presentation must make
   the shaping legible by shortening or canting the engine plume while the ship
   redirects thrust.
3. **Stopping-envelope assistance is universal when intent is explicit.** It
   applies while braking and while approaching an explicitly selected
   interaction target. The same rule supports salvage, EXFIL, portals, grapple
   approaches, and ordinary manual stopping.
4. **Negligible braking drift resolves to rest.** While braking, residual
   velocity below one small, gameplay-meaningful threshold becomes zero. The
   threshold is a shared tuning value, not an actor-specific exception.
5. **Assistance strength follows certainty.** Free flight receives no invented
   destination or heading. Assistance may become stronger only during braking,
   grappling, or an explicitly selected interactable approach.
6. **Intent shaping is not a new movement mode.** `TERMINAL`, `GRAPPLED`, and
   `FREE` ownership remain intact. Gravity, fabric carry, impulses, drag, Heat,
   collision, and every other existing authoritative contribution still run in
   their owned order after intent shaping.

### Player-visible acceptance bar

A ship approaches a portal, salvage contact, or EXFIL once; turns cleanly;
brakes once; and settles into a usable interaction position without orbiting,
repeated reversal, tiny residual drift, or control twitch. The same behavior
must result whether the intent comes from the player, AI, or AgentPlay.

This bar is a design target, not an implementation or test-pass claim. Tuning
remains subject to Greg's movement-feel review after a playable slice exists.
