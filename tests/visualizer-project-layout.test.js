// tests/visualizer-project-layout.test.js
//
// The project's showcase (the owner, 2026-11-17): the products in a row on one floor, a gap
// between them, their backs on one line; the product the client is editing stays where it is.
const test = require('node:test');
const assert = require('node:assert/strict');
const ProjectLayout = require('../visualizer/project-layout.js');
const { PROJECT_GAP_M } = require('../visualizer/constants.js');

const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, (msg || '') + ': ' + a + ' vs ' + b);
const box = (min, max, floorY) => ({ bounds: { min, max }, floorY: floorY === undefined ? min[1] : floorY });
const moved = (item, off) => ({ min: item.bounds.min.map((v, i) => v + off[i]), max: item.bounds.max.map((v, i) => v + off[i]) });

// A countertop (0.6 deep, 2.4 run, a slab on the floor), a sill (0.3 x 1.2, its floor 0.9 below),
// steps (1.2 x 0.9, from the floor up).
const ITEMS = [
  box([-0.3, -0.02, -1.2], [0.3, 0.02, 1.2]),
  box([-0.15, -0.02, -0.6], [0.15, 0.02, 0.6], -0.9),
  box([-0.6, 0, -0.45], [0.6, 0.5, 0.45]),
];

test('the gap between neighbours is PROJECT_GAP_M (0.8 m), along the run', () => {
  assert.equal(PROJECT_GAP_M, 0.8);
  const { offsets } = ProjectLayout.arrange(ITEMS, 0);
  for (let i = 0; i + 1 < ITEMS.length; i++) {
    const a = moved(ITEMS[i], offsets[i]), b = moved(ITEMS[i + 1], offsets[i + 1]);
    close(b.min[2] - a.max[2], PROJECT_GAP_M, 'gap ' + i);
  }
});

test('the backs on one line, the floors on one level', () => {
  const { offsets } = ProjectLayout.arrange(ITEMS, 0);
  const backs = ITEMS.map((it, i) => moved(it, offsets[i]).min[0]);
  backs.forEach(b => close(b, backs[0], 'the back'));
  const floors = ITEMS.map((it, i) => it.floorY + offsets[i][1]);
  floors.forEach(f => close(f, floors[0], 'the floor'));
});

test('the anchor stays put; another anchor moves everything by one and the same step', () => {
  const at0 = ProjectLayout.arrange(ITEMS, 0), at2 = ProjectLayout.arrange(ITEMS, 2);
  assert.deepEqual(at0.offsets[0], [0, 0, 0]);
  assert.deepEqual(at2.offsets[2], [0, 0, 0]);
  const step = at2.offsets[0].map((v, k) => v - at0.offsets[0][k]);
  ITEMS.forEach((_, i) => at2.offsets[i].forEach((v, k) => close(v - at0.offsets[i][k], step[k], 'item ' + i)));
});

test('union: the bounds of every product where it stands', () => {
  const { offsets, union } = ProjectLayout.arrange(ITEMS, 1);
  const all = ITEMS.map((it, i) => moved(it, offsets[i]));
  [0, 1, 2].forEach(k => {
    close(union.min[k], Math.min(...all.map(b => b.min[k])));
    close(union.max[k], Math.max(...all.map(b => b.max[k])));
  });
});

test('one product: no move, its own bounds', () => {
  const { offsets, union } = ProjectLayout.arrange([ITEMS[0]], 0);
  assert.deepEqual(offsets, [[0, 0, 0]]);
  assert.deepEqual(union, ITEMS[0].bounds);
});
