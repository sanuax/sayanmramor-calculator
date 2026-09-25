// product-parts.js
//
// The product as it is cut from stone: the constructor state -> a job for
// Pricing.calculatePrice / planMaterial:
//   { pieces: [...] }   separate stone parts with their real sizes and
//                       shapes (a piece's bounding rectangle for the layout
//                       on a slab, the real area of its shape for the price),
//   { surfaceAreaM2 }   a cladded surface, cut into whatever pieces the
//                       slabs give (floor, wall, panel, a facade's wall /
//                       plinth / cornice / belt / round column).
// Every size comes from the same geometry the 3D draws (GeometryModel), so
// the price counts exactly the stone that is shown.
//
// Piece: { key, label, group ('main' | 'riser'), lengthM, widthM, areaM2,
// count, seam } -- `seam`: the piece may be split along its length and
// joined with a seam when it does not fit one slab (as the Type A products
// always could).
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.ProductParts = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {

  const globalRoot = typeof window !== 'undefined' ? window : globalThis;
  const isNode = typeof module !== 'undefined' && module.exports;
  // Loaded after this file in the page -- looked up when used.
  const Geometry = () => (isNode ? require('./visualizer/geometry-model.js') : globalRoot.GeometryModel);

  function piece(key, label, lengthM, widthM, areaM2, count, extra) {
    return Object.assign({ key, label, group: 'main', lengthM, widthM, areaM2, count, seam: true }, extra || {});
  }

  // ---- step and tread shapes ---------------------------------------------

  // A radius step: L across, the entered depth D the deepest point (middle
  // of the front arc), the sides `bulge` shallower; the arc is the one the
  // 3D draws (a half sine), so the shape's area is L x edge + 2/pi x bulge x L.
  function radiusStepShape(plan) {
    const L = plan.treadLengthM, b = plan.bulgeM, e = plan.edgeDepthM;
    // Length of the front arc (for a riser following it), by its polyline.
    let arc = 0;
    const n = 64;
    for (let i = 0; i < n; i++) {
      const x0 = L * (i / n), x1 = L * ((i + 1) / n);
      const y0 = b * Math.sin(Math.PI * i / n), y1 = b * Math.sin(Math.PI * (i + 1) / n);
      arc += Math.hypot(x1 - x0, y1 - y0);
    }
    return { lengthM: L, widthM: e + b, areaM2: L * e + (2 / Math.PI) * b * L, frontM: arc };
  }

  // A wedge tread around a pivot (winder steps -- straight outer edge; spiral
  // stairs -- round outer edge): its bounding rectangle when laid with its
  // axis along the length, and its real area.
  function wedgeShape(plan, roundOuter) {
    const { rIn, rOut, angle } = plan;
    const half = angle / 2;
    const width = 2 * rOut * Math.sin(half);
    if (roundOuter) {
      return { lengthM: rOut - rIn * Math.cos(half), widthM: width, areaM2: half * (rOut * rOut - rIn * rIn) };
    }
    return { lengthM: (rOut - rIn) * Math.cos(half), widthM: width, areaM2: 0.5 * Math.sin(angle) * (rOut * rOut - rIn * rIn) };
  }

  // Wedge treads are cut in pairs, head to tail: a wedge (an isosceles
  // trapezoid, narrow end a, wide end b) and a second one turned 180° beside
  // it share their slanted edge, so the pair fits a rectangle as long as one
  // wedge and (a + 3b) / 2 wide -- instead of two wide ends, 2b (a = b: two
  // rectangles, 2b; a = 0: two triangles, 1.5b). The pair is one cut piece
  // (two steps' area); an odd step is cut on its own.
  function wedgePieces(plan, roundOuter, n, label) {
    const w = wedgeShape(plan, roundOuter);
    const half = plan.angle / 2;
    const narrow = 2 * plan.rIn * Math.sin(half);
    const pieces = [];
    const pairs = Math.floor(n / 2);
    if (pairs) pieces.push(piece('tread-pair', label + ' (пара)', w.lengthM, (narrow + 3 * w.widthM) / 2, 2 * w.areaM2, pairs, { steps: 2 }));
    if (n % 2) pieces.push(piece('tread', label, w.lengthM, w.widthM, w.areaM2, 1));
    return { pieces, stepAreaM2: w.areaM2 };
  }

  // ---- stairs ---------------------------------------------------------------

  // Treads, landings and risers of a flight stair from its plan: every
  // march's steps (tread = march width x derived depth) and every landing
  // (marches - 1 of them, sized by the plan). Risers: one under every step
  // and at the front of every landing, march width x riser height.
  function flightPieces(plan, riserHeightM) {
    const W = plan.treadLengthM, d = plan.treadDepthM;
    const steps = plan.flights.reduce((s, n) => s + n, 0);
    const pieces = [piece('tread', 'Ступень', W, d, W * d, steps)];
    (plan.landings || []).forEach((l, i) => {
      pieces.push(piece('landing', 'Площадка', l.widthM, l.lengthM, l.widthM * l.lengthM, 1, { index: i }));
    });
    if (riserHeightM > 0) {
      const risers = steps + (plan.landings || []).length;
      pieces.push(piece('riser', 'Подступенок', W, riserHeightM, W * riserHeightM, risers, { group: 'riser' }));
    }
    return pieces;
  }

  function stairJob(state, missing) {
    const G = Geometry();
    const cfg = state.productConfig.lestnitsa;
    const shape = cfg.shape;
    const plan = G.stairPlan('flight', shape, state.dimensions.lengthM, state.dimensions.widthM, state.stepCount);
    const riserH = cfg.risers ? cfg.riserHeightM : 0;
    if (cfg.risers && !(riserH > 0)) missing.push('riserHeight');
    if (shape === 'spiral') {
      const pieces = wedgePieces(plan, true, plan.count, 'Ступень').pieces;
      if (riserH > 0) pieces.push(piece('riser', 'Подступенок', plan.rOut - plan.rIn, riserH, (plan.rOut - plan.rIn) * riserH, plan.count, { group: 'riser' }));
      return { pieces, stairs: { marches: 0, landings: 0, steps: plan.count } };
    }
    return {
      pieces: flightPieces(plan, riserH),
      stairs: { marches: plan.marches, stepsPerMarch: plan.flights[0], landings: (plan.landings || []).length, steps: plan.count },
    };
  }

  function stepsJob(state, missing) {
    const G = Geometry();
    const variant = G.STEP_VARIANTS[state.subcategory.id] || 'straight';
    const plan = G.stairPlan('steps', variant, state.dimensions.lengthM, state.dimensions.widthM, state.stepCount);
    const n = plan.count;
    const cfg = state.productConfig.stupeni || {};
    const riserH = cfg.riser ? cfg.riserHeightM : 0;
    if (cfg.riser && !(riserH > 0)) missing.push('riserHeight');
    let tread, riserLength;
    if (variant === 'winder') {
      const wedges = wedgePieces(plan, false, n, 'Ступень');
      riserLength = plan.rOut - plan.rIn;
      const pieces = wedges.pieces;
      if (riserH > 0) pieces.push(piece('riser', 'Подступенок', riserLength, riserH, riserLength * riserH, n, { group: 'riser' }));
      return { pieces, stairs: { steps: n, stepAreaM2: wedges.stepAreaM2 } };
    } else if (variant === 'radius') {
      tread = radiusStepShape(plan);
      riserLength = tread.frontM;
    } else {
      tread = { lengthM: plan.treadLengthM, widthM: plan.treadDepthM, areaM2: plan.treadLengthM * plan.treadDepthM };
      riserLength = plan.treadLengthM;
    }
    const pieces = [piece('tread', 'Ступень', tread.lengthM, tread.widthM, tread.areaM2, n)];
    if (riserH > 0) pieces.push(piece('riser', 'Подступенок', riserLength, riserH, riserLength * riserH, n, { group: 'riser' }));
    return { pieces, stairs: { steps: n, stepAreaM2: tread.areaM2 } };
  }

  // ---- countertops and sills ------------------------------------------------

  // Г/П: the main run and its wing(s) are one product (one area, one price);
  // each wing is its own stone part joined to the run with a seam.
  function countertopJob(state) {
    const { widthM, lengthM } = state.dimensions;
    const pieces = [piece('main', 'Основной сегмент', lengthM, widthM, lengthM * widthM, 1)];
    const wings = state.shape === 'lshape' ? 1 : (state.shape === 'ushape' ? 2 : 0);
    if (wings && state.wing.widthM > 0 && state.wing.lengthM > 0) {
      pieces.push(piece('wing', 'Крыло', state.wing.lengthM, state.wing.widthM, state.wing.lengthM * state.wing.widthM, wings));
    }
    return { pieces };
  }

  const SILL_REQUIRED = {
    corner: ['sillArm'],
    bay: ['sillBayDepth', 'sillBayFront'],
    'bay-radius': ['sillBayDepth'],
  };

  function sillJob(state, missing) {
    const G = Geometry();
    const variant = G.SILL_VARIANTS[state.subcategory.id] || 'straight';
    const { widthM, lengthM } = state.dimensions;
    const cfg = state.productConfig.podokonnik || {};
    const plan = G.sillPlan(variant, widthM, lengthM, cfg);
    if (SILL_REQUIRED[variant] && !plan) {
      const has = { sillArm: cfg.armLengthM > widthM, sillBayDepth: cfg.bayDepthM > 0 && (variant !== 'bay-radius' || cfg.bayDepthM <= lengthM / 2), sillBayFront: cfg.bayFrontM > 0 && cfg.bayFrontM < lengthM };
      SILL_REQUIRED[variant].forEach(k => { if (!has[k]) missing.push(k); });
      return { pieces: [piece('main', 'Подоконник', lengthM, widthM, lengthM * widthM, 1)] };
    }
    if (!plan) return { pieces: [piece('main', 'Подоконник', lengthM, widthM, lengthM * widthM, 1)] };
    const labels = { main: 'Подоконник', arm: 'Второе плечо' };
    return { pieces: plan.pieces.map(p => piece(p.key, labels[p.key] || 'Подоконник', p.lengthM, p.widthM, p.areaM2, 1)) };
  }

  // ---- facades ------------------------------------------------------------------

  // The pieces of a piece-made facade product (the same surfaces its area
  // formula counts, facade-model.js); a wall, plinth, cornice, belt or a
  // round column is a cladded surface.
  function facadeJob(state) {
    const f = state.productConfig.fasad;
    if (!f || !f.complete) return { surfaceAreaM2: f ? f.areaM2 : 0 };
    const p = f.params, q = f.quantity;
    if (f.type === 'column' && f.form === 'square') {
      return { pieces: [piece('face', 'Грань колонны', p.height, p.side, p.height * p.side, 4 * q)] };
    }
    if (f.type === 'pilaster') {
      return { pieces: [
        piece('face', 'Лицевая грань', p.height, p.width, p.height * p.width, q),
        piece('side', 'Боковая грань', p.height, p.projection, p.height * p.projection, 2 * q),
      ] };
    }
    if (f.type === 'surround') {
      const across = p.openingWidth + 2 * p.frame;
      const horizontal = f.form === 'door' ? 1 : 2;
      return { pieces: [
        piece('head', 'Горизонтальная часть', across, p.frame, across * p.frame, horizontal * q),
        piece('jamb', 'Вертикальная часть', p.openingHeight, p.frame, p.openingHeight * p.frame, 2 * q),
      ] };
    }
    if (f.type === 'decor') {
      return { pieces: [piece('decor', 'Элемент', Math.max(p.width, p.height), Math.min(p.width, p.height), p.width * p.height, q)] };
    }
    return { surfaceAreaM2: f.areaM2 };
  }

  // ---- the job ----------------------------------------------------------------

  // { pieces | surfaceAreaM2, mainAreaM2, riserAreaM2, missing: [...], stairs }
  // `missing`: sizes the product's shape needs that are not entered yet
  // (the page asks for them instead of quoting a made-up shape).
  function buildJob(state) {
    const key = state.product ? state.product.key : null;
    const missing = [];
    let job;
    if (key === 'stupeni') job = stepsJob(state, missing);
    else if (key === 'lestnitsa') job = stairJob(state, missing);
    else if (key === 'stoleshnitsa_kuhnya' || key === 'stoleshnitsa_vannaya') job = countertopJob(state);
    else if (key === 'podokonnik') job = sillJob(state, missing);
    else if (key === 'fasad') job = facadeJob(state);
    else {
      // Полы, стены, панно: a surface. A radius wall is its arc (the width
      // field is «Длина дуги») x its height -- the radius shapes the arc.
      if (key === 'stena' && isRadiusWall(state)) {
        const radiusM = state.productConfig.stena ? state.productConfig.stena.radiusM : 0;
        if (!(radiusM > 0)) missing.push('wallRadius');
        else if (state.dimensions.widthM > 2 * Math.PI * radiusM) missing.push('wallArc');
      }
      job = { surfaceAreaM2: state.dimensions.widthM * state.dimensions.lengthM };
    }
    const areaOf = group => (job.pieces
      ? job.pieces.filter(p => p.group === group).reduce((s, p) => s + p.areaM2 * p.count, 0)
      : (group === 'main' ? job.surfaceAreaM2 : 0));
    return Object.assign(job, { mainAreaM2: areaOf('main'), riserAreaM2: areaOf('riser'), missing });
  }

  function isRadiusWall(state) {
    return !!(state.subcategory && state.subcategory.id === 'WALL-04');
  }

  return { buildJob, radiusStepShape, wedgeShape, wedgePieces, flightPieces };
});
