// tests/visualizer-cutout-geometry.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveSinkCutout, resolveCooktopCutout, resolveHoles } = require('../visualizer/cutout-geometry.js');
const { VISUAL_FALLBACK_SINK_CUTOUT_SIZE_M, VISUAL_FALLBACK_COOKTOP_CUTOUT_SIZE_M, VISUAL_FALLBACK_HOLE_RADIUS_M } = require('../visualizer/constants.js');

test('resolveSinkCutout returns null when count is 0', () => {
  assert.equal(resolveSinkCutout({ type: null, count: 0, position: null }, 2, 2), null);
});

test('resolveSinkCutout uses the fallback size and a fallback position, tagged as such, when position is null', () => {
  const cutout = resolveSinkCutout({ type: 'undermount', count: 1, position: null }, 2, 2);
  assert.equal(cutout.type, 'undermount');
  assert.equal(cutout.count, 1);
  assert.equal(cutout.cut.source, 'fallback');
  assert.equal(cutout.cut.widthM, VISUAL_FALLBACK_SINK_CUTOUT_SIZE_M.widthM);
  assert.equal(cutout.cut.lengthM, VISUAL_FALLBACK_SINK_CUTOUT_SIZE_M.lengthM);
  assert.equal(typeof cutout.cut.xM, 'number');
  assert.equal(typeof cutout.cut.zM, 'number');
});

test('resolveSinkCutout uses the real position (tagged "real") when one is provided', () => {
  // yMm=500 is comfortably clear of both edges for the 0.4m-long fallback
  // cutout on a 2m-long slab, so the clamp added for small slabs (see below)
  // doesn't engage here -- this test is only about "real" position passthrough.
  const cutout = resolveSinkCutout({ type: 'overlay', count: 1, position: { xMm: 300, yMm: 500 } }, 2, 2);
  assert.equal(cutout.cut.source, 'real');
  assert.equal(cutout.cut.xM, 0.3);
  assert.equal(cutout.cut.zM, 0.5);
  // Size is still the visual fallback -- there is no real cutout-size input anywhere.
  assert.equal(cutout.cut.widthM, VISUAL_FALLBACK_SINK_CUTOUT_SIZE_M.widthM);
});

test('resolveCooktopCutout returns null when count is 0, fallback cut otherwise', () => {
  assert.equal(resolveCooktopCutout({ count: 0, position: null }, 2, 2), null);
  const cutout = resolveCooktopCutout({ count: 1, position: null }, 2, 2);
  assert.equal(cutout.count, 1);
  assert.equal(cutout.cut.source, 'fallback');
  assert.equal(cutout.cut.widthM, VISUAL_FALLBACK_COOKTOP_CUTOUT_SIZE_M.widthM);
  assert.equal(cutout.cut.lengthM, VISUAL_FALLBACK_COOKTOP_CUTOUT_SIZE_M.lengthM);
});

test('resolveSinkCutout clamps the fallback size down when the slab is narrower/shorter than the fallback cutout', () => {
  // Slab is only 0.3 x 0.3 m -- smaller than the 0.5 x 0.4 fallback cutout
  // in both directions.
  const cutout = resolveSinkCutout({ type: 'undermount', count: 1, position: null }, 0.3, 0.3);
  assert.ok(cutout.cut.widthM <= 0.3);
  assert.ok(cutout.cut.lengthM <= 0.3);
  // Clamped cut still stays fully inside the slab (0..widthM / 0..lengthM).
  assert.ok(cutout.cut.xM - cutout.cut.widthM / 2 >= -1e-9);
  assert.ok(cutout.cut.xM + cutout.cut.widthM / 2 <= 0.3 + 1e-9);
  assert.ok(cutout.cut.zM - cutout.cut.lengthM / 2 >= -1e-9);
  assert.ok(cutout.cut.zM + cutout.cut.lengthM / 2 <= 0.3 + 1e-9);
});

test('resolveSinkCutout does not shrink the cutout when the slab is bigger than the fallback size', () => {
  const cutout = resolveSinkCutout({ type: 'undermount', count: 1, position: null }, 2, 2);
  assert.equal(cutout.cut.widthM, VISUAL_FALLBACK_SINK_CUTOUT_SIZE_M.widthM);
  assert.equal(cutout.cut.lengthM, VISUAL_FALLBACK_SINK_CUTOUT_SIZE_M.lengthM);
});

test('resolveCooktopCutout clamps to the slab the same way as the sink', () => {
  const cutout = resolveCooktopCutout({ count: 1, position: null }, 0.3, 0.3);
  assert.ok(cutout.cut.widthM <= 0.3);
  assert.ok(cutout.cut.lengthM <= 0.3);
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

test('resolveHoles anchors mixer directly behind the sink (same xM, larger zM) when a sink is present', () => {
  const sink = resolveSinkCutout({ type: 'undermount', count: 1, position: null }, 0.6, 2);
  const holes = resolveHoles({ mixer: 1, socket: 0, dispenser: 0 }, 0.6, 2, sink);
  assert.equal(holes.mixer.position.xM, sink.cut.xM);
  assert.ok(holes.mixer.position.zM > sink.cut.zM + sink.cut.lengthM / 2);
});

test('resolveHoles offsets dispenser sideways from the faucet, not onto the exact same point', () => {
  const sink = resolveSinkCutout({ type: 'undermount', count: 1, position: null }, 0.6, 2);
  const holes = resolveHoles({ mixer: 1, socket: 0, dispenser: 1 }, 0.6, 2, sink);
  assert.notEqual(holes.dispenser.position.xM, holes.mixer.position.xM);
  assert.equal(holes.dispenser.position.zM, holes.mixer.position.zM);
});

test('resolveHoles keeps socket on its own row, unrelated to the sink, even when a sink is present', () => {
  const sink = resolveSinkCutout({ type: 'undermount', count: 1, position: null }, 0.6, 2);
  const withSink = resolveHoles({ mixer: 0, socket: 1, dispenser: 0 }, 0.6, 2, sink);
  const withoutSink = resolveHoles({ mixer: 0, socket: 1, dispenser: 0 }, 0.6, 2, null);
  assert.deepEqual(withSink.socket.position, withoutSink.socket.position);
});

test('resolveHoles clamps the sink-anchored faucet/dispenser so they never land outside the slab', () => {
  // A very short slab: the sink itself already fills most of it, so
  // "behind the sink" would overshoot the back edge without clamping.
  const sink = resolveSinkCutout({ type: 'undermount', count: 1, position: null }, 0.6, 0.35);
  const holes = resolveHoles({ mixer: 1, socket: 0, dispenser: 1 }, 0.6, 0.35, sink);
  assert.ok(holes.mixer.position.zM <= 0.35);
  assert.ok(holes.mixer.position.zM >= 0);
  assert.ok(holes.dispenser.position.xM >= 0 && holes.dispenser.position.xM <= 0.6);
});

test('resolveHoles falls back to the universal row for mixer/dispenser when there is no sink', () => {
  const holes = resolveHoles({ mixer: 1, socket: 0, dispenser: 1 }, 2, 2, null);
  assert.equal(holes.mixer.position.source, 'fallback');
  assert.equal(holes.dispenser.position.source, 'fallback');
});
