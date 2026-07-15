const assert = require("assert");
const path = require("path");
const { pathToFileURL } = require("url");

async function main() {
  const { buildRunResultsViewModel } = await import(pathToFileURL(
    path.resolve(__dirname, "../src/run-results.js"),
  ).href);
  const base = {
    outcome: "extracted",
    emEarned: 90,
    cargoExtracted: [],
    cargoLost: [],
  };

  const pending = buildRunResultsViewModel({
    runResult: { ...base, settlement: { status: "pending" } },
  });
  assert.strictEqual(pending.settlementStatus, "pending");
  assert.strictEqual(pending.estimatedEmEarned, 90);
  assert.strictEqual(pending.emEarned, 0);
  assert.strictEqual(pending.overflowValue, 0);
  assert.strictEqual(pending.creditPillLabel, "EM PENDING");
  assert.strictEqual(pending.ledgerValueLabel, "PENDING");

  const settled = buildRunResultsViewModel({
    runResult: {
      ...base,
      settlement: { status: "settled", emCredited: 104, overflowValue: 14 },
    },
  });
  assert.strictEqual(settled.settlementStatus, "settled");
  assert.strictEqual(settled.estimatedEmEarned, 90);
  assert.strictEqual(settled.emEarned, 104);
  assert.strictEqual(settled.overflowValue, 14);
  assert.strictEqual(settled.creditPillLabel, "+104 EM");
  assert.strictEqual(settled.ledgerValueLabel, "104 EM");

  const failed = buildRunResultsViewModel({
    runResult: { ...base, settlement: { status: "failed" } },
  });
  assert.strictEqual(failed.settlementStatus, "failed");
  assert.strictEqual(failed.estimatedEmEarned, 90);
  assert.strictEqual(failed.emEarned, 0);
  assert.strictEqual(failed.overflowValue, 0);
  assert.strictEqual(failed.creditPillLabel, "EM FAILED");
  assert.strictEqual(failed.ledgerValueLabel, "NOT SETTLED");

  console.log("run-results settlement: pending, exact settled credit/overflow, and failed truth verified");
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exit(1);
});
