// tests/edge-pricing-capability.test.js
//
// The edge profile (#edge-type) is read for every product (a leftover choice
// survives a product switch), so pricing itself must refuse to charge edge
// work on a product that does not support it -- not just the UI/Result
// hiding it. The length is the product's open edge, measured on its 3D scene
// (edge-length.js), as the page does.
// Most tests use a stub edge rate so the gate is exercised independently of
// the company table (rate-catalog.js, v2); one test uses the real rates.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createFakeDoc } = require('./helpers/fake-dom.js');
const ConstructorState = require('../constructor-state.js');
const ProductTypes = require('../product-types.js');
const RateCatalog = require('../rate-catalog.js');
const Pricing = require('../pricing.js');
const GeometryModel = require('../visualizer/geometry-model.js');
const SceneLayout = require('../visualizer/scene-layout.js');
const EdgeLength = require('../edge-length.js');

const { PRODUCTS, hasAdditionalWork } = ProductTypes;
const STONE = { id: 's', name: 'S', slabs: [{ price_total_rub: 50000, width_cm: 320, length_cm: 200 }] };

function pricingFor(productKey, values, getAdditionalWorkRate) {
  // The product's first type of the company table (a countertop's type is its shape).
  const firstType = RateCatalog.getSubcategoriesForProduct(PRODUCTS[productKey].label)[0].id;
  const doc = createFakeDoc(Object.assign({ width: { value: '600' }, length: { value: '2000' }, productSubcategory: { value: firstType } }, values));
  const state = ConstructorState.readConstructorState({ doc, selectedProductKey: productKey, product: PRODUCTS[productKey], stone: STONE, hasAdditionalWork });
  const catalog = Object.assign({}, RateCatalog, { getAdditionalWorkRate });
  const edgeLengthM = EdgeLength.openEdgeLengthM(SceneLayout.buildSceneLayout(GeometryModel.buildGeometryModel(state)));
  const inputs = ConstructorState.buildPricingInputs(state, { catalog, edgeLengthM });
  const result = Pricing.calculatePrice({
    stone: STONE, widthM: state.dimensions.widthM, lengthM: state.dimensions.lengthM, productType: PRODUCTS[productKey].type,
    rates: inputs.rates, extraLineItems: inputs.extraLineItems,
    marginCm: ProductTypes.SAW_MARGIN_CM, usageLimit: ProductTypes.SLAB_USAGE_LIMIT, allowSeam: PRODUCTS[productKey].allowSeam !== false,
  });
  return { inputs, result, state, edgeLengthM };
}

const EDGE_RATE = rateId => (String(rateId).startsWith('EDGE-') ? 1500 : null);

test('unsupported product + leftover edge profile + non-null edge rate -> edge adds nothing', () => {
  ['pol', 'panno', 'stena', 'fasad'].forEach(key => {
    const { inputs, result, state } = pricingFor(key, { 'edge-type': { value: 'straight' } }, EDGE_RATE);
    assert.equal(state.edge.type, 'straight', 'the state still carries the leftover choice (contract unchanged)');
    assert.deepEqual(inputs.extraLineItems, [], key);
    const clean = pricingFor(key, {}, EDGE_RATE).result;
    assert.equal(result.total, clean.total, key);
  });
});

test('supported product + edge profile + non-null edge rate -> the rate x the open edge', () => {
  // A 2000 x 600 sill: the room side, 2.0 m (the ends are at the reveals).
  const { inputs, result, edgeLengthM } = pricingFor('podokonnik', { 'edge-type': { value: 'straight' } }, EDGE_RATE);
  assert.equal(edgeLengthM, 2);
  assert.deepEqual(inputs.extraLineItems, [{ rate: 1500, quantity: 2, edge: 'straight' }]);
  const clean = pricingFor('podokonnik', {}, EDGE_RATE).result;
  assert.equal(Math.round(result.total - clean.total), 3000);
  assert.equal(Math.round(result.catalogExtras), 3000);
});

test('the company edge rates are live: rounding (EDGE-04) adds 10 000 per metre of open edge on a supporting product, nothing where edges are unsupported', () => {
  assert.equal(RateCatalog.getAdditionalWorkRate('EDGE-04'), 10000);
  // Sill 2.0 m; kitchen 2000 x 600 against the wall: front 2.0 + two ends 0.6.
  [['podokonnik', 2.0], ['stoleshnitsa_kuhnya', 3.2]].forEach(([key, lengthM]) => {
    const withEdge = pricingFor(key, { 'edge-type': { value: 'rounding' } }, RateCatalog.getAdditionalWorkRate).result;
    const without = pricingFor(key, {}, RateCatalog.getAdditionalWorkRate).result;
    assert.equal(Math.round(withEdge.total - without.total), Math.round(10000 * lengthM), key);
  });
  const withEdge = pricingFor('pol', { 'edge-type': { value: 'rounding' } }, RateCatalog.getAdditionalWorkRate).result;
  assert.equal(withEdge.total, pricingFor('pol', {}, RateCatalog.getAdditionalWorkRate).result.total);
});

test('an old per-type edge length field no longer changes the price', () => {
  const { inputs, result } = pricingFor('podokonnik', { 'edge-straight': { value: '2000' } }, EDGE_RATE);
  assert.deepEqual(inputs.extraLineItems, []);
  assert.equal(result.total, pricingFor('podokonnik', {}, EDGE_RATE).result.total);
});
