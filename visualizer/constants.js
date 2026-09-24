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

  // Plan frame used by every countertop cutout/attachment: widthM is the
  // DEPTH (wall edge -> room edge), lengthM is the RUN along the wall.
  // Cutout sizes below follow that frame: widthM across the depth, lengthM
  // along the run. No real size/position input exists for a sink, cooktop
  // or hole anywhere in the calculator (only counts) -- typical real-world
  // values, purely for a readable visual, never priced or shown as a spec.
  const VISUAL_FALLBACK_SINK_CUTOUT_SIZE_M = { widthM: 0.4, lengthM: 0.5 };
  const VISUAL_FALLBACK_COOKTOP_CUTOUT_SIZE_M = { widthM: 0.49, lengthM: 0.56 };
  // Real mixer/socket holes are ~35 mm across.
  const VISUAL_FALLBACK_HOLE_RADIUS_M = 0.0175;
  // Minimum run-wise gap kept between the sink and the cooktop.
  const VISUAL_FALLBACK_CUTOUT_GAP_M = 0.15;
  // Clearance between the sink's wall-side edge and the faucet hole.
  const VISUAL_FALLBACK_FAUCET_GAP_M = 0.035;
  // Run-wise offset of the soap dispenser from the faucet.
  const VISUAL_FALLBACK_DISPENSER_OFFSET_M = 0.1;
  // Minimum clearance between any hole's edge and the slab's edge.
  const VISUAL_FALLBACK_HOLE_EDGE_MARGIN_M = 0.02;
  // Minimum stone left in front of a cutout (room-side edge).
  const VISUAL_FALLBACK_CUTOUT_FRONT_MARGIN_M = 0.03;

  // Attachment sizes/placement with no real input: curb has only a real
  // length (no height/cross-section anywhere); island/bar counter have no
  // real position relative to the main countertop. Backsplash needs no
  // fallback here -- both its dimensions are real (see attachment-geometry.js).
  const VISUAL_FALLBACK_CURB_HEIGHT_M = 0.03;
  const VISUAL_FALLBACK_ISLAND_GAP_M = 0.9;
  // The bar counter continues the main run -- only a visible joint, not a
  // walkway, separates them.
  const VISUAL_FALLBACK_BAR_COUNTER_GAP_M = 0.01;
  // Floors render as a thin flat surface, not a full-thickness slab like a
  // countertop -- purely visual, same "no real thickness input" caveat as
  // VISUAL_FALLBACK_THICKNESS_M above.
  const VISUAL_FALLBACK_FLOOR_THICKNESS_M = 0.02;

  // Stairs/steps: the calculator has no step count, rise or tread-depth
  // input, so these are standard proportions used only to draw a readable
  // flight. Never shown as a spec.
  const VISUAL_STAIR_RISE_M = 0.17;
  const VISUAL_STAIR_TREAD_DEPTH_M = 0.3;
  const VISUAL_RISER_THICKNESS_M = 0.02;
  // Joint module for floor/wall/facade layouts that name a pattern but not a
  // tile size -- illustrates the chosen layout, not a real tile size.
  const VISUAL_LAYOUT_MODULE_M = 0.6;
  const VISUAL_LARGE_FORMAT_MODULE_M = 1.2;

  // View directions in the shared frame: X+ is the room/viewer side (the wall
  // a countertop, sill or panel is mounted on is at X-), Z runs along the
  // product's length, Y is up.
  const CAMERA_PRESETS = {
    top:   { direction: [0.0001, 1, 0] }, // near-vertical; wall side at the top of the screen
    front: { direction: [1, 0.22, 0.32] }, // slightly off-axis so a panel's thickness reads
    side:  { direction: [0, 0.3, 1] },
    iso:   { direction: [1, 0.8, 1] },
    // Per-product defaults (PRODUCTS[key].cameraPreset in product-types.js).
    'iso-high':      { direction: [1, 1.1, 0.75] }, // vanity countertop
    'iso-eye-level': { direction: [1, 0.65, 0.75] }, // kitchen countertop, standing eye line
    'front-high':    { direction: [1, 0.55, 0.25] }, // windowsill
    'iso-side-high': { direction: [1, 1.05, 1.25] }, // stairs/steps: profile of the flight, treads visible from above
  };

  return {
    VISUAL_FALLBACK_THICKNESS_M, CAMERA_PRESETS,
    VISUAL_FALLBACK_FAUCET_GAP_M, VISUAL_FALLBACK_DISPENSER_OFFSET_M, VISUAL_FALLBACK_HOLE_EDGE_MARGIN_M,
    VISUAL_FALLBACK_SINK_CUTOUT_SIZE_M, VISUAL_FALLBACK_COOKTOP_CUTOUT_SIZE_M, VISUAL_FALLBACK_HOLE_RADIUS_M,
    VISUAL_FALLBACK_CUTOUT_GAP_M, VISUAL_FALLBACK_CUTOUT_FRONT_MARGIN_M,
    VISUAL_FALLBACK_CURB_HEIGHT_M, VISUAL_FALLBACK_ISLAND_GAP_M, VISUAL_FALLBACK_BAR_COUNTER_GAP_M,
    VISUAL_FALLBACK_FLOOR_THICKNESS_M,
    VISUAL_STAIR_RISE_M, VISUAL_STAIR_TREAD_DEPTH_M, VISUAL_RISER_THICKNESS_M,
    VISUAL_LAYOUT_MODULE_M, VISUAL_LARGE_FORMAT_MODULE_M,
  };
});
