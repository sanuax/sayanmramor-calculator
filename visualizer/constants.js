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
  };

  return { VISUAL_FALLBACK_THICKNESS_M, VISUAL_FALLBACK_SINK_INSET_M, CAMERA_PRESETS };
});
