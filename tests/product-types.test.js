const test = require('node:test');
const assert = require('node:assert/strict');
const ProductTypes = require('../product-types.js');
const { CAMERA_PRESETS } = require('../visualizer/constants.js');

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

test('every product with additionalWorks also has supportsCountertopExtras (constructor-state.js relies on this)', () => {
  Object.entries(ProductTypes.PRODUCTS).forEach(([key, product]) => {
    if (product.additionalWorks) {
      assert.equal(product.supportsCountertopExtras, true,
        `${key} has additionalWorks but not supportsCountertopExtras -- constructor-state.js would price its extras while calculate() hides the UI block`);
    }
  });
});

test('supportsEdgeWork is true on exactly the 5 products where edge finishing is standard practice', () => {
  const flagged = Object.entries(ProductTypes.PRODUCTS)
    .filter(([, product]) => product.supportsEdgeWork === true)
    .map(([key]) => key)
    .sort();
  assert.deepEqual(flagged, [
    'lestnitsa', 'podokonnik', 'stoleshnitsa_kuhnya', 'stoleshnitsa_vannaya', 'stupeni'
  ]);
});

test('supportsEdgeWork is absent (falsy) on panno/pol/stena/fasad', () => {
  ['panno', 'pol', 'stena', 'fasad'].forEach(key => {
    assert.equal(ProductTypes.PRODUCTS[key].supportsEdgeWork, undefined);
  });
});

test('hasAdditionalWork returns false for a product with no additionalWorks object', () => {
  assert.equal(ProductTypes.hasAdditionalWork(ProductTypes.PRODUCTS.pol, 'sinkCutout'), false);
  assert.equal(ProductTypes.hasAdditionalWork(ProductTypes.PRODUCTS.lestnitsa, 'island'), false);
});

test('hasAdditionalWork returns false for an unknown capability key on a product that does have additionalWorks', () => {
  assert.equal(ProductTypes.hasAdditionalWork(ProductTypes.PRODUCTS.stoleshnitsa_kuhnya, 'nonexistentCapability'), false);
});

test('hasAdditionalWork returns false when product itself is null or undefined', () => {
  assert.equal(ProductTypes.hasAdditionalWork(null, 'island'), false);
  assert.equal(ProductTypes.hasAdditionalWork(undefined, 'island'), false);
});

test('hasAdditionalWork matches the full 9-product x 8-capability availability matrix', () => {
  const ALL_FALSE = {
    sinkCutout: false, cooktopCutout: false, holes: false,
    curb: false, backsplash: false, wallPanel: false,
    island: false, barCounter: false
  };
  const expectedByProduct = {
    lestnitsa: ALL_FALSE,
    panno: ALL_FALSE,
    podokonnik: ALL_FALSE,
    pol: ALL_FALSE,
    stena: ALL_FALSE,
    fasad: ALL_FALSE,
    stoleshnitsa_vannaya: {
      sinkCutout: true, cooktopCutout: false, holes: true,
      curb: true, backsplash: true, wallPanel: true,
      island: false, barCounter: false
    },
    stoleshnitsa_kuhnya: {
      sinkCutout: true, cooktopCutout: true, holes: true,
      curb: true, backsplash: true, wallPanel: true,
      island: true, barCounter: true
    },
    stupeni: ALL_FALSE
  };

  Object.entries(expectedByProduct).forEach(([productKey, expectedCapabilities]) => {
    const product = ProductTypes.PRODUCTS[productKey];
    Object.entries(expectedCapabilities).forEach(([capability, expected]) => {
      assert.equal(
        ProductTypes.hasAdditionalWork(product, capability),
        expected,
        `${productKey}.${capability} should be ${expected}`
      );
    });
  });
});

test('every product has a cameraPreset naming a real entry in visualizer/constants.js\'s CAMERA_PRESETS', () => {
  Object.entries(ProductTypes.PRODUCTS).forEach(([key, product]) => {
    assert.ok(product.cameraPreset, `${key} has no cameraPreset set`);
    assert.ok(
      Object.prototype.hasOwnProperty.call(CAMERA_PRESETS, product.cameraPreset),
      `${key}.cameraPreset ("${product.cameraPreset}") is not a known CAMERA_PRESETS entry`
    );
  });
});

test('cameraPreset matches the per-product defaults from the design spec', () => {
  const expected = {
    lestnitsa: 'iso-side-high',
    panno: 'front',
    podokonnik: 'front-high',
    pol: 'top',
    stena: 'front',
    fasad: 'front',
    stoleshnitsa_vannaya: 'iso-high',
    stoleshnitsa_kuhnya: 'iso-eye-level',
    stupeni: 'iso-side-high',
  };
  Object.entries(expected).forEach(([key, cameraPreset]) => {
    assert.equal(ProductTypes.PRODUCTS[key].cameraPreset, cameraPreset, `${key}.cameraPreset`);
  });
});
