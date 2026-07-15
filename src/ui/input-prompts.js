import { ACTION_PROMPT_LABELS } from './input-bindings.js';

export const INPUT_FAMILIES = Object.freeze({
  DECK: 'deck',
  CONTROLLER: 'controller',
  KEYBOARD: 'keyboard',
});

export const PLAYER_ACTION_IDS = Object.freeze(Object.keys(ACTION_PROMPT_LABELS));

const FACE_LABELS = new Set(['A', 'B', 'X', 'Y']);
const SHOULDER_LABELS = new Set(['L1', 'R1', 'L1/R1']);
const TRIGGER_LABELS = new Set(['L2', 'R2']);
const SYSTEM_LABELS = new Set(['View', 'Menu']);

function normalized(value) {
  return String(value || '').trim().toLowerCase();
}

function glyphKindFor(label, family) {
  if (family === INPUT_FAMILIES.KEYBOARD) return 'keycap';
  if (FACE_LABELS.has(label)) return 'face';
  if (SHOULDER_LABELS.has(label)) return 'shoulder';
  if (TRIGGER_LABELS.has(label)) return 'trigger';
  if (SYSTEM_LABELS.has(label)) return 'system';
  if (label.startsWith('D-pad')) return 'dpad';
  return 'system';
}

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

/**
 * Resolve one player action into the complete data needed by a renderer.
 * `originId` is intentionally only data: a future Steam Input adapter can
 * fill it without making the browser renderer depend on the native SDK.
 */
export function actionDescriptor(action, options = {}) {
  const actionId = String(action || '').trim();
  const labels = ACTION_PROMPT_LABELS[actionId] || {};
  const inputFamily = preferredInputMode(options);
  const fallbackLabel = labels[inputFamily] || labels.controller || labels.keyboard || actionId.toUpperCase();
  return Object.freeze({
    actionId,
    inputFamily,
    bindingId: String(options.bindingId || `${inputFamily}.${actionId}`),
    originId: options.originId == null ? null : String(options.originId),
    glyphKind: glyphKindFor(fallbackLabel, inputFamily),
    fallbackLabel,
  });
}

export function resolveSteamInputOrigin(descriptor, adapter = null) {
  if (!descriptor || typeof adapter !== 'function') return descriptor?.originId || null;
  return adapter({
    actionId: descriptor.actionId,
    inputFamily: descriptor.inputFamily,
    bindingId: descriptor.bindingId,
  }) || null;
}

function escapeMarkup(value) {
  return String(value || '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character]));
}

export function actionGlyphMarkup(descriptor) {
  const action = descriptor?.actionId || 'action';
  const family = descriptor?.inputFamily || INPUT_FAMILIES.KEYBOARD;
  const kind = descriptor?.glyphKind || 'keycap';
  const label = descriptor?.fallbackLabel || action.toUpperCase();
  return `<span class="ui-action-glyph ui-action-glyph-${escapeMarkup(kind)}" data-action-id="${escapeMarkup(action)}" data-input-family="${escapeMarkup(family)}" aria-hidden="true">${escapeMarkup(label)}</span>`;
}

export function actionCaptionMarkup(action, verb = '', options = {}) {
  const descriptor = actionDescriptor(action, options);
  const copy = String(verb || '').trim();
  const duplicate = copy && (
    normalized(copy) === normalized(descriptor.actionId)
    || normalized(copy) === normalized(descriptor.fallbackLabel)
  );
  return `${actionGlyphMarkup(descriptor)}${copy && !duplicate ? ` <span class="ui-action-copy">${escapeMarkup(copy)}</span>` : ''}`;
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
  return actionCaptionMarkup(action, verb, options);
}

export function menuHint(options = {}) {
  return [
    ['tabs', 'tabs'], ['select', 'select'], ['confirm', 'confirm'], ['back', 'back'],
  ].map(([action, verb]) => actionCaptionMarkup(action, verb, options)).join('    ');
}

export function movementHint(options = {}) {
  return [
    ['navigate', 'steer'], ['thrust', 'thrust'], ['brake', 'brake'], ['pulse', 'pulse'], ['tabs', 'abilities'],
  ].map(([action, verb]) => actionCaptionMarkup(action, verb, options)).join('   ');
}

export function mapSelectHint({ remote = false, hostReset = false, ...options } = {}) {
  const actions = remote
    ? [['select', 'select'], ['confirm', 'join/host']]
    : [['select', 'select'], ['confirm', 'launch']];
  if (remote && hostReset) actions.push(['delete', 'host reset']);
  actions.push(['reroll', 'reroll seed'], ['back', 'back']);
  return actions.map(([action, verb]) => actionCaptionMarkup(action, verb, options)).join('    ');
}

export function inventoryHint(options = {}) {
  return [
    ['select', 'select'], ['confirm', 'confirm'], ['inventory', 'close'],
  ].map(([action, verb]) => actionCaptionMarkup(action, verb, options)).join('  ');
}

export function setDeckModeAttribute(element, options = {}) {
  if (!element) return;
  const mode = preferredInputMode(options);
  element.dataset.inputMode = mode;
  element.dataset.deckMode = isDeckMode(options) ? 'true' : 'false';
}
