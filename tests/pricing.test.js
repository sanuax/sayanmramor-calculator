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

test('computeTypeBResult returns null when nSlabs would exceed the stone\'s actual slab count', () => {
  // area 5*3=15 m2, waste 1.3 -> 19.5 m2 needed; ceil(19.5 / 4.8852) = 4, but the
  // fixture only has 3 slabs in stock -- must not quote more slabs than exist.
  const result = Pricing.computeTypeBResult(slabs, 5, 3, 1.3);
  assert.equal(result, null);
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

test('calculatePrice: type A no fitting slab', () => {
  const r = Pricing.calculatePrice({ stone, widthM: 3, lengthM: 2, productType: 'A', complexityMultiplier: 1, optionSurchargeSum: 0, marginCm: 4, wasteFactor: 1.3, workMultiplier: 2 });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'no_fitting_slab');
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

test('calculatePrice: type B happy path', () => {
  // widthM 3 x lengthM 3 against the 3-slab fixture -> nSlabs 3, within stock (see
  // computeTypeBResult tests above for the area/slab-count math).
  const r = Pricing.calculatePrice({ stone, widthM: 3, lengthM: 3, productType: 'B', complexityMultiplier: 1.1, optionSurchargeSum: 0, marginCm: 4, wasteFactor: 1.3, workMultiplier: 2 });
  assert.equal(r.ok, true);
  assert.equal(r.nSlabs, 3);
  assert.equal(r.subtotal, 3 * 52673);
  assert.equal(r.remainderM2, null);
});
