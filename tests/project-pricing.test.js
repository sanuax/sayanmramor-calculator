// tests/project-pricing.test.js
//
// One price for the project (the owner, 2026-11-17): the products of one stone are cut from the
// same slabs together (one layout, as a countertop's backsplash and island are), products of
// other stones from their own; each product's work as it is priced alone; the measure and the
// delivery once; the minimum order on the project's total.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createFakeDoc } = require('./helpers/fake-dom.js');
const ProductTypes = require('../product-types.js');
const ConstructorState = require('../constructor-state.js');
const ProjectPricing = require('../project-pricing.js');

const { PRODUCTS, hasAdditionalWork } = ProductTypes;
const v = x => ({ value: String(x) });
const on = { checked: true };
const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, (msg || '') + ': ' + a + ' vs ' + b);

// Slabs 1.6 x 3.2 m; `n` of them, each its own article.
const stone = (id, n, price, extra) => Object.assign({
  id, name: id, category: 'marble', available: true,
  slabs: Array.from({ length: n }, (_, i) => ({ article: id + '-' + i, width_cm: 160, length_cm: 320, price_total_rub: price || 100000 })),
}, extra || {});

function stateOf(key, values, st) {
  return ConstructorState.readConstructorState({
    doc: createFakeDoc(values), selectedProductKey: key, product: PRODUCTS[key], stone: st, hasAdditionalWork,
  });
}
const countertop = (st, extra) => stateOf('stoleshnitsa_kuhnya', Object.assign({ width: v(600), length: v(2400) }, extra || {}), st);
const sill = (st, extra) => stateOf('podokonnik', Object.assign({ width: v(300), length: v(1200), productSubcategory: v('SILL-01') }, extra || {}), st);
const extrasOf = r => (r.measure || 0) + (r.delivery || 0) + (r.minOrderTopUp || 0);

test('one product: the project is the product', () => {
  const s = countertop(stone('a', 4));
  const alone = ProjectPricing.priceItem(s);
  assert.equal(alone.kind, 'ok');
  const p = ProjectPricing.priceProject([s]);
  assert.equal(p.kind, 'ok');
  close(p.total, alone.result.total, 'the same total');
});

test('the same stone: one cut -- never dearer than apart, and here one slab instead of two', () => {
  const st = stone('a', 4);
  const a = countertop(st), b = sill(st);
  const p = ProjectPricing.priceProject([a, b]);
  assert.equal(p.kind, 'ok');
  assert.equal(p.groups.length, 1);
  assert.equal(p.groups[0].nSlabs, 1, 'both from one slab');
  const apart = ProjectPricing.priceItem(a).result.total + ProjectPricing.priceItem(b).result.total;
  assert.ok(p.total < apart, p.total + ' < ' + apart);
  close(p.items[0].price + p.items[1].price + extrasOf(p), p.total, 'the products\' prices add up to the total');
});

test('different stones: each from its own slabs', () => {
  const p = ProjectPricing.priceProject([countertop(stone('a', 4)), sill(stone('b', 4))]);
  assert.equal(p.kind, 'ok');
  assert.deepEqual(p.groups.map(g => g.stoneId).sort(), ['a', 'b']);
  assert.deepEqual(p.groups.map(g => g.itemIndexes.length), [1, 1]);
});

test('the measure and the delivery are charged once for the project', () => {
  const st = stone('a', 4);
  const opts = { 'opt-measure': on, 'opt-delivery': on };
  const p = ProjectPricing.priceProject([countertop(st, opts), sill(st, opts)]);
  assert.equal(p.measure, 15000);
  assert.equal(p.delivery, 12000);
  // ...and only where asked: none asked, none charged.
  const none = ProjectPricing.priceProject([countertop(st), sill(st)]);
  assert.equal(none.measure, 0);
  assert.equal(none.delivery, 0);
  // One product asking is enough.
  const one = ProjectPricing.priceProject([countertop(st, { 'opt-measure': on }), sill(st)]);
  assert.equal(one.measure, 15000);
});

test('the minimum order is on the project\'s total, not on each product', () => {
  const cheap = stone('c', 2, 1000);
  const tiny = () => sill(cheap, { width: v(200), length: v(300) });
  const p = ProjectPricing.priceProject([tiny(), tiny()]);
  assert.equal(p.kind, 'ok');
  const raw = p.items[0].price + p.items[1].price + p.measure + p.delivery;
  assert.ok(raw < 20000, 'the case is below the minimum: ' + raw);
  close(p.minOrderTopUp, 20000 - raw);
  close(p.total, 20000);
});

test('a product the manager prices keeps the others priced; the total is the manager\'s', () => {
  const p = ProjectPricing.priceProject([countertop(stone('a', 4)), sill(stone('gone', 4, 100000, { available: false }))]);
  assert.equal(p.kind, 'manual');
  assert.equal(p.total, null);
  assert.equal(typeof p.items[0].price, 'number');
  assert.equal(p.items[1].kind, 'manual');
  assert.equal(p.items[1].reason, 'stone_unavailable');
});

test('a product still being configured: the project is incomplete', () => {
  const p = ProjectPricing.priceProject([countertop(stone('a', 4)), stateOf('podokonnik', {}, stone('a', 4))]);
  assert.equal(p.kind, 'incomplete');
  assert.equal(p.total, null);
});

test('one stone, each fits its slab alone but not both together: the manager\'s, with the stock as the reason', () => {
  const st = stone('one', 1);
  const big = () => countertop(st, { width: v(900), length: v(3000) });
  assert.equal(ProjectPricing.priceItem(big()).kind, 'ok', 'alone it is cut');
  const p = ProjectPricing.priceProject([big(), big()]);
  assert.equal(p.kind, 'manual');
  assert.equal(p.groups[0].ok, false);
  assert.equal(p.reason, 'insufficient_stock');
  assert.equal(p.total, null);
});

test('a surface product of the same stone takes the slabs the pieces left', () => {
  const st = stone('a', 6);
  const floor = stateOf('pol', { width: v(2000), length: v(2000), productSubcategory: v('FLOOR-01') }, st);
  const p = ProjectPricing.priceProject([countertop(st), floor]);
  assert.equal(p.kind, 'ok');
  const pieces = ProjectPricing.priceItem(countertop(st)).result.nSlabs;
  const surface = ProjectPricing.priceItem(floor).result.nSlabs;
  assert.equal(p.groups[0].nSlabs, pieces + surface, 'the pieces\' slabs and the surface\'s, none shared');
  const used = p.groups[0].slabs.map(s => s.article);
  assert.equal(new Set(used).size, used.length, 'no slab counted twice');
});
