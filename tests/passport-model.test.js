// tests/passport-model.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { createFakeDoc } = require('./helpers/fake-dom.js');
const ConstructorState = require('../constructor-state.js');
const ProductTypes = require('../product-types.js');
const RateCatalog = require('../rate-catalog.js');
const Pricing = require('../pricing.js');
const ResultModel = require('../result-model.js');
const PassportModel = require('../passport-model.js');

const { PRODUCTS, hasAdditionalWork } = ProductTypes;
const EDGE_TITLES = { straight: 'Прямая', rounding: 'Скругление', bevel: 'Скос (фаска)', figured: 'Фигурная', 'stone-wrap': 'Подгиб камнем' };
const UPDATED_AT = '2026-09-15T23:53:23+03:00';
const STONE = {
  id: 'delicato-brown', name: 'Delicato Brown', category: 'marble', category_label_ru: 'Мрамор',
  countries: [{ label_ru: 'Оман', segment: 'oman' }], available: true, image: 'images/delicato-brown.webp',
  slabs: [
    { article: 'X1', price_total_rub: 44315, width_cm: 300, length_cm: 180 },
    { article: 'X2', price_total_rub: 44315, width_cm: 300, length_cm: 180 },
  ],
};

// A kitchen countertop priced the way the page prices it.
function kitchen(values) {
  const doc = createFakeDoc(Object.assign({ width: { value: '650' }, length: { value: '2400' } }, values));
  const state = ConstructorState.readConstructorState({
    doc, selectedProductKey: 'stoleshnitsa_kuhnya', product: PRODUCTS.stoleshnitsa_kuhnya, stone: STONE, hasAdditionalWork,
  });
  const inputs = ConstructorState.buildPricingInputs(state, {
    productRates: ProductTypes.WORK_RATES.stoleshnitsa_kuhnya,
    miscFlatSum: ProductTypes.MISC_FLAT_SUM, miscRatePerM2: ProductTypes.MISC_RATE_PER_M2,
    complexShapeMultiplier: ProductTypes.COMPLEX_SHAPE_MULTIPLIER,
    countertopExtrasRates: ProductTypes.COUNTERTOP_EXTRAS_RATES,
    getAdditionalWorkRate: RateCatalog.getAdditionalWorkRate,
  });
  const result = Pricing.calculatePrice({
    stone: state.stone, widthM: state.dimensions.widthM, lengthM: state.dimensions.lengthM,
    productType: PRODUCTS.stoleshnitsa_kuhnya.type, rates: inputs.rates, extraLineItems: inputs.extraLineItems, extraDimensions: inputs.extraDimensions,
    installEnabled: state.options.installEnabled, polishEnabled: state.options.polishEnabled, complexEnabled: state.options.complexEnabled,
    marginCm: ProductTypes.SAW_MARGIN_CM, usageLimit: ProductTypes.SLAB_USAGE_LIMIT,
  });
  const configuration = ResultModel.buildConfiguration({ state, productLabel: PRODUCTS.stoleshnitsa_kuhnya.label, subcategory: null, edgeTitles: EDGE_TITLES });
  const pricing = ResultModel.summarizePricing({ kind: 'ok', result }, UPDATED_AT);
  const pricingInputs = { rates: inputs.rates, mainAreaM2: inputs.job.mainAreaM2, complexEnabled: state.options.complexEnabled };
  return { configuration, pricing, result, pricingInputs };
}

const sumRows = spec => spec.sections.reduce((s, sec) => s + sec.rows.reduce((t, r) => t + r.amountRub, 0), 0);

test('passport number: ГГММДД-NNNN', () => {
  assert.equal(PassportModel.passportNumber(new Date(2026, 9, 20), 173), '261020-0173');
  assert.equal(PassportModel.passportNumber(new Date(2026, 0, 5), 9999), '260105-9999');
});

test('file name: Паспорт - <product> - ДД.ММ.ГГГГ.pdf', () => {
  assert.equal(PassportModel.passportFileName('Столешница на кухню', new Date(2026, 9, 20)), 'Паспорт - Столешница на кухню - 20.10.2026.pdf');
});

test('three different shots: the product\'s own view, then two others; no side view of a flat product', () => {
  assert.deepEqual(PassportModel.pickShots('stoleshnitsa_kuhnya', 'iso-eye-level'), ['iso-eye-level', 'top', 'front']);
  assert.deepEqual(PassportModel.pickShots('pol', 'top'), ['top', 'front', 'iso']);
  assert.deepEqual(PassportModel.pickShots('stena', 'front'), ['front', 'top', 'iso']);
  assert.deepEqual(PassportModel.FLAT_PRODUCTS, ['panno', 'pol', 'stena', 'fasad']);
});

test('specification: the sections in order, an empty one left out, never a 0 ₽ row', () => {
  const k = kitchen({ 'opt-install': { checked: true } });
  const spec = PassportModel.buildSpecification(k);
  assert.deepEqual(spec.sections.map(s => s.title), ['Камень', 'Изготовление', 'Монтаж']);
  spec.sections.forEach(s => s.rows.forEach(r => assert.ok(r.amountRub > 0, r.name)));
});

test('stone: identical slabs on one row, their count as the quantity, summing to the stone price', () => {
  const k = kitchen({});
  const slab = { price_total_rub: 44315, width_cm: 300, length_cm: 180 };
  k.result = Object.assign({}, k.result, { matchedSlabs: [slab, Object.assign({}, slab)], nSlabs: 2, subtotal: 88630 });
  k.result.total = k.result.subtotal + k.result.work;
  k.pricing = Object.assign({}, k.pricing, { total: Math.round(k.result.total) });
  const stone = PassportModel.buildSpecification(k).sections[0];
  assert.equal(stone.rows.length, 1);
  assert.equal(stone.rows[0].unit, 'шт.');
  assert.equal(stone.rows[0].qty, 2);
  assert.equal(stone.rows[0].priceRub, 44315);
  assert.equal(stone.rows[0].amountRub, Math.round(k.result.subtotal));
  assert.match(stone.rows[0].name, /Delicato Brown/);
  assert.match(stone.rows[0].name, /3000 × 1800 мм/);
});

test('fabrication: square metres and the rate; a complex shape at its multiplier; polish its own row', () => {
  const k = kitchen({ 'opt-complex': { checked: true }, 'opt-polish': { checked: true } });
  const fab = PassportModel.buildSpecification(k).sections.find(s => s.title === 'Изготовление');
  assert.equal(fab.rows[0].unit, 'м²');
  assert.equal(fab.rows[0].qty, 1.56);
  assert.equal(fab.rows[0].priceRub, 37500 * 1.5);
  assert.equal(fab.rows[0].amountRub, Math.round(k.result.fabrication));
  const polish = fab.rows.find(r => r.name === 'Полировка');
  assert.equal(polish.amountRub, Math.round(k.result.polish));
  assert.equal(polish.priceRub, 18000);
});

test('edge and additional works: one row whose name lists the chosen edge and works', () => {
  const k = kitchen({ 'edge-type': { value: 'bevel' }, 'cut-cooktop': { value: '1' } });
  k.result = Object.assign({}, k.result, { catalogExtras: 4000, total: k.result.total + 4000 });
  k.pricing = Object.assign({}, k.pricing, { total: Math.round(k.result.total) });
  const works = PassportModel.buildSpecification(k).sections.find(s => s.title === 'Кромка и дополнительные работы');
  assert.equal(works.rows.length, 1);
  assert.equal(works.rows[0].amountRub, 4000);
  assert.match(works.rows[0].name, /Скос \(фаска\)/);
  assert.match(works.rows[0].name, /варочн/i);
});

test('the rows add up to the total exactly, even when each row rounds up', () => {
  const k = kitchen({});
  const result = Object.assign({}, k.result, {
    subtotal: 50000, matchedSlabs: [{ price_total_rub: 50000, width_cm: 300, length_cm: 180 }], nSlabs: 1,
    fabrication: 1000.5, installation: 2000.5, polish: 0, extras: 300.5, catalogExtras: 0, groupWork: 0, misc: 0,
  });
  result.total = 50000 + 1000.5 + 2000.5 + 300.5;
  const pricing = Object.assign({}, k.pricing, { total: Math.round(result.total) });
  const spec = PassportModel.buildSpecification(Object.assign({}, k, { result, pricing }));
  assert.equal(spec.totalRub, pricing.total);
  assert.equal(sumRows(spec), pricing.total);
  // The leftover never lands on a row that is exactly price x quantity (a slab).
  const slab = spec.sections[0].rows[0];
  assert.equal(slab.amountRub, 50000);
  assert.equal(slab.amountRub, slab.priceRub * slab.qty);
  spec.sections.slice(1).forEach(sec => sec.rows.forEach(r => assert.ok(Math.abs(r.amountRub - [1000.5, 2000.5, 300.5].find(v => Math.abs(v - r.amountRub) <= 1)) <= 1, r.name)));
});

test("the area is shown precisely enough that rate x area gives the row's sum", () => {
  const k = kitchen({ 'opt-install': { checked: true } });
  const area = 0.792;
  const result = Object.assign({}, k.result, { fabrication: 37500 * area, installation: 17500 * area });
  result.total = result.subtotal + result.fabrication + result.installation;
  const pricing = Object.assign({}, k.pricing, { total: Math.round(result.total) });
  const spec = PassportModel.buildSpecification(Object.assign({}, k, { result, pricing, pricingInputs: Object.assign({}, k.pricingInputs, { mainAreaM2: area }) }));
  const fab = spec.sections.find(s => s.title === 'Изготовление').rows[0];
  assert.equal(fab.qty, 0.792);
  assert.equal(fab.priceRub * fab.qty, fab.amountRub);
});

test('a price for the manager: the line instead of the table, and never 0 ₽ for work without a rate', () => {
  const k = kitchen({});
  const manual = PassportModel.buildSpecification(Object.assign({}, k, { pricing: Object.assign({}, k.pricing, { status: 'manual', total: null, message: null }) }));
  assert.deepEqual(manual, { manual: 'Стоимость рассчитает менеджер' });
  const withMessage = PassportModel.buildSpecification(Object.assign({}, k, { pricing: Object.assign({}, k.pricing, { status: 'manual', total: null, message: 'Камня нет в наличии.' }) }));
  assert.deepEqual(withMessage, { manual: 'Камня нет в наличии.' });
  const unpriced = PassportModel.buildSpecification(Object.assign({}, k, {
    result: Object.assign({}, k.result, { total: null, work: null }),
    pricing: Object.assign({}, k.pricing, { status: 'ok', total: 0 }),
  }));
  assert.deepEqual(unpriced, { manual: 'Стоимость рассчитает менеджер' });
});

test('the passport: number, dates, title, file name, stone, shots and link', () => {
  const k = kitchen({ 'opt-install': { checked: true } });
  const view = ResultModel.buildResultView(k.configuration);
  const doc = PassportModel.buildPassport(Object.assign({}, k, {
    view, stone: STONE, createdAt: new Date(2026, 9, 20), random4: 173, link: 'http://x/?pv=1', defaultPreset: 'iso-eye-level',
  }));
  assert.equal(doc.number, '261020-0173');
  assert.equal(doc.dateText, '20.10.2026');
  assert.equal(doc.pricesDateText, '15.09.2026');
  assert.equal(doc.title, 'Столешница на кухню');
  assert.equal(doc.fileName, 'Паспорт - Столешница на кухню - 20.10.2026.pdf');
  assert.deepEqual(doc.stone, { name: 'Delicato Brown', meta: 'Мрамор · Оман', imagePath: 'data/images/delicato-brown.webp' });
  assert.deepEqual(doc.shots, ['iso-eye-level', 'top', 'front']);
  assert.equal(doc.link, 'http://x/?pv=1');
  assert.equal(doc.specs, view.specs);
  assert.equal(doc.specification.totalRub, k.pricing.total);
  assert.doesNotMatch(JSON.stringify(doc), /—/);
});
