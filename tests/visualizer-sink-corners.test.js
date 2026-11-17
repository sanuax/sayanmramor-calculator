// tests/visualizer-sink-corners.test.js
//
// A sink never stands on a corner of the countertop: its cut keeps
// CUTOUT_CORNER_MARGIN_M from every corner of the outline -- the outer ones and
// the inner (re-entrant) ones of an L, U or G shape (the owner, 2026-11-17: a
// sink sat right at the inner junction of an L). Plan frame as in
// cutout-geometry.js: x across the depth (wall 0 .. room W), z along the run.
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildGeometryModel } = require('../visualizer/geometry-model.js');
const { resolveSinkCutout, resolveCooktopCutout } = require('../visualizer/cutout-geometry.js');
const C = require('../visualizer/constants.js');

const EPS = 1e-9;

// The countertop's outline vertices in the plan frame, from the shape alone
// (written out here on purpose, not shared with the code under test).
// A wing at the 'left' end spans z 0..ww, one at the 'right' end L-ww..L.
function outlineVertices(W, L, wing, shape, corner) {
  const { widthM: ww, lengthM: wl } = wing;
  const left = shape === 'ushape' || (shape === 'lshape' && corner === 'left');
  const right = shape === 'ushape' || (shape === 'lshape' && corner === 'right');
  const v = [[0, 0]];
  if (left) v.push([W + wl, 0], [W + wl, ww], [W, ww]); else v.push([W, 0]);
  if (right) v.push([W, L - ww], [W + wl, L - ww], [W + wl, L]); else v.push([W, L]);
  v.push([0, L]);
  return v;
}

function distToRect(cut, [px, pz]) {
  const dx = Math.max(Math.abs(px - cut.xM) - cut.widthM / 2, 0);
  const dz = Math.max(Math.abs(pz - cut.zM) - cut.lengthM / 2, 0);
  return Math.max(dx, dz);   // a square band of the margin around the cut: no corner inside it
}

function stateFor({ W, L, shape, corner, wing, sink, cooktop }) {
  return {
    dimensions: { widthM: W, lengthM: L, thicknessM: null },
    shape, corner,
    wing,
    edge: { type: null, lengthMm: null },
    additionalWorks: {
      sink: { type: sink ? 'undermount' : null, count: sink ? 1 : 0, position: null },
      cooktop: { count: cooktop ? 1 : 0, position: null },
    },
    holeCounts: { mixer: 1, socket: 0, dispenser: 0 },
    backsplash: { widthM: 0, lengthM: 0 }, curbLengthM: 0, wallPanel: { widthM: 0, lengthM: 0 },
    island: { standard: { widthM: 0, lengthM: 0 }, figured: { widthM: 0, lengthM: 0 } },
    barCounter: { standard: { widthM: 0, lengthM: 0 }, complex: { widthM: 0, lengthM: 0 } },
    product: null,
  };
}

function assertClearOfCorners(model, W, L, wing, shape, corner, label) {
  const cut = model.sink.cut;
  // the same size as before: the integrated sink is priced by the cut's length
  assert.equal(cut.widthM, C.VISUAL_FALLBACK_SINK_CUTOUT_SIZE_M.widthM, label);
  assert.equal(cut.lengthM, C.VISUAL_FALLBACK_SINK_CUTOUT_SIZE_M.lengthM, label);
  // inside the main run
  assert.ok(cut.xM - cut.widthM / 2 >= -EPS && cut.xM + cut.widthM / 2 <= W + EPS, `${label}: across the depth`);
  assert.ok(cut.zM - cut.lengthM / 2 >= -EPS && cut.zM + cut.lengthM / 2 <= L + EPS, `${label}: along the run`);
  outlineVertices(W, L, wing, shape, corner).forEach(p => {
    const d = distToRect(cut, p);
    assert.ok(d >= C.CUTOUT_CORNER_MARGIN_M - EPS,
      `${label}: the sink (x ${cut.xM.toFixed(3)}, z ${cut.zM.toFixed(3)}) is ${d.toFixed(3)} m from the corner [${p}], less than ${C.CUTOUT_CORNER_MARGIN_M}`);
  });
}

test('the corner margin is one named positive constant', () => {
  assert.equal(typeof C.CUTOUT_CORNER_MARGIN_M, 'number');
  assert.ok(C.CUTOUT_CORNER_MARGIN_M > 0 && C.CUTOUT_CORNER_MARGIN_M < 0.5);
});

// [depth, run, wing width (along the run), wing length]
const L_CASES = [
  [0.6, 2.4, 0.6, 1.5],
  [0.6, 3.0, 0.9, 1.2],
  [0.6, 1.8, 0.6, 1.0],
  [0.65, 2.0, 0.5, 0.8],
  [0.6, 2.6, 0.7, 2.0],
  [0.8, 2.2, 0.6, 1.4],
];

for (const corner of ['left', 'right']) {
  for (const cooktop of [false, true]) {
    test(`L-shape (wing at the ${corner} end), ${cooktop ? 'sink and cooktop' : 'sink alone'}: the sink keeps clear of every corner`, () => {
      for (const [W, L, ww, wl] of L_CASES) {
        const wing = { widthM: ww, lengthM: wl };
        const model = buildGeometryModel(stateFor({ W, L, shape: 'lshape', corner, wing, sink: true, cooktop }));
        assertClearOfCorners(model, W, L, wing, 'lshape', corner, `L ${W}x${L}, wing ${ww}x${wl}`);
        if (cooktop) {
          // the cooktop makes room, it does not overlap the sink along the run
          const s = model.sink.cut, c = model.cooktop.cut;
          assert.ok(Math.abs(s.zM - c.zM) >= (s.lengthM + c.lengthM) / 2 - EPS, `L ${W}x${L}: sink and cooktop overlap`);
        }
      }
    });
  }
}

test('U-shape: the sink keeps clear of both inner corners and the outer ones', () => {
  const cases = [[0.6, 3.2, 0.6, 1.2], [0.6, 3.6, 0.8, 1.0], [0.65, 3.0, 0.5, 1.5]];
  for (const cooktop of [false, true]) {
    for (const [W, L, ww, wl] of cases) {
      const wing = { widthM: ww, lengthM: wl };
      const model = buildGeometryModel(stateFor({ W, L, shape: 'ushape', corner: 'left', wing, sink: true, cooktop }));
      assertClearOfCorners(model, W, L, wing, 'ushape', 'left', `U ${W}x${L}, wings ${ww}x${wl}, cooktop ${cooktop}`);
    }
  }
});

test('a straight countertop: the sink keeps clear of the corners at the ends', () => {
  for (const [W, L] of [[0.6, 1.0], [0.6, 1.2], [0.6, 2.4], [0.7, 3.0]]) {
    for (const cooktop of [false, true]) {
      const wing = { widthM: 0, lengthM: 0 };
      const model = buildGeometryModel(stateFor({ W, L, shape: 'straight', corner: 'left', wing, sink: true, cooktop }));
      if (cooktop && L < 1.6) continue;   // no room for both with the margin: the cooktop case is not asked here
      assertClearOfCorners(model, W, L, wing, 'straight', 'left', `straight ${W}x${L}, cooktop ${cooktop}`);
    }
  }
});

test('the owner\'s case: an L with a sink and a cooktop, the sink was left straddling the inner corner', () => {
  // wing 0.72 wide: the old 30 % spot of a 2.4 m run (z 0.72) sat exactly on the inner corner
  const wing = { widthM: 0.72, lengthM: 1.5 };
  const model = buildGeometryModel(stateFor({ W: 0.6, L: 2.4, shape: 'lshape', corner: 'left', wing, sink: true, cooktop: true }));
  const cut = model.sink.cut;
  assert.ok(cut.zM - cut.lengthM / 2 >= wing.widthM + C.CUTOUT_CORNER_MARGIN_M - EPS
    || cut.zM + cut.lengthM / 2 <= wing.widthM - C.CUTOUT_CORNER_MARGIN_M + EPS,
  'the sink lies wholly on one side of the inner corner, with the margin');
});

test('resolveSinkCutout: a run too short to keep the margin on both sides still gives a cut inside the slab, as far from the corners as possible', () => {
  const cutout = resolveSinkCutout({ type: 'undermount', count: 1, position: null }, 0.6, 0.55,
    { wings: [] });
  const c = cutout.cut;
  assert.ok(c.zM - c.lengthM / 2 >= -EPS && c.zM + c.lengthM / 2 <= 0.55 + EPS);
  assert.equal(c.lengthM, C.VISUAL_FALLBACK_SINK_CUTOUT_SIZE_M.lengthM);
});

test('resolveSinkCutout: a chosen (real) position over a corner is moved off it', () => {
  // inner corner of a left wing 0.6 wide at z 0.6; a sink asked for at z 0.6 (centre), x 0.3
  const wings = [{ widthM: 0.6, lengthM: 1.2, corner: 'left' }];
  const cutout = resolveSinkCutout({ type: 'overlay', count: 1, position: { xMm: 400, yMm: 600 } }, 0.6, 2.4, { wings });
  const c = cutout.cut;
  assert.ok(distToRect(c, [0.6, 0.6]) >= C.CUTOUT_CORNER_MARGIN_M - EPS);
});

test('resolveSinkCutout without wings is the same as before for a long straight run', () => {
  const alone = resolveSinkCutout({ type: 'undermount', count: 1, position: null }, 0.6, 2.4, { wings: [] });
  assert.equal(alone.cut.zM, 1.2);
  const withCooktop = resolveSinkCutout({ type: 'undermount', count: 1, position: null }, 0.6, 2.4, { cooktopPresent: true, wings: [] });
  assert.ok(Math.abs(withCooktop.cut.zM - 2.4 * 0.3) < 0.006);   // the 30 % spot, give or take the search step
});

test('resolveCooktopCutout moves off the sink when they would overlap', () => {
  const sink = { cut: { xM: 0.4, zM: 1.7, widthM: 0.4, lengthM: 0.5 } };
  const cook = resolveCooktopCutout({ count: 1, position: null }, 0.6, 2.4, { sinkPresent: true, sinkCut: sink.cut, wings: [] });
  assert.ok(Math.abs(cook.cut.zM - sink.cut.zM) >= (cook.cut.lengthM + sink.cut.lengthM) / 2 - EPS);
});

// ---- the cooktop keeps clear of the corners too; with no room on the main run, a sink or a cooktop goes on a wing ----

function assertCutClear(cut, W, L, wing, shape, corner, label) {
  outlineVertices(W, L, wing, shape, corner).forEach(p => {
    const d = distToRect(cut, p);
    assert.ok(d >= C.CUTOUT_CORNER_MARGIN_M - EPS, `${label}: ${d.toFixed(3)} m from the corner [${p}] (x ${cut.xM.toFixed(3)}, z ${cut.zM.toFixed(3)})`);
  });
}

function insideWing(cut, W, L, wing, corner) {
  const z0 = corner === 'left' ? 0 : L - wing.widthM;
  return cut.xM - cut.widthM / 2 >= W - EPS && cut.xM + cut.widthM / 2 <= W + wing.lengthM + EPS
    && cut.zM - cut.lengthM / 2 >= z0 - EPS && cut.zM + cut.lengthM / 2 <= z0 + wing.widthM + EPS;
}

test('the cooktop keeps clear of every corner of an L and a U where the main run has room', () => {
  const cases = [['lshape', 0.6, 2.4, 0.6, 1.5], ['lshape', 0.6, 3.0, 0.9, 1.2], ['lshape', 0.6, 2.6, 0.7, 2.0], ['lshape', 0.8, 2.2, 0.6, 1.4],
    ['ushape', 0.6, 3.2, 0.6, 1.2], ['ushape', 0.6, 3.6, 0.8, 1.0]];
  for (const corner of ['left', 'right']) {
    for (const [shape, W, L, ww, wl] of cases) {
      if (shape === 'ushape' && corner === 'right') continue;
      const wing = { widthM: ww, lengthM: wl };
      const model = buildGeometryModel(stateFor({ W, L, shape, corner, wing, sink: true, cooktop: true }));
      const label = `${shape} ${corner} ${W}x${L}, wing ${ww}x${wl}`;
      assertCutClear(model.cooktop.cut, W, L, wing, shape, corner, label + ' cooktop');
      assertCutClear(model.sink.cut, W, L, wing, shape, corner, label + ' sink');
      assert.ok(cutGapOf(model.sink.cut, model.cooktop.cut) >= C.VISUAL_FALLBACK_CUTOUT_GAP_M - EPS, label + ': sink and cooktop too close');
    }
  }
});

function cutGapOf(a, b) {
  return Math.max(Math.abs(a.xM - b.xM) - (a.widthM + b.widthM) / 2, Math.abs(a.zM - b.zM) - (a.lengthM + b.lengthM) / 2);
}

test('a main run too short for both: the sink stays, the cooktop goes on the wing, clear of the corners', () => {
  for (const corner of ['left', 'right']) {
    const W = 0.6, L = 1.4, wing = { widthM: 0.6, lengthM: 1.2 };
    const model = buildGeometryModel(stateFor({ W, L, shape: 'lshape', corner, wing, sink: true, cooktop: true }));
    assert.equal(model.sink.cut.onWing, null, 'the sink keeps the main run');
    assert.equal(model.cooktop.cut.onWing, corner, `the cooktop is on the ${corner} wing`);
    assert.ok(insideWing(model.cooktop.cut, W, L, wing, corner), 'the cooktop lies wholly on the wing');
    assertCutClear(model.cooktop.cut, W, L, wing, 'lshape', corner, 'cooktop on the wing');
    assertCutClear(model.sink.cut, W, L, wing, 'lshape', corner, 'sink on the main run');
    assert.ok(cutGapOf(model.sink.cut, model.cooktop.cut) >= C.VISUAL_FALLBACK_CUTOUT_GAP_M - EPS);
  }
});

test('a main run with no room for the sink: it goes on the wing, turned, with the same cut length along its run (the price)', () => {
  for (const corner of ['left', 'right']) {
    const W = 0.6, L = 0.9, wing = { widthM: 0.6, lengthM: 1.5 };
    const model = buildGeometryModel(stateFor({ W, L, shape: 'lshape', corner, wing, sink: true, cooktop: false }));
    const cut = model.sink.cut;
    assert.equal(cut.onWing, corner);
    assert.ok(insideWing(cut, W, L, wing, corner), 'wholly on the wing');
    assertCutClear(cut, W, L, wing, 'lshape', corner, 'sink on the wing');
    // turned a quarter: 0.4 across the wing's depth (z), 0.5 along the wing (x); alongM is what the integrated sink is priced by
    assert.equal(cut.widthM, C.VISUAL_FALLBACK_SINK_CUTOUT_SIZE_M.lengthM);
    assert.equal(cut.lengthM, C.VISUAL_FALLBACK_SINK_CUTOUT_SIZE_M.widthM);
    assert.equal(cut.alongM, C.VISUAL_FALLBACK_SINK_CUTOUT_SIZE_M.lengthM);
    // the sink stands toward the room, the faucet behind it toward the wing's own wall
    const mixer = model.holes.mixer.position;
    const wall = corner === 'left' ? 0 : L;
    assert.ok(Math.abs(mixer.zM - wall) < Math.abs(cut.zM - wall), 'the faucet is behind the sink, nearer the wing\'s wall');
    assert.ok(insideWing({ xM: mixer.xM, zM: mixer.zM, widthM: 0, lengthM: 0 }, W, L, wing, corner), 'the faucet is on the wing');
    assert.ok(Math.abs(mixer.xM - cut.xM) < 1e-9, 'on the sink\'s own run position');
  }
});

test('a sink on the main run keeps cut.alongM equal to its length, and onWing null', () => {
  const model = buildGeometryModel(stateFor({ W: 0.6, L: 2.4, shape: 'straight', corner: 'left', wing: { widthM: 0, lengthM: 0 }, sink: true, cooktop: false }));
  assert.equal(model.sink.cut.onWing, null);
  assert.equal(model.sink.cut.alongM, model.sink.cut.lengthM);
});

test('nothing fits anywhere (a tiny L): a sink and a cooktop are still placed, inside the main run', () => {
  const model = buildGeometryModel(stateFor({ W: 0.6, L: 0.7, shape: 'lshape', corner: 'left', wing: { widthM: 0.3, lengthM: 0.3 }, sink: true, cooktop: true }));
  [model.sink.cut, model.cooktop.cut].forEach(c => {
    assert.equal(c.onWing, null);
    assert.ok(c.zM - c.lengthM / 2 >= -EPS && c.zM + c.lengthM / 2 <= 0.7 + EPS);
  });
});

test('the 3D scene cuts a sink on a wing, and its faucet hole, through the wing\'s stone -- not the main run\'s', () => {
  const SceneLayout = require('../visualizer/scene-layout.js');
  for (const corner of ['left', 'right']) {
    const state = stateFor({ W: 0.6, L: 0.9, shape: 'lshape', corner, wing: { widthM: 0.6, lengthM: 1.5 }, sink: true, cooktop: false });
    const model = buildGeometryModel(state);
    assert.equal(model.sink.cut.onWing, corner);
    const layout = SceneLayout.buildSceneLayout(model, {});
    const stone = name => layout.parts.find(p => p.kind === 'prism' && p.name === name);
    assert.equal(stone('main').holes.length, 0, 'no hole in the main run');
    const holes = stone('wing').holes;
    assert.equal(holes.filter(h => h.rect).length, 1, 'the sink\'s opening is in the wing');
    assert.equal(holes.filter(h => h.circle).length, 1, 'the faucet hole is in the wing');
  }
});

test('a short main run and a long wing: the sink and the cooktop both go on the wing, each clear of every corner', () => {
  for (const corner of ['left', 'right']) {
    const W = 0.6, L = 0.9, wing = { widthM: 0.6, lengthM: 2.0 };
    const model = buildGeometryModel(stateFor({ W, L, shape: 'lshape', corner, wing, sink: true, cooktop: true }));
    [model.sink.cut, model.cooktop.cut].forEach((cut, i) => {
      const what = i ? 'cooktop' : 'sink';
      assert.equal(cut.onWing, corner, `the ${what} is on the ${corner} wing`);
      assert.ok(insideWing(cut, W, L, wing, corner), `the ${what} lies wholly on the wing`);
      assertCutClear(cut, W, L, wing, 'lshape', corner, what);
    });
    assert.ok(cutGapOf(model.sink.cut, model.cooktop.cut) >= C.VISUAL_FALLBACK_CUTOUT_GAP_M - EPS, 'the gap between them');
  }
});

test('the cooktop faces the room: its front is +X on the main run, and on a wing away from the wing\'s own wall', () => {
  const SceneLayout = require('../visualizer/scene-layout.js');
  const hob = state => SceneLayout.buildSceneLayout(buildGeometryModel(state), {}).parts.find(p => p.kind === 'cooktop');
  // main run
  assert.deepEqual(hob(stateFor({ W: 0.6, L: 2.4, shape: 'straight', corner: 'left', wing: { widthM: 0, lengthM: 0 }, sink: false, cooktop: true })).front, [1, 0]);
  for (const corner of ['left', 'right']) {
    const W = 0.6, L = 0.9;
    const state = stateFor({ W, L, shape: 'lshape', corner, wing: { widthM: 0.6, lengthM: 2.0 }, sink: false, cooktop: true });
    const model = buildGeometryModel(state);
    assert.equal(model.cooktop.cut.onWing, corner);
    const part = hob(state);
    // the wing's own wall in the scene's frame: z = L/2 - zM, zM 0 (left) or L (right)
    const wallZ = corner === 'left' ? L / 2 : -L / 2;
    assert.equal(part.front[0], 0);
    assert.ok(part.front[1] * (part.center[2] - wallZ) > 0, 'faces away from the wall, toward the person standing at the hob');
  }
});

// ---- a narrow countertop gets a smaller sink and cooktop ----

const SINK = C.VISUAL_FALLBACK_SINK_CUTOUT_SIZE_M, HOB = C.VISUAL_FALLBACK_COOKTOP_CUTOUT_SIZE_M;

test('a 600 mm depth keeps the full-size sink and hob', () => {
  const model = buildGeometryModel(stateFor({ W: 0.6, L: 2.4, shape: 'straight', corner: 'left', wing: { widthM: 0, lengthM: 0 }, sink: true, cooktop: true }));
  assert.equal(model.sink.cut.widthM, SINK.widthM);
  assert.equal(model.sink.cut.lengthM, SINK.lengthM);
  assert.equal(model.cooktop.cut.widthM, HOB.widthM);
  assert.equal(model.cooktop.cut.lengthM, HOB.lengthM);
});

test('a 400 mm depth: the sink and the hob shrink, in proportion, and leave stone on both sides (the faucet fits behind the sink)', () => {
  const W = 0.4;
  const model = buildGeometryModel(stateFor({ W, L: 2.4, shape: 'straight', corner: 'left', wing: { widthM: 0, lengthM: 0 }, sink: true, cooktop: true }));
  const s = model.sink.cut, h = model.cooktop.cut;
  assert.ok(s.widthM < SINK.widthM && h.widthM < HOB.widthM, 'smaller than the full size');
  assert.ok(Math.abs(s.lengthM / s.widthM - SINK.lengthM / SINK.widthM) < 1e-9, 'the sink keeps its proportions');
  assert.ok(Math.abs(h.lengthM / h.widthM - HOB.lengthM / HOB.widthM) < 1e-9, 'the hob keeps its proportions');
  // stone in front of the sink, and the room for the faucet behind it
  assert.ok(W - (s.xM + s.widthM / 2) >= C.VISUAL_FALLBACK_CUTOUT_FRONT_MARGIN_M - EPS, 'stone in front of the sink');
  assert.ok(s.xM - s.widthM / 2 >= 0.09 - EPS, 'room behind the sink for the faucet');
  // the hob: stone on both sides
  assert.ok(h.xM - h.widthM / 2 >= 0.05 && W - (h.xM + h.widthM / 2) >= 0.05, 'stone each side of the hob');
  // the price: the integrated sink is still priced by its full cut length
  assert.equal(s.alongM, SINK.lengthM);
});

test('a narrow top: the faucet stands behind the shrunk sink, on the slab', () => {
  const W = 0.4;
  const st = stateFor({ W, L: 2.4, shape: 'straight', corner: 'left', wing: { widthM: 0, lengthM: 0 }, sink: true, cooktop: false });
  st.holeCounts = { mixer: 1, socket: 0, dispenser: 0 };
  const model = buildGeometryModel(st);
  const m = model.holes.mixer.position, s = model.sink.cut;
  assert.ok(m.xM < s.xM - s.widthM / 2, 'behind the sink');
  assert.ok(m.xM - model.holes.mixer.radiusM >= C.VISUAL_FALLBACK_HOLE_EDGE_MARGIN_M - EPS, 'on the slab, clear of the wall edge');
});

test('the scale stops at the minimum: a very shallow top does not shrink the sink below CUTOUT_MIN_SCALE', () => {
  const model = buildGeometryModel(stateFor({ W: 0.2, L: 2.4, shape: 'straight', corner: 'left', wing: { widthM: 0, lengthM: 0 }, sink: true, cooktop: false }));
  assert.ok(Math.abs(model.sink.cut.widthM - SINK.widthM * C.CUTOUT_MIN_SCALE) < 1e-9 || model.sink.cut.widthM <= 0.2);
  assert.ok(model.sink.cut.widthM >= Math.min(0.2, SINK.widthM * C.CUTOUT_MIN_SCALE) - EPS);
});

test('a narrow wing hosts a scaled sink or hob sized for the wing\'s own depth', () => {
  const W = 0.6, L = 0.9, wing = { widthM: 0.4, lengthM: 2.0 };
  const model = buildGeometryModel(stateFor({ W, L, shape: 'lshape', corner: 'left', wing, sink: true, cooktop: true }));
  [model.sink.cut, model.cooktop.cut].forEach(cut => {
    assert.equal(cut.onWing, 'left');
    assert.ok(insideWing(cut, W, L, wing, 'left'));
    assert.ok(cut.lengthM <= wing.widthM - 0.1 + EPS, 'across the narrow wing it leaves stone at the sides (z extent)');
    assertCutClear(cut, W, L, wing, 'lshape', 'left', 'on the narrow wing');
  });
});

// ---- a short run: the sink and the hob never overlap; a compact two-zone hob steps in ----

test('a short straight run: the sink and the hob never overlap, whatever the depth (from 0.9 m of run)', () => {
  for (const W of [0.4, 0.5, 0.6, 0.8]) {
    for (let L = 0.9; L <= 3.0 + EPS; L += 0.05) {
      const wing = { widthM: 0, lengthM: 0 };
      const model = buildGeometryModel(stateFor({ W, L, shape: 'straight', corner: 'left', wing, sink: true, cooktop: true }));
      const s = model.sink.cut, h = model.cooktop.cut, label = `depth ${W}, run ${L.toFixed(2)}`;
      assert.ok(cutGapOf(s, h) >= C.CUTOUT_TIGHT_GAP_M - EPS, `${label}: the gap between the sink and the hob is ${cutGapOf(s, h).toFixed(3)}`);
      [s, h].forEach(c => assert.ok(c.zM - c.lengthM / 2 >= -EPS && c.zM + c.lengthM / 2 <= L + EPS && c.xM - c.widthM / 2 >= -EPS && c.xM + c.widthM / 2 <= W + EPS, `${label}: inside the slab`));
    }
  }
});

test('the hob is the compact two-zone one only when the run is too short for the standard one', () => {
  const zones = L => buildGeometryModel(stateFor({ W: 0.6, L, shape: 'straight', corner: 'left', wing: { widthM: 0, lengthM: 0 }, sink: true, cooktop: true })).cooktop.cut.zones;
  assert.equal(zones(2.4), 4);
  assert.equal(zones(1.0), 2);
  const compact = buildGeometryModel(stateFor({ W: 0.6, L: 1.0, shape: 'straight', corner: 'left', wing: { widthM: 0, lengthM: 0 }, sink: true, cooktop: true })).cooktop.cut;
  assert.equal(compact.widthM, C.VISUAL_FALLBACK_COMPACT_COOKTOP_CUTOUT_SIZE_M.widthM);
  assert.equal(compact.lengthM, C.VISUAL_FALLBACK_COMPACT_COOKTOP_CUTOUT_SIZE_M.lengthM);
});

test('a hob alone on a short run is not squeezed: standard if it fits, else the compact one', () => {
  const hob = L => buildGeometryModel(stateFor({ W: 0.6, L, shape: 'straight', corner: 'left', wing: { widthM: 0, lengthM: 0 }, sink: false, cooktop: true })).cooktop.cut;
  assert.equal(hob(1.5).zones, 4);
  assert.equal(hob(0.8).zones, 2);
});

test('the scene tells the renderer how many zones the hob has', () => {
  const SceneLayout = require('../visualizer/scene-layout.js');
  const hob = L => SceneLayout.buildSceneLayout(buildGeometryModel(stateFor({ W: 0.6, L, shape: 'straight', corner: 'left', wing: { widthM: 0, lengthM: 0 }, sink: true, cooktop: true })), {}).parts.find(p => p.kind === 'cooktop');
  assert.equal(hob(2.4).zones, 4);
  assert.equal(hob(1.0).zones, 2);
});
