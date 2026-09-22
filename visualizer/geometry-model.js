// visualizer/geometry-model.js
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.GeometryModel = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {

  // NOTE: can't reference the outer IIFE's `root` param here -- this factory
  // function is a separate literal passed in as an argument, not nested
  // inside that function's body, so it does not close over `root`. Re-derive
  // the same global directly instead.
  const globalRoot = typeof window !== 'undefined' ? window : globalThis;
  const isNode = typeof module !== 'undefined' && module.exports;
  const { VISUAL_FALLBACK_THICKNESS_M, VISUAL_FALLBACK_FLOOR_THICKNESS_M } = isNode ? require('./constants.js') : globalRoot.VisualizerConstants;
  const { resolveSinkCutout, resolveCooktopCutout, resolveHoles } = isNode ? require('./cutout-geometry.js') : globalRoot.CutoutGeometry;
  const { resolveBacksplash, resolveCurb, resolveWallPanel, resolveIsland, resolveBarCounter } = isNode ? require('./attachment-geometry.js') : globalRoot.AttachmentGeometry;

  // Остров/барная стойка each have two UI variants (rectangular/figured,
  // standard/complex) that are never meant to coexist -- see
  // sayanmramor-calculator.html, where filling one variant's fields now
  // clears the other's. This is the geometry-side half of that guarantee:
  // even if both were somehow non-zero, only ONE ever becomes a 3D object,
  // picked by a fixed priority (first variant wins), the same pattern
  // already used for sink type priority in constructor-state.js.
  function pickActiveVariant(primary, secondary) {
    if (primary.widthM > 0 && primary.lengthM > 0) return primary;
    if (secondary.widthM > 0 && secondary.lengthM > 0) return secondary;
    return primary;
  }

  function buildGeometryModel(state) {
    const { widthM, lengthM } = state.dimensions;
    const productKey = state.product ? state.product.key : null;

    // wing is only promoted from ConstructorState's raw {widthM,lengthM}
    // (always present, possibly zero) to a real geometry element once both
    // dimensions are actually filled in -- see
    // docs/superpowers/specs/2026-09-21-3d-visualizer-design.md.
    const wing = state.shape === 'lshape' && state.wing.widthM > 0 && state.wing.lengthM > 0
      ? { widthM: state.wing.widthM, lengthM: state.wing.lengthM, corner: state.corner }
      : null;

    const sink = resolveSinkCutout(state.additionalWorks.sink, widthM, lengthM);

    return {
      // 'steps'/'floor' tell three-scene.js to build a fundamentally
      // different mesh (a staircase profile / a thin plate) instead of the
      // single countertop-style slab every other product uses -- see
      // buildProductGroup(). Neither changes state/pricing, purely which
      // rendering path three-scene.js takes.
      productKey,
      shape: wing ? 'lshape' : 'straight',
      widthM, lengthM,
      wing,
      visualThicknessM: productKey === 'pol' ? VISUAL_FALLBACK_FLOOR_THICKNESS_M : VISUAL_FALLBACK_THICKNESS_M,
      // The product's own default camera angle -- see PRODUCTS[key].cameraPreset
      // in product-types.js. Falls back to 'iso' whenever a product hasn't set
      // one (or no product is selected yet), matching ThreeScene's own generic
      // fallback for an unrecognized preset name.
      cameraPreset: (state.product && state.product.cameraPreset) || 'iso',
      edge: { type: state.edge.type, lengthMm: state.edge.lengthMm },
      sink,
      cooktop: resolveCooktopCutout(state.additionalWorks.cooktop, widthM, lengthM),
      holes: resolveHoles(state.holeCounts, widthM, lengthM, sink),
      backsplash: resolveBacksplash(state.backsplash),
      curb: resolveCurb(state.curbLengthM),
      wallPanel: resolveWallPanel(state.wallPanel),
      // Island faces the main segment's own LENGTH run, offset along WIDTH
      // -- see attachment-geometry.js. Bar counter extends past one
      // LENGTH-end instead, so the two can never occupy the same space.
      island: resolveIsland(pickActiveVariant(state.island.standard, state.island.figured), widthM),
      barCounter: resolveBarCounter(pickActiveVariant(state.barCounter.standard, state.barCounter.complex), lengthM),
    };
  }

  return { buildGeometryModel };
});
