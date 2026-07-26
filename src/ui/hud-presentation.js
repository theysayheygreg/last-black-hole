import { worldDistance } from '../coords.js';
import { affordanceCaption } from './input-prompts.js';

// Pure HUD projections live here; hud.js owns DOM lifetime and mutation order.
export function fmtTime(seconds) {
  const minutes = Math.floor(Math.max(0, seconds) / 60);
  const remainder = Math.floor(Math.max(0, seconds) % 60);
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}

export function fmtSeconds(seconds) {
  return `${Math.ceil(Math.max(0, seconds || 0))}s`;
}

export function clamp01(value) {
  const numeric = Number(value);
  return Math.max(0, Math.min(1, Number.isFinite(numeric) ? numeric : 0));
}

function cooldownMeter(cooldown, max) {
  if (!cooldown || cooldown <= 0) return 0;
  return clamp01(1 - cooldown / Math.max(1, max || cooldown));
}

export function createAbilitySlot(key, name, state) {
  return {
    key,
    action: state.action || (key === 'R' ? 'ability2' : 'ability1'),
    name,
    status: state.status || '',
    ready: Boolean(state.ready),
    active: Boolean(state.active),
    cooldown: Math.max(0, state.cooldown || 0),
    detail: state.detail || '',
    resourceLabel: state.resourceLabel || '',
    resource: state.resource ?? null,
    charges: state.charges ?? null,
    meter: clamp01(state.meter ?? (state.ready || state.active ? 1 : 0)),
    tone: state.active ? 'active' : state.ready ? 'ready' : 'cooldown',
  };
}

export function getAbilityPresentationState(abilityState = {}) {
  const state = abilityState || {};
  const hull = state.hullType || 'drifter';
  const slots = [];

  if (hull === 'drifter') {
    const active = Boolean(state.flowLockActive);
    const cooldown = Math.max(0, state.eddyBrakeCooldown || 0);
    slots.push(createAbilitySlot('Q', active ? 'flow lock' : 'eddy brake', {
      status: active ? 'surf locked' : cooldown > 0 ? `brake ${fmtSeconds(cooldown)}` : 'brake ready',
      active,
      ready: cooldown <= 0,
      cooldown,
      detail: active ? 'current alignment holding' : 'instant stop + wake turbulence',
      meter: cooldown > 0 ? cooldownMeter(cooldown, 20) : 1,
    }));
  } else if (hull === 'breacher') {
    const fuelMax = 30;
    const fuel = Math.max(0, state.burnFuel || 0);
    const active = Boolean(state.burnActive);
    slots.push(createAbilitySlot('Q', 'burn', {
      status: active ? `burning ${fmtSeconds(fuel)}` : fuel > 1 ? `fuel ${Math.ceil(fuel)}/${fuelMax}` : 'fuel dry',
      active,
      ready: !active && fuel > 1,
      cooldown: 0,
      detail: active ? 'thrust spike, loud signal' : 'hold fuel for a line break',
      resourceLabel: 'fuel',
      resource: fuel,
      meter: clamp01(fuel / fuelMax),
    }));
  } else if (hull === 'resonant') {
    const tapCooldown = Math.max(0, state.tapCooldown || 0);
    const shiftCooldown = Math.max(0, state.frequencyShiftCooldown || 0);
    slots.push(createAbilitySlot('Q', 'tap', {
      status: state.tapAnchor ? 'anchor set' : tapCooldown > 0 ? `anchor ${fmtSeconds(tapCooldown)}` : 'anchor ready',
      active: Boolean(state.tapAnchor),
      ready: tapCooldown <= 0,
      cooldown: tapCooldown,
      detail: state.tapAnchor ? 'pulse space keyed to anchor' : 'place a resonance anchor',
      meter: tapCooldown > 0 ? cooldownMeter(tapCooldown, 15) : 1,
    }));
    slots.push(createAbilitySlot('R', 'shift', {
      status: state.nextPulseInverted ? 'pulse inverted' : shiftCooldown > 0 ? `shift ${fmtSeconds(shiftCooldown)}` : 'shift ready',
      active: Boolean(state.nextPulseInverted),
      ready: shiftCooldown <= 0,
      cooldown: shiftCooldown,
      detail: 'invert next harmonic pulse',
      meter: shiftCooldown > 0 ? cooldownMeter(shiftCooldown, 45) : 1,
    }));
  } else if (hull === 'shroud') {
    const cloakCooldown = Math.max(0, state.wakeCloakCooldown || 0);
    const decoyCooldown = Math.max(0, state.decoyCooldown || 0);
    const decoyCharges = Math.max(0, state.decoyCharges || 0);
    slots.push(createAbilitySlot('Q', 'cloak', {
      status: state.ghostTrailActive ? 'ghost wake' : cloakCooldown > 0 ? `cloak ${fmtSeconds(cloakCooldown)}` : 'cloak ready',
      active: Boolean(state.ghostTrailActive),
      ready: cloakCooldown <= 0,
      cooldown: cloakCooldown,
      detail: 'drop a signal zone when exposed',
      meter: cloakCooldown > 0 ? cooldownMeter(cloakCooldown, 30) : 1,
    }));
    slots.push(createAbilitySlot('R', 'decoy', {
      status: decoyCooldown > 0 ? `${decoyCharges} charge ${fmtSeconds(decoyCooldown)}` : `${decoyCharges} charge${decoyCharges === 1 ? '' : 's'}`,
      active: Array.isArray(state.decoys) && state.decoys.length > 0,
      ready: decoyCharges > 0 && decoyCooldown <= 0,
      cooldown: decoyCooldown,
      charges: decoyCharges,
      detail: 'throw a false signal body',
      meter: decoyCooldown > 0 ? cooldownMeter(decoyCooldown, 60) : (decoyCharges > 0 ? 1 : 0),
    }));
  } else if (hull === 'hauler') {
    const tagCharges = Math.max(0, state.salvageLockCharges || 0);
    const tractorCooldown = Math.max(0, state.tractorCooldown || 0);
    const tractorActive = (state.tractorChannelTimer || 0) > 0;
    slots.push(createAbilitySlot('Q', 'tag', {
      status: `${tagCharges} lock${tagCharges === 1 ? '' : 's'}`,
      active: false,
      ready: tagCharges > 0,
      cooldown: 0,
      charges: tagCharges,
      detail: 'mark nearest salvage for bonus yield',
      meter: tagCharges > 0 ? 1 : 0,
    }));
    slots.push(createAbilitySlot('R', 'tractor', {
      status: tractorActive ? `channel ${fmtSeconds(state.tractorChannelTimer || 0)}` : tractorCooldown > 0 ? `tractor ${fmtSeconds(tractorCooldown)}` : 'tractor ready',
      active: tractorActive,
      ready: tractorCooldown <= 0,
      cooldown: tractorCooldown,
      detail: tractorActive ? 'pull field engaged' : 'pull nearest salvage body',
      meter: tractorActive ? clamp01((state.tractorChannelTimer || 0) / 3) : tractorCooldown > 0 ? cooldownMeter(tractorCooldown, 25) : 1,
    }));
  } else {
    slots.push(createAbilitySlot('Q', 'ability', { status: 'unknown hull', ready: false }));
  }

  return { hull, slots };
}

export function findNearestActivePortal(ship, portalSystem) {
  if (!ship || !portalSystem?.portals) return null;
  let nearest = null;
  for (const portal of portalSystem.portals) {
    if (!portal?.alive || portal.blockedByInhibitor) continue;
    const distance = worldDistance(ship.wx, ship.wy, portal.wx, portal.wy);
    if (!nearest || distance < nearest.distance) nearest = { portal, distance };
  }
  return nearest;
}

export function getRouteObjectiveState(ship, portalSystem, nextWaveTime = null, isFinalWave = false) {
  const count = portalSystem?.activeCount || 0;
  const nearest = findNearestActivePortal(ship, portalSystem);
  if (nearest) {
    return {
      count,
      tone: 'active',
      label: `aperture ${nearest.distance.toFixed(1)}`,
      detail: `${count} active · enter cyan aperture`,
      nearest,
    };
  }
  if (nextWaveTime != null) {
    return {
      count: 0,
      tone: isFinalWave ? 'critical' : 'waiting',
      label: isFinalWave ? 'final aperture inbound' : 'aperture inbound',
      detail: `${fmtTime(nextWaveTime)} until route opens`,
      nearest: null,
    };
  }
  return { count: 0, tone: 'critical', label: 'route closed', detail: 'no extraction aperture', nearest: null };
}

export function getHullPresentationState(hullState = {}, ship = null) {
  const status = String(hullState.status || ship?.status || 'nominal').toLowerCase();
  const shielded = Boolean(hullState.shielded || hullState.shieldCharges > 0);
  const grace = Math.max(0, Number(hullState.graceRemaining) || 0);
  const ratio = clamp01(hullState.ratio ?? (status === 'dead' ? 0 : 1));
  if (shielded) return { ratio, label: 'shielded', tone: 'shielded' };
  if (grace > 0) return { ratio, label: `impact ${grace.toFixed(1)}s`, tone: 'critical' };
  if (status === 'dead' || status === 'critical') return { ratio, label: status, tone: 'critical' };
  return { ratio, label: status === 'alive' ? 'nominal' : status, tone: ratio < 0.35 ? 'critical' : 'nominal' };
}

export function getInteractionPresentationState(interaction, promptOptions = {}) {
  if (!interaction || interaction.visible === false) return null;
  const label = String(interaction.label || 'confirm interaction');
  const detail = String(interaction.detail || 'hold position');
  if (interaction.actionable === false) return { action: null, label, detail, caption: null };
  const action = interaction.action || 'confirm';
  const verb = String(interaction.verb || 'confirm');
  return { action, label, detail, caption: affordanceCaption(action, verb, promptOptions) };
}

export function getSlingshotInteractionState(slingshot) {
  if (!slingshot) return null;
  if (slingshot.engaged) {
    return {
      action: 'slingshot',
      label: 'slingshot locked',
      detail: 'release the orbit',
      verb: 'release',
    };
  }
  const anchor = slingshot.aim || slingshot.affordance;
  if (!anchor) return null;
  const anchorType = anchor.type || anchor.anchorType || 'anchor';
  const engageEligible = slingshot.aim?.engageEligible ?? slingshot.engageEligible;
  if (slingshot.aim && engageEligible === false) {
    return {
      actionable: false,
      label: `${anchorType} in range`,
      detail: 'align with current',
    };
  }
  return {
    action: 'slingshot',
    label: `${anchorType} in range`,
    detail: 'ride the current',
    verb: 'engage',
  };
}
