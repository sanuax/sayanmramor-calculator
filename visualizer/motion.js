// visualizer/motion.js
//
// How the 3D view moves between two states (the camera to a new view, the
// model to a new size): a critically damped spring. It starts from rest
// softly, never overshoots, and when the goal moves mid-way (a size typed
// digit by digit) it turns toward the new goal without a jump in position
// or speed. Pure (no three.js), unit-tested in Node.
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.Motion = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {

  // Stiffness: a move from rest is 98% done in about 0.65 s.
  const OMEGA = 9;
  // Frames further apart than this (a hidden tab, a slow phone) count as this
  // long, so a move never jumps to its end.
  const MAX_STEP_S = 0.1;

  // One step of dt seconds from value x, speed v, toward goal: the exact
  // critically damped solution, so the step size does not change the path.
  function springStep(x, v, goal, dt, omega) {
    const w = omega || OMEGA;
    const t = Math.min(Math.max(dt, 0), MAX_STEP_S);
    const d = x - goal;
    const k = (v + w * d) * t;
    const e = Math.exp(-w * t);
    return [goal + (d + k) * e, (v - w * k) * e];
  }

  // A set of values moving together (a camera: target, direction, distance).
  function createSpring(values) {
    return { x: values.slice(), v: values.map(() => 0), goal: values.slice() };
  }

  function retarget(spring, goal) {
    spring.goal = goal.slice();
  }

  // Advances the spring; true once every value is within `tolerance` of its
  // goal and nearly still -- then it sits exactly on the goal.
  function step(spring, dt, tolerance) {
    const tol = tolerance === undefined ? 1e-4 : tolerance;
    let settled = true;
    for (let i = 0; i < spring.x.length; i++) {
      const [x, v] = springStep(spring.x[i], spring.v[i], spring.goal[i], dt);
      spring.x[i] = x;
      spring.v[i] = v;
      if (Math.abs(x - spring.goal[i]) > tol || Math.abs(v) > tol * OMEGA) settled = false;
    }
    if (settled) {
      spring.x = spring.goal.slice();
      spring.v = spring.v.map(() => 0);
    }
    return settled;
  }

  // A fade over `duration` seconds: 0..1, eased at both ends.
  function fadeAt(elapsedS, durationS) {
    if (!(durationS > 0)) return 1;
    const t = Math.min(1, Math.max(0, elapsedS / durationS));
    return t * t * (3 - 2 * t);
  }

  return { OMEGA, MAX_STEP_S, springStep, createSpring, retarget, step, fadeAt };
});
