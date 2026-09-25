// tests/dimension-semantics.test.js
//
// One chain per product: the fields the client fills -> the size diagram ->
// state.dimensions -> the 3D -> the priced area -> what the Result says the
// price covers. Where they agree today this pins it; where the price
// deliberately covers less than the configuration (one step, a countertop's
// main run), the Result says so.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createFakeDoc } = require('./helpers/fake-dom.js');
const ConstructorState = require('../constructor-state.js');
const ProductTypes = require('../product-types.js');
const GeometryModel = require('../visualizer/geometry-model.js');
const SceneLayout = require('../visualizer/scene-layout.js');
const DimensionDiagram = require('../dimension-diagram.js');
const ResultModel = require('../result-model.js');

const html = fs.readFileSync(path.join(__dirname, '..', 'sayanmramor-calculator.html'), 'utf8');

function stateFor(key, values) {
  return ConstructorState.readConstructorState({
    doc: createFakeDoc(values), selectedProductKey: key, product: ProductTypes.PRODUCTS[key],
    stone: null, hasAdditionalWork: ProductTypes.hasAdditionalWork,
  });
}

// The area the price is computed from (pricing.js: width x length, or a
// facade's explicit cladded area).
function pricedArea(state) {
  const inputs = ConstructorState.buildPricingInputs(state, {
    productRates: ProductTypes.WORK_RATES[state.product.key], miscFlatSum: null, miscRatePerM2: null,
    complexShapeMultiplier: 1.5, countertopExtrasRates: ProductTypes.COUNTERTOP_EXTRAS_RATES, getAdditionalWorkRate: () => null,
  });
  return inputs.areaM2 !== null ? inputs.areaM2 : state.dimensions.widthM * state.dimensions.lengthM;
}

function layoutOf(state) {
  return SceneLayout.buildSceneLayout(GeometryModel.buildGeometryModel(state));
}

function polygonArea(pts) {
  let a = 0;
  pts.forEach(([x1, z1], i) => { const [x2, z2] = pts[(i + 1) % pts.length]; a += x1 * z2 - x2 * z1; });
  return Math.abs(a) / 2;
}

// The priced stone of the 3D (the colonnade's visual-only parts excluded).
function stoneParts(layout) {
  return layout.parts.filter(p => p.role === 'stone' && !p.visualOnly);
}
function planArea(layout) {
  return stoneParts(layout).reduce((s, p) => s + (p.kind === 'prism' ? polygonArea(p.outline) : p.size[0] * p.size[2]), 0);
}
function extentOf(layout) {
  const b = layout.bounds;
  return { x: b.max[0] - b.min[0], y: b.max[1] - b.min[1], z: b.max[2] - b.min[2] };
}

const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, msg + ': ' + a + ' vs ' + b);
const sizes = (w, l, extra) => Object.assign({ width: { value: String(w) }, length: { value: String(l) } }, extra || {});
const type = id => ({ productSubcategory: { value: id } });

test('countertops, straight sills, floors: the 3D slab in plan is exactly the priced length x width', () => {
  [
    ['stoleshnitsa_kuhnya', sizes(600, 2400)],
    ['stoleshnitsa_kuhnya', sizes(650, 3600)],
    ['stoleshnitsa_vannaya', sizes(500, 1200)],
    ['podokonnik', sizes(300, 1500, type('SILL-01'))],
    ['pol', sizes(3000, 4000, type('FLOOR-01'))],
    ['pol', sizes(8000, 12000, type('FLOOR-04'))],
  ].forEach(([key, values]) => {
    const state = stateFor(key, values);
    const layout = layoutOf(state);
    close(planArea(layout), pricedArea(state), key);
    // Width across (X), length along the run (Z).
    close(extentOf(layout).x, state.dimensions.widthM, key + ' width');
    close(extentOf(layout).z, state.dimensions.lengthM, key + ' length');
  });
});

test('a figured sill stays inside the entered width: the priced rectangle is the slab it is cut from', () => {
  [[300, 1500], [250, 900], [600, 2400], [1, 1]].forEach(([w, l]) => {
    const state = stateFor('podokonnik', sizes(w, l, type('SILL-05')));
    const e = extentOf(layoutOf(state));
    assert.ok(e.x <= state.dimensions.widthM + 1e-9, w + 'x' + l + ': drawn depth ' + e.x + ' > entered ' + state.dimensions.widthM);
    close(e.z, state.dimensions.lengthM, 'length');
    assert.ok(planArea(layoutOf(state)) <= pricedArea(state) + 1e-9);
  });
});

test('«Стены»: the length field is the wall height -- upright in the 3D and on the size diagram', () => {
  const state = stateFor('stena', sizes(4000, 2700, type('WALL-01')));
  const e = extentOf(layoutOf(state));
  close(e.y, 2.7, '3D height = «Высота стены» (the length field)');
  close(e.z, 4, '3D run = «Ширина стены» (the width field)');
  close(e.y * e.z, pricedArea(state), 'the priced area is the drawn face');

  const labels = html.match(/stena: \{[^}]*\}/)[0];
  assert.match(labels, /length: 'Высота стены'/);
  assert.match(labels, /width: 'Ширина стены'/);
  assert.match(labels, /lengthAxis: 'vertical'/, 'the page draws the wall height upright');
  assert.match(html, /DimensionDiagram\.rectLayout\([^;]*lengthAxis: currentDimLabels\.lengthAxis/);

  const d = DimensionDiagram.rectLayout(2700, 4000, '2700 мм', '4000 мм', { lengthAxis: 'vertical' });
  assert.equal(d.length.orientation || (d.length.x1 === d.length.x2 ? 'vertical' : 'horizontal'), 'vertical');
  close(d.length.y2 - d.length.y1, d.rect.h, 'the height spans the drawn height');
  close(d.width.x2 - d.width.x1, d.rect.w, 'the width spans the drawn width');
  assert.ok(d.rect.w > d.rect.h, 'a 4000-wide, 2700-high wall is drawn wide, like the 3D');
  close(d.rect.w / d.rect.h, 4000 / 2700, 'real proportions');
  // Empty fields: a landscape wall with the field names.
  const empty = DimensionDiagram.rectLayout(0, 0, 'Высота стены', 'Ширина стены', { lengthAxis: 'vertical' });
  assert.ok(empty.rect.w > empty.rect.h);
});

test('«Панно»: length across, width up -- the same in the 3D and on the diagram; the priced area is the drawn face', () => {
  ['PANEL-01', 'PANEL-03', 'PANEL-04'].forEach(id => {
    const state = stateFor('panno', sizes(800, 1200, type(id)));
    const e = extentOf(layoutOf(state));
    close(e.z, 1.2, id + ' run = length');
    close(e.y, 0.8, id + ' height = width');
    close(e.y * e.z, pricedArea(state), id);
  });
  const d = DimensionDiagram.rectLayout(1200, 800, 'a', 'b');
  assert.ok(d.length.y > d.rect.y + d.rect.h && d.width.x < d.rect.x, 'length under the panel, width beside it');
  assert.ok(d.rect.w > d.rect.h);
});

test('«Лестницы», straight flight: the priced length x width is the drawn flight in plan', () => {
  [[1000, 3000, 12], [900, 2000, 3], [1200, 5000, 30]].forEach(([w, l, n]) => {
    const state = stateFor('lestnitsa', sizes(w, l, Object.assign(type('STAIR-01'), { 'step-count': { value: String(n) } })));
    const layout = layoutOf(state);
    const treads = stoneParts(layout).filter(p => p.name === 'tread');
    assert.equal(treads.length, n, 'every step drawn');
    close(treads.reduce((s, p) => s + polygonArea(p.outline), 0), pricedArea(state), 'the treads in plan = the priced length x width');
    close(extentOf(layout).x, state.dimensions.lengthM, 'the flight runs the entered length');
    close(extentOf(layout).z, state.dimensions.widthM, 'the flight is the entered width');
  });
});

test('«Ступени»: each drawn tread is the entered size of ONE step, the price is one step, and the Result says so', () => {
  const state = stateFor('stupeni', sizes(300, 1200, Object.assign(type('STEP-01'), { 'step-count': { value: '4' } })));
  assert.equal(state.stepCount, 4);
  close(pricedArea(state), 0.36, 'one step');
  const note = ResultModel.priceScopeNoteForState(state);
  assert.equal(note, 'Стоимость указана за одну ступень.');
  const riser = stateFor('stupeni', sizes(300, 1200, Object.assign(type('STEP-01'), { 'step-count': { value: '4' }, 'stupeni-riser': { checked: true } })));
  assert.equal(ResultModel.priceScopeNoteForState(riser), 'Стоимость указана за одну ступень, подступенок в расчёт не входит.');
});

test('Г/П countertop: the wings are drawn but not priced -- the Result says the price is the main run', () => {
  const wing = { 'wing-width': { value: '600' }, 'wing-length': { value: '1400' } };
  const l = stateFor('stoleshnitsa_kuhnya', sizes(600, 2400, Object.assign({ productShape: { value: 'lshape' } }, wing)));
  const u = stateFor('stoleshnitsa_kuhnya', sizes(600, 2400, Object.assign({ productShape: { value: 'ushape' } }, wing)));
  close(pricedArea(l), 1.44, 'Г: main run only');
  close(pricedArea(u), 1.44, 'П: main run only');
  assert.ok(planArea(layoutOf(l)) > pricedArea(l) + 0.5, 'the 3D draws the wing');
  assert.equal(ResultModel.priceScopeNoteForState(l), 'Стоимость указана за основной сегмент, крыло в расчёт не входит.');
  assert.equal(ResultModel.priceScopeNoteForState(u), 'Стоимость указана за основной сегмент, крылья в расчёт не входят.');
  // No wing size yet, a straight top, another product with a stale shape: no note.
  assert.equal(ResultModel.priceScopeNoteForState(stateFor('stoleshnitsa_kuhnya', sizes(600, 2400, { productShape: { value: 'lshape' } }))), null);
  assert.equal(ResultModel.priceScopeNoteForState(stateFor('stoleshnitsa_kuhnya', sizes(600, 2400, wing))), null);
  assert.equal(ResultModel.priceScopeNoteForState(stateFor('pol', sizes(3000, 4000, Object.assign({ productShape: { value: 'lshape' } }, wing)))), null);
});

test('the Result note is the same note the summary shows; a facade keeps its own note', () => {
  const wing = { 'wing-width': { value: '600' }, 'wing-length': { value: '1400' } };
  const cases = [
    ['stupeni', sizes(300, 1200, Object.assign(type('STEP-02'), { 'step-count': { value: '3' }, 'stupeni-riser': { checked: true } }))],
    ['stoleshnitsa_kuhnya', sizes(600, 2400, Object.assign({ productShape: { value: 'ushape' } }, wing))],
    ['stoleshnitsa_vannaya', sizes(500, 1200, Object.assign({ productShape: { value: 'lshape' } }, wing))],
    ['podokonnik', sizes(300, 1500, type('SILL-03'))],
    ['lestnitsa', sizes(1000, 3000, type('STAIR-03'))],
  ];
  cases.forEach(([key, values]) => {
    const state = stateFor(key, values);
    const configuration = ResultModel.buildConfiguration({ state, productLabel: ProductTypes.PRODUCTS[key].label, subcategory: null });
    assert.equal(ResultModel.buildResultView(configuration).note, ResultModel.priceScopeNoteForState(state), key);
  });
  const column = stateFor('fasad', { productSubcategory: { value: 'FACADE-03' }, 'facade-form': { value: 'round' }, 'facade-radius': { value: '200' }, 'facade-height': { value: '3000' }, 'facade-quantity': { value: '4' } });
  const view = ResultModel.buildResultView(ResultModel.buildConfiguration({ state: column, productLabel: 'Фасады', subcategory: null }));
  assert.match(view.note, /^Стоимость указана за облицовку колонн\./);
  // The summary shows the note beside the price, but not in the message the
  // Result repeats (it has the note under the sizes already).
  assert.match(html, /const message = warningOut\.textContent \|\| null;[\s\S]*?priceScopeNoteForState\(constructorState\)[\s\S]*?outcome: \{ kind: 'ok', result, message \}/);
});

test('«Фасады»: every drawn piece is the entered size, as many as entered, and the priced area is their cladding', () => {
  const facade = (id, form, params, qty) => {
    const values = { productSubcategory: { value: id }, 'facade-form': { value: form || '' }, 'facade-quantity': { value: String(qty || '') } };
    Object.keys(params).forEach(k => { values[k] = { value: String(params[k]) }; });
    const state = stateFor('fasad', values);
    return { state, parts: stoneParts(layoutOf(state)) };
  };
  const boxes = parts => parts.map(p => p.size.map(v => Math.round(v * 1000)).join('x')).sort();

  const wall = facade('FACADE-01', null, { 'facade-length': 6000, 'facade-height': 3000 });
  assert.deepEqual(boxes(wall.parts), ['40x3000x6000']);
  close(pricedArea(wall.state), 18, 'wall');

  const pilasters = facade('FACADE-06', null, { 'facade-width': 400, 'facade-projection': 100, 'facade-height': 3000 }, 3);
  assert.deepEqual(boxes(pilasters.parts), ['100x3000x400', '100x3000x400', '100x3000x400']);
  close(pricedArea(pilasters.state), (0.4 + 0.2) * 3 * 3, 'pilasters');

  const windows = facade('FACADE-02', 'window', { 'facade-opening-width': 1200, 'facade-opening-height': 1500, 'facade-frame': 150 }, 2);
  assert.equal(windows.parts.length, 8, 'four frame pieces per window');
  close(pricedArea(windows.state), 2 * (1.5 * 1.8 - 1.2 * 1.5), 'window surrounds');

  const round = facade('FACADE-03', 'round', { 'facade-radius': 200, 'facade-height': 3000 }, 4);
  assert.equal(round.parts.length, 4);
  round.parts.forEach(p => {
    const c = p.outline.reduce((a, q) => [a[0] + q[0] / p.outline.length, a[1] + q[1] / p.outline.length], [0, 0]);
    close(Math.max(...p.outline.map(q => Math.hypot(q[0] - c[0], q[1] - c[1]))), 0.2, 'shaft radius');
    close(p.y1 - p.y0, 3, 'shaft height');
  });
  close(pricedArea(round.state), 2 * Math.PI * 0.2 * 3 * 4, 'columns');

  const square = facade('FACADE-03', 'square', { 'facade-side': 400, 'facade-height': 3000 }, 2);
  assert.deepEqual(boxes(square.parts), ['400x3000x400', '400x3000x400']);
  close(pricedArea(square.state), 4 * 0.4 * 3 * 2, 'square columns');

  const cornice = facade('FACADE-07', null, { 'facade-length': 6000, 'facade-height': 300, 'facade-projection': 250 });
  const e = cornice.parts.reduce((a, p) => ({ h: a.h + p.size[1], d: Math.max(a.d, p.size[0]) }), { h: 0, d: 0 });
  close(e.h, 0.3, 'cornice height'); close(e.d, 0.25, 'cornice projection');
});
