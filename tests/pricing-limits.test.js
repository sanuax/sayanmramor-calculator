// tests/pricing-limits.test.js
//
// Absurd sizes never reach the slab search: a controlled outcome instead of
// a RangeError («Array buffer allocation failed») or a hang, and every
// realistic size is priced exactly as before.
const test = require('node:test');
const assert = require('node:assert/strict');
const Pricing = require('../pricing.js');
const ProductTypes = require('../product-types.js');

const { PRICING_LIMITS } = Pricing;

// Realistic stock: 40 priced slabs of 300 x 180 cm.
const STONE = {
  slabs: Array.from({ length: 40 }, (_, i) => ({ article: 'S' + i, price_total_rub: 40000 + i * 100, width_cm: 300, length_cm: 180 })),
};

function price(productType, widthM, lengthM, extra) {
  return Pricing.calculatePrice(Object.assign({
    stone: STONE, widthM, lengthM, productType,
    rates: ProductTypes.WORK_RATES.stoleshnitsa_kuhnya,
    marginCm: ProductTypes.SAW_MARGIN_CM, usageLimit: ProductTypes.SLAB_USAGE_LIMIT,
  }, extra || {}));
}

function timed(fn) {
  const t0 = Date.now();
  const r = fn();
  return { r, ms: Date.now() - t0 };
}

test('the limits of the online estimate live in one place', () => {
  assert.deepEqual(PRICING_LIMITS, { maxSideM: 100, maxAreaM2: 10000 });
});

test('99 999 999 mm: a controlled «too large» outcome, no RangeError, no allocation, fast -- for Type A and Type B', () => {
  const absurd = 99999999 / 1000;
  [['A', absurd, 0.6], ['A', 0.6, absurd], ['B', absurd, 3], ['B', absurd, absurd]].forEach(([type, w, l]) => {
    const { r, ms } = timed(() => price(type, w, l));
    assert.equal(r.ok, false, type);
    assert.equal(r.reason, 'dimensions_too_large', type + ' ' + w + 'x' + l);
    assert.equal(r.total, null);
    assert.ok(ms < 200, type + ' took ' + ms + ' ms');
  });
  // Not a finite size at all (a field reading 1e400).
  assert.equal(price('A', Infinity, 0.6).reason, 'dimensions_too_large');
  assert.equal(price('B', 3, Infinity).reason, 'dimensions_too_large');
  // A facade's explicit cladded area.
  assert.equal(price('B', 0, 0, { areaM2: 10001 }).reason, 'dimensions_too_large');
  assert.equal(price('B', 0, 0, { areaM2: Infinity }).reason, 'invalid_dimensions');
});

test('the limits are inclusive: exactly 100 m / 10 000 m² is still priced (or a stock outcome), just past them is too large', () => {
  assert.notEqual(price('A', 0.6, 100).reason, 'dimensions_too_large');
  assert.equal(price('A', 0.6, 100.001).reason, 'dimensions_too_large');
  assert.notEqual(price('B', 100, 100).reason, 'dimensions_too_large');
  assert.equal(price('B', 100, 100.01).reason, 'dimensions_too_large');
  assert.equal(price('B', 50, 50).reason, 'insufficient_stock', '2 500 m² is more than the whole stock -- a stock outcome, not a crash');
  assert.notEqual(price('B', 0, 0, { areaM2: 10000 }).reason, 'dimensions_too_large');
});

test('normal, minimal and large-but-realistic sizes are priced as before', () => {
  const normal = price('A', 0.6, 2.4);
  assert.equal(normal.ok, true);
  assert.equal(normal.nSlabs, 1);
  const tiny = price('A', 0.001, 0.001);
  assert.equal(tiny.ok, true, 'a 1 x 1 mm piece is still a (tiny) product');
  const longRun = price('A', 0.6, 9);
  assert.equal(longRun.ok, true, 'a 9 m run is cut from several slabs with a seam');
  assert.ok(longRun.nSlabs > 1);
  const floor = price('B', 8, 6);
  assert.equal(floor.ok, true, 'a 48 m² floor');
  const facadeArea = price('B', 0, 0, { areaM2: 60 });
  assert.equal(facadeArea.ok, true);
  // The same stone as the surface path computes directly (35% reserve).
  const surface = Pricing.planSurface(STONE.slabs, 48, ProductTypes.SLAB_USAGE_LIMIT);
  assert.equal(floor.subtotal, surface.used.reduce((s, u) => s + u.slab.price_total_rub, 0));
});

test('minCostCover: an unreachable target returns «no cover» at once, without the DP arrays', () => {
  const items = [{ capacity: 300, cost: 10, ref: 'a' }, { capacity: 500, cost: 12, ref: 'b' }];
  const { r, ms } = timed(() => Pricing.minCostCover(items, 1e9));
  assert.equal(r, null);
  assert.ok(ms < 50, ms + ' ms');
  assert.equal(Pricing.minCostCover([], 10), null);
  assert.deepEqual(Pricing.minCostCover(items, 0), { chosen: [], cost: 0 });
});

test('minCostCover: the early exit never changes a reachable answer (checked against brute force)', () => {
  let seed = 7;
  const rnd = n => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  for (let run = 0; run < 300; run++) {
    const items = Array.from({ length: 1 + rnd(6) }, (_, i) => ({ capacity: 1 + rnd(40), cost: 1 + rnd(50), ref: i }));
    const target = rnd(120);
    let best = Infinity;
    for (let mask = 0; mask < (1 << items.length); mask++) {
      let cap = 0, cost = 0;
      items.forEach((it, i) => { if (mask & (1 << i)) { cap += it.capacity; cost += it.cost; } });
      if (cap >= target && cost < best) best = cost;
    }
    const r = Pricing.minCostCover(items, target);
    if (best === Infinity) assert.equal(r, null, 'run ' + run);
    else assert.equal(r.cost, best, 'run ' + run);
  }
});
