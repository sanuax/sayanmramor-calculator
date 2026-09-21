// tests/helpers/fake-dom.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { createFakeDoc } = require('./fake-dom.js');

test('createFakeDoc returns provided value/checked, and safe defaults for missing ids', () => {
  const doc = createFakeDoc({ width: { value: '2000' }, 'opt-complex': { checked: true } });
  assert.equal(doc.getElementById('width').value, '2000');
  assert.equal(doc.getElementById('opt-complex').checked, true);
  assert.equal(doc.getElementById('nonexistent').value, '');
  assert.equal(doc.getElementById('nonexistent').checked, false);
});
