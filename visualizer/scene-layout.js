// visualizer/scene-layout.js
//
// Pure scene composition: GeometryModel -> a flat list of renderable parts
// plus the product's bounding box. All placement math lives here (not in
// three-scene.js) so it can be unit-tested without WebGL; three-scene.js
// only turns each part into a mesh.
//
// Local frame: Y up. X is across the depth -- the wall a countertop, sill or
// panel is mounted on is at X-, the room/viewer side is X+. Z runs along the
// product's length. The main countertop segment is centred on the origin
// (y from -T/2 to +T/2). Plan coordinates from cutout-geometry.js
// (xM from the wall edge, zM from the run's start) map to x = xM - W/2,
// z = L/2 - zM.
//
// Part kinds:
//   prism   -- a horizontal outline [[x,z],...] extruded from y0 to y1, with
//              optional holes ({ rect:{x,z,w,l} } | { circle:{x,z,r} })
//   box     -- axis-aligned box: center [x,y,z], size [sx,sy,sz]
//   basin   -- open-top box hanging below yTop: center [x,yTop,z], size [sx,depth,sz]
//   cooktop -- glass plate sitting on yTop: center [x,yTop,z], size [sx,sy,sz]
//   seams   -- line segments [[x1,y1,z1,x2,y2,z2],...] drawn on a surface
// Roles: stone | metal | glass | body (stair structure) | context | context-glass | seam.
// 'context' parts (a wall, a window) help read the product but are not part
// of it -- they are excluded from the bounds the camera frames.
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.SceneLayout = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {

  const globalRoot = typeof window !== 'undefined' ? window : globalThis;
  const C = (typeof module !== 'undefined' && module.exports) ? require('./constants.js') : globalRoot.VisualizerConstants;

  const PRODUCT_ROLES = ['stone', 'metal', 'glass', 'body'];
  const ARC_SEGMENTS = 10;
  const DEFAULT_FRAME_PADDING = 0.1;
  const MAX_SEAMS = 400;

  function rect(x0, x1, z0, z1) {
    return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
  }

  // Rectangle x0..x1 / z0..z1 with every corner rounded by radius r.
  function roundedRect(x0, x1, z0, z1, r) {
    const rr = Math.max(0, Math.min(r, (x1 - x0) / 2, (z1 - z0) / 2));
    if (rr === 0) return rect(x0, x1, z0, z1);
    const pts = [];
    const corners = [
      [x1 - rr, z0 + rr, -Math.PI / 2], [x1 - rr, z1 - rr, 0],
      [x0 + rr, z1 - rr, Math.PI / 2], [x0 + rr, z0 + rr, Math.PI],
    ];
    corners.forEach(([cx, cz, a0]) => {
      for (let i = 0; i <= ARC_SEGMENTS / 2; i++) {
        const a = a0 + (Math.PI / 2) * (i / (ARC_SEGMENTS / 2));
        pts.push([cx + rr * Math.cos(a), cz + rr * Math.sin(a)]);
      }
    });
    return pts;
  }

  // Rectangle whose outer end (+Z if outward > 0, else -Z) is a half-round
  // -- the bar counter's "сложная" end, away from the main run.
  function roundEndRect(x0, x1, z0, z1, r, outward) {
    const rr = Math.max(0, Math.min(r, (x1 - x0) / 2, z1 - z0));
    const s = outward > 0 ? 1 : -1;
    const zBase = s > 0 ? z1 - rr : z0 + rr;
    const zFlat = s > 0 ? z0 : z1;
    const pts = [[x0, zFlat], [x1, zFlat], [x1, zBase]];
    const cx = (x0 + x1) / 2;
    const rx = (x1 - x0) / 2;
    for (let i = 1; i < ARC_SEGMENTS; i++) {
      const a = Math.PI * (i / ARC_SEGMENTS);
      pts.push([cx + rx * Math.cos(a), zBase + s * rr * Math.sin(a)]);
    }
    pts.push([x0, zBase]);
    return pts;
  }

  function prism(role, outline, y0, y1, extra) {
    return Object.assign({ kind: 'prism', role, outline, holes: [], y0, y1 }, extra || {});
  }

  function box(role, center, size) {
    return { kind: 'box', role, center, size };
  }

  // ---- countertops (kitchen, bathroom, and the default slab) --------------

  function countertopParts(m) {
    const W = m.widthM, L = m.lengthM, T = m.visualThicknessM;
    const edge = m.edge ? m.edge.type : null;
    const parts = [];
    const lx = xM => xM - W / 2;
    const lz = zM => L / 2 - zM;
    const top = T / 2, bottom = -T / 2;

    const holes = [];
    if (m.sink) {
      const c = m.sink.cut;
      holes.push({ rect: { x: lx(c.xM), z: lz(c.zM), w: c.widthM, l: c.lengthM } });
    }
    ['mixer', 'dispenser', 'socket'].forEach(key => {
      const h = m.holes && m.holes[key];
      if (h) holes.push({ circle: { x: lx(h.position.xM), z: lz(h.position.zM), r: h.radiusM } });
    });
    parts.push(prism('stone', rect(-W / 2, W / 2, -L / 2, L / 2), bottom, top, { holes, edge, name: 'main' }));

    if (edge === 'stone-wrap') {
      // "Подгиб камнем": the front edge reads thicker -- a stone apron under
      // the room-side edge of the main run.
      parts.push(box('stone', [W / 2 - 0.01, bottom - T / 2, 0], [0.02, T, L]));
    }

    if (m.wing) {
      const { widthM: ww, lengthM: wl, corner } = m.wing;
      const z0 = corner === 'left' ? L / 2 - ww : -L / 2;
      parts.push(prism('stone', rect(W / 2, W / 2 + wl, z0, z0 + ww), bottom, top, { edge, name: 'wing' }));
    }

    if (m.sink) {
      const c = m.sink.cut;
      const x = lx(c.xM), z = lz(c.zM);
      if (m.sink.type === 'integrated') {
        // Same stone, no rim: the bowl continues the countertop itself.
        parts.push({ kind: 'basin', role: 'stone', center: [x, bottom, z], size: [c.widthM, 0.16, c.lengthM], name: 'sink' });
      } else if (m.sink.type === 'overlay') {
        // Sits on top: a steel rim over the cut-out, bowl below.
        parts.push(prism('metal', rect(x - c.widthM / 2 - 0.03, x + c.widthM / 2 + 0.03, z - c.lengthM / 2 - 0.03, z + c.lengthM / 2 + 0.03),
          top, top + 0.008, { holes: [{ rect: { x, z, w: c.widthM, l: c.lengthM } }], name: 'sink-rim' }));
        parts.push({ kind: 'basin', role: 'metal', center: [x, top, z], size: [c.widthM, 0.18, c.lengthM], name: 'sink' });
      } else {
        // Undermount: a clean stone opening, the steel bowl fixed underneath.
        parts.push({ kind: 'basin', role: 'metal', center: [x, bottom, z], size: [c.widthM + 0.03, 0.18, c.lengthM + 0.03], name: 'sink' });
      }
    }

    if (m.cooktop) {
      const c = m.cooktop.cut;
      parts.push({ kind: 'cooktop', role: 'glass', center: [lx(c.xM), top, lz(c.zM)], size: [c.widthM + 0.02, 0.006, c.lengthM + 0.02], name: 'cooktop' });
    }

    // Backsplash, wall panel and curb are drawn along the main run's wall.
    // An entered length longer than that run (it may continue along other
    // walls -- the calculator doesn't say which) is drawn only as far as the
    // run goes rather than hanging past its ends; the real length stays in
    // the Result and the request.
    const wallX = -W / 2;
    const alongWall = len => Math.min(len, L);
    if (m.backsplash) {
      parts.push(box('stone', [wallX - 0.01, top + m.backsplash.heightM / 2, 0], [0.02, m.backsplash.heightM, alongWall(m.backsplash.lengthM)]));
    }
    if (m.wallPanel) {
      // Directly on the wall; a backsplash, if any, stands in front of it.
      const x = wallX - (m.backsplash ? 0.02 : 0) - 0.01;
      parts.push(box('stone', [x, top + m.wallPanel.heightM / 2, 0], [0.02, m.wallPanel.heightM, alongWall(m.wallPanel.lengthM)]));
    }
    if (m.curb) {
      // On the countertop, along the wall edge.
      const h = m.curb.heightM;
      parts.push(box('stone', [wallX + h / 2, top + h / 2, 0], [h, h, alongWall(m.curb.lengthM)]));
    }

    if (m.island) {
      const i = m.island;
      const x0 = i.offsetXM - i.widthM / 2, z0 = i.offsetZM - i.lengthM / 2;
      const outline = i.variant === 'figured'
        ? roundedRect(x0, x0 + i.widthM, z0, z0 + i.lengthM, Math.min(i.widthM, i.lengthM) * 0.3)
        : rect(x0, x0 + i.widthM, z0, z0 + i.lengthM);
      parts.push(prism('stone', outline, bottom, top, { edge, name: 'island' }));
    }

    if (m.barCounter) {
      const b = m.barCounter;
      const x0 = b.offsetXM - b.widthM / 2, z0 = b.offsetZM - b.lengthM / 2;
      const outline = b.variant === 'complex'
        ? roundEndRect(x0, x0 + b.widthM, z0, z0 + b.lengthM, b.widthM / 2, b.offsetZM)
        : rect(x0, x0 + b.widthM, z0, z0 + b.lengthM);
      parts.push(prism('stone', outline, bottom, top, { edge, name: 'bar' }));
    }

    return parts;
  }

  // ---- windowsill: the sill in a window opening ---------------------------

  function windowsillParts(m) {
    const parts = countertopParts(Object.assign({}, m, { sink: null, cooktop: null, holes: null, backsplash: null, wallPanel: null, curb: null, island: null, barCounter: null, wing: null }));
    const W = m.widthM, L = m.lengthM, T = m.visualThicknessM;
    const wallT = 0.14, x = -W / 2 - wallT / 2;
    const openZ = Math.max(L / 2 - 0.06, L * 0.4);
    const openY0 = T / 2, openY1 = T / 2 + 1.3;
    const margin = 0.7, yLow = -0.8, yHigh = openY1 + 0.45;
    const zOut = openZ + margin;
    parts.push(box('context', [x, (yLow + openY0) / 2, 0], [wallT, openY0 - yLow, 2 * zOut]));
    parts.push(box('context', [x, (openY1 + yHigh) / 2, 0], [wallT, yHigh - openY1, 2 * zOut]));
    parts.push(box('context', [x, (openY0 + openY1) / 2, -(openZ + margin / 2)], [wallT, openY1 - openY0, margin]));
    parts.push(box('context', [x, (openY0 + openY1) / 2, openZ + margin / 2], [wallT, openY1 - openY0, margin]));
    parts.push(box('context-glass', [x - 0.02, (openY0 + openY1) / 2, 0], [0.012, openY1 - openY0, 2 * openZ]));
    return parts;
  }

  // ---- vertical products: panno, wall, facade -----------------------------

  function faceSeams(xFace, runM, heightM, y0, layout) {
    const segs = [];
    if (!layout || !layout.pattern) return segs;
    const mod = layout.moduleM;
    for (let z = -runM / 2 + mod; z < runM / 2 - 1e-6 && segs.length < MAX_SEAMS; z += mod) {
      segs.push([xFace, y0, z, xFace, y0 + heightM, z]);
    }
    if (layout.pattern !== 'panels') {
      for (let y = y0 + mod; y < y0 + heightM - 1e-6 && segs.length < MAX_SEAMS; y += mod) {
        segs.push([xFace, y, -runM / 2, xFace, y, runM / 2]);
      }
    }
    return segs;
  }

  function verticalParts(m) {
    const T = m.visualThicknessM;
    const parts = [];
    let runM, heightM, y0;
    if (m.productKey === 'stena') {
      // "Высота стены" is the length field, "Ширина стены" the width field.
      heightM = m.lengthM; runM = m.widthM; y0 = 0;
    } else {
      runM = m.lengthM; heightM = m.widthM;
      y0 = m.productKey === 'panno' ? (heightM < 2.2 ? 0.9 : 0.1) : 0;
    }
    const wall = box('stone', [0, y0 + heightM / 2, 0], [T, heightM, runM]);
    // The joints' grid on the room-side face, for the renderer to give each
    // piece its own stone (presentation only -- no geometry changes).
    if (m.surface && m.surface.pattern) {
      wall.tiling = { plane: 'front', pattern: m.surface.pattern, moduleM: m.surface.moduleM, z0: -runM / 2, y0 };
    }
    parts.push(wall);
    const seams = faceSeams(T / 2 + 0.001, runM, heightM, y0, m.surface);
    if (seams.length) parts.push({ kind: 'seams', role: 'seam', segments: seams });
    if (m.productKey === 'panno') {
      // A panel hangs on a wall -- drawn as neutral context behind it, with
      // enough of it in frame to read as "on the wall".
      // 15 mm stand-off so the panel casts a readable shadow line on the wall.
      const wallH = Math.max(2.7, y0 + heightM + 0.5);
      parts.push(box('context', [-T / 2 - 0.015 - 0.05, wallH / 2, 0], [0.1, wallH, runM + 1.6]));
      return { parts, floorY: 0, framePadding: 0.3 };
    }
    return { parts, floorY: 0, framePadding: 0.14 };
  }

  // ---- floor: a plate on the ground with the chosen layout's joints -------

  function diagonalSeams(x0, x1, z0, z1, y, mod) {
    const segs = [];
    const step = mod * Math.SQRT2;
    [1, -1].forEach(sign => {
      // lines z = sign*x + c
      const cs = [sign * -x0 + z0, sign * -x1 + z0, sign * -x0 + z1, sign * -x1 + z1];
      const cMin = Math.min.apply(null, cs), cMax = Math.max.apply(null, cs);
      for (let c = cMin + step; c < cMax && segs.length < MAX_SEAMS; c += step) {
        const xa = sign > 0 ? z0 - c : c - z0;
        const xb = sign > 0 ? z1 - c : c - z1;
        const lo = Math.max(x0, Math.min(xa, xb)), hi = Math.min(x1, Math.max(xa, xb));
        if (hi - lo > 1e-6) segs.push([lo, y, sign * lo + c, hi, y, sign * hi + c]);
      }
    });
    return segs;
  }

  function floorParts(m) {
    const W = m.widthM, L = m.lengthM, T = m.visualThicknessM;
    const layout = m.surface;
    const tiling = layout && layout.pattern
      ? { tiling: { plane: 'top', pattern: layout.pattern, moduleM: layout.moduleM, x0: -W / 2, x1: W / 2, z0: -L / 2, z1: L / 2 } }
      : {};
    const parts = [prism('stone', rect(-W / 2, W / 2, -L / 2, L / 2), 0, T, Object.assign({ name: 'floor' }, tiling))];
    if (layout && layout.pattern) {
      const y = T + 0.001, mod = layout.moduleM;
      let segs = [];
      if (layout.pattern === 'diagonal') {
        segs = diagonalSeams(-W / 2, W / 2, -L / 2, L / 2, y, mod);
      } else {
        for (let x = -W / 2 + mod; x < W / 2 - 1e-6 && segs.length < MAX_SEAMS; x += mod) segs.push([x, y, -L / 2, x, y, L / 2]);
        for (let z = -L / 2 + mod; z < L / 2 - 1e-6 && segs.length < MAX_SEAMS; z += mod) segs.push([-W / 2, y, z, W / 2, y, z]);
      }
      if (segs.length) parts.push({ kind: 'seams', role: 'seam', segments: segs });
    }
    return { parts, floorY: 0 };
  }

  // ---- stairs and steps ---------------------------------------------------

  const RISE = C.VISUAL_STAIR_RISE_M;
  const RISER_T = C.VISUAL_RISER_THICKNESS_M;
  // Plan angle (in the X/Z plane) of the stairs' default camera
  // ('iso-side-high'), so a fan flight starts on the side it is seen from.
  const VIEWER_ANGLE = Math.atan2(C.CAMERA_PRESETS['iso-side-high'].direction[2], C.CAMERA_PRESETS['iso-side-high'].direction[0]);

  // Footprint of one step on a straight flight: `along` is measured from the
  // flight's start in the direction of travel; the front edge can bulge
  // toward the viewer by `bulge` (radius steps).
  function stepFootprint(origin, dir, across, halfW, a0, a1, bulge) {
    const at = (along, side) => [origin[0] + dir[0] * along + across[0] * side, origin[1] + dir[1] * along + across[1] * side];
    const pts = [at(a1, -halfW), at(a1, halfW)];
    if (bulge > 0) {
      for (let i = 0; i <= ARC_SEGMENTS; i++) {
        const t = i / ARC_SEGMENTS;
        const side = halfW - 2 * halfW * t;
        pts.push(at(a0 - bulge * Math.sin(Math.PI * t), side));
      }
    } else {
      pts.push(at(a0, halfW), at(a0, -halfW));
    }
    return pts;
  }

  function straightFlight(parts, o) {
    const { origin, dir, across, width, count, depth, level, risers, bulge, T } = o;
    const halfW = width / 2;
    for (let k = 0; k < count; k++) {
      const topY = (level + k + 1) * RISE;
      const a0 = k * depth, a1 = (k + 1) * depth;
      parts.push(prism('stone', stepFootprint(origin, dir, across, halfW, a0, a1, bulge), topY - T, topY, { edge: o.edge, name: 'tread' }));
      if (risers) {
        parts.push(prism('stone', bandOutline(stepFootprint(origin, dir, across, halfW, a0, a0 + RISER_T, bulge), bulge),
          (level + k) * RISE, topY - T, { name: 'riser' }));
      }
      const bodyStart = a0 + (risers ? RISER_T : 0);
      parts.push(prism('body', stepFootprint(origin, dir, across, halfW, bodyStart, a1, risers ? 0 : bulge), 0, topY - T, { name: 'body' }));
    }
  }

  // A riser under a radius tread follows the tread's arc: a thin band whose
  // back edge is the same arc moved back by the riser thickness.
  function bandOutline(footprint, bulge) {
    if (!(bulge > 0)) return footprint;
    const front = footprint.slice(2);
    const dx = footprint[0][0] - front[front.length - 1][0];
    const dz = footprint[0][1] - front[front.length - 1][1];
    const len = Math.hypot(dx, dz) || 1;
    const back = front.map(([x, z]) => [x + (dx / len) * RISER_T, z + (dz / len) * RISER_T]).reverse();
    return front.concat(back);
  }

  // Fan of wedge treads around a pivot -- winder steps (straight outer
  // edges, like treads along a wall) and spiral stairs (round outer edge).
  // The lowest tread points at `startAngle` (the viewer side) and the
  // flight turns away from there, so the climb stays readable.
  function fanFlight(parts, o) {
    const { rIn, rOut, count, angle, risers, T, column, straightOuter } = o;
    const start = o.startAngle - angle / 2;
    const u = a => [Math.cos(a), Math.sin(a)];
    const outerSegments = straightOuter ? 1 : ARC_SEGMENTS;
    for (let k = 0; k < count; k++) {
      const a0 = start + k * angle, a1 = a0 + angle;
      const topY = (k + 1) * RISE;
      const pts = [];
      for (let i = 0; i <= outerSegments; i++) {
        const d = u(a0 + (a1 - a0) * (i / outerSegments));
        pts.push([d[0] * rOut, d[1] * rOut]);
      }
      const di1 = u(a1), di0 = u(a0);
      pts.push([di1[0] * rIn, di1[1] * rIn], [di0[0] * rIn, di0[1] * rIn]);
      parts.push(prism('stone', pts, topY - T, topY, { edge: o.edge, name: 'tread' }));
      if (risers) {
        const d = u(a0), t = [-Math.sin(a0), Math.cos(a0)];
        const band = [
          [d[0] * rIn, d[1] * rIn], [d[0] * rOut, d[1] * rOut],
          [d[0] * rOut + t[0] * RISER_T, d[1] * rOut + t[1] * RISER_T], [d[0] * rIn + t[0] * RISER_T, d[1] * rIn + t[1] * RISER_T],
        ];
        parts.push(prism('stone', band, k * RISE, topY - T, { name: 'riser' }));
      }
      if (!column) parts.push(prism('body', pts, 0, topY - T, { name: 'body' }));
    }
    if (column) {
      const circle = [];
      for (let i = 0; i < 16; i++) circle.push([Math.cos(i / 16 * 2 * Math.PI) * rIn, Math.sin(i / 16 * 2 * Math.PI) * rIn]);
      parts.push(prism('body', circle, 0, count * RISE, { name: 'column' }));
    }
  }

  function clampSteps(n) {
    return Math.min(C.VISUAL_STAIR_MAX_STEPS, Math.max(C.VISUAL_STAIR_MIN_STEPS, Math.round(n)));
  }

  function stairParts(m) {
    const T = m.visualThicknessM;
    const s = m.stairs;
    const edge = m.edge ? m.edge.type : null;
    const parts = [];
    const up = [-1, 0], side = [0, 1]; // flights climb away from the viewer (toward X-)

    if (s.kind === 'steps') {
      // The entered size is one tread: lengthM across the flight, widthM deep.
      const count = C.VISUAL_STEPS_ILLUSTRATION_COUNT;
      if (s.variant === 'winder') {
        const rOut = m.lengthM;
        const angle = Math.min(Math.PI / 4.5, Math.max(Math.PI / 18, m.widthM / (0.6 * rOut)));
        fanFlight(parts, { rIn: 0.08, rOut, count, angle, risers: s.risers, T, edge, column: false, straightOuter: true, startAngle: VIEWER_ANGLE });
      } else {
        const bulge = s.variant === 'radius' ? Math.min(m.widthM * 0.35, m.lengthM * 0.12) : 0;
        straightFlight(parts, { origin: [0, 0], dir: up, across: side, width: m.lengthM, count, depth: m.widthM, level: 0, risers: s.risers, bulge, T, edge });
      }
      return { parts, floorY: 0 };
    }

    // Лестница: widthM is the flight's width, lengthM its walking length.
    const width = m.widthM;
    const n = clampSteps(m.lengthM / C.VISUAL_STAIR_TREAD_DEPTH_M);
    const depth = m.lengthM / n;
    if (s.shape === 'spiral') {
      const rOut = Math.max(0.6, width);
      fanFlight(parts, { rIn: 0.1, rOut, count: n, angle: C.VISUAL_STAIR_TREAD_DEPTH_M / (0.6 * rOut), risers: s.risers, T, edge, column: true, startAngle: VIEWER_ANGLE });
      return { parts, floorY: 0 };
    }
    if (s.shape === 'l' || s.shape === 'u') {
      const n1 = Math.ceil(n / 2), n2 = n - n1;
      straightFlight(parts, { origin: [0, 0], dir: up, across: side, width, count: n1, depth, level: 0, risers: s.risers, bulge: 0, T, edge });
      const landingX0 = -n1 * depth;
      const landingTop = (n1 + 1) * RISE;
      // П: the return flight runs on the far side (-Z) of the first one, so
      // its high end never hides the first flight from the default camera.
      const landingW = s.shape === 'u' ? 2 * width + 0.1 : width;
      const landingZ0 = s.shape === 'u' ? width / 2 - landingW : -width / 2;
      const landing = rect(landingX0 - width, landingX0, landingZ0, landingZ0 + landingW);
      parts.push(prism('stone', landing, landingTop - T, landingTop, { edge, name: 'landing' }));
      parts.push(prism('body', landing, 0, landingTop - T, { name: 'body' }));
      if (s.shape === 'l') {
        straightFlight(parts, { origin: [landingX0 - width / 2, landingZ0], dir: [0, -1], across: [1, 0], width, count: n2, depth, level: n1 + 1, risers: s.risers, bulge: 0, T, edge });
      } else {
        straightFlight(parts, { origin: [landingX0, -(width + 0.1)], dir: [1, 0], across: [0, 1], width, count: n2, depth, level: n1 + 1, risers: s.risers, bulge: 0, T, edge });
      }
      return { parts, floorY: 0 };
    }
    straightFlight(parts, { origin: [0, 0], dir: up, across: side, width, count: n, depth, level: 0, risers: s.risers, bulge: 0, T, edge });
    return { parts, floorY: 0 };
  }

  // ---- bounds -------------------------------------------------------------

  function partPoints(part) {
    if (part.kind === 'prism') {
      const pts = [];
      part.outline.forEach(([x, z]) => { pts.push([x, part.y0, z], [x, part.y1, z]); });
      return pts;
    }
    if (part.kind === 'box' || part.kind === 'cooktop') {
      const [cx, cy, cz] = part.center, [sx, sy, sz] = part.size;
      const yLo = part.kind === 'cooktop' ? cy : cy - sy / 2;
      const yHi = part.kind === 'cooktop' ? cy + sy : cy + sy / 2;
      return [[cx - sx / 2, yLo, cz - sz / 2], [cx + sx / 2, yHi, cz + sz / 2]];
    }
    if (part.kind === 'basin') {
      const [cx, cy, cz] = part.center, [sx, d, sz] = part.size;
      return [[cx - sx / 2, cy - d, cz - sz / 2], [cx + sx / 2, cy, cz + sz / 2]];
    }
    if (part.kind === 'seams') {
      const pts = [];
      part.segments.forEach(s => { pts.push([s[0], s[1], s[2]], [s[3], s[4], s[5]]); });
      return pts;
    }
    return [];
  }

  function computeBounds(parts, roles) {
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    parts.forEach(part => {
      if (!roles.includes(part.role)) return;
      partPoints(part).forEach(p => {
        for (let i = 0; i < 3; i++) {
          if (p[i] < min[i]) min[i] = p[i];
          if (p[i] > max[i]) max[i] = p[i];
        }
      });
    });
    if (!isFinite(min[0])) return null;
    return { min, max };
  }

  function buildSceneLayout(model) {
    let result;
    if (model.stairs) {
      result = stairParts(model);
    } else if (model.productKey === 'pol') {
      result = floorParts(model);
    } else if (['panno', 'stena', 'fasad'].includes(model.productKey)) {
      result = verticalParts(model);
    } else if (model.productKey === 'podokonnik') {
      result = { parts: windowsillParts(model), floorY: null, framePadding: 0.16 };
    } else {
      result = { parts: countertopParts(model), floorY: null };
    }
    const bounds = computeBounds(result.parts, PRODUCT_ROLES);
    return {
      parts: result.parts,
      bounds,
      // Countertops/sills are shown on a display surface right under their
      // lowest part (a sink bowl, if any); the rest stand on the floor at 0.
      floorY: result.floorY !== null ? result.floorY : (bounds ? bounds.min[1] : 0),
      // Share of the frame kept free around the product -- more where the
      // surrounding context (a wall, a window) is what makes it readable.
      framePadding: result.framePadding || DEFAULT_FRAME_PADDING,
    };
  }

  return { buildSceneLayout, computeBounds, PRODUCT_ROLES };
});
