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
    VISUAL_FALLBACK_CUTOUT_GAP_M, VISUAL_FALLBACK_CUTOUT_FRONT_MARGIN_M, CUTOUT_CORNER_MARGIN_M,
    VISUAL_FALLBACK_COOKTOP_DEPTH_SLACK_M, CUTOUT_MIN_SCALE,
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

  // A cut's size for a segment of this depth: the full size, or -- when the depth leaves less than the
  // slack around it -- scaled down (width and length alike) to what fits, never below CUTOUT_MIN_SCALE.
  // nominalLengthM is the full length: what an integrated sink is priced by, the drawing aside.
  const SINK_DEPTH_SLACK_M = VISUAL_FALLBACK_CUTOUT_FRONT_MARGIN_M + FAUCET_CLEARANCE_M;
  function fitSize(base, depthM, slackM) {
    const k = clamp((depthM - slackM) / base.widthM, CUTOUT_MIN_SCALE, 1);
    return { widthM: base.widthM * k, lengthM: base.lengthM * k, nominalLengthM: base.lengthM };
  }
  const fitSink = depthM => fitSize(VISUAL_FALLBACK_SINK_CUTOUT_SIZE_M, depthM, SINK_DEPTH_SLACK_M);
  const fitCooktop = depthM => fitSize(VISUAL_FALLBACK_COOKTOP_CUTOUT_SIZE_M, depthM, VISUAL_FALLBACK_COOKTOP_DEPTH_SLACK_M);
  // The run positions the sink and the cooktop want on a segment of this depth and run length.
  function runWants(depthM, runM, hasSink, hasCooktop) {
    return runCenters(runM, hasSink, hasCooktop, fitSink(depthM).lengthM, fitCooktop(depthM).lengthM);
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
  function runCenters(lengthM, hasSink, hasCooktop, sinkLengthM, cooktopLengthM) {
    const s = sinkLengthM;
    const c = cooktopLengthM;
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

  // ---- corners and wings ------------------------------------------------
  // A sink or a cooktop never stands on a corner of the countertop: its cut keeps
  // CUTOUT_CORNER_MARGIN_M from every vertex of the outline, outer and inner
  // (re-entrant) alike. It is first looked for on the main run, sliding along it to
  // the nearest spot that keeps the margin; when the main run has none, on a wing
  // (a Г/П countertop's wing is a countertop segment of its own, turned a quarter);
  // when nothing keeps the margin, the spot farthest from the corners.
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

  // Distance from a cut's rectangle to the nearest corner: a square band, the larger of the
  // x and z distances, so a cut a little off the front edge still keeps the whole margin
  // along the run.
  function nearestCornerDistance(cut, corners) {
    let d = Infinity;
    corners.forEach(([px, pz]) => {
      const dx = Math.max(Math.abs(px - cut.xM) - cut.widthM / 2, 0);
      const dz = Math.max(Math.abs(pz - cut.zM) - cut.lengthM / 2, 0);
      d = Math.min(d, Math.max(dx, dz));
    });
    return d;
  }

  // Free space between two cuts' rectangles (negative when they overlap).
  function cutGap(a, b) {
    return Math.max(Math.abs(a.xM - b.xM) - (a.widthM + b.widthM) / 2, Math.abs(a.zM - b.zM) - (a.lengthM + b.lengthM) / 2);
  }

  const RUN_SEARCH_STEP_M = 0.005;
  const TOL = 1e-9;

  // The cut of `size` (widthM across, lengthM along its segment's run) at run position r of a segment:
  //   main run  -- r is zM, `depthM` is xM from the wall;
  //   a wing    -- r is the distance from the joint along the wing (xM = widthM + r), `depthM` the
  //                distance from the wing's own wall (zM 0 for the left wing, lengthM for the right
  //                one); the cut is turned: its x extent is the size's length, its z extent its width.
  // alongM stays the extent along the segment's run, onWing says which wing (null: the main run).
  const along = size => (size.nominalLengthM != null ? size.nominalLengthM : size.lengthM);
  function cutOnMain(size, depthM, r) {
    return { xM: depthM, zM: r, widthM: size.widthM, lengthM: size.lengthM, alongM: along(size), onWing: null };
  }
  function cutOnWing(size, wing, widthM, lengthM, depthM, r) {
    return {
      xM: widthM + r, zM: wing.corner === 'left' ? depthM : lengthM - depthM,
      widthM: size.lengthM, lengthM: size.widthM, alongM: along(size), onWing: wing.corner,
    };
  }

  // Looks along one segment for the spot nearest to `want` (a run position) where `make(r)` keeps
  // ctx.corners at ctx.margin and ctx.obstacle (another cut, optional) at ctx.gap. Returns the r,
  // or null. With `strict` that is all; without it, a run with no such spot falls back: to a spot
  // clear of the obstacle (when there is one), then to one clear of the corners, then to the one
  // farthest from the corners.
  function findSpot(make, lo, hi, want, ctx, strict) {
    hi = Math.max(lo, hi);
    const w = clamp(want, lo, hi);
    const candidates = [w, hi];
    for (let r = lo; r < hi; r += RUN_SEARCH_STEP_M) candidates.push(r);
    const okCorners = r => nearestCornerDistance(make(r), ctx.corners) >= ctx.margin - TOL;
    const okObstacle = r => !ctx.obstacle || cutGap(make(r), ctx.obstacle) >= ctx.gap - TOL;
    const nearest = ok => {
      let best = null;
      candidates.forEach(r => {
        if (!ok(r)) return;
        if (best === null || Math.abs(r - w) < Math.abs(best - w) - TOL) best = r;
      });
      return best;
    };
    let r = nearest(r => okCorners(r) && okObstacle(r));
    if (r !== null || strict) return r;
    if (ctx.obstacle) r = nearest(okObstacle);
    if (r === null) r = nearest(okCorners);
    if (r === null) {
      let bestD = -Infinity;
      candidates.forEach(c => {
        const d = nearestCornerDistance(make(c), ctx.corners);
        if (d > bestD + TOL || (Math.abs(d - bestD) <= TOL && Math.abs(c - w) < Math.abs(r - w))) { bestD = d; r = c; }
      });
    }
    return r;
  }

  // Where a cut goes: `main` is the fallback/chosen cut on the main run (its xM stays), `wingDepth(w)` the
  // depth position on a wing of width w, `wingRun(l)` the wanted run position on a wing of length l (the
  // sink and the cooktop share a wing's run the way they share the main one), `allowWings` false for a chosen (real) position. The main run first;
  // then each wing the cut fits on; else the best the main run can do.
  function placeCut(main, sizeFor, wingDepth, wingRun, widthM, lengthM, wings, ctx, allowWings) {
    const ms = { widthM: main.widthM, lengthM: main.lengthM, nominalLengthM: main.alongM };   // the main run's cut, as clamped to a small slab
    const mainSpot = strict => findSpot(r => cutOnMain(ms, main.xM, r), ms.lengthM / 2, lengthM - ms.lengthM / 2, main.zM, ctx, strict);
    let r = mainSpot(true);
    if (r !== null) return Object.assign(main, cutOnMain(ms, main.xM, r));
    if (allowWings) {
      const list = (wings || []).filter(w => w.widthM > 0 && w.lengthM > 0);
      for (const wing of list) {
        const size = sizeFor(wing.widthM);   // sized for the wing's own depth
        if (wing.widthM < size.widthM - TOL || wing.lengthM < size.lengthM - TOL) continue;
        const depth = wingDepth(wing.widthM, size);
        const make = rr => cutOnWing(size, wing, widthM, lengthM, depth, rr);
        const rw = findSpot(make, size.lengthM / 2, wing.lengthM - size.lengthM / 2, wingRun(wing), ctx, true);
        if (rw !== null) return Object.assign(main, make(rw));
      }
    }
    r = mainSpot(false);
    return Object.assign(main, cutOnMain(ms, main.xM, r));
  }

  function resolveCutout(position, fallbackPoint, sizeM, widthM, lengthM) {
    const point = position
      ? { xM: position.xMm / 1000, zM: position.yMm / 1000, source: 'real' }
      : Object.assign({ source: 'fallback' }, fallbackPoint);
    const c = clampCutoutToSlab(point, sizeM, widthM, lengthM);
    const alongM = sizeM.nominalLengthM != null ? Math.min(sizeM.nominalLengthM, lengthM) : c.lengthM;
    return { xM: c.xM, zM: c.zM, widthM: c.widthM, lengthM: c.lengthM, alongM, onWing: null, source: point.source };
  }

  // options.cooktopPresent lets the sink make room for a cooktop on the same run;
  // options.wings (GeometryModel.wings) tell where the countertop's corners and wings are. A
  // spot -- the fallback one or a chosen (real) one -- nearer than CUTOUT_CORNER_MARGIN_M to a
  // corner is slid along the run to the nearest spot that is not; when the main run has none,
  // the sink goes to a wing (a chosen position stays on the main run).
  function resolveSinkCutout(sinkState, widthM, lengthM, options) {
    if (!sinkState || sinkState.count <= 0) return null;
    const cookPresent = !!(options && options.cooktopPresent);
    const size = fitSink(widthM);
    const { sinkZ } = runWants(widthM, lengthM, true, cookPresent);
    const fallback = { xM: sinkDepthCenter(widthM, size), zM: sinkZ };
    const wings = options && options.wings;
    const ctx = { corners: outlineCorners(widthM, lengthM, wings), margin: CUTOUT_CORNER_MARGIN_M, obstacle: null, gap: 0 };
    const main = resolveCutout(sinkState.position, fallback, size, widthM, lengthM);
    const cut = placeCut(main, fitSink, (w, sz) => sinkDepthCenter(w, sz), wing => runWants(wing.widthM, wing.lengthM, true, cookPresent).sinkZ, widthM, lengthM, wings, ctx, main.source === 'fallback');
    return { type: sinkState.type, count: sinkState.count, cut };
  }

  // options.sinkCut (the sink as resolved above) is the cooktop's obstacle: it keeps the gap to it
  // and, like the sink, the margin from every corner -- on the main run if there is a place, else on
  // a wing. A chosen (real) position is left as it is.
  function resolveCooktopCutout(cooktopState, widthM, lengthM, options) {
    if (!cooktopState || cooktopState.count <= 0) return null;
    const sinkPresent = !!(options && options.sinkPresent);
    const size = fitCooktop(widthM);
    const { cooktopZ } = runWants(widthM, lengthM, sinkPresent, true);
    const fallback = { xM: widthM / 2, zM: cooktopZ };
    const wings = options && options.wings;
    const cut = resolveCutout(cooktopState.position, fallback, size, widthM, lengthM);
    if (cut.source === 'fallback') {
      const ctx = { corners: outlineCorners(widthM, lengthM, wings), margin: CUTOUT_CORNER_MARGIN_M,
        obstacle: (options && options.sinkCut) || null, gap: VISUAL_FALLBACK_CUTOUT_GAP_M };
      placeCut(cut, fitCooktop, w => w / 2, wing => runWants(wing.widthM, wing.lengthM, sinkPresent, true).cooktopZ, widthM, lengthM, wings, ctx, true);
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
  // A sink on a wing (turned a quarter) keeps its faucet behind it toward the wing's own wall, the
  // dispenser beside along the wing; the points stay inside that wing.
  function resolveHoles(holeCounts, widthM, lengthM, sink, cooktop, wings) {
    const counts = holeCounts || {};
    const sinkCut = sink ? sink.cut : null;
    const cookCut = cooktop ? cooktop.cut : null;

    const m = EDGE + R;
    const sinkWing = sinkCut && sinkCut.onWing ? (wings || []).find(w => w.corner === sinkCut.onWing) : null;
    const inWing = (p, w) => {
      const z0 = w.corner === 'left' ? 0 : lengthM - w.widthM;
      return { xM: clamp(p.xM, widthM + m, widthM + w.lengthM - m), zM: clamp(p.zM, z0 + m, z0 + w.widthM - m) };
    };

    let faucet, dispenser;
    if (sinkWing) {
      const towardWall = sinkWing.corner === 'left' ? -1 : 1;   // zM decreases toward the left wing's wall
      const g = VISUAL_FALLBACK_FAUCET_GAP_M + R;
      const behind = { xM: sinkCut.xM, zM: sinkCut.zM + towardWall * (sinkCut.lengthM / 2 + g) };
      const wallGap = sinkWing.corner === 'left' ? behind.zM - R : lengthM - behind.zM - R;
      faucet = wallGap >= EDGE - TOL ? behind : inWing({ xM: sinkCut.xM + sinkCut.widthM / 2 + g, zM: sinkCut.zM }, sinkWing);
      dispenser = inWing({ xM: faucet.xM + VISUAL_FALLBACK_DISPENSER_OFFSET_M, zM: faucet.zM }, sinkWing);
      if (circleHitsRect(dispenser, sinkCut, 0.005)) {
        dispenser = inWing({ xM: faucet.xM - VISUAL_FALLBACK_DISPENSER_OFFSET_M, zM: faucet.zM }, sinkWing);
      }
    } else if (sinkCut) {
      const behindX = sinkCut.xM - sinkCut.widthM / 2 - VISUAL_FALLBACK_FAUCET_GAP_M - R;
      faucet = behindX - R >= EDGE - TOL
        ? { xM: behindX, zM: sinkCut.zM }
        : clampPointToSlab(sinkCut.xM, sinkCut.zM + sinkCut.lengthM / 2 + VISUAL_FALLBACK_FAUCET_GAP_M + R, widthM, lengthM);
    } else {
      faucet = clampPointToSlab(EDGE + R + 0.04, lengthM / 2, widthM, lengthM);
    }
    if (!sinkWing) {
      dispenser = clampPointToSlab(faucet.xM, faucet.zM + VISUAL_FALLBACK_DISPENSER_OFFSET_M, widthM, lengthM);
      if (circleHitsRect(dispenser, sinkCut, 0.005)) {
        dispenser = clampPointToSlab(faucet.xM, faucet.zM - VISUAL_FALLBACK_DISPENSER_OFFSET_M, widthM, lengthM);
      }
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
