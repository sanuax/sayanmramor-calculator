// tests/dimension-diagram-wings.test.js
//
// The countertop's size diagram draws its wings (the owner, 2026-11-14: it said «Схема без крыла» and
// showed a plain rectangle): the plan from above, the wall on top, the main run across, a wing under each
// end -- Г: one, at the chosen corner; П: one at each end -- with every size on the drawing.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const D = require('../dimension-diagram.js');

const html = fs.readFileSync(path.join(__dirname, '..', 'sayanmramor-calculator.html'), 'utf8');
const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, (msg || '') + ': ' + a + ' vs ' + b);
const texts = { length: '2000 мм', width: '600 мм', wingWidth: '600 мм', wingLength: '1000 мм' };
const lay = (shape, corner, l, w, ww, wl) => D.wingLayout({ shape, corner, lengthMm: l, widthMm: w, wingWidthMm: ww, wingLengthMm: wl, texts });
const SIZES = [[2000, 600, 600, 1000], [600, 2400, 200, 3000], [5000, 300, 1500, 300], [1000, 1000, 900, 900], [99999, 10, 5, 99999], [2000, 600, 0, 0]];
const CASES = [['lshape', 'left'], ['lshape', 'right'], ['ushape', 'left']];

test('the wings hang under the main run at its ends: one for Г at the chosen corner, one at each end for П', () => {
  CASES.forEach(([shape, corner]) => SIZES.forEach(([l, w, ww, wl]) => {
    const t = shape + ' ' + corner + ' ' + [l, w, ww, wl];
    const r = lay(shape, corner, l, w, ww, wl);
    assert.equal(r.wings.length, shape === 'ushape' ? 2 : 1, t);
    r.wings.forEach(wing => {
      close(wing.y, r.main.y + r.main.h, t + ': a wing starts where the run ends');
      assert.ok(wing.h > 0 && wing.w > 0, t);
    });
    const left = r.wings.find(x => Math.abs(x.x - r.main.x) < 1e-6), right = r.wings.find(x => Math.abs(x.x + x.w - (r.main.x + r.main.w)) < 1e-6);
    if (shape === 'lshape') assert.ok(corner === 'left' ? left && r.wings.length === 1 : right && r.wings.length === 1, t + ': the corner');
    else assert.ok(left && right && left.x + left.w <= right.x + 1e-6, t + ': two wings that do not overlap');
  }));
});

test('the real proportions: the run is length x width, the wing is its width x its length, one scale for both', () => {
  const r = lay('lshape', 'left', 2000, 600, 600, 1000);
  close(r.main.w / r.main.h, 2000 / 600, 'the run');
  close(r.wings[0].w / r.wings[0].h, 600 / 1000, 'the wing');
  close(r.main.w / 2000, r.wings[0].h / 1000, 'one scale');
});

test('the outline is one polygon: Г has six corners, П eight, all inside the viewBox', () => {
  CASES.forEach(([shape, corner]) => SIZES.forEach(([l, w, ww, wl]) => {
    const r = lay(shape, corner, l, w, ww, wl);
    assert.equal(r.outline.length, shape === 'ushape' ? 8 : 6, shape);
    r.outline.forEach(([x, y]) => assert.ok(x >= D.SAFE && x <= D.VIEW.width - D.SAFE && y >= D.SAFE && y <= D.VIEW.height - D.SAFE, shape + ' ' + [x, y]));
  }));
});

test('every size is on the drawing, on its own edge, outside the stone and inside the viewBox', () => {
  CASES.forEach(([shape, corner]) => SIZES.forEach(([l, w, ww, wl]) => {
    const t = shape + ' ' + corner + ' ' + [l, w, ww, wl];
    const r = lay(shape, corner, l, w, ww, wl);
    const wing = r.wings[0], x1 = r.main.x + r.main.w;
    // The length: across the top of the run, above it.
    close(r.dims.length.x1, r.main.x, t); close(r.dims.length.x2, x1, t);
    assert.ok(r.dims.length.y < r.main.y, t + ': above the run');
    // The wing's length: from the run's edge to the wing's end, outside the stone on the wing's side.
    const wingRight = shape === 'lshape' && corner === 'right';
    close(r.dims.wingLength.y1, wing.y, t); close(r.dims.wingLength.y2, wing.y + wing.h, t);
    if (wingRight) assert.ok(r.dims.wingLength.x > x1, t + ': the wing length is right of the stone');
    else assert.ok(r.dims.wingLength.x < r.main.x, t + ': the wing length is left of the stone');
    // The run's depth: on the OTHER side, so the two short segments' rotated labels never run into each other.
    close(r.dims.width.y1, r.main.y, t); close(r.dims.width.y2, r.main.y + r.main.h, t);
    if (wingRight) assert.ok(r.dims.width.x < r.main.x, t + ': the width is left of the stone');
    else assert.ok(r.dims.width.x > x1, t + ': the width is right of the stone');
    // The wing's width: under the wing's end.
    close(r.dims.wingWidth.x1, wing.x, t); close(r.dims.wingWidth.x2, wing.x + wing.w, t);
    assert.ok(r.dims.wingWidth.y > wing.y + wing.h, t + ': under the wing');
    Object.keys(r.dims).forEach(k => assert.ok(D.insideView(D.bounds(r.dims[k])), t + ' ' + k + ' ' + JSON.stringify(D.bounds(r.dims[k]))));
    // The labels never run across the stone.
    assert.ok(D.labelBox(r.dims.length.label).y1 <= r.main.y + 1e-6, t + ': the length label is above the run');
    const wl2 = D.labelBox(r.dims.wingWidth.label);
    assert.ok(wl2.y0 >= wing.y + wing.h - 1e-6, t + ': the wing width label is under the wing');
  }));
});

test('what is not entered yet is drawn from stand-in sizes, and the labels are the words the caller gives', () => {
  const r = D.wingLayout({ shape: 'lshape', corner: 'left', lengthMm: 0, widthMm: 0, wingWidthMm: 0, wingLengthMm: 0, texts: { length: 'длина', width: 'ширина', wingWidth: 'ширина крыла', wingLength: 'длина крыла' } });
  assert.ok(r.main.w > r.main.h && r.wings[0].h > 0);
  assert.equal(r.dims.wingWidth.label.text, 'ширина крыла');
  assert.equal(r.dims.length.label.text, 'длина');
});

test('the page draws them: no «Схема без крыла» note, the wing diagram is drawn through dimension-diagram.js', () => {
  assert.ok(!html.includes('dimShapeNote') && !html.includes('Схема без крыл'));
  assert.match(html, /DimensionDiagram\.wingLayout\(/);
  const upd = html.slice(html.indexOf('function updateDimDiagram()'), html.indexOf('// ---- Схема размеров: ступень / лестница'));
  assert.match(upd, /drawWingDiagram\(/);
  // Every field that changes the drawing redraws it.
  assert.match(html, /\['wing-width', 'wing-length'\]\.forEach\(id => document\.getElementById\(id\)\.addEventListener\('input', \(\) => \{ updateDimDiagram\(\); calculate\(\); \}\)\);/);
  assert.match(html, /productShapeSelect\.addEventListener\('change', \(\) => \{ updateWingVisibility\(\); updateDimDiagram\(\); calculate\(\); \}\);/);
  assert.match(html, /shapeCornerSelect\.addEventListener\('change', \(\) => \{ updateDimDiagram\(\); calculate\(\); \}\);/);
});
