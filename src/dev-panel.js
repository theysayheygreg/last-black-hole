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
  'ship.thrustAccel':       { min: 100, max: 5000, step: 50, tip: 'Pixels/sec² when thrusting. One number, instant on/off.' },
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

  'wells.gravity':          { min: 0, max: 0.01, step: 0.0001, tip: 'Fluid-space gravity constant. Controls how strongly the well pulls the FLUID' },
  'wells.falloff':          { min: 1, max: 3, step: 0.1, tip: 'Gravity distance exponent. 1 = gentle. 2 = inverse-square. 3 = sharp' },
  'wells.clampRadius':      { min: 1, max: 50, step: 1, tip: 'Minimum radius in sim cells to prevent singularity at well center' },
  'wells.terminalInflowSpeed':{ min: 0, max: 2, step: 0.01, tip: 'Cap on fluid speed near the well. Prevents runaway acceleration' },
  'wells.shipPullStrength': { min: 0, max: 1000, step: 10, tip: 'Direct gravitational pull on the SHIP in px/s² at 100px. THIS is what traps you' },
  'wells.shipPullFalloff':  { min: 1, max: 3, step: 0.1, tip: 'Ship pull distance exponent. 1.5 = softer than real gravity. 2 = inverse-square' },
  'wells.orbitalStrength':  { min: 0, max: 1, step: 0.01, tip: 'Tangential force fraction. 0 = pure infall. 0.3 = gentle orbits. 1.0 = strong whirlpools' },
  'wells.gravityClampDist': { min: 10, max: 100, step: 5, tip: 'Pixel-space min distance for ship gravity calc (prevents instant death at center)' },

  'events.waveSpeed':       { min: 50, max: 500, step: 10, tip: 'Wave ring expansion speed in px/sec. 150 = stately. 400 = dramatic.' },
  'events.waveWidth':       { min: 10, max: 100, step: 5, tip: 'Wavefront thickness in pixels. Wider = easier to surf, less precise' },
  'events.waveDecay':       { min: 0.9, max: 1, step: 0.005, tip: 'Amplitude multiplier per frame. 0.97 = fades fast. 0.99 = rings travel far' },
  'events.waveMaxRadius':   { min: 200, max: 2000, step: 50, tip: 'Ring death radius in pixels. Larger = waves cross the whole map' },
  'events.waveShipPush':    { min: 50, max: 1000, step: 25, tip: 'Force on ship when a ring passes through. 300 = noticeable shove' },
  'events.growthInterval':  { min: 5, max: 60, step: 1, tip: 'Seconds between well growth events. 20 = calm rhythm. 5 = constant drama' },
  'events.growthAmount':    { min: 0.01, max: 0.2, step: 0.01, tip: 'Mass added to each well per growth event. Compounds over time.' },
  'events.growthWaveAmplitude':{ min: 0.1, max: 3, step: 0.1, tip: 'Initial amplitude of growth wave rings. 1.0 = standard. 2.0 = dramatic' },

  'ascii.cellSize':         { min: 4, max: 20, step: 1, tip: 'Character cell width in pixels. Smaller = more detail, more GPU work' },
  'ascii.cellAspect':       { min: 1, max: 2, step: 0.1, tip: 'Cell height/width ratio. 1.5 = readable monospace proportions' },
  'ascii.contrast':         { min: 0.1, max: 2, step: 0.05, tip: 'Luminance curve power. <1 = more chars in dark areas. >1 = sharper contrast' },
  'ascii.colorTemperature': { min: -1, max: 1, step: 0.05, tip: 'Global color shift. Negative = cooler/bluer. Positive = warmer/amber' },
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

    const sec = createSection(section, group);
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

function createSection(name, group) {
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

  for (const key of Object.keys(group)) {
    const val = group[key];
    const path = `${name}.${key}`;

    if (typeof val === 'boolean') {
      content.appendChild(createToggle(name, key, path));
    } else if (typeof val === 'number') {
      content.appendChild(createSlider(name, key, path));
    } else if (Array.isArray(val) && val.every(v => typeof v === 'number')) {
      // Color arrays: one slider per component
      for (let i = 0; i < val.length; i++) {
        const compLabel = ['R', 'G', 'B', 'A'][i] || String(i);
        content.appendChild(createArraySlider(name, key, i, compLabel, `${path}[${i}]`));
      }
    }
    // skip other types silently
  }

  return wrapper;
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
