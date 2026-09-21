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
  const VISUAL_FALLBACK_SINK_INSET_M = 0.15;

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

  return { VISUAL_FALLBACK_THICKNESS_M, VISUAL_FALLBACK_SINK_INSET_M, CAMERA_PRESETS };
});
