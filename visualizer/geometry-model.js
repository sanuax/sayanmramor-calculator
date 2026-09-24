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
    VISUAL_LAYOUT_MODULE_M, VISUAL_LARGE_FORMAT_MODULE_M,
  } = isNode ? require('./constants.js') : globalRoot.VisualizerConstants;
  const { resolveSinkCutout, resolveCooktopCutout, resolveHoles } = isNode ? require('./cutout-geometry.js') : globalRoot.CutoutGeometry;
  const { resolveBacksplash, resolveCurb, resolveWallPanel, resolveIsland, resolveBarCounter } = isNode ? require('./attachment-geometry.js') : globalRoot.AttachmentGeometry;

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
  // HOW the stone is drawn for stairs/steps/floors/walls/facades -- it never
  // affects price (that catalog is display-only), and ids not listed here
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
    'FACADE-01': { pattern: 'grid', moduleM: VISUAL_LAYOUT_MODULE_M },
    'FACADE-02': { pattern: null, moduleM: null, form: 'surround' },
    'FACADE-03': { pattern: null, moduleM: null, form: 'columns' },
    'FACADE-04': { pattern: 'grid', moduleM: VISUAL_LAYOUT_MODULE_M, form: 'plinth' },
    'FACADE-05': { pattern: null, moduleM: null, form: 'cornice' },
  };
  // Windowsill plan shapes and panel treatments, by the same 'type' row.
  const SILL_VARIANTS = { 'SILL-02': 'corner', 'SILL-03': 'bay', 'SILL-04': 'bay-radius', 'SILL-05': 'figured' };
  const PANEL_VARIANTS = { 'PANEL-02': 'framed', 'PANEL-03': 'inlay', 'PANEL-04': 'backlit' };

  function buildStairs(productKey, state) {
    const id = state.subcategory ? state.subcategory.id : null;
    if (productKey === 'stupeni') {
      // Type A: the entered size is ONE tread (see pricing.js) -- drawn as a
      // short illustrative flight of identical treads.
      return {
        kind: 'steps',
        variant: STEP_VARIANTS[id] || 'straight',
        risers: !!(state.productConfig && state.productConfig.stupeni && state.productConfig.stupeni.riser),
      };
    }
    if (productKey === 'lestnitsa') {
      // Type B: the entered size is the cladded flight (width x run).
      return { kind: 'flight', shape: STAIR_SHAPES[id] || 'straight', risers: STAIR_WITH_RISERS.includes(id) };
    }
    return null;
  }

  function buildSurface(productKey, state) {
    if (!['pol', 'stena', 'fasad'].includes(productKey)) return null;
    const id = state.subcategory ? state.subcategory.id : null;
    return SURFACE_LAYOUTS[id] || { pattern: null, moduleM: null };
  }

  function typeId(state) {
    return state.subcategory ? state.subcategory.id : null;
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
      cameraPreset: (state.product && state.product.cameraPreset) || 'iso',
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
      island: resolveIsland(pickActiveVariant(state.island.standard, state.island.figured, ['standard', 'figured']), widthM, lengthM, wings),
      barCounter: resolveBarCounter(pickActiveVariant(state.barCounter.standard, state.barCounter.complex, ['standard', 'complex']), lengthM, wings),
      stairs: buildStairs(productKey, state),
      surface: buildSurface(productKey, state),
      sill: productKey === 'podokonnik' ? { variant: SILL_VARIANTS[typeId(state)] || 'straight' } : null,
      panel: productKey === 'panno' ? { variant: PANEL_VARIANTS[typeId(state)] || 'plain' } : null,
    };
  }

  return { buildGeometryModel };
});
