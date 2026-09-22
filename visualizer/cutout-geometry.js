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
    VISUAL_FALLBACK_FAUCET_GAP_M, VISUAL_FALLBACK_DISPENSER_OFFSET_M, VISUAL_FALLBACK_HOLE_EDGE_MARGIN_M,
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

  // Clamps a fallback cut (size AND position together, since a shrunk size
  // can also make the old fallback position invalid) so it never extends
  // past the slab it's cut into. There is no real cutout-size input
  // anywhere in the calculator, so the fallback size/position stay exactly
  // as they are for any normal-sized countertop; this only ever engages for
  // a slab smaller than the fallback cutout itself. Purely a geometric
  // safety net -- it invents no new real-world sink/cooktop measurement.
  function clampCutoutToSlab(point, sizeM, widthM, lengthM) {
    const clampedWidthM = Math.max(0, Math.min(sizeM.widthM, widthM));
    const clampedLengthM = Math.max(0, Math.min(sizeM.lengthM, lengthM));
    const xM = Math.min(Math.max(point.xM, clampedWidthM / 2), widthM - clampedWidthM / 2);
    const zM = Math.min(Math.max(point.zM, clampedLengthM / 2), lengthM - clampedLengthM / 2);
    return { xM, zM, widthM: clampedWidthM, lengthM: clampedLengthM };
  }

  function resolveCutout(position, sizeM, widthM, lengthM) {
    const point = resolvePoint(position, widthM, 0.5, VISUAL_FALLBACK_SINK_INSET_M);
    const clamped = clampCutoutToSlab(point, sizeM, widthM, lengthM);
    return { xM: clamped.xM, zM: clamped.zM, widthM: clamped.widthM, lengthM: clamped.lengthM, source: point.source };
  }

  function resolveSinkCutout(sinkState, widthM, lengthM) {
    if (!sinkState || sinkState.count <= 0) return null;
    return { type: sinkState.type, count: sinkState.count, cut: resolveCutout(sinkState.position, VISUAL_FALLBACK_SINK_CUTOUT_SIZE_M, widthM, lengthM) };
  }

  function resolveCooktopCutout(cooktopState, widthM, lengthM) {
    if (!cooktopState || cooktopState.count <= 0) return null;
    return { count: cooktopState.count, cut: resolveCutout(cooktopState.position, VISUAL_FALLBACK_COOKTOP_CUTOUT_SIZE_M, widthM, lengthM) };
  }

  // Each hole type gets its own default xFraction so mixer/socket/dispenser
  // don't all land on the exact same fallback point when several are
  // present at once -- there is no real position input for holes at all
  // today (ConstructorState.holeCounts carries only counts). Used only when
  // there's no sink to anchor near (see resolveHoles below).
  const HOLE_DEFAULTS = {
    mixer:     { xFraction: 0.5 },
    socket:    { xFraction: 0.85 },
    dispenser: { xFraction: 0.65 },
  };

  function clampPointToSlab(xM, zM, widthM, lengthM) {
    const m = VISUAL_FALLBACK_HOLE_EDGE_MARGIN_M;
    const x = Math.min(Math.max(xM, m), Math.max(m, widthM - m));
    const z = Math.min(Math.max(zM, m), Math.max(m, lengthM - m));
    return { xM: x, zM: z };
  }

  function resolveHole(holeType, count, widthM) {
    if (!count || count <= 0) return null;
    const { xFraction } = HOLE_DEFAULTS[holeType];
    return {
      count,
      position: resolvePoint(null, widthM, xFraction, VISUAL_FALLBACK_SINK_INSET_M),
      radiusM: VISUAL_FALLBACK_HOLE_RADIUS_M,
    };
  }

  // Смеситель и дозатор логически привязаны к зоне мойки (когда она есть) --
  // смеситель сразу за раковиной (дальше от переднего края, тем же центром
  // по ширине), дозатор рядом со смесителем со сдвигом в сторону, а не в
  // той же самой точке. Розетка сознательно НЕ привязана к мойке -- у неё
  // свой прежний угол независимо от sink. Без мойки все три остаются на
  // прежнем универсальном ряду (HOLE_DEFAULTS), т.к. привязываться не к
  // чему.
  function resolveSinkAnchoredHole(sink, xOffsetM, widthM, lengthM) {
    const behindZM = sink.cut.zM + sink.cut.lengthM / 2 + VISUAL_FALLBACK_FAUCET_GAP_M;
    const point = clampPointToSlab(sink.cut.xM + xOffsetM, behindZM, widthM, lengthM);
    return { xM: point.xM, zM: point.zM, source: 'fallback' };
  }

  function resolveHoles(holeCounts, widthM, lengthM, sink) {
    function resolveMixer() {
      if (!holeCounts.mixer || holeCounts.mixer <= 0) return null;
      const position = sink
        ? resolveSinkAnchoredHole(sink, 0, widthM, lengthM)
        : resolvePoint(null, widthM, HOLE_DEFAULTS.mixer.xFraction, VISUAL_FALLBACK_SINK_INSET_M);
      return { count: holeCounts.mixer, position, radiusM: VISUAL_FALLBACK_HOLE_RADIUS_M };
    }
    function resolveDispenser() {
      if (!holeCounts.dispenser || holeCounts.dispenser <= 0) return null;
      const position = sink
        ? resolveSinkAnchoredHole(sink, VISUAL_FALLBACK_DISPENSER_OFFSET_M, widthM, lengthM)
        : resolvePoint(null, widthM, HOLE_DEFAULTS.dispenser.xFraction, VISUAL_FALLBACK_SINK_INSET_M);
      return { count: holeCounts.dispenser, position, radiusM: VISUAL_FALLBACK_HOLE_RADIUS_M };
    }
    return {
      mixer: resolveMixer(),
      // Socket stays on the universal front row regardless of the sink --
      // deliberately not near water.
      socket: resolveHole('socket', holeCounts.socket, widthM),
      dispenser: resolveDispenser(),
    };
  }

  return { resolveSinkCutout, resolveCooktopCutout, resolveHoles };
});
