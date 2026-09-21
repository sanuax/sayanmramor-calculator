// tests/visualizer-constants.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { VISUAL_FALLBACK_THICKNESS_M, CAMERA_PRESETS } = require('../visualizer/constants.js');

test('VISUAL_FALLBACK_THICKNESS_M is a small positive number', () => {
  assert.equal(typeof VISUAL_FALLBACK_THICKNESS_M, 'number');
  assert.ok(VISUAL_FALLBACK_THICKNESS_M > 0 && VISUAL_FALLBACK_THICKNESS_M < 0.2);
});

test('CAMERA_PRESETS has all 4 manual-button views (top/front/side/iso)', () => {
  // A subset check, not an exact-set check: per-product-type default angles
  // (iso-high, iso-eye-level, front-high, iso-side-high -- see PRODUCTS[key].cameraPreset
  // in product-types.js) extend this same registry alongside the 4 the
  // manual buttons read from, rather than replacing them.
  ['top', 'front', 'side', 'iso'].forEach(name => {
    assert.ok(Object.prototype.hasOwnProperty.call(CAMERA_PRESETS, name), `CAMERA_PRESETS is missing "${name}"`);
  });
});

test('every CAMERA_PRESETS entry has a 3-number direction vector', () => {
  Object.entries(CAMERA_PRESETS).forEach(([name, preset]) => {
    assert.ok(Array.isArray(preset.direction), `${name}.direction should be an array`);
    assert.equal(preset.direction.length, 3, `${name}.direction should have 3 components`);
    preset.direction.forEach(component => {
      assert.equal(typeof component, 'number', `${name}.direction components should be numbers`);
    });
  });
});
