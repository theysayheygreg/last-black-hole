#!/usr/bin/env node

// Legacy stop entrypoint retained for muscle memory.
// The real runtime contract now lives in stack.js.

const { stop } = require("./stack.js");

stop().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
