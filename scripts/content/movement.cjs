// CJS view of the movement contract consumed by the authoritative sim.
// The browser wrapper reads the same JSON so fallback physics cannot drift.
const MOVEMENT = require('../../src/content/movement.data.json');

module.exports = { MOVEMENT };
