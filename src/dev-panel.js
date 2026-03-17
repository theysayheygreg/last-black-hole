/**
 * dev-panel.js — Floating DOM panel for live-tuning CONFIG values.
 *
 * Reads CONFIG structure dynamically and generates sliders/checkboxes.
 * Toggle with backtick (`). Top-right corner, collapsible, semi-transparent.
 * Preset buttons (1-4 keys or click) for quick A/B testing.
 */

import { CONFIG } from './config.js';
import { PRESETS, PRESET_NAMES, deepMerge } from './presets.js';

// Deep-clone CONFIG at import time for reset
const DEFAULTS = JSON.parse(JSON.stringify(CONFIG));

// Currently active preset name (exported so other systems can read it)
export let activePreset = 'Default';

// Slider range hints and tooltips per key.
// V2 SIMPLIFICATION: matches collapsed CONFIG — no affordances, fewer ship knobs
const RANGE_HINTS = {
  'ship.thrustAccel':       { min: 0.5, max: 5, step: 0.1, tip: 'World-units/s² when thrusting. 1.7 = default. Higher = zippier.' },
  'ship.fluidCoupling':     { min: 0, max: 1, step: 0.01, tip: '0 = ship ignores fluid. 1 = pure fluid rider. How much currents carry you.' },
  'ship.turnRate':          { min: 60, max: 720, step: 5, tip: 'Degrees/sec rotation toward cursor. 360 = instant feel.' },
  'ship.drag':              { min: 0, max: 0.2, step: 0.005, tip: 'Velocity damping per frame. Low = ice-skating. High = responsive stops.' },
  'ship.size':              { min: 4, max: 30, step: 1, tip: 'Ship triangle radius in pixels' },

  'fluid.viscosity':        { min: 0, max: 0.01, step: 0.00005, tip: 'Fluid thickness. 0 = water. Higher = syrup. Damps small-scale motion' },
  'fluid.resolution':       { min: 64, max: 512, step: 64, tip: 'Sim grid size. 256 = good balance. 128 = fast. 512 = detailed but slow' },
  'fluid.pressureIterations':{ min: 5, max: 80, step: 1, tip: 'Jacobi solver iterations. More = more accurate pressure. 30 = fine' },
  'fluid.curl':             { min: 0, max: 2, step: 0.05, tip: 'Vorticity confinement. Higher = more swirly eddies' },
  'fluid.dissipation':      { min: 0.9, max: 1, step: 0.001, tip: 'Velocity persistence per step. 0.99 = waves fade fast. 0.999 = waves travel far' },
  'fluid.densityDissipation':{ min: 0.9, max: 1, step: 0.001, tip: 'How long visible density (color) persists. Higher = longer trails' },

  'wells.gravity':          { min: 0, max: 0.01, step: 0.0001, tip: 'How strongly wells pull the fluid. 0.0015 = default. Higher = faster currents' },
  'wells.falloff':          { min: 1, max: 3, step: 0.1, tip: 'Gravity falloff. 1 = gentle, 1.5 = default, 2 = inverse-square, 3 = sharp' },
  'wells.orbitalStrength':  { min: 0, max: 1, step: 0.01, tip: 'Swirl strength. 0 = pure infall, 0.4 = default, 1.0 = strong whirlpools' },
  'wells.shipPullStrength': { min: 0, max: 2, step: 0.05, tip: 'How hard wells pull the ship (world-units/s²). THIS is what traps you' },
  'wells.shipPullFalloff':  { min: 1, max: 3, step: 0.1, tip: 'Ship pull falloff. 1.5 = default (softer than inverse-square)' },
  'wells.maxRange':         { min: 0.3, max: 2.0, step: 0.05, tip: 'Gravity reach in world-units — zero force beyond this' },
  'wells.killRadius':       { min: 0.01, max: 0.1, step: 0.005, tip: 'Death radius in world-units' },

  'events.waveSpeed':       { min: 0.1, max: 1.5, step: 0.05, tip: 'Wave ring expansion speed in world-units/sec' },
  'events.waveWidth':       { min: 0.03, max: 0.3, step: 0.01, tip: 'Wavefront thickness in world-units' },
  'events.waveDecay':       { min: 0.9, max: 1, step: 0.005, tip: 'Amplitude multiplier per frame. 0.97 = fades fast. 0.99 = rings travel far' },
  'events.waveMaxRadius':   { min: 0.5, max: 4, step: 0.25, tip: 'Ring death radius in world-units' },
  'events.waveShipPush':    { min: 0.1, max: 3, step: 0.1, tip: 'Force on ship when a ring passes through (world-units/s²)' },
  'events.growthInterval':  { min: 5, max: 120, step: 5, tip: 'Seconds between well growth events. 45 = slow. 5 = constant drama' },
  'events.growthAmount':    { min: 0.005, max: 0.1, step: 0.005, tip: 'Mass added to each well per growth event. Compounds over time.' },
  'events.growthWaveAmplitude':{ min: 0.1, max: 3, step: 0.1, tip: 'Initial amplitude of growth wave rings. 1.0 = standard. 2.0 = dramatic' },

  'ascii.cellSize':         { min: 4, max: 20, step: 1, tip: 'Character cell width in pixels. Smaller = more detail, more GPU work' },
  'ascii.cellAspect':       { min: 1, max: 2, step: 0.1, tip: 'Cell height/width ratio. 1.5 = readable monospace proportions' },
  'ascii.contrast':         { min: 0.1, max: 2, step: 0.05, tip: 'Luminance curve power. <1 = more chars in dark areas. >1 = sharper contrast' },
  'ascii.colorTemperature': { min: -1, max: 1, step: 0.05, tip: 'Global color shift. Negative = cooler/bluer. Positive = warmer/amber' },

  // Stars — visual: rays should be visible across screen, core should glow
  // Stars
  'stars.radiationStrength':{ min: 0, max: 0.005, step: 0.0002, tip: 'Outward push on fluid. 0.001 = matches well gravity' },
  'stars.falloff':          { min: 1, max: 3, step: 0.1, tip: 'Push falloff. 1 = gentle, 2 = sharp' },
  'stars.orbitalStrength':  { min: 0, max: 0.5, step: 0.01, tip: 'Twist on outflow. 0 = radial, 0.15 = spiral' },
  'stars.clearing':         { min: 0, max: 0.5, step: 0.02, tip: 'Dark bubble strength + size. 0.2 = visible void. Also sets bubble radius' },
  'stars.rayCount':         { min: 2, max: 12, step: 1, tip: 'Number of light rays' },
  'stars.rayLength':        { min: 0.05, max: 0.4, step: 0.01, tip: 'Ray length. 0.25 = 1/4 screen' },
  'stars.rayBrightness':    { min: 0.01, max: 0.15, step: 0.005, tip: 'Ray glow. 0.06 = visible, 0.15 = blazing' },
  'stars.raySpinRate':      { min: 0.3, max: 2, step: 0.05, tip: 'Ray rotation (rad/s). 0.3 = stately' },
  'stars.coreBrightness':   { min: 0.02, max: 0.5, step: 0.01, tip: 'Core glow + size. 0.2 = bright star, 0.5 = supernova' },
  'stars.shipPushStrength': { min: 0, max: 2, step: 0.05, tip: 'Ship push (world-units/s²)' },
  'stars.maxRange':         { min: 0.2, max: 1.5, step: 0.05, tip: 'Push reach in world-units — zero force beyond' },
  'stars.shipPushFalloff':  { min: 1, max: 3, step: 0.1, tip: 'Ship push falloff' },

  // Loot
  'loot.gravity':           { min: 0, max: 0.003, step: 0.0002, tip: 'Flow obstruction pull. 0.0008 = gentle eddy, 0.002 = visible vortex' },
  'loot.falloff':           { min: 1, max: 5, step: 0.2, tip: 'How local the pull is. 3 = tight, 1 = wide' },
  'loot.densityRate':       { min: 0.005, max: 0.06, step: 0.002, tip: 'Glow brightness. 0.015 = gentle, 0.04 = beacon' },
  'loot.glowRadius':        { min: 0.005, max: 0.05, step: 0.002, tip: 'Glow size (~1-12 ASCII cells)' },
  'loot.shimmerSpeed':      { min: 0.5, max: 8, step: 0.5, tip: 'Shimmer rotation (rad/s)' },
  'loot.shimmerRadius':     { min: 0.005, max: 0.03, step: 0.002, tip: 'Shimmer orbit size' },
  'loot.overlaySize':       { min: 3, max: 20, step: 1, tip: 'Marker dot size (pixels)' },
  'loot.pulseRate':         { min: 0.5, max: 4, step: 0.25, tip: 'Pulse frequency (Hz)' },

  // Ship wake
  'ship.wake.splatCount':   { min: 1, max: 8, step: 1, tip: 'Trail length (splat count)' },
  'ship.wake.splatSpacing': { min: 0.001, max: 0.01, step: 0.0005, tip: 'Gap between trail splats (UV)' },
  'ship.wake.radius':       { min: 0.002, max: 0.015, step: 0.001, tip: 'Trail width (UV)' },
  'ship.wake.force':        { min: 0.001, max: 0.015, step: 0.0005, tip: 'Flow disturbance strength' },
  'ship.wake.brightness':   { min: 0.1, max: 1.5, step: 0.05, tip: 'Trail visibility' },
  'ship.wake.speedThreshold':{ min: 0.02, max: 0.4, step: 0.02, tip: 'Speed before wake appears' },

  // Portals
  'portals.gravity':        { min: 0, max: 0.002, step: 0.0001, tip: 'Inward pull strength' },
  'portals.captureRadius':  { min: 0.03, max: 0.2, step: 0.01, tip: 'Extraction capture radius (world-units)' },
  'portals.densityRate':    { min: 0.005, max: 0.06, step: 0.002, tip: 'Purple glow brightness' },
  'portals.spiralArms':     { min: 1, max: 6, step: 1, tip: 'Number of spiral arms' },
  'portals.spiralSpeed':    { min: 0.3, max: 3, step: 0.1, tip: 'Spiral rotation speed (rad/s)' },
  'portals.overlaySize':    { min: 6, max: 30, step: 1, tip: 'Overlay marker size (px)' },
  'portals.pulseRate':      { min: 0.3, max: 2, step: 0.1, tip: 'Pulse frequency (Hz)' },

  // Planetoids
  'planetoids.bowShockForce':    { min: 0.001, max: 0.01, step: 0.0005, tip: 'Bow shock disturbance' },
  'planetoids.wakeForce':        { min: 0.0005, max: 0.008, step: 0.0005, tip: 'Wake vortex strength' },
  'planetoids.density':          { min: 0.005, max: 0.03, step: 0.002, tip: 'Trail brightness' },
  'planetoids.orbitSpeed':       { min: 0.1, max: 1.5, step: 0.05, tip: 'Orbit angular speed (rad/s)' },
  'planetoids.transitSpeed':     { min: 0.05, max: 0.4, step: 0.02, tip: 'Transit speed (world-units/s)' },
  'planetoids.shipPushStrength': { min: 0.05, max: 1, step: 0.05, tip: 'Ship push strength (world-units/s²)' },
  'planetoids.shipPushRadius':   { min: 0.05, max: 0.3, step: 0.02, tip: 'Ship push radius (world-units)' },
  'planetoids.mass':             { min: 0.01, max: 0.1, step: 0.005, tip: 'Mass added to well on consumption' },
  'planetoids.size':             { min: 3, max: 15, step: 1, tip: 'Overlay dot size (px)' },
  'planetoids.maxAlive':         { min: 2, max: 12, step: 1, tip: 'Max concurrent planetoids' },

  // Input — stick
  'input.gamepadDeadzone':      { min: 0.05, max: 0.3, step: 0.01, tip: 'Radial deadzone radius. Higher = less drift, less precision.' },
  'input.gamepadOuterDeadzone': { min: 0, max: 0.15, step: 0.01, tip: 'Outer deadzone. Clips near-max so full-tilt is reachable.' },
  'input.gamepadAimEnter':      { min: 0.1, max: 0.5, step: 0.02, tip: 'Magnitude to start aiming. Higher = must push harder.' },
  'input.gamepadAimExit':       { min: 0.05, max: 0.25, step: 0.02, tip: 'Magnitude to stop aiming. Lower = stickier aim lock.' },
  'input.gamepadAimHoldMs':     { min: 20, max: 200, step: 10, tip: 'Ms below exit threshold to confirm release. Absorbs spring bounce.' },
  'input.gamepadSmoothTime':    { min: 0.02, max: 0.2, step: 0.01, tip: 'Smoothing time constant. Lower = snappier, higher = smoother.' },
  'input.gamepadSmallAngle':    { min: 1, max: 10, step: 0.5, tip: 'Degrees — full smoothing below this. Kills sensor jitter.' },
  'input.gamepadBigAngle':      { min: 5, max: 45, step: 1, tip: 'Degrees — zero smoothing above this. Instant response to flicks.' },
  // Input — triggers
  'input.triggerThreshold': { min: 0.01, max: 0.2, step: 0.01, tip: 'Trigger activation threshold' },
  'input.brakeStrength':    { min: 0, max: 0.3, step: 0.01, tip: 'Extra drag from L2 brake' },
};

/**
 * Guess a reasonable slider range for a numeric value with no hint.
 */
function autoRange(val) {
  if (val === 0) return { min: 0, max: 1, step: 0.01 };
  const abs = Math.abs(val);
  const mag = Math.pow(10, Math.floor(Math.log10(abs)));
  return {
    min: 0,
    max: Math.ceil(abs * 3 / mag) * mag,
    step: mag / 100,
  };
}

/**
 * Format a number to a sensible display precision.
 */
function fmt(v) {
  if (Number.isInteger(v)) return String(v);
  if (Math.abs(v) < 0.001) return v.toExponential(2);
  if (Math.abs(v) < 1) return v.toFixed(4).replace(/0+$/, '').replace(/\.$/, '.0');
  return v.toFixed(2);
}

// ---- Overlay toast for preset switching ----
let overlayEl = null;
let overlayTimeout = null;

function showPresetOverlay(name) {
  if (!overlayEl) {
    overlayEl = document.createElement('div');
    overlayEl.id = 'preset-overlay';
    Object.assign(overlayEl.style, {
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      color: '#88f',
      fontFamily: 'monospace',
      fontSize: '28px',
      fontWeight: 'bold',
      letterSpacing: '2px',
      textShadow: '0 0 12px rgba(100, 100, 255, 0.6)',
      pointerEvents: 'none',
      zIndex: '10000',
      opacity: '1',
      transition: 'opacity 0.5s ease-out',
    });
    document.body.appendChild(overlayEl);
  }
  overlayEl.textContent = name.toUpperCase();
  overlayEl.style.opacity = '1';
  if (overlayTimeout) clearTimeout(overlayTimeout);
  overlayTimeout = setTimeout(() => {
    overlayEl.style.opacity = '0';
  }, 2000);
}

/**
 * Create and mount the dev panel. Call once at init.
 */
export function initDevPanel() {
  // ---- Root container ----
  const panel = document.createElement('div');
  panel.id = 'dev-panel';
  Object.assign(panel.style, {
    position: 'fixed',
    top: '8px',
    right: '8px',
    width: '420px',
    maxHeight: 'calc(100vh - 16px)',
    overflowY: 'auto',
    background: 'rgba(10, 10, 30, 0.85)',
    color: '#ccc',
    fontFamily: 'monospace',
    fontSize: '11px',
    lineHeight: '1.4',
    borderRadius: '4px',
    border: '1px solid rgba(100, 100, 255, 0.3)',
    zIndex: '9999',
    padding: '0',
    display: 'none',    // starts hidden
    userSelect: 'none',
  });

  // ---- Header ----
  const header = document.createElement('div');
  Object.assign(header.style, {
    padding: '6px 10px',
    background: 'rgba(40, 40, 80, 0.9)',
    borderBottom: '1px solid rgba(100, 100, 255, 0.3)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    cursor: 'default',
  });

  const headerLabel = document.createElement('span');
  headerLabel.style.fontWeight = 'bold';
  headerLabel.style.color = '#88f';
  headerLabel.textContent = 'DEV PANEL';
  header.appendChild(headerLabel);

  // Active preset badge in header
  const presetBadge = document.createElement('span');
  Object.assign(presetBadge.style, {
    color: '#8f8',
    fontWeight: 'bold',
    fontSize: '10px',
    marginLeft: '8px',
  });
  presetBadge.textContent = '[Default]';
  headerLabel.appendChild(presetBadge);

  // Buttons container (Copy + Reset)
  const btnRow = document.createElement('div');
  btnRow.style.display = 'flex';
  btnRow.style.gap = '6px';

  const copyBtn = makeButton('Copy', () => {
    navigator.clipboard.writeText(JSON.stringify(CONFIG, null, 2))
      .then(() => { copyBtn.textContent = 'Copied!'; setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1200); })
      .catch(() => { copyBtn.textContent = 'Error'; setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1200); });
  });

  const resetBtn = makeButton('Reset', () => {
    applyPreset('Default');
  });

  btnRow.appendChild(copyBtn);
  btnRow.appendChild(resetBtn);
  header.appendChild(btnRow);
  panel.appendChild(header);

  // ---- Preset buttons row ----
  const presetRow = document.createElement('div');
  Object.assign(presetRow.style, {
    display: 'flex',
    gap: '4px',
    padding: '6px 10px',
    background: 'rgba(25, 25, 55, 0.9)',
    borderBottom: '1px solid rgba(100, 100, 255, 0.2)',
  });

  const presetButtons = {};
  PRESET_NAMES.forEach((name, i) => {
    const btn = makeButton(`${i + 1}: ${name}`, () => {
      applyPreset(name);
    });
    // Highlight active preset
    if (name === 'Default') {
      btn.style.background = 'rgba(80, 80, 160, 0.9)';
      btn.style.color = '#fff';
    }
    presetButtons[name] = btn;
    presetRow.appendChild(btn);
  });

  panel.appendChild(presetRow);

  // ---- Body (sections) ----
  const body = document.createElement('div');
  body.style.padding = '4px 0';
  panel.appendChild(body);

  // Build sections from CONFIG keys
  for (const section of Object.keys(CONFIG)) {
    const group = CONFIG[section];
    if (typeof group !== 'object' || group === null || Array.isArray(group)) continue;

    const sec = createSection(section, group, section);
    body.appendChild(sec);
  }

  document.body.appendChild(panel);

  // ---- Apply preset logic ----
  function applyPreset(name) {
    activePreset = name;

    if (name === 'Default' || !PRESETS[name]) {
      // Restore original defaults
      applyDefaults(CONFIG, DEFAULTS);
    } else {
      // First restore defaults, then deep-merge the preset on top
      applyDefaults(CONFIG, DEFAULTS);
      deepMerge(CONFIG, PRESETS[name]);
    }

    // Update all slider/checkbox UI
    panel.querySelectorAll('[data-config-path]').forEach(updateControl);

    // Update preset button highlights
    for (const [pName, pBtn] of Object.entries(presetButtons)) {
      if (pName === name) {
        pBtn.style.background = 'rgba(80, 80, 160, 0.9)';
        pBtn.style.color = '#fff';
      } else {
        pBtn.style.background = 'rgba(60, 60, 120, 0.8)';
        pBtn.style.color = '#aaf';
      }
    }

    // Update header badge
    presetBadge.textContent = ` [${name}]`;

    // Show overlay toast
    showPresetOverlay(name);
  }

  // ---- Toggle with backtick, presets with 1-4 ----
  let visible = false;
  window.addEventListener('keydown', (e) => {
    if (e.key === '`') {
      e.preventDefault();
      visible = !visible;
      panel.style.display = visible ? 'block' : 'none';
      return;
    }

    // Preset shortcuts: 1-4 (only when not typing in an input)
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    const num = parseInt(e.key, 10);
    if (num >= 1 && num <= PRESET_NAMES.length) {
      e.preventDefault();
      applyPreset(PRESET_NAMES[num - 1]);
    }
  });
}

// ---- Helpers ----

function makeButton(label, onClick) {
  const btn = document.createElement('button');
  btn.textContent = label;
  Object.assign(btn.style, {
    background: 'rgba(60, 60, 120, 0.8)',
    color: '#aaf',
    border: '1px solid rgba(100, 100, 255, 0.4)',
    borderRadius: '3px',
    padding: '2px 8px',
    cursor: 'pointer',
    fontFamily: 'monospace',
    fontSize: '10px',
  });
  btn.addEventListener('click', onClick);
  return btn;
}

function createSection(name, group, sectionRoot) {
  const wrapper = document.createElement('div');
  wrapper.style.marginBottom = '2px';

  // Section header (collapsible)
  const hdr = document.createElement('div');
  Object.assign(hdr.style, {
    padding: '4px 10px',
    background: 'rgba(30, 30, 60, 0.7)',
    cursor: 'pointer',
    fontWeight: 'bold',
    color: '#99f',
    fontSize: '11px',
    borderBottom: '1px solid rgba(80, 80, 160, 0.3)',
  });
  let collapsed = false;
  const arrow = document.createElement('span');
  arrow.textContent = '- ';
  hdr.appendChild(arrow);
  hdr.appendChild(document.createTextNode(name.toUpperCase()));

  const content = document.createElement('div');
  content.style.padding = '2px 10px';

  hdr.addEventListener('click', () => {
    collapsed = !collapsed;
    content.style.display = collapsed ? 'none' : 'block';
    arrow.textContent = collapsed ? '+ ' : '- ';
  });

  wrapper.appendChild(hdr);
  wrapper.appendChild(content);

  addGroupControls(content, group, name, sectionRoot);

  return wrapper;
}

function addGroupControls(container, group, prefix, sectionRoot) {
  for (const key of Object.keys(group)) {
    const val = group[key];
    const path = `${prefix}.${key}`;

    if (typeof val === 'boolean') {
      container.appendChild(createToggleNested(group, key, path));
    } else if (typeof val === 'number') {
      container.appendChild(createSliderNested(group, key, path));
    } else if (Array.isArray(val) && val.every(v => typeof v === 'number')) {
      for (let i = 0; i < val.length; i++) {
        const compLabel = ['R', 'G', 'B', 'A'][i] || String(i);
        container.appendChild(createArraySliderNested(group, key, i, compLabel, `${path}[${i}]`));
      }
    } else if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
      // Nested sub-object (e.g., ship.wake) — add a sub-header and recurse
      const subHdr = document.createElement('div');
      Object.assign(subHdr.style, {
        padding: '3px 4px',
        color: '#77a',
        fontSize: '10px',
        fontWeight: 'bold',
        marginTop: '4px',
      });
      subHdr.textContent = `— ${key} —`;
      container.appendChild(subHdr);
      addGroupControls(container, val, path, sectionRoot);
    }
  }
}

// Nested versions that work with any object reference (not just CONFIG[section])
function createSliderNested(obj, key, path) {
  const row = document.createElement('div');
  Object.assign(row.style, {
    display: 'flex', alignItems: 'center', gap: '4px', padding: '2px 0',
  });

  const val = obj[key];
  const hint = RANGE_HINTS[path] || autoRange(val);

  const label = document.createElement('span');
  label.style.width = '150px';
  label.style.flexShrink = '0';
  label.style.overflow = 'hidden';
  label.style.textOverflow = 'ellipsis';
  label.style.cursor = 'help';
  label.textContent = key;
  label.title = hint.tip || path;

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = hint.min;
  slider.max = hint.max;
  slider.step = hint.step;
  slider.value = val;
  slider.dataset.configPath = path;
  Object.assign(slider.style, { flex: '1', accentColor: '#66f', height: '14px' });

  const display = document.createElement('span');
  display.style.width = '52px';
  display.style.textAlign = 'right';
  display.style.flexShrink = '0';
  display.style.color = '#8f8';
  display.textContent = fmt(val);

  slider.addEventListener('input', () => {
    const v = parseFloat(slider.value);
    obj[key] = v;
    display.textContent = fmt(v);
  });

  slider._update = () => {
    slider.value = obj[key];
    display.textContent = fmt(obj[key]);
  };

  row.appendChild(label);
  row.appendChild(slider);
  row.appendChild(display);
  return row;
}

function createToggleNested(obj, key, path) {
  const row = document.createElement('div');
  Object.assign(row.style, {
    display: 'flex', alignItems: 'center', gap: '6px', padding: '3px 0',
  });

  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.checked = obj[key];
  cb.dataset.configPath = path;
  cb.style.accentColor = '#66f';

  const label = document.createElement('span');
  label.textContent = key;
  label.title = path;
  label.style.cursor = 'pointer';
  label.addEventListener('click', () => { cb.click(); });

  cb.addEventListener('change', () => { obj[key] = cb.checked; });
  cb._update = () => { cb.checked = obj[key]; };

  row.appendChild(cb);
  row.appendChild(label);
  return row;
}

function createArraySliderNested(obj, key, index, compLabel, path) {
  const row = document.createElement('div');
  Object.assign(row.style, {
    display: 'flex', alignItems: 'center', gap: '4px', padding: '1px 0', paddingLeft: '8px',
  });

  const val = obj[key][index];

  const label = document.createElement('span');
  label.style.width = '112px';
  label.style.flexShrink = '0';
  label.style.color = '#999';
  label.textContent = `${key}.${compLabel}`;
  label.title = path;

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = 0;
  slider.max = 1;
  slider.step = 0.01;
  slider.value = val;
  slider.dataset.configPath = path;
  Object.assign(slider.style, { flex: '1', accentColor: '#66f', height: '14px' });

  const display = document.createElement('span');
  display.style.width = '52px';
  display.style.textAlign = 'right';
  display.style.flexShrink = '0';
  display.style.color = '#8f8';
  display.textContent = fmt(val);

  slider.addEventListener('input', () => {
    const v = parseFloat(slider.value);
    obj[key][index] = v;
    display.textContent = fmt(v);
  });

  slider._update = () => {
    slider.value = obj[key][index];
    display.textContent = fmt(obj[key][index]);
  };

  row.appendChild(label);
  row.appendChild(slider);
  row.appendChild(display);
  return row;
}

function createSlider(section, key, path) {
  const row = document.createElement('div');
  Object.assign(row.style, {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '2px 0',
  });

  const val = CONFIG[section][key];
  const hint = RANGE_HINTS[path] || autoRange(val);

  const label = document.createElement('span');
  label.style.width = '150px';
  label.style.flexShrink = '0';
  label.style.overflow = 'hidden';
  label.style.textOverflow = 'ellipsis';
  label.style.cursor = 'help';
  label.textContent = key;
  label.title = hint.tip || path;

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = hint.min;
  slider.max = hint.max;
  slider.step = hint.step;
  slider.value = val;
  slider.dataset.configPath = path;
  Object.assign(slider.style, {
    flex: '1',
    accentColor: '#66f',
    height: '14px',
  });

  const display = document.createElement('span');
  display.style.width = '52px';
  display.style.textAlign = 'right';
  display.style.flexShrink = '0';
  display.style.color = '#8f8';
  display.textContent = fmt(val);

  slider.addEventListener('input', () => {
    const v = parseFloat(slider.value);
    CONFIG[section][key] = v;
    display.textContent = fmt(v);
  });

  // For updateControl after reset/preset
  slider._update = () => {
    slider.value = CONFIG[section][key];
    display.textContent = fmt(CONFIG[section][key]);
  };

  row.appendChild(label);
  row.appendChild(slider);
  row.appendChild(display);
  return row;
}

function createArraySlider(section, key, index, compLabel, path) {
  const row = document.createElement('div');
  Object.assign(row.style, {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '1px 0',
    paddingLeft: '8px',
  });

  const val = CONFIG[section][key][index];

  const label = document.createElement('span');
  label.style.width = '112px';
  label.style.flexShrink = '0';
  label.style.color = '#999';
  label.textContent = `${key}.${compLabel}`;
  label.title = path;

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = 0;
  slider.max = 1;
  slider.step = 0.01;
  slider.value = val;
  slider.dataset.configPath = path;
  Object.assign(slider.style, {
    flex: '1',
    accentColor: '#66f',
    height: '14px',
  });

  const display = document.createElement('span');
  display.style.width = '52px';
  display.style.textAlign = 'right';
  display.style.flexShrink = '0';
  display.style.color = '#8f8';
  display.textContent = fmt(val);

  slider.addEventListener('input', () => {
    const v = parseFloat(slider.value);
    CONFIG[section][key][index] = v;
    display.textContent = fmt(v);
  });

  slider._update = () => {
    slider.value = CONFIG[section][key][index];
    display.textContent = fmt(CONFIG[section][key][index]);
  };

  row.appendChild(label);
  row.appendChild(slider);
  row.appendChild(display);
  return row;
}

function createToggle(section, key, path) {
  const row = document.createElement('div');
  Object.assign(row.style, {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '3px 0',
  });

  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.checked = CONFIG[section][key];
  cb.dataset.configPath = path;
  cb.style.accentColor = '#66f';

  const label = document.createElement('span');
  label.textContent = key;
  label.title = path;
  label.style.cursor = 'pointer';
  label.addEventListener('click', () => { cb.click(); });

  cb.addEventListener('change', () => {
    CONFIG[section][key] = cb.checked;
  });

  cb._update = () => {
    cb.checked = CONFIG[section][key];
  };

  row.appendChild(cb);
  row.appendChild(label);
  return row;
}

function updateControl(el) {
  if (el._update) {
    el._update();
  }
  // Also check children (for rows wrapping the input)
  el.querySelectorAll && el.querySelectorAll('[data-config-path]').forEach(child => {
    if (child._update) child._update();
  });
}

function applyDefaults(target, defaults) {
  for (const k of Object.keys(defaults)) {
    if (typeof defaults[k] === 'object' && defaults[k] !== null && !Array.isArray(defaults[k])) {
      applyDefaults(target[k], defaults[k]);
    } else if (Array.isArray(defaults[k])) {
      for (let i = 0; i < defaults[k].length; i++) {
        target[k][i] = defaults[k][i];
      }
    } else {
      target[k] = defaults[k];
    }
  }
}
