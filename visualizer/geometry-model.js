// visualizer/geometry-model.js
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.GeometryModel = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {

  const { VISUAL_FALLBACK_THICKNESS_M, VISUAL_FALLBACK_SINK_INSET_M } =
    (typeof module !== 'undefined' && module.exports) ? require('./constants.js') : root.VisualizerConstants;

  function resolvePlacement(position, widthM) {
    if (position) {
      return { xM: position.xMm / 1000, yM: position.yMm / 1000, source: 'real' };
    }
    // No real coordinate data exists anywhere in the calculator yet -- this
    // is a demonstration-only point, tagged so the renderer can draw it
    // differently from a confirmed position (see spec: "Sink/cooktop:
    // fallback placement is visually disclosed, not just undocumented").
    return { xM: widthM / 2, yM: VISUAL_FALLBACK_SINK_INSET_M, source: 'fallback' };
  }

  function buildGeometryModel(state) {
    const { widthM, lengthM } = state.dimensions;
    const sinkState = state.additionalWorks.sink;
    const cooktopState = state.additionalWorks.cooktop;

    return {
      shape: 'straight',
      widthM, lengthM,
      visualThicknessM: VISUAL_FALLBACK_THICKNESS_M,
      edge: { type: state.edge.type, lengthMm: state.edge.lengthMm },
      sink: sinkState.count > 0 ? {
        type: sinkState.type, count: sinkState.count,
        placement: resolvePlacement(sinkState.position, widthM),
      } : null,
      cooktop: cooktopState.count > 0 ? {
        count: cooktopState.count,
        placement: resolvePlacement(cooktopState.position, widthM),
      } : null,
    };
  }

  return { buildGeometryModel };
});
