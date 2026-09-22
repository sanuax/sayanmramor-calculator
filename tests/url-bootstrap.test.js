// tests/url-bootstrap.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveInitialProductKey, resolveInitialStoneId } = require('../url-bootstrap.js');

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
