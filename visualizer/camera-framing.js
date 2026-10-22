// visualizer/camera-framing.js
//
// Pure camera fitting -- no Three.js import, unit-testable in Node.
//
// fitCamera() places a perspective camera looking along -direction at the
// centre of `bounds` (SceneLayout's product bounds: every stone part, bowl,
// cooktop, stair body -- never context like a wall), at the smallest
// distance where all 8 bounds corners fit inside the frustum with `padding`
// kept free on every side. Exact per-corner projection, not a bounding
// sphere, so a long thin countertop fills the frame instead of floating in
// empty space.
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.CameraFraming = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {

  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function norm(a) { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }

  function boundsCorners(bounds) {
    const { min, max } = bounds;
    const out = [];
    for (let i = 0; i < 8; i++) {
      out.push([i & 1 ? max[0] : min[0], i & 2 ? max[1] : min[1], i & 4 ? max[2] : min[2]]);
    }
    return out;
  }

  function boundsCenter(bounds) {
    return [0, 1, 2].map(i => (bounds.min[i] + bounds.max[i]) / 2);
  }

  // Orthonormal camera basis for a camera sitting at target + direction*d.
  function cameraBasis(direction) {
    const forward = norm([-direction[0], -direction[1], -direction[2]]);
    let right = cross(forward, [0, 1, 0]);
    if (Math.hypot(right[0], right[1], right[2]) < 1e-6) right = cross(forward, [0, 0, -1]);
    right = norm(right);
    const up = cross(right, forward);
    return { forward, right, up };
  }

  // params: bounds {min,max}, direction [x,y,z] (from target toward camera),
  // fovDeg (vertical), aspect (w/h), padding (fraction of the half-frame kept empty).
  function fitCamera({ bounds, direction, fovDeg, aspect, padding }) {
    const target = boundsCenter(bounds);
    const dir = norm(direction);
    const { forward, right, up } = cameraBasis(dir);
    const pad = Math.min(0.45, Math.max(0, padding || 0));
    const tanV = Math.tan((fovDeg * Math.PI) / 360) * (1 - pad);
    const tanH = tanV * (aspect > 0 ? aspect : 1);
    let distance = 0;
    boundsCorners(bounds).forEach(p => {
      const v = sub(p, target);
      const x = Math.abs(dot(v, right));
      const y = Math.abs(dot(v, up));
      const z = dot(v, forward); // positive = farther than the target
      distance = Math.max(distance, x / tanH - z, y / tanV - z);
    });
    distance = Math.max(distance, 0.3);
    return {
      target,
      distance,
      position: [target[0] + dir[0] * distance, target[1] + dir[1] * distance, target[2] + dir[2] * distance],
    };
  }

  // Does every bounds corner project inside the (unpadded) frustum of a
  // camera at `position` looking at `target`? Used by tests and as a
  // sanity check -- the fitted camera must never crop the product.
  function cornersInView({ bounds, position, target, fovDeg, aspect }) {
    const dir = norm(sub(position, target));
    const { forward, right, up } = cameraBasis(dir);
    const tanV = Math.tan((fovDeg * Math.PI) / 360);
    const tanH = tanV * aspect;
    return boundsCorners(bounds).every(p => {
      const v = sub(p, position);
      const depth = dot(v, forward);
      if (depth <= 0) return false;
      return Math.abs(dot(v, right)) <= depth * tanH + 1e-9 && Math.abs(dot(v, up)) <= depth * tanV + 1e-9;
    });
  }

  function boundsChanged(a, b, toleranceM) {
    if (!a || !b) return a !== b;
    const tol = toleranceM === undefined ? 0.005 : toleranceM;
    for (let i = 0; i < 3; i++) {
      if (Math.abs(a.min[i] - b.min[i]) > tol || Math.abs(a.max[i] - b.max[i]) > tol) return true;
    }
    return false;
  }

  // What the viewer should do with the camera after a new model arrives:
  //   'reset' -- first model, or a different product: that product's own
  //              default angle, framed to the new model;
  //   'refit' -- same product, but the model's size/extent changed: keep the
  //              angle the client is looking from, reframe the distance;
  //   'keep'  -- nothing that affects framing changed (e.g. a hole added).
  // A model that declares a different default angle than the last one
  // (a facade column after a facade wall) also gets that angle: 'reset'.
  // Presets not passed -> not compared (the behaviour before they existed).
  function decideCameraAction({ previousProductKey, nextProductKey, previousBounds, nextBounds, hasPrevious, previousPreset, nextPreset }) {
    if (!hasPrevious || previousProductKey !== nextProductKey) return 'reset';
    if (previousPreset && nextPreset && previousPreset !== nextPreset) return 'reset';
    return boundsChanged(previousBounds, nextBounds) ? 'refit' : 'keep';
  }

  // «Кромка»: a close look at the chosen edge profile. The slab is the
  // product's main one (or the lowest step, the one nearest the viewer); its
  // edge is the longest open one (not in `closed`) facing the viewer's usual
  // side (+X, +Z); the camera stands out from it near its end and looks back
  // along it from a little above, so the profile reads in cross-section with
  // the veins running over it. null when no part carries a chosen edge.
  const EDGE_VIEW_SIDE = [Math.SQRT1_2, Math.SQRT1_2];
  const EDGE_VIEW = { fromEnd: 0.15, inset: 0.025, out: 0.45, past: 0.5, up: 0.16 };
  function edgeCloseup(layout) {
    const slabs = ((layout && layout.parts) || []).filter(p => p.kind === 'prism' && p.role === 'stone' && p.outline && p.edge && p.edge !== 'apron');
    if (!slabs.length) return null;
    const slab = slabs.find(p => p.name === 'main') || slabs.reduce((a, b) => (b.y1 < a.y1 ? b : a));
    const pts = slab.outline, n = pts.length, closed = new Set(slab.closed || []);
    let area = 0;
    pts.forEach(([x1, z1], i) => { const [x2, z2] = pts[(i + 1) % n]; area += x1 * z2 - x2 * z1; });
    const s = area > 0 ? 1 : -1;
    let best = null;
    pts.forEach((p, i) => {
      if (closed.has(i)) return;
      const q = pts[(i + 1) % n];
      const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (len < 1e-6) return;
      const dir = [(q[0] - p[0]) / len, (q[1] - p[1]) / len];
      const out = [s * dir[1], -s * dir[0]];
      const score = len * (0.2 + Math.max(0, out[0] * EDGE_VIEW_SIDE[0] + out[1] * EDGE_VIEW_SIDE[1]));
      if (!best || score > best.score) best = { score, p, q, dir, out, len };
    });
    if (!best) return null;
    // The end on the viewer's side, and the way along the edge toward it.
    const toQ = best.dir[0] * EDGE_VIEW_SIDE[0] + best.dir[1] * EDGE_VIEW_SIDE[1] >= 0;
    const end = toQ ? best.q : best.p;
    const along = toQ ? best.dir : [-best.dir[0], -best.dir[1]];
    const back = Math.min(EDGE_VIEW.fromEnd, best.len / 2);
    const tx = end[0] - along[0] * back - best.out[0] * EDGE_VIEW.inset;
    const tz = end[1] - along[1] * back - best.out[1] * EDGE_VIEW.inset;
    const target = [tx, slab.y1, tz];
    const position = [
      tx + best.out[0] * EDGE_VIEW.out + along[0] * EDGE_VIEW.past,
      slab.y1 + EDGE_VIEW.up,
      tz + best.out[1] * EDGE_VIEW.out + along[1] * EDGE_VIEW.past,
    ];
    return { target, position, distance: Math.hypot(position[0] - tx, position[1] - slab.y1, position[2] - tz) };
  }

  return { fitCamera, cornersInView, boundsCorners, boundsCenter, boundsChanged, decideCameraAction, edgeCloseup };
});
