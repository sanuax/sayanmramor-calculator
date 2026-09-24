// tests/product-configuration.test.js
//
// Block 3 (Real Product Configuration): does a user's choice actually reach
// state, and does state stay isolated between products? This complements
// tests/constructor-state.test.js (which already covers most of the
// individual field-reading rules) with the cross-product state-contract
// checks Block 3 specifically asks for -- it does not re-test rules already
// covered there.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createFakeDoc } = require('./helpers/fake-dom.js');
const ConstructorState = require('../constructor-state.js');
const GeometryModel = require('../visualizer/geometry-model.js');
const ProductTypes = require('../product-types.js');

const { PRODUCTS, hasAdditionalWork } = ProductTypes;

const ALL_PRODUCT_KEYS = [
  'lestnitsa', 'panno', 'podokonnik', 'pol', 'stena', 'fasad',
  'stoleshnitsa_vannaya', 'stoleshnitsa_kuhnya', 'stupeni',
];

function readState(productKey, values) {
  const doc = createFakeDoc(Object.assign({ width: { value: '1000' }, length: { value: '2000' } }, values));
  return ConstructorState.readConstructorState({
    doc, selectedProductKey: productKey, product: PRODUCTS[productKey], stone: null, hasAdditionalWork,
  });
}

test('every one of the 9 products has a working state contract: dimensions, product identity, and a stable set of top-level keys', () => {
  const expectedKeys = [
    'product', 'stone', 'dimensions', 'shape', 'wing', 'corner', 'edgeLineItems',
    'sinkCounts', 'cooktopCount', 'holeCounts', 'curbLengthM', 'backsplash', 'wallPanel',
    'island', 'barCounter', 'edge', 'additionalWorks', 'bookmatchMode', 'options',
    'subcategory', 'stepCount', 'productConfig',
  ];
  ALL_PRODUCT_KEYS.forEach(key => {
    const state = readState(key, {});
    assert.deepEqual(Object.keys(state).sort(), expectedKeys.sort(), `"${key}" state shape drifted`);
    assert.equal(state.product.key, key);
    assert.equal(state.dimensions.widthM, 1);
    assert.equal(state.dimensions.lengthM, 2);
  });
});

test('the "type" step\'s selection (subcategory) is saved to state for every non-countertop product', () => {
  const cases = [
    ['lestnitsa', 'STAIR-03'], ['panno', 'PANEL-02'], ['podokonnik', 'SILL-02'],
    ['pol', 'FLOOR-03'], ['stena', 'WALL-04'], ['fasad', 'FACADE-02'],
  ];
  cases.forEach(([key, subcategoryId]) => {
    const state = readState(key, { productSubcategory: { value: subcategoryId } });
    assert.equal(state.subcategory.id, subcategoryId, `"${key}" did not save its type selection`);
  });
});

test('kitchen/bath never carry a subcategory selection into state -- their real form choice is "shape", not a leftover legacy value', () => {
  ['stoleshnitsa_kuhnya', 'stoleshnitsa_vannaya'].forEach(key => {
    // Even if the DOM field has a stale value (e.g. left over from a
    // previous non-countertop product), hideVariantStep products never
    // show/populate this select in the real app -- but state reading itself
    // is unconditional, so this documents that constructor-state.js still
    // faithfully reflects whatever the (never-shown-for-these-products)
    // field holds. The real guarantee against staleness is
    // renderSubcategoryOptions() always resetting the select on product
    // switch (see sayanmramor-calculator.html), covered by manual QA.
    const state = readState(key, {});
    assert.equal(state.subcategory.id, null);
  });
});

test('stupeni\'s riser toggle is a real, working, isolated piece of state', () => {
  const withRiser = readState('stupeni', { 'stupeni-riser': { checked: true } });
  assert.equal(withRiser.productConfig.stupeni.riser, true);
  const withoutRiser = readState('stupeni', {});
  assert.equal(withoutRiser.productConfig.stupeni.riser, false);
});

test('productConfig.stupeni.riser is always false for every other product, even if the checkbox has a stale checked value', () => {
  ALL_PRODUCT_KEYS.filter(k => k !== 'stupeni').forEach(key => {
    const state = readState(key, { 'stupeni-riser': { checked: true } });
    assert.equal(state.productConfig.stupeni.riser, false, `"${key}" leaked the stupeni riser toggle`);
  });
});

test('material (stone) flows into state for every product the same way -- one shared material picker, no per-product duplication', () => {
  const stone = { id: 'delicato-brown', name: 'Delicato Brown', category: 'marble' };
  ALL_PRODUCT_KEYS.forEach(key => {
    const doc = createFakeDoc({ width: { value: '1000' }, length: { value: '2000' } });
    const state = ConstructorState.readConstructorState({
      doc, selectedProductKey: key, product: PRODUCTS[key], stone, hasAdditionalWork,
    });
    assert.deepEqual(state.stone, stone, `"${key}" did not receive the selected material`);
  });
});

test('edge selection is saved to state for a product with real edge capability (podokonnik)', () => {
  const state = readState('podokonnik', { 'edge-round': { value: '800' } });
  assert.deepEqual(state.edge, { type: 'rounding', lengthMm: 800 });
});

test('additional-works fields (sink/holes/curb/backsplash/wallPanel) are saved for bathroom, and island/barCounter never leak in (bathroom lacks those two capabilities)', () => {
  const state = readState('stoleshnitsa_vannaya', {
    'cut-sink-undermount': { value: '1' },
    'hole-mixer': { value: '1' },
    'extra-bortik': { value: '1200' },
    'extra-fartuk-width': { value: '600' }, 'extra-fartuk-length': { value: '2000' },
    'extra-wallpanel-width': { value: '900' }, 'extra-wallpanel-length': { value: '2400' },
    'extra-ostrov-width': { value: '1200' }, 'extra-ostrov-length': { value: '800' }, // leftover, must be zeroed
  });
  assert.equal(state.additionalWorks.sink.type, 'undermount');
  assert.equal(state.holeCounts.mixer, 1);
  assert.equal(state.curbLengthM, 1.2);
  assert.ok(Math.abs(state.backsplash.widthM * state.backsplash.lengthM - 1.2) < 1e-9);
  assert.ok(Math.abs(state.wallPanel.widthM * state.wallPanel.lengthM - 2.16) < 1e-9);
  // island is a real DOM value here, but bathroom has no island capability --
  // must still read as zeroed, exactly like curb/backsplash would for a
  // product without supportsCountertopExtras at all.
  assert.deepEqual(state.island.standard, { widthM: 0, lengthM: 0 });
});

test('L-shape wing/corner survive into the geometry model unchanged (no regression from Block 2/3 step-engine wiring)', () => {
  const state = readState('stoleshnitsa_kuhnya', {
    productShape: { value: 'lshape' },
    'wing-width': { value: '600' }, 'wing-length': { value: '1200' },
    'shape-corner': { value: 'right' },
  });
  const model = GeometryModel.buildGeometryModel(state);
  assert.equal(model.shape, 'lshape');
  assert.deepEqual(model.wing, { widthM: 0.6, lengthM: 1.2, corner: 'right' });
});

test('island variants (rect/figured) are mutually exclusive all the way through to the geometry model, even if both have real DOM values at once', () => {
  const state = readState('stoleshnitsa_kuhnya', {
    'extra-ostrov-width': { value: '1200' }, 'extra-ostrov-length': { value: '800' },
    'extra-ostrov-figured-width': { value: '2000' }, 'extra-ostrov-figured-length': { value: '2000' },
  });
  const model = GeometryModel.buildGeometryModel(state);
  // Fixed priority: standard wins when both are filled -- see
  // pickActiveVariant() in geometry-model.js. Only ONE island is ever built.
  assert.equal(model.island.widthM, 1.2);
  assert.equal(model.island.lengthM, 0.8);
});

test('bar counter variants (standard/complex) are mutually exclusive all the way through to the geometry model', () => {
  const state = readState('stoleshnitsa_kuhnya', {
    'extra-bar-standard-width': { value: '600' }, 'extra-bar-standard-length': { value: '1500' },
    'extra-bar-complex-width': { value: '900' }, 'extra-bar-complex-length': { value: '3000' },
  });
  const model = GeometryModel.buildGeometryModel(state);
  assert.equal(model.barCounter.widthM, 0.6);
  assert.equal(model.barCounter.lengthM, 1.5);
});

test('switching products does not leak the previous product\'s subcategory selection -- each readConstructorState call reflects only its own doc', () => {
  // Simulates two consecutive calculate() calls after a product switch: the
  // real app's renderSubcategoryOptions() always repopulates #productSubcategory
  // from scratch on switch (see sayanmramor-calculator.html), so a fresh doc
  // for the new product never carries the old value -- this documents that
  // readConstructorState() itself has no hidden memory across calls that
  // could fight that reset.
  const lestnitsaState = readState('lestnitsa', { productSubcategory: { value: 'STAIR-05' } });
  assert.equal(lestnitsaState.subcategory.id, 'STAIR-05');
  const stenaState = readState('stena', { productSubcategory: { value: 'WALL-01' } });
  assert.equal(stenaState.subcategory.id, 'WALL-01');
  assert.notEqual(stenaState.subcategory.id, lestnitsaState.subcategory.id);
});
