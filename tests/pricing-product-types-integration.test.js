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

const RateCatalog = require('../rate-catalog.js');

// Every type of the company's table v2 (rate-catalog.js) gives a finite price.
// The landing row (STAIR-11) is not a type of its own: it prices the landings
// of a stair (tests/company-rates.test.js).
const TYPES = RateCatalog.PRODUCT_SUBCATEGORIES.filter(row => row.id !== 'STAIR-11');
const productOf = row => Object.values(ProductTypes.PRODUCTS).find(p => p.label === row.categoryLabel);

test('every rate-catalog type produces a finite, non-NaN price through calculatePrice', () => {
  assert.ok(TYPES.length > 40);
  for (const row of TYPES) {
    const product = productOf(row);
    assert.ok(product, row.id + ' belongs to a product');
    const typeRates = RateCatalog.getProductRates(row.id);
    const rates = Object.assign({}, typeRates, { complexShapeMultiplier: RateCatalog.MISC.complexShapeMultiplier });
    // Polishing only where the type has a polish rate (no polish checkbox otherwise).
    const polishable = RateCatalog.hasPolishRate(row.id);
    for (const [installEnabled, polishEnabled, complexEnabled] of [
      [false, false, false],
      [true, polishable, true],
    ]) {
      const r = Pricing.calculatePrice({
        stone, widthM: 1.0, lengthM: 0.6, productType: product.type,
        rates, installEnabled, polishEnabled, complexEnabled,
        marginCm: ProductTypes.SAW_MARGIN_CM, usageLimit: ProductTypes.SLAB_USAGE_LIMIT
      });
      assert.equal(r.ok, true, `${row.id} (install=${installEnabled}, polish=${polishEnabled}, complex=${complexEnabled}) should succeed`);
      assert.ok(Number.isFinite(r.total), `${row.id}.total should be finite, got ${r.total}`);
      assert.ok(Number.isFinite(r.fabrication), `${row.id}.fabrication should be finite`);
      assert.ok(Number.isFinite(r.work), `${row.id}.work should be finite`);
      assert.deepEqual(r.unpriced, [], `${row.id}: nothing left unpriced`);
      assert.equal(r.workNote, null, `${row.id}: no «уточнит менеджер» note`);
    }
  }
});
