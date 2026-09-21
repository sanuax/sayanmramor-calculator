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
  const { VISUAL_FALLBACK_THICKNESS_M } = isNode ? require('./constants.js') : globalRoot.VisualizerConstants;
  const { resolveSinkCutout, resolveCooktopCutout, resolveHoles } = isNode ? require('./cutout-geometry.js') : globalRoot.CutoutGeometry;
  const { resolveBacksplash, resolveCurb, resolveIsland } = isNode ? require('./attachment-geometry.js') : globalRoot.AttachmentGeometry;

  function buildGeometryModel(state) {
    const { widthM, lengthM } = state.dimensions;

    // wing is only promoted from ConstructorState's raw {widthM,lengthM}
    // (always present, possibly zero) to a real geometry element once both
    // dimensions are actually filled in -- see
    // docs/superpowers/specs/2026-09-21-3d-visualizer-design.md.
    const wing = state.shape === 'lshape' && state.wing.widthM > 0 && state.wing.lengthM > 0
      ? { widthM: state.wing.widthM, lengthM: state.wing.lengthM, corner: state.corner }
      : null;

    return {
      shape: wing ? 'lshape' : 'straight',
      widthM, lengthM,
      wing,
      visualThicknessM: VISUAL_FALLBACK_THICKNESS_M,
      // The product's own default camera angle -- see PRODUCTS[key].cameraPreset
      // in product-types.js. Falls back to 'iso' whenever a product hasn't set
      // one (or no product is selected yet), matching ThreeScene's own generic
      // fallback for an unrecognized preset name.
      cameraPreset: (state.product && state.product.cameraPreset) || 'iso',
      edge: { type: state.edge.type, lengthMm: state.edge.lengthMm },
      sink: resolveSinkCutout(state.additionalWorks.sink, widthM),
      cooktop: resolveCooktopCutout(state.additionalWorks.cooktop, widthM),
      holes: resolveHoles(state.holeCounts, widthM),
      backsplash: resolveBacksplash(state.backsplash),
      curb: resolveCurb(state.curbLengthM),
      island: resolveIsland(state.island.standard, lengthM),
    };
  }

  return { buildGeometryModel };
});
