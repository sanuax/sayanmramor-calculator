// tests/edge-pricing-capability.test.js
//
// Edge fields are read for every product (a leftover value survives a
// product switch), so pricing itself must refuse to charge edge work on a
// product that does not support it -- not just the UI/Result hiding it.
// Most tests use a stub edge rate so the gate is exercised independently of
// the company table (rate-catalog.js, v2); one test uses the real rates.
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
  // The product's first type of the company table (a countertop's type is its shape).
  const firstType = RateCatalog.getSubcategoriesForProduct(PRODUCTS[productKey].label)[0].id;
  const doc = createFakeDoc(Object.assign({ width: { value: '600' }, length: { value: '2000' }, productSubcategory: { value: firstType } }, values));
  const state = ConstructorState.readConstructorState({ doc, selectedProductKey: productKey, product: PRODUCTS[productKey], stone: STONE, hasAdditionalWork });
  const catalog = Object.assign({}, RateCatalog, { getAdditionalWorkRate });
  const inputs = ConstructorState.buildPricingInputs(state, { catalog });
  const result = Pricing.calculatePrice({
    stone: STONE, widthM: state.dimensions.widthM, lengthM: state.dimensions.lengthM, productType: PRODUCTS[productKey].type,
    rates: inputs.rates, extraLineItems: inputs.extraLineItems,
    marginCm: ProductTypes.SAW_MARGIN_CM, usageLimit: ProductTypes.SLAB_USAGE_LIMIT, allowSeam: PRODUCTS[productKey].allowSeam !== false,
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

test('the company edge rates are live: 2 m of rounding (EDGE-04) adds 2 x 10 000 on a supporting product, nothing where edges are unsupported', () => {
  assert.equal(RateCatalog.getAdditionalWorkRate('EDGE-04'), 10000);
  ['podokonnik', 'stoleshnitsa_kuhnya'].forEach(key => {
    const withEdge = pricingFor(key, { 'edge-round': { value: '2000' } }, RateCatalog.getAdditionalWorkRate).result;
    const without = pricingFor(key, {}, RateCatalog.getAdditionalWorkRate).result;
    assert.equal(Math.round(withEdge.total - without.total), 20000, key);
  });
  const withEdge = pricingFor('pol', { 'edge-round': { value: '2000' } }, RateCatalog.getAdditionalWorkRate).result;
  assert.equal(withEdge.total, pricingFor('pol', {}, RateCatalog.getAdditionalWorkRate).result.total);
});

test('a profile chosen without a length (#edge-type) never changes the price, even with a non-null edge rate', () => {
  const { inputs, result, state } = pricingFor('podokonnik', { 'edge-type': { value: 'bevel' } }, EDGE_RATE);
  assert.equal(state.edge.type, 'bevel');
  assert.deepEqual(inputs.extraLineItems, []);
  assert.equal(result.total, pricingFor('podokonnik', {}, EDGE_RATE).result.total);
});
