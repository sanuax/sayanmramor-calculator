// tests/product-pictures.test.js
//
// The product cards show rendered pictures «Камень на гипсе» (product-icons.js picture(), 2026-11-23):
// icons/products/<key>.webp and <key>@2x.webp, addressed with ?v=<version>. The version is the first 8 hex
// of the sha256 over the folder's files (name, then bytes, sorted by name), so a re-rendered picture is a new
// address for a browser that keeps its old copy. A product without a picture falls back to its drawn «Макет».
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..');
const dir = path.join(root, 'icons', 'products');
const icons = require('../product-icons.js');

test('every product with a model has both pictures', () => {
  assert.deepEqual([...icons.pictures.keys].sort(), [...icons.keys].sort());
  for (const key of icons.pictures.keys) {
    for (const file of [key + '.webp', key + '@2x.webp']) assert.ok(fs.existsSync(path.join(dir, file)), file + ' is missing');
  }
});

test('the version is the hash of the pictures (re-export updates it)', () => {
  const h = crypto.createHash('sha256');
  for (const f of fs.readdirSync(dir).sort()) { h.update(f); h.update(fs.readFileSync(path.join(dir, f))); }
  assert.equal(icons.pictures.version, h.digest('hex').slice(0, 8));
});

test('picture(): the rendered picture with both sizes, the drawn one without a picture', () => {
  const html = icons.picture('stoleshnitsa_kuhnya');
  const v = '?v=' + icons.pictures.version;
  assert.match(html, /^<img /);
  assert.ok(html.includes('src="icons/products/stoleshnitsa_kuhnya.webp' + v + '"'));
  assert.ok(html.includes('icons/products/stoleshnitsa_kuhnya@2x.webp' + v + ' 960w'));
  assert.ok(html.includes('alt=""'));
  assert.equal(icons.picture('no-such-product'), icons.svg('no-such-product'));
});

test('the page builds the cards from picture()', () => {
  const page = fs.readFileSync(path.join(root, 'sayanmramor-calculator.html'), 'utf8');
  assert.ok(page.includes('ProductIcons.picture(key)'));
});
