// tests/edge-pricing-capability.test.js
//
// Edge fields are read for every product (a leftover value survives a
// product switch), so pricing itself must refuse to charge edge work on a
// product that does not support it -- not just the UI/Result hiding it.
// Real edge rates are null today; these tests use a non-null rate stub so
// the gate is exercised the way it will matter once rates are filled in.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createFakeDoc } = require('./helpers/fake-dom.js');
const ConstructorState = require('../constructor-state.js');
const ProductTypes = require('../product-types.js');
const RateCatalog = require('../rate-catalog.js');
const Pricing = require('../pricing.js');

const { PRODUCTS, hasAdditionalWork } = ProductTypes;
const STONE = { id: 's', name: 'S', slabs: [{ price_total_rub: 50000, width_cm: 320, length_cm: 200 }] };

function pricingFor(productKey, values, getAdditionalWorkRate) {
  const doc = createFakeDoc(Object.assign({ width: { value: '600' }, length: { value: '2000' } }, values));
  const state = ConstructorState.readConstructorState({ doc, selectedProductKey: productKey, product: PRODUCTS[productKey], stone: STONE, hasAdditionalWork });
  const inputs = ConstructorState.buildPricingInputs(state, {
    productRates: ProductTypes.WORK_RATES[productKey],
    miscFlatSum: ProductTypes.MISC_FLAT_SUM, miscRatePerM2: ProductTypes.MISC_RATE_PER_M2,
    complexShapeMultiplier: ProductTypes.COMPLEX_SHAPE_MULTIPLIER,
    countertopExtrasRates: ProductTypes.COUNTERTOP_EXTRAS_RATES,
    getAdditionalWorkRate,
  });
  const result = Pricing.calculatePrice({
    stone: STONE, widthM: state.dimensions.widthM, lengthM: state.dimensions.lengthM, productType: PRODUCTS[productKey].type,
    rates: inputs.rates, extraLineItems: inputs.extraLineItems, extraDimensions: inputs.extraDimensions,
    marginCm: ProductTypes.SAW_MARGIN_CM, wasteFactor: ProductTypes.AREA_WASTE_FACTOR, allowSeam: PRODUCTS[productKey].allowSeam !== false,
  });
  return { inputs, result, state };
}

const EDGE_RATE = rateId => (String(rateId).startsWith('EDGE-') ? 1500 : null);

test('unsupported product + leftover edge value + non-null edge rate -> edge adds nothing', () => {
  ['pol', 'panno', 'stena', 'fasad'].forEach(key => {
    const { inputs, result, state } = pricingFor(key, { 'edge-straight': { value: '3000' } }, EDGE_RATE);
    assert.equal(state.edgeLineItems.length, 1, 'the state still carries the leftover value (contract unchanged)');
    assert.deepEqual(inputs.extraLineItems, [], key);
    const clean = pricingFor(key, {}, EDGE_RATE).result;
    assert.equal(result.total, clean.total, key);
  });
});

test('supported product + edge + non-null edge rate -> edge is charged exactly as before', () => {
  const { inputs, result } = pricingFor('podokonnik', { 'edge-straight': { value: '2000' } }, EDGE_RATE);
  assert.deepEqual(inputs.extraLineItems, [{ rate: 1500, quantity: 2 }]);
  const clean = pricingFor('podokonnik', {}, EDGE_RATE).result;
  assert.equal(Math.round(result.total - clean.total), 3000);
  assert.equal(Math.round(result.catalogExtras), 3000);
});

test('existing null-rate behaviour is unchanged: with today\'s catalog an edge contributes 0 on any product', () => {
  ['podokonnik', 'stoleshnitsa_kuhnya', 'pol'].forEach(key => {
    const withEdge = pricingFor(key, { 'edge-round': { value: '2000' } }, RateCatalog.getAdditionalWorkRate).result;
    const without = pricingFor(key, {}, RateCatalog.getAdditionalWorkRate).result;
    assert.equal(withEdge.total, without.total, key);
  });
});
