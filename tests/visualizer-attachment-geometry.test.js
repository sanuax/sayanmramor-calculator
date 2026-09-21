// tests/visualizer-attachment-geometry.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveBacksplash, resolveCurb, resolveIsland } = require('../visualizer/attachment-geometry.js');
const { VISUAL_FALLBACK_CURB_HEIGHT_M, VISUAL_FALLBACK_ISLAND_GAP_M } = require('../visualizer/constants.js');

test('resolveBacksplash returns null when either dimension is 0', () => {
  assert.equal(resolveBacksplash({ widthM: 0, lengthM: 2 }), null);
  assert.equal(resolveBacksplash({ widthM: 0.6, lengthM: 0 }), null);
});

test('resolveBacksplash uses the real widthM as the mounted height and real lengthM as the wall run -- no fallback needed', () => {
  const backsplash = resolveBacksplash({ widthM: 0.6, lengthM: 2 });
  assert.equal(backsplash.heightM, 0.6);
  assert.equal(backsplash.lengthM, 2);
  assert.equal(backsplash.edge, 'back');
  assert.equal(backsplash.source, 'real');
});

test('resolveCurb returns null when length is 0', () => {
  assert.equal(resolveCurb(0), null);
});

test('resolveCurb carries the real length but a fallback height', () => {
  const curb = resolveCurb(0.5);
  assert.equal(curb.lengthM, 0.5);
  assert.equal(curb.heightM, VISUAL_FALLBACK_CURB_HEIGHT_M);
  assert.equal(curb.edge, 'front');
  assert.equal(curb.source, 'fallback-height');
});

test('resolveIsland returns null when either dimension is 0', () => {
  assert.equal(resolveIsland({ widthM: 0, lengthM: 0.8 }, 2), null);
});

test('resolveIsland carries the real width/length but a fallback offset from the main countertop', () => {
  const island = resolveIsland({ widthM: 1.2, lengthM: 0.8 }, 2);
  assert.equal(island.widthM, 1.2);
  assert.equal(island.lengthM, 0.8);
  assert.equal(island.offsetXM, 0);
  // mainLengthM/2 (1) + gap (0.9) + island's own half-length (0.4) = 2.3 --
  // this is the island's CENTER, directly usable as a mesh position, not a
  // raw distance from the main segment's edge.
  assert.equal(island.offsetZM, 1 + VISUAL_FALLBACK_ISLAND_GAP_M + 0.4);
  assert.equal(island.source, 'fallback-offset');
});
