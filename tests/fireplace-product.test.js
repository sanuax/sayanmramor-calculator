// tests/fireplace-product.test.js
//
// «Камины» as a registered product: its PRODUCTS entry, steps, catalog rows
// and (null) rates, how ConstructorState reads it, and -- the point of this
// stage -- what the price is with no company rate: the stone is priced, the
// work and the total are left to the manager, never a free «0 ₽» work.
// Offered in the configurator: its card, the type step, a portal's form
// (stage 7.1) and its own size fields (stage 7.2).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createFakeDoc } = require('./helpers/fake-dom.js');
const FireplaceModel = require('../fireplace-model.js');
const ProductTypes = require('../product-types.js');
const StepEngine = require('../step-engine.js');
const RateCatalog = require('../rate-catalog.js');
const ConstructorState = require('../constructor-state.js');
const Pricing = require('../pricing.js');
const GeometryModel = require('../visualizer/geometry-model.js');

const { PRODUCTS, WORK_RATES, hasAdditionalWork } = ProductTypes;
const { PARAM_FIELDS, FORM_FIELD } = FireplaceModel;
const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, (msg || '') + ': ' + a + ' vs ' + b);

const portal = FireplaceModel.getTypeByKey('portal');
const cladding = FireplaceModel.getTypeByKey('cladding');
const podium = FireplaceModel.getTypeByKey('podium');
const PORTAL = { openingWidth: 900, openingHeight: 700, pierWidth: 250, lintelHeight: 250, depth: 200, shelfProjection: 60 };

// Everything another product might have left on the page: generic sizes, a
// quantity, a shape, extras, cuts, edges and every option ticked.
const LEFTOVERS = {
  width: { value: '650' }, length: { value: '2400' }, subcategoryQty: { value: '7' },
  productShape: { value: 'lshape' }, 'wing-width': { value: '600' }, 'wing-length': { value: '1200' },
  'extra-bortik': { value: '3000' }, 'extra-fartuk-width': { value: '600' }, 'extra-fartuk-length': { value: '2400' },
  'cut-sink-overlay': { value: '1' }, 'cut-cooktop': { value: '1' }, 'hole-mixer': { value: '2' },
  'edge-straight': { value: '2400' },
  'opt-complex': { checked: true }, 'opt-polish': { checked: true }, 'opt-install': { checked: true },
};

function fireplaceFields(type, formId, sizesMm) {
  const v = { productSubcategory: { value: type.id }, [FORM_FIELD]: { value: formId || '' } };
  Object.entries(sizesMm).forEach(([k, mm]) => { v[PARAM_FIELDS[k]] = { value: String(mm) }; });
  return v;
}

function stateFor(key, values) {
  const doc = createFakeDoc(values);
  return ConstructorState.readConstructorState({ doc, selectedProductKey: key, product: PRODUCTS[key], stone: null, hasAdditionalWork });
}

// None of the shared option boxes ticked.
const NO_OPTIONS = { 'opt-complex': { checked: false }, 'opt-polish': { checked: false }, 'opt-install': { checked: false } };
const portalState = extra => stateFor('kaminy', Object.assign({}, LEFTOVERS, fireplaceFields(portal, 'with-shelf', PORTAL), extra || {}));

function inputsFor(state) {
  return ConstructorState.buildPricingInputs(state, {
    productRates: WORK_RATES[state.product.key],
    miscFlatSum: ProductTypes.MISC_FLAT_SUM, miscRatePerM2: ProductTypes.MISC_RATE_PER_M2,
    complexShapeMultiplier: ProductTypes.COMPLEX_SHAPE_MULTIPLIER,
    countertopExtrasRates: ProductTypes.COUNTERTOP_EXTRAS_RATES,
    getAdditionalWorkRate: RateCatalog.getAdditionalWorkRate,
    riserRates: ProductTypes.RISER_WORK_RATES,
    extrasInstallRates: ProductTypes.COUNTERTOP_EXTRAS_INSTALL_RATES,
  });
}

const SLABS = Array.from({ length: 12 }, (_, i) => ({ article: 'S' + i, width_cm: 200, length_cm: 320, price_total_rub: 60000 + i }));
const STONE = { id: 'test-stone', slabs: SLABS };

function priceOf(state) {
  const { rates, extraLineItems, extraDimensions, job, groupRates } = inputsFor(state);
  return Pricing.calculatePrice({
    stone: STONE, widthM: state.dimensions.widthM, lengthM: state.dimensions.lengthM,
    productType: state.product.type, rates, extraLineItems, extraDimensions, job, groupRates,
    installEnabled: state.options.installEnabled, polishEnabled: state.options.polishEnabled, complexEnabled: state.options.complexEnabled,
    marginCm: ProductTypes.SAW_MARGIN_CM, usageLimit: ProductTypes.SLAB_USAGE_LIMIT,
  });
}

// ---- PRODUCTS --------------------------------------------------------------------

test('PRODUCTS.kaminy: «Камины», cut as pieces, its own camera angle', () => {
  const k = PRODUCTS.kaminy;
  assert.ok(k);
  assert.equal(k.label, 'Камины');
  assert.equal(k.type, 'A');
  assert.equal(k.cameraPreset, 'front');
  assert.notEqual(k.allowSeam, false);
});

test('«Камины» are the three approved types: портал (с полкой / без полки), облицовка короба, подиум', () => {
  assert.deepEqual(FireplaceModel.FIREPLACE_TYPES.map(t => [t.id, t.key, t.title]), [
    ['FIREPLACE-01', 'portal', 'Каминный портал'],
    ['FIREPLACE-02', 'cladding', 'Облицовка каминного короба'],
    ['FIREPLACE-03', 'podium', 'Подиум камина'],
  ]);
  assert.deepEqual(portal.forms.map(f => [f.id, f.title]), [['with-shelf', 'С полкой'], ['without-shelf', 'Без полки']]);
  // The type step lists exactly these, from the catalog (as for every product).
  assert.deepEqual(RateCatalog.getSubcategoriesForProduct(PRODUCTS.kaminy.label).map(r => r.id), ['FIREPLACE-01', 'FIREPLACE-02', 'FIREPLACE-03']);
});

test('«Камины» get none of another product\'s capabilities: no edge, countertop extras or shape -- but the shared options', () => {
  const k = PRODUCTS.kaminy;
  ['supportsEdgeWork', 'supportsCountertopExtras', 'supportsShapeSelection'].forEach(f => assert.ok(!k[f], f));
  assert.equal(k.additionalWorks, undefined);
  ['sinkCutout', 'cooktopCutout', 'holes', 'curb', 'backsplash', 'wallPanel', 'island', 'barCounter']
    .forEach(c => assert.equal(hasAdditionalWork(k, c), false, c));
  // The options every product has (stage 7.3): no product opts out of them.
  Object.entries(PRODUCTS).forEach(([key, p]) => assert.notEqual(p.supportsOptions, false, key));
});

test('no quantity for a fireplace: always one piece, no field for it', () => {
  FireplaceModel.FIREPLACE_TYPES.forEach(t => assert.equal(t.quantity, undefined, t.key));
  assert.ok(!Object.values(PARAM_FIELDS).some(id => /quantity|qty/i.test(id)));
  assert.equal(portalState().subcategory.qty, 0, 'the generic «Количество, шт.» never reaches it');
});

// ---- the configurator page (stage 7.1) -------------------------------------------

const html = fs.readFileSync(path.join(__dirname, '..', 'sayanmramor-calculator.html'), 'utf8');
const UrlBootstrap = require('../url-bootstrap.js');
const htmlBetween = (from, to) => {
  const start = html.indexOf(from);
  assert.ok(start >= 0, from);
  return html.slice(start, html.indexOf(to, start));
};

test('«Камины» are offered: the tenth product card, no showroom link', () => {
  assert.ok(!PRODUCTS.kaminy.configuratorHidden);
  assert.equal(PRODUCTS.kaminy.showroom, false);
  Object.entries(PRODUCTS).filter(([key]) => key !== 'kaminy').forEach(([key, p]) => assert.notEqual(p.showroom, false, key + ' is in the showroom'));
  // The page builds one card per offered product, with the same generator.
  assert.match(html, /Object\.entries\(PRODUCTS\)\.filter\(\(\[, val\]\) => !val\.configuratorHidden\)\.forEach/);
  const offered = Object.entries(PRODUCTS).filter(([, p]) => !p.configuratorHidden);
  assert.equal(offered.length, 10);
  assert.deepEqual(offered[offered.length - 1], ['kaminy', PRODUCTS.kaminy]);
  assert.equal(offered.filter(([, p]) => p.label === 'Камины').length, 1);
  // Its card scene sits with the others' (PRODUCT_ICONS), in the same system.
  assert.match(htmlBetween('const PRODUCT_ICONS = {', 'const PRODUCT_HINTS'), /\n    kaminy: '<defs>/);
});

test('?product=kaminy selects the fireplace through its card', () => {
  assert.equal(UrlBootstrap.resolveInitialProductKey('kaminy', PRODUCTS), 'kaminy');
  // The bootstrap picks a product by its card's radio -- the fireplace has one.
  assert.match(html, /productGrid\.querySelector\('input\[value="' \+ initialProductKey \+ '"\]'\)/);
  // fireplace-model.js is loaded before the modules that read it and the page script.
  const at = src => html.indexOf('<script src="' + src + '"></script>');
  assert.ok(at('fireplace-model.js') > 0);
  ['constructor-state.js', 'visualizer/geometry-model.js', 'product-parts.js'].forEach(src => assert.ok(at('fireplace-model.js') < at(src), src));
  // Everything the synchronous bootstrap reaches is declared before it (TDZ).
  const bootstrap = html.indexOf('const initialProductKey');
  ['const FIREPLACE_TYPE_ICONS', 'const FIREPLACE_FORM_ICONS', 'const fireplaceFormByType', 'const fireplaceSizesByType', 'const fireplaceFieldsOwner', 'const TYPE_CARDS', 'const TYPE_STEP_TITLES']
    .forEach(decl => assert.ok(html.indexOf(decl) >= 0 && html.indexOf(decl) < bootstrap, decl));
});

test('the type step: «Тип камина», one card per fireplace type, into #productSubcategory', () => {
  assert.match(htmlBetween('const TYPE_STEP_TITLES = {', '};'), /kaminy: 'Тип камина'/);
  assert.match(html, /kaminy: FireplaceModel\.FIREPLACE_TYPES\.map\(t => \(\{ ids: \[t\.id\], title: t\.title, desc: t\.desc, icon: typeIcon\(FIREPLACE_TYPE_ICONS\[t\.id\] \|\| ''\) \}\)\)/);
  assert.deepEqual(FireplaceModel.FIREPLACE_TYPES.map(t => t.title), ['Каминный портал', 'Облицовка каминного короба', 'Подиум камина']);
  const icons = htmlBetween('const FIREPLACE_TYPE_ICONS = {', '};');
  FireplaceModel.FIREPLACE_TYPES.forEach(t => assert.match(icons, new RegExp("'" + t.id + "':"), t.id));
  // Each card's catalog row is what the state keeps -- no parallel «fireplaceType».
  assert.doesNotMatch(html, /fireplaceType\b/);
  FireplaceModel.FIREPLACE_TYPES.forEach(t => {
    const state = stateFor('kaminy', { productSubcategory: { value: t.id } });
    assert.equal(state.product.key, 'kaminy');
    assert.equal(state.subcategory.id, t.id);
    assert.equal(state.productConfig.kaminy.typeId, t.id);
    assert.equal(state.productConfig.kaminy.type, t.key);
  });
});

test('a portal\'s form: С полкой / Без полки cards into #fireplace-form; the other types have one form', () => {
  const typeStep = htmlBetween('data-step-id="type"', '</section>');
  assert.match(typeStep, /<div class="choice-group" id="fireplaceFormField" hidden>/);
  assert.match(typeStep, /<div class="choice-title" id="fireplaceFormTitle">Вид портала<\/div>/);
  assert.match(typeStep, new RegExp('<input type="hidden" id="' + FORM_FIELD + '" value="">'));
  assert.match(htmlBetween('function renderFireplaceForms()', '\n  }\n'), /field\.hidden = type\.forms\.length < 2;/);
  assert.match(htmlBetween('const FIREPLACE_FORM_ICONS = {', '};'), /'with-shelf':[^]*'without-shelf':/);
  assert.match(htmlBetween('function applyTypeSelection(', '\n  }\n'), /renderFireplaceForms\(\);/);
  ['with-shelf', 'without-shelf'].forEach(formId => {
    const state = stateFor('kaminy', { productSubcategory: { value: portal.id }, [FORM_FIELD]: { value: formId } });
    assert.equal(state.productConfig.kaminy.form, formId);
  });
  assert.equal(stateFor('kaminy', { productSubcategory: { value: cladding.id }, [FORM_FIELD]: { value: 'cladding' } }).productConfig.kaminy.form, 'cladding');
  assert.equal(stateFor('kaminy', { productSubcategory: { value: podium.id }, [FORM_FIELD]: { value: 'podium' } }).productConfig.kaminy.form, 'podium');
  [cladding, podium].forEach(t => assert.equal(t.forms.length, 1, t.key));
});

test('no quantity and no countertop extras on a fireplace\'s steps', () => {
  // The generic «Количество, шт.» shows only for a piece row -- a fireplace's rows are м².
  assert.match(html, /subcategoryQtyInput\.style\.display = row && row\.unit === 'шт\.'/);
  RateCatalog.getSubcategoriesForProduct(PRODUCTS.kaminy.label).forEach(r => assert.notEqual(r.unit, 'шт.', r.id));
  // No shape (island, bar counter), edge or extras (sink, cooktop, curb,
  // backsplash, bookmatch) step.
  const steps = StepEngine.PRODUCT_STEPS.kaminy;
  ['shape', 'edge', 'additionalWorks', 'riser'].forEach(s => assert.ok(!steps.includes(s), s));
  const state = stateFor('kaminy', Object.assign({}, LEFTOVERS, { productSubcategory: { value: portal.id } }));
  assert.equal(state.subcategory.qty, 0);
});

// ---- the size step (stage 7.2) ------------------------------------------------------

const SceneLayout = require('../visualizer/scene-layout.js');
const ProductParts = require('../product-parts.js');
const ResultModel = require('../result-model.js');
const LeadPayload = require('../lead-payload.js');

const CLADDING = { claddingWidth: 1600, claddingHeight: 2600, depth: 500, fireboxWidth: 900, fireboxHeight: 600, fireboxBottom: 400 };
const PODIUM = { length: 1800, depth: 450, height: 200 };
const VARIANTS = [
  { name: 'портал с полкой', type: portal, form: 'with-shelf', sizes: Object.assign({}, PORTAL), area: 1.9352 },
  { name: 'портал без полки', type: portal, form: 'without-shelf', sizes: Object.assign({}, PORTAL), area: 1.82 },
  { name: 'облицовка короба', type: cladding, form: 'cladding', sizes: CLADDING, area: 6.22 },
  { name: 'подиум', type: podium, form: 'podium', sizes: PODIUM, area: 1.35 },
];
const variantState = (v, overridesMm, extra) =>
  stateFor('kaminy', Object.assign({}, fireplaceFields(v.type, v.form, Object.assign({}, v.sizes, overridesMm || {})), extra || {}));
// The page script's fireplace block: from its size-field sync to the input listeners.
const fireplaceUi = () => htmlBetween('function currentFireplaceType()', '  // The size step for a facade:');

test('the size fields: one «мм» number field per model size, named and ordered by the model', () => {
  const block = htmlBetween('<div class="dim-fields" id="fireplaceFields" hidden>', '<div class="dim-note" id="fireplaceAreaNote"');
  Object.entries(PARAM_FIELDS).forEach(([key, id]) => {
    const row = block.match(new RegExp('<div class="field-unit" data-fireplace-param="' + key + '">[^\\n]*'));
    assert.ok(row, key);
    assert.match(row[0], new RegExp('<input type="number" id="' + id + '" min="' + (key === 'fireboxBottom' ? 0 : 1) + '" step="1" inputmode="numeric">'), key);
    assert.match(row[0], /<span class="unit">мм<\/span>/, key);
    // The label and the hint are the model's own, set by the page script.
    assert.match(row[0], /<span class="unit-label"><\/span>/, key);
  });
  assert.match(fireplaceUi(), /row\.querySelector\('\.unit-label'\)\.textContent = param\.label;/);
  assert.match(fireplaceUi(), /row\.querySelector\('input'\)\.placeholder = String\(param\.placeholderMm\);/);
  // Wo = W + 2b is the model's: no field for it.
  assert.doesNotMatch(block, /Итоговая ширина|outerWidth/);
  const labels = v => FireplaceModel.getForm(v.type, v.form).params.map(p => p.label);
  assert.deepEqual(labels(VARIANTS[0]), ['Ширина проёма', 'Высота проёма', 'Ширина простенка', 'Высота перемычки', 'Глубина портала', 'Вылет полки']);
  assert.deepEqual(labels(VARIANTS[1]), ['Ширина проёма', 'Высота проёма', 'Ширина простенка', 'Высота перемычки', 'Глубина портала']);
  assert.deepEqual(labels(VARIANTS[2]), ['Ширина короба', 'Высота короба', 'Глубина короба', 'Ширина топки', 'Высота топки', 'От пола до топки']);
  assert.deepEqual(labels(VARIANTS[3]), ['Длина подиума', 'Глубина подиума', 'Высота подиума']);
  // The generic «Длина / Ширина» and their diagram give way to these.
  assert.match(fireplaceUi(), /if \(fireplace\) document\.getElementById\('dimGenericFields'\)\.hidden = true;/);
});

test('millimetres in the fields -> metres in state.productConfig.kaminy, only the chosen form\'s sizes', () => {
  // Every field filled -- only the chosen form's sizes reach its configuration.
  const everything = {};
  Object.values(PARAM_FIELDS).forEach(id => { everything[id] = { value: '777' }; });
  VARIANTS.forEach(v => {
    const cfg = variantState(v, null, Object.assign({}, everything, fireplaceFields(v.type, v.form, v.sizes))).productConfig.kaminy;
    const form = FireplaceModel.getForm(v.type, v.form);
    assert.deepEqual(Object.keys(cfg.params), form.params.map(p => p.key), v.name);
    form.params.forEach(p => close(cfg.params[p.key], v.sizes[p.key] / 1000, v.name + ' ' + p.key));
    assert.equal(cfg.form, v.form, v.name);
    assert.equal(cfg.complete, true, v.name);
    close(cfg.areaM2, v.area, v.name);
  });
  // A shelf left in its field is no part of a portal without one.
  const bare = variantState(VARIANTS[1], { shelfProjection: 60 }).productConfig.kaminy;
  assert.equal('shelfProjection' in bare.params, false);
});

test('the page keeps each type\'s own sizes, and a portal\'s shelf across its forms', () => {
  const ui = fireplaceUi();
  // Switching type: the previous type's values are put aside, this type's come back.
  assert.match(ui, /if \(fireplaceFieldsOwner\.typeId !== type\.id\) \{/);
  assert.match(ui, /fireplaceSizesByType\[fireplaceFieldsOwner\.typeId\] = saved;/);
  assert.match(ui, /const own = fireplaceSizesByType\[type\.id\] \|\| \{\};/);
  // Only the chosen form's rows are shown -- the others stay hidden (and unread).
  assert.match(ui, /row\.hidden = !param;/);
  // Changing a portal's form re-syncs the fields (the shelf row) and recalculates.
  assert.match(htmlBetween('function renderFireplaceForms()', '\n  }\n'), /syncFireplaceFields\(\);\s*calculate\(\);/);
  // Back/Next never clear a field: nothing in the step navigation touches them.
  assert.doesNotMatch(htmlBetween('stepBackBtn.addEventListener', 'function renderSubcategoryOptions'), /fireplace/i);
  // With the shelf's value still in its field, the portal gets it back with its form.
  const fields = fireplaceFields(portal, 'without-shelf', PORTAL);
  const doc = createFakeDoc(fields);
  assert.equal(FireplaceModel.readFireplaceConfig(doc, portal.id).complete, true);
  fields[FORM_FIELD].value = 'with-shelf';
  close(FireplaceModel.readFireplaceConfig(doc, portal.id).params.shelfProjection, 0.06);
});

test('incomplete or wrong sizes: missing, not a number, zero, negative -- from the model, never judged in the page', () => {
  const cfgOf = (v, overrides) => variantState(v, null, overrides).productConfig.kaminy;
  const openingWidth = { [PARAM_FIELDS.openingWidth]: { value: '' } };
  assert.deepEqual(cfgOf(VARIANTS[0], openingWidth).missing, ['openingWidth']);
  assert.deepEqual(cfgOf(VARIANTS[0], { [PARAM_FIELDS.openingWidth]: { value: 'abc' } }).missing, ['openingWidth'], 'not a number = not entered');
  assert.deepEqual(cfgOf(VARIANTS[0], { [PARAM_FIELDS.openingWidth]: { value: '0' } }).violations.map(x => x.rule), ['positive']);
  assert.deepEqual(cfgOf(VARIANTS[0], { [PARAM_FIELDS.openingWidth]: { value: '-900' } }).violations.map(x => x.rule), ['positive']);
  // «От пола до топки» may be 0 -- not below.
  assert.equal(cfgOf(VARIANTS[2], { [PARAM_FIELDS.fireboxBottom]: { value: '0' } }).complete, true);
  assert.deepEqual(cfgOf(VARIANTS[2], { [PARAM_FIELDS.fireboxBottom]: { value: '-1' } }).violations.map(x => x.rule), ['nonNegative']);
  // An incomplete fireplace is cut as nothing (product-parts.js says what is missing).
  const job = ProductParts.buildJob(variantState(VARIANTS[0], null, openingWidth));
  assert.deepEqual([job.pieces.length, job.missing], [0, ['fireplace:openingWidth']]);
  // The page shows the model's own words: the missing sizes by name, then
  // every broken rule's message -- no rule, number or formula of its own.
  const ui = fireplaceUi();
  assert.match(ui, /FireplaceModel\.readFireplaceConfig\(document, type\.id\)/);
  assert.match(ui, /cfg\.violations\.map\(v => v\.message\)/);
  assert.match(ui, /cfg\.missing\.map\(k => '«' \+ form\.params\.find\(p => p\.key === k\)\.label \+ '»'\)/);
  assert.doesNotMatch(ui, /0\.03|PLATE_THICKNESS|\.area\(|holds\(|plateRules|\.rules\b/);
  // … shown in the calculator's own size error, while the sizes are wrong.
  assert.match(html, /if \(selectedProductKey === 'kaminy'\) dimError\.textContent = fireplaceError;/);
});

test('the model\'s constraints reach the page: fit, pier, depth, lintel, shelf, firebox, podium', () => {
  const rulesOf = (v, overrides) => variantState(v, overrides).productConfig.kaminy.violations.map(x => x.rule + ':' + x.params.join('+'));
  assert.deepEqual(rulesOf(VARIANTS[0], { pierWidth: 50 }), ['plateThickness:pierWidth']);
  assert.deepEqual(rulesOf(VARIANTS[0], { depth: 30 }), ['plateThickness:depth']);
  // The lintel: one plate under a shelf, two without.
  assert.deepEqual(rulesOf(VARIANTS[0], { lintelHeight: 40 }), []);
  assert.deepEqual(rulesOf(VARIANTS[1], { lintelHeight: 40 }), ['plateThickness:lintelHeight']);
  assert.deepEqual(rulesOf(VARIANTS[0], { shelfProjection: 0 }), ['positive:shelfProjection']);
  assert.deepEqual(rulesOf(VARIANTS[2], { fireboxWidth: 1700 }), ['fireboxWidth:fireboxWidth+claddingWidth']);
  assert.deepEqual(rulesOf(VARIANTS[2], { fireboxHeight: 2300 }), ['fireboxHeight:fireboxBottom+fireboxHeight+claddingHeight']);
  assert.deepEqual(rulesOf(VARIANTS[2], { fireboxWidth: 1560 }), ['plateThickness:fireboxWidth+claddingWidth']);
  assert.deepEqual(rulesOf(VARIANTS[2], { depth: 30 }), ['plateThickness:depth']);
  assert.deepEqual(rulesOf(VARIANTS[3], { depth: 30 }), ['plateThickness:depth']);
  assert.deepEqual(rulesOf(VARIANTS[3], { height: 30 }), ['plateThickness:height']);
  assert.deepEqual(rulesOf(VARIANTS[3], { length: 50 }), ['plateThickness:length']);
  // The messages name the sizes as the fields do.
  assert.equal(variantState(VARIANTS[0], { pierWidth: 50 }).productConfig.kaminy.violations[0].message,
    'Размер «Ширина простенка» не оставляет места для каменных плит толщиной 30 мм.');
});

test('«Далее» on the size step: only a complete, valid fireplace goes on -- to «Материал»', () => {
  assert.match(htmlBetween('function isCurrentStepDataValid(stepId)', '\n  }\n'), /if \(selectedProductKey === 'kaminy'\) return fireplaceSizesComplete\(\);/);
  assert.match(htmlBetween('function fireplaceSizesComplete()', '\n  }\n'), /FireplaceModel\.readFireplaceConfig\(document, type\.id\)\.complete/);
  assert.equal(StepEngine.nextStep('kaminy', 'dimensions'), 'material');
  assert.equal(StepEngine.canAdvance('kaminy', 'dimensions', false), false);
  assert.equal(StepEngine.canAdvance('kaminy', 'dimensions', true), true);
  VARIANTS.forEach(v => assert.equal(variantState(v).productConfig.kaminy.complete, true, v.name));
  assert.equal(variantState(VARIANTS[0], { pierWidth: 50 }).productConfig.kaminy.complete, false);
});

test('the 3D gets the entered sizes: state -> buildGeometryModel -> buildSceneLayout', () => {
  const EXPECTED = {
    // Wo + 2o wide, H + h + one plate (the shelf) high, d + o deep.
    'портал с полкой': { widthM: 0.9 + 0.5 + 0.12, heightM: 0.95 + 0.03, depthM: 0.26 },
    'портал без полки': { widthM: 1.4, heightM: 0.95, depthM: 0.2 },
    'облицовка короба': { widthM: 1.6, heightM: 2.6, depthM: 0.5 },
    'подиум': { widthM: 1.8, heightM: 0.2, depthM: 0.45 },
  };
  VARIANTS.forEach(v => {
    const model = GeometryModel.buildGeometryModel(variantState(v));
    const plan = model.fireplace.plan;
    assert.equal(plan.ok, true, v.name);
    Object.entries(EXPECTED[v.name]).forEach(([k, m]) => close(plan.extent[k], m, v.name + ' ' + k));
    close(plan.areaM2, v.area, v.name);
    assert.equal(model.cameraPreset, 'front', v.name);
    const parts = SceneLayout.buildSceneLayout(model).parts;
    // Stone plates 30 mm thick; the firebox only an image; the wall only context.
    parts.filter(p => p.role === 'stone').forEach(p => close(Math.min(...p.size), FireplaceModel.PLATE_THICKNESS_M, v.name + ' ' + p.name));
    assert.equal(parts.filter(p => p.role === 'stone').length, plan.plates.length, v.name);
    parts.filter(p => p.role !== 'stone').forEach(p => assert.ok(p.visualOnly || p.role === 'context', v.name + ' ' + p.name));
    assert.ok(!parts.some(p => /countertop|sink|cooktop|backsplash|island|edge/i.test(p.name || '')), v.name);
  });
  // A size changed in its field changes the 3D.
  const wider = GeometryModel.buildGeometryModel(variantState(VARIANTS[0], { openingWidth: 1200 })).fireplace.plan.extent;
  close(wider.widthM, 1.2 + 0.5 + 0.12);
});

test('the area, the pieces and the price of each variant: the model\'s area, stone priced, work left to the manager', () => {
  VARIANTS.forEach(v => {
    const state = variantState(v);
    const job = ProductParts.buildJob(state);
    close(job.pieces.reduce((s, p) => s + p.areaM2 * p.count, 0), v.area, v.name + ' pieces');
    const r = priceOf(state);
    assert.equal(r.ok, true, v.name);
    // The 30 mm plates are not added to the area paid for.
    close(r.material.productAreaM2, v.area, v.name + ' priced area');
    assert.ok(r.subtotal > 0, v.name);
    assert.deepEqual([r.fabrication, r.work, r.total, r.unpriced], [null, null, null, ['fabrication']], v.name);
  });
  // The page never shows such a price as «0 ₽»: the stone and the manager's note.
  const branch = htmlBetween('if (result.total === null) {', '\n    }\n');
  assert.match(branch, /'Камень: ≈ ' \+ formatRub\(result\.subtotal\) \+ '\. ' \+ result\.workNote/);
  assert.match(branch, /outcome: \{ kind: 'manual', reason: 'unpriced_work', message: warningOut\.textContent \}/);
  assert.match(html, /setPriceValue\(result\.total === null \? 'Нужно уточнить у менеджера' : '≈ ' \+ formatRub\(result\.total\)\);/);
  const pricing = ResultModel.summarizePricing({ kind: 'manual', reason: 'unpriced_work', message: 'Камень: ≈ 41 224 ₽. Стоимость изготовления уточнит менеджер.' }, null);
  assert.deepEqual([pricing.status, pricing.total], ['manual', null]);
});

test('the Result and the request carry the fireplace -- never a «0 × 0 мм» size', () => {
  const state = variantState(VARIANTS[0]);
  const configuration = ResultModel.buildConfiguration({ state, productLabel: PRODUCTS.kaminy.label, subcategory: { id: portal.id, label: portal.title, unit: 'м²' }, edgeTitles: {} });
  assert.equal(configuration.dimensions, null);
  assert.deepEqual(configuration.fireplace, FireplaceModel.describeFireplace(state.productConfig.kaminy));
  const view = ResultModel.buildResultView(configuration);
  assert.deepEqual(view.specs.map(s => s.key), ['type', 'fireplace.form', 'fireplace.openingWidth', 'fireplace.openingHeight',
    'fireplace.pierWidth', 'fireplace.lintelHeight', 'fireplace.depth', 'fireplace.shelfProjection', 'fireplace.area']);
  assert.equal(view.specs.find(s => s.key === 'fireplace.area').value, '1,94 м²');
  assert.equal(view.note, 'Стоимость указана за каменный портал.');
  const lead = LeadPayload.buildLeadPayload({ configuration, pricing: ResultModel.summarizePricing({ kind: 'manual', reason: 'unpriced_work', message: 'x' }, null), contact: { name: 'Имя', phone: '+7', comment: '' }, createdAt: null });
  assert.equal(lead.configuration.fireplace.typeId, portal.id);
  assert.equal(lead.configuration.dimensions, null);
  assert.deepEqual([lead.pricing.status, lead.pricing.total], ['manual', null]);
});

test('the other 9 products: no fireplace in their configuration, their sizes as before', () => {
  Object.keys(PRODUCTS).filter(k => k !== 'kaminy').forEach(key => {
    const state = stateFor(key, Object.assign({ width: { value: '600' }, length: { value: '2400' } }, fireplaceFields(portal, 'with-shelf', PORTAL)));
    assert.equal(state.productConfig.kaminy, null, key);
    const configuration = ResultModel.buildConfiguration({ state, productLabel: PRODUCTS[key].label, subcategory: null, edgeTitles: {} });
    assert.equal(configuration.fireplace, null, key);
    if (key !== 'fasad') assert.equal(configuration.dimensions.lengthMm, 2400, key);
  });
  // A kitchen countertop 2400 × 600 is priced as before.
  const kitchen = priceOf(stateFor('stoleshnitsa_kuhnya', { width: { value: '600' }, length: { value: '2400' } }));
  assert.equal(kitchen.ok, true);
  close(kitchen.fabrication, WORK_RATES.stoleshnitsa_kuhnya.fabricationRatePerM2 * 0.6 * 2.4);
  assert.equal(kitchen.total, kitchen.subtotal + kitchen.work);
});

// ---- steps --------------------------------------------------------------------------

test('PRODUCT_STEPS.kaminy: type, sizes, stone, the shared options, result', () => {
  assert.deepEqual(StepEngine.PRODUCT_STEPS.kaminy, ['type', 'dimensions', 'material', 'options', 'review']);
  assert.equal(StepEngine.nextStep('kaminy', 'material'), 'options');
  assert.equal(StepEngine.nextStep('kaminy', 'options'), 'review');
  assert.equal(StepEngine.previousStep('kaminy', 'review'), 'options');
  assert.equal(StepEngine.previousStep('kaminy', 'options'), 'material');
  assert.equal(StepEngine.firstStep('kaminy'), 'type');
  assert.equal(StepEngine.lastStep('kaminy'), 'review');
});

// ---- WORK_RATES and the catalog ----------------------------------------------------------------

test('WORK_RATES.kaminy exists and every rate is null -- not 0, not another product\'s rate', () => {
  assert.deepEqual(WORK_RATES.kaminy, { fabricationRatePerM2: null, installationRatePerM2: null, polishRatePerM2: null });
  // Its own object, not a shared or copied rate set.
  Object.entries(WORK_RATES).filter(([key]) => key !== 'kaminy').forEach(([key, r]) => {
    assert.notEqual(WORK_RATES.kaminy, r, key);
    assert.notEqual(r.fabricationRatePerM2, null, key + ' keeps its rate');
  });
  // What pricing gets for a fireplace is exactly these nulls.
  const { rates } = inputsFor(portalState());
  assert.equal(rates.fabricationRatePerM2, null);
  assert.equal(rates.installationRatePerM2, null);
  assert.equal(rates.polishRatePerM2, null);
});

test('the catalog: FIREPLACE-01/02/03 by m² of stone (as priced), rate null; one installation row', () => {
  const rows = RateCatalog.PRODUCT_SUBCATEGORIES.filter(r => r.categoryLabel === 'Камины');
  assert.deepEqual(rows.map(r => [r.id, r.shape, r.unit, r.rate, r.currency]), [
    ['FIREPLACE-01', 'Каминный портал', 'м²', null, null],
    ['FIREPLACE-02', 'Облицовка каминного короба', 'м²', null, null],
    ['FIREPLACE-03', 'Подиум камина', 'м²', null, null],
  ]);
  // The catalog ids are the model's type ids.
  rows.forEach(r => assert.ok(FireplaceModel.getType(r.id), r.id));
  const inst = RateCatalog.getInstallationRow('Камины');
  assert.deepEqual([inst.id, inst.unit, inst.rate], ['INST-109', 'м²', null]);
  // No additional works were added for fireplaces.
  assert.ok(!RateCatalog.ADDITIONAL_WORKS.some(r => /камин/i.test(r.operation + r.variant)));
});

// ---- ConstructorState ----------------------------------------------------------------------

test('ConstructorState reads a fireplace through fireplace-model: type, form, sizes, area', () => {
  const state = portalState();
  const cfg = state.productConfig.kaminy;
  assert.equal(cfg.typeId, 'FIREPLACE-01');
  assert.equal(cfg.type, 'portal');
  assert.equal(cfg.form, 'with-shelf');
  Object.entries(PORTAL).forEach(([k, mm]) => close(cfg.params[k], mm / 1000, k));
  assert.equal(cfg.complete, true);
  close(cfg.areaM2, 1.9352);
  assert.deepEqual(cfg, FireplaceModel.readFireplaceConfig(createFakeDoc(Object.assign({}, LEFTOVERS, fireplaceFields(portal, 'with-shelf', PORTAL))), 'FIREPLACE-01'));
  // Every type and form.
  const clad = stateFor('kaminy', fireplaceFields(cladding, '', { claddingWidth: 1600, claddingHeight: 2600, depth: 500, fireboxWidth: 900, fireboxHeight: 600, fireboxBottom: 0 })).productConfig.kaminy;
  assert.deepEqual([clad.type, clad.form, clad.params.fireboxBottom, clad.complete], ['cladding', 'cladding', 0, true]);
  const pod = stateFor('kaminy', fireplaceFields(podium, '', { length: 1800, depth: 450, height: 200 })).productConfig.kaminy;
  assert.deepEqual([pod.type, pod.complete], ['podium', true]);
  const bare = stateFor('kaminy', fireplaceFields(portal, 'without-shelf', PORTAL)).productConfig.kaminy;
  assert.deepEqual([bare.form, 'shelfProjection' in bare.params], ['without-shelf', false]);
});

test('nothing another product left on the page reaches a fireplace: sizes, quantity, shape, extras, edges', () => {
  const state = portalState();
  assert.deepEqual([state.dimensions.widthM, state.dimensions.lengthM], [0, 0]);
  assert.equal(state.subcategory.qty, 0);
  assert.equal(state.shape, 'straight');
  assert.deepEqual(state.wing, { widthM: 0, lengthM: 0 });
  assert.equal(state.curbLengthM, 0);
  assert.deepEqual(state.backsplash, { widthM: 0, lengthM: 0 });
  assert.equal(state.cooktopCount, 0);
  assert.deepEqual(state.holeCounts, { mixer: 0, socket: 0, dispenser: 0 });
  // The options are the shared checkboxes -- read as for every product.
  assert.deepEqual(state.options, { complexEnabled: true, polishEnabled: true, installEnabled: true });
  const { extraLineItems, extraDimensions } = inputsFor(state);
  assert.deepEqual(extraLineItems, [], 'no edge, cut or extra is priced');
  assert.deepEqual(extraDimensions, { bortikLengthM: 0, fartukAreaM2: 0, ostrovAreaM2: 0 });
});

test('switching products: the fireplace is only in a fireplace\'s state, and the other product is read as before', () => {
  const values = Object.assign({}, LEFTOVERS, fireplaceFields(portal, 'with-shelf', PORTAL));
  const countertop = stateFor('stoleshnitsa_kuhnya', values);
  assert.equal(countertop.productConfig.kaminy, null);
  assert.deepEqual([countertop.dimensions.widthM, countertop.dimensions.lengthM], [0.65, 2.4], 'its own sizes, as before');
  assert.equal(countertop.options.installEnabled, true, 'its options, as before');
  const fireplace = stateFor('kaminy', values);
  assert.deepEqual([fireplace.dimensions.widthM, fireplace.options.installEnabled], [0, true], 'the shared options, as for every product');
  Object.keys(PRODUCTS).filter(k => k !== 'kaminy').forEach(k => assert.equal(stateFor(k, values).productConfig.kaminy, null, k));
});

test('buildPricingInputs for a fireplace: its null rates, its plates as the job, no extras', () => {
  const state = portalState();
  const { job, areaM2, groupRates } = inputsFor(state);
  const plan = GeometryModel.fireplacePlan(portal, portal.forms[0], state.productConfig.kaminy.params);
  assert.deepEqual(job.pieces.map(p => p.key), plan.plates.map(p => p.key));
  close(job.mainAreaM2, plan.areaM2);
  assert.equal(areaM2, null, 'no width x length / facade area override -- the job is the area');
  assert.ok(Array.isArray(groupRates));
});

// ---- pricing with no rate ---------------------------------------------------------------------

test('a fireplace with no rate: the stone is priced; the work and the total are left to the manager', () => {
  const r = priceOf(portalState(NO_OPTIONS));
  assert.equal(r.ok, true);
  // The stone: laid out, priced.
  assert.ok(Number.isFinite(r.subtotal) && r.subtotal > 0);
  assert.ok(r.nSlabs >= 1);
  close(r.material.productAreaM2, 1.9352, 'the fireplace\'s stone');
  // The work is not «0 ₽» -- it is unknown.
  assert.equal(r.fabrication, null);
  assert.equal(r.work, null);
  assert.notEqual(r.work, 0);
  // No total that looks final.
  assert.equal(r.total, null);
  assert.deepEqual(r.unpriced, ['fabrication']);
  assert.equal(r.workNote, 'Стоимость изготовления уточнит менеджер.');
});

test('the same for every type of fireplace', () => {
  [
    stateFor('kaminy', fireplaceFields(cladding, '', { claddingWidth: 1600, claddingHeight: 2600, depth: 500, fireboxWidth: 900, fireboxHeight: 600, fireboxBottom: 400 })),
    stateFor('kaminy', fireplaceFields(podium, '', { length: 1800, depth: 450, height: 200 })),
    stateFor('kaminy', fireplaceFields(portal, 'without-shelf', PORTAL)),
  ].forEach(state => {
    const r = priceOf(state);
    assert.equal(r.ok, true, state.productConfig.kaminy.type);
    assert.ok(r.subtotal > 0);
    assert.deepEqual([r.work, r.total, r.unpriced], [null, null, ['fabrication']]);
  });
});

test('the mechanism is the missing rate, not the product: any product with a null rate is treated the same', () => {
  const state = stateFor('pol', { width: { value: '2000' }, length: { value: '3000' } });
  const { job } = inputsFor(state);
  const priced = Pricing.calculatePrice({
    stone: STONE, widthM: 2, lengthM: 3, productType: 'B', job,
    rates: Object.assign({}, WORK_RATES.pol, { miscFlatSum: null, miscRatePerM2: null, complexShapeMultiplier: 1.5 }),
    marginCm: ProductTypes.SAW_MARGIN_CM, usageLimit: ProductTypes.SLAB_USAGE_LIMIT,
  });
  const unset = Pricing.calculatePrice({
    stone: STONE, widthM: 2, lengthM: 3, productType: 'B', job,
    rates: { fabricationRatePerM2: null, installationRatePerM2: null, polishRatePerM2: null, miscFlatSum: null, miscRatePerM2: null, complexShapeMultiplier: 1.5 },
    marginCm: ProductTypes.SAW_MARGIN_CM, usageLimit: ProductTypes.SLAB_USAGE_LIMIT,
  });
  assert.equal(priced.subtotal, unset.subtotal, 'the same stone either way');
  assert.deepEqual([unset.work, unset.total, unset.unpriced], [null, null, ['fabrication']]);
  assert.deepEqual(priced.unpriced, []);
  assert.equal(priced.total, priced.subtotal + priced.work);
  // pricing.js names no product in this rule.
  const src = fs.readFileSync(path.join(__dirname, '..', 'pricing.js'), 'utf8');
  assert.doesNotMatch(src, /kaminy|fireplace/i);
});

test('computeWorkAndTotal: a null rate is never 0 -- only the work asked for is checked', () => {
  const NULL = { fabricationRatePerM2: null, installationRatePerM2: null, polishRatePerM2: null, miscFlatSum: null, miscRatePerM2: null, complexShapeMultiplier: 1.5 };
  const off = Pricing.computeWorkAndTotal(100000, 2, NULL, { installEnabled: false, polishEnabled: false, complexEnabled: true });
  assert.deepEqual([off.fabrication, off.installation, off.polish, off.work, off.total, off.unpriced], [null, 0, 0, null, null, ['fabrication']]);
  const all = Pricing.computeWorkAndTotal(100000, 2, NULL, { installEnabled: true, polishEnabled: true, complexEnabled: false });
  assert.deepEqual(all.unpriced, ['fabrication', 'installation', 'polish']);
  assert.deepEqual([all.installation, all.polish], [null, null]);
  // A set fabrication rate with no installation rate: the install asked for is the gap.
  const partial = Pricing.computeWorkAndTotal(100000, 2, Object.assign({}, NULL, { fabricationRatePerM2: 30000 }), { installEnabled: true, polishEnabled: false, complexEnabled: false });
  assert.deepEqual([partial.fabrication, partial.installation, partial.work, partial.total, partial.unpriced], [60000, null, null, null, ['installation']]);
  // Not asked for: no gap.
  const noInstall = Pricing.computeWorkAndTotal(100000, 2, Object.assign({}, NULL, { fabricationRatePerM2: 30000 }), { installEnabled: false, polishEnabled: false, complexEnabled: false });
  assert.deepEqual([noInstall.work, noInstall.total, noInstall.unpriced], [60000, 160000, []]);
});

test('the note names exactly the work the manager prices', () => {
  assert.equal(Pricing.unpricedWorkNote(['fabrication']), 'Стоимость изготовления уточнит менеджер.');
  assert.equal(Pricing.unpricedWorkNote(['fabrication', 'installation']), 'Стоимость изготовления и монтажа уточнит менеджер.');
  assert.equal(Pricing.unpricedWorkNote(['fabrication', 'installation', 'polish']), 'Стоимость изготовления, монтажа и полировки уточнит менеджер.');
  assert.equal(Pricing.unpricedWorkNote([]), null);
  assert.equal(Pricing.isRateSet(0), true, 'a real zero rate is a rate');
  assert.equal(Pricing.isRateSet(null), false);
  assert.equal(Pricing.isRateSet(undefined), false);
  assert.equal(Pricing.isRateSet(NaN), false);
});

test('a product with set rates is priced exactly as before', () => {
  const state = stateFor('stoleshnitsa_kuhnya', { width: { value: '600' }, length: { value: '2400' } });
  const r = priceOf(state);
  assert.equal(r.ok, true);
  assert.deepEqual(r.unpriced, []);
  assert.equal(r.workNote, null);
  close(r.fabrication, WORK_RATES.stoleshnitsa_kuhnya.fabricationRatePerM2 * 0.6 * 2.4);
  close(r.total, r.subtotal + r.work);
});

// ---- the «Опции» step (stage 7.3) --------------------------------------------------

const OPTION_BOXES = { complex: 'opt-complex', polish: 'opt-polish', install: 'opt-install' };
const ticked = (...keys) => {
  const v = {};
  Object.entries(OPTION_BOXES).forEach(([k, id]) => { v[id] = { checked: keys.includes(k) }; });
  return v;
};
const portalWith = (...keys) => variantState(VARIANTS[0], null, ticked(...keys));

// The same fireplace priced with the rates given (a company's future rates).
function priceWithRates(state, productRates) {
  const { rates, extraLineItems, extraDimensions, job, groupRates } = ConstructorState.buildPricingInputs(state, {
    productRates, miscFlatSum: ProductTypes.MISC_FLAT_SUM, miscRatePerM2: ProductTypes.MISC_RATE_PER_M2,
    complexShapeMultiplier: ProductTypes.COMPLEX_SHAPE_MULTIPLIER, countertopExtrasRates: ProductTypes.COUNTERTOP_EXTRAS_RATES,
    getAdditionalWorkRate: RateCatalog.getAdditionalWorkRate, riserRates: ProductTypes.RISER_WORK_RATES,
    extrasInstallRates: ProductTypes.COUNTERTOP_EXTRAS_INSTALL_RATES,
  });
  return Pricing.calculatePrice({
    stone: STONE, widthM: state.dimensions.widthM, lengthM: state.dimensions.lengthM,
    productType: state.product.type, rates, extraLineItems, extraDimensions, job, groupRates,
    installEnabled: state.options.installEnabled, polishEnabled: state.options.polishEnabled, complexEnabled: state.options.complexEnabled,
    marginCm: ProductTypes.SAW_MARGIN_CM, usageLimit: ProductTypes.SLAB_USAGE_LIMIT,
  });
}

test('«Опции»: the one shared step -- its three boxes, in their order, for a fireplace too', () => {
  assert.equal(PRODUCTS.kaminy.supportsOptions, undefined, 'no opt-out: the default every product has');
  assert.ok(StepEngine.getSteps('kaminy').includes('options'));
  const step = htmlBetween('data-step-id="options"', '</section>');
  const boxes = [...step.matchAll(/<input type="checkbox" id="([^"]+)"> ([^\n]+)/g)].map(m => [m[1], m[2].trim()]);
  assert.deepEqual(boxes, [
    ['opt-complex', 'Сложная форма / фигурный рез'],
    ['opt-polish', 'Дополнительная полировка'],
    ['opt-install', 'Монтаж на объекте'],
  ]);
  // No fireplace list of its own anywhere on the page or in the state.
  assert.doesNotMatch(step, /kaminy|fireplace/i);
  assert.doesNotMatch(html, /fireplaceOptions/);
});

test('a ticked option is in the fireplace\'s state, as for every product; step navigation never clears a box', () => {
  assert.deepEqual(portalWith().options, { complexEnabled: false, polishEnabled: false, installEnabled: false });
  assert.deepEqual(portalWith('complex').options, { complexEnabled: true, polishEnabled: false, installEnabled: false });
  assert.deepEqual(portalWith('polish').options, { complexEnabled: false, polishEnabled: true, installEnabled: false });
  assert.deepEqual(portalWith('install').options, { complexEnabled: false, polishEnabled: false, installEnabled: true });
  // Назад / Далее / the progress strip only switch the step shown.
  const nav = htmlBetween('function updateStepUI(productKey)', 'function renderSubcategoryOptions');
  assert.doesNotMatch(nav, /opt-(complex|polish|install)|\.checked\s*=/);
});

test('no company rate: a ticked option is the manager\'s too -- never «0 ₽», never counted twice', () => {
  const none = priceOf(portalWith());
  const all = priceOf(portalWith('complex', 'polish', 'install'));
  assert.deepEqual([all.fabrication, all.installation, all.polish, all.work, all.total], [null, null, null, null, null]);
  assert.deepEqual(all.unpriced, ['fabrication', 'installation', 'polish']);
  assert.equal(all.workNote, 'Стоимость изготовления, монтажа и полировки уточнит менеджер.');
  assert.equal(priceOf(portalWith('install')).workNote, 'Стоимость изготовления и монтажа уточнит менеджер.');
  // The stone is the same with or without options -- they are work, not stone.
  assert.equal(all.subtotal, none.subtotal);
  // Монтаж is only the option: no additional work, no «INST-109» line, no extra piece.
  const { extraLineItems } = inputsFor(portalWith('install'));
  assert.deepEqual(extraLineItems, []);
  assert.deepEqual(ProductParts.buildJob(portalWith('install')).pieces.filter(p => p.group !== 'main').map(p => p.group), []);
});

test('with a rate set, each option is priced once, by the shared rule', () => {
  const RATES = { fabricationRatePerM2: 40000, installationRatePerM2: 20000, polishRatePerM2: 10000 };
  const area = 1.9352;
  const plain = priceWithRates(portalWith(), RATES);
  close(plain.fabrication, 40000 * area, 'fabrication');
  assert.deepEqual([plain.installation, plain.polish], [0, 0]);
  const install = priceWithRates(portalWith('install'), RATES);
  close(install.installation, 20000 * area, 'installation once');
  close(install.work - plain.work, 20000 * area, 'the work grows by the installation only');
  const polish = priceWithRates(portalWith('polish'), RATES);
  close(polish.polish, 10000 * area, 'polish');
  const complex = priceWithRates(portalWith('complex'), RATES);
  close(complex.fabrication, 40000 * ProductTypes.COMPLEX_SHAPE_MULTIPLIER * area, 'complex shape');
  const all = priceWithRates(portalWith('complex', 'polish', 'install'), RATES);
  assert.deepEqual(all.unpriced, []);
  close(all.total, all.subtotal + all.work);
});

test('the options reach the Result and the request, as for every product', () => {
  const state = portalWith('complex', 'install');
  const configuration = ResultModel.buildConfiguration({ state, productLabel: PRODUCTS.kaminy.label, subcategory: { id: portal.id, label: portal.title, unit: 'м²' }, edgeTitles: {} });
  assert.deepEqual(configuration.options, [
    { key: 'complex', label: 'Сложная форма / фигурный рез' },
    { key: 'install', label: 'Монтаж на объекте' },
  ]);
  const view = ResultModel.buildResultView(configuration);
  assert.deepEqual(view.specs.find(s => s.key === 'options'), { key: 'options', label: 'Опции', value: 'Сложная форма / фигурный рез, Монтаж на объекте', detail: '' });
  // The fireplace rows stay as they were, the options after the material.
  assert.deepEqual(view.specs.map(s => s.key).slice(-1), ['options']);
  const lead = LeadPayload.buildLeadPayload({ configuration, pricing: ResultModel.summarizePricing({ kind: 'manual', reason: 'unpriced_work', message: 'x' }, null), contact: { name: 'Имя', phone: '+7', comment: '' }, createdAt: null });
  assert.deepEqual(lead.configuration.options, configuration.options);
  assert.equal(lead.configuration.fireplace.typeId, portal.id);
  assert.deepEqual([lead.pricing.status, lead.pricing.total], ['manual', null]);
});

test('the options change no geometry: the same plates with or without them', () => {
  VARIANTS.forEach(v => {
    const plain = GeometryModel.buildGeometryModel(variantState(v, null, ticked()));
    const all = GeometryModel.buildGeometryModel(variantState(v, null, ticked('complex', 'polish', 'install')));
    assert.deepEqual(all.fireplace, plain.fireplace, v.name);
    assert.deepEqual(SceneLayout.buildSceneLayout(all).parts, SceneLayout.buildSceneLayout(plain).parts, v.name);
  });
});

test('the other 9 products keep their steps', () => {
  assert.deepEqual(Object.fromEntries(Object.keys(PRODUCTS).filter(k => k !== 'kaminy').map(k => [k, StepEngine.getSteps(k)])), {
    lestnitsa: ['type', 'dimensions', 'material', 'edge', 'options', 'review'],
    panno: ['type', 'dimensions', 'material', 'options', 'review'],
    podokonnik: ['type', 'dimensions', 'material', 'edge', 'options', 'review'],
    pol: ['type', 'dimensions', 'material', 'options', 'review'],
    stena: ['type', 'dimensions', 'material', 'options', 'review'],
    fasad: ['type', 'dimensions', 'material', 'options', 'review'],
    stoleshnitsa_vannaya: ['shape', 'dimensions', 'material', 'edge', 'additionalWorks', 'options', 'review'],
    stoleshnitsa_kuhnya: ['shape', 'dimensions', 'material', 'edge', 'additionalWorks', 'options', 'review'],
    stupeni: ['type', 'dimensions', 'material', 'riser', 'edge', 'options', 'review'],
  });
});
