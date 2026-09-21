// tests/visualizer-constants.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { VISUAL_FALLBACK_THICKNESS_M, CAMERA_PRESETS } = require('../visualizer/constants.js');

test('VISUAL_FALLBACK_THICKNESS_M is a small positive number', () => {
  assert.equal(typeof VISUAL_FALLBACK_THICKNESS_M, 'number');
  assert.ok(VISUAL_FALLBACK_THICKNESS_M > 0 && VISUAL_FALLBACK_THICKNESS_M < 0.2);
});

test('CAMERA_PRESETS has all 4 required views', () => {
  assert.deepEqual(Object.keys(CAMERA_PRESETS).sort(), ['front', 'iso', 'side', 'top']);
});
