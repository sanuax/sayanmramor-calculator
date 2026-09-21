// tests/visualizer-cutout-geometry.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveSinkCutout, resolveCooktopCutout, resolveHoles } = require('../visualizer/cutout-geometry.js');
const { VISUAL_FALLBACK_SINK_CUTOUT_SIZE_M, VISUAL_FALLBACK_COOKTOP_CUTOUT_SIZE_M, VISUAL_FALLBACK_HOLE_RADIUS_M } = require('../visualizer/constants.js');

test('resolveSinkCutout returns null when count is 0', () => {
  assert.equal(resolveSinkCutout({ type: null, count: 0, position: null }, 2), null);
});

test('resolveSinkCutout uses the fallback size and a fallback position, tagged as such, when position is null', () => {
  const cutout = resolveSinkCutout({ type: 'undermount', count: 1, position: null }, 2);
  assert.equal(cutout.type, 'undermount');
  assert.equal(cutout.count, 1);
  assert.equal(cutout.cut.source, 'fallback');
  assert.equal(cutout.cut.widthM, VISUAL_FALLBACK_SINK_CUTOUT_SIZE_M.widthM);
  assert.equal(cutout.cut.lengthM, VISUAL_FALLBACK_SINK_CUTOUT_SIZE_M.lengthM);
  assert.equal(typeof cutout.cut.xM, 'number');
  assert.equal(typeof cutout.cut.zM, 'number');
});

test('resolveSinkCutout uses the real position (tagged "real") when one is provided', () => {
  const cutout = resolveSinkCutout({ type: 'overlay', count: 1, position: { xMm: 300, yMm: 150 } }, 2);
  assert.equal(cutout.cut.source, 'real');
  assert.equal(cutout.cut.xM, 0.3);
  assert.equal(cutout.cut.zM, 0.15);
  // Size is still the visual fallback -- there is no real cutout-size input anywhere.
  assert.equal(cutout.cut.widthM, VISUAL_FALLBACK_SINK_CUTOUT_SIZE_M.widthM);
});

test('resolveCooktopCutout returns null when count is 0, fallback cut otherwise', () => {
  assert.equal(resolveCooktopCutout({ count: 0, position: null }, 2), null);
  const cutout = resolveCooktopCutout({ count: 1, position: null }, 2);
  assert.equal(cutout.count, 1);
  assert.equal(cutout.cut.source, 'fallback');
  assert.equal(cutout.cut.widthM, VISUAL_FALLBACK_COOKTOP_CUTOUT_SIZE_M.widthM);
  assert.equal(cutout.cut.lengthM, VISUAL_FALLBACK_COOKTOP_CUTOUT_SIZE_M.lengthM);
});

test('resolveHoles returns null per hole type when its count is 0', () => {
  const holes = resolveHoles({ mixer: 0, socket: 0, dispenser: 0 }, 2);
  assert.equal(holes.mixer, null);
  assert.equal(holes.socket, null);
  assert.equal(holes.dispenser, null);
});

test('resolveHoles populates each present hole type with a fallback position and shared radius', () => {
  const holes = resolveHoles({ mixer: 1, socket: 2, dispenser: 0 }, 2);
  assert.equal(holes.mixer.count, 1);
  assert.equal(holes.mixer.radiusM, VISUAL_FALLBACK_HOLE_RADIUS_M);
  assert.equal(holes.mixer.position.source, 'fallback');
  assert.equal(holes.socket.count, 2);
  assert.equal(holes.dispenser, null);
});

test('resolveHoles gives mixer/socket/dispenser distinct fallback positions so they do not overlap', () => {
  const holes = resolveHoles({ mixer: 1, socket: 1, dispenser: 1 }, 2);
  const points = [holes.mixer.position, holes.socket.position, holes.dispenser.position];
  const unique = new Set(points.map(p => `${p.xM},${p.zM}`));
  assert.equal(unique.size, 3);
});
