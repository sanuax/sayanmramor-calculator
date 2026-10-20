// tests/passport-link.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { PASSPORT_VERSION, collectFields, buildPassportQuery, readPassportQuery } = require('../passport-link.js');

const field = (id, value, defaultValue) => ({ id, type: 'number', value, checked: false, defaultValue, defaultChecked: false });
const box = (id, checked, defaultChecked) => ({ id, type: 'checkbox', value: 'on', checked, defaultValue: 'on', defaultChecked });

test('collectFields keeps only what the client changed; a checkbox as 1 / 0', () => {
  const fields = collectFields([
    field('length', '2400', '2000'),
    field('width', '600', '600'),
    box('opt-install', true, false),
    box('opt-polish', false, false),
    box('opt-complex', false, true),
  ]);
  assert.deepEqual(fields, { length: '2400', 'opt-install': '1', 'opt-complex': '0' });
});

test('buildPassportQuery: product, stone, version, then the fields in their order', () => {
  const q = buildPassportQuery({ productKey: 'stoleshnitsa_kuhnya', stoneId: 'bianco-carrara', fields: { length: '2400', width: '600' } });
  assert.equal(q, 'product=stoleshnitsa_kuhnya&stone=bianco-carrara&pv=1&length=2400&width=600');
});

test('a link read back gives the same choices, the fields in the page order', () => {
  const choices = { productKey: 'stoleshnitsa_kuhnya', stoneId: 'bianco-carrara', fields: { length: '2400', width: '600' } };
  const read = readPassportQuery(new URLSearchParams(buildPassportQuery(choices)), ['width', 'length']);
  assert.equal(read.version, PASSPORT_VERSION);
  assert.equal(read.version, 1);
  assert.equal(read.productKey, 'stoleshnitsa_kuhnya');
  assert.equal(read.stoneId, 'bianco-carrara');
  assert.deepEqual(read.fields, { width: '600', length: '2400' });
  assert.deepEqual(Object.keys(read.fields), ['width', 'length']);
});

test('without pv the address is not a passport link', () => {
  assert.equal(readPassportQuery(new URLSearchParams('product=pol&stone=x'), ['length']), null);
});

test('debug and unknown parameters never become fields', () => {
  const read = readPassportQuery(new URLSearchParams('product=pol&pv=1&debug=1&foo=1&length=3000'), ['length', 'width']);
  assert.deepEqual(read.fields, { length: '3000' });
});

test('a value with Cyrillic and a space survives the round trip', () => {
  const choices = { productKey: 'pol', stoneId: null, fields: { productSubcategory: 'Пол с рисунком 2' } };
  const read = readPassportQuery(new URLSearchParams(buildPassportQuery(choices)), ['productSubcategory']);
  assert.deepEqual(read.fields, { productSubcategory: 'Пол с рисунком 2' });
  assert.equal(read.stoneId, null);
});
