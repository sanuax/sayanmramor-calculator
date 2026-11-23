// tests/page-head.test.js
//
// 2026-11-24 (from the owner's review of promotion advice): the configurator's search snippet and
// link preview, and no layout jump on load.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'sayanmramor-calculator.html'), 'utf8');

test('the page has a description and a link preview whose picture is in this repository', () => {
  assert.match(html, /<meta name="description" content="[^"]{80,170}">/);
  for (const p of ['og:title', 'og:description', 'og:image', 'og:image:width', 'og:image:height']) {
    assert.match(html, new RegExp('<meta property="' + p + '" content="[^"]+">'), p);
  }
  const img = html.match(/<meta property="og:image" content="https:\/\/sayanmramor\.ru\/studio\/([^"]+)">/);
  assert.ok(img, 'og:image is an absolute address on the domain');
  assert.ok(fs.existsSync(path.join(root, img[1])), img[1] + ' is missing');
});

test('no layout jump: without a product the columns are hidden by CSS, before the script runs', () => {
  assert.match(html, /\.configurator-columns:not\(\.has-product\) \{ display: none; \}/);
});
