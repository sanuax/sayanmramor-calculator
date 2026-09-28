const test = require('node:test');
const assert = require('node:assert/strict');
const Pricing = require('../pricing.js');
const ProductTypes = require('../product-types.js');

const stone = {
  name: 'Integration Test Stone',
  slabs: [
    { article: 'INT-1', width_cm: 280, length_cm: 180, price_per_m2_rub: 11000, price_total_rub: 55440 }
  ]
};

// Products whose rates the company has set; a product with a null rate
// («Камины») is covered in tests/fireplace-product.test.js (no false total).
const PRICED = Object.entries(ProductTypes.WORK_RATES).filter(([, r]) => r.fabricationRatePerM2 !== null);

test('every WORK_RATES entry with set rates produces a finite, non-NaN price through calculatePrice', () => {
  assert.equal(PRICED.length, 9);
  for (const [type, workRates] of PRICED) {
    const product = ProductTypes.PRODUCTS[type];
    const rates = {
      fabricationRatePerM2: workRates.fabricationRatePerM2,
      installationRatePerM2: workRates.installationRatePerM2,
      polishRatePerM2: workRates.polishRatePerM2,
      miscFlatSum: ProductTypes.MISC_FLAT_SUM,
      miscRatePerM2: ProductTypes.MISC_RATE_PER_M2,
      complexShapeMultiplier: ProductTypes.COMPLEX_SHAPE_MULTIPLIER,
      bortikRatePerM: ProductTypes.COUNTERTOP_EXTRAS_RATES.bortikRatePerM,
      fartukRatePerM2: ProductTypes.COUNTERTOP_EXTRAS_RATES.fartukRatePerM2,
      ostrovRatePerM2: ProductTypes.COUNTERTOP_EXTRAS_RATES.ostrovRatePerM2
    };
    for (const [installEnabled, polishEnabled, complexEnabled] of [
      [false, false, false],
      [true, true, true],
    ]) {
      const r = Pricing.calculatePrice({
        stone, widthM: 1.0, lengthM: 0.6, productType: product.type,
        rates, installEnabled, polishEnabled, complexEnabled,
        marginCm: ProductTypes.SAW_MARGIN_CM, usageLimit: ProductTypes.SLAB_USAGE_LIMIT
      });
      assert.equal(r.ok, true, `${type} (install=${installEnabled}, polish=${polishEnabled}, complex=${complexEnabled}) should succeed`);
      assert.ok(Number.isFinite(r.total), `${type}.total should be finite, got ${r.total}`);
      assert.ok(Number.isFinite(r.fabrication), `${type}.fabrication should be finite`);
      assert.ok(Number.isFinite(r.work), `${type}.work should be finite`);
      assert.deepEqual(r.unpriced, [], `${type}: nothing left unpriced`);
      assert.equal(r.workNote, null, `${type}: no «уточнит менеджер» note`);
    }
  }
});

test('calculatePrice: COUNTERTOP_EXTRAS_RATES fields, when non-null, flow through to extras exactly like the other rate fields', () => {
  const product = ProductTypes.PRODUCTS.stoleshnitsa_kuhnya;
  const workRates = ProductTypes.WORK_RATES.stoleshnitsa_kuhnya;
  const rates = {
    fabricationRatePerM2: workRates.fabricationRatePerM2,
    installationRatePerM2: workRates.installationRatePerM2,
    polishRatePerM2: workRates.polishRatePerM2,
    miscFlatSum: ProductTypes.MISC_FLAT_SUM,
    miscRatePerM2: ProductTypes.MISC_RATE_PER_M2,
    complexShapeMultiplier: ProductTypes.COMPLEX_SHAPE_MULTIPLIER,
    // Hypothetical non-null overrides -- proves the wiring carries real
    // numbers through once COUNTERTOP_EXTRAS_RATES is eventually filled in;
    // these are NOT real rates, just test values.
    bortikRatePerM: 4000,
    fartukRatePerM2: 12000,
    ostrovRatePerM2: 45000
  };
  const r = Pricing.calculatePrice({
    stone, widthM: 1.0, lengthM: 0.6, productType: product.type,
    rates, extraDimensions: { bortikLengthM: 3, fartukAreaM2: 1.5, ostrovAreaM2: 2 },
    marginCm: ProductTypes.SAW_MARGIN_CM, usageLimit: ProductTypes.SLAB_USAGE_LIMIT
  });
  assert.equal(r.ok, true);
  assert.equal(r.extras, 3 * 4000 + 1.5 * 12000 + 2 * 45000);
  assert.equal(r.total, r.subtotal + r.fabrication + r.installation + r.polish + r.misc + r.extras);
});
