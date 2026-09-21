const test = require('node:test');
const assert = require('node:assert/strict');
const { isWebglAvailable } = require('../visualizer/webgl-support.js');

function fakeDoc(contextResult) {
  return {
    createElement: () => ({
      getContext: () => contextResult,
    }),
  };
}

test('isWebglAvailable returns true when the canvas yields a webgl context', () => {
  assert.equal(isWebglAvailable(fakeDoc({ someWebglApi: true })), true);
});

test('isWebglAvailable returns false when getContext returns null (no WebGL support)', () => {
  assert.equal(isWebglAvailable(fakeDoc(null)), false);
});

test('isWebglAvailable returns false, not throws, when createElement itself throws', () => {
  const doc = { createElement: () => { throw new Error('no canvas in this environment'); } };
  assert.equal(isWebglAvailable(doc), false);
});
