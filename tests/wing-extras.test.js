// tests/wing-extras.test.js
//
// A Г / П countertop's wings carry their own фартук, стеновая панель and бортик (the owner,
// 2026-11-17): Г one on the chosen corner, П two (left, right). The main run's elements keep their own
// fields; a wing's are extra-fartuk-w1-width/-length ... extra-bortik-w1 (slot 1, 2). They are read,
// priced (EXTRA-01/02/03, their stone, their монтаж), listed in the request and drawn in 3D.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createFakeDoc } = require('./helpers/fake-dom.js');
const ProductTypes = require('../product-types.js');
const ConstructorState = require('../constructor-state.js');
const RateCatalog = require('../rate-catalog.js');
const ResultModel = require('../result-model.js');
const GeometryModel = require('../visualizer/geometry-model.js');
const SceneLayout = require('../visualizer/scene-layout.js');
const Dimensions3d = require('../visualizer/dimensions-3d.js');

const { PRODUCTS, hasAdditionalWork } = ProductTypes;
const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, (msg || '') + ': ' + a + ' vs ' + b);
const v = value => ({ value: String(value) });

const BASE = { width: v(600), length: v(2400), 'wing-width': v(600), 'wing-length': v(1000) };
const U = Object.assign({ productShape: v('ushape') }, BASE);
const L = Object.assign({ productShape: v('lshape') }, BASE);

function stateOf(values, key) {
  const productKey = key || 'stoleshnitsa_kuhnya';
  return ConstructorState.readConstructorState({
    doc: createFakeDoc(values), selectedProductKey: productKey, product: PRODUCTS[productKey],
    stone: null, hasAdditionalWork,
  });
}

// ---- the state ---------------------------------------------------------------------------

test('П: both wings\' elements are read, each with its side and slot; Г: one, on the chosen corner', () => {
  const u = stateOf(Object.assign({
    'extra-fartuk-w1-width': v(500), 'extra-fartuk-w1-length': v(1600),
    'extra-fartuk-w2-width': v(400), 'extra-fartuk-w2-length': v(1500),
    'extra-wallpanel-w2-width': v(900), 'extra-wallpanel-w2-length': v(1600),
    'extra-bortik-w1': v(1600),
  }, U));
  assert.deepEqual(u.wingExtras.backsplash.map(e => [e.slot, e.side, e.widthM, e.lengthM]), [[1, 'left', 0.5, 1.6], [2, 'right', 0.4, 1.5]]);
  assert.deepEqual(u.wingExtras.wallPanel.map(e => [e.slot, e.side]), [[2, 'right']]);
  assert.deepEqual(u.wingExtras.curb.map(e => [e.slot, e.side, e.lengthM]), [[1, 'left', 1.6]]);

  const l = stateOf(Object.assign({ 'shape-corner': v('right'), 'extra-fartuk-w1-width': v(500), 'extra-fartuk-w1-length': v(1600) }, L));
  assert.deepEqual(l.wingExtras.backsplash.map(e => [e.slot, e.side]), [[1, 'right']]);
  assert.equal(stateOf(Object.assign({ 'shape-corner': v('left'), 'extra-fartuk-w1-width': v(500), 'extra-fartuk-w1-length': v(1600) }, L)).wingExtras.backsplash[0].side, 'left');
});

test('the second wing slot exists only on a П; a straight top has none; a half-filled element is not one', () => {
  const values = {
    'extra-fartuk-w1-width': v(500), 'extra-fartuk-w1-length': v(1600),
    'extra-fartuk-w2-width': v(500), 'extra-fartuk-w2-length': v(1600),
    'extra-wallpanel-w1-width': v(900), 'extra-bortik-w2': v(1600),
  };
  const l = stateOf(Object.assign({}, values, L));
  assert.equal(l.wingExtras.backsplash.length, 1, 'Г: one wing, one slot');
  assert.equal(l.wingExtras.curb.length, 0, 'Г: slot 2 is not read');
  assert.equal(l.wingExtras.wallPanel.length, 0, 'a width with no length is not an element');
  const straight = stateOf(Object.assign({}, values, BASE));
  assert.deepEqual(straight.wingExtras, { backsplash: [], wallPanel: [], curb: [] });
  assert.equal(stateOf(Object.assign({}, values, U)).wingExtras.curb.length, 1);
});

test('a product without the work reads no wing element, whatever the fields hold', () => {
  const floor = stateOf({ width: v(1000), length: v(600), 'extra-bortik-w1': v(500), productShape: v('ushape') }, 'pol');
  assert.deepEqual(floor.wingExtras, { backsplash: [], wallPanel: [], curb: [] });
});

// ---- price, stone, request ----------------------------------------------------------------

function inputsOf(values) {
  const state = stateOf(values);
  state.stone = { id: 's', category: 'marble', slabs: [{ article: 'S1', width_cm: 2000, length_cm: 2000, price_total_rub: 100000 }] };
  return { state, inputs: ConstructorState.buildPricingInputs(state, { catalog: RateCatalog }) };
}

test('the wings\' elements are priced with the main run\'s: one quantity per rate (m.p. for a curb, m² for the rest)', () => {
  const values = Object.assign({
    'extra-bortik': v(2400), 'extra-bortik-w1': v(1600), 'extra-bortik-w2': v(1600),
    'extra-fartuk-width': v(600), 'extra-fartuk-length': v(2400),
    'extra-fartuk-w1-width': v(500), 'extra-fartuk-w1-length': v(1600),
    'extra-wallpanel-width': v(900), 'extra-wallpanel-length': v(2400),
    'extra-wallpanel-w2-width': v(700), 'extra-wallpanel-w2-length': v(1600),
  }, U);
  const { inputs } = inputsOf(values);
  const quantities = inputs.extraLineItems.map(i => i.quantity).filter(q => q > 0).map(q => Math.round(q * 1e6) / 1e6);
  assert.ok(quantities.includes(5.6), 'curb: 2.4 + 1.6 + 1.6 m');
  assert.ok(quantities.includes(Math.round((0.6 * 2.4 + 0.5 * 1.6) * 1e6) / 1e6), 'backsplash: main + wing 1');
  assert.ok(quantities.includes(Math.round((0.9 * 2.4 + 0.7 * 1.6) * 1e6) / 1e6), 'wall panel: main + wing 2');
});

test('a wing\'s backsplash and wall panel are stone parts of their own (a curb is none), monтаж at their own rate', () => {
  const values = Object.assign({
    'opt-install': { checked: true },
    'extra-fartuk-width': v(600), 'extra-fartuk-length': v(2400),
    'extra-fartuk-w1-width': v(500), 'extra-fartuk-w1-length': v(1600),
    'extra-fartuk-w2-width': v(500), 'extra-fartuk-w2-length': v(1600),
    'extra-wallpanel-w1-width': v(700), 'extra-wallpanel-w1-length': v(1600),
    'extra-bortik-w1': v(1600),
  }, U);
  const { inputs } = inputsOf(values);
  const extras = inputs.job.pieces.filter(p => p.group === 'extra');
  assert.deepEqual(extras.map(p => p.label), ['Фартук', 'Фартук (крыло)', 'Фартук (крыло)', 'Стеновая панель (крыло)']);
  assert.deepEqual(extras.map(p => p.key), ['backsplash', 'backsplash', 'backsplash', 'wallPanel']);
  close(inputs.job.extraAreaM2, 0.6 * 2.4 + 2 * 0.5 * 1.6 + 0.7 * 1.6, 'the extras\' stone');
  const install = inputs.extraLineItems.filter(i => i.install);
  assert.equal(install.filter(i => i.install === 'backsplash').length, 3, 'one монтаж line per backsplash piece');
});

test('the request lists every element by the wing it stands on', () => {
  const state = stateOf(Object.assign({
    'extra-fartuk-w1-width': v(500), 'extra-fartuk-w1-length': v(1600),
    'extra-wallpanel-w2-width': v(700), 'extra-wallpanel-w2-length': v(1600),
    'extra-bortik-w2': v(1600),
  }, U));
  const c = ResultModel.buildConfiguration({ state, productLabel: PRODUCTS.stoleshnitsa_kuhnya.label, subcategory: null, edgeTitles: {}, edgeLengthM: null });
  assert.deepEqual(c.additionalWorks.map(w => w.label), ['Бортик - правое крыло', 'Фартук - левое крыло', 'Стеновая панель - правое крыло']);
  const g = ResultModel.buildConfiguration({ state: stateOf(Object.assign({ 'extra-fartuk-w1-width': v(500), 'extra-fartuk-w1-length': v(1600) }, L)), productLabel: 'x', subcategory: null, edgeTitles: {}, edgeLengthM: null });
  assert.deepEqual(g.additionalWorks.map(w => w.label), ['Фартук - крыло']);
});

// ---- the 3D ------------------------------------------------------------------------------

const layoutOf = values => SceneLayout.buildSceneLayout(GeometryModel.buildGeometryModel(stateOf(values)));
const named = (layout, name) => layout.parts.filter(p => p.name === name);

test('3D: a wing\'s element stands along the wing\'s wall side, from the main run\'s wall to the wing\'s end', () => {
  const layout = layoutOf(Object.assign({
    'extra-fartuk-w1-width': v(500), 'extra-fartuk-w1-length': v(1600),   // 600 deep + 1000 wing
    'extra-wallpanel-w1-width': v(900), 'extra-wallpanel-w1-length': v(1600),
    'extra-bortik-w1': v(1600),
    'extra-fartuk-w2-width': v(400), 'extra-fartuk-w2-length': v(1600),
  }, U));
  const W = 0.6, Lm = 2.4;
  const back = named(layout, 'backsplash-wing-left')[0];
  assert.ok(back, 'the left wing\'s backsplash');
  close(back.size[0], 1.6, 'its length');
  close(back.size[1], 0.5, 'its height');
  close(back.center[0], -W / 2 + 0.8, 'from the main run\'s wall');
  assert.ok(back.center[2] > Lm / 2, 'beyond the left wing\'s wall edge (+Z)');
  const right = named(layout, 'backsplash-wing-right')[0];
  assert.ok(right.center[2] < -Lm / 2, 'the right wing\'s is at the -Z end');
  const panel = named(layout, 'wall-panel-wing-left')[0];
  assert.ok(panel.center[2] > back.center[2], 'the panel stands behind the backsplash');
  const curb = named(layout, 'curb-wing-left')[0];
  assert.ok(Math.abs(curb.center[2]) < Lm / 2, 'the curb lies on the top, inside the wall edge');
  close(curb.size[0], 1.6, 'its length');
  assert.equal(named(layout, 'curb-wing-right').length, 0);
});

test('3D: nothing is drawn for a wing that is not there (no wing size, a straight top, the other corner)', () => {
  const values = { 'extra-fartuk-w1-width': v(500), 'extra-fartuk-w1-length': v(1600) };
  assert.equal(named(layoutOf(Object.assign({}, values, { productShape: v('lshape') }, { width: v(600), length: v(2400) })), 'backsplash-wing-left').length, 0, 'no wing size yet');
  assert.equal(named(layoutOf(Object.assign({}, values, BASE)), 'backsplash-wing-left').length, 0, 'straight');
  const right = layoutOf(Object.assign({ 'shape-corner': v('right') }, values, L));
  assert.equal(named(right, 'backsplash-wing-right').length, 1);
  assert.equal(named(right, 'backsplash-wing-left').length, 0);
});

test('3D: a length past the wall it runs along is drawn only as far as the wall goes', () => {
  const layout = layoutOf(Object.assign({ 'extra-fartuk-w1-width': v(500), 'extra-fartuk-w1-length': v(3000) }, U));
  close(named(layout, 'backsplash-wing-left')[0].size[0], 1.6);
});

test('3D «Размеры»: the wing element\'s length and height name that slot\'s own fields', () => {
  const values = Object.assign({
    'extra-fartuk-w1-width': v(500), 'extra-fartuk-w1-length': v(1600),
    'extra-bortik-w2': v(1600),
  }, U);
  const model = GeometryModel.buildGeometryModel(stateOf(values));
  const dims = Dimensions3d.build(model, SceneLayout.buildSceneLayout(model));
  const fields = dims.map(d => d.field);
  ['extra-fartuk-w1-length', 'extra-fartuk-w1-width', 'extra-bortik-w2'].forEach(f => assert.ok(fields.includes(f), f));
  assert.equal(dims.find(d => d.field === 'extra-fartuk-w1-length').valueMm, 1600);
});

// ---- the page ----------------------------------------------------------------------------

const html = fs.readFileSync(path.join(__dirname, '..', 'sayanmramor-calculator.html'), 'utf8');

test('page: every wing field exists once, with its «+», its «×» and the length that fills itself', () => {
  ['extra-fartuk-w1-length', 'extra-fartuk-w1-width', 'extra-fartuk-w2-length', 'extra-fartuk-w2-width',
    'extra-wallpanel-w1-length', 'extra-wallpanel-w1-width', 'extra-wallpanel-w2-length', 'extra-wallpanel-w2-width',
    'extra-bortik-w1', 'extra-bortik-w2', 'extra-bortik-on'].forEach(id => {
    assert.equal((html.match(new RegExp('id="' + id + '"', 'g')) || []).length, 1, id);
  });
  assert.equal((html.match(/<button[^>]*data-extra-add/g) || []).length, 3, 'one «+» per element');
  assert.equal((html.match(/<button[^>]*class="extra-remove"/g) || []).length, 6, 'a «×» per wing row');
  // Every length -- the main run's and a wing's -- fills itself, and can be changed.
  assert.equal((html.match(/data-auto-length="main"/g) || []).length, 3);
  assert.equal((html.match(/data-auto-length="wing"/g) || []).length, 6);
});

test('page: «Нужен бортик» gates the curb\'s length; the rows of a closed wing are hidden', () => {
  assert.match(html, /data-toggle-field="extra-bortik-on"/);
  assert.match(html, /id="extra-bortik"[^>]*data-needs="extra-bortik-on"/);
  assert.equal((html.match(/class="reveal-row extra-wing-row"[^>]*hidden/g) || []).length, 6);
  // A wing's length is the depth plus the wing's length; the main run's is the countertop's.
  assert.match(html, /wing: depth > 0 && wingLength > 0 \? Math\.round\(depth \+ wingLength\) : 0/);
  assert.match(html, /main: length > 0 \? Math\.round\(length\) : 0/);
});
