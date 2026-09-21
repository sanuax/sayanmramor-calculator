// visualizer/attachment-geometry.js
//
// Pure resolution for backsplash/curb/island -- each has SOME real
// user-entered dimension (width/length, or length) but no real height or
// placement input, so each result names precisely which part is a
// visual-only fallback via `source`, rather than an all-or-nothing tag.
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.AttachmentGeometry = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {

  // NOTE: same reason as visualizer/geometry-model.js -- this factory
  // function does not close over the outer IIFE's `root` parameter.
  const globalRoot = typeof window !== 'undefined' ? window : globalThis;
  const {
    VISUAL_FALLBACK_CURB_HEIGHT_M, VISUAL_FALLBACK_ISLAND_GAP_M,
  } = (typeof module !== 'undefined' && module.exports) ? require('./constants.js') : globalRoot.VisualizerConstants;

  function resolveBacksplash(backsplash) {
    if (!backsplash || backsplash.widthM <= 0 || backsplash.lengthM <= 0) return null;
    return {
      // Both dimensions are real user input -- no fallback needed. widthM
      // (the shorter of the two, by the same width<length convention as the
      // main countertop) is the panel's own dimension that becomes its
      // mounted HEIGHT once stood up against the wall; lengthM is the
      // horizontal run along the wall.
      heightM: backsplash.widthM,
      lengthM: backsplash.lengthM,
      edge: 'back',
      source: 'real',
    };
  }

  function resolveCurb(curbLengthM) {
    if (!curbLengthM || curbLengthM <= 0) return null;
    return {
      lengthM: curbLengthM,
      heightM: VISUAL_FALLBACK_CURB_HEIGHT_M,
      edge: 'front',
      source: 'fallback-height', // length is real; height is a guess
    };
  }

  // offsetXM/offsetZM are the island's own center, in the SAME local frame as
  // the main segment's center (0,0) -- directly usable as a mesh position,
  // not a distance-from-an-edge that still needs half-length math downstream.
  // mainLengthM/2 reaches the main segment's edge; + the gap; + the island's
  // own half-length so the island's NEAR edge, not its center, sits the gap
  // away from the main segment.
  function resolveIsland(island, mainLengthM) {
    if (!island || island.widthM <= 0 || island.lengthM <= 0) return null;
    return {
      widthM: island.widthM, lengthM: island.lengthM,
      offsetXM: 0,
      offsetZM: mainLengthM / 2 + VISUAL_FALLBACK_ISLAND_GAP_M + island.lengthM / 2,
      source: 'fallback-offset', // width/length are real; the gap from the main countertop is a guess
    };
  }

  return { resolveBacksplash, resolveCurb, resolveIsland };
});
