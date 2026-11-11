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

test('readConstructorState.edge is the profile chosen in #edge-type, for each of the 5 profiles (no entered length)', () => {
  ['straight', 'figured', 'rounding', 'bevel', 'stone-wrap'].forEach(type => {
    const doc = createFakeDoc({ width: { value: '1000' }, length: { value: '600' }, 'edge-type': { value: type } });
    const state = ConstructorState.readConstructorState({
      doc, selectedProductKey: 'stoleshnitsa_kuhnya', product: PRODUCTS.stoleshnitsa_kuhnya,
      stone: null, hasAdditionalWork,
    });
    assert.deepEqual(state.edge, { type, lengthMm: null });
  });
});

test('readConstructorState.edge is null/null when no profile is chosen', () => {
  const doc = createFakeDoc({ width: { value: '1000' }, length: { value: '600' } });
  const state = ConstructorState.readConstructorState({
    doc, selectedProductKey: 'pol', product: PRODUCTS.pol, stone: null, hasAdditionalWork,
  });
  assert.deepEqual(state.edge, { type: null, lengthMm: null });
});

test('the old per-type edge length fields are gone: a value in one neither sets the edge nor reaches the state', () => {
  const doc = createFakeDoc({ width: { value: '1000' }, length: { value: '600' }, 'edge-straight': { value: '500' } });
  const state = ConstructorState.readConstructorState({
    doc, selectedProductKey: 'stoleshnitsa_kuhnya', product: PRODUCTS.stoleshnitsa_kuhnya, stone: null, hasAdditionalWork,
  });
  assert.deepEqual(state.edge, { type: null, lengthMm: null });
  assert.equal('edgeLineItems' in state, false);
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

function baseRatesConfig() {
  return { catalog: RateCatalog };
}

test('buildPricingInputs: one edge line, the chosen profile rate x the open edge length (config.edgeLengthM)', () => {
  const doc = createFakeDoc({ width: { value: '1000' }, length: { value: '600' }, 'edge-type': { value: 'bevel' } });
  const state = ConstructorState.readConstructorState({
    doc, selectedProductKey: 'stoleshnitsa_kuhnya', product: PRODUCTS.stoleshnitsa_kuhnya, stone: null, hasAdditionalWork,
  });
  const { extraLineItems } = ConstructorState.buildPricingInputs(state, Object.assign(baseRatesConfig(), { edgeLengthM: 2.2 }));
  assert.deepEqual(extraLineItems, [{ rate: RateCatalog.getAdditionalWorkRate('EDGE-05'), quantity: 2.2, edge: 'bevel' }]);
  // No length measured (an incomplete product): nothing to charge.
  assert.deepEqual(ConstructorState.buildPricingInputs(state, baseRatesConfig()).extraLineItems, []);
});

test('buildPricingInputs sums BOTH sink counts as independent line items when more than one is non-zero (pricing must not collapse to one type)', () => {
  const doc = createFakeDoc({
    width: { value: '1000' }, length: { value: '600' },
    'cut-sink-overlay': { value: '1' }, 'cut-sink-undermount': { value: '2' },
  });
  const state = ConstructorState.readConstructorState({
    doc, selectedProductKey: 'stoleshnitsa_kuhnya', product: PRODUCTS.stoleshnitsa_kuhnya, stone: null, hasAdditionalWork,
  });
  const { extraLineItems } = ConstructorState.buildPricingInputs(state, baseRatesConfig());
  const cutItems = extraLineItems.filter(i => i.rate === RateCatalog.getAdditionalWorkRate('CUT-01') || i.rate === RateCatalog.getAdditionalWorkRate('CUT-02'));
  assert.equal(cutItems.length, 2);
});

test('buildPricingInputs: bortik and fartuk are EXTRA-01 / EXTRA-02 line items, nothing when the capability is absent', () => {
  const doc = createFakeDoc({
    width: { value: '1000' }, length: { value: '600' },
    'extra-bortik': { value: '500' },
    'extra-fartuk-width': { value: '600' }, 'extra-fartuk-length': { value: '2000' },
  });
  const state = ConstructorState.readConstructorState({
    doc, selectedProductKey: 'stoleshnitsa_kuhnya', product: PRODUCTS.stoleshnitsa_kuhnya, stone: null, hasAdditionalWork,
  });
  const inputs = ConstructorState.buildPricingInputs(state, baseRatesConfig());
  assert.equal(inputs.extraDimensions, undefined);
  assert.equal(inputs.extraLineItems.length, 2);
  assert.deepEqual(inputs.extraLineItems[0], { rate: RateCatalog.getAdditionalWorkRate('EXTRA-01'), quantity: 0.5 });
  assert.equal(inputs.extraLineItems[1].rate, RateCatalog.getAdditionalWorkRate('EXTRA-02'));
  assert.ok(Math.abs(inputs.extraLineItems[1].quantity - 1.2) < 1e-9);

  const floorDoc = createFakeDoc({ width: { value: '1000' }, length: { value: '600' }, 'extra-bortik': { value: '500' } });
  const floor = ConstructorState.readConstructorState({ doc: floorDoc, selectedProductKey: 'pol', product: PRODUCTS.pol, stone: null, hasAdditionalWork });
  assert.deepEqual(ConstructorState.buildPricingInputs(floor, baseRatesConfig()).extraLineItems, []);
});

test('buildPricingInputs.rates carries the fabrication/installation/polish rates of the chosen type (rate-catalog.js)', () => {
  const doc = createFakeDoc({ width: { value: '1000' }, length: { value: '600' }, productSubcategory: { value: 'FLOOR-03' } });
  const state = ConstructorState.readConstructorState({
    doc, selectedProductKey: 'pol', product: PRODUCTS.pol, stone: null, hasAdditionalWork,
  });
  assert.equal(ConstructorState.resolveTypeId(state), 'FLOOR-03');
  const { rates } = ConstructorState.buildPricingInputs(state, baseRatesConfig());
  assert.equal(rates.fabricationRatePerM2, RateCatalog.getProductRates('FLOOR-03').fabricationRatePerM2);
  assert.equal(rates.installationRatePerM2, RateCatalog.getProductRates('FLOOR-03').installationRatePerM2);
  assert.equal(rates.polishRatePerM2, RateCatalog.getProductRates('FLOOR-03').polishRatePerM2);
  assert.equal(rates.complexShapeMultiplier, RateCatalog.MISC.complexShapeMultiplier);
  assert.equal(rates.landingRates, null);
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

test('readConstructorState.edge: a profile chosen in #edge-type is the edge (no length), and adds no priced edge line without a measured length', () => {
  const doc = createFakeDoc({ width: { value: '600' }, length: { value: '2000' }, 'edge-type': { value: 'rounding' } });
  const state = ConstructorState.readConstructorState({
    doc, selectedProductKey: 'stoleshnitsa_kuhnya', product: PRODUCTS.stoleshnitsa_kuhnya,
    stone: null, hasAdditionalWork,
  });
  assert.deepEqual(state.edge, { type: 'rounding', lengthMm: null });
  assert.deepEqual(ConstructorState.buildPricingInputs(state, baseRatesConfig()).extraLineItems, []);
});

test('readConstructorState.edge: an unknown #edge-type value is ignored', () => {
  const read = values => ConstructorState.readConstructorState({
    doc: createFakeDoc(Object.assign({ width: { value: '600' }, length: { value: '2000' } }, values)),
    selectedProductKey: 'podokonnik', product: PRODUCTS.podokonnik, stone: null, hasAdditionalWork,
  });
  assert.deepEqual(read({ 'edge-type': { value: 'nonsense' } }).edge, { type: null, lengthMm: null });
  assert.deepEqual(read({ 'edge-type': { value: 'bevel' }, 'edge-straight': { value: '800' } }).edge, { type: 'bevel', lengthMm: null });
});

test('stair risers come from #stair-risers, not from the type id', () => {
  const read = values => ConstructorState.readConstructorState({
    doc: createFakeDoc(Object.assign({ width: { value: '1000' }, length: { value: '3000' }, productSubcategory: { value: 'STAIR-03' }, 'riser-height': { value: '170' } }, values)),
    selectedProductKey: 'lestnitsa', product: PRODUCTS.lestnitsa, stone: null, hasAdditionalWork,
  });
  const on = read({ 'stair-risers': { checked: true } }).productConfig.lestnitsa;
  assert.equal(on.risers, true);
  assert.equal(on.riserHeightM, 0.17);
  const off = read({ 'stair-risers': { checked: false } }).productConfig.lestnitsa;
  assert.equal(off.risers, false);
  assert.equal(off.riserHeightM, 0);
  // The flag, not the shape's id, decides: every shape takes it.
  ['STAIR-01', 'STAIR-03', 'STAIR-05', 'STAIR-07'].forEach(id => {
    assert.equal(read({ productSubcategory: { value: id }, 'stair-risers': { checked: true } }).productConfig.lestnitsa.risers, true, id);
    assert.equal(read({ productSubcategory: { value: id }, 'stair-risers': { checked: false } }).productConfig.lestnitsa.risers, false, id);
  });
});

test('a stale #stair-risers tick never reaches another product', () => {
  const state = ConstructorState.readConstructorState({
    doc: createFakeDoc({ width: { value: '1000' }, length: { value: '600' }, 'stair-risers': { checked: true } }),
    selectedProductKey: 'stoleshnitsa_kuhnya', product: PRODUCTS.stoleshnitsa_kuhnya, stone: null, hasAdditionalWork,
  });
  assert.equal(state.productConfig.lestnitsa, null);
});
