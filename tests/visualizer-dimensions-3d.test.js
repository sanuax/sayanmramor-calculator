// tests/visualizer-dimensions-3d.test.js
//
// «Размеры» in 3D (visualizer/dimensions-3d.js): every size the client
// entered -- every product, every type of it, every additional work with
// sizes -- has its dimension, each drawn on geometry of exactly that size
// (a curve along its curve), lifted off the product, worded as on the size
// diagram; nothing the model only assumes; nothing for placeholder sizes.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createFakeDoc } = require('./helpers/fake-dom.js');
const ConstructorState = require('../constructor-state.js');
const ProductTypes = require('../product-types.js');
const GeometryModel = require('../visualizer/geometry-model.js');
const SceneLayout = require('../visualizer/scene-layout.js');
const Dimensions3d = require('../visualizer/dimensions-3d.js');

const v = value => ({ value: String(value) });
function dimsFor(productKey, values) {
  const doc = createFakeDoc(values);
  const state = ConstructorState.readConstructorState({ doc, selectedProductKey: productKey, product: ProductTypes.PRODUCTS[productKey], stone: null, hasAdditionalWork: ProductTypes.hasAdditionalWork });
  const model = GeometryModel.buildGeometryModel(state);
  return Dimensions3d.build(model, SceneLayout.buildSceneLayout(model));
}

const K = { width: v(650), length: v(2400) };
const SILL = { width: v(300), length: v(1500), 'sill-arm-length': v(900), 'sill-bay-depth': v(400), 'sill-bay-front': v(800) };
const STEPS = { width: v(350), length: v(1200), 'stupeni-riser': { checked: true }, 'riser-height': v(160) };
const STAIR = { width: v(1000), length: v(3000), 'step-count': v(6), 'riser-height': v(160) };
const FACADE = {
  'facade-length': v(6000), 'facade-height': v(2800), 'facade-width': v(500), 'facade-radius': v(250), 'facade-side': v(400),
  'facade-projection': v(120), 'facade-opening-width': v(1200), 'facade-opening-height': v(1500), 'facade-frame': v(150), 'facade-quantity': v(2),
};
const FIRE = {
  'fireplace-opening-width': v(900), 'fireplace-opening-height': v(700), 'fireplace-pier-width': v(250), 'fireplace-lintel-height': v(250),
  'fireplace-depth': v(200), 'fireplace-shelf-projection': v(60), 'fireplace-cladding-width': v(1400), 'fireplace-cladding-height': v(2000),
  'fireplace-firebox-width': v(700), 'fireplace-firebox-height': v(600), 'fireplace-firebox-bottom': v(400), 'fireplace-length': v(1600), 'fireplace-height': v(150),
};
const type = (id, extra) => Object.assign({ productSubcategory: v(id) }, extra || {});

// [what, product, entered values, every field that must have a dimension]
const CASES = [
  ['kitchen', 'stoleshnitsa_kuhnya', K, ['length', 'width']],
  ['kitchen Г', 'stoleshnitsa_kuhnya', Object.assign({ productShape: v('lshape'), 'wing-width': v(600), 'wing-length': v(1500) }, K), ['length', 'width', 'wing-length', 'wing-width']],
  ['kitchen П', 'stoleshnitsa_kuhnya', Object.assign({ productShape: v('ushape'), 'wing-width': v(600), 'wing-length': v(1500) }, K), ['length', 'width', 'wing-length', 'wing-width', 'wing-length', 'wing-width']],
  ['kitchen, every work with sizes', 'stoleshnitsa_kuhnya', Object.assign({
    'extra-bortik': v(2000), 'extra-fartuk-length': v(2400), 'extra-fartuk-width': v(600), 'extra-wallpanel-length': v(2000), 'extra-wallpanel-width': v(900),
    'extra-ostrov-width': v(900), 'extra-ostrov-length': v(1800), 'extra-bar-standard-width': v(1200), 'extra-bar-standard-length': v(500),
  }, K), ['length', 'width', 'extra-bortik', 'extra-fartuk-length', 'extra-fartuk-width', 'extra-wallpanel-length', 'extra-wallpanel-width',
    'extra-ostrov-width', 'extra-ostrov-length', 'extra-bar-standard-width', 'extra-bar-standard-length']],
  ['kitchen, figured island, complex bar', 'stoleshnitsa_kuhnya', Object.assign({
    'extra-ostrov-figured-width': v(1000), 'extra-ostrov-figured-length': v(2000), 'extra-bar-complex-width': v(500), 'extra-bar-complex-length': v(1400),
  }, K), ['length', 'width', 'extra-ostrov-figured-width', 'extra-ostrov-figured-length', 'extra-bar-complex-width', 'extra-bar-complex-length']],
  ['bathroom', 'stoleshnitsa_vannaya', { width: v(550), length: v(1200) }, ['length', 'width']],
  ['sill', 'podokonnik', SILL, ['length', 'width']],
  ['sill, corner', 'podokonnik', type('SILL-02', SILL), ['length', 'width', 'sill-arm-length']],
  ['sill, bay', 'podokonnik', type('SILL-03', SILL), ['length', 'width', 'sill-bay-depth', 'sill-bay-front']],
  ['sill, radius bay', 'podokonnik', type('SILL-04', SILL), ['length', 'width', 'sill-bay-depth']],
  ['sill, figured', 'podokonnik', type('SILL-05', SILL), ['length', 'width']],
  ['floor', 'pol', { width: v(3000), length: v(4000) }, ['length', 'width']],
  ['wall', 'stena', { width: v(1200), length: v(2400) }, ['length', 'width']],
  ['wall, radius', 'stena', type('WALL-04', { width: v(3000), length: v(2700), 'wall-radius': v(4000) }), ['length', 'width', 'wall-radius']],
  ['panno', 'panno', { width: v(1200), length: v(2400) }, ['length', 'width']],
  ['panno, framed', 'panno', type('PANEL-02', { width: v(1200), length: v(2400) }), ['length', 'width']],
  ['steps with risers', 'stupeni', type('STEP-01', STEPS), ['length', 'width', 'riser-height']],
  ['steps, other type', 'stupeni', type('STEP-02', STEPS), ['length', 'width', 'riser-height']],
  ['steps, third type', 'stupeni', type('STEP-03', STEPS), ['length', 'width', 'riser-height']],
  ...['STAIR-01', 'STAIR-02', 'STAIR-03', 'STAIR-04', 'STAIR-05', 'STAIR-06'].map(id => [
    'stair ' + id, 'lestnitsa', type(id, STAIR),
    ['width', 'length'].concat(GeometryModel.STAIR_WITH_RISERS.includes(id) ? ['riser-height'] : []),
  ]),
  ['stair, spiral', 'lestnitsa', type('STAIR-07', STAIR), ['length', 'width']],
  ['facade wall', 'fasad', type('FACADE-01', FACADE), ['facade-length', 'facade-height']],
  ['plinth', 'fasad', type('FACADE-04', FACADE), ['facade-length', 'facade-height']],
  ['window surround', 'fasad', type('FACADE-02', Object.assign({ 'facade-form': v('window') }, FACADE)), ['facade-opening-width', 'facade-opening-height', 'facade-frame']],
  ['door surround', 'fasad', type('FACADE-02', Object.assign({ 'facade-form': v('door') }, FACADE)), ['facade-opening-width', 'facade-opening-height', 'facade-frame']],
  ['round column', 'fasad', type('FACADE-03', Object.assign({ 'facade-form': v('round') }, FACADE)), ['facade-radius', 'facade-height']],
  ['square column', 'fasad', type('FACADE-03', Object.assign({ 'facade-form': v('square') }, FACADE)), ['facade-side', 'facade-height']],
  ['pilaster', 'fasad', type('FACADE-06', FACADE), ['facade-width', 'facade-projection', 'facade-height']],
  ['cornice', 'fasad', type('FACADE-07', FACADE), ['facade-length', 'facade-height', 'facade-projection']],
  ['belt', 'fasad', type('FACADE-08', FACADE), ['facade-length', 'facade-height', 'facade-projection']],
  ['decor', 'fasad', type('FACADE-05', FACADE), ['facade-width', 'facade-height']],
  ['portal with a shelf', 'kaminy', type('FIREPLACE-01', Object.assign({ 'fireplace-form': v('with-shelf') }, FIRE)),
    ['fireplace-opening-width', 'fireplace-opening-height', 'fireplace-pier-width', 'fireplace-lintel-height', 'fireplace-depth', 'fireplace-shelf-projection']],
  ['portal without a shelf', 'kaminy', type('FIREPLACE-01', Object.assign({ 'fireplace-form': v('without-shelf') }, FIRE)),
    ['fireplace-opening-width', 'fireplace-opening-height', 'fireplace-pier-width', 'fireplace-lintel-height', 'fireplace-depth']],
  ['cladding', 'kaminy', type('FIREPLACE-02', FIRE),
    ['fireplace-cladding-width', 'fireplace-cladding-height', 'fireplace-depth', 'fireplace-firebox-width', 'fireplace-firebox-height', 'fireplace-firebox-bottom']],
  ['podium', 'kaminy', type('FIREPLACE-03', FIRE), ['fireplace-length', 'fireplace-height', 'fireplace-depth']],
];

test('every entered size of every product, type and additional work has its dimension', () => {
  CASES.forEach(([what, productKey, values, fields]) => {
    const dims = dimsFor(productKey, values);
    assert.deepEqual(dims.map(d => d.field).sort(), fields.slice().sort(), what);
  });
});

test('each dimension is drawn on geometry of exactly its size, lifted off the product, worded as on the size diagram', () => {
  CASES.forEach(([what, productKey, values]) => {
    dimsFor(productKey, values).forEach(d => {
      const label = what + ' ' + d.field;
      assert.ok(Math.abs(Dimensions3d.pathLength(d.measured) * 1000 - d.valueMm) < 0.6, label + ': measured on geometry of that size');
      assert.ok(Math.abs(Dimensions3d.pathLength(d.line) * 1000 - d.valueMm) < 0.6 || d.measured.length > 2, label + ': the line as long');
      assert.match(d.label, /^(R |⌀ )?\d+ мм$/, label);
      assert.equal(Number(d.label.replace(/\D/g, '')), d.valueMm, label);
      const entered = values[d.field] && Number(values[d.field].value);
      if (entered) assert.equal(d.valueMm, entered, label + ': the entered value');
    });
  });
});

test('nothing the model only assumes, nothing for placeholder sizes, nothing drawn shorter than entered', () => {
  dimsFor('stoleshnitsa_kuhnya', Object.assign({ 'extra-bortik': v(2000) }, K)).forEach(d => assert.notEqual(d.valueMm, 40, 'the thickness is assumed'));
  assert.equal(dimsFor('kaminy', type('FIREPLACE-01')).length, 0, 'a fireplace before its sizes are in');
  assert.equal(dimsFor('fasad', type('FACADE-01')).length, 0, 'a facade before its sizes are in');
  // A backsplash entered longer than the run it is drawn along: drawn cut, so no length.
  const long = dimsFor('stoleshnitsa_kuhnya', Object.assign({ 'extra-fartuk-length': v(4000), 'extra-fartuk-width': v(600) }, K));
  assert.ok(!long.some(d => d.field === 'extra-fartuk-length'));
  assert.ok(long.some(d => d.field === 'extra-fartuk-width'));
});

test('with risers entered, the 3D draws them at that height', () => {
  const doc = createFakeDoc(type('STEP-01', STEPS));
  const state = ConstructorState.readConstructorState({ doc, selectedProductKey: 'stupeni', product: ProductTypes.PRODUCTS.stupeni, stone: null, hasAdditionalWork: ProductTypes.hasAdditionalWork });
  const layout = SceneLayout.buildSceneLayout(GeometryModel.buildGeometryModel(state));
  layout.parts.filter(p => p.name === 'riser').forEach(r => assert.ok(Math.abs(r.y1 - r.y0 - 0.16) < 1e-9));
});
