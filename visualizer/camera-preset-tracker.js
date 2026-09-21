// visualizer/camera-preset-tracker.js
//
// Tracks the DEFAULT camera preset that "Reset View" returns to --
// deliberately kept free of any Three.js import so this state-machine
// property is unit-testable without a WebGL context, and deliberately
// separate from any "last viewed" concept: only a real product change (via
// setDefaultFromGeometryModel, called from ThreeScene.update()) may change
// what Reset View returns to. A manual camera move (ThreeScene.setView(),
// driven by the Top/Front/Side/Iso buttons) never touches this tracker, so
// it can never drift the default away from the current product's own
// declared cameraPreset. See docs/superpowers/specs/2026-09-21-3d-visualizer-design.md,
// "Per-product-type default camera preset".
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.CameraPresetTracker = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {

  function createCameraPresetTracker() {
    let defaultPreset = 'iso';
    return {
      setDefaultFromGeometryModel(geometryModel) {
        defaultPreset = (geometryModel && geometryModel.cameraPreset) || 'iso';
      },
      getDefaultPreset() {
        return defaultPreset;
      },
    };
  }

  return { createCameraPresetTracker };
});
