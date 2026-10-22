// visualizer/dimensions-3d.js
//
// «Размеры» in the 3D view: the sizes the client entered, drawn on the
// model as dimension lines -- each one beside the edge it measures, lifted
// off it by GAP, with extension lines back to the edge and its label in
// the middle, worded as on the page's size diagram («2400 мм»). Only sizes
// entered by the client are shown, each on geometry that has exactly that
// size; nothing the model only assumes (the thickness, a step's rise) is
// ever given as a size. A product whose drawing does not map plainly to its
// entered sizes (shaped sills, turning stairs, facades, fireplaces) shows
// none -- the button stays hidden.
//
// Pure (no three.js): dimensions in layout space (metres; wall = -X, room =
// +X, run = Z, up = +Y).
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.Dimensions3d = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {

  // From the measured edge to the dimension line, and how far extension
  // lines run past it.
  const GAP_M = 0.12;
  const OVERSHOOT_M = 0.03;

  const mm = m => Math.round(m * 1000);
  const labelFor = m => mm(m) + ' мм';

  function extentOf(outline) {
    const xs = outline.map(p => p[0]), zs = outline.map(p => p[1]);
    return { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
  }

  // A dimension of `valueM` measured from `a` to `b`, drawn `out` (a unit
  // direction away from the product) of them.
  function dim(valueM, a, b, out) {
    if (!(valueM > 0)) return null;
    const shift = p => [p[0] + out[0] * GAP_M, p[1] + out[1] * GAP_M, p[2] + out[2] * GAP_M];
    const past = p => [p[0] + out[0] * (GAP_M + OVERSHOOT_M), p[1] + out[1] * (GAP_M + OVERSHOOT_M), p[2] + out[2] * (GAP_M + OVERSHOOT_M)];
    const from = shift(a), to = shift(b);
    return {
      valueMm: mm(valueM), label: labelFor(valueM),
      measured: [a, b], line: [from, to],
      extensions: [[a, past(a)], [b, past(b)]],
      labelAt: [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2],
    };
  }

  // A rectangular top seen from the room: its run along the room-side
  // edge (with wings, whose tops lie along that side, along the back edge,
  // lifted above it), its depth across an end (the end without a wing, if
  // any).
  function topDims(model, layout) {
    const main = layout.parts.find(p => p.name === 'main' && p.role === 'stone' && p.outline);
    if (!main) return [];
    const e = extentOf(main.outline), y = main.y1;
    const wings = layout.parts.filter(p => p.name === 'wing' && p.role === 'stone').map(w => ({ part: w, e: extentOf(w.outline) }));
    const wingAt = z => wings.some(w => Math.abs(w.e.z0 - z) < 1e-6 || Math.abs(w.e.z1 - z) < 1e-6);
    const out = [wings.length
      ? dim(model.lengthM, [e.x0, y, e.z0], [e.x0, y, e.z1], [0, 1, 0])
      : dim(model.lengthM, [e.x1, y, e.z0], [e.x1, y, e.z1], [1, 0, 0])];
    if (!wingAt(e.z1)) out.push(dim(model.widthM, [e.x0, y, e.z1], [e.x1, y, e.z1], [0, 0, 1]));
    else if (!wingAt(e.z0)) out.push(dim(model.widthM, [e.x0, y, e.z0], [e.x1, y, e.z0], [0, 0, -1]));
    (model.wings || []).forEach((w, i) => {
      const wing = wings[i];
      if (!wing) return;
      const we = wing.e, wy = wing.part.y1;
      // The wing at the +Z end faces -Z (toward the kitchen); its length
      // runs out into the room along its front, its width across its end.
      const faceMinusZ = we.z1 > (e.z0 + e.z1) / 2;
      const zf = faceMinusZ ? we.z0 : we.z1;
      out.push(dim(w.lengthM, [we.x0, wy, zf], [we.x1, wy, zf], [0, 0, faceMinusZ ? -1 : 1]));
      out.push(dim(w.widthM, [we.x1, wy, we.z0], [we.x1, wy, we.z1], [1, 0, 0]));
    });
    return out;
  }

  function floorDims(model, layout) {
    const part = layout.parts.find(p => p.role === 'floor' && p.outline) || layout.parts.find(p => p.outline);
    if (!part) return [];
    const b = layout.bounds, y = b.max[1];
    return [
      dim(model.lengthM, [b.max[0], y, b.min[2]], [b.max[0], y, b.max[2]], [1, 0, 0]),
      dim(model.widthM, [b.min[0], y, b.max[2]], [b.max[0], y, b.max[2]], [0, 0, 1]),
    ];
  }

  // An upright slab on the wall (a wall cladding, a panno): its height up
  // the end facing the viewer, its width along the top.
  function uprightDims(heightM, widthM, layout) {
    const b = layout.bounds, x = b.max[0];
    return [
      dim(heightM, [x, b.min[1], b.max[2]], [x, b.max[1], b.max[2]], [0, 0, 1]),
      dim(widthM, [x, b.max[1], b.min[2]], [x, b.max[1], b.max[2]], [0, 1, 0]),
    ];
  }

  // Steps and a straight stair: the lowest tread's length and depth at its
  // front; for a stair also its run along the floor.
  function stairDims(model, layout) {
    const treads = layout.parts.filter(p => p.name === 'tread' && p.outline);
    if (!treads.length) return [];
    const low = treads.reduce((a, t) => (t.y1 < a.y1 ? t : a));
    const e = extentOf(low.outline), y = low.y1;
    const kind = model.stairs && model.stairs.kind;
    const out = [];
    if (kind === 'steps') {
      out.push(dim(model.lengthM, [e.x1, y, e.z0], [e.x1, y, e.z1], [1, 0, 0]));
      out.push(dim(model.widthM, [e.x0, y, e.z1], [e.x1, y, e.z1], [0, 0, 1]));
    } else {
      const b = layout.bounds;
      out.push(dim(model.widthM, [e.x1, y, e.z0], [e.x1, y, e.z1], [1, 0, 0]));
      out.push(dim(model.lengthM, [b.min[0], b.min[1], b.max[2]], [b.max[0], b.min[1], b.max[2]], [0, 0, 1]));
    }
    return out;
  }

  // The dimensions for a model and its layout ([] = none to show).
  function build(model, layout) {
    if (!model || !layout || !layout.bounds) return [];
    let dims = [];
    switch (model.productKey) {
      case 'stoleshnitsa_kuhnya':
      case 'stoleshnitsa_vannaya':
        dims = topDims(model, layout);
        break;
      case 'podokonnik':
        if (model.sill && model.sill.variant === 'straight' && !model.sill.plan) dims = topDims(model, layout);
        break;
      case 'pol':
        dims = floorDims(model, layout);
        break;
      case 'stena':
        dims = uprightDims(model.lengthM, model.widthM, layout);
        break;
      case 'panno':
        dims = uprightDims(model.widthM, model.lengthM, layout);
        break;
      case 'stupeni': {
        const s = model.stairs;
        if (s && s.kind === 'steps' && s.variant === 'straight') dims = stairDims(model, layout);
        break;
      }
      case 'lestnitsa': {
        const plan = model.stairs && model.stairs.plan;
        if (plan && plan.marches === 1 && model.stairs.shape === 'straight') dims = stairDims(model, layout);
        break;
      }
      default:
        dims = [];
    }
    return dims.filter(Boolean);
  }

  return { GAP_M, OVERSHOOT_M, build, labelFor };
});
