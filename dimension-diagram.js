// dimension-diagram.js
//
// The one geometry of every dimension on the size diagrams (the plain
// rectangle, steps/stairs and facades in sayanmramor-calculator.html): where
// a dimension line goes relative to the drawn geometry, where its arrowheads
// end, where its label sits, and that all of it stays inside the diagram's
// viewBox. The page's drawings only say WHAT they measure (from x1 to x2 at
// the edge y of the shape); the placement is decided here, once.
//
// Order of the construction, for every dimension:
//   geometry bounds -> the dimension line, GAP outside the edge it measures
//   -> the arrowheads, whose tips end exactly on the line's end points (the
//      measured boundary) -> the label, LABEL_GAP from the line
//   -> everything clamped to the viewBox minus SAFE.
// A span too short for two arrowheads inside it gets them outside, pointing
// in (the usual drafting convention) -- the tips still end on the boundary.
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.DimensionDiagram = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {

  const VIEW = { width: 260, height: 190 };
  // Nothing -- line, arrowhead or text -- comes closer than this to the edge.
  const SAFE = 3;
  // From the edge of the geometry to the dimension line.
  const GAP = 10;
  // From the dimension line to the near edge of its label.
  const LABEL_GAP = 4;
  // The arrowhead (see the page's #dimArrowStart/#dimArrowEnd markers, in
  // user units): LENGTH from the tip back, HALF_WIDTH across the line.
  const ARROW = { length: 7, halfWidth: 3, strokeWidth: 1.2 };
  // Room for two arrowheads and a little line between them.
  const MIN_INSIDE = 2 * ARROW.length + 4;
  // Labels: 12 px bold; a conservative width per character, so a label's
  // estimated box is never smaller than the real one.
  const FONT = { size: 12, charWidth: 7.2, ascent: 9, descent: 3 };
  const LINE_STYLE = 'stroke="var(--muted)" stroke-width="' + ARROW.strokeWidth + '" fill="none"';
  const TEXT_STYLE = 'font-size="' + FONT.size + '" fill="var(--ink)" font-weight="700"';

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  function textWidth(text) {
    return String(text).length * FONT.charWidth;
  }

  // The box of a label: horizontal text, or text rotated -90° (reading
  // upward, its glyphs to the left of its baseline).
  function labelBox(label) {
    const w = textWidth(label.text);
    if (label.rotate) {
      return { x0: label.x - FONT.ascent, x1: label.x + FONT.descent, y0: label.y - w / 2, y1: label.y + w / 2 };
    }
    const x0 = label.anchor === 'start' ? label.x : label.anchor === 'end' ? label.x - w : label.x - w / 2;
    return { x0, x1: x0 + w, y0: label.y - FONT.ascent, y1: label.y + FONT.descent };
  }

  // Moves a label (never its line) so its whole box is inside the safe area.
  function fitLabel(label) {
    const b = labelBox(label);
    let dx = 0, dy = 0;
    if (b.x0 < SAFE) dx = SAFE - b.x0; else if (b.x1 > VIEW.width - SAFE) dx = VIEW.width - SAFE - b.x1;
    if (b.y0 < SAFE) dy = SAFE - b.y0; else if (b.y1 > VIEW.height - SAFE) dy = VIEW.height - SAFE - b.y1;
    return Object.assign({}, label, { x: label.x + dx, y: label.y + dy });
  }

  // A label placed along a dimension line, `at` its middle, or just after /
  // before its end (for a short line whose text would not fit under it).
  // `outside`: the arrows stand outside a short span, so a label beside it
  // starts past the arrow's stub.
  function horizontalLabel(x1, x2, y, text, side, at, outside) {
    const below = side !== 'above';
    const baseline = below ? y + LABEL_GAP + FONT.ascent : y - LABEL_GAP - FONT.descent;
    const clear = outside ? ARROW.length + 4 : ARROW.length / 2;
    if (at === 'after') return fitLabel({ x: Math.max(x1, x2) + clear + LABEL_GAP, y: y + FONT.ascent / 2 - 0.5, text, anchor: 'start' });
    if (at === 'before') return fitLabel({ x: Math.min(x1, x2) - clear - LABEL_GAP, y: y + FONT.ascent / 2 - 0.5, text, anchor: 'end' });
    return fitLabel({ x: (x1 + x2) / 2, y: baseline, text, anchor: 'middle' });
  }

  // A horizontal dimension from x1 to x2 (the measured boundaries), GAP
  // below (or above) the geometry edge at `edgeY` -- or exactly at `lineY`
  // when the line belongs inside the shape (a radius, a winder's depth).
  function horizontal(o) {
    const x1 = Math.min(o.x1, o.x2), x2 = Math.max(o.x1, o.x2);
    const side = o.side || 'below';
    const labelSpace = LABEL_GAP + FONT.ascent + FONT.descent;
    let y = o.lineY !== undefined ? o.lineY : (side === 'below' ? o.edgeY + (o.gap || GAP) : o.edgeY - (o.gap || GAP));
    const outside = x2 - x1 < MIN_INSIDE;
    // A short span keeps its label beside it (after the right arrow), not
    // squeezed under it.
    const at = o.label || (outside ? 'after' : 'center');
    const room = at === 'after' || at === 'before' ? ARROW.halfWidth + FONT.ascent / 2 : labelSpace;
    y = side === 'below'
      ? clamp(y, SAFE + ARROW.halfWidth, VIEW.height - SAFE - room)
      : clamp(y, SAFE + room, VIEW.height - SAFE - ARROW.halfWidth);
    const dim = { axis: 'x', x1, x2, y, side, outside, ends: o.ends || 'both' };
    dim.label = o.text === undefined ? null : horizontalLabel(x1, x2, y, o.text, side, at, outside);
    return dim;
  }

  // A vertical dimension from y1 to y2, GAP left (or right) of the edge at
  // `edgeX`, or exactly at `lineX`. The label reads upward along the line,
  // or -- `label: 'beside'` -- horizontally beside it.
  function vertical(o) {
    const y1 = Math.min(o.y1, o.y2), y2 = Math.max(o.y1, o.y2);
    const side = o.side || 'left';
    const beside = o.label === 'beside';
    const w = o.text === undefined ? 0 : textWidth(o.text);
    const labelSpace = LABEL_GAP + (beside ? w : FONT.ascent + FONT.descent);
    let x = o.lineX !== undefined ? o.lineX : (side === 'left' ? o.edgeX - (o.gap || GAP) : o.edgeX + (o.gap || GAP));
    x = side === 'left'
      ? clamp(x, SAFE + labelSpace, VIEW.width - SAFE - ARROW.halfWidth)
      : clamp(x, SAFE + ARROW.halfWidth, VIEW.width - SAFE - labelSpace);
    const dim = { axis: 'y', x, y1, y2, side, outside: y2 - y1 < MIN_INSIDE, ends: o.ends || 'both' };
    if (o.text === undefined) {
      dim.label = null;
    } else if (beside) {
      const lx = side === 'left' ? x - LABEL_GAP : x + LABEL_GAP;
      dim.label = fitLabel({ x: lx, y: (y1 + y2) / 2 + FONT.ascent / 2 - 0.5, text: o.text, anchor: side === 'left' ? 'end' : 'start' });
    } else {
      const lx = side === 'left' ? x - LABEL_GAP - FONT.descent : x + LABEL_GAP + FONT.ascent;
      dim.label = fitLabel({ x: lx, y: (y1 + y2) / 2, text: o.text, anchor: 'middle', rotate: true });
    }
    return dim;
  }

  // A radius: from the centre to the circle, the arrowhead's tip ON the
  // circle (angle 0 = to the right). The label goes under the circle.
  function radius(o) {
    const a = o.angle || 0;
    const dim = {
      axis: 'r', cx: o.cx, cy: o.cy, r: o.r,
      x1: o.cx, y1: o.cy, x2: o.cx + o.r * Math.cos(a), y2: o.cy + o.r * Math.sin(a),
      ends: 'end', outside: false,
    };
    dim.label = o.text === undefined ? null
      : fitLabel({ x: o.cx, y: o.cy + o.r + LABEL_GAP + FONT.ascent + 2, text: o.text, anchor: 'middle' });
    return dim;
  }

  // The drawn segments of a dimension: [x1, y1, x2, y2, arrowAtStart,
  // arrowAtEnd]. Inside: one line with its arrows. Outside (a short span):
  // two stubs outside the boundaries with their arrows pointing in, and the
  // plain line between them.
  function segments(dim) {
    if (dim.axis === 'r') return [[dim.x1, dim.y1, dim.x2, dim.y2, false, true]];
    const along = dim.axis === 'x'
      ? (a, b) => [a, dim.y, b, dim.y]
      : (a, b) => [dim.x, a, dim.x, b];
    const lo = dim.axis === 'x' ? dim.x1 : dim.y1, hi = dim.axis === 'x' ? dim.x2 : dim.y2;
    const startArrow = dim.ends !== 'end', endArrow = dim.ends !== 'start';
    if (!dim.outside) return [along(lo, hi).concat([startArrow, endArrow])];
    // The stubs stay inside the viewBox (they are only lead-ins to the arrows).
    const limit = dim.axis === 'x' ? VIEW.width : VIEW.height;
    const stub = ARROW.length + 4;
    const out = [along(lo, hi).concat([false, false])];
    if (startArrow) out.push(along(Math.max(SAFE, lo - stub), lo).concat([false, true]));
    if (endArrow) out.push(along(Math.min(limit - SAFE, hi + stub), hi).concat([false, true]));
    return out;
  }

  // Everything a dimension draws, for the viewBox check: every segment end
  // -- along the line an arrowhead ends exactly at its tip, across it it
  // reaches HALF_WIDTH -- and the label.
  function bounds(dim) {
    const pts = [];
    segments(dim).forEach(([x1, y1, x2, y2]) => { pts.push([x1, y1], [x2, y2]); });
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    const h = ARROW.halfWidth;
    const hx = dim.axis === 'x' ? 0 : h, hy = dim.axis === 'y' ? 0 : h;
    const b = { x0: Math.min(...xs) - hx, x1: Math.max(...xs) + hx, y0: Math.min(...ys) - hy, y1: Math.max(...ys) + hy };
    if (dim.label) {
      const l = labelBox(dim.label);
      b.x0 = Math.min(b.x0, l.x0); b.x1 = Math.max(b.x1, l.x1); b.y0 = Math.min(b.y0, l.y0); b.y1 = Math.max(b.y1, l.y1);
    }
    return b;
  }

  function insideView(b) {
    return b.x0 >= SAFE - 1e-9 && b.y0 >= SAFE - 1e-9 && b.x1 <= VIEW.width - SAFE + 1e-9 && b.y1 <= VIEW.height - SAFE + 1e-9;
  }

  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const r2 = v => Math.round(v * 100) / 100;

  function labelSvg(label, extraStyle) {
    const rot = label.rotate ? ' transform="rotate(-90 ' + r2(label.x) + ' ' + r2(label.y) + ')"' : '';
    return '<text x="' + r2(label.x) + '" y="' + r2(label.y) + '" text-anchor="' + label.anchor + '" ' + TEXT_STYLE + (extraStyle || '') + rot + '>' + esc(label.text) + '</text>';
  }

  // The SVG of a dimension: its line(s) with the page's shared markers
  // (#dimArrowStart / #dimArrowEnd) and its label.
  function svg(dim) {
    const lines = segments(dim).map(([x1, y1, x2, y2, s, e]) =>
      '<line x1="' + r2(x1) + '" y1="' + r2(y1) + '" x2="' + r2(x2) + '" y2="' + r2(y2) + '" ' + LINE_STYLE +
      (s ? ' marker-start="url(#dimArrowStart)"' : '') + (e ? ' marker-end="url(#dimArrowEnd)"' : '') + '/>').join('');
    return lines + (dim.label ? labelSvg(dim.label) : '');
  }

  // The plain size diagram (a rectangle, «Длина» across, «Ширина» up):
  // the real proportions of length x width in a 130-unit square area (the
  // longer side fills it, the shorter keeps the ratio, never under 36 so it
  // stays visible), the length GAP under it, the width GAP left of it.
  // lengthAxis 'vertical': the length field is the drawn height instead --
  // «Стены», whose length field is «Высота стены» (the 3D stands it up).
  const RECT_AREA = { x: 70, y: 20, size: 130, min: 36 };
  function rectLayout(lengthMm, widthMm, lengthText, widthText, options) {
    const lengthUp = !!(options && options.lengthAxis === 'vertical');
    const effL = lengthMm > 0 ? lengthMm : (lengthUp ? 1 : 1.55);
    const effW = widthMm > 0 ? widthMm : (lengthUp ? 1.55 : 1);
    const scale = RECT_AREA.size / Math.max(effL, effW);
    const w = Math.max(RECT_AREA.min, (lengthUp ? effW : effL) * scale);
    const h = Math.max(RECT_AREA.min, (lengthUp ? effL : effW) * scale);
    const x = RECT_AREA.x + (RECT_AREA.size - w) / 2;
    const y = RECT_AREA.y + (RECT_AREA.size - h) / 2;
    const across = text => horizontal({ x1: x, x2: x + w, edgeY: y + h, text });
    const up = text => vertical({ y1: y, y2: y + h, edgeX: x, text });
    return {
      rect: { x, y, w, h },
      length: lengthUp ? up(lengthText) : across(lengthText),
      width: lengthUp ? across(widthText) : up(widthText),
    };
  }

  return {
    VIEW, SAFE, GAP, LABEL_GAP, ARROW, MIN_INSIDE, FONT,
    textWidth, labelBox, fitLabel, horizontal, vertical, radius, segments, bounds, insideView,
    svg, labelSvg, rectLayout,
  };
});
