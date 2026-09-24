// tests/url-bootstrap.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveInitialProductKey, resolveInitialStoneId, buildShowroomUrl, SHOWROOM_PATH } = require('../url-bootstrap.js');

const PRODUCTS = { stoleshnitsa_kuhnya: {}, lestnitsa: {} };
const STONES_BY_ID = { 'delicato-brown': {}, 'bianco-carrara': {} };

test('no params: both resolvers return null', () => {
  assert.equal(resolveInitialProductKey(null, PRODUCTS), null);
  assert.equal(resolveInitialStoneId(null, STONES_BY_ID), null);
});

test('valid product resolves to that key', () => {
  assert.equal(resolveInitialProductKey('stoleshnitsa_kuhnya', PRODUCTS), 'stoleshnitsa_kuhnya');
});

test('invalid product resolves to null, does not throw', () => {
  assert.equal(resolveInitialProductKey('not_a_real_product', PRODUCTS), null);
});

test('valid stone resolves to that id', () => {
  assert.equal(resolveInitialStoneId('delicato-brown', STONES_BY_ID), 'delicato-brown');
});

test('invalid stone resolves to null, does not throw', () => {
  assert.equal(resolveInitialStoneId('not-a-real-stone', STONES_BY_ID), null);
});

test('product + stone: both resolve independently when both are valid', () => {
  assert.equal(resolveInitialProductKey('lestnitsa', PRODUCTS), 'lestnitsa');
  assert.equal(resolveInitialStoneId('bianco-carrara', STONES_BY_ID), 'bianco-carrara');
});

test('product without stone: product resolves, stone stays null', () => {
  assert.equal(resolveInitialProductKey('lestnitsa', PRODUCTS), 'lestnitsa');
  assert.equal(resolveInitialStoneId(null, STONES_BY_ID), null);
});

test('stone without product: stone resolves, product stays null', () => {
  assert.equal(resolveInitialProductKey(null, PRODUCTS), null);
  assert.equal(resolveInitialStoneId('delicato-brown', STONES_BY_ID), 'delicato-brown');
});

// ---- CONFIGURATOR Result -> SITE showroom -----------------------------------------

test('buildShowroomUrl: product only -- the site showroom, entered at that product', () => {
  assert.equal(SHOWROOM_PATH, '/sayanmramor-site/showroom.html');
  assert.equal(buildShowroomUrl('stoleshnitsa_kuhnya', null, PRODUCTS, STONES_BY_ID), '/sayanmramor-site/showroom.html?product=stoleshnitsa_kuhnya');
});

test('buildShowroomUrl: a real selected stone is preserved', () => {
  assert.equal(buildShowroomUrl('lestnitsa', 'delicato-brown', PRODUCTS, STONES_BY_ID), '/sayanmramor-site/showroom.html?product=lestnitsa&stone=delicato-brown');
});

test('buildShowroomUrl: an unknown stone is dropped, never invented; an unknown product gives no link', () => {
  assert.equal(buildShowroomUrl('lestnitsa', 'no-such-stone', PRODUCTS, STONES_BY_ID), '/sayanmramor-site/showroom.html?product=lestnitsa');
  assert.equal(buildShowroomUrl('lestnitsa', undefined, PRODUCTS, undefined), '/sayanmramor-site/showroom.html?product=lestnitsa');
  ['', null, undefined, 'garbage', 'toString', '__proto__'].forEach(key => assert.equal(buildShowroomUrl(key, 'delicato-brown', PRODUCTS, STONES_BY_ID), null, String(key)));
});

test('buildShowroomUrl carries only the two stable ids -- nothing of the configuration itself', () => {
  const url = new URL(buildShowroomUrl('stoleshnitsa_kuhnya', 'delicato-brown', PRODUCTS, STONES_BY_ID), 'http://x');
  assert.deepEqual([...url.searchParams.keys()], ['product', 'stone']);
});

test('buildShowroomUrl works for all 9 real product keys', () => {
  const { PRODUCTS: REAL } = require('../product-types.js');
  const keys = Object.keys(REAL);
  assert.equal(keys.length, 9);
  keys.forEach(k => assert.equal(buildShowroomUrl(k, null, REAL, {}), '/sayanmramor-site/showroom.html?product=' + k));
});
