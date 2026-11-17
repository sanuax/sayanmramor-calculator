// tests/visualizer-sink-corners.test.js
//
// A sink never stands on a corner of the countertop: its cut keeps
// SINK_CORNER_MARGIN_M from every corner of the outline -- the outer ones and
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
    assert.ok(d >= C.SINK_CORNER_MARGIN_M - EPS,
      `${label}: the sink (x ${cut.xM.toFixed(3)}, z ${cut.zM.toFixed(3)}) is ${d.toFixed(3)} m from the corner [${p}], less than ${C.SINK_CORNER_MARGIN_M}`);
  });
}

test('the corner margin is one named positive constant', () => {
  assert.equal(typeof C.SINK_CORNER_MARGIN_M, 'number');
  assert.ok(C.SINK_CORNER_MARGIN_M > 0 && C.SINK_CORNER_MARGIN_M < 0.5);
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
  assert.ok(cut.zM - cut.lengthM / 2 >= wing.widthM + C.SINK_CORNER_MARGIN_M - EPS
    || cut.zM + cut.lengthM / 2 <= wing.widthM - C.SINK_CORNER_MARGIN_M + EPS,
  'the sink lies wholly on one side of the inner corner, with the margin');
});

test('resolveSinkCutout: a run too short to keep the margin on both sides still gives a cut inside the slab, as far from the corners as possible', () => {
  const cutout = resolveSinkCutout({ type: 'undermount', count: 1, position: null }, 0.6, 0.55,
    { wings: [{ widthM: 0.3, lengthM: 1, corner: 'left' }] });
  const c = cutout.cut;
  assert.ok(c.zM - c.lengthM / 2 >= -EPS && c.zM + c.lengthM / 2 <= 0.55 + EPS);
  assert.equal(c.lengthM, C.VISUAL_FALLBACK_SINK_CUTOUT_SIZE_M.lengthM);
});

test('resolveSinkCutout: a chosen (real) position over a corner is moved off it', () => {
  // inner corner of a left wing 0.6 wide at z 0.6; a sink asked for at z 0.6 (centre), x 0.3
  const wings = [{ widthM: 0.6, lengthM: 1.2, corner: 'left' }];
  const cutout = resolveSinkCutout({ type: 'overlay', count: 1, position: { xMm: 400, yMm: 600 } }, 0.6, 2.4, { wings });
  const c = cutout.cut;
  assert.ok(distToRect(c, [0.6, 0.6]) >= C.SINK_CORNER_MARGIN_M - EPS);
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
