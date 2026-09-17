const test = require('node:test');
const assert = require('node:assert/strict');
const ProductTypes = require('../product-types.js');

test('WORK_RATES has an entry for every product type in PRODUCTS', () => {
  const productKeys = Object.keys(ProductTypes.PRODUCTS);
  const rateKeys = Object.keys(ProductTypes.WORK_RATES);
  assert.deepEqual(rateKeys.sort(), productKeys.sort());
});

test('every WORK_RATES entry has positive numeric fabrication/installation/polish rates', () => {
  for (const [type, rates] of Object.entries(ProductTypes.WORK_RATES)) {
    assert.equal(typeof rates.fabricationRatePerM2, 'number', `${type}.fabricationRatePerM2`);
    assert.equal(typeof rates.installationRatePerM2, 'number', `${type}.installationRatePerM2`);
    assert.equal(typeof rates.polishRatePerM2, 'number', `${type}.polishRatePerM2`);
    assert.ok(rates.fabricationRatePerM2 > 0, `${type}.fabricationRatePerM2 > 0`);
  }
});

test('MISC_FLAT_SUM and MISC_RATE_PER_M2 are explicitly null until real data is available', () => {
  assert.equal(ProductTypes.MISC_FLAT_SUM, null);
  assert.equal(ProductTypes.MISC_RATE_PER_M2, null);
});

test('COMPLEX_SHAPE_MULTIPLIER is a number greater than 1', () => {
  assert.equal(typeof ProductTypes.COMPLEX_SHAPE_MULTIPLIER, 'number');
  assert.ok(ProductTypes.COMPLEX_SHAPE_MULTIPLIER > 1);
});

test('PRODUCTS entries no longer carry a complexityMultiplier field', () => {
  for (const product of Object.values(ProductTypes.PRODUCTS)) {
    assert.equal(product.complexityMultiplier, undefined);
  }
});

test('the old multiplier-based constants are removed', () => {
  assert.equal(ProductTypes.WORK_MULTIPLIER, undefined);
  assert.equal(ProductTypes.HARDNESS_WORK_MULTIPLIER, undefined);
  assert.equal(ProductTypes.OPTION_SURCHARGE, undefined);
});

test('COUNTERTOP_EXTRAS_RATES has exactly the three expected fields, all null until real data is available', () => {
  assert.deepEqual(Object.keys(ProductTypes.COUNTERTOP_EXTRAS_RATES).sort(), ['bortikRatePerM', 'fartukRatePerM2', 'ostrovRatePerM2']);
  assert.equal(ProductTypes.COUNTERTOP_EXTRAS_RATES.bortikRatePerM, null);
  assert.equal(ProductTypes.COUNTERTOP_EXTRAS_RATES.fartukRatePerM2, null);
  assert.equal(ProductTypes.COUNTERTOP_EXTRAS_RATES.ostrovRatePerM2, null);
});

test('supportsCountertopExtras is true on exactly stoleshnitsa_kuhnya and stoleshnitsa_vannaya', () => {
  const flagged = Object.entries(ProductTypes.PRODUCTS)
    .filter(([, product]) => product.supportsCountertopExtras === true)
    .map(([key]) => key)
    .sort();
  assert.deepEqual(flagged, ['stoleshnitsa_kuhnya', 'stoleshnitsa_vannaya']);
});
