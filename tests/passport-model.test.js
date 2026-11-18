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
  const inputs = ConstructorState.buildPricingInputs(state, { catalog: RateCatalog });
  const result = Pricing.calculatePrice({
    stone: state.stone, widthM: state.dimensions.widthM, lengthM: state.dimensions.lengthM,
    productType: PRODUCTS.stoleshnitsa_kuhnya.type, rates: inputs.rates, extraLineItems: inputs.extraLineItems,
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
  // «Прочее»: the unloading and consumables (6 000 ₽/m²) are in every calculation.
  assert.deepEqual(spec.sections.map(s => s.title), ['Камень', 'Изготовление', 'Монтаж', 'Прочее']);
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
  assert.equal(fab.rows[0].priceRub, 40000 * 1.5); // KITCHEN-11, marble x1, complex x1.5
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
    fabrication: 1000.5, installation: 2000.5, polish: 0, catalogExtras: 300.5, groupWork: 0, misc: 0, unloading: 0,
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
  const result = Object.assign({}, k.result, { fabrication: 40000 * area, installation: 20000 * area });
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

test('an L countertop\'s seam (SEAM-01) is in the rows, which still add up to the total', () => {
  const doc = createFakeDoc({ width: { value: '600' }, length: { value: '2400' }, productShape: { value: 'lshape' }, 'wing-width': { value: '600' }, 'wing-length': { value: '1200' } });
  const state = ConstructorState.readConstructorState({
    doc, selectedProductKey: 'stoleshnitsa_kuhnya', product: PRODUCTS.stoleshnitsa_kuhnya, stone: STONE, hasAdditionalWork,
  });
  const inputs = ConstructorState.buildPricingInputs(state, { catalog: RateCatalog });
  const result = Pricing.calculatePrice({
    stone: state.stone, productType: PRODUCTS.stoleshnitsa_kuhnya.type, rates: inputs.rates, extraLineItems: inputs.extraLineItems,
    marginCm: ProductTypes.SAW_MARGIN_CM, usageLimit: ProductTypes.SLAB_USAGE_LIMIT,
    job: inputs.job, groupRates: inputs.groupRates, seamRate: inputs.seamRate, shape: inputs.shape,
  });
  assert.equal(result.ok, true, result.reason);
  assert.equal(result.seams.amount, 25000);
  const configuration = ResultModel.buildConfiguration({ state, productLabel: PRODUCTS.stoleshnitsa_kuhnya.label, subcategory: null, edgeTitles: EDGE_TITLES });
  const pricing = ResultModel.summarizePricing({ kind: 'ok', result }, UPDATED_AT);
  assert.equal(pricing.lines.reduce((s, l) => s + l.amountRub, 0), pricing.total, 'result lines add up');
  const spec = PassportModel.buildSpecification({ configuration, pricing, result, pricingInputs: { rates: inputs.rates, mainAreaM2: inputs.job.mainAreaM2 } });
  assert.equal(sumRows(spec), pricing.total);
  // The seams have their own line and row (SEAM-01 x 25 000 per seam).
  assert.equal(pricing.lines.find(l => l.key === 'seams').amountRub, 25000);
  assert.equal(pricing.lines.some(l => l.key === 'works'), false);
  const seamRow = spec.sections.find(sec => sec.title === 'Кромка и дополнительные работы').rows[0];
  assert.deepEqual([seamRow.name, seamRow.unit, seamRow.qty, seamRow.priceRub, seamRow.amountRub], ['Швы (переполировка)', 'шт.', 1, 25000, 25000]);
});

test('a minimum-order top-up has its own line and row, so lines and rows still add up to the 20 000 total', () => {
  const cheap = Object.assign({}, STONE, { slabs: [{ article: 'C1', price_total_rub: 5000, width_cm: 300, length_cm: 150 }] });
  const doc = createFakeDoc({ width: { value: '300' }, length: { value: '200' }, productSubcategory: { value: 'SILL-01' } });
  const state = ConstructorState.readConstructorState({ doc, selectedProductKey: 'podokonnik', product: PRODUCTS.podokonnik, stone: cheap, hasAdditionalWork });
  const inputs = ConstructorState.buildPricingInputs(state, { catalog: RateCatalog });
  const result = Pricing.calculatePrice({
    stone: cheap, productType: PRODUCTS.podokonnik.type, rates: inputs.rates, extraLineItems: inputs.extraLineItems,
    marginCm: ProductTypes.SAW_MARGIN_CM, usageLimit: ProductTypes.SLAB_USAGE_LIMIT, job: inputs.job, groupRates: inputs.groupRates,
  });
  assert.equal(result.total, 20000);
  assert.equal(result.minOrderApplied, true);
  const configuration = ResultModel.buildConfiguration({ state, productLabel: PRODUCTS.podokonnik.label, subcategory: null, edgeTitles: EDGE_TITLES });
  const pricing = ResultModel.summarizePricing({ kind: 'ok', result }, UPDATED_AT);
  assert.equal(pricing.total, 20000);
  assert.ok(pricing.lines.some(l => l.key === 'minOrder' && l.amountRub > 0));
  assert.equal(pricing.lines.reduce((s, l) => s + l.amountRub, 0), 20000, 'result lines add up exactly');
  const spec = PassportModel.buildSpecification({ configuration, pricing, result, pricingInputs: { rates: inputs.rates, mainAreaM2: inputs.job.mainAreaM2 } });
  assert.equal(sumRows(spec), 20000);
  assert.ok(spec.sections.some(sec => sec.rows.some(r => r.name === 'Доплата до минимального заказа')));
});

// Every line of the v2 rates in one result (the fractions are the ones that
// make independently rounded rows drift; the exact sum is 250 156,80).
function everyLine(k) {
  const result = Object.assign({}, k.result, {
    subtotal: 44315, matchedSlabs: [{ price_total_rub: 44315, width_cm: 300, length_cm: 180 }], nSlabs: 1,
    fabrication: 62400.4, installation: 31200.3, polish: 28080.2, lighting: 7800.1,
    seams: { count: 2, amount: 50000 }, catalogExtras: 4000.45, groupWork: 0,
    measure: 5000, delivery: 8000, unloading: 9360.35, misc: 22360.35, minOrderApplied: false, minOrderTopUp: 0, total: 250156.8,
  });
  const rates = Object.assign({}, k.pricingInputs.rates, { fabricationRatePerM2: 40000, installationRatePerM2: 20000, polishRatePerM2: 18000, lightingRatePerM2: 5000, misc: { perM2: 6000 } });
  return Object.assign({}, k, { result, pricing: Object.assign({}, k.pricing, { total: 250157 }), pricingInputs: Object.assign({}, k.pricingInputs, { rates }) });
}

test('specification rows add up to the total with the new lines, the same amounts as the result lines', () => {
  const k = everyLine(kitchen({ 'opt-install': { checked: true } }));
  const lines = ResultModel.summarizePricing({ kind: 'ok', result: k.result }, UPDATED_AT).lines;
  const spec = PassportModel.buildSpecification(k);
  assert.equal(spec.totalRub, 250157);
  assert.equal(sumRows(spec), 250157);
  assert.deepEqual(spec.sections.map(s => s.title), ['Камень', 'Изготовление', 'Монтаж', 'Подсветка', 'Кромка и дополнительные работы', 'Прочее']);
  const rows = spec.sections.flatMap(s => s.rows);
  assert.deepEqual(rows.map(r => r.amountRub), [44315, 62401, 28080, 31200, 7800, 50000, 4001, 5000, 8000, 9360]);
  assert.deepEqual(rows.map(r => r.name).slice(-4), ['Кромка и дополнительные работы', 'Замер', 'Доставка', 'Разгрузка и расходные материалы']);
  // Row by row the very amounts of the result lines.
  const byAmount = rows.map(r => r.amountRub).sort((a, b) => a - b);
  assert.deepEqual(byAmount, lines.map(l => l.amountRub).sort((a, b) => a - b));
});

test('the unloading row shows the stone area and the MISC rate it is made of', () => {
  const k = everyLine(kitchen({}));
  k.result.unloading = 9360; // 6 000 per m2 of the 1,56 m2 of stone
  k.pricing.total = 250157 - 1;
  const row = PassportModel.buildSpecification(k).sections.find(s => s.title === 'Прочее').rows.find(r => r.name === 'Разгрузка и расходные материалы');
  assert.equal(row.unit, 'м²');
  assert.equal(row.priceRub, 6000);
  assert.equal(row.qty, 1.56);
  const measure = PassportModel.buildSpecification(k).sections.find(s => s.title === 'Прочее').rows.find(r => r.name === 'Замер');
  assert.deepEqual([measure.unit, measure.qty, measure.priceRub, measure.amountRub], [null, null, null, 5000]);
});

test('a stair fabrication that mixes the type rate and the landing rate shows its real amount and no rate per m2', () => {
  const k = kitchen({});
  const mixed = Object.assign({}, k, {
    result: Object.assign({}, k.result, { fabrication: 100000, polish: 0, installation: 0, lighting: 0, catalogExtras: 0, misc: 0, unloading: 0, measure: 0, delivery: 0, landing: { fabrication: 24000, installation: 0, polish: 0 }, total: k.result.subtotal + 100000 }),
    pricing: Object.assign({}, k.pricing, { total: Math.round(k.result.subtotal) + 100000 }),
    pricingInputs: { rates: { fabricationRatePerM2: 50000, landingRates: { fabricationRatePerM2: 30000 } }, mainAreaM2: 2, complexEnabled: false },
  });
  const fab = PassportModel.buildSpecification(mixed).sections.find(s => s.title === 'Изготовление').rows[0];
  assert.equal(fab.amountRub, 100000);
  assert.equal(fab.priceRub, null, 'no single rate: two are mixed');
  assert.equal(sumRows(PassportModel.buildSpecification(mixed)), mixed.pricing.total);
  // The landing at the very same rate: the one rate is still honest.
  const same = Object.assign({}, mixed, { pricingInputs: { rates: { fabricationRatePerM2: 50000, landingRates: { fabricationRatePerM2: 50000 } }, mainAreaM2: 2, complexEnabled: false } });
  const fab2 = PassportModel.buildSpecification(same).sections.find(s => s.title === 'Изготовление').rows[0];
  assert.equal(fab2.priceRub, 50000);
  assert.equal(fab2.qty, 2);
});

test('passport carries the Moscow note under the total', () => {
  const NOTE = '* Расчёт указан для объектов, находящихся в Москве и Московской области';
  const k = kitchen({ 'opt-install': { checked: true } });
  assert.equal(PassportModel.buildSpecification(k).note, NOTE);
  const doc = PassportModel.buildPassport(Object.assign({}, k, {
    view: ResultModel.buildResultView(k.configuration), stone: STONE, createdAt: new Date(2026, 9, 20), random4: 173, link: 'http://x/?pv=1', defaultPreset: 'iso-eye-level',
  }));
  assert.equal(doc.specification.note, NOTE);
  assert.equal(PassportModel.buildSpecification({ result: null, pricing: { status: 'manual', message: 'm' } }).note, undefined, 'no total, no note');
});

test('the project\'s passport: its number and file name as a passport\'s, every product\'s passport numbered as the project', () => {
  const at = new Date(2026, 10, 17, 12, 0, 0);
  const item = { number: 'x', dateText: 'y', title: 'Подоконник' };
  const p = PassportModel.buildProjectPassport({
    items: [item, Object.assign({}, item, { title: 'Ступени' })], rows: [], lines: [], totalRub: 1000, manual: null,
    createdAt: at, random4: 42, link: 'L', pricesDateText: '15.09.2026',
  });
  assert.equal(p.project, true);
  assert.equal(p.number, '261117-0042');
  assert.equal(p.fileName, 'Паспорт - Проект - 17.11.2026.pdf');
  assert.equal(p.items.length, 2);
  assert.ok(p.items.every(i => i.number === '261117-0042' && i.dateText === '17.11.2026'));
  assert.equal(item.number, 'x', 'the products\' own passports are not changed');
  assert.equal(p.totalRub, 1000);
});
