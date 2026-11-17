// edge-length.js
//
// The edge is priced on the length of every open edge that is not at a wall
// (the owner's rule, docs/superpowers/specs/2026-11-08-company-rates-v2-design.md,
// «Кромка»). The length is read from the same scene layout the 3D draws
// (visualizer/scene-layout.js), so the price and the 3D agree on which edges
// are open:
//   - a part with `openEdges` (a tread, a landing): those outline edges --
//     or `openLengthM` where only part of such an edge is open (a П landing,
//     where the upper march starts on its front);
//   - a part with `closed` (a countertop's main run and wings -- their front
//     only, the ends are straight cuts (the owner, 2026-11-17) --, every sill,
//     a bar counter whose ends have no edge): every outline edge not listed
//     in `closed`;
//   - an island: its whole outline;
//   - anything else (a stone wrap strip, a riser, a sink, a backsplash, a
//     floor, a wall...): no edge.
// Holes (a sink, a tap) are not outline edges and are never counted. A
// curved outline is a polyline: its segments are summed.
//
// Pure, no DOM. Exposed as `EdgeLength` in the browser.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.EdgeLength = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const EDGED_PARTS = ['main', 'wing', 'island', 'bar', 'tread', 'landing'];
  const WHOLE_OUTLINE = ['island'];

  function edgeLength(outline, i) {
    const a = outline[i], b = outline[(i + 1) % outline.length];
    return Math.hypot(b[0] - a[0], b[1] - a[1]);
  }

  function partLength(part) {
    const outline = part.outline;
    if (typeof part.openLengthM === 'number' && isFinite(part.openLengthM)) return Math.max(0, part.openLengthM);
    const all = outline.map((_, i) => i);
    let open;
    if (Array.isArray(part.openEdges)) open = part.openEdges;
    else if (Array.isArray(part.closed)) open = all.filter(i => !part.closed.includes(i));
    else if (WHOLE_OUTLINE.includes(part.name)) open = all;
    else open = [];
    return open.reduce((sum, i) => sum + (i >= 0 && i < outline.length ? edgeLength(outline, i) : 0), 0);
  }

  // The open edge length of a scene layout, in metres (to the millimetre).
  function openEdgeLengthM(layout) {
    if (!layout || !Array.isArray(layout.parts)) return 0;
    const total = layout.parts.reduce((sum, part) => {
      if (!part || part.kind !== 'prism' || part.role !== 'stone' || !EDGED_PARTS.includes(part.name)) return sum;
      if (!Array.isArray(part.outline) || part.outline.length < 2) return sum;
      const len = partLength(part);
      return sum + (isFinite(len) ? len : 0);
    }, 0);
    return Math.round(total * 1000) / 1000;
  }

  return { openEdgeLengthM };
});
