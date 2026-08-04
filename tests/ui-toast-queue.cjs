const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

(async () => {
  const queue = await import(pathToFileURL(path.resolve(__dirname, '../src/ui/toast-queue.js')).href);
  let state = queue.createToastQueueState();
  state = queue.enqueueToast(state, { severity: 'threat', message: 'CONTACT' }, 0);
  state = queue.enqueueToast(state, { severity: 'system', message: 'APERTURE OPEN' }, 10);
  state = queue.enqueueToast(state, { severity: 'loot', message: 'IRON' }, 20);
  assert.deepStrictEqual(queue.readToastQueue(state, 20).map((item) => item.severity), ['threat', 'system', 'loot']);
  assert.deepStrictEqual(queue.readToastQueue(state, 20).map((item) => item.expiresAt), [4000, 2510, 1520]);

  const duplicate = queue.enqueueToast(state, { severity: 'threat', message: 'CONTACT' }, 1999);
  assert.strictEqual(duplicate.nextId, state.nextId, 'identical emitters dedupe inside two seconds');
  assert.strictEqual(duplicate.entries.filter((item) => item.message === 'CONTACT').length, 1);
  state = queue.enqueueToast(duplicate, { severity: 'threat', message: 'CONTACT' }, 2000);
  state = queue.enqueueToast(state, { severity: 'threat', message: 'HUNTER' }, 2001);
  state = queue.enqueueToast(state, { severity: 'threat', message: 'COLLAPSE' }, 2002);
  assert.strictEqual(queue.readToastQueue(state, 2002).filter((item) => item.severity === 'threat').length, 3);

  for (let index = 0; index < 6; index += 1) {
    state = queue.enqueueToast(state, { severity: 'loot', message: `LOOT ${index}` }, 2100 + index);
  }
  const visible = queue.readToastQueue(state, 2106);
  assert.strictEqual(visible.filter((item) => item.severity === 'threat').length, 3, 'loot never evicts threat');
  const loot = visible.filter((item) => item.severity === 'loot');
  assert.strictEqual(loot.length, 3);
  assert.strictEqual(loot.at(-1).message, '+3 items', 'overflowing loot collapses into one summary');
  assert.strictEqual(queue.readToastQueue(state, 7000).length, 0, 'expired entries are not displayed');

  let aggregateState = queue.createToastQueueState();
  for (const message of ['A', 'B', 'C', 'D']) {
    aggregateState = queue.enqueueToast(aggregateState, { severity: 'loot', message }, 3000 + aggregateState.nextId);
  }
  const firstAggregate = queue.readToastQueue(aggregateState, 3010).find((item) => item.aggregate);
  aggregateState = queue.enqueueToast(aggregateState, { severity: 'loot', message: 'E' }, 3011);
  const nextAggregate = queue.readToastQueue(aggregateState, 3011).find((item) => item.aggregate);
  assert.strictEqual(nextAggregate.id, firstAggregate.id, 'loot aggregate should retain its DOM identity');
  assert.notStrictEqual(nextAggregate.message, firstAggregate.message, 'retained loot aggregate must expose changed copy');

  console.log('UIToastQueue: severity ordering, caps, dedupe, aggregation, and lifetimes agree.');
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
