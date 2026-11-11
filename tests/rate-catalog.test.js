const test = require('node:test');
const assert = require('node:assert/strict');
const RateCatalog = require('../rate-catalog.js');
const ProductTypes = require('../product-types.js');

// The 44 type ids of «Ставки изделий» in the spec (2026-11-08-company-rates-v2-design.md);
// the table's 45th row, RISER-00, is RISER_RATES (not a type the client picks).
const V2_IDS = [
  'KITCHEN-11', 'KITCHEN-12', 'KITCHEN-13', 'BATH-01', 'BATH-02', 'BATH-03',
  'SILL-01', 'SILL-02', 'SILL-03', 'SILL-04', 'SILL-05',
  'STEP-01', 'STEP-02', 'STEP-03',
  'STAIR-01', 'STAIR-03', 'STAIR-05', 'STAIR-07', 'STAIR-11',
  'FLOOR-01', 'FLOOR-02', 'FLOOR-03', 'FLOOR-04', 'FLOOR-05',
  'WALL-01', 'WALL-02', 'WALL-03', 'WALL-04', 'WALL-05',
  'PANEL-01', 'PANEL-02', 'PANEL-03', 'PANEL-04',
  'FACADE-01', 'FACADE-04', 'FACADE-02', 'FACADE-03', 'FACADE-06', 'FACADE-07', 'FACADE-08', 'FACADE-05',
  'FIREPLACE-01', 'FIREPLACE-02', 'FIREPLACE-03',
];

test('PRODUCT_SUBCATEGORIES ids are exactly the v2 table', () => {
  const ids = RateCatalog.PRODUCT_SUBCATEGORIES.map(r => r.id);
  assert.equal(V2_IDS.length, 44);
  assert.equal(new Set(ids).size, ids.length, 'unique');
  assert.deepEqual([...ids].sort(), [...V2_IDS].sort());
});

test('PRODUCT_SUBCATEGORIES rows: three rates, ₽/м², no old rate/currency fields', () => {
  RateCatalog.PRODUCT_SUBCATEGORIES.forEach(row => {
    assert.equal(row.unit, 'м²', row.id);
    assert.ok(Number.isFinite(row.fabricationRatePerM2) && row.fabricationRatePerM2 > 0, row.id);
    assert.ok(Number.isFinite(row.installationRatePerM2) && row.installationRatePerM2 > 0, row.id);
    assert.ok(row.polishRatePerM2 === null || (Number.isFinite(row.polishRatePerM2) && row.polishRatePerM2 > 0), row.id);
    assert.equal('rate' in row, false, row.id);
    assert.equal('currency' in row, false, row.id);
  });
});

test('the deleted v1 ids and the old installation rows are gone', () => {
  const ids = new Set(RateCatalog.PRODUCT_SUBCATEGORIES.map(r => r.id));
  ['KITCHEN-01', 'KITCHEN-02', 'KITCHEN-03', 'KITCHEN-04', 'KITCHEN-05', 'BATH-04',
    'STAIR-02', 'STAIR-04', 'STAIR-06', 'STAIR-08', 'STAIR-09', 'STAIR-10', 'STAIR-12', 'STAIR-13', 'STEP-04']
    .forEach(id => assert.equal(ids.has(id), false, id));
  assert.equal(RateCatalog.INSTALLATION_RATES, undefined);
  assert.equal(RateCatalog.getInstallationRow, undefined);
});

test('getSubcategoriesForProduct returns the right row count for every PRODUCTS category', () => {
  const expectedCounts = {
    'Лестницы': 5, 'Панно': 4, 'Подоконники': 5, 'Полы': 5, 'Стены': 5,
    'Фасады': 8, 'Столешницы в ванную': 3, 'Столешницы на кухню': 3, 'Ступени': 3, 'Камины': 3,
  };
  Object.values(ProductTypes.PRODUCTS).forEach(product => {
    const rows = RateCatalog.getSubcategoriesForProduct(product.label);
    assert.equal(rows.length, expectedCounts[product.label], `wrong count for ${product.label}`);
  });
});

test('getSubcategoriesForProduct returns an empty array for an unknown category', () => {
  assert.deepEqual(RateCatalog.getSubcategoriesForProduct('Несуществующий тип'), []);
});

test('labels follow the «Тип» column of the v2 table', () => {
  const byId = id => RateCatalog.PRODUCT_SUBCATEGORIES.find(r => r.id === id);
  assert.equal(byId('FACADE-02').shape, 'Обрамление окна / двери');
  assert.equal(byId('BATH-02').shape, 'Г-образная (угловая)');
  assert.equal(byId('STAIR-11').shape, 'Площадка между маршами');
  assert.equal(byId('SILL-05').shape, 'Фигурный передний край');
  assert.equal(byId('FIREPLACE-01').shape, 'Портал');
});

test('getProductRates returns the company rates', () => {
  assert.deepEqual(RateCatalog.getProductRates('KITCHEN-12'), { fabricationRatePerM2: 40000, installationRatePerM2: 20000, polishRatePerM2: 18000 });
  assert.deepEqual(RateCatalog.getProductRates('SILL-04'), { fabricationRatePerM2: 45000, installationRatePerM2: 30000, polishRatePerM2: 18000 });
  assert.deepEqual(RateCatalog.getProductRates('STEP-03'), { fabricationRatePerM2: 90000, installationRatePerM2: 40000, polishRatePerM2: null });
  assert.deepEqual(RateCatalog.getProductRates('FACADE-05'), { fabricationRatePerM2: 200000, installationRatePerM2: 50000, polishRatePerM2: null });
  assert.deepEqual(RateCatalog.getProductRates('FIREPLACE-03'), { fabricationRatePerM2: 25000, installationRatePerM2: 30000, polishRatePerM2: 20000 });
  assert.equal(RateCatalog.getProductRates('KITCHEN-01'), null);
  assert.equal(RateCatalog.getProductRates(undefined), null);
});

test('hasPolishRate: true only when the polish rate is a finite number', () => {
  ['FLOOR-01', 'FACADE-03'].forEach(id => assert.equal(RateCatalog.hasPolishRate(id), true, id));
  ['STEP-01', 'STAIR-07', 'FACADE-02', 'FACADE-06', 'FACADE-07', 'FACADE-08', 'FACADE-05']
    .forEach(id => assert.equal(RateCatalog.hasPolishRate(id), false, id));
  assert.equal(RateCatalog.hasPolishRate('KITCHEN-01'), false);
});

test('countertopTypeId: the form picks the catalog row of a kitchen / bath countertop', () => {
  assert.equal(RateCatalog.countertopTypeId('stoleshnitsa_kuhnya', 'straight'), 'KITCHEN-11');
  assert.equal(RateCatalog.countertopTypeId('stoleshnitsa_kuhnya', 'lshape'), 'KITCHEN-12');
  assert.equal(RateCatalog.countertopTypeId('stoleshnitsa_kuhnya', 'ushape'), 'KITCHEN-13');
  assert.equal(RateCatalog.countertopTypeId('stoleshnitsa_vannaya', 'straight'), 'BATH-01');
  assert.equal(RateCatalog.countertopTypeId('stoleshnitsa_vannaya', 'lshape'), 'BATH-02');
  assert.equal(RateCatalog.countertopTypeId('stoleshnitsa_vannaya', 'ushape'), 'BATH-03');
  assert.equal(RateCatalog.countertopTypeId('pol', 'straight'), null);
  assert.equal(RateCatalog.countertopTypeId('stoleshnitsa_kuhnya', 'zigzag'), null);
});

test('RISER_RATES: one rate for every riser', () => {
  assert.deepEqual(RateCatalog.RISER_RATES, { id: 'RISER-00', fabricationRatePerM2: 5000, installationRatePerM2: 5000, polishRatePerM2: null });
});

test('ADDITIONAL_WORKS: the v2 rows, unique ids, known units', () => {
  const ids = RateCatalog.ADDITIONAL_WORKS.map(r => r.id);
  assert.deepEqual(ids, [
    'CUT-01', 'CUT-02', 'CUT-03', 'CUT-04', 'CUT-05', 'CUT-06', 'CUT-07',
    'EDGE-01', 'EDGE-03', 'EDGE-04', 'EDGE-05', 'EDGE-06',
    'EXTRA-01', 'EXTRA-02', 'EXTRA-03', 'EXTRA-04', 'EXTRA-05', 'EXTRA-06', 'EXTRA-07',
    'SEAM-01', 'LIGHT-01',
  ]);
  const units = new Set(['шт.', 'м.п.', 'м²']);
  RateCatalog.ADDITIONAL_WORKS.forEach(row => {
    assert.ok(units.has(row.unit), row.id);
    assert.ok(Number.isFinite(row.rate) && row.rate > 0, row.id);
    assert.ok(row.installRate === null || Number.isFinite(row.installRate), row.id);
    assert.equal('currency' in row, false, row.id);
  });
  assert.equal(RateCatalog.ADDITIONAL_WORKS.find(r => r.id === 'CUT-03').unit, 'м.п.');
});

test('additional works rates', () => {
  const get = RateCatalog.getAdditionalWorkRate;
  assert.equal(get('CUT-02'), 20000);
  assert.equal(get('CUT-01'), 8000);
  assert.equal(get('CUT-03'), 70000);
  assert.equal(get('EDGE-05'), 1000);
  assert.equal(get('EDGE-01'), 5000);
  assert.equal(get('EXTRA-04'), 40000);
  assert.equal(RateCatalog.getAdditionalWorkInstallRate('EXTRA-04'), 50000);
  assert.equal(RateCatalog.getAdditionalWorkInstallRate('EXTRA-02'), 18000);
  assert.equal(RateCatalog.getAdditionalWorkInstallRate('EXTRA-03'), 20000);
  assert.equal(RateCatalog.getAdditionalWorkInstallRate('EXTRA-01'), null);
  assert.equal(RateCatalog.getAdditionalWorkInstallRate('CUT-01'), null);
  assert.equal(get('SEAM-01'), 25000);
  assert.equal(get('LIGHT-01'), 110000);
  assert.equal(get('NOPE-99'), null);
  assert.equal(RateCatalog.getAdditionalWorkInstallRate('NOPE-99'), null);
});

test('stoneCoefficient: the company table, 1 for an unknown or empty kind', () => {
  const k = RateCatalog.stoneCoefficient;
  assert.equal(Object.keys(RateCatalog.STONE_COEFFICIENTS).length, 15);
  assert.equal(k('granite'), 1.3);
  assert.equal(k('quartz-agglomerate'), 1.3);
  assert.equal(k('oniks'), 1.5);
  assert.equal(k('quartzite'), 2);
  assert.equal(k('agate'), 3);
  assert.equal(k('kvarc'), 2);
  assert.equal(k('soapstone'), 2);
  assert.equal(k('labradorite'), 2);
  assert.equal(k('obsidian'), 2);
  assert.equal(k('specennyi-kamen'), 1.3);
  assert.equal(k('petrified-wood'), 1.3);
  assert.equal(k('marble'), 1);
  assert.equal(k('travertin'), 1);
  assert.equal(k('limestone'), 1);
  assert.equal(k('artificial-marble'), 1);
  assert.equal(k('slate'), 1);
  assert.equal(k(undefined), 1);
  assert.equal(k(null), 1);
  assert.equal(k(''), 1);
});

test('MISC: the company values', () => {
  assert.deepEqual(RateCatalog.MISC, {
    measure: 15000, delivery: 12000, unloadingPerM2: 3500, consumablesPerM2: 2500,
    complexShapeMultiplier: 1.5, minOrder: 20000,
  });
});

// Literal copy of the spec tables (2026-11-08-company-rates-v2-design.md), typed from the
// spec and NOT from rate-catalog.js: this test exists to catch a typo in the catalog.
// Row: [id, fabrication, installation, polish]; null = the company has no rate («-»).
const SPEC_PRODUCT_RATES = [
  ['KITCHEN-11', 40000, 20000, 18000],
  ['KITCHEN-12', 40000, 20000, 18000],
  ['KITCHEN-13', 40000, 20000, 18000],
  ['BATH-01', 40000, 20000, 18000],
  ['BATH-02', 40000, 20000, 18000],
  ['BATH-03', 40000, 20000, 18000],
  ['SILL-01', 30000, 15000, 18000],
  ['SILL-02', 30000, 20000, 18000],
  ['SILL-03', 40000, 25000, 18000],
  ['SILL-04', 45000, 30000, 18000],
  ['SILL-05', 50000, 30000, 18000],
  ['STEP-01', 50000, 25000, null],
  ['STEP-02', 60000, 35000, null],
  ['STEP-03', 90000, 40000, null],
  ['STAIR-01', 50000, 25000, null],
  ['STAIR-03', 50000, 25000, null],
  ['STAIR-05', 50000, 25000, null],
  ['STAIR-07', 90000, 40000, null],
  ['STAIR-11', 50000, 25000, null],
  ['FLOOR-01', 15000, 18000, 18000],
  ['FLOOR-02', 15000, 18000, 18000],
  ['FLOOR-03', 25000, 30000, 18000],
  ['FLOOR-04', 35000, 40000, 20000],
  ['FLOOR-05', 60000, 50000, 20000],
  ['WALL-01', 25000, 25000, 20000],
  ['WALL-02', 25000, 35000, 20000],
  ['WALL-03', 25000, 40000, 20000],
  ['WALL-04', 45000, 50000, 25000],
  ['WALL-05', 30000, 40000, 20000],
  ['PANEL-01', 25000, 40000, 20000],
  ['PANEL-02', 40000, 40000, 20000],
  ['PANEL-03', 60000, 60000, 20000],
  ['PANEL-04', 40000, 40000, 20000],
  ['FACADE-01', 50000, 25000, 25000],
  ['FACADE-04', 50000, 25000, 25000],
  ['FACADE-02', 120000, 40000, null],
  ['FACADE-03', 150000, 40000, 30000],
  ['FACADE-06', 150000, 50000, null],
  ['FACADE-07', 150000, 50000, null],
  ['FACADE-08', 150000, 50000, null],
  ['FACADE-05', 200000, 50000, null],
  ['FIREPLACE-01', 40000, 60000, 30000],
  ['FIREPLACE-02', 40000, 60000, 30000],
  ['FIREPLACE-03', 25000, 30000, 20000],
];

// Row: [id, unit, rate, installRate]
const SPEC_ADDITIONAL_WORKS = [
  ['CUT-01', 'шт.', 8000, null],
  ['CUT-02', 'шт.', 20000, null],
  ['CUT-03', 'м.п.', 70000, null],
  ['CUT-04', 'шт.', 6000, null],
  ['CUT-05', 'шт.', 1500, null],
  ['CUT-06', 'шт.', 1000, null],
  ['CUT-07', 'шт.', 1000, null],
  ['EDGE-01', 'м.п.', 5000, null],
  ['EDGE-03', 'м.п.', 20000, null],
  ['EDGE-04', 'м.п.', 10000, null],
  ['EDGE-05', 'м.п.', 1000, null],
  ['EDGE-06', 'м.п.', 15000, null],
  ['EXTRA-01', 'м.п.', 25000, null],
  ['EXTRA-02', 'м²', 15000, 18000],
  ['EXTRA-03', 'м²', 15000, 20000],
  ['EXTRA-04', 'м²', 40000, 50000],
  ['EXTRA-05', 'м²', 60000, 50000],
  ['EXTRA-06', 'м²', 40000, 50000],
  ['EXTRA-07', 'м²', 60000, 50000],
  ['SEAM-01', 'шт.', 25000, null],
  ['LIGHT-01', 'м²', 110000, null],
];

test('every product row equals the spec table «Ставки изделий» (all 44 ids)', () => {
  assert.equal(SPEC_PRODUCT_RATES.length, 44);
  const catalogIds = RateCatalog.PRODUCT_SUBCATEGORIES.map(r => r.id);
  assert.deepEqual([...catalogIds].sort(), SPEC_PRODUCT_RATES.map(r => r[0]).sort(), 'same set of ids');
  SPEC_PRODUCT_RATES.forEach(([id, fab, inst, pol]) => {
    assert.deepEqual(
      RateCatalog.getProductRates(id),
      { fabricationRatePerM2: fab, installationRatePerM2: inst, polishRatePerM2: pol },
      id,
    );
  });
});

test('every additional work equals the spec table «Доп. работы» (all 21 rows)', () => {
  assert.equal(SPEC_ADDITIONAL_WORKS.length, 21);
  assert.deepEqual(RateCatalog.ADDITIONAL_WORKS.map(r => r.id), SPEC_ADDITIONAL_WORKS.map(r => r[0]));
  SPEC_ADDITIONAL_WORKS.forEach(([id, unit, rate, installRate]) => {
    const row = RateCatalog.ADDITIONAL_WORKS.find(r => r.id === id);
    assert.equal(row.unit, unit, `${id} unit`);
    assert.equal(row.rate, rate, `${id} rate`);
    assert.equal(row.installRate, installRate, `${id} installRate`);
    assert.equal(RateCatalog.getAdditionalWorkRate(id), rate, `${id} getAdditionalWorkRate`);
    assert.equal(RateCatalog.getAdditionalWorkInstallRate(id), installRate, `${id} getAdditionalWorkInstallRate`);
  });
});

test('risers, MISC and the 15 stone coefficients equal the spec tables', () => {
  assert.deepEqual(RateCatalog.RISER_RATES, { id: 'RISER-00', fabricationRatePerM2: 5000, installationRatePerM2: 5000, polishRatePerM2: null });
  assert.deepEqual(RateCatalog.MISC, {
    measure: 15000, delivery: 12000, unloadingPerM2: 3500, consumablesPerM2: 2500,
    complexShapeMultiplier: 1.5, minOrder: 20000,
  });
  assert.deepEqual(RateCatalog.STONE_COEFFICIENTS, {
    'marble': 1,
    'travertin': 1,
    'granite': 1.3,
    'quartz-agglomerate': 1.3,
    'oniks': 1.5,
    'quartzite': 2,
    'agate': 3,
    'kvarc': 2,
    'labradorite': 2,
    'limestone': 1,
    'specennyi-kamen': 1.3,
    'petrified-wood': 1.3,
    'artificial-marble': 1,
    'obsidian': 2,
    'soapstone': 2,
  });
});
