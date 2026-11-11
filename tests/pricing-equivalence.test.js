// tests/pricing-equivalence.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { createFakeDoc } = require('./helpers/fake-dom.js');
const Pricing = require('../pricing.js');
const ProductTypes = require('../product-types.js');
const RateCatalog = require('../rate-catalog.js');
const ConstructorState = require('../constructor-state.js');
const GeometryModel = require('../visualizer/geometry-model.js');
const SceneLayout = require('../visualizer/scene-layout.js');
const EdgeLength = require('../edge-length.js');

const { PRODUCTS, hasAdditionalWork, SAW_MARGIN_CM, SLAB_USAGE_LIMIT } = ProductTypes;
const { getAdditionalWorkRate, getAdditionalWorkInstallRate, getProductRates, stoneCoefficient, MISC } = RateCatalog;

function mmToM(mm) { return mm / 1000; }
function num(doc, id) { return parseFloat(doc.getElementById(id).value) || 0; }

// Independent transcription of the pricing rules (the company's rates v2,
// docs/superpowers/specs/2026-11-08-company-rates-v2-design.md) straight
// from the page fields, for characterization purposes only. Deliberately NOT
// calling into constructor-state.js. `typeId` -- the type chosen for the
// product (a countertop's is its shape), `k` -- the stone coefficient,
// `edgeLengthM` -- the product's open edge, hand-measured for the scenario.
function legacyBuildPricingInputs(doc, product, typeId, k, edgeLengthM) {
  const EDGE_RATE_IDS = { straight: 'EDGE-01', figured: 'EDGE-03', rounding: 'EDGE-04', bevel: 'EDGE-05', 'stone-wrap': 'EDGE-06' };
  let extraLineItems = [];
  // Edge is charged only where the product supports edge work (Block 7
  // capability-safety fix); a leftover profile on e.g. a floor is not priced.
  // The chosen profile's rate x the open edge length, no stone coefficient.
  const edgeType = doc.getElementById('edge-type').value;
  if (product.supportsEdgeWork && EDGE_RATE_IDS[edgeType] && edgeLengthM > 0) {
    extraLineItems.push({ rate: getAdditionalWorkRate(EDGE_RATE_IDS[edgeType]), quantity: edgeLengthM, edge: edgeType });
  }

  if (product.supportsCountertopExtras) {
    // Cuts and holes: rate x count, no stone coefficient (no integrated sink here).
    const QUANTITY_LINE_ITEMS = [
      { rateId: 'CUT-01', elId: 'cut-sink-overlay', capability: 'sinkCutout' },
      { rateId: 'CUT-02', elId: 'cut-sink-undermount', capability: 'sinkCutout' },
      { rateId: 'CUT-04', elId: 'cut-cooktop', capability: 'cooktopCutout' },
      { rateId: 'CUT-05', elId: 'hole-mixer', capability: 'holes' },
      { rateId: 'CUT-06', elId: 'hole-socket', capability: 'holes' },
      { rateId: 'CUT-07', elId: 'hole-dispenser', capability: 'holes' },
    ];
    QUANTITY_LINE_ITEMS.forEach(({ rateId, elId, capability }) => {
      if (!hasAdditionalWork(product, capability)) return;
      const qty = num(doc, elId);
      if (qty > 0) extraLineItems.push({ rate: getAdditionalWorkRate(rateId), quantity: qty });
    });

    // The countertop's elements: work x the stone coefficient.
    const bortikM = hasAdditionalWork(product, 'curb') ? mmToM(num(doc, 'extra-bortik')) : 0;
    if (bortikM > 0) extraLineItems.push({ rate: getAdditionalWorkRate('EXTRA-01') * k, quantity: bortikM });
    const AREA_LINE_ITEMS = [
      { rateId: 'EXTRA-02', widthElId: 'extra-fartuk-width', lengthElId: 'extra-fartuk-length', capability: 'backsplash', install: 'backsplash' },
      { rateId: 'EXTRA-03', widthElId: 'extra-wallpanel-width', lengthElId: 'extra-wallpanel-length', capability: 'wallPanel', install: 'wallPanel' },
      { rateId: 'EXTRA-04', widthElId: 'extra-ostrov-width', lengthElId: 'extra-ostrov-length', capability: 'island', install: 'island' },
      { rateId: 'EXTRA-06', widthElId: 'extra-bar-standard-width', lengthElId: 'extra-bar-standard-length', capability: 'barCounter', install: 'barCounter' },
    ];
    const installs = [];
    AREA_LINE_ITEMS.forEach(({ rateId, widthElId, lengthElId, capability, install }) => {
      if (!hasAdditionalWork(product, capability)) return;
      const areaM2 = mmToM(num(doc, widthElId)) * mmToM(num(doc, lengthElId));
      if (!(areaM2 > 0)) return;
      extraLineItems.push({ rate: getAdditionalWorkRate(rateId) * k, quantity: areaM2 });
      if (doc.getElementById('opt-install').checked) installs.push({ rate: getAdditionalWorkInstallRate(rateId), quantity: areaM2, install });
    });
    extraLineItems = extraLineItems.concat(installs);
  }

  const productRates = getProductRates(typeId);
  const rates = {
    fabricationRatePerM2: productRates.fabricationRatePerM2 * k,
    installationRatePerM2: productRates.installationRatePerM2,
    polishRatePerM2: productRates.polishRatePerM2,
    complexShapeMultiplier: MISC.complexShapeMultiplier,
    landingRates: null,
  };

  return { rates, extraLineItems };
}

const stone = {
  id: 'delicato-brown', category: 'marble', colors: [{ segment: 'beige' }],
  slabs: [{ width_cm: 300, length_cm: 200, price_per_m2_rub: 11000, price_total_rub: 66000 }],
};

const SCENARIOS = [
  {
    name: 'kitchen countertop, a bevel edge + sink + cooktop + curb + backsplash, all options on',
    // 2000 deep x 600 along the wall: front 0.6 + two ends 2.0.
    productKey: 'stoleshnitsa_kuhnya', typeId: 'KITCHEN-11', edgeLengthM: 4.6,
    values: {
      width: { value: '2000' }, length: { value: '600' },
      'edge-type': { value: 'bevel' },
      'cut-sink-overlay': { value: '1' }, 'cut-cooktop': { value: '1' }, 'hole-mixer': { value: '1' },
      'extra-bortik': { value: '500' }, 'extra-fartuk-width': { value: '600' }, 'extra-fartuk-length': { value: '2000' },
      'opt-complex': { checked: true }, 'opt-polish': { checked: true }, 'opt-install': { checked: true },
    },
  },
  {
    name: 'windowsill: edge work but no countertop extras',
    // 1200 deep x 300 along the window: the room side, 0.3.
    productKey: 'podokonnik', typeId: 'SILL-01', edgeLengthM: 0.3,
    values: { width: { value: '1200' }, length: { value: '300' }, 'edge-type': { value: 'rounding' }, productSubcategory: { value: 'SILL-01' } },
  },
  {
    name: 'floor: no edge work, no countertop extras, all zero',
    productKey: 'pol', typeId: 'FLOOR-01',
    values: { width: { value: '3000' }, length: { value: '2000' }, productSubcategory: { value: 'FLOOR-01' } },
  },
  {
    name: 'floor: no supportsEdgeWork capability -- a stale edge profile is NOT priced',
    productKey: 'pol', typeId: 'FLOOR-01', edgeLengthM: 0,
    values: { width: { value: '3000' }, length: { value: '2000' }, 'edge-type': { value: 'straight' }, productSubcategory: { value: 'FLOOR-01' } },
  },
];

SCENARIOS.forEach(({ name, productKey, typeId, values, edgeLengthM }) => {
  test(`legacy vs constructor-state pricing inputs match: ${name}`, () => {
    const doc = createFakeDoc(values);
    const product = PRODUCTS[productKey];

    const legacy = legacyBuildPricingInputs(doc, product, typeId, stoneCoefficient(stone.category), edgeLengthM || 0);

    const state = ConstructorState.readConstructorState({ doc, selectedProductKey: productKey, product, stone, hasAdditionalWork });
    const measured = EdgeLength.openEdgeLengthM(SceneLayout.buildSceneLayout(GeometryModel.buildGeometryModel(state)));
    if (product.supportsEdgeWork) assert.equal(measured, edgeLengthM || 0, 'the open edge, as hand-measured');
    const fresh = ConstructorState.buildPricingInputs(state, { catalog: RateCatalog, edgeLengthM: measured });

    // LIGHT-01 and the «Прочее» (MISC: measure, delivery, unloading + consumables per m², minimum order)
    // are new in the company's v2 rates -- the legacy inputs know neither.
    assert.deepEqual(fresh.rates.misc, { measure: 15000, delivery: 12000, perM2: 6000, minOrder: 20000 });
    assert.deepEqual(fresh.rates, Object.assign({}, legacy.rates, { lightingRatePerM2: RateCatalog.getAdditionalWorkRate('LIGHT-01'), misc: fresh.rates.misc }));
    legacy.rates = fresh.rates;
    assert.deepEqual(fresh.extraLineItems, legacy.extraLineItems);

    const priceParams = {
      stone, widthM: state.dimensions.widthM, lengthM: state.dimensions.lengthM, productType: product.type,
      marginCm: SAW_MARGIN_CM, usageLimit: SLAB_USAGE_LIMIT, allowSeam: product.allowSeam !== false,
      installEnabled: state.options.installEnabled, polishEnabled: state.options.polishEnabled, complexEnabled: state.options.complexEnabled,
    };
    const legacyResult = Pricing.calculatePrice(Object.assign({}, priceParams, legacy));
    // The work inputs are the legacy ones exactly...
    const { job, groupRates, areaM2, ...workInputs } = fresh;
    const freshResult = Pricing.calculatePrice(Object.assign({}, priceParams, workInputs));
    assert.deepEqual(freshResult, legacyResult);
    // ...and the product's own parts (product-parts.js) change only the stone:
    // a countertop's backsplash / island / bar is now cut from the slabs too.
    const withParts = Pricing.calculatePrice(Object.assign({}, priceParams, fresh));
    // (the unloading is per m² of ALL the stone, so the parts' area adds to it)
    assert.equal(withParts.work - withParts.misc, legacyResult.work - legacyResult.misc);
    assert.ok(withParts.subtotal >= legacyResult.subtotal);
  });
});
