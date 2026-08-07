# v0.3 Condition Store

> Implementation snapshot: Endless Sky Phase 1B on the v0.3 candidate line.

## Authority

LBH has one typed, namespaced condition vocabulary for content-addressable
facts. `src/content/conditions.data.json` declares every condition, its scope,
type, default, validation limits, and allowed mutations. `ConditionStore` is the
only mutation and query interface for those facts.

The store is not an event bus and does not take authority from the simulation.
Live cargo, hull, Heat, extraction, map cycle, contacts, Noise, and grapple
truth remain in their existing owners. Read-only derived providers expose those
facts through the same vocabulary without persisting or mirroring them.

## Scopes and ownership

- `pilot.*` owns durable profile scalars: currency, rig ranks, legacy upgrade
  ranks retained for save compatibility, unlock gates, and Chronicle totals.
- `run.*` owns resettable run facts: identity, map, seed, signature modifier,
  and explicit discoveries.
- `session.*` is reserved for facts whose lifetime is truly session-wide; no
  v0.3 fact uses it merely as a convenient cache.
- Structured vault, loadout, run-result, and echo records remain in their
  authoritative record owners. They are not flattened into string conditions.

All writes use actions declared in the registry. Derived conditions are
read-only. Unknown names, invalid values, type mismatches, and illegal actions
fail at the registry/store boundary.

## Persistence migration

The browser profile and control-plane profile adapter migrate legacy scalar
fields into `conditionValues`, sanitize unknown or retired condition keys, and
project compatibility fields only at persistence/protocol boundaries. Existing
player progress remains readable while new gameplay and content consumers use
condition names. Server/profile hydration remains authoritative over stale
client snapshots.

## Content and journey seam

Map availability is the first real content gate using a declared condition
query rather than feature-specific branching. Tests and future Journey content
use the same `read`, `evaluate`, and `assert` vocabulary. Phase 1C may build its
runtime on this seam; it must not add a second condition registry or gameplay
authority.

## Change rules

1. Add or change vocabulary in the registry manifest first.
2. Put durable scalar writes through a declared store mutation.
3. Register live truth as a derived provider at its existing authority owner.
4. Do not copy live simulation state into persisted conditions.
5. Do not introduce call-site condition math, raw backing-map mutation, or a
   feature-local condition namespace.
