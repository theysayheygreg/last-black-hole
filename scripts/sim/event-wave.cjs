// Node 22 synchronously loads this no-TLA ESM contract so browser sandbox and
// authority decay the same event wave by elapsed seconds.
module.exports = { ...require('../../src/content/event-wave.js') };
