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
  function decideCameraAction({ previousProductKey, nextProductKey, previousBounds, nextBounds, hasPrevious }) {
    if (!hasPrevious || previousProductKey !== nextProductKey) return 'reset';
    return boundsChanged(previousBounds, nextBounds) ? 'refit' : 'keep';
  }

  return { fitCamera, cornersInView, boundsCorners, boundsCenter, boundsChanged, decideCameraAction };
});
