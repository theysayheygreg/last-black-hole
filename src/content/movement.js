// The sandbox approximation and authoritative sim share these movement
// baselines. Hull and rig modifiers remain layered on top in their owners.
import movementData from './movement.data.json' with { type: 'json' };

export const MOVEMENT = movementData;
