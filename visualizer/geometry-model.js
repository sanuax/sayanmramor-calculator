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
  const {
    VISUAL_FALLBACK_THICKNESS_M, VISUAL_FALLBACK_FLOOR_THICKNESS_M,
    VISUAL_LAYOUT_MODULE_M, VISUAL_LARGE_FORMAT_MODULE_M, VISUAL_STAIR_TREAD_DEPTH_M, VISUAL_STAIR_RISE_M,
  } = isNode ? require('./constants.js') : globalRoot.VisualizerConstants;
  const { resolveSinkCutout, resolveCooktopCutout, resolveHoles } = isNode ? require('./cutout-geometry.js') : globalRoot.CutoutGeometry;
  const { resolveBacksplash, resolveCurb, resolveWallPanel, resolveIsland, resolveBarCounter } = isNode ? require('./attachment-geometry.js') : globalRoot.AttachmentGeometry;
  const FacadeModel = isNode ? require('../facade-model.js') : globalRoot.FacadeModel;

  // Остров/барная стойка each have two UI variants (rectangular/figured,
  // standard/complex) that are never meant to coexist -- see
  // sayanmramor-calculator.html, where filling one variant's fields now
  // clears the other's. This is the geometry-side half of that guarantee:
  // even if both were somehow non-zero, only ONE ever becomes a 3D object,
  // picked by a fixed priority (first variant wins), the same pattern
  // already used for sink type priority in constructor-state.js.
  function pickActiveVariant(primary, secondary, names) {
    if (primary.widthM > 0 && primary.lengthM > 0) return Object.assign({ variant: names[0] }, primary);
    if (secondary.widthM > 0 && secondary.lengthM > 0) return Object.assign({ variant: names[1] }, secondary);
    return Object.assign({ variant: names[0] }, primary);
  }

  // The selected 'type' row (rate-catalog.js PRODUCT_SUBCATEGORIES) decides
  // HOW the stone is drawn for stairs/steps/floors/walls/facades -- it carries
  // no rate (that catalog is display-only; a facade's area comes from its
  // own sizes, facade-model.js), and ids not listed here
  // fall back to the plain shape rather than a guessed one.
  const STEP_VARIANTS = { 'STEP-02': 'winder', 'STEP-03': 'radius' };
  const STAIR_SHAPES = {
    'STAIR-03': 'l', 'STAIR-04': 'l',
    'STAIR-05': 'u', 'STAIR-06': 'u',
    'STAIR-07': 'spiral', 'STAIR-08': 'spiral',
  };
  // "Ступени + подступенки" rows, plus the full-cladding/entrance rows.
  const STAIR_WITH_RISERS = ['STAIR-02', 'STAIR-04', 'STAIR-06', 'STAIR-08', 'STAIR-12', 'STAIR-13'];
  // Every type a client can pick draws differently: a joint layout
  // (pattern/moduleM), a floor motif (border/medallion), a wall/facade form
  // or a backlight. Presentation only -- none of this affects the price.
  const SURFACE_LAYOUTS = {
    'FLOOR-01': { pattern: 'grid', moduleM: VISUAL_LAYOUT_MODULE_M },
    'FLOOR-02': { pattern: 'diagonal', moduleM: VISUAL_LAYOUT_MODULE_M },
    'FLOOR-03': { pattern: 'grid', moduleM: VISUAL_LARGE_FORMAT_MODULE_M },
    'FLOOR-04': { pattern: 'grid', moduleM: VISUAL_LAYOUT_MODULE_M, motif: 'border' },
    'FLOOR-05': { pattern: 'diagonal', moduleM: VISUAL_LAYOUT_MODULE_M, motif: 'medallion' },
    'WALL-01': { pattern: 'grid', moduleM: VISUAL_LAYOUT_MODULE_M },
    'WALL-02': { pattern: 'panels', moduleM: VISUAL_LAYOUT_MODULE_M },
    'WALL-03': { pattern: 'grid', moduleM: VISUAL_LARGE_FORMAT_MODULE_M },
    'WALL-04': { pattern: 'grid', moduleM: VISUAL_LAYOUT_MODULE_M, form: 'radius' },
    'WALL-05': { pattern: 'grid', moduleM: VISUAL_LARGE_FORMAT_MODULE_M, light: true },
    // Facades: the joint grid of a clad wall/plinth. The facade's own form
    // and sizes are model.facade (buildFacade below), not a surface layout.
    'FACADE-01': { pattern: 'grid', moduleM: VISUAL_LAYOUT_MODULE_M },
    'FACADE-04': { pattern: 'grid', moduleM: VISUAL_LAYOUT_MODULE_M },
  };
  // Windowsill plan shapes and panel treatments, by the same 'type' row.
  const SILL_VARIANTS = { 'SILL-02': 'corner', 'SILL-03': 'bay', 'SILL-04': 'bay-radius', 'SILL-05': 'figured' };
  const PANEL_VARIANTS = { 'PANEL-02': 'framed', 'PANEL-03': 'inlay', 'PANEL-04': 'backlit' };

  // Client sizes -> the technical flight the 3D draws. One place for it: the
  // calculator's size diagram and hint read the same plan, so what the client
  // is told (e.g. "глубина одной ступени 300 мм") is what gets drawn.
  //
  // «Ступени» (kind 'steps') -- размер ОДНОЙ ступени:
  //   lengthM = длина ступени (поперёк), widthM = глубина ступени;
  //   a winder tread is a wedge around a pivot: its length runs out from the
  //   pivot and its depth is measured at mid-length.
  // «Лестницы» (kind 'flight') -- габариты лестницы:
  //   straight: lengthM = длина марша в плане, widthM = ширина марша,
  //             depth = length / count;
  //   Г / П:    lengthM = габарит вдоль первого марша ВКЛЮЧАЯ площадку
  //             (площадка = ширина марша), so depth = (length - width) / n1;
  //             the landing is not a step;
  //   spiral:   lengthM = диаметр лестницы, widthM = ширина ступени (от
  //             опоры до края); the turn per step follows the usual walking
  //             depth on the middle line.
  // Марши («Лестницы»): 1 to 6 marches of the same number of steps, joined
  // by landings -- landings = marches - 1 -- into ONE continuous way up
  // (stairPath): each landing is one rise above the last step of the march
  // below it and the next march starts from it. How the marches run:
  //   straight: all in one line, a landing (one march width deep) between;
  //   Г:        the first half of the marches in one line, a square corner
  //             landing turning 90°, the rest in the new direction;
  //   П:        the first half forward, a landing across both runs turning
  //             180°, the rest coming back beside them (U_FLIGHT_GAP_M apart).
  // None of these ever puts one march over another in plan. `count` is every
  // step of the stair; «Длина лестницы» is the whole first run, its
  // landings (and the turning landing) included.
  const MIN_TREAD_DEPTH_M = 0.05;
  const WINDER_PIVOT_M = 0.08;
  // П: the two runs go side by side with this gap between them; the turning
  // landing spans both runs and the gap.
  const U_FLIGHT_GAP_M = 0.1;
  // The default number of marches of each shape, and the numbers it can be
  // built with (a turn needs a march on each side of it).
  const STAIR_MARCHES = { straight: 1, l: 2, u: 2, spiral: 0 };
  const MARCH_RANGE = { straight: { min: 1, max: 6 }, l: { min: 2, max: 6 }, u: { min: 2, max: 6 } };
  function marchesFor(shape, requested) {
    const range = MARCH_RANGE[shape];
    if (!range) return 0;
    const n = Math.round(Number(requested));
    return Number.isFinite(n) && n >= range.min && n <= range.max ? n : STAIR_MARCHES[shape];
  }
  // Радиусная ступень: how far the front arc bows out past the side edges,
  // as a share of the step's full depth (the entered «Глубина ступени» is
  // the deepest point, at the middle of the arc), at most 12% of its length.
  const RADIUS_STEP_BULGE_SHARE = 0.35 / 1.35;
  function clampTurn(a) {
    return Math.min(Math.PI / 4.5, Math.max(Math.PI / 18, a));
  }

  // An outline wound with a positive signed area (as rect() in scene-layout).
  function ccw(pts) {
    let s = 0;
    pts.forEach(([x1, z1], i) => { const [x2, z2] = pts[(i + 1) % pts.length]; s += x1 * z2 - x2 * z1; });
    return s < 0 ? pts.slice().reverse() : pts;
  }

  // The way up a flight stair, in the 3D's plan frame (the first march
  // climbs toward X-, its width along Z, centred on z = 0): every march
  // (origin of its centre line, direction of travel, across, steps, tread
  // depth, `level` = rises below its first step) and every landing
  // (outline, `top` = its level in rises, the march it comes from and the
  // one it leads to, and its size). Levels are in rises: a march's k-th step
  // tops at level + k + 1.
  function stairPath(shape, flights, widthM, depthM) {
    const W = widthM, M = flights.length;
    const g1 = shape === 'straight' ? M : Math.ceil(M / 2);
    const add = (p, v, s) => [p[0] + v[0] * s, p[1] + v[1] * s];
    const neg = v => [-v[0], -v[1]];
    // A rectangle from the point `e` along `d` for `len`, across `a` from t0
    // to t1 -- wound the same way as every other outline of the scene.
    const rectAt = (e, d, a, len, t0, t1) => ccw([add(add(e, a, t0), d, 0), add(add(e, a, t0), d, len), add(add(e, a, t1), d, len), add(add(e, a, t1), d, 0)]);
    const marches = [], landings = [];
    let p = [0, 0], d = [-1, 0], a = [0, 1], level = 0;
    for (let i = 0; i < M; i++) {
      const n = flights[i];
      marches.push({ index: i, origin: p, dir: d, across: a, count: n, depth: depthM, level, width: W });
      const e = add(p, d, n * depthM);
      level += n;
      if (i === M - 1) break;
      const turn = shape !== 'straight' && i === g1 - 1 ? shape : 'straight';
      const top = level + 1;
      if (turn === 'u') {
        const acrossMin = -(1.5 * W + U_FLIGHT_GAP_M);
        landings.push({ index: i, from: i, to: i + 1, turn, top, edge: e, dir: d, across: a, alongM: W, acrossMin, acrossMax: W / 2,
          outline: rectAt(e, d, a, W, acrossMin, W / 2), lengthM: W, widthM: 2 * W + U_FLIGHT_GAP_M });
        p = add(e, a, -(W + U_FLIGHT_GAP_M));
        d = neg(d);
      } else {
        landings.push({ index: i, from: i, to: i + 1, turn, top, edge: e, dir: d, across: a, alongM: W, acrossMin: -W / 2, acrossMax: W / 2,
          outline: rectAt(e, d, a, W, -W / 2, W / 2), lengthM: W, widthM: W });
        if (turn === 'l') {
          const nd = neg(a);
          p = add(add(e, d, W / 2), a, -W / 2);
          a = d;
          d = nd;
        } else {
          p = add(e, d, W);
        }
      }
      level = top;
    }
    return { marches, landings, topLevel: level };
  }

  function stairPlan(kind, variant, lengthM, widthM, count, marchesRequested) {
    const n = Math.max(1, Math.round(count || 1));
    if (kind === 'steps') {
      if (variant === 'winder') {
        const rIn = WINDER_PIVOT_M, rOut = rIn + lengthM;
        return { count: n, rIn, rOut, angle: clampTurn(widthM / ((rIn + rOut) / 2)), treadLengthM: lengthM, treadDepthM: widthM };
      }
      // Радиусная: the front edge bows out in the middle; the entered depth
      // is the deepest point, the sides are `bulgeM` shallower.
      const bulgeM = variant === 'radius' ? Math.min(widthM * RADIUS_STEP_BULGE_SHARE, lengthM * 0.12) : 0;
      return { count: n, treadLengthM: lengthM, treadDepthM: widthM, edgeDepthM: widthM - bulgeM, bulgeM };
    }
    if (variant === 'spiral') {
      const rOut = Math.max(0.3, lengthM / 2);
      const rIn = Math.min(rOut - 0.1, Math.max(0.08, rOut - widthM));
      const rMid = (rIn + rOut) / 2;
      const angle = clampTurn(VISUAL_STAIR_TREAD_DEPTH_M / rMid);
      return { count: n, marches: 0, rIn, rOut, angle, treadLengthM: rOut - rIn, treadDepthM: angle * rMid };
    }
    // A flight stair: `count` steps in `marches` marches (the same number in
    // each; an uneven remainder goes to the first ones).
    const shape = MARCH_RANGE[variant] ? variant : 'straight';
    const M = Math.min(n, marchesFor(shape, marchesRequested));
    const flights = Array.from({ length: M }, (_, i) => Math.floor(n / M) + (i < n % M ? 1 : 0));
    // The first run -- «Длина лестницы» -- holds its marches' steps and the
    // landings along it (the turning landing included), each W deep.
    const g1 = shape === 'straight' ? M : Math.ceil(M / 2);
    const runSteps = flights.slice(0, g1).reduce((s, x) => s + x, 0);
    const runLandings = shape === 'straight' ? M - 1 : g1;
    const rawDepth = (lengthM - runLandings * widthM) / runSteps;
    const depth = Math.max(MIN_TREAD_DEPTH_M, rawDepth);
    const path = stairPath(shape, flights, widthM, depth);
    return {
      count: n, marches: M, flights, landings: path.landings, path,
      landingM: widthM, treadLengthM: widthM, treadDepthM: depth,
      flightGapM: shape === 'u' ? U_FLIGHT_GAP_M : 0,
      // The entered length leaves room for every landing and a real tread.
      fits: rawDepth >= MIN_TREAD_DEPTH_M,
    };
  }

  // ---- windowsills: the plan of each type, from the client's sizes ------
  //
  // Local frame (as the 3D): the window wall at x = -W/2, the room toward
  // +X, the run along Z. W = «Глубина подоконника», L = its length along
  // the window. Every other size is the client's own (sill params):
  //   corner:      armLengthM -- the second arm along the second window,
  //                measured from the inner corner of the window line;
  //   bay:         bayDepthM (how far the bay goes out of the wall) and
  //                bayFrontM (the front window of the bay; the two side
  //                windows join it to the wall line);
  //   bay-radius:  bayDepthM -- the rise of the arc over the opening L.
  // Returns the outline, the window line and the stone parts the sill is
  // cut as (a corner sill: the main run and the arm, joined with a seam).
  function polygonArea(pts) {
    let a = 0;
    pts.forEach(([x1, z1], i) => { const [x2, z2] = pts[(i + 1) % pts.length]; a += x1 * z2 - x2 * z1; });
    return Math.abs(a) / 2;
  }

  function sillPlan(variant, W, L, params) {
    const p = params || {};
    const xw = -W / 2;
    if (variant === 'corner' && p.armLengthM > W) {
      const reach = p.armLengthM;
      const outline = [[xw, -L / 2], [W / 2, -L / 2], [W / 2, L / 2 - W], [xw + reach, L / 2 - W], [xw + reach, L / 2], [xw, L / 2]];
      return {
        outline, windowLine: [[xw, -L / 2], [xw, L / 2], [xw + reach, L / 2]], areaM2: polygonArea(outline),
        pieces: [
          { key: 'main', lengthM: L, widthM: W, areaM2: L * W },
          { key: 'arm', lengthM: reach - W, widthM: W, areaM2: (reach - W) * W },
        ],
      };
    }
    if (variant === 'bay' && p.bayDepthM > 0 && p.bayFrontM > 0 && p.bayFrontM < L) {
      const D = p.bayDepthM, F = p.bayFrontM;
      const bay = [[xw, -L / 2], [xw - D, -F / 2], [xw - D, F / 2], [xw, L / 2]];
      const outline = bay.concat([[W / 2, L / 2], [W / 2, -L / 2]]);
      return {
        outline, windowLine: bay, areaM2: polygonArea(outline),
        sideM: Math.hypot((L - F) / 2, D),
        pieces: [{ key: 'main', lengthM: L, widthM: W + D, areaM2: polygonArea(outline) }],
      };
    }
    if (variant === 'bay-radius' && p.bayDepthM > 0 && p.bayDepthM <= L / 2) {
      // A circular arc through both ends of the opening and D out at the middle.
      const D = p.bayDepthM;
      const R = (L * L / 4 + D * D) / (2 * D);
      const half = Math.asin(Math.min(1, L / 2 / R));
      const bay = [];
      const n = 24;
      for (let i = 0; i <= n; i++) {
        const a = -half + 2 * half * (i / n);
        bay.push([xw - (R * Math.cos(a) - (R - D)), R * Math.sin(a)]);
      }
      const outline = bay.concat([[W / 2, L / 2], [W / 2, -L / 2]]);
      return {
        outline, windowLine: bay, areaM2: polygonArea(outline), radiusM: R,
        pieces: [{ key: 'main', lengthM: L, widthM: W + D, areaM2: polygonArea(outline) }],
      };
    }
    if (variant === 'figured') {
      // Фигурный: a shaped room-side edge -- fuller in the middle, drawn in
      // at both ends -- against an ordinary straight window. The entered
      // width is the sill's full depth; the slab piece is the L x W
      // rectangle it is cut from.
      const A = Math.min(W * 0.3, 0.1);
      const front = [];
      const n = 16;
      for (let i = 0; i <= n; i++) {
        const z = -L / 2 + L * (i / n);
        front.push([W / 2 - A + A * Math.cos(Math.PI * 2 * z / L), z]);
      }
      const outline = [[xw, -L / 2]].concat(front, [[xw, L / 2]]);
      return { outline, windowLine: null, areaM2: polygonArea(outline), pieces: [{ key: 'main', lengthM: L, widthM: W, areaM2: L * W }] };
    }
    return null;
  }

  // Радиусная стена: the wall's run is an arc of radius R, `arcM` long (the
  // entered «Длина дуги»). Chord and rise (sag) follow from them.
  function radiusWallPlan(radiusM, arcM) {
    if (!(radiusM > 0) || !(arcM > 0) || arcM > 2 * Math.PI * radiusM) return null;
    const angle = arcM / radiusM;
    return {
      radiusM, arcM, angle,
      chordM: angle >= 2 * Math.PI - 1e-9 ? 0 : 2 * radiusM * Math.sin(angle / 2),
      // How far the arc stands off its chord (past half a circle: more than R).
      sagM: radiusM * (1 - Math.cos(angle / 2)),
    };
  }

  // The rise from step to step: with risers whose height the client entered,
  // that riser under a tread of the drawn thickness -- so the 3D's riser is
  // exactly the entered one; otherwise the usual rise.
  function riseFor(risers, riserHeightM) {
    return risers && riserHeightM > 0 ? riserHeightM + VISUAL_FALLBACK_THICKNESS_M : VISUAL_STAIR_RISE_M;
  }

  function buildStairs(productKey, state) {
    const id = state.subcategory ? state.subcategory.id : null;
    if (productKey === 'stupeni') {
      // Type A: the entered size is ONE tread (see pricing.js) -- drawn as a
      // short illustrative flight of identical treads.
      const variant = STEP_VARIANTS[id] || 'straight';
      const cfg = (state.productConfig && state.productConfig.stupeni) || {};
      const risers = !!cfg.riser;
      const riserHeightM = risers ? cfg.riserHeightM || 0 : 0;
      return {
        kind: 'steps',
        variant,
        risers, riserHeightM, riseM: riseFor(risers, riserHeightM),
        // The client's «Количество ступеней» -- drawn exactly.
        count: state.stepCount,
        plan: stairPlan('steps', variant, state.dimensions.lengthM, state.dimensions.widthM, state.stepCount),
      };
    }
    if (productKey === 'lestnitsa') {
      // Type B: the entered size is the cladded flight (width x run).
      const shape = STAIR_SHAPES[id] || 'straight';
      const cfg = state.productConfig && state.productConfig.lestnitsa;
      const risers = STAIR_WITH_RISERS.includes(id);
      const riserHeightM = risers && cfg ? cfg.riserHeightM || 0 : 0;
      return {
        kind: 'flight', shape, risers, riserHeightM, riseM: riseFor(risers, riserHeightM), count: state.stepCount,
        plan: stairPlan('flight', shape, state.dimensions.lengthM, state.dimensions.widthM, state.stepCount, cfg ? cfg.marches : undefined),
      };
    }
    return null;
  }

  function buildSurface(productKey, state) {
    if (!['pol', 'stena', 'fasad'].includes(productKey)) return null;
    const id = state.subcategory ? state.subcategory.id : null;
    const layout = SURFACE_LAYOUTS[id] || { pattern: null, moduleM: null };
    if (layout.form !== 'radius') return layout;
    // Радиусная стена: «Радиус стены» and the width field as «Длина дуги».
    const stena = state.productConfig && state.productConfig.stena;
    return Object.assign({}, layout, { arc: radiusWallPlan(stena ? stena.radiusM : 0, state.dimensions.widthM) });
  }

  // The windowsill type and the client's own sizes of its shape.
  function buildSill(state) {
    const cfg = (state.productConfig && state.productConfig.podokonnik) || {};
    const variant = SILL_VARIANTS[typeId(state)] || 'straight';
    const params = { armLengthM: cfg.armLengthM || 0, bayDepthM: cfg.bayDepthM || 0, bayFrontM: cfg.bayFrontM || 0 };
    return { variant, params, plan: sillPlan(variant, state.dimensions.widthM, state.dimensions.lengthM, params) };
  }

  function typeId(state) {
    return state.subcategory ? state.subcategory.id : null;
  }

  // «Фасады»: what the 3D draws is exactly the client's type, form, sizes
  // and quantity (facade-model.js). Until every size is entered it shows the
  // form's placeholder sizes -- the page only redraws the 3D once they are
  // all in, so this is only a scene for a partial state, like the size
  // diagram's placeholder.
  function buildFacade(state) {
    const cfg = state.productConfig ? state.productConfig.fasad : null;
    const type = FacadeModel.getType(cfg ? cfg.typeId : typeId(state)) || FacadeModel.FACADE_TYPES[0];
    const form = FacadeModel.getForm(type, cfg ? cfg.form : null);
    const params = {};
    form.params.forEach(p => { params[p.key] = cfg && cfg.complete ? cfg.params[p.key] : p.placeholderMm / 1000; });
    return { type: type.key, form: form.id, params, quantity: cfg ? cfg.quantity : 1, cameraPreset: type.cameraPreset, placeholder: !(cfg && cfg.complete) };
  }

  // ---- «Камины»: one plan of stone plates for the 3D, the area and the cut --
  //
  // fireplace-model.js says what the client measures; this is where those
  // sizes become plates. Every stone part is a flat rectangular plate:
  //   face   -- the surface it covers, the priced area (face[0] x face[1]);
  //   box    -- the solid the 3D draws (center/size, metres).
  // Where two plates meet at a corner, one stops T short behind the other,
  // so no two faces ever share a plane (no flicker); its face is still the
  // full surface of that side, because the other plate's edge fills the
  // corner -- so the faces add up to exactly the model's formula and to the
  // stone the 3D shows. Frame as the facade's: the wall face at x = 0, the
  // fireplace standing out toward X+, its width along Z centred on 0, the
  // floor at y = 0. Sizes in metres (the model's own), no conversion.
  //
  // Loaded after this file in the page (if at all) -- looked up when used.
  // The plate thickness T is the model's (FireplaceModel.PLATE_THICKNESS_M):
  // one number for whether sizes fit and for how the plates are drawn.
  const Fireplace = () => (isNode ? require('../fireplace-model.js') : globalRoot.FireplaceModel);
  // How deep the dark firebox goes behind the fireplace's front.
  const FIREBOX_DEPTH_M = 0.3;
  // The glass of a closed firebox (облицовка короба).
  const FIREBOX_GLASS_M = 0.01;

  // A plate from its priced face and its solid (x0..x1, y0..y1, z0..z1).
  // `normal`: the axis the plate is thin along.
  function plate(key, label, face, normal, [x0, x1], [y0, y1], [z0, z1]) {
    return {
      key, label, count: 1,
      lengthM: Math.max(face[0], face[1]), widthM: Math.min(face[0], face[1]), areaM2: face[0] * face[1],
      normal, center: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], size: [x1 - x0, y1 - y0, z1 - z0],
    };
  }

  function visualBox(key, role, [x0, x1], [y0, y1], [z0, z1]) {
    return { key, role, center: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], size: [x1 - x0, y1 - y0, z1 - z0] };
  }

  // Портал: piers (стойки) b wide either side of the W x H opening, the
  // lintel (перемычка) h high over them, all d deep. The opening's reveals
  // and the lintel's underside are stone. With a shelf, a plate (Wo + 2o) x
  // (d + o) lies on top; without one, the lintel's top is a Wo x d plate that
  // covers the lintel's front and sides from above. The dark firebox is set
  // into the wall behind the opening (the wall is open there -- see
  // scene-layout.js), so every reveal is seen whole.
  function portalPlates(form, p, T) {
    const W = p.openingWidth, H = p.openingHeight, b = p.pierWidth, h = p.lintelHeight, d = p.depth;
    const zR = W / 2, zO = W / 2 + b, top = H + h;
    const shelf = form.id === 'with-shelf';
    const cap = shelf ? 0 : T;            // the top plate covers the lintel's upper edge
    const front = [d - T, d], back = [0, d - T];
    const plates = [
      plate('portal-pier-left', 'Лицевая стойка', [H, b], 'x', front, [0, H], [-zO, -zR]),
      plate('portal-pier-right', 'Лицевая стойка', [H, b], 'x', front, [0, H], [zR, zO]),
      plate('portal-pier-side-left', 'Боковина стойки', [H, d], 'z', back, [0, H], [-zO, -zO + T]),
      plate('portal-pier-side-right', 'Боковина стойки', [H, d], 'z', back, [0, H], [zO - T, zO]),
      plate('portal-opening-left', 'Откос проёма', [H, d], 'z', back, [0, H], [-zR - T, -zR]),
      plate('portal-opening-right', 'Откос проёма', [H, d], 'z', back, [0, H], [zR, zR + T]),
      plate('portal-lintel-front', 'Лицевая перемычка', [W + 2 * b, h], 'x', front, [H, top - cap], [-zO, zO]),
      plate('portal-lintel-side-left', 'Боковина перемычки', [h, d], 'z', back, [H, top - cap], [-zO, -zO + T]),
      plate('portal-lintel-side-right', 'Боковина перемычки', [h, d], 'z', back, [H, top - cap], [zO - T, zO]),
      plate('portal-lintel-bottom', 'Низ перемычки', [W, d], 'y', back, [H, H + T], [-zR, zR]),
    ];
    if (shelf) {
      const o = p.shelfProjection;
      plates.push(plate('portal-shelf', 'Полка', [W + 2 * b + 2 * o, d + o], 'y', [0, d + o], [top, top + T], [-zO - o, zO + o]));
    } else {
      plates.push(plate('portal-lintel-top', 'Верх перемычки', [W + 2 * b, d], 'y', [0, d], [top - T, top], [-zO, zO]));
    }
    return {
      plates,
      visual: [visualBox('firebox', 'metal', [-FIREBOX_DEPTH_M, 0], [0, H], [-zR, zR])],
      // The wall is open behind the opening, for the firebox set into it.
      wallOpening: { zMin: -zR, zMax: zR, yMin: 0, yMax: H, depthM: FIREBOX_DEPTH_M },
      extent: { widthM: W + 2 * b + (shelf ? 2 * p.shelfProjection : 0), heightM: top + (shelf ? T : 0), depthM: d + (shelf ? p.shelfProjection : 0) },
    };
  }

  // Облицовка короба: a front around the centred firebox (left, right, above
  // and -- when it does not start at the floor -- below) and two sides Db
  // deep; the box's top is not clad. The firebox sits behind the front,
  // glazed; its reveals are not stone.
  function claddingPlates(p, T) {
    const Wb = p.claddingWidth, Hb = p.claddingHeight, D = p.depth;
    const W = p.fireboxWidth, H = p.fireboxHeight, e = p.fireboxBottom;
    const zF = W / 2, zB = Wb / 2, front = [D - T, D], back = [0, D - T];
    const plates = [
      plate('cladding-front-left', 'Лицевая панель слева от топки', [Hb, (Wb - W) / 2], 'x', front, [0, Hb], [-zB, -zF]),
      plate('cladding-front-right', 'Лицевая панель справа от топки', [Hb, (Wb - W) / 2], 'x', front, [0, Hb], [zF, zB]),
      plate('cladding-front-top', 'Лицевая панель над топкой', [W, Hb - e - H], 'x', front, [e + H, Hb], [-zF, zF]),
    ];
    // A firebox from the floor has no panel under it -- never a zero-high plate.
    if (e > 0) plates.push(plate('cladding-front-bottom', 'Лицевая панель под топкой', [W, e], 'x', front, [0, e], [-zF, zF]));
    plates.push(
      plate('cladding-side-left', 'Боковина короба', [Hb, D], 'z', back, [0, Hb], [-zB, -zB + T]),
      plate('cladding-side-right', 'Боковина короба', [Hb, D], 'z', back, [0, Hb], [zB - T, zB]),
    );
    const fireboxBack = Math.max(0, D - T - FIREBOX_DEPTH_M);
    return {
      plates,
      visual: [
        visualBox('firebox', 'metal', [fireboxBack, D - T], [e, e + H], [-zF, zF]),
        visualBox('firebox-glass', 'glass', [D - T, D - T + FIREBOX_GLASS_M], [e, e + H], [-zF, zF]),
      ],
      wallOpening: null,
      extent: { widthM: Wb, heightM: Hb, depthM: D },
    };
  }

  // Подиум: the top covers the front and sides from above; the front covers
  // the sides' front edges. The back stands against the wall.
  function podiumPlates(p, T) {
    const L = p.length, D = p.depth, Hp = p.height, z = L / 2;
    return {
      plates: [
        plate('podium-top', 'Верх подиума', [L, D], 'y', [0, D], [Hp - T, Hp], [-z, z]),
        plate('podium-front', 'Лицевая грань подиума', [L, Hp], 'x', [D - T, D], [0, Hp - T], [-z, z]),
        plate('podium-side-left', 'Боковина подиума', [D, Hp], 'z', [0, D - T], [0, Hp - T], [-z, -z + T]),
        plate('podium-side-right', 'Боковина подиума', [D, Hp], 'z', [0, D - T], [0, Hp - T], [z - T, z]),
      ],
      visual: [],
      wallOpening: null,
      extent: { widthM: L, heightM: Hp, depthM: D },
    };
  }

  // { ok, type, form, plates, visual, areaM2, missing, violations, ... } --
  // fireplace-model.js alone decides whether the sizes make a fireplace,
  // plates included (its `plateRules`); a fireplace it rejects gets no
  // plates at all, never a clipped or impossible shape.
  function fireplacePlan(type, form, params) {
    const F = Fireplace();
    const T = F.PLATE_THICKNESS_M;
    const check = F.checkConstraints(type, form, params);
    if (!check.ok) {
      return {
        ok: false, type: type ? type.key : null, form: form ? form.id : null, thicknessM: T,
        plates: [], visual: [], areaM2: 0, wallOpening: null, extent: null,
        missing: check.missing, violations: check.violations,
      };
    }
    const built = type.key === 'portal' ? portalPlates(form, params, T)
      : type.key === 'cladding' ? claddingPlates(params, T)
        : podiumPlates(params, T);
    const areaM2 = built.plates.reduce((s, pl) => s + pl.areaM2 * pl.count, 0);
    return Object.assign({ ok: true, type: type.key, form: form.id, thicknessM: T, areaM2, missing: [], violations: [] }, built);
  }

  // «Камины» for the 3D: exactly the client's type, form and sizes once
  // they are all in and form a real fireplace; until then the form's
  // placeholder sizes (as a facade does) -- never a half-built one.
  function buildFireplace(state) {
    const F = Fireplace();
    const cfg = state.productConfig ? state.productConfig.kaminy : null;
    const type = F.getType(cfg ? cfg.typeId : typeId(state)) || F.FIREPLACE_TYPES[0];
    const form = F.getForm(type, cfg ? cfg.form : null);
    const own = cfg && cfg.complete ? fireplacePlan(type, form, cfg.params) : null;
    const placeholder = {};
    form.params.forEach(p => { placeholder[p.key] = p.placeholderMm / 1000; });
    const useOwn = !!(own && own.ok);
    return {
      type: type.key, form: form.id, params: useOwn ? cfg.params : placeholder,
      plan: useOwn ? own : fireplacePlan(type, form, placeholder),
      placeholder: !useOwn, cameraPreset: type.cameraPreset,
    };
  }

  function buildGeometryModel(state) {
    const { widthM, lengthM } = state.dimensions;
    const productKey = state.product ? state.product.key : null;
    const caps = (state.product && state.product.capabilities) || null;

    // wing is only promoted from ConstructorState's raw {widthM,lengthM}
    // (always present, possibly zero) to a real geometry element once both
    // dimensions are actually filled in -- see
    // docs/superpowers/specs/2026-09-21-3d-visualizer-design.md.
    // П-образная = the main run plus a wing at EACH end, both of the entered
    // wing size (the same wing fields as the L-shape; the corner choice only
    // applies to an L). `wing` stays the single L-shape wing it always was.
    const hasWingSize = state.wing.widthM > 0 && state.wing.lengthM > 0;
    const wingAt = corner => ({ widthM: state.wing.widthM, lengthM: state.wing.lengthM, corner });
    let wings = [];
    if (hasWingSize && state.shape === 'lshape') wings = [wingAt(state.corner)];
    if (hasWingSize && state.shape === 'ushape') wings = [wingAt('left'), wingAt('right')];
    const wing = state.shape === 'lshape' ? (wings[0] || null) : null;

    const hasSink = state.additionalWorks.sink && state.additionalWorks.sink.count > 0;
    const hasCooktop = state.additionalWorks.cooktop && state.additionalWorks.cooktop.count > 0;
    const sink = resolveSinkCutout(state.additionalWorks.sink, widthM, lengthM, { cooktopPresent: hasCooktop });
    const cooktop = resolveCooktopCutout(state.additionalWorks.cooktop, widthM, lengthM, { sinkPresent: hasSink });
    // Edge fields are read for every product (constructor-state.js), but an
    // edge only exists on products that support edge work.
    const edgeSupported = !caps || caps.supportsEdgeWork;
    const facade = productKey === 'fasad' ? buildFacade(state) : null;
    const fireplace = productKey === 'kaminy' ? buildFireplace(state) : null;
    // The bar counter first: the island keeps a walkway from it.
    const barCounter = resolveBarCounter(pickActiveVariant(state.barCounter.standard, state.barCounter.complex, ['standard', 'complex']), widthM, lengthM, wings);

    return {
      productKey,
      shape: wings.length === 2 ? 'ushape' : (wing ? 'lshape' : 'straight'),
      widthM, lengthM,
      wing,
      wings,
      visualThicknessM: productKey === 'pol' ? VISUAL_FALLBACK_FLOOR_THICKNESS_M : VISUAL_FALLBACK_THICKNESS_M,
      // The product's own default camera angle -- see PRODUCTS[key].cameraPreset
      // in product-types.js. Falls back to 'iso' whenever a product hasn't set
      // one (or no product is selected yet), matching ThreeScene's own generic
      // fallback for an unrecognized preset name.
      // A facade type declares its own angle (a column is read from an angle).
      cameraPreset: (facade && facade.cameraPreset) || (fireplace && fireplace.cameraPreset) || (state.product && state.product.cameraPreset) || 'iso',
      edge: edgeSupported ? { type: state.edge.type, lengthMm: state.edge.lengthMm } : { type: null, lengthMm: null },
      sink,
      cooktop,
      holes: resolveHoles(state.holeCounts, widthM, lengthM, sink, cooktop),
      backsplash: resolveBacksplash(state.backsplash),
      curb: resolveCurb(state.curbLengthM),
      wallPanel: resolveWallPanel(state.wallPanel),
      // Island faces the main segment's own LENGTH run, offset along WIDTH
      // -- see attachment-geometry.js. Bar counter extends past one
      // LENGTH-end instead, so the two can never occupy the same space.
      island: resolveIsland(pickActiveVariant(state.island.standard, state.island.figured, ['standard', 'figured']), widthM, lengthM, wings, barCounter),
      barCounter,
      stairs: buildStairs(productKey, state),
      surface: buildSurface(productKey, state),
      sill: productKey === 'podokonnik' ? buildSill(state) : null,
      panel: productKey === 'panno' ? { variant: PANEL_VARIANTS[typeId(state)] || 'plain' } : null,
      facade,
      fireplace,
    };
  }

  return {
    buildGeometryModel, stairPlan, stairPath, marchesFor, sillPlan, radiusWallPlan, polygonArea,
    fireplacePlan, FIREBOX_DEPTH_M,
    STAIR_SHAPES, STEP_VARIANTS, SILL_VARIANTS, STAIR_MARCHES, MARCH_RANGE, STAIR_WITH_RISERS, U_FLIGHT_GAP_M, MIN_TREAD_DEPTH_M,
  };
});
