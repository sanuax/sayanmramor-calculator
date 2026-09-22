// visualizer/constants.js
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.VisualizerConstants = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {

  // Rendering-only constants. None of these describe a real product
  // property -- see docs/superpowers/specs/2026-09-21-3d-visualizer-design.md
  // ("Thickness: real data vs. visual fallback"). Never display these
  // numbers to the client as if they were a real spec.
  const VISUAL_FALLBACK_THICKNESS_M = 0.04;
  // Distance from the FRONT edge for the sink/cooktop/holes fallback row.
  // Was 0.15 -- smaller than half the sink cutout's own length (0.4/2=0.2),
  // so clampCutoutToSlab() pushed every normal-sized countertop's sink to
  // sit with zero clearance flush against the front edge instead of the
  // clamp only ever engaging for a genuinely undersized slab. 0.3 leaves a
  // believable ~0.1m/~0.055m clearance for the sink/cooktop's own length.
  const VISUAL_FALLBACK_SINK_INSET_M = 0.3;
  // Гap behind the sink cutout (further from the front edge) where the
  // faucet/mixer hole sits -- a real faucet mounts behind the bowl, not on
  // top of its exact center.
  const VISUAL_FALLBACK_FAUCET_GAP_M = 0.05;
  // Sideways offset from the faucet for the soap dispenser -- same row
  // (behind the sink) as the faucet, not the identical point.
  const VISUAL_FALLBACK_DISPENSER_OFFSET_M = 0.08;
  // Minimum clearance kept between any hole marker's center and the slab's
  // own edge, purely so a clamped point never sits exactly on the boundary.
  const VISUAL_FALLBACK_HOLE_EDGE_MARGIN_M = 0.02;

  // Cutout sizes: no real width/length input exists for a sink/cooktop
  // cutout anywhere in the calculator (only a count) -- typical real-world
  // sizes, purely for a convincing visual, never priced.
  const VISUAL_FALLBACK_SINK_CUTOUT_SIZE_M = { widthM: 0.5, lengthM: 0.4 };
  const VISUAL_FALLBACK_COOKTOP_CUTOUT_SIZE_M = { widthM: 0.56, lengthM: 0.49 };
  const VISUAL_FALLBACK_HOLE_RADIUS_M = 0.01;

  // Attachment sizes/placement with no real input: curb has only a real
  // length (no height/cross-section anywhere); island/bar counter have no
  // real position relative to the main countertop. Backsplash needs no
  // fallback here -- both its dimensions are real (see attachment-geometry.js).
  const VISUAL_FALLBACK_CURB_HEIGHT_M = 0.03;
  const VISUAL_FALLBACK_ISLAND_GAP_M = 0.9;
  const VISUAL_FALLBACK_BAR_COUNTER_GAP_M = 0.9;
  // Floors render as a thin flat surface, not a full-thickness slab like a
  // countertop -- purely visual, same "no real thickness input" caveat as
  // VISUAL_FALLBACK_THICKNESS_M above.
  const VISUAL_FALLBACK_FLOOR_THICKNESS_M = 0.02;

  const CAMERA_PRESETS = {
    top:   { direction: [0, 1, 0.0001] }, // near-vertical avoids a degenerate up-vector
    front: { direction: [0, 0.3, 1] },
    side:  { direction: [1, 0.3, 0] },
    iso:   { direction: [1, 0.8, 1] },
    // Per-product-type default camera angles (see PRODUCTS[key].cameraPreset
    // in product-types.js and docs/superpowers/specs/2026-09-21-3d-visualizer-design.md,
    // "Per-product-type default camera preset"). First-pass approximations of
    // the requested angles -- expected to need visual tuning once seen
    // rendered, not final numbers. These extend the registry the four manual
    // view buttons already read from; they don't replace top/front/side/iso.
    'iso-high':      { direction: [1, 1.1, 1] },   // vanity countertop: iso, a bit more top-down than plain iso
    'iso-eye-level': { direction: [1, 0.6, 1] },   // kitchen countertop: iso, closer to a standing person's eye line
    'front-high':    { direction: [0, 0.6, 1] },   // windowsill: front, a bit more top-down than plain front
    'iso-side-high': { direction: [1.3, 0.7, 0.4] }, // stairs/steps: angled from the side to read step geometry
  };

  return {
    VISUAL_FALLBACK_THICKNESS_M, VISUAL_FALLBACK_SINK_INSET_M, CAMERA_PRESETS,
    VISUAL_FALLBACK_FAUCET_GAP_M, VISUAL_FALLBACK_DISPENSER_OFFSET_M, VISUAL_FALLBACK_HOLE_EDGE_MARGIN_M,
    VISUAL_FALLBACK_SINK_CUTOUT_SIZE_M, VISUAL_FALLBACK_COOKTOP_CUTOUT_SIZE_M, VISUAL_FALLBACK_HOLE_RADIUS_M,
    VISUAL_FALLBACK_CURB_HEIGHT_M, VISUAL_FALLBACK_ISLAND_GAP_M, VISUAL_FALLBACK_BAR_COUNTER_GAP_M,
    VISUAL_FALLBACK_FLOOR_THICKNESS_M,
  };
});
