// tests/transition-layer.test.js
//
// transition-layer.js is mostly DOM/timing glue (requestAnimationFrame,
// getBoundingClientRect, inline style mutation) that only really proves
// itself in a real browser -- covered by manual verification instead. This
// file covers the parts that ARE pure/deterministic: direction-to-sign
// mapping, reduced-motion detection, and crossfade's two SYNCHRONOUS
// short-circuits (no-op swap, reduced motion) using minimal fake elements.
const test = require('node:test');
const assert = require('node:assert/strict');
const TransitionLayer = require('../transition-layer.js');

function fakeElement() {
  return { style: {} };
}

test('offsetSignFor: "backward" is +1 (enters from above), everything else (including "forward") is -1 (enters from below)', () => {
  assert.equal(TransitionLayer.offsetSignFor('backward'), 1);
  assert.equal(TransitionLayer.offsetSignFor('forward'), -1);
  assert.equal(TransitionLayer.offsetSignFor(undefined), -1);
  assert.equal(TransitionLayer.offsetSignFor('bogus'), -1);
});

test('prefersReducedMotion reads window.matchMedia and returns false when no window/matchMedia is available', () => {
  assert.equal(TransitionLayer.prefersReducedMotion({ matchMedia: () => ({ matches: true }) }), true);
  assert.equal(TransitionLayer.prefersReducedMotion({ matchMedia: () => ({ matches: false }) }), false);
  assert.equal(TransitionLayer.prefersReducedMotion(null), false);
  assert.equal(TransitionLayer.prefersReducedMotion({}), false);
});

test('crossfade is a synchronous no-op (returns false, calls onSettle immediately) when fromEl === toEl', () => {
  const el = fakeElement();
  let settled = false;
  const started = TransitionLayer.crossfade({
    container: fakeElement(), fromEl: el, toEl: el, direction: 'forward',
    onSettle: () => { settled = true; },
  });
  assert.equal(started, false);
  assert.equal(settled, true);
});

test('crossfade is a synchronous no-op when there is no toEl at all', () => {
  let settled = false;
  const started = TransitionLayer.crossfade({
    container: fakeElement(), fromEl: fakeElement(), toEl: null,
    onSettle: () => { settled = true; },
  });
  assert.equal(started, false);
  assert.equal(settled, true);
});

test('crossfade honors prefers-reduced-motion: swaps display instantly, no transform/opacity animation, settles synchronously', () => {
  const fromEl = fakeElement();
  const toEl = fakeElement();
  let settled = false;
  const reducedMotionWin = { matchMedia: () => ({ matches: true }) };
  const started = TransitionLayer.crossfade({
    container: fakeElement(), fromEl, toEl, direction: 'forward', win: reducedMotionWin,
    onSettle: () => { settled = true; },
  });
  assert.equal(started, false);
  assert.equal(settled, true);
  assert.equal(fromEl.style.display, 'none');
  assert.equal(toEl.style.display, '');
  // No animation styles were ever touched -- a straight visibility swap.
  assert.equal(fromEl.style.transform, undefined);
  assert.equal(toEl.style.transform, undefined);
});

test('crossfade starts a real animation (returns true, does not settle synchronously) when motion is allowed and elements differ', () => {
  const originalRAF = global.requestAnimationFrame;
  global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
  try {
    const fromEl = { style: {}, offsetHeight: 0 };
    const toEl = { style: {}, offsetHeight: 0 };
    const container = { style: {}, getBoundingClientRect: () => ({ height: 120 }) };
    let settled = false;
    const started = TransitionLayer.crossfade({
      container, fromEl, toEl, direction: 'forward',
      win: { matchMedia: () => ({ matches: false }) },
      onSettle: () => { settled = true; },
    });
    assert.equal(started, true);
    assert.equal(settled, false, 'must not settle before the animation has had a chance to run');
    // toEl is revealed (display set) and positioned for the animation, not
    // instantly snapped to its final resting state.
    assert.equal(toEl.style.display, '');
    assert.equal(toEl.style.position, 'absolute');
  } finally {
    global.requestAnimationFrame = originalRAF;
  }
});
