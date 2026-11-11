// tests/company-rates.test.js
//
// The company's v2 rates in the price (rate-catalog.js): the work of the
// chosen type x the stone coefficient (fabrication only), stair landings at
// STAIR-11, risers at RISER-00, the countertop's elements EXTRA-01..07, cuts
// without the coefficient, the integrated sink per metre of its cut.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createFakeDoc } = require('./helpers/fake-dom.js');
const Pricing = require('../pricing.js');
const ProductTypes = require('../product-types.js');
const ConstructorState = require('../constructor-state.js');
const RateCatalog = require('../rate-catalog.js');
const GeometryModel = require('../visualizer/geometry-model.js');

const { PRODUCTS, SAW_MARGIN_CM, SLAB_USAGE_LIMIT } = ProductTypes;
const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, (msg || '') + ': ' + a + ' vs ' + b);
// One big slab: every product here fits it.
const stoneOf = category => ({ id: 'stub', category, slabs: [{ article: 'S1', width_cm: 2000, length_cm: 2000, price_total_rub: 100000 }] });
const on = { checked: true };

function stateFor(key, values, category) {
  return ConstructorState.readConstructorState({
    doc: createFakeDoc(values), selectedProductKey: key, product: PRODUCTS[key],
    stone: stoneOf(category), hasAdditionalWork: ProductTypes.hasAdditionalWork,
  });
}

function price(state, catalog) {
  const inputs = ConstructorState.buildPricingInputs(state, { catalog: catalog || RateCatalog });
  const r = Pricing.calculatePrice({
    stone: state.stone, productType: state.product.type, rates: inputs.rates,
    installEnabled: state.options.installEnabled, polishEnabled: state.options.polishEnabled, complexEnabled: state.options.complexEnabled,
    extraLineItems: inputs.extraLineItems, marginCm: SAW_MARGIN_CM, usageLimit: SLAB_USAGE_LIMIT,
    job: inputs.job, groupRates: inputs.groupRates,
  });
  assert.equal(r.ok, true, 'priced: ' + r.reason);
  return { r, inputs };
}

const kitchenL = extra => Object.assign({
  width: { value: '600' }, length: { value: '2400' },
  productShape: { value: 'lshape' }, 'wing-width': { value: '600' }, 'wing-length': { value: '1200' },
}, extra || {});
const withOptions = Object.assign({ 'opt-install': on, 'opt-polish': on });

test('kitchen L-shape uses KITCHEN-12', () => {
  const state = stateFor('stoleshnitsa_kuhnya', kitchenL(withOptions), 'marble');
  assert.equal(ConstructorState.resolveTypeId(state), 'KITCHEN-12');
  const { r, inputs } = price(state);
  const S = inputs.job.mainAreaM2;
  close(r.fabrication, 40000 * S, 'fabrication');
  close(r.installation, 20000 * S, 'installation');
  close(r.polish, 18000 * S, 'polish');
});

test('stone coefficient multiplies fabrication only', () => {
  const { r, inputs } = price(stateFor('stoleshnitsa_kuhnya', kitchenL(withOptions), 'quartzite'));
  const S = inputs.job.mainAreaM2;
  close(r.fabrication, 80000 * S, 'fabrication x2');
  close(r.installation, 20000 * S, 'installation');
  close(r.polish, 18000 * S, 'polish');
});

test('unknown stone category prices as x1', () => {
  ['slate', undefined].forEach(category => {
    const { r, inputs } = price(stateFor('stoleshnitsa_kuhnya', kitchenL(), category));
    close(r.fabrication, 40000 * inputs.job.mainAreaM2, String(category));
  });
});

test('complex shape stacks with the coefficient', () => {
  const { r, inputs } = price(stateFor('stoleshnitsa_kuhnya', kitchenL({ 'opt-complex': on }), 'granite'));
  close(r.fabrication, 40000 * 1.3 * 1.5 * inputs.job.mainAreaM2);
});

test('stair landings priced at STAIR-11', () => {
  const values = {
    width: { value: '1000' }, length: { value: '3000' }, productSubcategory: { value: 'STAIR-03' },
    'step-count': { value: '6' }, 'stair-marches': { value: '2' },
  };
  const state = stateFor('lestnitsa', values, 'marble');
  const landing = state => ConstructorState.buildPricingInputs(state, { catalog: RateCatalog }).job.pieces.filter(p => p.key === 'landing');
  assert.equal(landing(state).length, 1, 'one landing');
  const { r, inputs } = price(state);
  const pieces = inputs.job.pieces;
  const sLanding = pieces.filter(p => p.key === 'landing').reduce((s, p) => s + p.areaM2 * p.count, 0);
  const sSteps = pieces.filter(p => p.group === 'main' && p.key !== 'landing').reduce((s, p) => s + p.areaM2 * p.count, 0);
  assert.ok(sLanding > 0 && sSteps > 0);
  close(r.fabrication, 50000 * sSteps + 50000 * sLanding, 'steps + landing');
  assert.deepEqual(inputs.rates.landingRates, { fabricationRatePerM2: 50000, installationRatePerM2: 25000, polishRatePerM2: null });

  // The landing really takes its rate from landingRates (STAIR-11).
  const stub = Object.assign({}, RateCatalog, {
    getProductRates: id => (id === 'STAIR-11'
      ? { fabricationRatePerM2: 1, installationRatePerM2: 25000, polishRatePerM2: null }
      : RateCatalog.getProductRates(id)),
  });
  close(price(state, stub).r.fabrication, 50000 * sSteps + 1 * sLanding, 'landing at the stub STAIR-11');
});

test('risers use RISER-00 with the coefficient', () => {
  const values = {
    width: { value: '300' }, length: { value: '1200' }, productSubcategory: { value: 'STEP-01' },
    'step-count': { value: '4' }, 'stupeni-riser': on, 'riser-height': { value: '170' },
  };
  const off = price(stateFor('stupeni', values, 'oniks'));
  const sRiser = off.inputs.job.riserAreaM2;
  assert.ok(sRiser > 0);
  const riser = off.r.groups.find(g => g.key === 'riser');
  close(riser.work, 5000 * 1.5 * sRiser, 'riser fabrication');
  const withInstall = price(stateFor('stupeni', Object.assign({ 'opt-install': on }, values), 'oniks'));
  close(withInstall.r.groups.find(g => g.key === 'riser').work, 5000 * 1.5 * sRiser + 5000 * sRiser, 'riser + install');
});

test('island work and install from EXTRA-04', () => {
  const state = stateFor('stoleshnitsa_kuhnya', {
    width: { value: '600' }, length: { value: '2400' },
    'extra-ostrov-width': { value: '900' }, 'extra-ostrov-length': { value: '1800' }, 'opt-install': on,
  }, 'quartzite');
  const A = 0.9 * 1.8;
  const items = ConstructorState.buildPricingInputs(state, { catalog: RateCatalog }).extraLineItems;
  assert.ok(items.some(i => i.rate === 80000 && Math.abs(i.quantity - A) < 1e-9 && !i.install), JSON.stringify(items));
  assert.ok(items.some(i => i.rate === 50000 && Math.abs(i.quantity - A) < 1e-9 && i.install === 'island'), JSON.stringify(items));
});

test('bortik from EXTRA-01', () => {
  const state = stateFor('stoleshnitsa_kuhnya', { width: { value: '600' }, length: { value: '2400' }, 'extra-bortik': { value: '2000' } }, 'marble');
  const items = ConstructorState.buildPricingInputs(state, { catalog: RateCatalog }).extraLineItems;
  assert.deepEqual(items, [{ rate: 25000, quantity: 2 }]);
});

test('cuts are not multiplied by the coefficient', () => {
  const state = stateFor('stoleshnitsa_kuhnya', { width: { value: '600' }, length: { value: '2400' }, 'cut-sink-undermount': { value: '1' } }, 'agate');
  const items = ConstructorState.buildPricingInputs(state, { catalog: RateCatalog }).extraLineItems;
  assert.deepEqual(items, [{ rate: 20000, quantity: 1 }]);
});

test('integrated sink priced per metre of its cut', () => {
  const state = stateFor('stoleshnitsa_kuhnya', { width: { value: '600' }, length: { value: '2400' }, 'cut-sink-integrated': { value: '1' } }, 'marble');
  const L = GeometryModel.buildGeometryModel(state).sink.cut.lengthM;
  assert.ok(L > 0);
  const items = ConstructorState.buildPricingInputs(state, { catalog: RateCatalog }).extraLineItems;
  assert.equal(items.length, 1);
  assert.equal(items[0].rate, 70000);
  close(items[0].quantity, L, 'the cut length');
});

test('integrated sink without a cut length: no rate (the manager prices it), never 1 m', () => {
  const state = stateFor('stoleshnitsa_kuhnya', { width: { value: '600' }, length: { value: '2400' }, 'cut-sink-integrated': { value: '1' } }, 'marble');
  const noGeometry = Object.assign({}, state, { additionalWorks: Object.assign({}, state.additionalWorks, { sink: { type: null, count: 0, position: null } }) });
  const items = ConstructorState.buildPricingInputs(noGeometry, { catalog: RateCatalog }).extraLineItems;
  assert.equal(items.length, 1);
  assert.equal(items[0].rate, null);
  // A null-rate line is the manager's: the work and the total stay unknown.
  const r = Pricing.computeWorkAndTotal(100000, 1, { fabricationRatePerM2: 1, installationRatePerM2: 1, polishRatePerM2: 1, complexShapeMultiplier: 1.5 },
    { installEnabled: false, polishEnabled: false, complexEnabled: false }, items);
  assert.equal(r.total, null);
  assert.match(r.workNote || Pricing.unpricedWorkNote(r.unpriced), /уточнит менеджер/);
});

test('a type id with no catalog row leaves the work unpriced, never another type\'s rate', () => {
  const state = stateFor('panno', { width: { value: '1000' }, length: { value: '1000' }, productSubcategory: { value: 'PANEL-99' } }, 'marble');
  const { rates } = ConstructorState.buildPricingInputs(state, { catalog: RateCatalog });
  assert.equal(rates.fabricationRatePerM2, null);
  assert.equal(rates.installationRatePerM2, null);
});
