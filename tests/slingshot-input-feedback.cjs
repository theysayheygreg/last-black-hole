const assert = require('assert');
const fs = require('fs');
const path = require('path');

const mainSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
const pressStart = mainSource.indexOf('if (!inventoryOpen && slingshotNow && !_prevSlingshot)');
const pressEnd = mainSource.indexOf('\n        }', pressStart);
const pressBlock = mainSource.slice(pressStart, pressEnd);

assert(pressStart >= 0 && pressEnd > pressStart, 'slingshot press feedback branch must remain discoverable');
assert(
  pressBlock.includes("!authoritySlingshot?.engaged && !authoritySlingshot?.aim")
    && pressBlock.includes('no anchor in range // move toward a ring'),
  'a missing aim anchor must keep the move-toward-ring warning',
);
assert(
  pressBlock.includes("authoritySlingshot?.aim?.engageEligible === false")
    && pressBlock.includes('build tangential speed / follow the ring'),
  'an in-range but ineligible anchor must explain how to become eligible',
);
assert(
  pressBlock.indexOf('remotePendingSlingshotEdges.push') > pressBlock.indexOf('showWarning'),
  'feedback must be emitted before the normal edge is queued, without changing queue ownership',
);

console.log('SlingshotInputFeedback: 3/3 passed');
