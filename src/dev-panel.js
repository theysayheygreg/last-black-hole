/**
 * dev-panel.js — Floating DOM panel for live-tuning CONFIG values.
 *
 * Reads CONFIG structure dynamically and generates sliders/checkboxes.
 * Toggle with backtick (`). Top-right corner, collapsible, semi-transparent.
 * No presets, no localStorage — Monday minimal version.
 */

import { CONFIG } from './config.js';

// Deep-clone CONFIG at import time for reset
const DEFAULTS = JSON.parse(JSON.stringify(CONFIG));

// Slider range hints per key. Keys not listed get sensible auto-ranges.
const RANGE_HINTS = {
  'ship.thrustForce':       { min: 0.1, max: 20, step: 0.1 },
  'ship.fluidCoupling':     { min: 0, max: 1, step: 0.01 },
  'ship.turnRate':          { min: 30, max: 360, step: 1 },
  'ship.turnCurvePower':    { min: 1, max: 4, step: 0.1 },
  'ship.turnDeadZone':      { min: 0, max: 30, step: 1 },
  'ship.mass':              { min: 0.1, max: 5, step: 0.1 },
  'ship.dragInCurrent':     { min: 0, max: 1, step: 0.005 },
  'ship.dragAgainstCurrent':{ min: 0, max: 1, step: 0.005 },
  'ship.thrustSmoothing':   { min: 0.01, max: 0.5, step: 0.01 },
  'ship.thrustRampTime':    { min: 0.01, max: 1, step: 0.01 },
  'ship.size':              { min: 4, max: 30, step: 1 },

  'fluid.viscosity':        { min: 0, max: 0.01, step: 0.00005 },
  'fluid.resolution':       { min: 64, max: 512, step: 64 },
  'fluid.pressureIterations':{ min: 5, max: 80, step: 1 },
  'fluid.curl':             { min: 0, max: 2, step: 0.05 },
  'fluid.dissipation':      { min: 0.9, max: 1, step: 0.001 },
  'fluid.densityDissipation':{ min: 0.9, max: 1, step: 0.001 },

  'wells.gravity':          { min: 0, max: 0.01, step: 0.0001 },
  'wells.falloff':          { min: 1, max: 3, step: 0.1 },
  'wells.waveAmplitude':    { min: 0, max: 10, step: 0.1 },
  'wells.waveFrequency':    { min: 0.1, max: 5, step: 0.1 },
  'wells.clampRadius':      { min: 1, max: 50, step: 1 },
  'wells.terminalInflowSpeed':{ min: 0, max: 2, step: 0.01 },

  'affordances.catchWindowDeg':   { min: 0, max: 45, step: 1 },
  'affordances.catchWindowVelPct':{ min: 0, max: 1, step: 0.05 },
  'affordances.lockStrength':     { min: 0, max: 1, step: 0.01 },
  'affordances.inputBufferBefore':{ min: 0, max: 0.5, step: 0.01 },
  'affordances.inputBufferAfter': { min: 0, max: 0.5, step: 0.01 },
  'affordances.thrustSmoothingMs':{ min: 10, max: 200, step: 5 },
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
    width: '320px',
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
  header.innerHTML = '<span style="font-weight:bold;color:#88f;">DEV PANEL</span>';

  // Buttons container
  const btnRow = document.createElement('div');
  btnRow.style.display = 'flex';
  btnRow.style.gap = '6px';

  const copyBtn = makeButton('Copy', () => {
    navigator.clipboard.writeText(JSON.stringify(CONFIG, null, 2))
      .then(() => { copyBtn.textContent = 'Copied!'; setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1200); })
      .catch(() => { copyBtn.textContent = 'Error'; setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1200); });
  });

  const resetBtn = makeButton('Reset', () => {
    applyDefaults(CONFIG, DEFAULTS);
    // Update all slider/checkbox UI
    panel.querySelectorAll('[data-config-path]').forEach(updateControl);
  });

  btnRow.appendChild(copyBtn);
  btnRow.appendChild(resetBtn);
  header.appendChild(btnRow);
  panel.appendChild(header);

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

  // ---- Toggle with backtick ----
  let visible = false;
  window.addEventListener('keydown', (e) => {
    if (e.key === '`') {
      e.preventDefault();
      visible = !visible;
      panel.style.display = visible ? 'block' : 'none';
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
  label.style.width = '120px';
  label.style.flexShrink = '0';
  label.style.overflow = 'hidden';
  label.style.textOverflow = 'ellipsis';
  label.textContent = key;
  label.title = path;

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

  // For updateControl after reset
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
