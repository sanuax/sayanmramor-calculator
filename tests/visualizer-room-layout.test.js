// tests/visualizer-room-layout.test.js
//
// The room around the product for «День» / «Вечер» (visualizer/room-layout.js):
// cabinets under the kitchen top with their fronts toward the kitchen, a
// wall-hung vanity with drawers and a mirror in the bathroom, a wall along a
// stair; never inside the stone, never for a product shown as it is.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createFakeDoc } = require('./helpers/fake-dom.js');
const ConstructorState = require('../constructor-state.js');
const ProductTypes = require('../product-types.js');
const GeometryModel = require('../visualizer/geometry-model.js');
const SceneLayout = require('../visualizer/scene-layout.js');
const RoomLayout = require('../visualizer/room-layout.js');

function layoutFor(productKey, values) {
  const doc = createFakeDoc(Object.assign({ width: { value: '650' }, length: { value: '2400' } }, values));
  const state = ConstructorState.readConstructorState({ doc, selectedProductKey: productKey, product: ProductTypes.PRODUCTS[productKey], stone: null, hasAdditionalWork: ProductTypes.hasAdditionalWork });
  return SceneLayout.buildSceneLayout(GeometryModel.buildGeometryModel(state));
}

const byRole = (room, role) => room.boxes.filter(b => b.role === role);
const overlaps = (a, b) => [0, 1, 2].every(i => a.min[i] < b.max[i] - 1e-9 && b.min[i] < a.max[i] - 1e-9);

function stoneBoxes(layout) {
  return layout.parts.filter(p => p.role === 'stone' && p.kind === 'prism').map(p => {
    const xs = p.outline.map(q => q[0]), zs = p.outline.map(q => q[1]);
    return { min: [Math.min(...xs), p.y0, Math.min(...zs)], max: [Math.max(...xs), p.y1, Math.max(...zs)] };
  });
}

test('modes and facade colours: studio first; five named matte colours', () => {
  assert.deepEqual(RoomLayout.MODES, ['studio', 'day', 'evening']);
  assert.equal(RoomLayout.FACADES.length, 5);
  RoomLayout.FACADES.forEach(f => assert.match(f.hex, /^#[0-9a-f]{6}$/));
  // «Студия» is the studio light exactly as it was.
  assert.deepEqual(RoomLayout.LIGHTS.studio.key, ['#ffefd9', 1.5]);
  assert.equal(RoomLayout.LIGHTS.studio.bounce, null);
});

test('kitchen: cabinets on a plinth under the top, fronts set back under it, the top 900 mm from the floor', () => {
  const layout = layoutFor('stoleshnitsa_kuhnya', {});
  const room = RoomLayout.buildRoom(layout, 'stoleshnitsa_kuhnya');
  assert.ok(room.hasFacades);
  const main = layout.parts.find(p => p.name === 'main');
  assert.ok(Math.abs(main.y1 - room.floorY - 0.9) < 1e-9);
  const fronts = byRole(room, 'front');
  assert.equal(fronts.length, 4, '2.4 m in four 600 mm fronts');
  fronts.forEach(f => {
    assert.ok(f.max[0] < 0.325, 'under the top, not past its edge');
    assert.ok(f.max[1] <= main.y0 + 1e-9, 'below the stone');
  });
  stoneBoxes(layout).forEach(s => room.boxes.forEach(b => assert.ok(!overlaps(s, b), b.role + ' inside the stone')));
  assert.equal(byRole(room, 'wall').length, 1);
  assert.ok(byRole(room, 'wall')[0].max[0] <= layout.bounds.min[0] + 1e-9, 'the wall behind the product');
});

test('kitchen with a wing: the wing has its own cabinets, fronts toward the kitchen, none inside the stone', () => {
  const layout = layoutFor('stoleshnitsa_kuhnya', { productShape: { value: 'lshape' }, 'wing-width': { value: '600' }, 'wing-length': { value: '1500' } });
  const room = RoomLayout.buildRoom(layout, 'stoleshnitsa_kuhnya');
  const wing = layout.parts.find(p => p.name === 'wing');
  const wz0 = Math.min(...wing.outline.map(q => q[1]));
  const wingFronts = byRole(room, 'front').filter(f => f.min[0] > 0.325);
  assert.ok(wingFronts.length >= 2, 'fronts under the wing');
  wingFronts.forEach(f => assert.ok(f.min[2] < wz0 + 0.06, 'on the side facing the kitchen'));
  // The main run's fronts stop where the wing begins.
  byRole(room, 'front').filter(f => f.max[0] <= 0.325).forEach(f => assert.ok(f.max[2] <= wz0 + 1e-9));
  stoneBoxes(layout).forEach(s => room.boxes.forEach(b => assert.ok(!overlaps(s, b), b.role + ' inside the stone')));
});

test('bathroom: a wall-hung vanity with two drawers per module, the floor showing beneath, a mirror above the top', () => {
  const layout = layoutFor('stoleshnitsa_vannaya', { width: { value: '550' }, length: { value: '1200' }, 'cut-sink-integrated': { value: '1' } });
  const room = RoomLayout.buildRoom(layout, 'stoleshnitsa_vannaya');
  const main = layout.parts.find(p => p.name === 'main');
  const carcass = byRole(room, 'carcass')[0];
  assert.ok(carcass.min[1] > room.floorY + 0.2, 'hangs on the wall');
  assert.equal(byRole(room, 'plinth').length, 0);
  assert.equal(byRole(room, 'front').length, 4, 'two modules, two drawers each');
  const mirror = byRole(room, 'mirror')[0];
  assert.ok(mirror.min[1] > main.y1, 'above the top');
  assert.ok(byRole(room, 'glow').length === 1 && room.lamps[0].kind === 'mirror');
  // The integrated bowl hangs inside the vanity.
  const bowl = layout.parts.find(p => p.name === 'sink');
  assert.ok(bowl.center[1] - bowl.size[1] >= carcass.min[1], 'the bowl fits inside');
});

test('stairs: a wall along the flight and the floor; a sill and a floor are shown as they are', () => {
  const layout = layoutFor('lestnitsa', { width: { value: '1000' }, length: { value: '3000' }, 'step-count': { value: '6' } });
  const room = RoomLayout.buildRoom(layout, 'lestnitsa');
  assert.equal(room.hasFacades, false);
  assert.ok(byRole(room, 'wall')[0].max[2] <= layout.bounds.min[2] + 1e-9);
  assert.equal(RoomLayout.buildRoom(layoutFor('podokonnik', { width: { value: '300' }, length: { value: '1500' } }), 'podokonnik'), null);
  assert.equal(RoomLayout.buildRoom(layoutFor('pol', {}), 'pol'), null);
  assert.equal(RoomLayout.lampsFor(layoutFor('pol', {}), 'pol').length, 1, 'one lamp above it in the evening');
});

test('a cabinet under a sink is hollow: no body where the bowl hangs, side panels close its ends', () => {
  ['stoleshnitsa_vannaya', 'stoleshnitsa_kuhnya'].forEach(key => {
    ['cut-sink-integrated', 'cut-sink-undermount', 'cut-sink-overlay'].forEach(cut => {
      const layout = layoutFor(key, { width: { value: '600' }, length: { value: '1500' }, [cut]: { value: '1' } });
      const room = RoomLayout.buildRoom(layout, key);
      const bowl = layout.parts.find(p => p.kind === 'basin');
      const bowlBox = { min: [bowl.center[0] - bowl.size[0] / 2, bowl.center[1] - bowl.size[1], bowl.center[2] - bowl.size[2] / 2],
        max: [bowl.center[0] + bowl.size[0] / 2, bowl.center[1], bowl.center[2] + bowl.size[2] / 2] };
      byRole(room, 'carcass').forEach(c => assert.ok(!overlaps(c, bowlBox), key + ' ' + cut + ': the body clears the bowl'));
      assert.ok(byRole(room, 'carcass').length >= 3, key + ' ' + cut + ': side panels');
    });
  });
});
