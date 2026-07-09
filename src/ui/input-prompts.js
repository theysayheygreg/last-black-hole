import { ACTION_PROMPT_LABELS } from './input-bindings.js';

function queryHasDeckMode() {
  const search = globalThis?.location?.search || '';
  if (!search) return false;
  try {
    const params = new URLSearchParams(search);
    return params.get('deck') === '1' || params.get('steamdeck') === '1';
  } catch {
    return false;
  }
}

export function isDeckMode(options = {}) {
  if (options.deck != null) return Boolean(options.deck);
  if (globalThis.__LBH_DECK__ === true) return true;
  return queryHasDeckMode();
}

export function preferredInputMode(options = {}) {
  if (isDeckMode(options)) return 'deck';
  const explicit = String(options.mode || options.inputMode || '').toLowerCase();
  if (explicit === 'deck' || explicit === 'controller' || explicit === 'keyboard') return explicit;
  const source = String(options.lastInputSource || options.inputSource || '').toLowerCase();
  if (source === 'gamepad' || source === 'controller') return 'controller';
  return 'keyboard';
}

export function promptLabel(action, options = {}) {
  const labels = ACTION_PROMPT_LABELS[action];
  if (!labels) return String(action || '').toUpperCase();
  const mode = preferredInputMode(options);
  return labels[mode] || labels.controller || labels.keyboard;
}

export function ctaLabel(action, label, options = {}) {
  const button = promptLabel(action, options);
  const copy = String(label || '').trim();
  return copy ? `${button} ${copy}` : button;
}

/**
 * Supporting copy for a command whose visible label is rendered separately.
 * Keeping the affordance out of the command face lets the same action read as
 * a verb first while keyboard and controller prompts swap underneath it.
 */
export function affordanceCaption(action, verb, options = {}) {
  const button = promptLabel(action, options);
  const copy = String(verb || '').trim();
  return copy ? `${button} ${copy}` : button;
}

export function menuHint(options = {}) {
  return `${promptLabel('tabs', options)} tabs    ${promptLabel('select', options)} select    ${promptLabel('confirm', options)} confirm    ${promptLabel('back', options)} back`;
}

export function movementHint(options = {}) {
  return `steer stick/arrows   ${promptLabel('thrust', options)} thrust   ${promptLabel('brake', options)} brake   ${promptLabel('pulse', options)} pulse   ${promptLabel('tabs', options)} abilities`;
}

export function mapSelectHint({ remote = false, hostReset = false, ...options } = {}) {
  const base = remote
    ? `${promptLabel('select', options)} select    ${promptLabel('confirm', options)} join/host`
    : `${promptLabel('select', options)} select    ${promptLabel('confirm', options)} launch`;
  const reset = remote && hostReset ? `    ${promptLabel('delete', options)} host reset` : '';
  return `${base}${reset}    ${promptLabel('reroll', options)} reroll seed    ${promptLabel('back', options)} back`;
}

export function inventoryHint(options = {}) {
  return `${promptLabel('select', options)} select  ${promptLabel('confirm', options)} confirm  ${promptLabel('inventory', options)} close`;
}

export function setDeckModeAttribute(element, options = {}) {
  if (!element) return;
  const mode = preferredInputMode(options);
  element.dataset.inputMode = mode;
  element.dataset.deckMode = isDeckMode(options) ? 'true' : 'false';
}
