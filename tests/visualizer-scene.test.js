// tests/visualizer-scene.test.js
//
// Geometry/data invariants of the 3D presentation: what SceneLayout puts in
// the scene, where, and whether CameraFraming keeps all of it in frame.
// No pixels -- the renderer (three-scene.js) only draws these parts.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createFakeDoc } = require('./helpers/fake-dom.js');
const ConstructorState = require('../constructor-state.js');
const ProductTypes = require('../product-types.js');
const GeometryModel = require('../visualizer/geometry-model.js');
const SceneLayout = require('../visualizer/scene-layout.js');
const CameraFraming = require('../visualizer/camera-framing.js');
const { CAMERA_PRESETS } = require('../visualizer/constants.js');

const { PRODUCTS, hasAdditionalWork } = ProductTypes;

function modelFor(productKey, values) {
  const doc = createFakeDoc(Object.assign({ width: { value: '650' }, length: { value: '2400' } }, values));
  const state = ConstructorState.readConstructorState({ doc, selectedProductKey: productKey, product: PRODUCTS[productKey], stone: null, hasAdditionalWork });
  return GeometryModel.buildGeometryModel(state);
}

function layoutFor(productKey, values) {
  return SceneLayout.buildSceneLayout(modelFor(productKey, values));
}

function named(layout, name) {
  return layout.parts.filter(p => p.name === name);
}

function extent(points) {
  const xs = points.map(p => p[0]), zs = points.map(p => p[1]);
  return { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
}

function contains(bounds, part) {
  const e = part.kind === 'prism' ? extent(part.outline) : null;
  if (!e) return true;
  return e.x0 >= bounds.min[0] - 1e-9 && e.x1 <= bounds.max[0] + 1e-9 && e.z0 >= bounds.min[2] - 1e-9 && e.z1 <= bounds.max[2] + 1e-9
    && part.y0 >= bounds.min[1] - 1e-9 && part.y1 <= bounds.max[1] + 1e-9;
}

const L_SHAPE = { productShape: { value: 'lshape' }, 'wing-width': { value: '600' }, 'wing-length': { value: '1400' } };
const ISLAND = { 'extra-ostrov-width': { value: '900' }, 'extra-ostrov-length': { value: '1800' } };
const BAR = { 'extra-bar-standard-width': { value: '500' }, 'extra-bar-standard-length': { value: '1200' } };

// 1-5. bounds ----------------------------------------------------------------

test('straight countertop: bounds are exactly the slab (650 deep x 2400 run), centred on the origin', () => {
  const { bounds } = layoutFor('stoleshnitsa_kuhnya', {});
  assert.ok(Math.abs(bounds.max[0] - bounds.min[0] - 0.65) < 1e-9);
  assert.ok(Math.abs(bounds.max[2] - bounds.min[2] - 2.4) < 1e-9);
  assert.ok(Math.abs(bounds.min[2] + 1.2) < 1e-9);
});

test('L-shape: the wing extends the bounds into the room (X+) and sits flush at one end of the run', () => {
  const layout = layoutFor('stoleshnitsa_kuhnya', Object.assign({ 'shape-corner': { value: 'right' } }, L_SHAPE));
  const wing = named(layout, 'wing')[0];
  const e = extent(wing.outline);
  assert.ok(Math.abs(e.x0 - 0.325) < 1e-9, 'wing starts at the main run\'s room-side edge');
  assert.ok(Math.abs(e.x1 - (0.325 + 1.4)) < 1e-9);
  assert.ok(Math.abs(e.z0 + 1.2) < 1e-9 && Math.abs(e.z1 - (-1.2 + 0.6)) < 1e-9, 'right corner: flush with the -Z end');
  assert.ok(contains(layout.bounds, wing));
});

test('L-shape "угол слева" puts the wing at the other end -- never through the wall (X-)', () => {
  const left = named(layoutFor('stoleshnitsa_kuhnya', Object.assign({ 'shape-corner': { value: 'left' } }, L_SHAPE)), 'wing')[0];
  const e = extent(left.outline);
  assert.ok(e.x0 >= 0.325 - 1e-9, 'wing is on the room side');
  assert.ok(Math.abs(e.z1 - 1.2) < 1e-9);
});

test('island is included in the bounds, sits across a walkway on the room side, and never overlaps an L wing', () => {
  const layout = layoutFor('stoleshnitsa_kuhnya', Object.assign({}, L_SHAPE, ISLAND));
  const island = extent(named(layout, 'island')[0].outline);
  const wing = extent(named(layout, 'wing')[0].outline);
  assert.ok(contains(layout.bounds, named(layout, 'island')[0]));
  assert.ok(island.x0 > 0.325, 'island is on the room side');
  const overlapX = island.x0 < wing.x1 && wing.x0 < island.x1;
  const overlapZ = island.z0 < wing.z1 && wing.z0 < island.z1;
  assert.ok(!(overlapX && overlapZ), 'island and wing must not occupy the same floor');
});

test('bar counter is included in the bounds and continues the run from the end the L wing does NOT use', () => {
  const straight = named(layoutFor('stoleshnitsa_kuhnya', BAR), 'bar')[0];
  assert.ok(extent(straight.outline).z0 >= 1.2, 'no wing: past the +Z end');
  ['left', 'right'].forEach(corner => {
    const layout = layoutFor('stoleshnitsa_kuhnya', Object.assign({ 'shape-corner': { value: corner } }, L_SHAPE, BAR));
    const bar = extent(named(layout, 'bar')[0].outline);
    const wing = extent(named(layout, 'wing')[0].outline);
    assert.ok(contains(layout.bounds, named(layout, 'bar')[0]));
    const wingAtPlusZ = wing.z1 > 0;
    assert.ok(wingAtPlusZ ? bar.z1 <= -1.2 : bar.z0 >= 1.2, corner + ': bar at the free end');
  });
});

test('wall panel is real geometry on the wall side, included in the bounds; with a backsplash it stands behind it (no z-fighting)', () => {
  const layout = layoutFor('stoleshnitsa_kuhnya', {
    'extra-wallpanel-width': { value: '900' }, 'extra-wallpanel-length': { value: '2400' },
    'extra-fartuk-width': { value: '600' }, 'extra-fartuk-length': { value: '2400' },
  });
  const boxes = layout.parts.filter(p => p.kind === 'box' && p.role === 'stone');
  assert.equal(boxes.length, 2);
  const [backsplash, panel] = boxes;
  assert.ok(panel.center[0] < backsplash.center[0], 'panel is on the wall, backsplash in front of it');
  assert.ok(panel.center[0] < -0.325 && backsplash.center[0] < -0.325, 'both on the wall side (X-)');
  assert.ok(Math.abs(panel.size[2] - 2.4) < 1e-9, 'runs along the length, not the depth');
  assert.ok(layout.bounds.max[1] >= 0.02 + 0.9 - 1e-9, 'bounds include the panel height');
});

test('curb sits ON the countertop along the wall edge, not floating behind it', () => {
  const layout = layoutFor('stoleshnitsa_kuhnya', { 'extra-bortik': { value: '1200' } });
  const curb = layout.parts.find(p => p.kind === 'box');
  assert.ok(curb.center[0] - curb.size[0] / 2 >= -0.325 - 1e-9, 'inside the slab footprint');
  assert.ok(curb.center[1] - curb.size[1] / 2 >= 0.02 - 1e-9, 'on top of the slab');
  assert.ok(Math.abs(curb.size[2] - 1.2) < 1e-9);
});

test('a curb/backsplash/wall panel longer than the run is drawn along the run only, never hanging past its ends', () => {
  const layout = layoutFor('stoleshnitsa_vannaya', {
    length: { value: '1600' }, 'extra-bortik': { value: '2400' },
    'extra-fartuk-width': { value: '300' }, 'extra-fartuk-length': { value: '3000' },
  });
  layout.parts.filter(p => p.kind === 'box').forEach(b => {
    assert.ok(b.size[2] <= 1.6 + 1e-9, 'drawn length is capped at the 1.6 m run');
  });
  // The real entered length is untouched in the model the Result reads.
  assert.equal(modelFor('stoleshnitsa_vannaya', { length: { value: '1600' }, 'extra-bortik': { value: '2400' } }).curb.lengthM, 2.4);
});

test('context-heavy products keep more of the frame free so the wall/window reads; countertops stay tight', () => {
  assert.equal(layoutFor('stoleshnitsa_kuhnya', {}).framePadding, 0.1);
  assert.ok(layoutFor('panno', {}).framePadding > layoutFor('stena', {}).framePadding);
  assert.ok(layoutFor('podokonnik', {}).framePadding > 0.1);
});

// 6. camera framing ------------------------------------------------------------

test('camera framing keeps every secondary object in view: L + island + bar + wall panel, every preset, several aspects', () => {
  const layout = layoutFor('stoleshnitsa_kuhnya', Object.assign({}, L_SHAPE, ISLAND, BAR, {
    'extra-wallpanel-width': { value: '900' }, 'extra-wallpanel-length': { value: '2400' },
  }));
  Object.keys(CAMERA_PRESETS).forEach(name => {
    [0.75, 4 / 3, 16 / 10, 2].forEach(aspect => {
      const fit = CameraFraming.fitCamera({ bounds: layout.bounds, direction: CAMERA_PRESETS[name].direction, fovDeg: 32, aspect, padding: 0.1 });
      assert.ok(CameraFraming.cornersInView({ bounds: layout.bounds, position: fit.position, target: fit.target, fovDeg: 32, aspect }), name + ' @' + aspect);
    });
  });
});

test('framing is tight: a bigger model is framed from farther away, the same model never floats in a huge margin', () => {
  const small = layoutFor('stoleshnitsa_vannaya', { width: { value: '500' }, length: { value: '900' } }).bounds;
  const big = layoutFor('stoleshnitsa_kuhnya', Object.assign({}, L_SHAPE, ISLAND)).bounds;
  const dir = CAMERA_PRESETS.iso.direction;
  const dSmall = CameraFraming.fitCamera({ bounds: small, direction: dir, fovDeg: 32, aspect: 1.6, padding: 0.1 }).distance;
  const dBig = CameraFraming.fitCamera({ bounds: big, direction: dir, fovDeg: 32, aspect: 1.6, padding: 0.1 }).distance;
  assert.ok(dBig > dSmall * 1.5);
  // With no padding the fit touches the frustum: shrinking the distance by 5% must crop.
  const exact = CameraFraming.fitCamera({ bounds: big, direction: dir, fovDeg: 32, aspect: 1.6, padding: 0 });
  const closer = exact.target.map((t, i) => t + (exact.position[i] - t) * 0.95);
  assert.equal(CameraFraming.cornersInView({ bounds: big, position: closer, target: exact.target, fovDeg: 32, aspect: 1.6 }), false);
});

test('the camera targets the centre of the whole composition, not the main slab\'s origin', () => {
  const { bounds } = layoutFor('stoleshnitsa_kuhnya', ISLAND);
  const fit = CameraFraming.fitCamera({ bounds, direction: [1, 0.8, 1], fovDeg: 32, aspect: 1.5, padding: 0.1 });
  assert.ok(fit.target[0] > 0.5, 'shifted toward the island');
});

// 7-9. sink and holes ------------------------------------------------------------

test('sink and cooktop share the run without overlapping, and both stay inside the slab', () => {
  [2.4, 1.8, 1.4].forEach(L => {
    const m = modelFor('stoleshnitsa_kuhnya', { length: { value: String(L * 1000) }, 'cut-sink-undermount': { value: '1' }, 'cut-cooktop': { value: '1' } });
    const s = m.sink.cut, c = m.cooktop.cut;
    [s, c].forEach(cut => {
      assert.ok(cut.xM - cut.widthM / 2 >= -1e-9 && cut.xM + cut.widthM / 2 <= m.widthM + 1e-9);
      assert.ok(cut.zM - cut.lengthM / 2 >= -1e-9 && cut.zM + cut.lengthM / 2 <= m.lengthM + 1e-9);
    });
    assert.ok(Math.abs(s.zM - c.zM) >= (s.lengthM + c.lengthM) / 2, 'L=' + L + ': no overlap along the run');
  });
});

test('a sink is clamped inside even a tiny slab', () => {
  const m = modelFor('stoleshnitsa_vannaya', { width: { value: '300' }, length: { value: '350' }, 'cut-sink-overlay': { value: '1' } });
  const s = m.sink.cut;
  assert.ok(s.xM - s.widthM / 2 >= -1e-9 && s.xM + s.widthM / 2 <= 0.3 + 1e-9);
  assert.ok(s.zM - s.lengthM / 2 >= -1e-9 && s.zM + s.lengthM / 2 <= 0.35 + 1e-9);
});

test('hole placement is deterministic: the same state always gives the same positions', () => {
  const values = { 'cut-sink-undermount': { value: '1' }, 'hole-mixer': { value: '1' }, 'hole-dispenser': { value: '1' }, 'hole-socket': { value: '1' } };
  assert.deepEqual(modelFor('stoleshnitsa_kuhnya', values).holes, modelFor('stoleshnitsa_kuhnya', values).holes);
});

test('holes never overlap each other or the sink opening -- the slab outline stays valid (no intersecting holes)', () => {
  const variants = [
    { width: { value: '650' } }, { width: { value: '500' } }, { width: { value: '450' }, length: { value: '900' } },
  ];
  variants.forEach(dims => {
    const layout = layoutFor('stoleshnitsa_vannaya', Object.assign({
      'cut-sink-undermount': { value: '1' }, 'hole-mixer': { value: '1' }, 'hole-dispenser': { value: '1' }, 'hole-socket': { value: '1' },
    }, dims));
    const holes = named(layout, 'main')[0].holes;
    const shapes = holes.map(h => h.rect
      ? { x0: h.rect.x - h.rect.w / 2, x1: h.rect.x + h.rect.w / 2, z0: h.rect.z - h.rect.l / 2, z1: h.rect.z + h.rect.l / 2 }
      : { x0: h.circle.x - h.circle.r, x1: h.circle.x + h.circle.r, z0: h.circle.z - h.circle.r, z1: h.circle.z + h.circle.r });
    for (let i = 0; i < shapes.length; i++) {
      for (let j = i + 1; j < shapes.length; j++) {
        const a = shapes[i], b = shapes[j];
        assert.ok(!(a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1), JSON.stringify(dims) + ': holes ' + i + '/' + j + ' overlap');
      }
    }
  });
});

test('sink types read differently: undermount = steel bowl under a clean opening, overlay = steel rim on top, integrated = stone bowl', () => {
  const kinds = type => layoutFor('stoleshnitsa_kuhnya', { ['cut-sink-' + type]: { value: '1' } }).parts.filter(p => p.name && p.name.startsWith('sink')).map(p => p.name + ':' + p.role);
  assert.deepEqual(kinds('undermount'), ['sink:metal']);
  assert.deepEqual(kinds('overlay'), ['sink-rim:metal', 'sink:metal']);
  assert.deepEqual(kinds('integrated'), ['sink:stone']);
});

// 10-11. steps / stairs ------------------------------------------------------

test('steps: the configured size is ONE tread -- every tread is lengthM across by widthM deep, each a rise higher', () => {
  const layout = layoutFor('stupeni', { width: { value: '350' }, length: { value: '1200' } });
  const treads = named(layout, 'tread');
  assert.ok(treads.length >= 3);
  treads.forEach((t, i) => {
    const e = extent(t.outline);
    assert.ok(Math.abs((e.z1 - e.z0) - 1.2) < 1e-9, 'across');
    assert.ok(Math.abs((e.x1 - e.x0) - 0.35) < 1e-9, 'deep');
    if (i > 0) assert.ok(t.y1 > treads[i - 1].y1, 'climbs');
  });
  assert.equal(named(layout, 'riser').length, 0, 'no stone risers unless chosen');
  assert.ok(named(layout, 'body').length > 0, 'treads rest on a stair structure');
});

test('steps "с подступенками": one stone riser per tread, filling the height under its front edge', () => {
  const layout = layoutFor('stupeni', { width: { value: '350' }, length: { value: '1200' }, 'stupeni-riser': { checked: true } });
  const treads = named(layout, 'tread'), risers = named(layout, 'riser');
  assert.equal(risers.length, treads.length);
  risers.forEach((r, i) => {
    assert.equal(r.role, 'stone');
    assert.ok(Math.abs(r.y1 - treads[i].y0) < 1e-9, 'riser reaches the underside of its tread');
    assert.ok(r.y1 - r.y0 > 0.1);
  });
});

test('steps variants from the real "type" selection: winder fans around a pivot, radius bulges the front edge', () => {
  const winder = named(layoutFor('stupeni', { productSubcategory: { value: 'STEP-02' } }), 'tread');
  const rects = named(layoutFor('stupeni', { productSubcategory: { value: 'STEP-01' } }), 'tread');
  const radius = named(layoutFor('stupeni', { productSubcategory: { value: 'STEP-03' } }), 'tread');
  assert.equal(rects[0].outline.length, 4);
  assert.ok(radius[0].outline.length > 4, 'arc front edge');
  const heading = t => { const e = extent(t.outline); return Math.atan2((e.z0 + e.z1) / 2, (e.x0 + e.x1) / 2); };
  assert.notEqual(heading(winder[0]).toFixed(3), heading(winder[winder.length - 1]).toFixed(3), 'winder treads turn');
});

test('stairs (лестница): the client\'s number of treads covers the walking length, risers in stone only for "+ подступенки" rows', () => {
  const plain = layoutFor('lestnitsa', { width: { value: '1000' }, length: { value: '3000' }, 'step-count': { value: '10' }, productSubcategory: { value: 'STAIR-01' } });
  const withRisers = layoutFor('lestnitsa', { width: { value: '1000' }, length: { value: '3000' }, 'step-count': { value: '10' }, productSubcategory: { value: 'STAIR-02' } });
  const treads = named(plain, 'tread');
  assert.equal(treads.length, 10);
  const run = extent([].concat(...treads.map(t => t.outline)));
  assert.ok(Math.abs((run.x1 - run.x0) - 3) < 1e-9);
  assert.equal(named(plain, 'riser').length, 0);
  assert.equal(named(withRisers, 'riser').length, 10);
});

test('stairs shapes: Г has a landing and turns, П has a landing twice as wide, spiral winds around a column', () => {
  const l = layoutFor('lestnitsa', { width: { value: '1000' }, length: { value: '3000' }, productSubcategory: { value: 'STAIR-03' } });
  const u = layoutFor('lestnitsa', { width: { value: '1000' }, length: { value: '3000' }, productSubcategory: { value: 'STAIR-05' } });
  const spiral = layoutFor('lestnitsa', { width: { value: '1000' }, length: { value: '3000' }, productSubcategory: { value: 'STAIR-07' } });
  assert.equal(named(l, 'landing').length, 1);
  const uLanding = extent(named(u, 'landing')[0].outline);
  assert.ok(uLanding.z1 - uLanding.z0 > 2);
  assert.equal(named(spiral, 'column').length, 1);
});

// product presentation ----------------------------------------------------------

test('panel/wall/facade stand vertical; floor lies flat with the chosen layout\'s joints; the sill sits in a window opening', () => {
  const panno = layoutFor('panno', { width: { value: '800' }, length: { value: '1200' } });
  const stone = panno.parts.find(p => p.role === 'stone');
  assert.ok(stone.size[1] > stone.size[0], 'panno is upright');
  assert.ok(panno.parts.some(p => p.role === 'context'), 'hung on a wall');
  assert.equal(panno.bounds.max[0] - panno.bounds.min[0] < 0.1, true, 'context wall is not part of the framed bounds');

  const stena = layoutFor('stena', { length: { value: '2700' }, width: { value: '4000' }, productSubcategory: { value: 'WALL-01' } });
  const wall = stena.parts.find(p => p.role === 'stone');
  assert.ok(Math.abs(wall.size[1] - 2.7) < 1e-9 && Math.abs(wall.size[2] - 4) < 1e-9, 'height = "Высота стены", run = "Ширина стены"');
  assert.ok(stena.parts.some(p => p.kind === 'seams'));

  const floorStraight = layoutFor('pol', { width: { value: '3000' }, length: { value: '4000' }, productSubcategory: { value: 'FLOOR-01' } });
  const floorPattern = layoutFor('pol', { width: { value: '3000' }, length: { value: '4000' }, productSubcategory: { value: 'FLOOR-04' } });
  assert.ok(floorStraight.parts.some(p => p.kind === 'seams'));
  assert.ok(floorPattern.parts.some(p => p.kind === 'seams'), '«По рисунку» draws its border band');

  const sill = layoutFor('podokonnik', { width: { value: '300' }, length: { value: '1500' } });
  assert.ok(sill.parts.some(p => p.role === 'context-glass'), 'window glass above the sill');
  assert.ok(Math.abs(sill.bounds.max[0] - sill.bounds.min[0] - 0.3) < 0.01, 'framing is on the sill, not the wall');
});

test('every product produces a non-empty layout with finite bounds', () => {
  Object.keys(PRODUCTS).forEach(key => {
    const layout = layoutFor(key, {});
    assert.ok(layout.parts.length > 0, key);
    layout.bounds.min.concat(layout.bounds.max).forEach(v => assert.ok(Number.isFinite(v), key));
    assert.ok(Number.isFinite(layout.floorY), key);
  });
});

// 12-13. product switching / Result reframing ------------------------------------

test('decideCameraAction: first model or a product switch resets, a size change refits, a detail change keeps the camera', () => {
  const kitchen = layoutFor('stoleshnitsa_kuhnya', {}).bounds;
  const kitchenHoles = layoutFor('stoleshnitsa_kuhnya', { 'hole-mixer': { value: '1' } }).bounds;
  const kitchenLonger = layoutFor('stoleshnitsa_kuhnya', { length: { value: '3200' } }).bounds;
  const bath = layoutFor('stoleshnitsa_vannaya', {}).bounds;
  const d = (prevKey, nextKey, prev, next, hasPrevious) => CameraFraming.decideCameraAction({ previousProductKey: prevKey, nextProductKey: nextKey, previousBounds: prev, nextBounds: next, hasPrevious });
  assert.equal(d(null, 'stoleshnitsa_kuhnya', null, kitchen, false), 'reset');
  assert.equal(d('stoleshnitsa_kuhnya', 'stoleshnitsa_vannaya', kitchen, bath, true), 'reset');
  assert.equal(d('stoleshnitsa_vannaya', 'stoleshnitsa_kuhnya', bath, kitchen, true), 'reset');
  assert.equal(d('stoleshnitsa_kuhnya', 'stoleshnitsa_kuhnya', kitchen, kitchenLonger, true), 'refit');
  assert.equal(d('stoleshnitsa_kuhnya', 'stoleshnitsa_kuhnya', kitchen, kitchenHoles, true), 'keep');
});

test('Result framing (resetView = product preset + fit) contains the whole final configuration for every product\'s own preset', () => {
  Object.keys(PRODUCTS).forEach(key => {
    const model = modelFor(key, Object.assign({}, key === 'stoleshnitsa_kuhnya' ? Object.assign({}, L_SHAPE, ISLAND, BAR) : {}));
    const { bounds } = SceneLayout.buildSceneLayout(model);
    const direction = CAMERA_PRESETS[model.cameraPreset].direction;
    [16 / 10, 4 / 3].forEach(aspect => {
      const fit = CameraFraming.fitCamera({ bounds, direction, fovDeg: 32, aspect, padding: 0.1 });
      assert.ok(CameraFraming.cornersInView({ bounds, position: fit.position, target: fit.target, fovDeg: 32, aspect }), key);
    });
  });
});

test('every product default camera preset exists', () => {
  Object.entries(PRODUCTS).forEach(([key, p]) => {
    if (p.cameraPreset) assert.ok(CAMERA_PRESETS[p.cameraPreset], key);
  });
});

test('edge is a geometry parameter only for products that support edge work (a leftover edge value never bevels a floor)', () => {
  assert.equal(modelFor('pol', { 'edge-round': { value: '2000' } }).edge.type, null);
  assert.equal(modelFor('podokonnik', { 'edge-round': { value: '2000' } }).edge.type, 'rounding');
});

test('integrated sink: the stone bowl carries the slab edge profile and thickness (so its cavity is flush with the opening)', () => {
  const layout = layoutFor('stoleshnitsa_kuhnya', { 'cut-sink-integrated': { value: '1' }, 'edge-type': { value: 'rounding' } });
  const main = named(layout, 'main')[0];
  const bowl = named(layout, 'sink')[0];
  assert.equal(bowl.kind, 'basin');
  assert.equal(bowl.role, 'stone');
  assert.equal(bowl.edge, 'rounding');
  assert.equal(bowl.slabThicknessM, main.y1 - main.y0);
});

// ---- product types: every type a client can pick draws differently ----------

// A coarse fingerprint of a layout: which parts (kind/role/name), how many
// seams, and the rounded extent of the product itself.
function fingerprint(layout) {
  const parts = layout.parts.map(p => p.kind + ':' + p.role + ':' + (p.name || '') + (p.kind === 'seams' ? ':' + p.segments.length : '')).sort().join('|');
  const b = layout.bounds;
  return parts + '#' + (b ? b.min.concat(b.max).map(v => v.toFixed(2)).join(',') : 'none');
}

const TYPE_IDS = {
  podokonnik: ['SILL-01', 'SILL-02', 'SILL-03', 'SILL-04', 'SILL-05'],
  panno: ['PANEL-01', 'PANEL-02', 'PANEL-03', 'PANEL-04'],
  pol: ['FLOOR-01', 'FLOOR-02', 'FLOOR-03', 'FLOOR-04', 'FLOOR-05'],
  stena: ['WALL-01', 'WALL-02', 'WALL-03', 'WALL-04', 'WALL-05'],
  fasad: ['FACADE-01', 'FACADE-02', 'FACADE-03', 'FACADE-04', 'FACADE-05'],
  stupeni: ['STEP-01', 'STEP-02', 'STEP-03'],
  lestnitsa: ['STAIR-01', 'STAIR-03', 'STAIR-05', 'STAIR-07'],
};

test('every type of every product draws a different 3D scene (no two types share one model)', () => {
  const dims = { width: { value: '1200' }, length: { value: '3000' } };
  Object.entries(TYPE_IDS).forEach(([key, ids]) => {
    const prints = ids.map(id => fingerprint(layoutFor(key, Object.assign({ productSubcategory: { value: id } }, dims))));
    assert.equal(new Set(prints).size, ids.length, key + ': ' + ids.join(', '));
  });
});

test('countertop shapes: straight = one slab, Г = one wing, П = a wing at each end of the run', () => {
  const wingDims = { 'wing-width': { value: '600' }, 'wing-length': { value: '1400' } };
  const straight = layoutFor('stoleshnitsa_kuhnya', Object.assign({ productShape: { value: 'straight' } }, wingDims));
  const l = layoutFor('stoleshnitsa_kuhnya', Object.assign({ productShape: { value: 'lshape' } }, wingDims));
  const u = layoutFor('stoleshnitsa_kuhnya', Object.assign({ productShape: { value: 'ushape' } }, wingDims));
  assert.equal(named(straight, 'wing').length, 0);
  assert.equal(named(l, 'wing').length, 1);
  const uw = named(u, 'wing');
  assert.equal(uw.length, 2);
  const [a, b] = uw.map(w => extent(w.outline));
  assert.ok(a.z0 > 0 !== b.z0 > 0, 'the two wings sit at opposite ends of the run');
  assert.equal(modelFor('stoleshnitsa_kuhnya', Object.assign({ productShape: { value: 'ushape' } }, wingDims)).shape, 'ushape');
  // The camera frames the whole П.
  assert.ok(uw.every(w => contains(u.bounds, w)));
  assert.ok(u.bounds.max[0] - u.bounds.min[0] > straight.bounds.max[0] - straight.bounds.min[0]);
});

test('П-shape + island: the island stands clear of both wings', () => {
  const u = layoutFor('stoleshnitsa_kuhnya', Object.assign({ productShape: { value: 'ushape' }, 'wing-width': { value: '600' }, 'wing-length': { value: '1400' } }, ISLAND));
  const island = extent(named(u, 'island')[0].outline);
  named(u, 'wing').forEach(w => assert.ok(island.x0 > extent(w.outline).x1, 'island past the wing ends'));
});

test('windowsill types change the slab: corner turns, bays bulge out of the wall, figured has a shaped front', () => {
  const sill = id => named(layoutFor('podokonnik', { width: { value: '300' }, length: { value: '1500' }, productSubcategory: { value: id } }), 'main')[0];
  const straight = extent(sill('SILL-01').outline);
  const corner = extent(sill('SILL-02').outline);
  const bay = extent(sill('SILL-03').outline);
  const radius = sill('SILL-04');
  const figured = sill('SILL-05');
  assert.ok(corner.x1 > straight.x1 + 0.2, 'the corner sill runs along the second wall');
  assert.ok(bay.x0 < straight.x0 - 0.1, 'the bay sill reaches out into the bay');
  assert.ok(radius.outline.length > sill('SILL-03').outline.length + 5, 'the radius bay is a curve, not three facets');
  assert.ok(figured.outline.length > 8 && extent(figured.outline).x1 > straight.x1, 'the figured sill has a shaped, fuller front');
  ['SILL-02', 'SILL-03', 'SILL-04'].forEach(id => {
    const layout = layoutFor('podokonnik', { width: { value: '300' }, length: { value: '1500' }, productSubcategory: { value: id } });
    assert.ok(layout.parts.some(p => p.role === 'context-glass'), id + ': glazed along its window line');
  });
});

test('stair type and risers are independent: every shape with and without risers', () => {
  [['STAIR-01', 'STAIR-02'], ['STAIR-03', 'STAIR-04'], ['STAIR-05', 'STAIR-06'], ['STAIR-07', 'STAIR-08']].forEach(([off, on]) => {
    const dims = { width: { value: '1000' }, length: { value: '3000' } };
    const a = layoutFor('lestnitsa', Object.assign({ productSubcategory: { value: off } }, dims));
    const b = layoutFor('lestnitsa', Object.assign({ productSubcategory: { value: on } }, dims));
    assert.equal(named(a, 'riser').length, 0, off);
    assert.ok(named(b, 'riser').length > 0, on);
    assert.equal(named(a, 'tread').length, named(b, 'tread').length, 'the same flight either way');
  });
});

test('backlight is drawn as light, never framed as part of the product', () => {
  const panel = layoutFor('panno', { width: { value: '1200' }, length: { value: '2000' }, productSubcategory: { value: 'PANEL-04' } });
  assert.ok(panel.parts.some(p => p.role === 'light'));
  const plain = layoutFor('panno', { width: { value: '1200' }, length: { value: '2000' }, productSubcategory: { value: 'PANEL-01' } });
  assert.deepEqual(panel.bounds, plain.bounds);
});

// ---- «Количество ступеней»: the client's count is the only source ---------

test('steps: N entered -> N treads, for every step type, and the type change keeps N', () => {
  ['STEP-01', 'STEP-02', 'STEP-03'].forEach(type => {
    [1, 2, 4, 8, 10, 30].forEach(n => {
      const layout = layoutFor('stupeni', { width: { value: '300' }, length: { value: '1200' }, 'step-count': { value: String(n) }, productSubcategory: { value: type } });
      assert.equal(named(layout, 'tread').length, n, type + ' x ' + n);
    });
  });
  const winder = named(layoutFor('stupeni', { 'step-count': { value: '8' }, productSubcategory: { value: 'STEP-02' } }), 'tread');
  assert.ok(winder.every(t => t.outline.length === 4), 'winder treads stay wedges');
  const radius = named(layoutFor('stupeni', { 'step-count': { value: '8' }, productSubcategory: { value: 'STEP-03' } }), 'tread');
  assert.ok(radius.every(t => t.outline.length > 4), 'radius treads keep their arc');
});

test('stairs: N entered -> N treads for every flight shape (landing not counted), with or without risers', () => {
  ['STAIR-01', 'STAIR-02', 'STAIR-03', 'STAIR-05', 'STAIR-07', 'STAIR-08'].forEach(type => {
    [1, 5, 8, 12, 30].forEach(n => {
      const layout = layoutFor('lestnitsa', { width: { value: '1000' }, length: { value: '3600' }, 'step-count': { value: String(n) }, productSubcategory: { value: type } });
      assert.equal(named(layout, 'tread').length, n, type + ' x ' + n);
    });
  });
});

test('step count: invalid input never reaches the model -- the product default is used instead of a broken scene', () => {
  const { STEP_COUNT_DEFAULTS, STEP_COUNT_RANGE, isValidStepCount } = ConstructorState;
  assert.deepEqual(STEP_COUNT_RANGE, { min: 1, max: 30 });
  ['0', '-3', 'abc', '', '4.5', '31', '1e9', 'Infinity', 'NaN'].forEach(v => {
    assert.equal(named(layoutFor('stupeni', { 'step-count': { value: v } }), 'tread').length, STEP_COUNT_DEFAULTS.stupeni, JSON.stringify(v));
  });
  [1, 30].forEach(n => assert.ok(isValidStepCount(n)));
  [0, 31, 2.5, NaN, Infinity, -1].forEach(n => assert.equal(isValidStepCount(n), false, String(n)));
  // Other products never carry a step count.
  assert.equal(modelFor('pol', { 'step-count': { value: '8' } }).stairs, null);
});

test('step count: the camera fits the whole flight from 1 to 30 steps, and bounds grow with the count', () => {
  let previous = 0;
  [1, 2, 4, 8, 10, 12, 30].forEach(n => {
    const layout = layoutFor('stupeni', { width: { value: '300' }, length: { value: '1200' }, 'step-count': { value: String(n) } });
    layout.parts.forEach(p => assert.ok(contains(layout.bounds, p), 'part outside the framed bounds at ' + n));
    const direction = CAMERA_PRESETS['iso-side-high'].direction;
    const fit = CameraFraming.fitCamera({ bounds: layout.bounds, direction, fovDeg: 40, aspect: 1.4, padding: 0.1 });
    assert.ok(CameraFraming.cornersInView({ bounds: layout.bounds, position: fit.position, target: fit.target, fovDeg: 40, aspect: 1.4 }), 'in view at ' + n);
    const height = layout.bounds.max[1] - layout.bounds.min[1];
    assert.ok(height > previous, 'the flight grows with the count');
    previous = height;
  });
});

// ---- размеры «Ступеней» и «Лестниц»: client sizes -> the drawn treads -------

function stoneExtent(parts) {
  return extent([].concat(...parts.map(p => p.outline)));
}

test('«Ступени»: длина x глубина of ONE step, N times -- 1200 x 300 x 8 is eight 1200 x 300 treads (every type)', () => {
  const dims = { length: { value: '1200' }, width: { value: '300' }, 'step-count': { value: '8' } };
  const straight = named(layoutFor('stupeni', Object.assign({ productSubcategory: { value: 'STEP-01' } }, dims)), 'tread');
  assert.equal(straight.length, 8);
  straight.forEach(t => {
    const e = extent(t.outline);
    assert.ok(Math.abs((e.z1 - e.z0) - 1.2) < 1e-9, 'length across');
    assert.ok(Math.abs((e.x1 - e.x0) - 0.3) < 1e-9, 'depth front to back');
  });
  const radius = named(layoutFor('stupeni', Object.assign({ productSubcategory: { value: 'STEP-03' } }, dims)), 'tread');
  assert.equal(radius.length, 8);
  radius.forEach(t => assert.ok(Math.abs((extent(t.outline).z1 - extent(t.outline).z0) - 1.2) < 1e-9));
  const winderModel = modelFor('stupeni', Object.assign({ productSubcategory: { value: 'STEP-02' } }, dims));
  assert.ok(Math.abs((winderModel.stairs.plan.rOut - winderModel.stairs.plan.rIn) - 1.2) < 1e-9, 'a winder step is 1200 long from the pivot out');
  assert.equal(named(SceneLayout.buildSceneLayout(winderModel), 'tread').length, 8);
});

test('«Лестницы» прямая: длина x ширина of the whole stair, N steps -> tread depth = length / N', () => {
  const layout = layoutFor('lestnitsa', { length: { value: '3000' }, width: { value: '1000' }, 'step-count': { value: '10' }, productSubcategory: { value: 'STAIR-01' } });
  const treads = named(layout, 'tread');
  assert.equal(treads.length, 10);
  treads.forEach(t => {
    const e = extent(t.outline);
    assert.ok(Math.abs((e.x1 - e.x0) - 0.3) < 1e-9, 'depth 300');
    assert.ok(Math.abs((e.z1 - e.z0) - 1.0) < 1e-9, 'width 1000');
  });
  const all = stoneExtent(treads);
  assert.ok(Math.abs((all.x1 - all.x0) - 3) < 1e-9, 'the whole run is the entered length');
  const other = layoutFor('lestnitsa', { length: { value: '2000' }, width: { value: '800' }, 'step-count': { value: '8' }, productSubcategory: { value: 'STAIR-01' } });
  assert.equal(named(other, 'tread').length, 8);
  assert.ok(Math.abs(extent(named(other, 'tread')[0].outline).x1 - extent(named(other, 'tread')[0].outline).x0 - 0.25) < 1e-9);
});

test('«Лестницы» Г/П: the length includes the landing (not a step); П\'s second flight comes back to the start', () => {
  const dims = { length: { value: '3000' }, width: { value: '1000' }, 'step-count': { value: '10' } };
  ['STAIR-03', 'STAIR-05'].forEach(type => {
    const layout = layoutFor('lestnitsa', Object.assign({ productSubcategory: { value: type } }, dims));
    const treads = named(layout, 'tread'), landing = named(layout, 'landing');
    assert.equal(treads.length, 10, type + ': the landing is not counted');
    assert.equal(landing.length, 1);
    const along = stoneExtent(treads.concat(landing));
    assert.ok(Math.abs((along.x1 - along.x0) - 3) < 1e-9, type + ': 3000 along the first flight, landing included');
    const landingE = extent(landing[0].outline);
    assert.ok(Math.abs((landingE.x1 - landingE.x0) - 1) < 1e-9, type + ': the landing is one flight width deep');
  });
  const u = layoutFor('lestnitsa', Object.assign({ productSubcategory: { value: 'STAIR-05' } }, dims));
  const back = named(u, 'tread').slice(5);
  assert.ok(Math.abs(stoneExtent(back).x1 - 0) < 1e-9, 'the return flight ends where the first one started');
});

test('«Лестницы» винтовая: диаметр and ширина ступени both shape the stair', () => {
  const at = (d, w) => layoutFor('lestnitsa', { length: { value: String(d) }, width: { value: String(w) }, 'step-count': { value: '12' }, productSubcategory: { value: 'STAIR-07' } });
  const small = at(1600, 600), large = at(2400, 600), wide = at(2400, 1000);
  const radius = l => { const e = stoneExtent(named(l, 'tread')); return Math.max(Math.abs(e.x0), Math.abs(e.x1), Math.abs(e.z0), Math.abs(e.z1)); };
  assert.ok(radius(large) > radius(small), 'a larger diameter makes a larger stair');
  assert.ok(radius(large) <= 1.2 + 1e-9, 'within the entered diameter');
  const post = l => extent(named(l, 'column')[0].outline);
  assert.ok(post(wide).x1 - post(wide).x0 < post(large).x1 - post(large).x0, 'wider steps leave a thinner centre post');
});
