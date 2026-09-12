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

test('computeTypeBResult picks cheapest-per-m2 slab and computes slab count', () => {
  // area 3*3=9 m2, waste 1.3 -> 11.7 m2 needed; cheapest per-m2 is P0444194 (11008), area 2.76*1.77=4.8852
  // ceil(11.7 / 4.8852) = 3, which fits within the 3-slab fixture
  const result = Pricing.computeTypeBResult(slabs, 3, 3, 1.3);
  assert.equal(result.slab.article, 'P0444194');
  assert.equal(result.nSlabs, 3);
  assert.equal(result.subtotal, 3 * 52673);
});

test('computeTypeBResult returns null for empty slab list', () => {
  assert.equal(Pricing.computeTypeBResult([], 1, 1, 1.3), null);
});

test('computeTypeBResult reports insufficient stock (not a bare null) when nSlabs exceeds the stone\'s slab count', () => {
  // area 5*3=15 m2, waste 1.3 -> 19.5 m2 needed; ceil(19.5 / 4.8852) = 4, but the
  // fixture only has 3 slabs in stock -- must not quote more slabs than exist,
  // but must still say how many are needed vs available (not "no data at all").
  const result = Pricing.computeTypeBResult(slabs, 5, 3, 1.3);
  assert.equal(result.subtotal, null);
  assert.equal(result.nSlabs, 4);
  assert.equal(result.availableCount, 3);
  assert.equal(result.slab.article, 'P0444194');
});

test('computeWorkAndTotal matches spec-verified example (complexity 1.0, no options)', () => {
  const { work, total } = Pricing.computeWorkAndTotal(52673, 2, 1.0, 0);
  assert.equal(work, 105346);
  assert.equal(total, 158019);
});

test('computeWorkAndTotal compounds complexity and options', () => {
  // complexity 1.8 (лестница), one option +0.25 -> work = 52673 * 2 * 1.8 * 1.25
  const { work, total } = Pricing.computeWorkAndTotal(52673, 2, 1.8, 0.25);
  assert.ok(Math.abs(work - 52673 * 2 * 1.8 * 1.25) < 0.001);
  assert.ok(Math.abs(total - (52673 + work)) < 0.001);
});

const stone = { name: 'Delicato Brown', slabs };

test('calculatePrice: invalid dimensions', () => {
  const r = Pricing.calculatePrice({ stone, widthM: 0, lengthM: 1, productType: 'A', complexityMultiplier: 1, optionSurchargeSum: 0, marginCm: 4, wasteFactor: 1.3, workMultiplier: 2 });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'invalid_dimensions');
});

test('calculatePrice: no stone selected / no slabs', () => {
  const r = Pricing.calculatePrice({ stone: { name: 'X', slabs: [] }, widthM: 1, lengthM: 1, productType: 'A', complexityMultiplier: 1, optionSurchargeSum: 0, marginCm: 4, wasteFactor: 1.3, workMultiplier: 2 });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'no_slabs_for_stone');
});

test('calculatePrice: type A no fitting slab even with a seam (cross dimension exceeds every slab side)', () => {
  // 3x3 needs a 308cm cross dimension in every orientation, but the largest
  // slab side in the fixture is 283cm -- no amount of splitting along one
  // axis can fit a 308cm cross-section, so this must fall back to "ask a manager".
  const r = Pricing.calculatePrice({ stone, widthM: 3, lengthM: 3, productType: 'A', complexityMultiplier: 1, optionSurchargeSum: 0, marginCm: 4, wasteFactor: 1.3, workMultiplier: 2 });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'no_fitting_slab');
});

test('calculatePrice: type A with allowSeam:false skips the segmented fallback (panels look wrong with a seam)', () => {
  // Same 5x0.6 case that succeeds as a 1-slab seam when allowSeam defaults to
  // true (see the countertop test below) -- with allowSeam:false it must go
  // straight to "ask a manager" instead of silently proposing a seam.
  const plentySlabs = [].concat(slabs, slabs, slabs, slabs, slabs);
  const r = Pricing.calculatePrice({
    stone: { name: 'X', slabs: plentySlabs }, widthM: 5, lengthM: 0.6, productType: 'A',
    complexityMultiplier: 1, optionSurchargeSum: 0, marginCm: 4, wasteFactor: 1.3, workMultiplier: 2,
    allowSeam: false
  });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'no_fitting_slab');
});

test('calculatePrice: type A allowSeam defaults to true when omitted', () => {
  const r = Pricing.calculatePrice({ stone, widthM: 1.0, lengthM: 0.6, productType: 'A', complexityMultiplier: 1.0, optionSurchargeSum: 0, marginCm: 4, wasteFactor: 1.3, workMultiplier: 2 });
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

test('findTypeASegmentedResult: 3x2 splits into 2 segments along the long axis', () => {
  // need_w=308, need_l=208 -> cross=208, long=308. Cheapest slab by price_per_m2
  // is P0444194 (276x177); cross (208) only fits its long side (276), and only
  // one strip fits (floor(276/208)=1), giving capacity 1*177=177: ceil(308/177)=2.
  const r = Pricing.findTypeASegmentedResult(slabs, 3, 2, 4);
  assert.equal(r.slab.article, 'P0444194');
  assert.equal(r.segments, 2);
  assert.equal(r.subtotal, 2 * 52673);
});

test('findTypeASegmentedResult: cross dimension bigger than every slab side returns null', () => {
  const r = Pricing.findTypeASegmentedResult(slabs, 3, 3, 4);
  assert.equal(r, null);
});

test('calculatePrice: type A happy path matches spec-verified numbers', () => {
  const r = Pricing.calculatePrice({ stone, widthM: 1.0, lengthM: 0.6, productType: 'A', complexityMultiplier: 1.0, optionSurchargeSum: 0, marginCm: 4, wasteFactor: 1.3, workMultiplier: 2 });
  assert.equal(r.ok, true);
  assert.equal(r.matchedSlab.article, 'P0444194');
  assert.equal(r.subtotal, 52673);
  assert.equal(r.total, 158019);
  assert.equal(r.nSlabs, 1);
  assert.ok(Math.abs(r.remainderM2 - 4.2852) < 0.0001);
});

const plentySlabs = [].concat(slabs, slabs, slabs, slabs, slabs); // 15 slabs, enough stock for seam scenarios

test('calculatePrice: type A, 10x0.6 countertop needs a seam (far too long for one slab)', () => {
  // need_l=1008cm, cross=68cm -> best capacity per slab is floor(276/68)*177=708
  // (see slabCapacityForCross test above): ceil(1008/708) = 2 slabs, not 4 --
  // a slab yields more than one strip, so segments-per-slab must be counted.
  const r = Pricing.calculatePrice({ stone: { name: 'X', slabs: plentySlabs }, widthM: 10, lengthM: 0.6, productType: 'A', complexityMultiplier: 1, optionSurchargeSum: 0, marginCm: 4, wasteFactor: 1.3, workMultiplier: 2 });
  assert.equal(r.ok, true);
  assert.equal(r.nSlabs, 2);
  assert.equal(r.subtotal, 2 * 52673);
  assert.equal(r.remainderM2, null);
});

test('calculatePrice: type A, 5x0.6 countertop fits a single slab cut into two pieces (area alone would be misleading)', () => {
  // Area check would be misleading here: 5*0.6=3m2 fits inside a single slab's
  // ~4.8m2, but geometrically the 5m length exceeds every slab's longest side
  // (2.83m) in any rotation, so findBestTypeASlab (whole-piece fit) fails and
  // this falls through to the seam path. But the seam path must recognize that
  // one slab can supply two strips (708cm of achievable length, see above),
  // which comfortably covers the needed 508cm as one slab cut in two, not two
  // separate slabs.
  const r = Pricing.calculatePrice({ stone: { name: 'X', slabs: plentySlabs }, widthM: 5, lengthM: 0.6, productType: 'A', complexityMultiplier: 1, optionSurchargeSum: 0, marginCm: 4, wasteFactor: 1.3, workMultiplier: 2 });
  assert.equal(r.ok, true);
  assert.equal(r.nSlabs, 1);
  assert.equal(r.subtotal, 52673);
  assert.equal(r.remainderM2, null);
});

test('calculatePrice: type A, 2x1.5 countertop still fits a single slab (no seam)', () => {
  const r = Pricing.calculatePrice({ stone, widthM: 2, lengthM: 1.5, productType: 'A', complexityMultiplier: 1, optionSurchargeSum: 0, marginCm: 4, wasteFactor: 1.3, workMultiplier: 2 });
  assert.equal(r.ok, true);
  assert.equal(r.nSlabs, 1);
  assert.equal(r.matchedSlab.article, 'P0444194');
  assert.equal(r.subtotal, 52673);
  assert.ok(r.remainderM2 > 0);
});

test('calculatePrice: type B happy path', () => {
  // widthM 3 x lengthM 3 against the 3-slab fixture -> nSlabs 3, within stock (see
  // computeTypeBResult tests above for the area/slab-count math).
  const r = Pricing.calculatePrice({ stone, widthM: 3, lengthM: 3, productType: 'B', complexityMultiplier: 1.1, optionSurchargeSum: 0, marginCm: 4, wasteFactor: 1.3, workMultiplier: 2 });
  assert.equal(r.ok, true);
  assert.equal(r.nSlabs, 3);
  assert.equal(r.subtotal, 3 * 52673);
  assert.equal(r.remainderM2, null);
  assert.equal(r.availableCount, 3);
});

test('calculatePrice: type B reports insufficient_stock with counts, not a generic no-data message', () => {
  // widthM 5 x lengthM 3 = 15 m2 against the 3-slab fixture -> needs 4 slabs, only 3 in stock.
  const r = Pricing.calculatePrice({ stone, widthM: 5, lengthM: 3, productType: 'B', complexityMultiplier: 1.1, optionSurchargeSum: 0, marginCm: 4, wasteFactor: 1.3, workMultiplier: 2 });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'insufficient_stock');
  assert.equal(r.nSlabs, 4);
  assert.equal(r.availableCount, 3);
  assert.equal(r.matchedSlab.article, 'P0444194');
});
