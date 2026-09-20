const test = require('node:test');
const assert = require('node:assert/strict');
const RateCatalog = require('../rate-catalog.js');
const ProductTypes = require('../product-types.js');

test('PRODUCT_SUBCATEGORIES has exactly 50 rows', () => {
  assert.equal(RateCatalog.PRODUCT_SUBCATEGORIES.length, 50);
});

test('PRODUCT_SUBCATEGORIES ids are all unique', () => {
  const ids = RateCatalog.PRODUCT_SUBCATEGORIES.map(r => r.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('PRODUCT_SUBCATEGORIES rows all start with rate/currency null', () => {
  RateCatalog.PRODUCT_SUBCATEGORIES.forEach(row => {
    assert.equal(row.rate, null);
    assert.equal(row.currency, null);
  });
});

test('PRODUCT_SUBCATEGORIES rows only use known units', () => {
  const validUnits = new Set(['м²', 'шт.', 'компл.']);
  RateCatalog.PRODUCT_SUBCATEGORIES.forEach(row => {
    assert.equal(validUnits.has(row.unit), true, `unexpected unit "${row.unit}" on ${row.id}`);
  });
});

test('getSubcategoriesForProduct returns the right row count for every PRODUCTS category', () => {
  const expectedCounts = {
    'Лестницы': 13, 'Панно': 4, 'Подоконники': 5, 'Полы': 5, 'Стены': 5,
    'Фасады': 5, 'Столешницы в ванную': 4, 'Столешницы на кухню': 5, 'Ступени': 4
  };
  Object.values(ProductTypes.PRODUCTS).forEach(product => {
    const rows = RateCatalog.getSubcategoriesForProduct(product.label);
    assert.equal(rows.length, expectedCounts[product.label], `wrong count for ${product.label}`);
  });
});

test('getSubcategoriesForProduct returns an empty array for an unknown category', () => {
  assert.deepEqual(RateCatalog.getSubcategoriesForProduct('Несуществующий тип'), []);
});

test('ADDITIONAL_WORKS has exactly 19 rows', () => {
  assert.equal(RateCatalog.ADDITIONAL_WORKS.length, 19);
});

test('ADDITIONAL_WORKS ids are all unique', () => {
  const ids = RateCatalog.ADDITIONAL_WORKS.map(r => r.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('ADDITIONAL_WORKS rows all start with rate/currency null', () => {
  RateCatalog.ADDITIONAL_WORKS.forEach(row => {
    assert.equal(row.rate, null);
    assert.equal(row.currency, null);
  });
});

test('ADDITIONAL_WORKS groups match the expected row counts', () => {
  const counts = {};
  RateCatalog.ADDITIONAL_WORKS.forEach(row => { counts[row.group] = (counts[row.group] || 0) + 1; });
  assert.deepEqual(counts, { 'Вырезы': 4, 'Отверстия': 3, 'Кромка': 5, 'Дополнительно': 7 });
});

test('getAdditionalWorkRate returns null for every existing row (no real rates yet)', () => {
  RateCatalog.ADDITIONAL_WORKS.forEach(row => {
    assert.equal(RateCatalog.getAdditionalWorkRate(row.id), null);
  });
});

test('getAdditionalWorkRate returns null for an unknown id', () => {
  assert.equal(RateCatalog.getAdditionalWorkRate('NOPE-99'), null);
});
