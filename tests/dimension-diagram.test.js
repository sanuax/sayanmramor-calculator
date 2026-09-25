// tests/dimension-diagram.test.js
//
// The geometry of every dimension on the size diagrams: lines on the real
// boundaries, arrow tips exactly on the line's end points, labels and
// arrowheads inside the viewBox -- for the plain rectangle and for the
// placement rules the stairs/facade drawings use.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const D = require('../dimension-diagram.js');

const html = fs.readFileSync(path.join(__dirname, '..', 'sayanmramor-calculator.html'), 'utf8');
const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, (msg || '') + ': ' + a + ' vs ' + b);
const inside = (dim, msg) => assert.ok(D.insideView(D.bounds(dim)), (msg || '') + ' ' + JSON.stringify(D.bounds(dim)));

test('the arrowhead markers: user units (same size everywhere), the outline\'s tip exactly on the line\'s end point', () => {
  ['dimArrowStart', 'dimArrowEnd'].forEach(id => {
    const m = html.match(new RegExp('<marker id="' + id + '"([^>]*)>\\s*<path d="([^"]+)"([^>]*)>'));
    assert.ok(m, id);
    const attrs = m[1], d = m[2], pathAttrs = m[3];
    assert.match(attrs, /markerUnits="userSpaceOnUse"/, id);
    const num = name => Number(attrs.match(new RegExp(name + '="([\\d.]+)"'))[1]);
    // The chevron: from (0,0) to its tip at (ARROW.length, ARROW.halfWidth) and back.
    assert.equal(d, 'M0,0 L' + D.ARROW.length + ',' + D.ARROW.halfWidth + ' L0,' + 2 * D.ARROW.halfWidth, id);
    const stroke = Number(pathAttrs.match(/stroke-width="([\d.]+)"/)[1]);
    assert.match(pathAttrs, /stroke-linejoin="round"/);
    // refX = the tip + half the stroke: the outline ends on the end point, not past it.
    close(num('refX'), D.ARROW.length + stroke / 2, id + ' refX');
    close(num('refY'), D.ARROW.halfWidth, id + ' refY');
  });
});

test('horizontal dimension: exactly the measured span, GAP outside the geometry, arrows and label inside the viewBox', () => {
  const dim = D.horizontal({ x1: 80, x2: 180, edgeY: 120, text: '2400 мм' });
  assert.equal(dim.x1, 80); assert.equal(dim.x2, 180);
  assert.equal(dim.y, 120 + D.GAP, 'below the edge, not on it');
  assert.equal(dim.outside, false);
  const [seg] = D.segments(dim);
  assert.deepEqual(seg.slice(0, 4), [80, 130, 180, 130], 'the line ends on the boundaries');
  assert.deepEqual(seg.slice(4), [true, true], 'an arrow at each end');
  assert.ok(dim.label.y - D.FONT.ascent >= dim.y + D.LABEL_GAP - 1e-9, 'the label under the line, clear of it');
  inside(dim);
  // Above the geometry.
  const above = D.horizontal({ x1: 40, x2: 90, edgeY: 60, side: 'above', text: 'x' });
  assert.equal(above.y, 60 - D.GAP);
  assert.ok(D.labelBox(above.label).y1 <= above.y - D.LABEL_GAP + 1e-9);
});

test('vertical dimension: exactly the measured span, left or right of the edge; a rotated label never leaves the viewBox', () => {
  const left = D.vertical({ y1: 30, y2: 150, edgeX: 70, text: 'Ширина помещения' });
  assert.equal(left.x, 70 - D.GAP);
  assert.deepEqual(D.segments(left)[0].slice(0, 4), [60, 30, 60, 150]);
  assert.ok(D.labelBox(left.label).x1 <= left.x - D.LABEL_GAP + 1e-9, 'label left of the line');
  inside(left);
  const right = D.vertical({ y1: 40, y2: 120, edgeX: 170, side: 'right', text: '300 мм' });
  assert.equal(right.x, 180);
  assert.ok(D.labelBox(right.label).x0 >= right.x + D.LABEL_GAP - 1e-9, 'label right of the line');
  inside(right);
  const beside = D.vertical({ y1: 50, y2: 90, edgeX: 80, text: 'глубина', label: 'beside' });
  assert.equal(beside.label.rotate, undefined);
  assert.equal(beside.label.anchor, 'end');
  inside(beside);
});

test('a span too short for two arrowheads inside: they go outside, pointing in, tips still on the boundaries', () => {
  const dim = D.horizontal({ x1: 100, x2: 108, edgeY: 80, text: '20 мм' });
  assert.equal(dim.outside, true);
  const segs = D.segments(dim);
  // The plain line between the boundaries, then a stub from outside to each boundary with its arrow at the boundary.
  assert.deepEqual(segs[0], [100, 90, 108, 90, false, false]);
  assert.equal(segs[1][2], 100, 'left arrow tip on x1');
  assert.ok(segs[1][0] < 100, 'coming from outside');
  assert.equal(segs[1][5], true);
  assert.equal(segs[2][2], 108, 'right arrow tip on x2');
  assert.ok(segs[2][0] > 108);
  // Its label beside it, past the right stub -- not squeezed under the span.
  assert.equal(dim.label.anchor, 'start');
  assert.ok(D.labelBox(dim.label).x0 > segs[2][0], 'the label starts past the stub');
  inside(dim);
  const v = D.vertical({ y1: 60, y2: 70, edgeX: 90, text: 'h' });
  assert.equal(v.outside, true);
  const vs = D.segments(v);
  assert.equal(vs[1][3], 60); assert.equal(vs[2][3], 70);
  // Exactly at the limit: inside again.
  assert.equal(D.horizontal({ x1: 0 + 50, x2: 50 + D.MIN_INSIDE, edgeY: 80 }).outside, false);
});

test('radius: from the centre, the arrow tip exactly on the circle, at any angle', () => {
  [0, Math.PI / 4, Math.PI / 2, 2].forEach(angle => {
    const dim = D.radius({ cx: 205, cy: 70, r: 24, angle, text: 'R = 200 мм' });
    const [seg] = D.segments(dim);
    close(seg[0], 205); close(seg[1], 70);
    close(Math.hypot(seg[2] - 205, seg[3] - 70), 24, 'tip on the circle');
    assert.deepEqual(seg.slice(4), [false, true], 'one arrow, at the circle');
    inside(dim);
    assert.ok(D.labelBox(dim.label).y0 >= 70 + 24, 'label under the circle');
  });
});

test('labels and lines are pulled inside the viewBox near its edges -- never cut off', () => {
  const bottom = D.horizontal({ x1: 5, x2: 255, edgeY: 185, text: '99999999 мм' });
  inside(bottom, 'bottom edge');
  const top = D.horizontal({ x1: 10, x2: 60, edgeY: 2, side: 'above', text: 'длина' });
  inside(top, 'top edge');
  // The longest real field name is ~17 characters («Ширина обрамления»).
  const leftEdge = D.vertical({ y1: 4, y2: 186, edgeX: 4, text: 'Высота длинного элемента' });
  inside(leftEdge, 'left edge');
  const rightEdge = D.vertical({ y1: 20, y2: 60, edgeX: 256, side: 'right', text: 'Высота профиля' });
  inside(rightEdge, 'right edge');
  const after = D.horizontal({ x1: 200, x2: 250, lineY: 76, text: 'ширина ступени', label: 'after' });
  inside(after, 'label after a line near the right edge');
});

test('the plain rectangle diagram: real proportions; the length under it and the width left of it span exactly its sides, clear of it, inside the viewBox', () => {
  const cases = [
    [2400, 600], [600, 2400], [1000, 1000], [0, 0], [12000, 50], [50, 12000], [1, 1], [99999999, 3], [300, 0],
  ];
  const texts = [['2400 мм', '600 мм'], ['Длина помещения', 'Ширина помещения'], ['99999999 мм', 'Высота стены']];
  cases.forEach(([l, w]) => texts.forEach(([lt, wt]) => {
    const { rect, length, width } = D.rectLayout(l, w, lt, wt);
    const label = l + 'x' + w + ' ' + lt;
    close(length.x1, rect.x, label); close(length.x2, rect.x + rect.w, label);
    close(width.y1, rect.y, label); close(width.y2, rect.y + rect.h, label);
    assert.ok(length.y > rect.y + rect.h, label + ': the length line is under the shape, not across it');
    assert.ok(width.x < rect.x, label + ': the width line is left of the shape');
    assert.ok(D.labelBox(length.label).y0 > rect.y + rect.h, label + ': the length label clear of the shape');
    assert.ok(D.labelBox(width.label).x1 < rect.x, label + ': the width label clear of the shape');
    inside(length, label); inside(width, label);
    assert.ok(rect.x >= 0 && rect.y >= 0 && rect.x + rect.w <= D.VIEW.width && rect.y + rect.h <= D.VIEW.height);
  }));
  // Proportions: the longer side fills the area, the ratio is kept.
  const r = D.rectLayout(2000, 1000, 'a', 'b').rect;
  close(r.w / r.h, 2);
});

test('the page draws every dimension through dimension-diagram.js -- no hand-placed dimension line is left', () => {
  const script = html.slice(html.indexOf('</defs>'));
  assert.doesNotMatch(script, /marker-(start|end)="url\(#dimArrow/, 'markers only come from DimensionDiagram.svg');
  assert.match(html, /<script src="dimension-diagram\.js"><\/script>/);
  ['DimensionDiagram.rectLayout', 'DimensionDiagram.horizontal', 'DimensionDiagram.vertical', 'D2.radius'].forEach(call =>
    assert.ok(html.includes(call), call));
});
