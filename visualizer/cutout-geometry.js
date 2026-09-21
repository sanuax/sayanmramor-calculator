// visualizer/cutout-geometry.js
//
// Pure placement/size resolution for sink, cooktop and hole cutouts. No
// Three.js import -- unit-testable without a WebGL context. Coordinates are
// plan-view: xM along width from the left edge, zM along length from the
// front edge (NOT the vertical Three.js Y axis, which is thickness/height).
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.CutoutGeometry = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {

  // NOTE: same reason as visualizer/geometry-model.js -- this factory
  // function does not close over the outer IIFE's `root` parameter.
  const globalRoot = typeof window !== 'undefined' ? window : globalThis;
  const {
    VISUAL_FALLBACK_SINK_INSET_M, VISUAL_FALLBACK_SINK_CUTOUT_SIZE_M,
    VISUAL_FALLBACK_COOKTOP_CUTOUT_SIZE_M, VISUAL_FALLBACK_HOLE_RADIUS_M,
  } = (typeof module !== 'undefined' && module.exports) ? require('./constants.js') : globalRoot.VisualizerConstants;

  function resolvePoint(position, widthM, xFraction, insetM) {
    if (position) {
      return { xM: position.xMm / 1000, zM: position.yMm / 1000, source: 'real' };
    }
    // No real coordinate input exists anywhere in the calculator yet -- a
    // demonstration-only point, tagged so the renderer never presents it as
    // a confirmed position.
    return { xM: widthM * xFraction, zM: insetM, source: 'fallback' };
  }

  function resolveCutout(position, sizeM, widthM) {
    const point = resolvePoint(position, widthM, 0.5, VISUAL_FALLBACK_SINK_INSET_M);
    return { xM: point.xM, zM: point.zM, widthM: sizeM.widthM, lengthM: sizeM.lengthM, source: point.source };
  }

  function resolveSinkCutout(sinkState, widthM) {
    if (!sinkState || sinkState.count <= 0) return null;
    return { type: sinkState.type, count: sinkState.count, cut: resolveCutout(sinkState.position, VISUAL_FALLBACK_SINK_CUTOUT_SIZE_M, widthM) };
  }

  function resolveCooktopCutout(cooktopState, widthM) {
    if (!cooktopState || cooktopState.count <= 0) return null;
    return { count: cooktopState.count, cut: resolveCutout(cooktopState.position, VISUAL_FALLBACK_COOKTOP_CUTOUT_SIZE_M, widthM) };
  }

  // Each hole type gets its own default xFraction so mixer/socket/dispenser
  // don't all land on the exact same fallback point when several are
  // present at once -- there is no real position input for holes at all
  // today (ConstructorState.holeCounts carries only counts).
  const HOLE_DEFAULTS = {
    mixer:     { xFraction: 0.5 },
    socket:    { xFraction: 0.85 },
    dispenser: { xFraction: 0.65 },
  };

  function resolveHole(holeType, count, widthM) {
    if (!count || count <= 0) return null;
    const { xFraction } = HOLE_DEFAULTS[holeType];
    return {
      count,
      position: resolvePoint(null, widthM, xFraction, VISUAL_FALLBACK_SINK_INSET_M),
      radiusM: VISUAL_FALLBACK_HOLE_RADIUS_M,
    };
  }

  function resolveHoles(holeCounts, widthM) {
    return {
      mixer: resolveHole('mixer', holeCounts.mixer, widthM),
      socket: resolveHole('socket', holeCounts.socket, widthM),
      dispenser: resolveHole('dispenser', holeCounts.dispenser, widthM),
    };
  }

  return { resolveSinkCutout, resolveCooktopCutout, resolveHoles };
});
