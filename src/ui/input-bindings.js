/** Standard-layout controller bindings and the labels shown beside commands. */

export const ACTION_PROMPT_LABELS = Object.freeze({
  confirm: { keyboard: 'Space', controller: 'A', deck: 'A' },
  extract: { keyboard: 'Enter', controller: 'A', deck: 'A' },
  back: { keyboard: 'Esc', controller: 'B', deck: 'B' },
  quit: { keyboard: 'Esc', controller: 'B', deck: 'B' },
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
  hullPrev: { keyboard: 'Left', controller: 'D-pad L', deck: 'D-pad L' },
  hullNext: { keyboard: 'Right', controller: 'D-pad R', deck: 'D-pad R' },
  reroll: { keyboard: 'S', controller: 'X', deck: 'X' },
  delete: { keyboard: 'X', controller: 'Y', deck: 'Y' },
  mute: { keyboard: 'M', controller: 'Keyboard M', deck: 'Keyboard M' },
  consumables: { keyboard: '1/2', controller: 'D-pad L/R', deck: 'D-pad L/R' },
  consumable1: { keyboard: '1', controller: 'D-pad L', deck: 'D-pad L' },
  consumable2: { keyboard: '2', controller: 'D-pad R', deck: 'D-pad R' },
});

export const GAMEPAD_ACTION_BUTTONS = Object.freeze({
  confirm: [0],
  extract: [0],
  back: [1],
  quit: [1],
  pulse: [2],
  reroll: [2],
  slingshot: [3],
  delete: [3],
  ability1: [4],
  tabPrev: [4],
  ability2: [5],
  tabNext: [5],
  brake: [6],
  thrust: [7],
  inventory: [8, 17],
  pause: [9],
  up: [12],
  down: [13],
  left: [14],
  consumable1: [14],
  right: [15],
  consumable2: [15],
});

export function gamepadActionPressed(gamepad, action) {
  if (!gamepad?.buttons) return false;
  const indices = GAMEPAD_ACTION_BUTTONS[action] || [];
  return indices.some((index) => gamepad.buttons.length > index && gamepad.buttons[index]?.pressed === true);
}
