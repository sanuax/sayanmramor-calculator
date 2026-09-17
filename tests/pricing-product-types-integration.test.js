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

test('every real WORK_RATES entry produces a finite, non-NaN price through calculatePrice', () => {
  for (const [type, workRates] of Object.entries(ProductTypes.WORK_RATES)) {
    const product = ProductTypes.PRODUCTS[type];
    const rates = {
      fabricationRatePerM2: workRates.fabricationRatePerM2,
      installationRatePerM2: workRates.installationRatePerM2,
      polishRatePerM2: workRates.polishRatePerM2,
      miscFlatSum: ProductTypes.MISC_FLAT_SUM,
      miscRatePerM2: ProductTypes.MISC_RATE_PER_M2,
      complexShapeMultiplier: ProductTypes.COMPLEX_SHAPE_MULTIPLIER
    };
    for (const [installEnabled, polishEnabled, complexEnabled] of [
      [false, false, false],
      [true, true, true],
    ]) {
      const r = Pricing.calculatePrice({
        stone, widthM: 1.0, lengthM: 0.6, productType: product.type,
        rates, installEnabled, polishEnabled, complexEnabled,
        marginCm: ProductTypes.SAW_MARGIN_CM, wasteFactor: ProductTypes.AREA_WASTE_FACTOR
      });
      assert.equal(r.ok, true, `${type} (install=${installEnabled}, polish=${polishEnabled}, complex=${complexEnabled}) should succeed`);
      assert.ok(Number.isFinite(r.total), `${type}.total should be finite, got ${r.total}`);
      assert.ok(Number.isFinite(r.fabrication), `${type}.fabrication should be finite`);
      assert.ok(Number.isFinite(r.work), `${type}.work should be finite`);
    }
  }
});
