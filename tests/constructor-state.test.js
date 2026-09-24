// tests/constructor-state.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { createFakeDoc } = require('./helpers/fake-dom.js');
const ConstructorState = require('../constructor-state.js');
const ProductTypes = require('../product-types.js');

const { PRODUCTS, hasAdditionalWork } = ProductTypes;

test('readConstructorState reads dimensions and converts mm to m', () => {
  const doc = createFakeDoc({ width: { value: '2000' }, length: { value: '600' } });
  const state = ConstructorState.readConstructorState({
    doc, selectedProductKey: 'stoleshnitsa_kuhnya', product: PRODUCTS.stoleshnitsa_kuhnya,
    stone: null, hasAdditionalWork,
  });
  assert.equal(state.dimensions.widthM, 2);
  assert.equal(state.dimensions.lengthM, 0.6);
  assert.equal(state.dimensions.thicknessM, null);
});

test('readConstructorState.edge picks the first non-zero legacy field by fixed priority, not by length', () => {
  // edge-round (300) is numerically larger than edge-straight (100), but
  // straight has higher priority -- straight must win.
  const doc = createFakeDoc({
    width: { value: '1000' }, length: { value: '600' },
    'edge-straight': { value: '100' }, 'edge-round': { value: '300' },
  });
  const state = ConstructorState.readConstructorState({
    doc, selectedProductKey: 'stoleshnitsa_kuhnya', product: PRODUCTS.stoleshnitsa_kuhnya,
    stone: null, hasAdditionalWork,
  });
  assert.deepEqual(state.edge, { type: 'straight', lengthMm: 100 });
});

test('readConstructorState.edge maps all 5 legacy field ids to the new type enum', () => {
  const cases = [
    ['edge-straight', 'straight'], ['edge-figured', 'figured'], ['edge-round', 'rounding'],
    ['edge-chamfer', 'bevel'], ['edge-stonefold', 'stone-wrap'],
  ];
  for (const [elId, expectedType] of cases) {
    const doc = createFakeDoc({ width: { value: '1000' }, length: { value: '600' }, [elId]: { value: '500' } });
    const state = ConstructorState.readConstructorState({
      doc, selectedProductKey: 'stoleshnitsa_kuhnya', product: PRODUCTS.stoleshnitsa_kuhnya,
      stone: null, hasAdditionalWork,
    });
    assert.deepEqual(state.edge, { type: expectedType, lengthMm: 500 });
  }
});

test('readConstructorState.edge is null/null when no legacy field is set', () => {
  const doc = createFakeDoc({ width: { value: '1000' }, length: { value: '600' } });
  const state = ConstructorState.readConstructorState({
    doc, selectedProductKey: 'pol', product: PRODUCTS.pol, stone: null, hasAdditionalWork,
  });
  assert.deepEqual(state.edge, { type: null, lengthMm: null });
});

test('readConstructorState.edgeLineItems keeps EVERY non-zero legacy field, not just the priority winner (pricing fidelity)', () => {
  const doc = createFakeDoc({
    width: { value: '1000' }, length: { value: '600' },
    'edge-straight': { value: '100' }, 'edge-chamfer': { value: '50' },
  });
  const state = ConstructorState.readConstructorState({
    doc, selectedProductKey: 'stoleshnitsa_kuhnya', product: PRODUCTS.stoleshnitsa_kuhnya,
    stone: null, hasAdditionalWork,
  });
  assert.deepEqual(state.edgeLineItems, [
    { rateId: 'EDGE-01', type: 'straight', lengthMm: 100 },
    { rateId: 'EDGE-05', type: 'bevel', lengthMm: 50 },
  ]);
});

test('readConstructorState reads edge-length fields unconditionally, even for a product without supportsEdgeWork (matches sayanmramor-calculator.html\'s current unconditional read)', () => {
  const doc = createFakeDoc({
    width: { value: '1000' }, length: { value: '600' },
    'edge-straight': { value: '500' }, // stale value left over from a previously selected product
  });
  const state = ConstructorState.readConstructorState({
    doc, selectedProductKey: 'pol', product: PRODUCTS.pol, stone: null, hasAdditionalWork,
  });
  assert.equal(PRODUCTS.pol.supportsEdgeWork, undefined); // sanity: pol genuinely lacks the capability
  assert.deepEqual(state.edgeLineItems, [{ rateId: 'EDGE-01', type: 'straight', lengthMm: 500 }]);
  assert.deepEqual(state.edge, { type: 'straight', lengthMm: 500 });
});

test('readConstructorState.additionalWorks.sink is derived by the same fixed-priority rule (overlay > undermount > integrated)', () => {
  const doc = createFakeDoc({
    width: { value: '1000' }, length: { value: '600' },
    'cut-sink-undermount': { value: '2' }, 'cut-sink-integrated': { value: '5' },
  });
  const state = ConstructorState.readConstructorState({
    doc, selectedProductKey: 'stoleshnitsa_kuhnya', product: PRODUCTS.stoleshnitsa_kuhnya,
    stone: null, hasAdditionalWork,
  });
  assert.deepEqual(state.additionalWorks.sink, { type: 'undermount', count: 2, position: null });
  // Raw counts for pricing keep BOTH values, independent of the derived single-type view.
  assert.deepEqual(state.sinkCounts, { overlay: 0, undermount: 2, integrated: 5 });
});

test('readConstructorState zeroes countertop-extras fields for a product without that capability, even if the field has a leftover value', () => {
  const doc = createFakeDoc({
    width: { value: '1000' }, length: { value: '600' },
    'extra-bortik': { value: '500' }, // leftover from a previously selected product
  });
  const state = ConstructorState.readConstructorState({
    doc, selectedProductKey: 'pol', product: PRODUCTS.pol, stone: null, hasAdditionalWork,
  });
  assert.equal(state.curbLengthM, 0);
});

test('readConstructorState.product.capabilities matches ProductTypes.hasAdditionalWork for every capability', () => {
  const doc = createFakeDoc({ width: { value: '1000' }, length: { value: '600' } });
  const state = ConstructorState.readConstructorState({
    doc, selectedProductKey: 'stoleshnitsa_vannaya', product: PRODUCTS.stoleshnitsa_vannaya,
    stone: null, hasAdditionalWork,
  });
  assert.deepEqual(state.product.capabilities, {
    supportsEdgeWork: true, supportsCountertopExtras: true, supportsShapeSelection: true,
    sinkCutout: true, cooktopCutout: false, holes: true,
    curb: true, backsplash: true, wallPanel: true, island: false, barCounter: false,
  });
});

test('readConstructorState.product is null when no product is selected', () => {
  const doc = createFakeDoc({ width: { value: '1000' }, length: { value: '600' } });
  const state = ConstructorState.readConstructorState({
    doc, selectedProductKey: null, product: null, stone: null, hasAdditionalWork,
  });
  assert.equal(state.product, null);
});

const RateCatalog = require('../rate-catalog.js');

function baseRatesConfig(productKey) {
  return {
    productRates: ProductTypes.WORK_RATES[productKey],
    miscFlatSum: ProductTypes.MISC_FLAT_SUM,
    miscRatePerM2: ProductTypes.MISC_RATE_PER_M2,
    complexShapeMultiplier: ProductTypes.COMPLEX_SHAPE_MULTIPLIER,
    countertopExtrasRates: ProductTypes.COUNTERTOP_EXTRAS_RATES,
    getAdditionalWorkRate: RateCatalog.getAdditionalWorkRate,
  };
}

test('buildPricingInputs assembles one extraLineItems entry per edge field, using rate-catalog rates', () => {
  const doc = createFakeDoc({
    width: { value: '1000' }, length: { value: '600' },
    'edge-straight': { value: '100' }, 'edge-chamfer': { value: '50' },
  });
  const state = ConstructorState.readConstructorState({
    doc, selectedProductKey: 'stoleshnitsa_kuhnya', product: PRODUCTS.stoleshnitsa_kuhnya, stone: null, hasAdditionalWork,
  });
  const { extraLineItems } = ConstructorState.buildPricingInputs(state, baseRatesConfig('stoleshnitsa_kuhnya'));
  assert.equal(extraLineItems.length, 2);
  assert.equal(extraLineItems[0].rate, RateCatalog.getAdditionalWorkRate('EDGE-01'));
  assert.equal(extraLineItems[0].quantity, 0.1); // 100mm -> 0.1m
  assert.equal(extraLineItems[1].rate, RateCatalog.getAdditionalWorkRate('EDGE-05'));
  assert.equal(extraLineItems[1].quantity, 0.05);
});

test('buildPricingInputs sums BOTH sink counts as independent line items when more than one is non-zero (pricing must not collapse to one type)', () => {
  const doc = createFakeDoc({
    width: { value: '1000' }, length: { value: '600' },
    'cut-sink-overlay': { value: '1' }, 'cut-sink-undermount': { value: '2' },
  });
  const state = ConstructorState.readConstructorState({
    doc, selectedProductKey: 'stoleshnitsa_kuhnya', product: PRODUCTS.stoleshnitsa_kuhnya, stone: null, hasAdditionalWork,
  });
  const { extraLineItems } = ConstructorState.buildPricingInputs(state, baseRatesConfig('stoleshnitsa_kuhnya'));
  const cutItems = extraLineItems.filter(i => i.rate === RateCatalog.getAdditionalWorkRate('CUT-01') || i.rate === RateCatalog.getAdditionalWorkRate('CUT-02'));
  assert.equal(cutItems.length, 2);
});

test('buildPricingInputs.extraDimensions carries bortik/fartuk/ostrov, zero when capability absent', () => {
  const doc = createFakeDoc({
    width: { value: '1000' }, length: { value: '600' },
    'extra-bortik': { value: '500' },
    'extra-fartuk-width': { value: '600' }, 'extra-fartuk-length': { value: '2000' },
  });
  const state = ConstructorState.readConstructorState({
    doc, selectedProductKey: 'stoleshnitsa_kuhnya', product: PRODUCTS.stoleshnitsa_kuhnya, stone: null, hasAdditionalWork,
  });
  const { extraDimensions } = ConstructorState.buildPricingInputs(state, baseRatesConfig('stoleshnitsa_kuhnya'));
  assert.equal(extraDimensions.bortikLengthM, 0.5);
  assert.ok(Math.abs(extraDimensions.fartukAreaM2 - 1.2) < 1e-9);
  assert.equal(extraDimensions.ostrovAreaM2, 0);
});

test('buildPricingInputs.rates carries the product\'s own fabrication/installation/polish rates', () => {
  const doc = createFakeDoc({ width: { value: '1000' }, length: { value: '600' } });
  const state = ConstructorState.readConstructorState({
    doc, selectedProductKey: 'pol', product: PRODUCTS.pol, stone: null, hasAdditionalWork,
  });
  const { rates } = ConstructorState.buildPricingInputs(state, baseRatesConfig('pol'));
  assert.equal(rates.fabricationRatePerM2, ProductTypes.WORK_RATES.pol.fabricationRatePerM2);
  assert.equal(rates.installationRatePerM2, ProductTypes.WORK_RATES.pol.installationRatePerM2);
});

test('readConstructorState.shape defaults to "straight" with a zeroed wing when the shape select is untouched', () => {
  const doc = createFakeDoc({ width: { value: '2000' }, length: { value: '600' } });
  const state = ConstructorState.readConstructorState({
    doc, selectedProductKey: 'stoleshnitsa_kuhnya', product: PRODUCTS.stoleshnitsa_kuhnya, stone: null, hasAdditionalWork,
  });
  assert.equal(state.shape, 'straight');
  assert.deepEqual(state.wing, { widthM: 0, lengthM: 0 });
  assert.equal(state.corner, 'left');
});

test('readConstructorState.shape/wing/corner read real values for a product with supportsShapeSelection', () => {
  const doc = createFakeDoc({
    width: { value: '2000' }, length: { value: '600' },
    productShape: { value: 'lshape' },
    'wing-width': { value: '600' }, 'wing-length': { value: '1200' },
    'shape-corner': { value: 'right' },
  });
  const state = ConstructorState.readConstructorState({
    doc, selectedProductKey: 'stoleshnitsa_kuhnya', product: PRODUCTS.stoleshnitsa_kuhnya, stone: null, hasAdditionalWork,
  });
  assert.equal(state.shape, 'lshape');
  assert.deepEqual(state.wing, { widthM: 0.6, lengthM: 1.2 });
  assert.equal(state.corner, 'right');
});

test('readConstructorState forces shape to "straight" and zeroes wing for a product without supportsShapeSelection, even if the shared fields have leftover values', () => {
  const doc = createFakeDoc({
    width: { value: '1000' }, length: { value: '600' },
    productShape: { value: 'lshape' }, // leftover from a previously selected countertop
    'wing-width': { value: '600' }, 'wing-length': { value: '1200' },
  });
  const state = ConstructorState.readConstructorState({
    doc, selectedProductKey: 'pol', product: PRODUCTS.pol, stone: null, hasAdditionalWork,
  });
  assert.equal(state.shape, 'straight');
  assert.deepEqual(state.wing, { widthM: 0, lengthM: 0 });
  assert.equal(state.corner, 'left');
});

test('readConstructorState.edge: a profile chosen in #edge-type is the edge (no length), and adds no priced edge line', () => {
  const doc = createFakeDoc({ width: { value: '600' }, length: { value: '2000' }, 'edge-type': { value: 'rounding' } });
  const state = ConstructorState.readConstructorState({
    doc, selectedProductKey: 'stoleshnitsa_kuhnya', product: PRODUCTS.stoleshnitsa_kuhnya,
    stone: null, hasAdditionalWork,
  });
  assert.deepEqual(state.edge, { type: 'rounding', lengthMm: null });
  assert.deepEqual(state.edgeLineItems, []);
});

test('readConstructorState.edge: an unknown #edge-type value is ignored, and legacy length fields keep priority', () => {
  const read = values => ConstructorState.readConstructorState({
    doc: createFakeDoc(Object.assign({ width: { value: '600' }, length: { value: '2000' } }, values)),
    selectedProductKey: 'podokonnik', product: PRODUCTS.podokonnik, stone: null, hasAdditionalWork,
  });
  assert.deepEqual(read({ 'edge-type': { value: 'nonsense' } }).edge, { type: null, lengthMm: null });
  assert.deepEqual(read({ 'edge-type': { value: 'bevel' }, 'edge-straight': { value: '800' } }).edge, { type: 'straight', lengthMm: 800 });
});
