const test = require('node:test');
const assert = require('node:assert/strict');
const Pricing = require('../pricing.js');

const slabs = [
  { article: 'P0444194', width_cm: 276, length_cm: 177, price_per_m2_rub: 11008, price_total_rub: 52673 },
  { article: 'M0517386', width_cm: 280, length_cm: 185, price_per_m2_rub: 11008, price_total_rub: 57021 },
  { article: 'P0517523', width_cm: 283, length_cm: 187, price_per_m2_rub: 11135, price_total_rub: 58589 },
];

test('findBestTypeASlab picks the cheapest slab that fits with margin', () => {
  // столешница 1.0 x 0.6 m, margin 4cm each edge -> need 108cm x 68cm, all 3 slabs fit
  const best = Pricing.findBestTypeASlab(slabs, 1.0, 0.6, 4);
  assert.equal(best.article, 'P0444194');
});

test('findBestTypeASlab allows rotation', () => {
  // 1.0m x 1.70m needs 108cm x 178cm; P0444194 (276x177) fails direct
  // (177 < 178) but fits rotated (276>=178 and 177>=108) and is cheapest
  // overall vs M0517386/P0517523 which fit directly without rotation.
  const best = Pricing.findBestTypeASlab(slabs, 1.0, 1.70, 4);
  assert.equal(best.article, 'P0444194');
});

test('findBestTypeASlab returns null when nothing fits', () => {
  const none = Pricing.findBestTypeASlab(slabs, 3, 2, 4);
  assert.equal(none, null);
});

test('computeRemainderAreaM2 uses full raw slab area', () => {
  const slab = { width_cm: 276, length_cm: 177 };
  // 2.76*1.77 = 4.8852; product 1.0*0.6 = 0.6 -> remainder 4.2852
  const remainder = Pricing.computeRemainderAreaM2(slab, 1.0, 0.6);
  assert.ok(Math.abs(remainder - 4.2852) < 0.0001);
});

test('computeTypeBResult uses the real minimum-cost combination of the fixture\'s 3 distinct slabs, not N copies of the cheapest', () => {
  // area 3*3=9 m2, waste 1.3 -> 11.7 m2 needed (target 117 in 0.1m2 units).
  // The fixture has only 3 *distinct* slabs (4.8/5.1/5.2 m2 each, floored to
  // 0.1m2 units) -- any 2 of them sum to at most 51+52=103 < 117, so all 3
  // must be used regardless of price. The true cost is the sum of all three
  // real prices (168283), not "3 x cheapest" (158019) -- the old, wrong model.
  const result = Pricing.computeTypeBResult(slabs, 3, 3, 1.3);
  assert.equal(result.slabs.length, 3);
  const articles = result.slabs.map(s => s.article).sort();
  assert.deepEqual(articles, ['M0517386', 'P0444194', 'P0517523']);
  assert.equal(result.subtotal, 52673 + 57021 + 58589);
});

test('computeTypeBResult returns null for empty slab list', () => {
  assert.equal(Pricing.computeTypeBResult([], 1, 1, 1.3), null);
});

test('computeTypeBResult reports insufficient stock as {slabs:null, subtotal:null} when even every slab combined falls short', () => {
  // area 5*3=15 m2, waste 1.3 -> 19.5 m2 needed (target 195 units); the 3-slab
  // fixture's combined capacity is only 48+51+52=151 units -- short regardless
  // of which slabs are picked, so this must report as infeasible, not guess a count.
  const result = Pricing.computeTypeBResult(slabs, 5, 3, 1.3);
  assert.equal(result.subtotal, null);
  assert.equal(result.slabs, null);
});

const SAMPLE_RATES = {
  fabricationRatePerM2: 30000,
  installationRatePerM2: 15000,
  polishRatePerM2: 10000,
  miscFlatSum: 5000,
  miscRatePerM2: 2000,
  complexShapeMultiplier: 1.5,
};
const ZERO_RATES = { fabricationRatePerM2: 0, installationRatePerM2: 0, polishRatePerM2: 0, miscFlatSum: 0, miscRatePerM2: 0, complexShapeMultiplier: 1 };
const NO_OPTIONS = { installEnabled: false, polishEnabled: false, complexEnabled: false };

test('computeWorkAndTotal: base case, no options -- work is fabrication plus misc only', () => {
  // area=2: fabrication=30000*2=60000, misc=5000+2000*2=9000, install/polish off
  const r = Pricing.computeWorkAndTotal(100000, 2, SAMPLE_RATES, NO_OPTIONS);
  assert.equal(r.fabrication, 60000);
  assert.equal(r.installation, 0);
  assert.equal(r.polish, 0);
  assert.equal(r.misc, 9000);
  assert.equal(r.work, 69000);
  assert.equal(r.total, 169000);
});

test('computeWorkAndTotal: complexEnabled scales fabrication only, not installation/polish/misc', () => {
  const r = Pricing.computeWorkAndTotal(100000, 2, SAMPLE_RATES, { installEnabled: true, polishEnabled: true, complexEnabled: true });
  // fabrication=30000*1.5*2=90000, installation=15000*2=30000, polish=10000*2=20000, misc=9000
  assert.equal(r.fabrication, 90000);
  assert.equal(r.installation, 30000);
  assert.equal(r.polish, 20000);
  assert.equal(r.misc, 9000);
  assert.equal(r.work, 90000 + 30000 + 20000 + 9000);
  assert.equal(r.total, 100000 + r.work);
});

test('computeWorkAndTotal: installEnabled and polishEnabled toggle independently', () => {
  const installOnly = Pricing.computeWorkAndTotal(100000, 2, SAMPLE_RATES, { installEnabled: true, polishEnabled: false, complexEnabled: false });
  assert.equal(installOnly.installation, 30000);
  assert.equal(installOnly.polish, 0);

  const polishOnly = Pricing.computeWorkAndTotal(100000, 2, SAMPLE_RATES, { installEnabled: false, polishEnabled: true, complexEnabled: false });
  assert.equal(polishOnly.installation, 0);
  assert.equal(polishOnly.polish, 20000);
});

test('computeWorkAndTotal: null miscFlatSum/miscRatePerM2 (no real data yet) are treated as 0, not NaN', () => {
  const ratesWithoutMisc = { fabricationRatePerM2: 0, installationRatePerM2: 0, polishRatePerM2: 0, miscFlatSum: null, miscRatePerM2: null, complexShapeMultiplier: 1 };
  const r = Pricing.computeWorkAndTotal(100000, 2, ratesWithoutMisc, NO_OPTIONS);
  assert.equal(r.misc, 0);
  assert.equal(r.work, 0);
  assert.equal(r.total, 100000);
});

test('computeWorkAndTotal: all-zero rates leave total equal to subtotal (isolates geometry tests from the pricing formula)', () => {
  const r = Pricing.computeWorkAndTotal(52673, 0.6, ZERO_RATES, NO_OPTIONS);
  assert.equal(r.work, 0);
  assert.equal(r.total, 52673);
});

test('computeWorkAndTotal: backward compatible -- omitting extraDimensions defaults extras to 0', () => {
  const r = Pricing.computeWorkAndTotal(100000, 2, SAMPLE_RATES, NO_OPTIONS);
  assert.equal(r.extras, 0);
  assert.equal(r.work, 69000); // unchanged from the base-case test above
});

test('computeWorkAndTotal: bortik/fartuk/ostrov each contribute independently to extras', () => {
  const ratesWithExtras = Object.assign({}, SAMPLE_RATES, {
    bortikRatePerM: 4000,
    fartukRatePerM2: 12000,
    ostrovRatePerM2: 45000
  });
  const bortikOnly = Pricing.computeWorkAndTotal(100000, 2, ratesWithExtras, NO_OPTIONS, { bortikLengthM: 3 });
  assert.equal(bortikOnly.extras, 12000); // 3 * 4000

  const fartukOnly = Pricing.computeWorkAndTotal(100000, 2, ratesWithExtras, NO_OPTIONS, { fartukAreaM2: 1.5 });
  assert.equal(fartukOnly.extras, 18000); // 1.5 * 12000

  const ostrovOnly = Pricing.computeWorkAndTotal(100000, 2, ratesWithExtras, NO_OPTIONS, { ostrovAreaM2: 2 });
  assert.equal(ostrovOnly.extras, 90000); // 2 * 45000

  const allThree = Pricing.computeWorkAndTotal(100000, 2, ratesWithExtras, NO_OPTIONS, { bortikLengthM: 3, fartukAreaM2: 1.5, ostrovAreaM2: 2 });
  assert.equal(allThree.extras, 12000 + 18000 + 90000);
  assert.equal(allThree.work, allThree.fabrication + allThree.installation + allThree.polish + allThree.misc + allThree.extras);
});

test('computeWorkAndTotal: null bortik/fartuk/ostrov rates (no real data yet) are treated as 0, not NaN', () => {
  const ratesWithoutExtraRates = Object.assign({}, SAMPLE_RATES, {
    bortikRatePerM: null, fartukRatePerM2: null, ostrovRatePerM2: null
  });
  const r = Pricing.computeWorkAndTotal(100000, 2, ratesWithoutExtraRates, NO_OPTIONS, { bortikLengthM: 3, fartukAreaM2: 1.5, ostrovAreaM2: 2 });
  assert.equal(r.extras, 0);
});

const stone = { name: 'Delicato Brown', slabs };

test('calculatePrice: invalid dimensions', () => {
  const r = Pricing.calculatePrice({ stone, widthM: 0, lengthM: 1, productType: 'A', rates: ZERO_RATES, ...NO_OPTIONS, marginCm: 4, wasteFactor: 1.3 });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'invalid_dimensions');
});

test('calculatePrice: no stone selected / no slabs', () => {
  const r = Pricing.calculatePrice({ stone: { name: 'X', slabs: [] }, widthM: 1, lengthM: 1, productType: 'A', rates: ZERO_RATES, ...NO_OPTIONS, marginCm: 4, wasteFactor: 1.3 });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'no_slabs_for_stone');
});

test('calculatePrice: type A no fitting slab even with a seam (cross dimension exceeds every slab side)', () => {
  // 3x3 needs a 308cm cross dimension in every orientation, but the largest
  // slab side in the fixture is 283cm -- no amount of splitting along one
  // axis can fit a 308cm cross-section, so this must fall back to "ask a manager".
  const r = Pricing.calculatePrice({ stone, widthM: 3, lengthM: 3, productType: 'A', rates: ZERO_RATES, ...NO_OPTIONS, marginCm: 4, wasteFactor: 1.3 });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'no_fitting_slab');
});

test('calculatePrice: type A with allowSeam:false skips the segmented fallback (panels look wrong with a seam)', () => {
  const plentySlabs = [].concat(slabs, slabs, slabs, slabs, slabs);
  const r = Pricing.calculatePrice({
    stone: { name: 'X', slabs: plentySlabs }, widthM: 5, lengthM: 0.6, productType: 'A',
    rates: ZERO_RATES, ...NO_OPTIONS, marginCm: 4, wasteFactor: 1.3,
    allowSeam: false
  });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'no_fitting_slab');
});

test('calculatePrice: type A allowSeam defaults to true when omitted', () => {
  const r = Pricing.calculatePrice({ stone, widthM: 1.0, lengthM: 0.6, productType: 'A', rates: ZERO_RATES, ...NO_OPTIONS, marginCm: 4, wasteFactor: 1.3 });
  assert.equal(r.ok, true);
});

test('slabCapacityForCross: a slab yields multiple parallel strips, not just one', () => {
  // 276x177 slab, cross=68 (a 0.6m-wide piece plus margin): 68 fits along
  // either side, so it's cheaper to stack strips than to burn a whole slab
  // per strip -- floor(276/68)=4 strips of length 177 (capacity 708) beats
  // floor(177/68)=2 strips of length 276 (capacity 552); take the max.
  const slab = { width_cm: 276, length_cm: 177 };
  assert.equal(Pricing.slabCapacityForCross(slab, 68), 708);
});

test('slabCapacityForCross: cross bigger than every side returns 0', () => {
  const slab = { width_cm: 276, length_cm: 177 };
  assert.equal(Pricing.slabCapacityForCross(slab, 300), 0);
});

test('findTypeASegmentedResult: 3x2 needs 2 real distinct slabs, priced as their actual combined cost', () => {
  // need_w=308, need_l=208 -> cross=208, long=308. Each of the 3 fixture slabs
  // individually caps out below 308 (177/185/187), so at least 2 are required.
  // The fixture has only ONE of each slab (not N copies), so "2 segments of the
  // cheapest slab" (the old model) would double-use a slab that physically only
  // exists once. The real cheapest *pair* that reaches 308 is P0444194 (177) +
  // M0517386 (185) = 362 >= 308, costing their real combined price.
  const r = Pricing.findTypeASegmentedResult(slabs, 3, 2, 4);
  assert.equal(r.slabs.length, 2);
  const articles = r.slabs.map(s => s.article).sort();
  assert.deepEqual(articles, ['M0517386', 'P0444194']);
  assert.equal(r.subtotal, 52673 + 57021);
});

test('findTypeASegmentedResult: cross dimension bigger than every slab side returns null', () => {
  const r = Pricing.findTypeASegmentedResult(slabs, 3, 3, 4);
  assert.equal(r, null);
});

test('calculatePrice: type A happy path, zero rates -- total equals subtotal (the formula itself is tested in the computeWorkAndTotal tests above)', () => {
  const r = Pricing.calculatePrice({ stone, widthM: 1.0, lengthM: 0.6, productType: 'A', rates: ZERO_RATES, ...NO_OPTIONS, marginCm: 4, wasteFactor: 1.3 });
  assert.equal(r.ok, true);
  assert.equal(r.matchedSlab.article, 'P0444194');
  assert.equal(r.subtotal, 52673);
  assert.equal(r.total, 52673);
  assert.equal(r.nSlabs, 1);
  assert.ok(Math.abs(r.remainderM2 - 4.2852) < 0.0001);
});

const plentySlabs = [].concat(slabs, slabs, slabs, slabs, slabs); // 15 slabs, enough stock for seam scenarios

test('calculatePrice: type A, 10x0.6 countertop needs a seam (far too long for one slab)', () => {
  // need_l=1008cm, cross=68cm -> best capacity per slab is floor(276/68)*177=708
  // (see slabCapacityForCross test above): ceil(1008/708) = 2 slabs, not 4 --
  // a slab yields more than one strip, so segments-per-slab must be counted.
  const r = Pricing.calculatePrice({ stone: { name: 'X', slabs: plentySlabs }, widthM: 10, lengthM: 0.6, productType: 'A', rates: ZERO_RATES, ...NO_OPTIONS, marginCm: 4, wasteFactor: 1.3 });
  assert.equal(r.ok, true);
  assert.equal(r.nSlabs, 2);
  assert.equal(r.subtotal, 2 * 52673);
  assert.equal(r.remainderM2, null);
});

test('calculatePrice: type A, 5x0.6 countertop fits a single slab cut into two pieces (area alone would be misleading)', () => {
  const r = Pricing.calculatePrice({ stone: { name: 'X', slabs: plentySlabs }, widthM: 5, lengthM: 0.6, productType: 'A', rates: ZERO_RATES, ...NO_OPTIONS, marginCm: 4, wasteFactor: 1.3 });
  assert.equal(r.ok, true);
  assert.equal(r.nSlabs, 1);
  assert.equal(r.subtotal, 52673);
  assert.equal(r.remainderM2, null);
});

test('calculatePrice: type A, 2x1.5 countertop still fits a single slab (no seam)', () => {
  const r = Pricing.calculatePrice({ stone, widthM: 2, lengthM: 1.5, productType: 'A', rates: ZERO_RATES, ...NO_OPTIONS, marginCm: 4, wasteFactor: 1.3 });
  assert.equal(r.ok, true);
  assert.equal(r.nSlabs, 1);
  assert.equal(r.matchedSlab.article, 'P0444194');
  assert.equal(r.subtotal, 52673);
  assert.ok(r.remainderM2 > 0);
});

test('calculatePrice: type B happy path uses the real combined cost of the distinct slabs actually needed', () => {
  const r = Pricing.calculatePrice({ stone, widthM: 3, lengthM: 3, productType: 'B', rates: ZERO_RATES, ...NO_OPTIONS, marginCm: 4, wasteFactor: 1.3 });
  assert.equal(r.ok, true);
  assert.equal(r.nSlabs, 3);
  assert.equal(r.subtotal, 52673 + 57021 + 58589);
  assert.equal(r.remainderM2, null);
  assert.equal(r.matchedSlabs.length, 3);
  assert.equal(r.matchedSlab, r.matchedSlabs[0]);
});

test('calculatePrice: type B reports insufficient_stock without guessing a slab count', () => {
  const r = Pricing.calculatePrice({ stone, widthM: 5, lengthM: 3, productType: 'B', rates: ZERO_RATES, ...NO_OPTIONS, marginCm: 4, wasteFactor: 1.3 });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'insufficient_stock');
  assert.equal(r.total, null);
});

// Regression coverage for the "Black Mirror" quartz-agglomerate bug: the
// scraper can capture a slab's price_per_m2_rub while leaving
// price_total_rub null (site showed no parseable total for that row). Every
// slab-selection path must never let a priceless slab win a "cheapest"
// comparison or feed a subtotal calculation -- JS coerces `null` to `0` in
// both `<` comparisons and arithmetic, so an unguarded selector silently
// treats "no price data" as "free" instead of surfacing an error.
const nullPricedSlabs = [
  { article: 'NOPRICE-1', width_cm: 320, length_cm: 80, price_per_m2_rub: 52240, price_total_rub: null },
  { article: 'NOPRICE-2', width_cm: 320, length_cm: 160, price_per_m2_rub: 117539, price_total_rub: null },
];

test('findBestTypeASlab never selects a slab with null price_total_rub', () => {
  // Fits directly (need 108x68cm with margin against a 320x160cm slab) but
  // has no total price -- must be treated as unusable, not as free/cheapest.
  const best = Pricing.findBestTypeASlab(nullPricedSlabs, 1.0, 0.6, 4);
  assert.equal(best, null);
});

test('findBestTypeASlab skips a null-priced slab even when it would otherwise win on price', () => {
  const mixed = [
    { article: 'PRICED', width_cm: 320, length_cm: 160, price_per_m2_rub: 117539, price_total_rub: 188062 },
    { article: 'NOPRICE', width_cm: 320, length_cm: 160, price_per_m2_rub: 52240, price_total_rub: null },
  ];
  const best = Pricing.findBestTypeASlab(mixed, 1.0, 0.6, 4);
  assert.equal(best.article, 'PRICED');
});

test('findTypeASegmentedResult skips null-priced slabs when picking the segmentation candidate', () => {
  // Reproduces the Black Mirror 3.5x0.7m case: the cheapest-per-m2 slab
  // (320x80) has no total price and only fits 1 strip per pass (capacity
  // 320), which would wrongly need 2 segments -- once it's excluded, the
  // only remaining priced-but-pricier slab (320x160, capacity 640) covers
  // the whole 358cm length in a single segment.
  const r = Pricing.findTypeASegmentedResult(nullPricedSlabs, 3.5, 0.7, 4);
  assert.equal(r, null); // both candidates here lack a price -- nothing usable
});

test('findTypeASegmentedResult: with one valid-priced slab available, uses it instead of a cheaper null-priced one', () => {
  const mixed = [
    { article: 'NOPRICE', width_cm: 320, length_cm: 80, price_per_m2_rub: 52240, price_total_rub: null },
    { article: 'PRICED', width_cm: 320, length_cm: 160, price_per_m2_rub: 117539, price_total_rub: 188062 },
  ];
  const r = Pricing.findTypeASegmentedResult(mixed, 3.5, 0.7, 4);
  assert.equal(r.slabs.length, 1);
  assert.equal(r.slabs[0].article, 'PRICED');
  assert.equal(r.subtotal, 188062);
});

test('computeTypeBResult never selects a slab with null price_total_rub', () => {
  const result = Pricing.computeTypeBResult(nullPricedSlabs, 1, 1, 1.3);
  assert.equal(result, null);
});

test('computeTypeBResult skips a null-priced slab even when it would otherwise win on price-per-m2', () => {
  const mixed = [
    { article: 'PRICED', width_cm: 276, length_cm: 177, price_per_m2_rub: 11135, price_total_rub: 58589 },
    { article: 'NOPRICE', width_cm: 276, length_cm: 177, price_per_m2_rub: 5000, price_total_rub: null },
  ];
  const result = Pricing.computeTypeBResult(mixed, 1, 1, 1.3);
  assert.equal(result.slabs.length, 1);
  assert.equal(result.slabs[0].article, 'PRICED');
});

// --- minCostCover: the exact 0/1 minimum-cost covering DP that replaces the
// old "N copies of one representative slab" extrapolation. ---

test('minCostCover: a single item already meeting the target is chosen alone', () => {
  const items = [{ capacity: 10, cost: 50, ref: 'A' }];
  const r = Pricing.minCostCover(items, 8);
  assert.deepEqual(r.chosen, ['A']);
  assert.equal(r.cost, 50);
});

test('minCostCover: exact DP beats greedy-cheapest-first on a classic counterexample', () => {
  // target 10: item A (cap 5, cost 5) alone is cheap but insufficient; item B
  // (cap 10, cost 9) alone already meets the target. Greedy-by-price picks A
  // first (cheaper), then still needs B too -> 14. The true optimum is B alone -> 9.
  const items = [
    { capacity: 5, cost: 5, ref: 'A' },
    { capacity: 10, cost: 9, ref: 'B' },
  ];
  const r = Pricing.minCostCover(items, 10);
  assert.deepEqual(r.chosen, ['B']);
  assert.equal(r.cost, 9);
});

test('minCostCover: combines two items when no single item suffices', () => {
  const items = [
    { capacity: 6, cost: 4, ref: 'A' },
    { capacity: 6, cost: 5, ref: 'B' },
  ];
  const r = Pricing.minCostCover(items, 10);
  assert.equal(r.chosen.length, 2);
  assert.equal(r.cost, 9);
});

test('minCostCover: returns null when every item combined still falls short', () => {
  const items = [
    { capacity: 3, cost: 1, ref: 'A' },
    { capacity: 3, cost: 1, ref: 'B' },
  ];
  assert.equal(Pricing.minCostCover(items, 10), null);
});

test('minCostCover: target 0 is trivially satisfied with nothing chosen', () => {
  const r = Pricing.minCostCover([{ capacity: 5, cost: 1, ref: 'A' }], 0);
  assert.deepEqual(r.chosen, []);
  assert.equal(r.cost, 0);
});

test('minCostCover: picks the genuinely cheaper of two same-size options, not the first one', () => {
  const items = [
    { capacity: 10, cost: 20, ref: 'expensive' },
    { capacity: 10, cost: 15, ref: 'cheap' },
  ];
  const r = Pricing.minCostCover(items, 10);
  assert.deepEqual(r.chosen, ['cheap']);
  assert.equal(r.cost, 15);
});

// Regression coverage for the exact scenario discussed with the user: a stone
// with only 2 slabs in stock, different size/price, where the product needs
// BOTH because neither alone (even repeated, which isn't physically possible
// here since there's only one of each) covers the required length. The old
// "segments x one representative slab's price" model quoted 2 x 40000 = 80000
// (as if a second copy of the cheap slab existed); the real answer is the sum
// of the two real, distinct slabs actually used: 40000 + 100000 = 140000.
test('findTypeASegmentedResult: when 2 distinct slabs are both required, sums their real prices (not 2x the cheaper one)', () => {
  const slabB = { article: 'B-cheap', width_cm: 300, length_cm: 80, price_total_rub: 40000, price_per_m2_rub: 40000 / (3.00 * 0.80) };
  const slabA = { article: 'A-expensive', width_cm: 320, length_cm: 100, price_total_rub: 100000, price_per_m2_rub: 100000 / (3.20 * 1.00) };
  // cross=90cm, long=400cm (marginCm=0 for round numbers): capacity(B)=240, capacity(A)=320 -- neither alone reaches 400, combined 560 does.
  const r = Pricing.findTypeASegmentedResult([slabB, slabA], 0.9, 4.0, 0);
  assert.equal(r.slabs.length, 2);
  const articles = r.slabs.map(s => s.article).sort();
  assert.deepEqual(articles, ['A-expensive', 'B-cheap']);
  assert.equal(r.subtotal, 140000);
});

test('calculatePrice: stone with slabs but none priced reports a distinct "no price data" reason, not ≈0 ₽', () => {
  const r = Pricing.calculatePrice({
    stone: { name: 'Black Mirror', slabs: nullPricedSlabs }, widthM: 3.5, lengthM: 0.7, productType: 'A',
    rates: ZERO_RATES, ...NO_OPTIONS, marginCm: 4, wasteFactor: 1.3
  });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'no_priced_slab');
  assert.equal(r.total, null);
});

test('calculatePrice: type B stone with slabs but none priced reports "no price data", not ≈0 ₽', () => {
  const r = Pricing.calculatePrice({
    stone: { name: 'Black Mirror', slabs: nullPricedSlabs }, widthM: 1, lengthM: 1, productType: 'B',
    rates: ZERO_RATES, ...NO_OPTIONS, marginCm: 4, wasteFactor: 1.3
  });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'no_priced_slab');
  assert.equal(r.total, null);
});

test('calculatePrice: rates and option flags flow through to the top-level result', () => {
  const r = Pricing.calculatePrice({
    stone, widthM: 1.0, lengthM: 0.6, productType: 'A',
    rates: SAMPLE_RATES, installEnabled: true, polishEnabled: true, complexEnabled: true,
    marginCm: 4, wasteFactor: 1.3
  });
  assert.equal(r.ok, true);
  assert.equal(r.subtotal, 52673);
  const area = 1.0 * 0.6;
  const fabrication = SAMPLE_RATES.fabricationRatePerM2 * SAMPLE_RATES.complexShapeMultiplier * area;
  const installation = SAMPLE_RATES.installationRatePerM2 * area;
  const polish = SAMPLE_RATES.polishRatePerM2 * area;
  const misc = SAMPLE_RATES.miscFlatSum + SAMPLE_RATES.miscRatePerM2 * area;
  assert.ok(Math.abs(r.fabrication - fabrication) < 0.001);
  assert.ok(Math.abs(r.installation - installation) < 0.001);
  assert.ok(Math.abs(r.polish - polish) < 0.001);
  assert.ok(Math.abs(r.misc - misc) < 0.001);
  assert.ok(Math.abs(r.total - (r.subtotal + fabrication + installation + polish + misc)) < 0.001);
});

test('calculatePrice: installEnabled/polishEnabled/complexEnabled default to false when omitted', () => {
  const r = Pricing.calculatePrice({ stone, widthM: 1.0, lengthM: 0.6, productType: 'A', rates: SAMPLE_RATES, marginCm: 4, wasteFactor: 1.3 });
  assert.equal(r.installation, 0);
  assert.equal(r.polish, 0);
  assert.equal(r.fabrication, SAMPLE_RATES.fabricationRatePerM2 * (1.0 * 0.6));
});

test('calculatePrice: extraDimensions flow through to the top-level extras field', () => {
  const ratesWithExtras = Object.assign({}, SAMPLE_RATES, {
    bortikRatePerM: 4000,
    fartukRatePerM2: 12000,
    ostrovRatePerM2: 45000
  });
  const r = Pricing.calculatePrice({
    stone, widthM: 1.0, lengthM: 0.6, productType: 'A',
    rates: ratesWithExtras, extraDimensions: { bortikLengthM: 3, fartukAreaM2: 1.5, ostrovAreaM2: 2 },
    marginCm: 4, wasteFactor: 1.3
  });
  assert.equal(r.ok, true);
  assert.equal(r.extras, 3 * 4000 + 1.5 * 12000 + 2 * 45000);
  assert.equal(r.total, r.subtotal + r.fabrication + r.installation + r.polish + r.misc + r.extras);
});

test('calculatePrice: extraDimensions defaults to zero extras when omitted (backward compatible)', () => {
  const r = Pricing.calculatePrice({ stone, widthM: 1.0, lengthM: 0.6, productType: 'A', rates: SAMPLE_RATES, marginCm: 4, wasteFactor: 1.3 });
  assert.equal(r.extras, 0);
});
