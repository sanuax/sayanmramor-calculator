// visualizer/cutout-geometry.js
//
// Pure placement/size resolution for sink, cooktop and hole cutouts. No
// Three.js import -- unit-testable without a WebGL context.
//
// Plan frame (shared with attachment-geometry.js and scene-layout.js):
//   xM -- across the DEPTH, from the wall edge (0) to the room edge (widthM)
//   zM -- along the RUN, from the run's start (0) to its end (lengthM)
// There is no real position input for any cutout (constructor-state.js
// only carries counts), so every position below is a deterministic
// presentation heuristic, tagged source:'fallback' -- the same state always
// yields the same layout, and nothing here is presented as a measurement.
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
    VISUAL_FALLBACK_SINK_CUTOUT_SIZE_M, VISUAL_FALLBACK_COOKTOP_CUTOUT_SIZE_M, VISUAL_FALLBACK_HOLE_RADIUS_M,
    VISUAL_FALLBACK_FAUCET_GAP_M, VISUAL_FALLBACK_DISPENSER_OFFSET_M, VISUAL_FALLBACK_HOLE_EDGE_MARGIN_M,
    VISUAL_FALLBACK_CUTOUT_GAP_M, VISUAL_FALLBACK_CUTOUT_FRONT_MARGIN_M, SINK_CORNER_MARGIN_M,
  } = (typeof module !== 'undefined' && module.exports) ? require('./constants.js') : globalRoot.VisualizerConstants;

  const R = VISUAL_FALLBACK_HOLE_RADIUS_M;
  const EDGE = VISUAL_FALLBACK_HOLE_EDGE_MARGIN_M;
  // Depth needed between the sink's wall-side edge and the wall for a faucet.
  const FAUCET_CLEARANCE_M = VISUAL_FALLBACK_FAUCET_GAP_M + 2 * R + EDGE;

  function clamp(v, lo, hi) {
    return Math.min(Math.max(v, lo), Math.max(lo, hi));
  }

  // Keeps a cut (size AND position) inside the slab it is cut into. Only
  // engages for a slab smaller than the fallback cutout itself.
  function clampCutoutToSlab(point, sizeM, widthM, lengthM) {
    const w = Math.max(0, Math.min(sizeM.widthM, widthM));
    const l = Math.max(0, Math.min(sizeM.lengthM, lengthM));
    return {
      xM: clamp(point.xM, w / 2, widthM - w / 2),
      zM: clamp(point.zM, l / 2, lengthM - l / 2),
      widthM: w, lengthM: l,
    };
  }

  // Depth position: the sink moves just far enough toward the room to leave
  // the faucet a place behind it, never closer than the front margin. A
  // cooktop simply sits centred in the depth.
  function sinkDepthCenter(widthM, sizeM) {
    const wanted = Math.max(widthM / 2, sizeM.widthM / 2 + FAUCET_CLEARANCE_M);
    return Math.min(wanted, widthM - sizeM.widthM / 2 - VISUAL_FALLBACK_CUTOUT_FRONT_MARGIN_M);
  }

  // Run positions for the sink and the cooktop. Alone, each sits centred on
  // the run. Together they split the run 30/70 -- or, on a short run, are
  // packed around the centre with the minimum gap -- so they never overlap
  // whenever the run is long enough to hold both.
  function runCenters(lengthM, hasSink, hasCooktop) {
    const s = VISUAL_FALLBACK_SINK_CUTOUT_SIZE_M.lengthM;
    const c = VISUAL_FALLBACK_COOKTOP_CUTOUT_SIZE_M.lengthM;
    if (!(hasSink && hasCooktop)) return { sinkZ: lengthM / 2, cooktopZ: lengthM / 2 };
    let sinkZ = lengthM * 0.3;
    let cooktopZ = lengthM * 0.7;
    if (cooktopZ - sinkZ < (s + c) / 2 + VISUAL_FALLBACK_CUTOUT_GAP_M) {
      const total = s + VISUAL_FALLBACK_CUTOUT_GAP_M + c;
      const start = (lengthM - total) / 2;
      sinkZ = start + s / 2;
      cooktopZ = start + s + VISUAL_FALLBACK_CUTOUT_GAP_M + c / 2;
    }
    return { sinkZ, cooktopZ };
  }

  // ---- corners ----------------------------------------------------------
  // A sink never stands on a corner of the countertop: its cut keeps
  // SINK_CORNER_MARGIN_M from every vertex of the outline, outer and inner
  // (re-entrant) alike. The sink is only ever moved ALONG the run (the depth is
  // fixed by the faucet behind it), to the nearest spot that keeps the margin.
  //
  // Corners of the outline in the plan frame, from the main run (depth
  // widthM, run lengthM) and its wings ({ widthM: along the run, lengthM: out
  // from it, corner: 'left' | 'right' } -- as in GeometryModel.wings). A wing
  // at the 'left' end spans zM 0..width, one at the 'right' end
  // lengthM-width..lengthM, both on the room side (xM = widthM) of the run.
  function outlineCorners(widthM, lengthM, wings) {
    const has = side => (wings || []).find(w => w.corner === side && w.widthM > 0 && w.lengthM > 0);
    const left = has('left'), right = has('right');
    const pts = [[0, 0], [0, lengthM]];
    if (left) {
      pts.push([widthM + left.lengthM, 0], [widthM + left.lengthM, left.widthM]);
      if (left.widthM < lengthM) pts.push([widthM, left.widthM]);
    } else {
      pts.push([widthM, 0]);
    }
    if (right) {
      pts.push([widthM + right.lengthM, lengthM], [widthM + right.lengthM, lengthM - right.widthM]);
      if (right.widthM < lengthM) pts.push([widthM, lengthM - right.widthM]);
    } else {
      pts.push([widthM, lengthM]);
    }
    return pts;
  }

  function nearestCornerDistance(cut, corners) {
    let d = Infinity;
    corners.forEach(([px, pz]) => {
      const dx = Math.max(Math.abs(px - cut.xM) - cut.widthM / 2, 0);
      const dz = Math.max(Math.abs(pz - cut.zM) - cut.lengthM / 2, 0);
      d = Math.min(d, Math.max(dx, dz));   // square band: no corner within the margin of the cut on any side
    });
    return d;
  }

  // Run-wise gap between two cuts (negative when they overlap).
  function runGap(a, b) {
    return Math.abs(a.zM - b.zM) - (a.lengthM + b.lengthM) / 2;
  }

  const RUN_SEARCH_STEP_M = 0.005;
  const TOL = 1e-9;

  // Moves a cut along the run, from where it was wanted to the nearest spot that
  // keeps `corners` at `cornerMargin` and `obstacle` (another cut, optional) at
  // `obstacleGap`. If no spot has both: with an obstacle, the gap to it wins; else
  // the corners. If no spot keeps the margin at all (a run too short for it), the
  // spot farthest from the corners. The cut's size and depth position stay as given.
  // "Near a corner" is a square band: the largest of the x and z distances from the
  // cut's rectangle to the corner, so a sink a little off the front edge still keeps
  // the whole margin along the run.
  function slideAlongRun(cut, lengthM, corners, cornerMargin, obstacle, obstacleGap) {
    const lo = cut.lengthM / 2, hi = Math.max(lo, lengthM - cut.lengthM / 2);
    const at = zM => Object.assign({}, cut, { zM });
    const okCorners = z => nearestCornerDistance(at(z), corners) >= cornerMargin - TOL;
    const okObstacle = z => !obstacle || runGap(at(z), obstacle) >= obstacleGap - TOL;
    const want = clamp(cut.zM, lo, hi);
    const candidates = [want, hi];
    for (let z = lo; z < hi; z += RUN_SEARCH_STEP_M) candidates.push(z);
    const nearest = ok => {
      let best = null;
      candidates.forEach(z => {
        if (!ok(z)) return;
        if (best === null || Math.abs(z - want) < Math.abs(best - want) - TOL) best = z;
      });
      return best;
    };
    let z = nearest(z => okCorners(z) && okObstacle(z));
    // no spot has both: the cut must not overlap the other cut (the cooktop's case), else the
    // corners come first (the sink's)
    if (z === null && obstacle) z = nearest(okObstacle);
    if (z === null) z = nearest(okCorners);
    if (z === null) {
      let bestD = -Infinity;
      candidates.forEach(c => {
        const d = nearestCornerDistance(at(c), corners);
        if (d > bestD + TOL || (Math.abs(d - bestD) <= TOL && Math.abs(c - want) < Math.abs(z - want))) { bestD = d; z = c; }
      });
    }
    return z;
  }

  function resolveCutout(position, fallbackPoint, sizeM, widthM, lengthM) {
    const point = position
      ? { xM: position.xMm / 1000, zM: position.yMm / 1000, source: 'real' }
      : Object.assign({ source: 'fallback' }, fallbackPoint);
    const c = clampCutoutToSlab(point, sizeM, widthM, lengthM);
    return { xM: c.xM, zM: c.zM, widthM: c.widthM, lengthM: c.lengthM, source: point.source };
  }

  // options.cooktopPresent lets the sink make room for a cooktop on the same run.
  function resolveSinkCutout(sinkState, widthM, lengthM, options) {
    if (!sinkState || sinkState.count <= 0) return null;
    const size = VISUAL_FALLBACK_SINK_CUTOUT_SIZE_M;
    const { sinkZ } = runCenters(lengthM, true, !!(options && options.cooktopPresent));
    const fallback = { xM: sinkDepthCenter(widthM, size), zM: sinkZ };
    const cut = resolveCutout(sinkState.position, fallback, size, widthM, lengthM);
    // options.wings (GeometryModel.wings) say where the countertop's corners are. A spot --
    // the fallback one or a chosen (real) one -- that is nearer than SINK_CORNER_MARGIN_M to
    // a corner is slid along the run to the nearest spot that is not.
    const corners = outlineCorners(widthM, lengthM, options && options.wings);
    cut.zM = slideAlongRun(cut, lengthM, corners, SINK_CORNER_MARGIN_M, null, 0);
    return { type: sinkState.type, count: sinkState.count, cut };
  }

  // options.sinkCut (the sink as resolved above) is the cooktop's one obstacle: when the
  // sink was moved off a corner onto the cooktop's spot, the cooktop slides along the run
  // to keep the gap -- preferring a spot clear of the corners too. Otherwise it stays put.
  function resolveCooktopCutout(cooktopState, widthM, lengthM, options) {
    if (!cooktopState || cooktopState.count <= 0) return null;
    const size = VISUAL_FALLBACK_COOKTOP_CUTOUT_SIZE_M;
    const { cooktopZ } = runCenters(lengthM, !!(options && options.sinkPresent), true);
    const fallback = { xM: widthM / 2, zM: cooktopZ };
    const cut = resolveCutout(cooktopState.position, fallback, size, widthM, lengthM);
    const sinkCut = options && options.sinkCut;
    if (sinkCut && cut.source === 'fallback' && runGap(cut, sinkCut) < VISUAL_FALLBACK_CUTOUT_GAP_M - TOL) {
      const corners = outlineCorners(widthM, lengthM, options.wings);
      cut.zM = slideAlongRun(cut, lengthM, corners, SINK_CORNER_MARGIN_M, sinkCut, VISUAL_FALLBACK_CUTOUT_GAP_M);
    }
    return { count: cooktopState.count, cut };
  }

  function clampPointToSlab(xM, zM, widthM, lengthM) {
    const m = EDGE + R;
    return { xM: clamp(xM, m, widthM - m), zM: clamp(zM, m, lengthM - m) };
  }

  function circleHitsRect(p, cut, pad) {
    if (!cut) return false;
    return Math.abs(p.xM - cut.xM) < cut.widthM / 2 + R + pad
      && Math.abs(p.zM - cut.zM) < cut.lengthM / 2 + R + pad;
  }

  function hole(count, point) {
    return { count, position: { xM: point.xM, zM: point.zM, source: 'fallback' }, radiusM: R };
  }

  // Faucet: behind the sink, between its wall-side edge and the wall, on
  // the sink's own run position. If the depth is too shallow for that, it
  // moves beside the sink along the run instead -- never onto the sink.
  // Dispenser: same row as the faucet, offset along the run. Socket: near
  // the wall at the far end of the run, deliberately away from water and
  // clear of both cutouts. Without a sink, the faucet/dispenser row sits
  // near the wall in the middle of the run.
  function resolveHoles(holeCounts, widthM, lengthM, sink, cooktop) {
    const counts = holeCounts || {};
    const sinkCut = sink ? sink.cut : null;
    const cookCut = cooktop ? cooktop.cut : null;

    let faucet;
    if (sinkCut) {
      const behindX = sinkCut.xM - sinkCut.widthM / 2 - VISUAL_FALLBACK_FAUCET_GAP_M - R;
      faucet = behindX - R >= EDGE
        ? { xM: behindX, zM: sinkCut.zM }
        : clampPointToSlab(sinkCut.xM, sinkCut.zM + sinkCut.lengthM / 2 + VISUAL_FALLBACK_FAUCET_GAP_M + R, widthM, lengthM);
    } else {
      faucet = clampPointToSlab(EDGE + R + 0.04, lengthM / 2, widthM, lengthM);
    }
    let dispenser = clampPointToSlab(faucet.xM, faucet.zM + VISUAL_FALLBACK_DISPENSER_OFFSET_M, widthM, lengthM);
    if (circleHitsRect(dispenser, sinkCut, 0.005)) {
      dispenser = clampPointToSlab(faucet.xM, faucet.zM - VISUAL_FALLBACK_DISPENSER_OFFSET_M, widthM, lengthM);
    }

    const socketCandidates = [
      clampPointToSlab(EDGE + R + 0.04, lengthM - 0.12, widthM, lengthM),
      clampPointToSlab(EDGE + R + 0.04, 0.12, widthM, lengthM),
      clampPointToSlab(widthM - EDGE - R - 0.04, lengthM - 0.12, widthM, lengthM),
    ];
    const socket = socketCandidates.find(p => !circleHitsRect(p, sinkCut, 0.01) && !circleHitsRect(p, cookCut, 0.01)) || socketCandidates[0];

    return {
      mixer: counts.mixer > 0 ? hole(counts.mixer, faucet) : null,
      socket: counts.socket > 0 ? hole(counts.socket, socket) : null,
      dispenser: counts.dispenser > 0 ? hole(counts.dispenser, dispenser) : null,
    };
  }

  return { resolveSinkCutout, resolveCooktopCutout, resolveHoles, outlineCorners };
});
