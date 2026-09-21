const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveMaterial } = require('../visualizer/material-adapter.js');

test('resolveMaterial returns a marble-ish appearance for category "marble"', () => {
  const result = resolveMaterial({ category: 'marble', colors: [{ segment: 'beige' }] }, 'none');
  assert.equal(typeof result.fallbackColor, 'string');
  assert.ok(/^#[0-9a-f]{6}$/i.test(result.fallbackColor));
  assert.ok(result.roughness >= 0 && result.roughness <= 1);
  assert.ok(result.metalness >= 0 && result.metalness <= 1);
});

test('resolveMaterial returns a darker fallback color for a dark color segment than a light one, same category', () => {
  const dark = resolveMaterial({ category: 'granite', colors: [{ segment: 'black' }] }, 'none');
  const light = resolveMaterial({ category: 'granite', colors: [{ segment: 'white' }] }, 'none');
  const luminance = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    return ((n >> 16) & 0xff) + ((n >> 8) & 0xff) + (n & 0xff);
  };
  assert.ok(luminance(dark.fallbackColor) < luminance(light.fallbackColor));
});

test('resolveMaterial falls back to a generic grey for an unknown category', () => {
  const result = resolveMaterial({ category: 'unobtainium', colors: [] }, 'none');
  assert.equal(typeof result.fallbackColor, 'string');
});

test('resolveMaterial falls back to a generic grey when stone is null (no material selected yet)', () => {
  const result = resolveMaterial(null, 'none');
  assert.equal(typeof result.fallbackColor, 'string');
  assert.equal(result.textureUrl, null);
});

test('resolveMaterial.textureUrl is always null today (no real seamless textures exist yet)', () => {
  const result = resolveMaterial({ category: 'marble', colors: [{ segment: 'beige' }], image: 'delicato-brown.jpg' }, 'none');
  assert.equal(result.textureUrl, null);
});

test('resolveMaterial passes bookmatchMode through unchanged', () => {
  const result = resolveMaterial({ category: 'marble', colors: [] }, 'mirrored');
  assert.equal(result.bookmatchMode, 'mirrored');
});
