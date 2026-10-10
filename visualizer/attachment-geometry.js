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
    VISUAL_FALLBACK_CURB_HEIGHT_M, VISUAL_FALLBACK_ISLAND_GAP_M, VISUAL_FALLBACK_BAR_COUNTER_RAISE_M,
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
  // Callers pass the model's wings (an array: none, one for an L, two for a
  // П) -- or, as before, a single wing object.
  function wingList(wings) {
    if (Array.isArray(wings)) return wings;
    return wings ? [wings] : [];
  }

  function islandRunCenter(islandLengthM, mainLengthM, wing) {
    if (!wing || !mainLengthM || wing.lengthM <= VISUAL_FALLBACK_ISLAND_GAP_M) return 0;
    const clearFromWing = mainLengthM / 2 - wing.widthM - VISUAL_FALLBACK_ISLAND_GAP_M;
    if (wing.corner === 'left') return Math.min(0, clearFromWing - islandLengthM / 2);
    return Math.max(0, islandLengthM / 2 - clearFromWing);
  }

  // With a bar counter too (resolveBarCounter's result, passed in), the island
  // keeps a walkway from it as well: first where it would stand anyway; if that
  // is on the bar's floor, slid along the run away from the bar; if that runs
  // into a wing, out into the room past the bar and the wings, on its own line.
  function wingRects(list, mainWidthM, mainLengthM) {
    return list.map(w => {
      const z0 = w.corner === 'left' ? mainLengthM / 2 - w.widthM : -mainLengthM / 2;
      return { x0: mainWidthM / 2, x1: mainWidthM / 2 + w.lengthM, z0, z1: z0 + w.widthM };
    });
  }
  function clearOf(r, others, gap) {
    return others.every(o => r.x1 <= o.x0 - gap + 1e-9 || o.x1 <= r.x0 - gap + 1e-9 || r.z1 <= o.z0 - gap + 1e-9 || o.z1 <= r.z0 - gap + 1e-9);
  }

  function resolveIsland(island, mainWidthM, mainLengthM, wings, bar) {
    if (!island || island.widthM <= 0 || island.lengthM <= 0) return null;
    const list = wingList(wings);
    const gap = VISUAL_FALLBACK_ISLAND_GAP_M;
    // A П-shape closes the room side at both ends: the island stands past
    // the ends of its wings instead, centred on the run.
    const reach = list.length === 2 ? Math.max(list[0].lengthM, list[1].lengthM) : 0;
    let offsetXM = mainWidthM / 2 + reach + gap + island.widthM / 2;
    let offsetZM = list.length === 2 ? 0 : islandRunCenter(island.lengthM, mainLengthM, list[0] || null);
    if (bar) {
      const rectAt = (x, z) => ({ x0: x - island.widthM / 2, x1: x + island.widthM / 2, z0: z - island.lengthM / 2, z1: z + island.lengthM / 2 });
      const barRect = { x0: bar.x0M, x1: bar.x1M, z0: bar.z0M, z1: bar.z1M };
      const wingsAt = wingRects(list, mainWidthM, mainLengthM);
      const fits = r => clearOf(r, [barRect], gap) && clearOf(r, wingsAt, 0);
      if (!fits(rectAt(offsetXM, offsetZM))) {
        const barAtPlusZ = (bar.z0M + bar.z1M) / 2 > 0;
        const slid = barAtPlusZ
          ? Math.min(offsetZM, bar.z0M - gap - island.lengthM / 2)
          : Math.max(offsetZM, bar.z1M + gap + island.lengthM / 2);
        if (fits(rectAt(offsetXM, slid))) offsetZM = slid;
        else offsetXM = Math.max(bar.x1M, ...wingsAt.map(w => w.x1)) + gap + island.widthM / 2;
      }
    }
    return {
      widthM: island.widthM, lengthM: island.lengthM,
      variant: island.variant || 'standard',
      offsetXM, offsetZM,
      source: 'fallback-offset', // width/length are real; the gap from the main countertop is a guess
    };
  }

  // Барная стойка (2026-10-11, the owner's choice: concept A): a peninsula.
  // It leaves the run at its FREE end and goes out into the room (+X) from the
  // front edge -- never behind the wall -- flush with that end; the longer of
  // the two entered sizes runs into the room, the shorter is its depth, so it
  // does not matter which field the client typed which in. It stands a step
  // above the worktop (raiseM; scene-layout puts a stone panel under each end).
  //   straight: the +Z end; Г: the end the wing does not use ('left' wing =
  //   +Z end, so the bar takes -Z); П: the run has no free end -- the bar
  //   carries on from the tip of the +Z ('left') wing.
  // x0M..x1M / z0M..z1M: its plan, in the main segment's frame (centre 0,0).
  function resolveBarCounter(barCounter, mainWidthM, mainLengthM, wings) {
    if (!barCounter || barCounter.widthM <= 0 || barCounter.lengthM <= 0) return null;
    const list = wingList(wings);
    const runM = Math.max(barCounter.widthM, barCounter.lengthM);
    const depthM = Math.min(barCounter.widthM, barCounter.lengthM);
    const plusWing = list.length === 2 ? list.find(w => w.corner === 'left') || list[0] : null;
    const side = list.length === 1 && list[0].corner === 'left' ? -1 : 1;
    const x0M = mainWidthM / 2 + (plusWing ? plusWing.lengthM : 0);
    const endZ = side * mainLengthM / 2;
    const z0M = side > 0 ? endZ - depthM : endZ;
    return {
      widthM: barCounter.widthM, lengthM: barCounter.lengthM,
      runM, depthM,
      x0M, x1M: x0M + runM, z0M, z1M: z0M + depthM,
      offsetXM: x0M + runM / 2, offsetZM: z0M + depthM / 2,
      raiseM: VISUAL_FALLBACK_BAR_COUNTER_RAISE_M,
      variant: barCounter.variant || 'standard',
      source: 'fallback-offset', // sizes are real; where it stands and how high is a guess
    };
  }

  return { resolveBacksplash, resolveCurb, resolveWallPanel, resolveIsland, resolveBarCounter };
});
