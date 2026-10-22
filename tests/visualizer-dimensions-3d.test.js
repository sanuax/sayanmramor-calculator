// tests/visualizer-dimensions-3d.test.js
//
// «Размеры» in 3D (visualizer/dimensions-3d.js): only the sizes the client
// entered, each drawn on geometry of exactly that size, lifted off the
// product, worded as on the size diagram; none where the drawing does not
// map plainly to the entered sizes.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createFakeDoc } = require('./helpers/fake-dom.js');
const ConstructorState = require('../constructor-state.js');
const ProductTypes = require('../product-types.js');
const GeometryModel = require('../visualizer/geometry-model.js');
const SceneLayout = require('../visualizer/scene-layout.js');
const Dimensions3d = require('../visualizer/dimensions-3d.js');

function dimsFor(productKey, values) {
  const doc = createFakeDoc(values);
  const state = ConstructorState.readConstructorState({ doc, selectedProductKey: productKey, product: ProductTypes.PRODUCTS[productKey], stone: null, hasAdditionalWork: ProductTypes.hasAdditionalWork });
  const model = GeometryModel.buildGeometryModel(state);
  return { dims: Dimensions3d.build(model, SceneLayout.buildSceneLayout(model)), model };
}

const length = ([a, b]) => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);

function assertTrue(dims, labels) {
  assert.deepEqual(dims.map(d => d.label), labels);
  dims.forEach(d => {
    assert.ok(Math.abs(length(d.measured) * 1000 - d.valueMm) < 0.5, d.label + ': drawn on geometry of that size');
    assert.ok(Math.abs(length(d.line) * 1000 - d.valueMm) < 0.5, d.label + ': the dimension line as long');
    const off = [0, 1, 2].map(i => d.line[0][i] - d.measured[0][i]);
    assert.ok(Math.abs(Math.hypot(...off) - Dimensions3d.GAP_M) < 1e-9, d.label + ': lifted off the edge');
  });
}

test('kitchen top: its run along the room side, its depth across a free end', () => {
  assertTrue(dimsFor('stoleshnitsa_kuhnya', { width: { value: '650' }, length: { value: '2400' } }).dims, ['2400 мм', '650 мм']);
});

test('an L kitchen: the wing\'s length along its front and its width across its end too', () => {
  const sizes = { width: { value: '650' }, length: { value: '2400' }, productShape: { value: 'lshape' }, 'wing-width': { value: '600' }, 'wing-length': { value: '1500' } };
  assertTrue(dimsFor('stoleshnitsa_kuhnya', sizes).dims, ['2400 мм', '650 мм', '1500 мм', '600 мм']);
});

test('bathroom top, straight sill, floor, wall, panno, steps, a straight stair: the sizes entered', () => {
  assertTrue(dimsFor('stoleshnitsa_vannaya', { width: { value: '550' }, length: { value: '1200' } }).dims, ['1200 мм', '550 мм']);
  assertTrue(dimsFor('podokonnik', { width: { value: '300' }, length: { value: '1500' } }).dims, ['1500 мм', '300 мм']);
  assertTrue(dimsFor('pol', { width: { value: '3000' }, length: { value: '4000' } }).dims, ['4000 мм', '3000 мм']);
  assertTrue(dimsFor('stena', { width: { value: '1200' }, length: { value: '2400' } }).dims, ['2400 мм', '1200 мм']);
  assertTrue(dimsFor('panno', { width: { value: '1200' }, length: { value: '2400' } }).dims, ['1200 мм', '2400 мм']);
  assertTrue(dimsFor('stupeni', { width: { value: '350' }, length: { value: '1200' } }).dims, ['1200 мм', '350 мм']);
  assertTrue(dimsFor('lestnitsa', { width: { value: '1000' }, length: { value: '3000' }, 'step-count': { value: '6' } }).dims, ['1000 мм', '3000 мм']);
});

test('nothing the model only assumes: no thickness, no rise; no sizes where the drawing is not a plain rectangle', () => {
  const { dims } = dimsFor('stoleshnitsa_kuhnya', { width: { value: '650' }, length: { value: '2400' } });
  dims.forEach(d => assert.ok(d.valueMm !== 40, 'the thickness is a visual assumption'));
  assert.equal(dimsFor('kaminy', {}).dims.length, 0);
  assert.equal(dimsFor('podokonnik', { width: { value: '300' }, length: { value: '1500' }, productSubcategory: { value: 'SILL-03' } }).dims.length, 0, 'a bay sill');
});
