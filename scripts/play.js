#!/usr/bin/env node

// Legacy entrypoint retained for muscle memory.
// The real runtime contract now lives in stack.js so LBH can expose explicit
// launch modes instead of hiding them behind one "start everything" path.

const { start } = require("./stack.js");

start({ mode: "local-host", openBrowser: !process.argv.includes("--no-open") }).catch((err) => {
  console.error(err.message);
  process.exit(1);
});
