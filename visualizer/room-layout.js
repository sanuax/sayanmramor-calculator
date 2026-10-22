// visualizer/room-layout.js
//
// The room the product can be shown in (the viewer's «День» / «Вечер»; the
// default «Студия» is the plain studio, no room): a back wall and a floor,
// kitchen base cabinets under a kitchen countertop, a wall-hung vanity with
// drawers and a mirror under a bathroom one, a side wall along a stair. It
// only dresses the scene -- never priced, never in the request or the
// passport, never part of the bounds the camera frames.
//
// Pure (no three.js): boxes in layout space (metres; wall = -X, room = +X,
// run = Z, up = +Y) by role, and where the evening lamps hang. Sizes are
// usual furniture sizes, not anything the client entered.
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.RoomLayout = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {

  const MODES = ['studio', 'day', 'evening'];

  // Matte fronts, chosen to sit well with stone: the stone stays the
  // brightest, most detailed thing in view.
  const FACADES = [
    { id: 'white', name: 'Белый матовый', hex: '#e8e4dc' },
    { id: 'cashmere', name: 'Кашемир', hex: '#c3b6a2' },
    { id: 'sage', name: 'Шалфей', hex: '#8e9a85' },
    { id: 'graphite', name: 'Графит', hex: '#3c403e' },
    { id: 'navy', name: 'Глубокий синий', hex: '#2f3b4b' },
  ];

  const ROOM_COLORS = { wall: '#9a9184', floor: '#6e5c4a' };

  // The scene's lights per mode. «Студия» is the viewer's own studio light,
  // exactly as before. «День»: bright, slightly cool, as from a window.
  // «Вечер»: warm and low, the room lit by its lamps; `bounce` is the warm
  // light the room throws back onto the furniture fronts.
  const LIGHTS = {
    studio: {
      key: ['#ffefd9', 1.5], fill: ['#dde5ee', 0.45], rim: ['#ffe3c4', 1.3],
      hemi: ['#fff2e0', '#2b231c', 0.3], exposure: 0.9, bounce: null, lamp: null,
    },
    day: {
      key: ['#f7f5f0', 2.1], fill: ['#dbe6f5', 0.75], rim: ['#fff4e6', 0.7],
      hemi: ['#eef3fa', '#3b342d', 0.6], exposure: 1.0, bounce: null, lamp: null,
    },
    evening: {
      key: ['#ffbe85', 0.55], fill: ['#7f8fb3', 0.22], rim: ['#ffb070', 0.35],
      hemi: ['#ffdcb0', '#1a1512', 0.2], exposure: 0.9,
      bounce: ['#ffd2a0', 1.0, [1, 0.35, 0.25]], lamp: ['#ffcb8e', 2.2],
    },
  };

  const KITCHEN_HEIGHT_M = 0.9;
  const VANITY_HEIGHT_M = 0.85;
  const VANITY_UNIT_M = 0.5;       // a wall-hung unit's height
  const PLINTH_M = 0.1;
  const FRONT_SETBACK_M = 0.05;    // the top's overhang over the fronts' carcass
  const FRONT_M = 0.018;
  const GAP_M = 0.0015;            // half the gap between two fronts
  const MODULE_M = 0.6;

  const box = (role, x0, x1, y0, y1, z0, z1) => ({ role, min: [x0, y0, z0], max: [x1, y1, z1] });

  function extentOf(outline) {
    const xs = outline.map(p => p[0]), zs = outline.map(p => p[1]);
    return { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
  }

  // [a, b] split into modules of about MODULE_M.
  function modules(a, b) {
    const n = Math.max(1, Math.round((b - a) / MODULE_M)), w = (b - a) / n;
    return Array.from({ length: n }, (_, i) => [a + i * w, a + (i + 1) * w]);
  }

  // [a, b] without the stretches in `cut`.
  function without(a, b, cut) {
    let parts = [[a, b]];
    cut.forEach(([c0, c1]) => {
      parts = [].concat(...parts.map(([s, e]) => [[s, Math.min(e, c0)], [Math.max(s, c1), e]].filter(([x, y]) => y - x > 0.05)));
    });
    return parts;
  }

  // A cabinet body from y0 up to under the top -- hollow where a sink bowl
  // hangs into it (as a real sink cabinet is): its bottom part stops under
  // the bowl, two side panels close its ends up to the top.
  function carcass(boxes, layout, x0, x1, y0, yTop, z0, z1) {
    const bowls = layout.parts.filter(p => p.kind === 'basin');
    const bowlBottom = Math.min(...bowls.map(b => b.center[1] - b.size[1]));
    if (!bowls.length || !(bowlBottom < yTop)) {
      boxes.push(box('carcass', x0, x1, y0, yTop, z0, z1));
      return;
    }
    const low = Math.max(y0, bowlBottom - 0.02);
    if (low > y0) boxes.push(box('carcass', x0, x1, y0, low, z0, z1));
    boxes.push(box('carcass', x0, x1, low, yTop, z0, z0 + FRONT_M));
    boxes.push(box('carcass', x0, x1, low, yTop, z1 - FRONT_M, z1));
  }

  function backWallAndFloor(boxes, wallX, floorY, topY, b) {
    boxes.push(box('floor', wallX - 0.12, b.max[0] + 3, floorY - 0.03, floorY, b.min[2] - 2, b.max[2] + 2));
    boxes.push(box('wall', wallX - 0.12, wallX, floorY, topY, b.min[2] - 2, b.max[2] + 2));
  }

  // Kitchen: base cabinets on a plinth under the main run and under every
  // wing, fronts on the side facing the kitchen, set back under the top.
  function kitchen(layout) {
    const main = layout.parts.find(p => p.name === 'main' && p.role === 'stone');
    if (!main) return null;
    const e = extentOf(main.outline), top = main.y1, bottom = main.y0, floor = top - KITCHEN_HEIGHT_M;
    const boxes = [], lamps = [];
    backWallAndFloor(boxes, layout.bounds.min[0], floor, top + 1.6, layout.bounds);
    const wings = layout.parts.filter(p => p.name === 'wing' && p.role === 'stone').map(w => extentOf(w.outline));
    const atEnd = z => wings.some(w => Math.abs(w.z0 - z) < 1e-6 || Math.abs(w.z1 - z) < 1e-6);
    const z0 = e.z0 + (atEnd(e.z0) ? 0 : 0.02), z1 = e.z1 - (atEnd(e.z1) ? 0 : 0.02);
    const frontX = e.x1 - FRONT_SETBACK_M;
    boxes.push(box('plinth', e.x0, frontX - 0.04, floor, floor + PLINTH_M, z0, z1));
    carcass(boxes, layout, e.x0, frontX, floor + PLINTH_M, bottom, z0, z1);
    without(z0, z1, wings.map(w => [w.z0, w.z1])).forEach(([a, b]) => modules(a, b).forEach(([m0, m1]) => {
      boxes.push(box('front', frontX, frontX + FRONT_M, floor + PLINTH_M + 0.003, bottom - 0.003, m0 + GAP_M, m1 - GAP_M));
    }));
    wings.forEach(w => {
      // The wing's front faces the kitchen: -Z for a wing at the +Z end.
      const facesMinusZ = w.z1 > e.z0 + (e.z1 - e.z0) / 2;
      const x0 = frontX, x1 = w.x1 - 0.02;
      const zf = facesMinusZ ? w.z0 + FRONT_SETBACK_M : w.z1 - FRONT_SETBACK_M;
      const [c0, c1] = facesMinusZ ? [zf, w.z1] : [w.z0, zf];
      boxes.push(box('plinth', x0, x1, floor, floor + PLINTH_M, facesMinusZ ? zf + 0.04 : c0, facesMinusZ ? c1 : zf - 0.04));
      boxes.push(box('carcass', x0, x1, floor + PLINTH_M, bottom, c0, c1));
      modules(e.x1, x1).forEach(([m0, m1]) => {
        const [f0, f1] = facesMinusZ ? [zf - FRONT_M, zf] : [zf, zf + FRONT_M];
        boxes.push(box('front', m0 + GAP_M, m1 - GAP_M, floor + PLINTH_M + 0.003, bottom - 0.003, f0, f1));
      });
    });
    const cx = (e.x0 + e.x1) / 2, len = e.z1 - e.z0, cz = (e.z0 + e.z1) / 2;
    (len > 1.2 ? [cz - len / 4, cz + len / 4] : [cz]).forEach(z => lamps.push({ kind: 'pendant', position: [cx, top + 0.75, z] }));
    return { boxes, lamps, hasFacades: true, floorY: floor };
  }

  // Bathroom: a wall-hung vanity with two drawers per module, the floor
  // showing beneath it, and a mirror on the wall above the top with a warm
  // light strip behind it (lit in the evening).
  function vanity(layout) {
    const main = layout.parts.find(p => p.name === 'main' && p.role === 'stone');
    if (!main) return null;
    const e = extentOf(main.outline), top = main.y1, bottom = main.y0, floor = top - VANITY_HEIGHT_M;
    const wallX = layout.bounds.min[0];
    const boxes = [], lamps = [];
    const mirrorY0 = top + 0.25, mirrorY1 = mirrorY0 + 0.8;
    backWallAndFloor(boxes, wallX, floor, mirrorY1 + 0.5, layout.bounds);
    const frontX = e.x1 - 0.03, z0 = e.z0 + 0.02, z1 = e.z1 - 0.02, y0 = bottom - VANITY_UNIT_M;
    carcass(boxes, layout, e.x0, frontX, y0, bottom, z0, z1);
    const mid = (y0 + bottom) / 2;
    modules(z0, z1).forEach(([m0, m1]) => [[y0, mid], [mid, bottom]].forEach(([d0, d1]) => {
      boxes.push(box('front', frontX, frontX + FRONT_M, d0 + 0.003, d1 - 0.003, m0 + GAP_M, m1 - GAP_M));
    }));
    const cz = (e.z0 + e.z1) / 2, half = Math.min(0.45, (e.z1 - e.z0) * 0.4);
    boxes.push(box('glow', wallX, wallX + 0.004, mirrorY0 - 0.02, mirrorY1 + 0.02, cz - half - 0.02, cz + half + 0.02));
    boxes.push(box('mirror', wallX, wallX + 0.01, mirrorY0, mirrorY1, cz - half, cz + half));
    lamps.push({ kind: 'mirror', position: [wallX + 0.25, mirrorY1 - 0.1, cz] });
    return { boxes, lamps, hasFacades: true, floorY: floor };
  }

  // Stairs and steps: the floor and a wall along the flight's far side.
  function stairs(layout) {
    const b = layout.bounds, boxes = [];
    boxes.push(box('floor', b.min[0] - 1.2, b.max[0] + 2.5, -0.03, 0, b.min[2] - 0.12, b.max[2] + 2.5));
    boxes.push(box('wall', b.min[0] - 1.2, b.max[0] + 2.5, 0, b.max[1] + 1.4, b.min[2] - 0.12, b.min[2]));
    const lamps = [{ kind: 'sconce', position: [(b.min[0] + b.max[0]) / 2, b.max[1] * 0.5 + 1.0, b.min[2] + 0.15] }];
    return { boxes, lamps, hasFacades: false, floorY: 0 };
  }

  // The room for a product (null: it is shown as it is, its own context and
  // all -- a sill already stands in its window). Evening lamps for a product
  // without a room: one, above it.
  function buildRoom(layout, productKey) {
    if (!layout || !layout.bounds) return null;
    if (productKey === 'stoleshnitsa_kuhnya') return kitchen(layout);
    if (productKey === 'stoleshnitsa_vannaya') return vanity(layout);
    if (productKey === 'lestnitsa' || productKey === 'stupeni') return stairs(layout);
    return null;
  }

  function lampsFor(layout, productKey) {
    const room = buildRoom(layout, productKey);
    if (room) return room.lamps;
    if (!layout || !layout.bounds) return [];
    const b = layout.bounds;
    return [{ kind: 'pendant', position: [(b.min[0] + b.max[0]) / 2, b.max[1] + 0.8, (b.min[2] + b.max[2]) / 2] }];
  }

  return { MODES, FACADES, ROOM_COLORS, LIGHTS, buildRoom, lampsFor };
});
