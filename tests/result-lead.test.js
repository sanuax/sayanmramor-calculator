// tests/result-lead.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { createFakeDoc } = require('./helpers/fake-dom.js');
const ConstructorState = require('../constructor-state.js');
const ProductTypes = require('../product-types.js');
const RateCatalog = require('../rate-catalog.js');
const Pricing = require('../pricing.js');
const StepEngine = require('../step-engine.js');
const ResultModel = require('../result-model.js');
const LeadPayload = require('../lead-payload.js');

const { PRODUCTS, hasAdditionalWork } = ProductTypes;

const EDGE_TITLES = { straight: 'Прямая', rounding: 'Скругление', bevel: 'Скос (фаска)', figured: 'Фигурная', 'stone-wrap': 'Подгиб камнем' };

const STONE = {
  id: 'delicato-brown', name: 'Delicato Brown', category: 'marble', category_label_ru: 'Мрамор',
  countries: [{ label_ru: 'Оман', segment: 'oman' }], available: true,
  slabs: [{ article: 'X1', price_total_rub: 44315, width_cm: 300, length_cm: 180 }],
};

function readState(productKey, values, stone) {
  const doc = createFakeDoc(Object.assign({ width: { value: '650' }, length: { value: '2400' } }, values));
  return ConstructorState.readConstructorState({
    doc, selectedProductKey: productKey, product: PRODUCTS[productKey], stone: stone === undefined ? STONE : stone, hasAdditionalWork,
  });
}

function configFor(productKey, values, opts) {
  const o = opts || {};
  return ResultModel.buildConfiguration({
    state: readState(productKey, values, o.stone),
    productLabel: PRODUCTS[productKey].label,
    subcategory: o.subcategory || null,
    edgeTitles: EDGE_TITLES,
    dimensionLabels: o.dimensionLabels,
  });
}

function priceFor(productKey, state) {
  const { rates, extraLineItems, extraDimensions } = ConstructorState.buildPricingInputs(state, {
    productRates: ProductTypes.WORK_RATES[productKey],
    miscFlatSum: ProductTypes.MISC_FLAT_SUM, miscRatePerM2: ProductTypes.MISC_RATE_PER_M2,
    complexShapeMultiplier: ProductTypes.COMPLEX_SHAPE_MULTIPLIER,
    countertopExtrasRates: ProductTypes.COUNTERTOP_EXTRAS_RATES,
    getAdditionalWorkRate: RateCatalog.getAdditionalWorkRate,
  });
  return Pricing.calculatePrice({
    stone: state.stone, widthM: state.dimensions.widthM, lengthM: state.dimensions.lengthM,
    productType: PRODUCTS[productKey].type, rates, extraLineItems, extraDimensions,
    installEnabled: state.options.installEnabled, polishEnabled: state.options.polishEnabled, complexEnabled: state.options.complexEnabled,
    marginCm: ProductTypes.SAW_MARGIN_CM, wasteFactor: ProductTypes.AREA_WASTE_FACTOR,
  });
}

function specKeys(configuration) {
  return ResultModel.buildResultView(configuration).specs.map(s => s.key);
}

const CONTACT = { name: 'Анна', phone: '+79161234567', comment: null };

function payloadFor(productKey, values) {
  const state = readState(productKey, values);
  const configuration = ResultModel.buildConfiguration({ state, productLabel: PRODUCTS[productKey].label, subcategory: null, edgeTitles: EDGE_TITLES });
  const pricing = ResultModel.summarizePricing({ kind: 'ok', result: priceFor(productKey, state) }, '2026-09-15T23:53:23+03:00');
  return LeadPayload.buildLeadPayload({ configuration, pricing, contact: CONTACT, createdAt: '2026-09-23T10:00:00.000Z' });
}

// --- 1. title ---------------------------------------------------------------

test('resultTitle gives a grammatical "Ваш/Ваша/Ваше/Ваши" title for every one of the 9 products', () => {
  const expected = {
    lestnitsa: 'Ваша лестница', panno: 'Ваше панно', podokonnik: 'Ваш подоконник', pol: 'Ваш пол',
    stena: 'Ваша стена', fasad: 'Ваш фасад', stoleshnitsa_vannaya: 'Ваша столешница',
    stoleshnitsa_kuhnya: 'Ваша столешница', stupeni: 'Ваши ступени',
  };
  assert.deepEqual(Object.keys(expected).sort(), Object.keys(PRODUCTS).sort());
  Object.entries(expected).forEach(([key, title]) => assert.equal(ResultModel.resultTitle(key), title));
});

test('resultTitle falls back to a neutral title (never a countertop) for no/unknown product', () => {
  assert.equal(ResultModel.resultTitle(null), 'Ваше изделие');
  assert.equal(ResultModel.resultTitle('nope'), 'Ваше изделие');
});

// --- 2-4. summary from state, irrelevant rows, dimensions --------------------

test('configuration is built from state: product key/label, mm dimensions and area come straight from constructor state', () => {
  const c = configFor('stoleshnitsa_kuhnya', {});
  assert.deepEqual(c.product, { key: 'stoleshnitsa_kuhnya', label: 'Столешницы на кухню', title: 'Ваша столешница' });
  assert.equal(c.dimensions.lengthMm, 2400);
  assert.equal(c.dimensions.widthMm, 650);
  assert.equal(c.dimensions.areaM2, 1.56);
});

test('dimensions are shown as "2400 × 650 мм" with the product\'s own axis labels, never as metres', () => {
  const view = ResultModel.buildResultView(configFor('stena', {}, { dimensionLabels: { length: 'Высота стены', width: 'Ширина стены' } }));
  const dims = view.specs.find(s => s.key === 'dimensions');
  assert.equal(dims.value, '2400 × 650 мм');
  assert.equal(dims.detail, 'высота стены × ширина стены · 1,56 м²');
  assert.doesNotMatch(dims.value, /2\.4|0\.65/);
});

test('floor/panel/wall/facade: no edge, shape, riser or additional-works rows, even with stale values in those fields', () => {
  const stale = {
    'edge-straight': { value: '3000' }, 'cut-sink-undermount': { value: '1' }, 'extra-ostrov-width': { value: '900' },
    'extra-ostrov-length': { value: '1800' }, productShape: { value: 'lshape' }, 'stupeni-riser': { checked: true },
  };
  ['pol', 'panno', 'stena', 'fasad'].forEach(key => {
    const c = configFor(key, stale);
    const view = ResultModel.buildResultView(c);
    assert.deepEqual(view.specs.map(s => s.key), ['dimensions', 'material'], key);
    assert.equal(view.works, null, key + ' must not render an additional-works block at all');
    assert.equal(c.edge, null);
    assert.equal(c.riser, null);
  });
});

test('no spec row ever carries an empty, "undefined", "null" or "—" value', () => {
  Object.keys(PRODUCTS).forEach(key => {
    ResultModel.buildResultView(configFor(key, { 'edge-round': { value: '2000' }, 'opt-install': { checked: true } })).specs.forEach(spec => {
      assert.ok(spec.value && !/undefined|null|^—$/.test(spec.value), key + ': ' + spec.key);
      assert.doesNotMatch(spec.detail, /undefined|null/);
    });
  });
});

// --- 5. material -------------------------------------------------------------

test('material row: name, then "Категория · Страна"', () => {
  const spec = ResultModel.buildResultView(configFor('stoleshnitsa_kuhnya', {})).specs.find(s => s.key === 'material');
  assert.equal(spec.value, 'Delicato Brown');
  assert.equal(spec.detail, 'Мрамор · Оман');
});

test('material without a country shows no dangling separator and invents no country', () => {
  const stone = Object.assign({}, STONE, { countries: [] });
  const c = configFor('stoleshnitsa_kuhnya', {}, { stone });
  assert.equal(c.material.country, null);
  assert.equal(ResultModel.buildResultView(c).specs.find(s => s.key === 'material').detail, 'Мрамор');
});

test('an unavailable stone is never presented as available', () => {
  const c = configFor('stoleshnitsa_kuhnya', {}, { stone: Object.assign({}, STONE, { available: false }) });
  assert.equal(c.material.available, false);
  assert.match(ResultModel.buildResultView(c).specs.find(s => s.key === 'material').detail, /нет в наличии/);
});

// --- 6. edge -----------------------------------------------------------------

test('edge row uses the edge cards\' own title and length, and only for products that support edge work', () => {
  const view = ResultModel.buildResultView(configFor('podokonnik', { 'edge-round': { value: '1500' } }));
  const edge = view.specs.find(s => s.key === 'edge');
  assert.equal(edge.value, 'Скругление');
  assert.equal(edge.detail, '1500 мм');
  assert.equal(configFor('podokonnik', {}).edge, null, 'no edge selected -> no row');
});

// --- 7. additional works -----------------------------------------------------

test('additional works use human labels (never rate ids like CUT-02) with real quantities/dimensions from state', () => {
  const c = configFor('stoleshnitsa_kuhnya', {
    'cut-sink-undermount': { value: '1' }, 'hole-mixer': { value: '2' }, 'extra-bortik': { value: '1200' },
    'extra-fartuk-length': { value: '2400' }, 'extra-fartuk-width': { value: '600' },
  });
  const works = ResultModel.buildResultView(c).works;
  assert.deepEqual(works.map(w => w.label + ': ' + w.detail), [
    'Мойка — снизу: 1 шт.', 'Отверстие под смеситель: 2 шт.', 'Бортик: 1200 мм', 'Фартук: 2400 × 600 мм',
  ]);
  works.forEach(w => assert.doesNotMatch(w.label, /[A-Z]+-\d+/));
});

test('countertop with no additional works selected gets an empty list (UI: "Без дополнительных работ"), not a missing block', () => {
  const view = ResultModel.buildResultView(configFor('stoleshnitsa_vannaya', {}));
  assert.deepEqual(view.works, []);
});

test('a half-filled area work (only one dimension) is not listed -- it is not priced either', () => {
  const c = configFor('stoleshnitsa_kuhnya', { 'extra-fartuk-length': { value: '2400' } });
  assert.deepEqual(c.additionalWorks, []);
});

// --- 8. pricing integration --------------------------------------------------

test('pricing summary comes from the existing pricing engine: same total, only non-zero breakdown lines', () => {
  const state = readState('stoleshnitsa_kuhnya', { 'opt-install': { checked: true } });
  const result = priceFor('stoleshnitsa_kuhnya', state);
  assert.equal(result.ok, true);
  const pricing = ResultModel.summarizePricing({ kind: 'ok', result }, '2026-09-15');
  assert.equal(pricing.status, 'ok');
  assert.equal(pricing.total, Math.round(result.total));
  assert.equal(pricing.lines[0].key, 'stone');
  assert.equal(pricing.lines[0].amountRub, 44315);
  pricing.lines.forEach(line => assert.ok(line.amountRub > 0, line.key + ' must not be a 0 ₽ line'));
  const sum = pricing.lines.reduce((s, l) => s + l.amountRub, 0);
  assert.ok(Math.abs(sum - pricing.total) <= pricing.lines.length, 'lines must add up to the total');
});

test('null-rate additional works add no price line (null rate = 0 contribution, not a fake price)', () => {
  const state = readState('stoleshnitsa_kuhnya', {});
  const pricing = ResultModel.summarizePricing({ kind: 'ok', result: priceFor('stoleshnitsa_kuhnya', state) });
  const withWorks = readState('stoleshnitsa_kuhnya', { 'extra-ostrov-width': { value: '900' }, 'extra-ostrov-length': { value: '1800' } });
  const pricingWorks = ResultModel.summarizePricing({ kind: 'ok', result: priceFor('stoleshnitsa_kuhnya', withWorks) });
  if (ProductTypes.COUNTERTOP_EXTRAS_RATES.ostrovRatePerM2 == null) {
    assert.equal(pricingWorks.total, pricing.total);
    assert.equal(pricingWorks.lines.some(l => l.key === 'works'), false);
  } else {
    assert.ok(pricingWorks.total > pricing.total);
  }
});

test('manual/incomplete pricing never produces a number', () => {
  const manual = ResultModel.summarizePricing({ kind: 'manual', reason: 'no_fitting_slab', message: 'msg' });
  assert.deepEqual([manual.status, manual.total, manual.lines, manual.reason, manual.message], ['manual', null, [], 'no_fitting_slab', 'msg']);
  const failed = ResultModel.summarizePricing({ kind: 'ok', result: { ok: false, reason: 'insufficient_stock' } });
  assert.equal(failed.status, 'manual');
  assert.equal(failed.total, null);
  assert.equal(ResultModel.summarizePricing({ kind: 'incomplete' }).total, null);
});

// --- 9-15. payload -----------------------------------------------------------

test('buildLeadPayload has product, full configuration, pricing and contact', () => {
  const p = payloadFor('stoleshnitsa_kuhnya', { 'cut-sink-undermount': { value: '1' }, 'edge-straight': { value: '2400' } });
  assert.equal(p.schemaVersion, 1);
  assert.deepEqual(p.product, { key: 'stoleshnitsa_kuhnya', label: 'Столешницы на кухню' });
  assert.deepEqual(p.configuration.material, {
    id: 'delicato-brown', name: 'Delicato Brown', category: 'marble', categoryLabel: 'Мрамор', country: 'Оман', available: true,
  });
  assert.equal(p.configuration.dimensions.lengthMm, 2400);
  assert.equal(p.configuration.dimensions.widthMm, 650);
  assert.equal(p.configuration.shape.type, 'straight');
  assert.equal(p.configuration.edge.label, 'Прямая');
  assert.equal(p.configuration.additionalWorks[0].key, 'sink.undermount');
  assert.equal(p.pricing.status, 'ok');
  assert.ok(p.pricing.total > 0);
  assert.equal(p.pricing.currency, 'RUB');
  assert.equal(p.pricing.preliminary, true);
  assert.ok(Array.isArray(p.pricing.breakdown));
  assert.deepEqual(p.contact, CONTACT);
});

test('payload survives a JSON round trip unchanged (fully serialisable)', () => {
  const p = payloadFor('stoleshnitsa_kuhnya', { 'hole-mixer': { value: '1' }, productShape: { value: 'lshape' }, 'wing-width': { value: '600' }, 'wing-length': { value: '1200' } });
  assert.deepEqual(JSON.parse(JSON.stringify(p)), p);
});

test('payload contains only plain data -- no functions, DOM-like nodes, class instances or cycles', () => {
  const p = payloadFor('stoleshnitsa_kuhnya', { 'cut-sink-overlay': { value: '1' } });
  (function walk(v, path) {
    if (v === null) return;
    const t = typeof v;
    assert.ok(['string', 'number', 'boolean', 'object'].includes(t), path + ' is ' + t);
    if (t !== 'object') return;
    assert.ok(Array.isArray(v) || Object.getPrototypeOf(v) === Object.prototype, path + ' is not a plain object');
    assert.equal(v.nodeType, undefined, path + ' looks like a DOM node');
    assert.equal(v.isObject3D, undefined, path + ' looks like a Three.js object');
    Object.keys(v).forEach(k => walk(v[k], path + '.' + k));
  })(p, 'payload');
});

test('payload never carries the raw stone record (no slabs, source_url or hardness_category)', () => {
  const s = JSON.stringify(payloadFor('stoleshnitsa_kuhnya', {}));
  assert.doesNotMatch(s, /slabs"|source_url|hardness_category|price_total_rub/);
});

// --- 16. contact validation --------------------------------------------------

test('validateContact: name and phone are required, comment is optional', () => {
  const empty = LeadPayload.validateContact({ name: '   ', phone: '', comment: '' });
  assert.equal(empty.ok, false);
  assert.equal(empty.errors.name, 'Укажите имя');
  assert.equal(empty.errors.phone, 'Укажите телефон');
  assert.equal(empty.errors.comment, undefined);
  const ok = LeadPayload.validateContact({ name: ' Анна ', phone: '8 (916) 123-45-67', comment: '' });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.value, { name: 'Анна', phone: '+79161234567', comment: null });
});

test('normalizePhone: common Russian spellings normalise, garbage is rejected', () => {
  assert.equal(LeadPayload.normalizePhone('+7 (916) 123-45-67'), '+79161234567');
  assert.equal(LeadPayload.normalizePhone('89161234567'), '+79161234567');
  assert.equal(LeadPayload.normalizePhone('916 123 45 67'), '+79161234567');
  assert.equal(LeadPayload.normalizePhone('+44 20 7946 0958'), '+442079460958');
  assert.equal(LeadPayload.normalizePhone('12345'), null);
  assert.equal(LeadPayload.normalizePhone('call me'), null);
  assert.equal(LeadPayload.validateContact({ name: 'A', phone: '12345' }).errors.phone, 'Проверьте номер телефона');
});

// --- 17-19. per-product results ----------------------------------------------

test('kitchen result: L-shape with wing, edge, every countertop extra incl. cooktop/island/bar', () => {
  const c = configFor('stoleshnitsa_kuhnya', {
    productShape: { value: 'lshape' }, 'shape-corner': { value: 'right' }, 'wing-width': { value: '600' }, 'wing-length': { value: '1200' },
    'edge-straight': { value: '3600' }, 'cut-sink-integrated': { value: '1' }, 'cut-cooktop': { value: '1' },
    'hole-socket': { value: '1' }, 'extra-wallpanel-width': { value: '900' }, 'extra-wallpanel-length': { value: '2400' },
    'extra-ostrov-figured-width': { value: '900' }, 'extra-ostrov-figured-length': { value: '1800' },
    'extra-bar-complex-width': { value: '500' }, 'extra-bar-complex-length': { value: '1200' },
  });
  assert.deepEqual(specKeys(c), ['shape', 'dimensions', 'wing', 'material', 'edge']);
  const view = ResultModel.buildResultView(c);
  assert.equal(view.specs.find(s => s.key === 'shape').detail, 'угол справа');
  assert.equal(view.specs.find(s => s.key === 'wing').value, '1200 × 600 мм');
  assert.deepEqual(c.additionalWorks.map(w => w.key), ['sink.integrated', 'cooktop', 'hole.socket', 'wallPanel', 'island.figured', 'barCounter.complex']);
});

test('bathroom result: no cooktop/island/bar even when those fields hold values, bathroom extras still listed', () => {
  const c = configFor('stoleshnitsa_vannaya', {
    'cut-cooktop': { value: '1' }, 'extra-ostrov-width': { value: '900' }, 'extra-ostrov-length': { value: '1800' },
    'extra-bar-standard-width': { value: '500' }, 'extra-bar-standard-length': { value: '1200' },
    'cut-sink-overlay': { value: '1' }, 'extra-bortik': { value: '800' },
  });
  assert.deepEqual(c.additionalWorks.map(w => w.key), ['sink.overlay', 'curb']);
});

test('steps result: type row from the subcategory, riser row, edge -- and no additional-works block', () => {
  const c = configFor('stupeni', { 'stupeni-riser': { checked: true }, 'edge-chamfer': { value: '1200' } }, {
    subcategory: { id: 'STEP-02', label: 'Ступень — Забежная', unit: 'м²' },
  });
  const view = ResultModel.buildResultView(c);
  assert.deepEqual(view.specs.map(s => s.key), ['type', 'dimensions', 'steps', 'material', 'edge', 'riser']);
  assert.equal(view.specs.find(s => s.key === 'riser').value, 'С подступенками');
  assert.equal(view.specs.find(s => s.key === 'type').value, 'Ступень — Забежная');
  assert.equal(view.works, null);
  assert.equal(configFor('stupeni', {}).riser, false);
});

test('a type row with a "шт." unit shows the real quantity only when one was entered', () => {
  const sub = { id: 'X', label: 'Балясина', unit: 'шт.' };
  assert.equal(configFor('lestnitsa', { subcategoryQty: { value: '12' } }, { subcategory: sub }).type.quantity, 12);
  assert.equal(configFor('lestnitsa', {}, { subcategory: sub }).type.quantity, null);
});

// --- 20. state persistence / edit shortcuts ----------------------------------

test('editing one field changes only that part of the result; everything else is preserved', () => {
  const base = { 'edge-round': { value: '2400' }, 'cut-sink-undermount': { value: '1' }, 'opt-polish': { checked: true } };
  const before = configFor('stoleshnitsa_kuhnya', base);
  assert.deepEqual(configFor('stoleshnitsa_kuhnya', base), before, 'rebuilding from the same state is identical');
  const after = configFor('stoleshnitsa_kuhnya', Object.assign({}, base, { length: { value: '3000' } }));
  assert.equal(after.dimensions.lengthMm, 3000);
  assert.deepEqual(after.edge, before.edge);
  assert.deepEqual(after.additionalWorks, before.additionalWorks);
  assert.deepEqual(after.material, before.material);
  assert.deepEqual(after.options, before.options);
});

test('edit shortcuts follow the product\'s own step order and never include the Result itself', () => {
  const kitchen = ResultModel.buildEditTargets(StepEngine.getSteps('stoleshnitsa_kuhnya'), StepEngine.STEP_LABELS);
  assert.deepEqual(kitchen.map(t => t.stepId), ['shape', 'dimensions', 'material', 'edge', 'additionalWorks', 'options']);
  assert.equal(kitchen.find(t => t.stepId === 'additionalWorks').label, 'Доп. работы');
  const pol = ResultModel.buildEditTargets(StepEngine.getSteps('pol'), StepEngine.STEP_LABELS).map(t => t.stepId);
  assert.deepEqual(pol, ['type', 'dimensions', 'material', 'options']);
  assert.deepEqual(ResultModel.buildEditTargets([], StepEngine.STEP_LABELS), []);
});

test('options row lists exactly the checked options with the checkbox wording', () => {
  const c = configFor('pol', { 'opt-install': { checked: true }, 'opt-complex': { checked: true } });
  assert.deepEqual(c.options, [
    { key: 'complex', label: 'Сложная форма / фигурный рез' },
    { key: 'install', label: 'Монтаж на объекте' },
  ]);
});

test('П-shaped countertop: the shape and both wings reach the Result', () => {
  const c = configFor('stoleshnitsa_kuhnya', { productShape: { value: 'ushape' }, 'wing-width': { value: '600' }, 'wing-length': { value: '1200' } });
  assert.equal(c.shape.type, 'ushape');
  assert.equal(c.shape.label, 'П-образная');
  assert.equal(c.shape.corner, null);
  assert.equal(c.shape.wing.count, 2);
});

test('step count: one value in state, Result and lead -- «Ступени» never also shows the generic piece count', () => {
  const c = configFor('stupeni', { 'step-count': { value: '8' }, subcategoryQty: { value: '3' } }, { subcategory: { id: 'STEP-01', label: 'Прямая', unit: 'шт.' } });
  assert.deepEqual(c.steps, { count: 8 });
  assert.equal(c.type.quantity, null, 'no second, different quantity next to the type');
  const view = ResultModel.buildResultView(c);
  assert.equal(view.specs.find(s => s.key === 'steps').value, '8 шт.');
  const lestnitsa = configFor('lestnitsa', { 'step-count': { value: '12' } });
  assert.deepEqual(lestnitsa.steps, { count: 12 });
  assert.equal(configFor('pol', { 'step-count': { value: '12' } }).steps, null);
  assert.deepEqual(payloadFor('lestnitsa', { 'step-count': { value: '5' } }).configuration.steps, { count: 5 });
});
