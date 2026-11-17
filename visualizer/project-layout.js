// visualizer/project-layout.js
//
// A project's products in one 3D scene (the owner, 2026-11-17): a showcase -- in a row along the run
// (Z), PROJECT_GAP_M apart, their backs (the wall side, min X) on one line, each standing on one
// floor by its own floor level. Everything is placed relative to the anchor -- the product the
// client is editing -- which stays where it is (offset [0, 0, 0]), so its 3D (camera, sizes, rooms)
// works as it does alone.
//
// Pure (no three.js). items: [{ bounds: { min, max }, floorY }] in the project's order.
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.ProjectLayout = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {

  const globalRoot = typeof window !== 'undefined' ? window : globalThis;
  const { PROJECT_GAP_M } = (typeof module !== 'undefined' && module.exports) ? require('./constants.js') : globalRoot.VisualizerConstants;

  // -> { offsets: [[dx, dy, dz]...], union: { min, max } }
  function arrange(items, anchorIndex) {
    let cursor = 0;
    const raw = items.map(({ bounds, floorY }) => {
      const dz = cursor - bounds.min[2];
      cursor = bounds.max[2] + dz + PROJECT_GAP_M;
      return [-bounds.min[0], -floorY, dz];
    });
    const anchor = raw[anchorIndex] || [0, 0, 0];
    const offsets = raw.map(o => o.map((v, k) => v - anchor[k]));
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    items.forEach(({ bounds }, i) => {
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k], bounds.min[k] + offsets[i][k]);
        max[k] = Math.max(max[k], bounds.max[k] + offsets[i][k]);
      }
    });
    return { offsets, union: { min, max } };
  }

  return { arrange };
});
