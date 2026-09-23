// tests/pricing-equivalence.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { createFakeDoc } = require('./helpers/fake-dom.js');
const Pricing = require('../pricing.js');
const ProductTypes = require('../product-types.js');
const RateCatalog = require('../rate-catalog.js');
const ConstructorState = require('../constructor-state.js');

const { PRODUCTS, hasAdditionalWork, WORK_RATES, MISC_FLAT_SUM, MISC_RATE_PER_M2, COMPLEX_SHAPE_MULTIPLIER, COUNTERTOP_EXTRAS_RATES, SAW_MARGIN_CM, AREA_WASTE_FACTOR } = ProductTypes;
const { getAdditionalWorkRate } = RateCatalog;

function mmToM(mm) { return mm / 1000; }
function num(doc, id) { return parseFloat(doc.getElementById(id).value) || 0; }

// Independent transcription of today's sayanmramor-calculator.html calculate()
// logic (as of the commit that introduced this test), for characterization
// purposes only. Deliberately NOT calling into constructor-state.js.
function legacyBuildPricingInputs(doc, product) {
  const EDGE_LINE_ITEMS = [
    { rateId: 'EDGE-01', elId: 'edge-straight' }, { rateId: 'EDGE-03', elId: 'edge-figured' },
    { rateId: 'EDGE-04', elId: 'edge-round' }, { rateId: 'EDGE-05', elId: 'edge-chamfer' },
    { rateId: 'EDGE-06', elId: 'edge-stonefold' },
  ];
  let extraLineItems = [];
  // Edge is charged only where the product supports edge work (Block 7
  // capability-safety fix); a leftover edge field on e.g. a floor is not priced.
  if (product.supportsEdgeWork) EDGE_LINE_ITEMS.forEach(({ rateId, elId }) => {
    const lengthM = mmToM(num(doc, elId));
    if (lengthM > 0) extraLineItems.push({ rate: getAdditionalWorkRate(rateId), quantity: lengthM });
  });

  let bortikLengthM = 0, fartukAreaM2 = 0, ostrovAreaM2 = 0;
  if (product.supportsCountertopExtras) {
    bortikLengthM = hasAdditionalWork(product, 'curb') ? mmToM(num(doc, 'extra-bortik')) : 0;
    const fartukWidthM = hasAdditionalWork(product, 'backsplash') ? mmToM(num(doc, 'extra-fartuk-width')) : 0;
    const fartukLengthM = hasAdditionalWork(product, 'backsplash') ? mmToM(num(doc, 'extra-fartuk-length')) : 0;
    fartukAreaM2 = fartukWidthM * fartukLengthM;
    const ostrovWidthM = hasAdditionalWork(product, 'island') ? mmToM(num(doc, 'extra-ostrov-width')) : 0;
    const ostrovLengthM = hasAdditionalWork(product, 'island') ? mmToM(num(doc, 'extra-ostrov-length')) : 0;
    ostrovAreaM2 = ostrovWidthM * ostrovLengthM;

    const QUANTITY_LINE_ITEMS = [
      { rateId: 'CUT-01', elId: 'cut-sink-overlay', capability: 'sinkCutout' },
      { rateId: 'CUT-02', elId: 'cut-sink-undermount', capability: 'sinkCutout' },
      { rateId: 'CUT-03', elId: 'cut-sink-integrated', capability: 'sinkCutout' },
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

    const AREA_LINE_ITEMS = [
      { rateId: 'EXTRA-05', widthElId: 'extra-ostrov-figured-width', lengthElId: 'extra-ostrov-figured-length', capability: 'island' },
      { rateId: 'EXTRA-03', widthElId: 'extra-wallpanel-width', lengthElId: 'extra-wallpanel-length', capability: 'wallPanel' },
      { rateId: 'EXTRA-06', widthElId: 'extra-bar-standard-width', lengthElId: 'extra-bar-standard-length', capability: 'barCounter' },
      { rateId: 'EXTRA-07', widthElId: 'extra-bar-complex-width', lengthElId: 'extra-bar-complex-length', capability: 'barCounter' },
    ];
    AREA_LINE_ITEMS.forEach(({ rateId, widthElId, lengthElId, capability }) => {
      if (!hasAdditionalWork(product, capability)) return;
      const areaM2 = mmToM(num(doc, widthElId)) * mmToM(num(doc, lengthElId));
      if (areaM2 > 0) extraLineItems.push({ rate: getAdditionalWorkRate(rateId), quantity: areaM2 });
    });
  }

  const productRates = WORK_RATES[Object.keys(PRODUCTS).find(k => PRODUCTS[k] === product)];
  const rates = {
    fabricationRatePerM2: productRates.fabricationRatePerM2,
    installationRatePerM2: productRates.installationRatePerM2,
    polishRatePerM2: productRates.polishRatePerM2,
    miscFlatSum: MISC_FLAT_SUM, miscRatePerM2: MISC_RATE_PER_M2, complexShapeMultiplier: COMPLEX_SHAPE_MULTIPLIER,
    bortikRatePerM: COUNTERTOP_EXTRAS_RATES.bortikRatePerM,
    fartukRatePerM2: COUNTERTOP_EXTRAS_RATES.fartukRatePerM2,
    ostrovRatePerM2: COUNTERTOP_EXTRAS_RATES.ostrovRatePerM2,
  };

  return { rates, extraLineItems, extraDimensions: { bortikLengthM, fartukAreaM2, ostrovAreaM2 } };
}

const stone = {
  id: 'delicato-brown', category: 'marble', colors: [{ segment: 'beige' }],
  slabs: [{ width_cm: 300, length_cm: 200, price_per_m2_rub: 11000, price_total_rub: 66000 }],
};

const SCENARIOS = [
  {
    name: 'kitchen countertop, two simultaneous edge types + sink + cooktop + curb + backsplash, all options on',
    productKey: 'stoleshnitsa_kuhnya',
    values: {
      width: { value: '2000' }, length: { value: '600' },
      'edge-straight': { value: '2000' }, 'edge-chamfer': { value: '500' },
      'cut-sink-overlay': { value: '1' }, 'cut-cooktop': { value: '1' }, 'hole-mixer': { value: '1' },
      'extra-bortik': { value: '500' }, 'extra-fartuk-width': { value: '600' }, 'extra-fartuk-length': { value: '2000' },
      'opt-complex': { checked: true }, 'opt-polish': { checked: true }, 'opt-install': { checked: true },
    },
  },
  {
    name: 'windowsill: edge work but no countertop extras',
    productKey: 'podokonnik',
    values: { width: { value: '1200' }, length: { value: '300' }, 'edge-round': { value: '1200' } },
  },
  {
    name: 'floor: no edge work, no countertop extras, all zero',
    productKey: 'pol',
    values: { width: { value: '3000' }, length: { value: '2000' } },
  },
  {
    name: 'floor: no supportsEdgeWork capability -- a stale edge field is NOT priced',
    productKey: 'pol',
    values: { width: { value: '3000' }, length: { value: '2000' }, 'edge-straight': { value: '500' } },
  },
];

SCENARIOS.forEach(({ name, productKey, values }) => {
  test(`legacy vs constructor-state pricing inputs match: ${name}`, () => {
    const doc = createFakeDoc(values);
    const product = PRODUCTS[productKey];

    const legacy = legacyBuildPricingInputs(doc, product);

    const state = ConstructorState.readConstructorState({ doc, selectedProductKey: productKey, product, stone, hasAdditionalWork });
    const fresh = ConstructorState.buildPricingInputs(state, {
      productRates: WORK_RATES[productKey], miscFlatSum: MISC_FLAT_SUM, miscRatePerM2: MISC_RATE_PER_M2,
      complexShapeMultiplier: COMPLEX_SHAPE_MULTIPLIER, countertopExtrasRates: COUNTERTOP_EXTRAS_RATES, getAdditionalWorkRate,
    });

    assert.deepEqual(fresh.rates, legacy.rates);
    assert.deepEqual(fresh.extraDimensions, legacy.extraDimensions);
    assert.deepEqual(fresh.extraLineItems, legacy.extraLineItems);

    const priceParams = {
      stone, widthM: state.dimensions.widthM, lengthM: state.dimensions.lengthM, productType: product.type,
      marginCm: SAW_MARGIN_CM, wasteFactor: AREA_WASTE_FACTOR, allowSeam: product.allowSeam !== false,
      installEnabled: state.options.installEnabled, polishEnabled: state.options.polishEnabled, complexEnabled: state.options.complexEnabled,
    };
    const legacyResult = Pricing.calculatePrice(Object.assign({}, priceParams, legacy));
    const freshResult = Pricing.calculatePrice(Object.assign({}, priceParams, fresh));
    assert.deepEqual(freshResult, legacyResult);
  });
});
