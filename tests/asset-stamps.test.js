// tests/asset-stamps.test.js
//
// The configurator page loads its scripts without a version, and GitHub Pages lets a browser keep a file for
// ten minutes. After the stair / countertop steps were changed (2026-11-14) a page opened right after the
// publication ran the NEW html with the OLD step-engine.js: seven steps, one of them without a section.
// Every script of the calculator's own now carries ?v=<the first 8 hex of its sha256> (scripts/stamp_assets.js),
// so a changed file is a new address. The files of the site (/sayanmramor-site/...) are the site's own to stamp.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const stamps = require('../scripts/stamp_assets.js');
const html = fs.readFileSync(path.join(root, 'sayanmramor-calculator.html'), 'utf8');

const ownScripts = [...html.matchAll(/<script[^>]*\ssrc="([^"?]+)(?:\?v=([0-9a-f]+))?"/g)]
  .map(m => ({ file: m[1], stamp: m[2] }))
  .filter(s => !/^(\/|https?:)/.test(s.file));

test('the page loads its own scripts (a sanity check that the pattern finds them)', () => {
  assert.ok(ownScripts.length >= 30, 'found ' + ownScripts.length);
  assert.ok(ownScripts.some(s => s.file === 'step-engine.js') && ownScripts.some(s => s.file === 'visualizer/three-scene.js'));
});

test('every own script of the page is stamped with the hash of its file', () => {
  ownScripts.forEach(s => {
    assert.ok(s.stamp, s.file + ' has no ?v=');
    assert.equal(s.stamp, stamps.stampOf(s.file), s.file + ' is stale: run node scripts/stamp_assets.js');
  });
});

test('the page is exactly what the stamping script would write (nothing stale, nothing left out)', () => {
  assert.equal(stamps.stamped(html.replace(/\r\n/g, '\n')), html.replace(/\r\n/g, '\n'));
});

test('a file written with CRLF or LF has one stamp (the repository keeps LF, Windows checks out CRLF)', () => {
  assert.equal(stamps.hashOf('a\r\nb\r\n'), stamps.hashOf('a\nb\n'));
  assert.notEqual(stamps.hashOf('a\nb\n'), stamps.hashOf('a\nc\n'));
});

test('the 3D modules import each other by plain URLs: an import map sends each to its stamped one', () => {
  const map = (html.match(/<!-- IMPORTMAP -->\s*<script type="importmap">([^<]*)<\/script>\s*<!-- \/IMPORTMAP -->/) || [])[1];
  assert.ok(map, 'the import map between its markers');
  const imports = JSON.parse(map).imports;
  stamps.modules().forEach(f => assert.equal(imports['./' + f], './' + f + '?v=' + stamps.stampOf(f), f));
  assert.ok('./visualizer/ar-view.js' in imports, 'ar-view.js is imported by three-scene.js');
  // It must stand before the first module script, or it is ignored.
  assert.ok(html.indexOf('<!-- IMPORTMAP -->') < html.indexOf('<script type="module"'));
});

test('the product cards\' pictures: one file per product of the page, and the page carries the hash of them all', () => {
  const keys = JSON.parse(html.match(/const PRODUCT_ICON_KEYS = (\[[^\]]*\]);/)[1].replace(/'/g, '"'));
  const files = fs.readdirSync(path.join(root, stamps.ICONS_DIR)).filter(f => f.endsWith('.webp')).map(f => f.replace(/\.webp$/, '')).sort();
  assert.deepEqual(files, keys.slice().sort(), 'a picture for every product and none left over');
  assert.equal(html.match(/const PRODUCT_ICONS_V = '([0-9a-f]+)';/)[1], stamps.iconsStamp(), 'stale: run node scripts/stamp_assets.js');
  assert.match(html, /\.webp\?v=' \+ PRODUCT_ICONS_V/, 'every picture\'s address carries the stamp');
});
