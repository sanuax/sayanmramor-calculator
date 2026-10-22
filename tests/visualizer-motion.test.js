// tests/visualizer-motion.test.js
//
// The 3D view's moves (visualizer/motion.js): a critically damped spring --
// soft start, no overshoot, settles, follows a moving goal without jumps.
const test = require('node:test');
const assert = require('node:assert/strict');
const Motion = require('../visualizer/motion.js');

function run(spring, seconds, fps) {
  const path = [];
  for (let t = 0; t < seconds; t += 1 / fps) {
    Motion.step(spring, 1 / fps);
    path.push(spring.x[0]);
  }
  return path;
}

test('a move from rest starts softly, never overshoots and is all but there in 0.65 s', () => {
  const s = Motion.createSpring([0]);
  Motion.retarget(s, [1]);
  const path = run(s, 1.5, 60);
  assert.ok(path[0] < 0.02, 'soft start: ' + path[0]);
  path.forEach((x, i) => { if (i) assert.ok(x >= path[i - 1] - 1e-12 && x <= 1 + 1e-12, 'monotone, no overshoot'); });
  const at = Math.round(0.65 * 60);
  assert.ok(path[at] > 0.97, 'mostly there at 0.65 s: ' + path[at]);
  assert.equal(s.x[0], 1, 'sits exactly on the goal');
});

test('the path does not depend on the frame rate', () => {
  const a = Motion.createSpring([0]), b = Motion.createSpring([0]);
  Motion.retarget(a, [1]); Motion.retarget(b, [1]);
  for (let i = 0; i < 12; i++) Motion.step(a, 1 / 60);
  for (let i = 0; i < 6; i++) Motion.step(b, 1 / 30);
  assert.ok(Math.abs(a.x[0] - b.x[0]) < 1e-9);
});

test('a long pause (hidden tab) never jumps a move to its end', () => {
  const s = Motion.createSpring([0]);
  Motion.retarget(s, [1]);
  Motion.step(s, 5);
  assert.ok(s.x[0] < 0.3, 'one frame of at most 0.1 s: ' + s.x[0]);
});

test('a goal that moves mid-way: position and speed carry on without a jump', () => {
  const s = Motion.createSpring([0]);
  Motion.retarget(s, [1]);
  for (let i = 0; i < 10; i++) Motion.step(s, 1 / 60);
  const [x, v] = [s.x[0], s.v[0]];
  Motion.retarget(s, [3]);
  Motion.step(s, 1 / 60);
  assert.ok(Math.abs(s.x[0] - (x + v / 60)) < 0.05, 'continues from where it was');
  assert.ok(Math.abs(s.v[0] - v) < 3 * 9 * 9 / 60 + 1e-9, 'speed changes gradually');
});

test('fade: 0 to 1, eased at both ends; no duration means done', () => {
  assert.equal(Motion.fadeAt(0, 0.35), 0);
  assert.equal(Motion.fadeAt(0.35, 0.35), 1);
  assert.equal(Motion.fadeAt(1, 0.35), 1);
  assert.ok(Math.abs(Motion.fadeAt(0.175, 0.35) - 0.5) < 1e-12);
  assert.ok(Motion.fadeAt(0.035, 0.35) < 0.1);
  assert.equal(Motion.fadeAt(0, 0), 1);
});
