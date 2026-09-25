// tests/facade-model.test.js
//
// «Фасады»: what the client measures, which surface it clads, the area and
// quantity that come out, the price, the 3D, and what reaches the Result
// and the lead -- for every facade type and form.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createFakeDoc } = require('./helpers/fake-dom.js');
const FacadeModel = require('../facade-model.js');
const ConstructorState = require('../constructor-state.js');
const ProductTypes = require('../product-types.js');
const RateCatalog = require('../rate-catalog.js');
const Pricing = require('../pricing.js');
const ResultModel = require('../result-model.js');
const LeadPayload = require('../lead-payload.js');
const GeometryModel = require('../visualizer/geometry-model.js');
const SceneLayout = require('../visualizer/scene-layout.js');
const CameraFraming = require('../visualizer/camera-framing.js');

const { PRODUCTS, hasAdditionalWork, WORK_RATES } = ProductTypes;
const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, (msg || '') + ': ' + a + ' vs ' + b);

// Plenty of priced stock, so every facade here gets a price.
const STONE = {
  id: 'delicato-brown', name: 'Delicato Brown', category: 'marble', category_label_ru: 'Мрамор',
  countries: [{ label_ru: 'Оман' }], available: true,
  slabs: Array.from({ length: 40 }, (_, i) => ({ article: 'S' + i, price_total_rub: 40000, width_cm: 300, length_cm: 180 })),
};

// The page's fields for a facade: type, form, sizes (mm) and quantity.
function fields(typeId, form, sizesMm, qty) {
  const v = { productSubcategory: { value: typeId }, 'facade-form': { value: form || '' }, 'facade-quantity': { value: qty === undefined ? '' : String(qty) } };
  Object.entries(sizesMm).forEach(([key, mm]) => { v[FacadeModel.PARAM_FIELDS[key]] = { value: String(mm) }; });
  return v;
}

function stateFor(values) {
  // Leftover generic sizes from another product -- must never reach a facade.
  const doc = createFakeDoc(Object.assign({ width: { value: '650' }, length: { value: '2400' } }, values));
  return ConstructorState.readConstructorState({ doc, selectedProductKey: 'fasad', product: PRODUCTS.fasad, stone: STONE, hasAdditionalWork });
}

function facadeOf(values) {
  return stateFor(values).productConfig.fasad;
}

function priceOf(state) {
  const { rates, extraLineItems, extraDimensions, areaM2 } = ConstructorState.buildPricingInputs(state, {
    productRates: WORK_RATES.fasad,
    miscFlatSum: ProductTypes.MISC_FLAT_SUM, miscRatePerM2: ProductTypes.MISC_RATE_PER_M2,
    complexShapeMultiplier: ProductTypes.COMPLEX_SHAPE_MULTIPLIER,
    countertopExtrasRates: ProductTypes.COUNTERTOP_EXTRAS_RATES,
    getAdditionalWorkRate: RateCatalog.getAdditionalWorkRate,
  });
  return Pricing.calculatePrice({
    stone: state.stone, widthM: state.dimensions.widthM, lengthM: state.dimensions.lengthM, areaM2,
    productType: PRODUCTS.fasad.type, rates, extraLineItems, extraDimensions,
    installEnabled: false, polishEnabled: false, complexEnabled: false,
    marginCm: ProductTypes.SAW_MARGIN_CM, usageLimit: ProductTypes.SLAB_USAGE_LIMIT,
  });
}

function layoutOf(values) {
  return SceneLayout.buildSceneLayout(GeometryModel.buildGeometryModel(stateFor(values)));
}

const named = (layout, name) => layout.parts.filter(p => p.name === name);

// A part's plan extent: its depth across (x) and its run (z0..z1).
function extentOf(part) {
  if (part.kind === 'box') {
    return { x: part.size[0], z0: part.center[2] - part.size[2] / 2, z1: part.center[2] + part.size[2] / 2 };
  }
  const xs = part.outline.map(p => p[0]), zs = part.outline.map(p => p[1]);
  return { x: Math.max(...xs) - Math.min(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
}

// ---- the catalogue of facade products -------------------------------------

test('facade types: 8 real categories, each with its own sizes -- no type uses the generic «Длина / Ширина» pair', () => {
  assert.deepEqual(FacadeModel.FACADE_TYPES.map(t => t.title),
    ['Фасад здания', 'Цоколь', 'Обрамление проёма', 'Колонны', 'Пилястры', 'Карниз', 'Фасадный пояс', 'Декоративный элемент']);
  const catalog = RateCatalog.getSubcategoriesForProduct('Фасады').map(r => r.id);
  FacadeModel.FACADE_TYPES.forEach(t => {
    assert.ok(catalog.includes(t.id), t.id + ' has a catalog row');
    t.forms.forEach(f => {
      assert.ok(f.params.length >= 2, t.id);
      f.params.forEach(p => {
        assert.ok(FacadeModel.PARAM_FIELDS[p.key], p.key);
        assert.notEqual(p.label, 'Длина');
        assert.notEqual(p.label, 'Ширина');
        assert.ok(p.placeholderMm > 0);
      });
      assert.ok(f.surface && f.formula, t.id + '/' + f.id + ' says what is clad and how');
    });
  });
  // No new commercial rates were invented.
  RateCatalog.getSubcategoriesForProduct('Фасады').forEach(r => assert.equal(r.rate, null, r.id));
});

// ---- 8. Фасад здания --------------------------------------------------------

test('Фасад здания: S = длина × высота; each size changes the area; identical sections multiply it', () => {
  const f = facadeOf(fields('FACADE-01', null, { length: 8000, height: 3000 }));
  assert.equal(f.type, 'wall');
  close(f.pieceAreaM2, 24);
  close(f.areaM2, 24);
  close(facadeOf(fields('FACADE-01', null, { length: 10000, height: 3000 })).areaM2, 30, 'longer wall');
  close(facadeOf(fields('FACADE-01', null, { length: 8000, height: 4500 })).areaM2, 36, 'taller wall');
  close(facadeOf(fields('FACADE-01', null, { length: 8000, height: 3000 }, 3)).areaM2, 72, '3 sections');
  assert.deepEqual(Object.keys(f.params).sort(), ['height', 'length']);
});

// ---- 7. Цоколь -------------------------------------------------------------

test('Цоколь: S = длина участка × высота цоколя', () => {
  close(facadeOf(fields('FACADE-04', null, { length: 12000, height: 600 })).areaM2, 7.2);
  close(facadeOf(fields('FACADE-04', null, { length: 12000, height: 800 })).areaM2, 9.6);
  close(facadeOf(fields('FACADE-04', null, { length: 6000, height: 600 })).areaM2, 3.6);
  close(facadeOf(fields('FACADE-04', null, { length: 6000, height: 600 }, 4)).areaM2, 14.4, '4 sides');
});

// ---- 5. Обрамление проёма (was «Фасадный элемент») -------------------------

test('Обрамление проёма: window = frame on 4 sides, door = on 3; 1 vs 4 openings -> 4x the area and the work', () => {
  const W = 1200, H = 1500, b = 150;
  const win1 = facadeOf(fields('FACADE-02', 'window', { openingWidth: W, openingHeight: H, frame: b }, 1));
  const win4 = facadeOf(fields('FACADE-02', 'window', { openingWidth: W, openingHeight: H, frame: b }, 4));
  const expected = ((W + 2 * b) * (H + 2 * b) - W * H) / 1e6; // 1.08 m²
  close(win1.pieceAreaM2, expected);
  close(win1.areaM2, expected);
  close(win4.areaM2, 4 * expected);
  assert.equal(win4.quantity, 4);
  const door = facadeOf(fields('FACADE-02', 'door', { openingWidth: 1000, openingHeight: 2100, frame: 150 }));
  close(door.pieceAreaM2, ((1000 + 300) * (2100 + 150) - 1000 * 2100) / 1e6);
  // Price: the work is per m² of the real area -- 4 openings, 4x the work.
  const p1 = priceOf(stateFor(fields('FACADE-02', 'window', { openingWidth: W, openingHeight: H, frame: b }, 1)));
  const p4 = priceOf(stateFor(fields('FACADE-02', 'window', { openingWidth: W, openingHeight: H, frame: b }, 4)));
  assert.equal(p1.ok, true);
  close(p1.fabrication, WORK_RATES.fasad.fabricationRatePerM2 * expected);
  close(p4.fabrication, 4 * p1.fabrication);
  assert.ok(p4.total > p1.total);
});

// ---- 3. Колонны -------------------------------------------------------------

test('Круглая колонна: S = 2πRH (side surface only); radius, height and quantity each change it', () => {
  const base = facadeOf(fields('FACADE-03', 'round', { radius: 200, height: 3000 }, 1));
  assert.equal(base.form, 'round');
  close(base.pieceAreaM2, 2 * Math.PI * 0.2 * 3);
  close(facadeOf(fields('FACADE-03', 'round', { radius: 300, height: 3000 }, 1)).areaM2, 2 * Math.PI * 0.3 * 3, 'radius');
  close(facadeOf(fields('FACADE-03', 'round', { radius: 200, height: 4000 }, 1)).areaM2, 2 * Math.PI * 0.2 * 4, 'height');
  close(facadeOf(fields('FACADE-03', 'round', { radius: 200, height: 3000 }, 6)).areaM2, 6 * 2 * Math.PI * 0.2 * 3, 'quantity');
  // Not the top/bottom discs (πR² each).
  assert.ok(base.pieceAreaM2 < 2 * Math.PI * 0.2 * 3 + 0.01);
});

test('Квадратная колонна: S = 4AH; side, height and quantity each change it', () => {
  close(facadeOf(fields('FACADE-03', 'square', { side: 400, height: 3000 }, 1)).areaM2, 4 * 0.4 * 3);
  close(facadeOf(fields('FACADE-03', 'square', { side: 500, height: 3000 }, 1)).areaM2, 4 * 0.5 * 3, 'side');
  close(facadeOf(fields('FACADE-03', 'square', { side: 400, height: 2500 }, 1)).areaM2, 4 * 0.4 * 2.5, 'height');
  close(facadeOf(fields('FACADE-03', 'square', { side: 400, height: 3000 }, 3)).areaM2, 3 * 4 * 0.4 * 3, 'quantity');
});

test('columns: Круглая -> Квадратная -> Круглая keeps only the chosen form\'s sizes', () => {
  const sizes = { radius: 200, side: 400, height: 3000 };
  const round = facadeOf(fields('FACADE-03', 'round', sizes, 2));
  const square = facadeOf(fields('FACADE-03', 'square', sizes, 2));
  const back = facadeOf(fields('FACADE-03', 'round', sizes, 2));
  assert.deepEqual(Object.keys(round.params).sort(), ['height', 'radius']);
  assert.deepEqual(Object.keys(square.params).sort(), ['height', 'side']);
  assert.deepEqual(back, round);
  // An unknown form never survives: the type's first form.
  assert.equal(facadeOf(fields('FACADE-03', 'window', sizes)).form, 'round');
  // A form's size missing -> incomplete, zero area (never NaN).
  const missing = facadeOf(fields('FACADE-03', 'square', { radius: 200, height: 3000 }));
  assert.equal(missing.complete, false);
  assert.equal(missing.areaM2, 0);
});

// ---- Пилястры, Карниз, Фасадный пояс, Декоративный элемент ------------------

test('Пилястра: (ширина + 2 × выступ) × высота -- face and both sides, not the back', () => {
  close(facadeOf(fields('FACADE-06', null, { width: 400, projection: 100, height: 3000 }, 1)).areaM2, (0.4 + 0.2) * 3);
  close(facadeOf(fields('FACADE-06', null, { width: 400, projection: 100, height: 3000 }, 4)).areaM2, 4 * (0.4 + 0.2) * 3);
});

test('Карниз and Фасадный пояс are different products with different formulas', () => {
  const sizes = { length: 8000, height: 300, projection: 250 };
  const cornice = facadeOf(fields('FACADE-07', null, sizes));
  const belt = facadeOf(fields('FACADE-08', null, sizes));
  close(cornice.areaM2, 8 * (0.3 + 0.25), 'cornice: fronts + underside');
  close(belt.areaM2, 8 * (0.3 + 2 * 0.25), 'belt: front + top + underside');
  // Linear products: no piece quantity (a leftover value is ignored).
  assert.equal(facadeOf(fields('FACADE-07', null, sizes, 5)).quantity, 1);
  assert.equal(FacadeModel.getType('FACADE-07').quantity, null);
  close(facadeOf(fields('FACADE-07', null, { length: 4000, height: 300, projection: 250 })).areaM2, 4 * 0.55, 'length');
});

test('Декоративный элемент: ширина × высота; 1 vs 5 pieces -> 5x the area and the work', () => {
  const one = stateFor(fields('FACADE-05', null, { width: 600, height: 800 }, 1));
  const five = stateFor(fields('FACADE-05', null, { width: 600, height: 800 }, 5));
  close(one.productConfig.fasad.areaM2, 0.48);
  close(five.productConfig.fasad.areaM2, 2.4);
  const p1 = priceOf(one), p5 = priceOf(five);
  close(p5.fabrication, 5 * p1.fabrication);
  assert.ok(p5.total > p1.total);
});

// ---- 4. quantity ------------------------------------------------------------

test('quantity: one limit for every piece product; 0, negative, fractional or over the max never count', () => {
  assert.deepEqual(FacadeModel.QUANTITY_LIMITS, { minQuantity: 1, maxQuantity: 30 });
  const pieceTypes = FacadeModel.FACADE_TYPES.filter(t => t.quantity).map(t => t.id);
  assert.deepEqual(pieceTypes.sort(), ['FACADE-01', 'FACADE-02', 'FACADE-03', 'FACADE-04', 'FACADE-05', 'FACADE-06']);
  pieceTypes.forEach(id => assert.deepEqual(FacadeModel.quantityRange(FacadeModel.getType(id)), { min: 1, max: 30 }, id));
  const column = FacadeModel.getType('FACADE-03');
  const range = FacadeModel.quantityRange(column);
  [[1, true], [30, true], [15, true], [0, false], [-2, false], [2.5, false], [31, false], [NaN, false]].forEach(([n, ok]) =>
    assert.equal(FacadeModel.isValidQuantity(n, range), ok, String(n)));
  // What the state gets: the valid number, else the minimum.
  [['1', 1], ['30', 30], ['7', 7], ['0', 1], ['-3', 1], ['2.5', 1], ['31', 1], ['abc', 1], ['', 1]].forEach(([raw, expected]) =>
    assert.equal(FacadeModel.readQuantity(raw, column), expected, raw));
  const sizes = { radius: 200, height: 3000 };
  assert.equal(facadeOf(fields('FACADE-03', 'round', sizes, 0)).quantity, 1);
  assert.equal(facadeOf(fields('FACADE-03', 'round', sizes, 99)).quantity, 1);
  assert.equal(facadeOf(fields('FACADE-03', 'round', sizes, 30)).quantity, 30);
});

// ---- pricing, state isolation --------------------------------------------------

test('price: a facade is priced by its cladded area (not by leftover width/length); no area -> no price', () => {
  const state = stateFor(fields('FACADE-03', 'round', { radius: 200, height: 3000 }, 4));
  assert.equal(state.dimensions.widthM, 0);
  assert.equal(state.dimensions.lengthM, 0);
  const area = 4 * 2 * Math.PI * 0.2 * 3;
  const r = priceOf(state);
  assert.equal(r.ok, true);
  close(r.fabrication, WORK_RATES.fasad.fabricationRatePerM2 * area);
  // A round column's cladding is a surface: the slabs cover the area, each
  // used at most 65% (the 35% reserve).
  const surface = Pricing.planSurface(STONE.slabs, area, ProductTypes.SLAB_USAGE_LIMIT);
  assert.equal(r.subtotal, surface.used.reduce((s, u) => s + u.slab.price_total_rub, 0));
  assert.ok(r.material.utilization <= ProductTypes.SLAB_USAGE_LIMIT + 1e-9);
  assert.equal(priceOf(stateFor(fields('FACADE-03', 'round', { height: 3000 }, 4))).reason, 'invalid_dimensions');
  // Other products are priced exactly as before (areaM2 null).
  const wallState = ConstructorState.readConstructorState({
    doc: createFakeDoc({ width: { value: '3000' }, length: { value: '2700' } }), selectedProductKey: 'stena', product: PRODUCTS.stena, stone: STONE, hasAdditionalWork,
  });
  const inputs = ConstructorState.buildPricingInputs(wallState, {
    productRates: WORK_RATES.stena, miscFlatSum: null, miscRatePerM2: null, complexShapeMultiplier: 1.5,
    countertopExtrasRates: ProductTypes.COUNTERTOP_EXTRAS_RATES, getAdditionalWorkRate: RateCatalog.getAdditionalWorkRate,
  });
  assert.equal(inputs.areaM2, null);
});

test('a facade quantity or form never leaks into another product\'s state', () => {
  const doc = createFakeDoc(Object.assign({ width: { value: '1000' }, length: { value: '2000' } }, fields('FACADE-03', 'round', { radius: 200, height: 3000 }, 4)));
  const stena = ConstructorState.readConstructorState({ doc, selectedProductKey: 'stena', product: PRODUCTS.stena, stone: STONE, hasAdditionalWork });
  assert.equal(stena.productConfig.fasad, null);
  assert.equal(stena.dimensions.widthM, 1);
});

// ---- 14. Result / lead ------------------------------------------------------------

test('Result and lead: type, form, every size by name, quantity and area -- structured, nothing lost', () => {
  const state = stateFor(fields('FACADE-03', 'round', { radius: 200, height: 3000 }, 4));
  const configuration = ResultModel.buildConfiguration({
    state, productLabel: 'Фасады', subcategory: { id: 'FACADE-03', label: 'Колонны', unit: 'м²' }, edgeTitles: {},
  });
  assert.equal(configuration.dimensions, null, 'no generic width x length for a facade');
  const f = configuration.facade;
  assert.equal(f.typeId, 'FACADE-03');
  assert.equal(f.form, 'round');
  assert.equal(f.formLabel, 'Круглая');
  assert.deepEqual(f.params, [
    { key: 'radius', label: 'Радиус колонны', valueMm: 200 },
    { key: 'height', label: 'Высота колонны', valueMm: 3000 },
  ]);
  assert.equal(f.quantity, 4);
  assert.equal(f.unit, 'шт.');
  assert.equal(f.formula, '2 × π × R × H');
  assert.equal(f.pieceAreaM2, 3.77);
  assert.equal(f.areaM2, 15.08);

  const view = ResultModel.buildResultView(configuration);
  const spec = key => view.specs.find(s => s.key === key);
  assert.equal(spec('facade.form').value, 'Круглая');
  assert.equal(spec('facade.radius').value, '200 мм');
  assert.equal(spec('facade.height').value, '3000 мм');
  assert.equal(spec('facade.quantity').value, '4 шт.');
  assert.equal(spec('facade.area').value, '15,08 м²');
  assert.equal(spec('facade.area').detail, '3,77 м² × 4 колонны');
  assert.equal(spec('type').label, 'Изделие');
  assert.equal(spec('dimensions'), undefined);
  assert.match(view.note, /^Стоимость указана за облицовку колонн\./);
  // The lead keeps the type, shape, radius, height, quantity, both areas and the formula.
  assert.equal(f.priceNote, 'Стоимость указана за облицовку колонн.');

  const pricing = ResultModel.summarizePricing({ kind: 'ok', result: priceOf(state) }, '2026-09-15T23:53:23+03:00');
  const lead = LeadPayload.buildLeadPayload({ configuration, pricing, contact: { name: 'Анна', phone: '+79161234567', comment: null }, createdAt: '2026-09-25T10:00:00.000Z' });
  assert.deepEqual(lead.configuration.facade, f);
  assert.equal(lead.configuration.dimensions, null);
  assert.equal(lead.pricing.status, 'ok');
  assert.ok(lead.pricing.total > 0);
  assert.deepEqual(JSON.parse(JSON.stringify(lead)), lead, 'plain JSON');
  // Other products carry no facade block.
  assert.equal(ResultModel.buildConfiguration({ state: ConstructorState.readConstructorState({
    doc: createFakeDoc({ width: { value: '600' }, length: { value: '2000' } }), selectedProductKey: 'podokonnik', product: PRODUCTS.podokonnik, stone: STONE, hasAdditionalWork,
  }), productLabel: 'Подоконники', edgeTitles: {} }).facade, null);
});

test('Result: a linear product has no quantity row; a single piece shows no "× N"', () => {
  const cornice = ResultModel.buildConfiguration({ state: stateFor(fields('FACADE-07', null, { length: 8000, height: 300, projection: 250 })), productLabel: 'Фасады', edgeTitles: {} });
  const keys = ResultModel.buildResultView(cornice).specs.map(s => s.key);
  assert.ok(!keys.includes('facade.quantity'));
  assert.equal(cornice.facade.quantity, null);
  const one = ResultModel.buildConfiguration({ state: stateFor(fields('FACADE-05', null, { width: 600, height: 800 }, 1)), productLabel: 'Фасады', edgeTitles: {} });
  assert.doesNotMatch(ResultModel.buildResultView(one).specs.find(s => s.key === 'facade.area').detail, /×\s*1/);
});

// ---- 11. 3D ------------------------------------------------------------------------

test('3D round column: a cylinder of the entered radius and height; square: a prism of the entered side', () => {
  const round = layoutOf(fields('FACADE-03', 'round', { radius: 250, height: 3200 }, 1));
  const [c] = named(round, 'column');
  assert.equal(c.kind, 'prism');
  const radii = c.outline.map(([x, z]) => Math.hypot(x, z));
  radii.forEach(r => close(r, 0.25, 'on the circle'));
  close(c.y1 - c.y0, 3.2, 'height');
  assert.ok(c.outline.length >= 32, 'round, not a polygon of a few sides');

  const square = layoutOf(fields('FACADE-03', 'square', { side: 450, height: 2800 }, 1));
  const [s] = named(square, 'column');
  assert.equal(s.kind, 'box');
  assert.deepEqual(s.size.map(v => Math.round(v * 1000)), [450, 2800, 450]);
  // Radius changes the diameter; height changes the height.
  const bigger = named(layoutOf(fields('FACADE-03', 'round', { radius: 400, height: 3200 }, 1)), 'column')[0];
  close(Math.max(...bigger.outline.map(([x]) => x)), 0.4);
  const taller = named(layoutOf(fields('FACADE-03', 'round', { radius: 250, height: 4500 }, 1)), 'column')[0];
  close(taller.y1 - taller.y0, 4.5);
});

test('3D column reads as architecture: base, shaft, ring, top slab -- the shaft is the priced surface, the rest is visualOnly', () => {
  const layout = layoutOf(fields('FACADE-03', 'round', { radius: 200, height: 3000 }, 1));
  const one = name => named(layout, name);
  ['column-base', 'column', 'column-ring', 'column-slab'].forEach(name => assert.equal(one(name).length, 1, name));
  const [base, shaft, ring, slab] = ['column-base', 'column', 'column-ring', 'column-slab'].map(name => one(name)[0]);
  // Stacked bottom to top, no gaps.
  close(base.y0, 0); close(shaft.y0, base.y1); close(ring.y0, shaft.y1); close(slab.y0, ring.y1);
  // The shaft: radius R, exactly H tall -- 2πRH is its side surface.
  close(shaft.y1 - shaft.y0, 3);
  close(2 * Math.PI * 0.2 * (shaft.y1 - shaft.y0), facadeOf(fields('FACADE-03', 'round', { radius: 200, height: 3000 }, 1)).pieceAreaM2);
  assert.equal(shaft.visualOnly, undefined, 'the shaft is priced');
  [base, ring, slab].forEach(p => assert.equal(p.visualOnly, true, p.name));
  // The shaft stays the main element: base/ring/slab only a little wider and far shorter.
  const radius = part => Math.max(...part.outline.map(([x]) => x));
  [base, ring, slab].forEach(p => {
    assert.ok(radius(p) > 0.2 && radius(p) <= 0.2 * 1.45 + 1e-9, p.name + ' a little wider than the shaft');
    assert.ok(p.y1 - p.y0 < 0.1 * 3, p.name + ' short next to the shaft');
  });
  // One column: no entablature.
  assert.equal(one('entablature').length, 0);
});

test('3D column proportions: H stretches the shaft only; R / A scale base and top with the section; a small column never gets a huge base', () => {
  const partsOf = values => {
    const layout = layoutOf(values);
    const get = name => named(layout, name)[0];
    return { base: get('column-base'), shaft: get('column'), slab: get('column-slab') };
  };
  const h = p => p.y1 - p.y0;
  const r = part => part.kind === 'box' ? part.size[0] / 2 : Math.max(...part.outline.map(([x]) => x));
  const a = partsOf(fields('FACADE-03', 'round', { radius: 200, height: 3000 }, 1));
  const tall = partsOf(fields('FACADE-03', 'round', { radius: 200, height: 6000 }, 1));
  close(h(tall.shaft), 6);
  close(h(tall.base), h(a.base), 'the base keeps its height');
  close(h(tall.slab), h(a.slab), 'the top keeps its height');
  const thick = partsOf(fields('FACADE-03', 'round', { radius: 400, height: 3000 }, 1));
  close(r(thick.base) / r(thick.shaft), r(a.base) / r(a.shaft), 'the base scales with the radius');
  close(r(thick.slab) / r(thick.shaft), r(a.slab) / r(a.shaft), 'the top scales with the radius');
  const square = partsOf(fields('FACADE-03', 'square', { side: 400, height: 3000 }, 1));
  assert.equal(square.shaft.kind, 'box');
  assert.equal(square.base.kind, 'box');
  close(square.base.size[0] / square.shaft.size[0], 1.32, 'square base scales with A');
  close(square.shaft.size[1], 3);
  // A small, short column: base and top stay a small share of it.
  const small = partsOf(fields('FACADE-03', 'round', { radius: 50, height: 800 }, 1));
  assert.ok(h(small.base) <= 0.07 * 0.8 + 1e-9);
  assert.ok(r(small.base) <= 0.05 * 1.45);
});

test('the entablature over a group of columns: the chosen stone, visual-only -- never in the columns\' area or price', () => {
  const sizes = { radius: 200, height: 3000 };
  const four = layoutOf(fields('FACADE-03', 'round', sizes, 4));
  assert.equal(named(four, 'column').length, 4, '4 columns as a group');
  const tiers = named(four, 'entablature');
  assert.equal(tiers.length, 3, 'architrave, step, top slab');
  tiers.forEach(t => {
    assert.equal(t.visualOnly, true);
    assert.equal(t.role, 'stone', 'the chosen stone, same material pipeline as the columns');
  });
  // Stacked on the columns' slabs, each tier wider than the one below it.
  const slabTop = Math.max(...named(four, 'column-slab').map(s => s.y1));
  close(tiers[0].y0, slabTop);
  close(tiers[1].y0, tiers[0].y1);
  close(tiers[2].y0, tiers[1].y1);
  const span = t => extentOf(t);
  assert.ok(span(tiers[0]).x < span(tiers[1]).x && span(tiers[1]).x < span(tiers[2]).x, 'steps out upward');
  // Spans exactly the columns drawn: from the first column's slab to the last's.
  const slabs = named(four, 'column-slab').map(extentOf);
  const zMin = Math.min(...slabs.map(e => e.z0)), zMax = Math.max(...slabs.map(e => e.z1));
  close(extentOf(tiers[0]).z0, zMin); close(extentOf(tiers[0]).z1, zMax);
  assert.ok(extentOf(tiers[2]).z0 < zMin && extentOf(tiers[2]).z1 > zMax, 'the top slab overhangs');
  // Round columns: soft ends in plan; square: straight box steps.
  assert.equal(tiers[0].kind, 'prism');
  const squareTiers = named(layoutOf(fields('FACADE-03', 'square', { side: 400, height: 3000 }, 4)), 'entablature');
  assert.equal(squareTiers.length, 3);
  squareTiers.forEach(t => { assert.equal(t.kind, 'box'); assert.equal(t.role, 'stone'); assert.equal(t.visualOnly, true); });
  // It follows the number of columns drawn and their section.
  const two = named(layoutOf(fields('FACADE-03', 'round', sizes, 2)), 'entablature');
  assert.ok(extentOf(two[0]).z1 - extentOf(two[0]).z0 < extentOf(tiers[0]).z1 - extentOf(tiers[0]).z0);
  const thick = named(layoutOf(fields('FACADE-03', 'round', { radius: 400, height: 3000 }, 4)), 'entablature');
  assert.ok(extentOf(thick[0]).x > extentOf(tiers[0]).x);
  // The priced area is the shafts' side surface only -- the same with or
  // without the lintel, base or top, and the price follows it alone.
  const f4 = facadeOf(fields('FACADE-03', 'round', sizes, 4));
  close(f4.areaM2, 4 * 2 * Math.PI * 0.2 * 3);
  const shafts = named(four, 'column').reduce((s, c) => s + 2 * Math.PI * 0.2 * (c.y1 - c.y0), 0);
  close(shafts, f4.areaM2);
  close(priceOf(stateFor(fields('FACADE-03', 'round', sizes, 4))).fabrication, WORK_RATES.fasad.fabricationRatePerM2 * f4.areaM2);
  // More than 6: still 6 drawn, all counted.
  const twenty = facadeOf(fields('FACADE-03', 'round', sizes, 20));
  close(twenty.areaM2, 20 * 2 * Math.PI * 0.2 * 3);
  assert.equal(named(layoutOf(fields('FACADE-03', 'round', sizes, 20)), 'column').length, 6);
});

test('the worked examples: 4 × R200 × H3000 = 15,08 м²; 4 × A400 × H3000 = 19,20 м²', () => {
  const round = facadeOf(fields('FACADE-03', 'round', { radius: 200, height: 3000 }, 4));
  const square = facadeOf(fields('FACADE-03', 'square', { side: 400, height: 3000 }, 4));
  assert.equal(Math.round(round.pieceAreaM2 * 100) / 100, 3.77);
  assert.equal(Math.round(round.areaM2 * 100) / 100, 15.08);
  close(square.pieceAreaM2, 4.8);
  close(square.areaM2, 19.2);
});

test('no other facade type draws visual-only extras -- its stone is exactly what is priced', () => {
  const sizes = { length: 6000, height: 3000, width: 500, projection: 200, openingWidth: 1200, openingHeight: 1500, frame: 150 };
  FacadeModel.FACADE_TYPES.filter(t => t.key !== 'column').forEach(t => t.forms.forEach(f => {
    const layout = layoutOf(fields(t.id, f.id, sizes, 2));
    assert.ok(layout.parts.every(p => !p.visualOnly), t.id + '/' + f.id);
  }));
});

test('what the price covers: «Стоимость указана за облицовку колонн.», and the 3D-only parts are named', () => {
  const d = FacadeModel.describeFacade(facadeOf(fields('FACADE-03', 'round', { radius: 200, height: 3000 }, 4)));
  assert.equal(d.areaTitle, 'Площадь облицовки колонн');
  assert.equal(d.priceNote, 'Стоимость указана за облицовку колонн.');
  assert.equal(d.visualNote, 'Архитектурные элементы колоннады на 3D — визуальный образ и в расчёт не входят.');
  assert.equal(d.quantityText, '4 колонны');
  FacadeModel.FACADE_TYPES.forEach(t => {
    assert.match(FacadeModel.priceNote(t), /^Стоимость указана за .+\.$/, t.id);
    assert.ok(t.areaTitle, t.id);
  });
  assert.equal(FacadeModel.countLabel(1, ['колонна', 'колонны', 'колонн']), '1 колонна');
  assert.equal(FacadeModel.countLabel(4, ['колонна', 'колонны', 'колонн']), '4 колонны');
  assert.equal(FacadeModel.countLabel(11, ['колонна', 'колонны', 'колонн']), '11 колонн');
  assert.equal(FacadeModel.countLabel(22, ['колонна', 'колонны', 'колонн']), '22 колонны');
  assert.equal(FacadeModel.countLabel(25, ['колонна', 'колонны', 'колонн']), '25 колонн');
});

test('3D quantity: the pieces are drawn side by side, up to 6', () => {
  const sizes = { radius: 200, height: 3000 };
  [1, 3, 6].forEach(n => assert.equal(named(layoutOf(fields('FACADE-03', 'round', sizes, n)), 'column').length, n));
  assert.equal(named(layoutOf(fields('FACADE-03', 'round', sizes, 20)), 'column').length, 6);
  assert.equal(named(layoutOf(fields('FACADE-06', null, { width: 400, projection: 100, height: 3000 }, 4)), 'pilaster').length, 4);
  assert.equal(named(layoutOf(fields('FACADE-05', null, { width: 600, height: 800 }, 2)), 'decor').length, 2);
});

test('3D surround: the frame pieces\' faces add up to exactly the priced area (window 4 sides, door 3)', () => {
  const faceArea = layout => layout.parts.filter(p => p.name && p.name.startsWith('frame-')).reduce((sum, p) => sum + p.size[1] * p.size[2], 0);
  const win = { openingWidth: 1200, openingHeight: 1500, frame: 150 };
  close(faceArea(layoutOf(fields('FACADE-02', 'window', win, 1))), facadeOf(fields('FACADE-02', 'window', win, 1)).pieceAreaM2);
  close(faceArea(layoutOf(fields('FACADE-02', 'window', win, 3))), facadeOf(fields('FACADE-02', 'window', win, 3)).areaM2);
  const door = { openingWidth: 1000, openingHeight: 2100, frame: 150 };
  const doorLayout = layoutOf(fields('FACADE-02', 'door', door, 1));
  assert.equal(named(doorLayout, 'frame-bottom').length, 0, 'no frame under a door');
  close(faceArea(doorLayout), facadeOf(fields('FACADE-02', 'door', door, 1)).pieceAreaM2);
});

test('3D cornice vs belt: stepped cornice fronts add up to its height and undersides to its projection; the belt is one band', () => {
  const sizes = { length: 6000, height: 300, projection: 250 };
  const tiers = named(layoutOf(fields('FACADE-07', null, sizes)), 'cornice');
  assert.equal(tiers.length, 3);
  close(tiers.reduce((s, p) => s + p.size[1], 0), 0.3, 'fronts');
  close(Math.max(...tiers.map(p => p.size[0])), 0.25, 'projection');
  tiers.forEach(p => close(p.size[2], 6, 'length'));
  const belt = named(layoutOf(fields('FACADE-08', null, sizes)), 'belt');
  assert.equal(belt.length, 1);
  assert.deepEqual(belt[0].size.map(v => Math.round(v * 1000)), [250, 300, 6000]);
  // A cornice crowns the wall (nothing above it); a belt has wall above it.
  const topOf = layout => Math.max(...layout.parts.filter(p => p.role === 'context').map(p => p.center[1] + p.size[1] / 2));
  const corniceLayout = layoutOf(fields('FACADE-07', null, sizes));
  assert.ok(topOf(corniceLayout) <= Math.max(...tiers.map(p => p.center[1] + p.size[1] / 2)) + 1e-9);
  const beltLayout = layoutOf(fields('FACADE-08', null, sizes));
  assert.ok(topOf(beltLayout) > belt[0].center[1] + belt[0].size[1] / 2 + 1);
});

test('3D wall, plinth, pilaster, decor: the stone is exactly the entered sizes', () => {
  const wall = named(layoutOf(fields('FACADE-01', null, { length: 8000, height: 3000 })), 'wall')[0];
  assert.deepEqual([wall.size[1], wall.size[2]].map(v => Math.round(v * 1000)), [3000, 8000]);
  const plinth = named(layoutOf(fields('FACADE-04', null, { length: 9000, height: 600 })), 'plinth')[0];
  assert.deepEqual([plinth.size[1], plinth.size[2]].map(v => Math.round(v * 1000)), [600, 9000]);
  const pilaster = named(layoutOf(fields('FACADE-06', null, { width: 400, projection: 120, height: 3000 }, 1)), 'pilaster')[0];
  assert.deepEqual(pilaster.size.map(v => Math.round(v * 1000)), [120, 3000, 400]);
  const decor = named(layoutOf(fields('FACADE-05', null, { width: 600, height: 800 }, 1)), 'decor')[0];
  assert.deepEqual([decor.size[1], decor.size[2]].map(v => Math.round(v * 1000)), [800, 600]);
});

test('3D: every facade type and form draws a different scene', () => {
  const sizes = { length: 6000, height: 3000, width: 500, radius: 250, side: 500, projection: 200, openingWidth: 1200, openingHeight: 1500, frame: 150 };
  const prints = [];
  FacadeModel.FACADE_TYPES.forEach(t => t.forms.forEach(f => {
    const layout = layoutOf(fields(t.id, f.id, sizes, 2));
    prints.push(layout.parts.map(p => p.kind + ':' + (p.name || p.role)).sort().join('|') + '#' + layout.bounds.min.concat(layout.bounds.max).map(v => v.toFixed(2)).join(','));
  }));
  assert.equal(new Set(prints).size, prints.length);
});

test('camera: a column is framed from an angle; switching facade types with a different angle resets the view', () => {
  const model = values => GeometryModel.buildGeometryModel(stateFor(values));
  const columnModel = model(fields('FACADE-03', 'round', { radius: 200, height: 3000 }, 1));
  const wallModel = model(fields('FACADE-01', null, { length: 8000, height: 3000 }));
  assert.equal(columnModel.cameraPreset, 'iso-eye-level');
  assert.equal(wallModel.cameraPreset, 'front');
  const b = { min: [0, 0, 0], max: [1, 1, 1] };
  const decide = (prevPreset, nextPreset) => CameraFraming.decideCameraAction({
    hasPrevious: true, previousProductKey: 'fasad', nextProductKey: 'fasad', previousBounds: b, nextBounds: b, previousPreset: prevPreset, nextPreset,
  });
  assert.equal(decide('front', 'iso-eye-level'), 'reset');
  assert.equal(decide('front', 'front'), 'keep');
  // Callers that do not pass presets behave as before.
  assert.equal(CameraFraming.decideCameraAction({ hasPrevious: true, previousProductKey: 'fasad', nextProductKey: 'fasad', previousBounds: b, nextBounds: b }), 'keep');
});
