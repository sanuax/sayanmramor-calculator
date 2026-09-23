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
    VISUAL_FALLBACK_CURB_HEIGHT_M, VISUAL_FALLBACK_ISLAND_GAP_M, VISUAL_FALLBACK_BAR_COUNTER_GAP_M,
  } = (typeof module !== 'undefined' && module.exports) ? require('./constants.js') : globalRoot.VisualizerConstants;

  function resolveBacksplash(backsplash) {
    if (!backsplash || backsplash.widthM <= 0 || backsplash.lengthM <= 0) return null;
    return {
      // Both dimensions are real user input -- no fallback needed. widthM
      // (the shorter of the two, by the same width<length convention as the
      // main countertop) is the panel's own dimension that becomes its
      // mounted HEIGHT once stood up against the wall; lengthM is the
      // horizontal run along the wall -- see three-scene.js for why that
      // run has to align with the main slab's own LENGTH axis, not WIDTH.
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
      // Same wall-facing edge as the backsplash -- бортик and фартук mount
      // on the same physical wall, not opposite edges of the countertop.
      edge: 'back',
      source: 'fallback-height', // length is real; height is a guess
    };
  }

  // Стеновая панель: same shape as the backsplash (width becomes the mounted
  // height, length is the run along the wall) -- a bigger wall-mounted
  // panel, not a new concept.
  function resolveWallPanel(wallPanel) {
    if (!wallPanel || wallPanel.widthM <= 0 || wallPanel.lengthM <= 0) return null;
    return {
      heightM: wallPanel.widthM,
      lengthM: wallPanel.lengthM,
      edge: 'back',
      source: 'real',
    };
  }

  // offsetXM/offsetZM are the island's own center, in the SAME local frame as
  // the main segment's center (0,0) -- directly usable as a mesh position,
  // not a distance-from-an-edge that still needs half-length math downstream.
  // The island sits OFFSET ALONG WIDTH (X), facing the main segment's own
  // LENGTH-oriented run, like a real kitchen island parallel to the main
  // counter across a walkway -- not tacked onto one end of it (that was the
  // bug: offsetting along Z made it read as a random extra segment rather
  // than a separate, related piece of furniture facing the counter).
  // mainWidthM/2 reaches the main segment's own edge; + the gap; + the
  // island's own half-width so the island's NEAR edge, not its center, sits
  // the gap away from the main segment.
  //
  // With an L-shape the wing reaches into the same room-side area from one
  // end of the run. If the wing is longer than the walkway gap, the island
  // slides along the run so it starts one walkway gap past the wing -- same
  // kitchen, no two pieces of stone occupying the same floor.
  // Local Z (same frame as offsetZM): a 'right' wing sits at the -Z end of
  // the run, a 'left' wing at the +Z end.
  function islandRunCenter(islandLengthM, mainLengthM, wing) {
    if (!wing || !mainLengthM || wing.lengthM <= VISUAL_FALLBACK_ISLAND_GAP_M) return 0;
    const clearFromWing = mainLengthM / 2 - wing.widthM - VISUAL_FALLBACK_ISLAND_GAP_M;
    if (wing.corner === 'left') return Math.min(0, clearFromWing - islandLengthM / 2);
    return Math.max(0, islandLengthM / 2 - clearFromWing);
  }

  function resolveIsland(island, mainWidthM, mainLengthM, wing) {
    if (!island || island.widthM <= 0 || island.lengthM <= 0) return null;
    return {
      widthM: island.widthM, lengthM: island.lengthM,
      variant: island.variant || 'standard',
      offsetXM: mainWidthM / 2 + VISUAL_FALLBACK_ISLAND_GAP_M + island.widthM / 2,
      offsetZM: islandRunCenter(island.lengthM, mainLengthM, wing),
      source: 'fallback-offset', // width/length are real; the gap from the main countertop is a guess
    };
  }

  // Барная стойка: a peninsula-style continuation past one LENGTH-end of the
  // main segment (the axis the island no longer uses, so the two attachments
  // can never collide even if both are present at once). Same offset math as
  // the island, just extending mainLengthM instead of mainWidthM.
  // It continues the run from the FREE end: with an L-shape whose wing sits
  // at the +Z end ('left' corner), the bar goes to the -Z end instead of
  // crowding the corner.
  function resolveBarCounter(barCounter, mainLengthM, wing) {
    if (!barCounter || barCounter.widthM <= 0 || barCounter.lengthM <= 0) return null;
    const side = wing && wing.corner === 'left' ? -1 : 1;
    return {
      widthM: barCounter.widthM, lengthM: barCounter.lengthM,
      variant: barCounter.variant || 'standard',
      offsetXM: 0,
      offsetZM: side * (mainLengthM / 2 + VISUAL_FALLBACK_BAR_COUNTER_GAP_M + barCounter.lengthM / 2),
      source: 'fallback-offset',
    };
  }

  return { resolveBacksplash, resolveCurb, resolveWallPanel, resolveIsland, resolveBarCounter };
});
