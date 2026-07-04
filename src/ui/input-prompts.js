const BUTTON_LABELS = {
  confirm: { keyboard: 'Space', controller: 'A', deck: 'A' },
  back: { keyboard: 'Esc', controller: 'B', deck: 'B' },
  tabs: { keyboard: 'Q/E', controller: 'L1/R1', deck: 'L1/R1' },
  tabPrev: { keyboard: 'Q', controller: 'L1', deck: 'L1' },
  tabNext: { keyboard: 'E', controller: 'R1', deck: 'R1' },
  inventory: { keyboard: 'Tab', controller: 'View', deck: 'View' },
  pause: { keyboard: 'Esc', controller: 'Menu', deck: 'Menu' },
  pulse: { keyboard: 'E', controller: 'X', deck: 'X' },
  slingshot: { keyboard: 'F', controller: 'Y', deck: 'Y' },
  ability1: { keyboard: 'Q', controller: 'L1', deck: 'L1' },
  ability2: { keyboard: 'R', controller: 'R1', deck: 'R1' },
  thrust: { keyboard: 'Space', controller: 'R2', deck: 'R2' },
  brake: { keyboard: 'Ctrl', controller: 'L2', deck: 'L2' },
  navigate: { keyboard: 'Arrows', controller: 'D-pad', deck: 'D-pad' },
  select: { keyboard: 'Arrows', controller: 'D-pad', deck: 'D-pad' },
  reroll: { keyboard: 'S', controller: 'X', deck: 'X' },
  delete: { keyboard: 'X', controller: 'kbd X', deck: 'kbd X' },
  consumables: { keyboard: '1/2', controller: 'D-pad L/R', deck: 'D-pad L/R' },
};

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
  const labels = BUTTON_LABELS[action];
  if (!labels) return String(action || '').toUpperCase();
  const mode = preferredInputMode(options);
  return labels[mode] || labels.controller || labels.keyboard;
}

export function ctaLabel(action, label, options = {}) {
  const button = promptLabel(action, options);
  const copy = String(label || '').trim();
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
