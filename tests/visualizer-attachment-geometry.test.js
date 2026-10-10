// tests/visualizer-attachment-geometry.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveBacksplash, resolveCurb, resolveWallPanel, resolveIsland, resolveBarCounter } = require('../visualizer/attachment-geometry.js');
const { VISUAL_FALLBACK_CURB_HEIGHT_M, VISUAL_FALLBACK_ISLAND_GAP_M, VISUAL_FALLBACK_BAR_COUNTER_RAISE_M } = require('../visualizer/constants.js');

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
  assert.equal(curb.edge, 'back');
  assert.equal(curb.source, 'fallback-height');
});

test('resolveIsland returns null when either dimension is 0', () => {
  assert.equal(resolveIsland({ widthM: 0, lengthM: 0.8 }, 2), null);
});

test('resolveIsland carries the real width/length but a fallback offset from the main countertop, along WIDTH (facing the main segment\'s own LENGTH run)', () => {
  const island = resolveIsland({ widthM: 1.2, lengthM: 0.8 }, 2);
  assert.equal(island.widthM, 1.2);
  assert.equal(island.lengthM, 0.8);
  assert.equal(island.offsetZM, 0);
  // mainWidthM/2 (1) + gap (0.9) + island's own half-width (0.6) = 2.5 --
  // this is the island's CENTER, directly usable as a mesh position, not a
  // raw distance from the main segment's edge.
  assert.equal(island.offsetXM, 1 + VISUAL_FALLBACK_ISLAND_GAP_M + 0.6);
  assert.equal(island.source, 'fallback-offset');
});

test('resolveBarCounter returns null when either dimension is 0', () => {
  assert.equal(resolveBarCounter({ widthM: 0, lengthM: 0.8 }, 2), null);
});

test('resolveBarCounter: a peninsula from the free end of the run out into the room (+X), the longer side along it, a step up', () => {
  // Main: 0.6 deep (X, wall at -0.3), 2 long (Z).
  const bar = resolveBarCounter({ widthM: 0.6, lengthM: 1.5 }, 0.6, 2);
  assert.equal(bar.widthM, 0.6);
  assert.equal(bar.lengthM, 1.5);
  assert.equal(bar.runM, 1.5);
  assert.equal(bar.depthM, 0.6);
  assert.equal(bar.x0M, 0.3, 'from the front edge');
  assert.equal(bar.x1M, 0.3 + 1.5);
  assert.equal(bar.z1M, 1, 'flush with the +Z end');
  assert.ok(Math.abs(bar.z0M - 0.4) < 1e-9);
  assert.equal(bar.raiseM, VISUAL_FALLBACK_BAR_COUNTER_RAISE_M);
  assert.equal(bar.source, 'fallback-offset');
  // Typed the other way round: the same bar.
  const swapped = resolveBarCounter({ widthM: 1.5, lengthM: 0.6 }, 0.6, 2);
  ['x0M', 'x1M', 'z0M', 'z1M'].forEach(k => assert.equal(swapped[k], bar[k], k));
  // Г with the wing at +Z: the bar takes the -Z end.
  const l = resolveBarCounter({ widthM: 0.6, lengthM: 1.5 }, 0.6, 2, [{ corner: 'left', widthM: 0.6, lengthM: 1.4 }]);
  assert.equal(l.z0M, -1);
  // П: from the tip of the +Z wing.
  const u = resolveBarCounter({ widthM: 0.6, lengthM: 1.5 }, 0.6, 2, [{ corner: 'left', widthM: 0.6, lengthM: 1.4 }, { corner: 'right', widthM: 0.6, lengthM: 1.4 }]);
  assert.ok(Math.abs(u.x0M - (0.3 + 1.4)) < 1e-9);
  assert.equal(u.z1M, 1);
});

test('resolveIsland with a bar counter: never on the same floor -- slides along the run, or past everything into the room', () => {
  const bar = resolveBarCounter({ widthM: 0.5, lengthM: 1.2 }, 0.65, 2.4);
  const island = resolveIsland({ widthM: 0.9, lengthM: 1.8 }, 0.65, 2.4, [], bar);
  const rectOf = i => ({ x0: i.offsetXM - i.widthM / 2, x1: i.offsetXM + i.widthM / 2, z0: i.offsetZM - i.lengthM / 2, z1: i.offsetZM + i.lengthM / 2 });
  const r = rectOf(island);
  assert.ok(r.z1 <= bar.z0M - VISUAL_FALLBACK_ISLAND_GAP_M + 1e-9 || r.x0 >= bar.x1M + VISUAL_FALLBACK_ISLAND_GAP_M - 1e-9);
  // No bar: as before.
  assert.equal(resolveIsland({ widthM: 0.9, lengthM: 1.8 }, 0.65, 2.4, []).offsetZM, 0);
});

test('resolveWallPanel returns null when either dimension is 0', () => {
  assert.equal(resolveWallPanel({ widthM: 0, lengthM: 2 }), null);
});

test('resolveWallPanel uses the real widthM as mounted height and lengthM as the wall run, same as backsplash', () => {
  const panel = resolveWallPanel({ widthM: 0.9, lengthM: 2.4 });
  assert.equal(panel.heightM, 0.9);
  assert.equal(panel.lengthM, 2.4);
  assert.equal(panel.edge, 'back');
  assert.equal(panel.source, 'real');
});
