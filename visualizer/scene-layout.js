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
// Roles: stone | metal | glass | body (stair structure) | context | context-glass | seam
// | light (a backlight glow -- not part of the product's bounds).
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

    // Г: one wing at the chosen end of the run; П: one at each end.
    const wings = m.wings && m.wings.length ? m.wings : (m.wing ? [m.wing] : []);
    wings.forEach(({ widthM: ww, lengthM: wl, corner }) => {
      const z0 = corner === 'left' ? L / 2 - ww : -L / 2;
      parts.push(prism('stone', rect(W / 2, W / 2 + wl, z0, z0 + ww), bottom, top, { edge, name: 'wing' }));
    });

    if (m.sink) {
      const c = m.sink.cut;
      const x = lx(c.xM), z = lz(c.zM);
      if (m.sink.type === 'integrated') {
        // Same stone, no rim: the bowl continues the countertop itself. The
        // slab's edge profile and thickness let the renderer make the bowl's
        // inner walls flush with the opening cut through the slab.
        parts.push({ kind: 'basin', role: 'stone', center: [x, bottom, z], size: [c.widthM, 0.16, c.lengthM], edge, slabThicknessM: T, name: 'sink' });
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

  // Plan of each windowsill type, in the sill's local frame (window wall at
  // x = -W/2, room toward +X, run along Z): the sill outline and the window
  // line it sits against (walked so the outside is on its left).
  function sillPlan(variant, W, L) {
    const xw = -W / 2;
    if (variant === 'corner') {
      // Two windows meeting in a corner at the +Z end: the sill turns and
      // runs along the second wall into the room.
      const reach = Math.max(W + 0.3, L * 0.6);
      return {
        outline: [[xw, -L / 2], [W / 2, -L / 2], [W / 2, L / 2 - W], [xw + reach, L / 2 - W], [xw + reach, L / 2], [xw, L / 2]],
        windowLine: [[xw, -L / 2], [xw, L / 2], [xw + reach, L / 2]],
      };
    }
    if (variant === 'bay' || variant === 'bay-radius') {
      // Эркер: the window bulges out of the wall; the sill fills the bay and
      // keeps its depth into the room along the whole run.
      const D = Math.min(0.45, L * 0.25);
      let bay;
      if (variant === 'bay') {
        bay = [[xw, -L / 2], [xw - D, -L / 2 + D], [xw - D, L / 2 - D], [xw, L / 2]];
      } else {
        bay = [];
        const n = 12;
        for (let i = 0; i <= n; i++) {
          const t = i / n;
          bay.push([xw - D * Math.sin(Math.PI * t), -L / 2 + L * t]);
        }
      }
      return { outline: bay.concat([[W / 2, L / 2], [W / 2, -L / 2]]), windowLine: bay };
    }
    if (variant === 'figured') {
      // Фигурный: a shaped room-side edge -- fuller in the middle, drawn in
      // at both ends -- against an ordinary straight window.
      const A = Math.min(W * 0.3, 0.1);
      const front = [];
      const n = 16;
      for (let i = 0; i <= n; i++) {
        const z = -L / 2 + L * (i / n);
        front.push([W / 2 - A + A * (1 + Math.cos(Math.PI * 2 * z / L)), z]);
      }
      return { outline: [[xw, -L / 2]].concat(front, [[xw, L / 2]]), windowLine: null };
    }
    return null;
  }

  // A window wall along a plan polyline: solid wall below the sill and above
  // the opening, glass in between, mullions at the turns, and a short solid
  // return past both ends.
  function windowWallAlong(parts, line, sillTop) {
    const wallT = 0.14, openY1 = sillTop + 1.3, yLow = -0.8, yHigh = openY1 + 0.45, margin = 0.5;
    const band = (p, q, t0, t1) => {
      const dx = q[0] - p[0], dz = q[1] - p[1], len = Math.hypot(dx, dz) || 1;
      const n = [-dz / len, dx / len];
      return [[p[0] + n[0] * t0, p[1] + n[1] * t0], [q[0] + n[0] * t0, q[1] + n[1] * t0], [q[0] + n[0] * t1, q[1] + n[1] * t1], [p[0] + n[0] * t1, p[1] + n[1] * t1]];
    };
    const extend = (from, to, by) => {
      const dx = to[0] - from[0], dz = to[1] - from[1], len = Math.hypot(dx, dz) || 1;
      return [to[0] + dx / len * by, to[1] + dz / len * by];
    };
    const ends = [[extend(line[1], line[0], margin), line[0]], [line[line.length - 1], extend(line[line.length - 2], line[line.length - 1], margin)]];
    ends.forEach(([p, q]) => parts.push(prism('context', band(p, q, 0, wallT), yLow, yHigh)));
    for (let i = 0; i + 1 < line.length; i++) {
      const p = line[i], q = line[i + 1];
      parts.push(prism('context', band(p, q, 0, wallT), yLow, sillTop));
      parts.push(prism('context', band(p, q, 0, wallT), openY1, yHigh));
      parts.push(prism('context-glass', band(p, q, 0.02, 0.032), sillTop, openY1));
    }
    // Mullions at the turns of a faceted bay; along a curve (many short
    // facets) only every third one, so the glazing does not read as slats.
    const every = line.length > 5 ? 3 : 1;
    for (let i = 1; i + 1 < line.length; i++) {
      if (i % every !== 0) continue;
      const [x, z] = line[i], r = 0.03;
      parts.push(prism('context', [[x - r, z - r], [x + r, z - r], [x + r, z + r], [x - r, z + r]], sillTop, openY1));
    }
  }

  function windowsillParts(m) {
    const variant = (m.sill && m.sill.variant) || 'straight';
    const plan = sillPlan(variant, m.widthM, m.lengthM);
    if (plan && plan.windowLine) {
      const T = m.visualThicknessM;
      const parts = [prism('stone', plan.outline, -T / 2, T / 2, { edge: m.edge ? m.edge.type : null, name: 'main' })];
      windowWallAlong(parts, plan.windowLine, T / 2);
      return parts;
    }
    // Фигурный: the same window as the straight sill, the slab's own outline.
    const parts = plan
      ? [prism('stone', plan.outline, -m.visualThicknessM / 2, m.visualThicknessM / 2, { edge: m.edge ? m.edge.type : null, name: 'main' })]
      : countertopParts(Object.assign({}, m, { sink: null, cooktop: null, holes: null, backsplash: null, wallPanel: null, curb: null, island: null, barCounter: null, wing: null, wings: null }));
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

  // Joint lines on the room-side face (x = xFace) along a 2D polyline in
  // (z, y) -- a medallion, a diamond, a frame.
  function facePolyline(xFace, pts, closed) {
    const segs = [];
    const n = closed ? pts.length : pts.length - 1;
    for (let i = 0; i < n; i++) {
      const [z0, y0] = pts[i], [z1, y1] = pts[(i + 1) % pts.length];
      segs.push([xFace, y0, z0, xFace, y1, z1]);
    }
    return segs;
  }

  function circlePoints(cu, cv, r, n) {
    const pts = [];
    for (let i = 0; i < n; i++) pts.push([cu + r * Math.cos(i / n * 2 * Math.PI), cv + r * Math.sin(i / n * 2 * Math.PI)]);
    return pts;
  }

  // A thin warm light line (LED strip) -- role 'light', outside the bounds.
  function lightBox(center, size) {
    return box('light', center, size);
  }

  // Panno treatments on top of the plain stone slab.
  function panelTreatment(parts, variant, runM, heightM, y0, T) {
    const xFace = T / 2 + 0.001;
    const short = Math.min(runM, heightM);
    if (variant === 'framed') {
      // Декоративное: a raised stone frame around the field.
      const fw = Math.min(0.12, Math.max(0.04, short * 0.08)), d = 0.02, x = T / 2 + d / 2;
      parts.push(box('stone', [x, y0 + heightM - fw / 2, 0], [d, fw, runM]));
      parts.push(box('stone', [x, y0 + fw / 2, 0], [d, fw, runM]));
      parts.push(box('stone', [x, y0 + heightM / 2, runM / 2 - fw / 2], [d, heightM - 2 * fw, fw]));
      parts.push(box('stone', [x, y0 + heightM / 2, -runM / 2 + fw / 2], [d, heightM - 2 * fw, fw]));
      return;
    }
    if (variant === 'inlay') {
      // Художественное / наборное: a composition of pieces -- an inset
      // border, a diamond and a round medallion in the centre.
      const b = short * 0.08, cy = y0 + heightM / 2;
      const hz = runM / 2 - b, hy = heightM / 2 - b;
      const r = short * 0.22;
      const segs = [].concat(
        facePolyline(xFace, [[-hz, cy - hy], [hz, cy - hy], [hz, cy + hy], [-hz, cy + hy]], true),
        facePolyline(xFace, [[0, cy - hy], [hz, cy], [0, cy + hy], [-hz, cy]], true),
        facePolyline(xFace, circlePoints(0, cy, r, 32), true),
        facePolyline(xFace, circlePoints(0, cy, r * 0.62, 24), true));
      parts.push({ kind: 'seams', role: 'seam', segments: segs });
      return;
    }
    if (variant === 'backlit') {
      // С подсветкой: warm light escaping from behind all four edges.
      const x = -T / 2 - 0.02, g = 0.012, o = 0.04;
      parts.push(lightBox([x, y0 + heightM + o / 2, 0], [g, o, runM + 2 * o]));
      parts.push(lightBox([x, y0 - o / 2, 0], [g, o, runM + 2 * o]));
      parts.push(lightBox([x, y0 + heightM / 2, runM / 2 + o / 2], [g, heightM, o]));
      parts.push(lightBox([x, y0 + heightM / 2, -runM / 2 - o / 2], [g, heightM, o]));
    }
  }

  // Радиусная стена: the cladding follows an arc in plan, bowed toward the
  // room, with its joints along the arc.
  function radiusWallParts(m, runM, heightM, T) {
    const sag = Math.min(runM * 0.18, 1.2);
    const R = (runM * runM / 4 + sag * sag) / (2 * sag);
    const cx = sag - R, half = Math.asin(Math.min(1, runM / 2 / R));
    const n = 24, front = [], back = [];
    for (let i = 0; i <= n; i++) {
      const a = -half + 2 * half * (i / n);
      front.push([cx + R * Math.cos(a), R * Math.sin(a)]);
      back.push([cx + (R - T) * Math.cos(a), (R - T) * Math.sin(a)]);
    }
    const parts = [prism('stone', front.concat(back.reverse()), 0, heightM, { name: 'wall' })];
    const segs = [];
    const mod = (m.surface && m.surface.moduleM) || C.VISUAL_LAYOUT_MODULE_M;
    const cols = Math.max(2, Math.round(runM / mod));
    for (let i = 1; i < cols; i++) {
      const a = -half + 2 * half * (i / cols), x = cx + (R + 0.001) * Math.cos(a), z = (R + 0.001) * Math.sin(a);
      segs.push([x, 0, z, x, heightM, z]);
    }
    for (let y = mod; y < heightM - 1e-6 && segs.length < MAX_SEAMS; y += mod) {
      for (let i = 0; i < n; i++) {
        const a0 = -half + 2 * half * (i / n), a1 = -half + 2 * half * ((i + 1) / n), r1 = R + 0.001;
        segs.push([cx + r1 * Math.cos(a0), y, r1 * Math.sin(a0), cx + r1 * Math.cos(a1), y, r1 * Math.sin(a1)]);
      }
    }
    parts.push({ kind: 'seams', role: 'seam', segments: segs });
    return { parts, floorY: 0, framePadding: 0.14 };
  }

  // Facade types other than a plain clad wall.
  function facadeFormParts(form, runM, heightM, T) {
    const parts = [];
    if (form === 'surround') {
      // Фасадный элемент: a stone window surround on a plaster wall.
      const base = 0.6, fw = Math.min(0.25, Math.max(0.08, Math.min(runM, heightM) * 0.14)), d = 0.08;
      parts.push(box('stone', [d / 2, base + heightM - fw / 2, 0], [d, fw, runM]));
      parts.push(box('stone', [d * 0.6, base + fw * 0.4, 0], [d * 1.2, fw * 0.8, runM + 0.06]));
      parts.push(box('stone', [d / 2, base + heightM / 2, runM / 2 - fw / 2], [d, heightM - 1.8 * fw, fw]));
      parts.push(box('stone', [d / 2, base + heightM / 2, -runM / 2 + fw / 2], [d, heightM - 1.8 * fw, fw]));
      parts.push(box('context-glass', [0.005, base + heightM / 2, 0], [0.01, heightM - 1.8 * fw, runM - 2 * fw]));
      parts.push(box('context', [-0.1, (base + heightM + 0.8) / 2, 0], [0.2, base + heightM + 0.8, runM + 2]));
      return { parts, floorY: 0, framePadding: 0.25 };
    }
    if (form === 'columns') {
      // Колонны: a row of round columns with bases, capitals and a beam.
      const count = Math.min(6, Math.max(2, Math.round(runM / 1.4) + 1));
      const d = Math.min(0.5, Math.max(0.2, runM / (count * 2.4)));
      const capH = 0.14, beamH = 0.24;
      const shaftTop = Math.max(0.6, heightM - capH - beamH);
      for (let i = 0; i < count; i++) {
        const z = -runM / 2 + d / 2 + (runM - d) * (count === 1 ? 0.5 : i / (count - 1));
        parts.push(box('stone', [0, 0.06, z], [d * 1.3, 0.12, d * 1.3]));
        parts.push(prism('stone', circlePoints(0, z, d / 2, 20), 0.12, shaftTop, { name: 'column' }));
        parts.push(box('stone', [0, shaftTop + capH / 2, z], [d * 1.35, capH, d * 1.35]));
      }
      parts.push(box('stone', [0, shaftTop + capH + beamH / 2, 0], [d * 1.4, beamH, runM + d * 0.4]));
      parts.push(box('context', [-d - 0.6, (heightM + 0.6) / 2, 0], [0.2, heightM + 0.6, runM + 2]));
      return { parts, floorY: 0, framePadding: 0.18 };
    }
    if (form === 'cornice') {
      // Декоративные элементы: a stepped stone cornice crowning a wall.
      const base = 2.2, h = heightM;
      parts.push(box('stone', [0.05, base + h * 0.175, 0], [0.1, h * 0.35, runM]));
      parts.push(box('stone', [0.09, base + h * 0.475, 0], [0.18, h * 0.25, runM + 0.08]));
      parts.push(box('stone', [0.14, base + h * 0.8, 0], [0.28, h * 0.4, runM + 0.16]));
      parts.push(box('context', [-0.1, base / 2, 0], [0.2, base, runM + 1.6]));
      return { parts, floorY: 0, framePadding: 0.3 };
    }
    return null;
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
    const form = m.surface && m.surface.form;
    if (m.productKey === 'stena' && form === 'radius') return radiusWallParts(m, runM, heightM, T);
    if (m.productKey === 'fasad' && form && form !== 'plinth') {
      const facade = facadeFormParts(form, runM, heightM, T);
      if (facade) return facade;
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
      const variant = (m.panel && m.panel.variant) || 'plain';
      panelTreatment(parts, variant, runM, heightM, y0, T);
      // A panel hangs on a wall -- drawn as neutral context behind it, with
      // enough of it in frame to read as "on the wall".
      // 15 mm stand-off so the panel casts a readable shadow line on the wall
      // (more for a backlit panel, so the light has room to escape).
      const standOff = variant === 'backlit' ? 0.05 : 0.015;
      const wallH = Math.max(2.7, y0 + heightM + 0.5);
      parts.push(box('context', [-T / 2 - standOff - 0.05, wallH / 2, 0], [0.1, wallH, runM + 1.6]));
      return { parts, floorY: 0, framePadding: 0.3 };
    }
    if (m.surface && m.surface.light) {
      // Стена с подсветкой: light lines along the top and the foot.
      parts.push(lightBox([T / 2 + 0.01, y0 + heightM - 0.01, 0], [0.012, 0.012, runM]));
      parts.push(lightBox([T / 2 + 0.01, y0 + 0.01, 0], [0.012, 0.012, runM]));
    }
    if (form === 'plinth') {
      // Цоколь: the stone band at the foot of a plaster wall, capped by a
      // projecting stone drip; framed with the wall above it in view.
      parts.push(box('stone', [T / 2 + 0.02, heightM + 0.03, 0], [T + 0.04, 0.06, runM + 0.04]));
      parts.push(box('context', [-0.03, heightM + 0.06 + 1.1, 0], [T, 2.2, runM]));
      return { parts, floorY: 0, framePadding: 0.45 };
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

  // Floor seams (x, z plane) with the part inside radius R around the
  // origin cut away.
  function clipOutsideCircle(segs, R) {
    const out = [];
    segs.forEach(s => {
      const [ax, ay, az, bx, by, bz] = s;
      const dx = bx - ax, dz = bz - az;
      const A = dx * dx + dz * dz, B = 2 * (ax * dx + az * dz), Cc = ax * ax + az * az - R * R;
      const disc = B * B - 4 * A * Cc;
      if (A === 0 || disc <= 0) { out.push(s); return; }
      const t1 = (-B - Math.sqrt(disc)) / (2 * A), t2 = (-B + Math.sqrt(disc)) / (2 * A);
      const at = t => [ax + dx * t, ay, az + dz * t];
      if (t1 > 0) out.push([ax, ay, az].concat(at(Math.min(1, t1))));
      if (t2 < 1) out.push(at(Math.max(0, t2)).concat([bx, by, bz]));
    });
    return out;
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
      // По рисунку: a border band of half a module around the field.
      const b = layout.motif === 'border' ? Math.min(mod / 2, W / 6, L / 6) : 0;
      if (layout.pattern === 'diagonal') {
        segs = diagonalSeams(-W / 2, W / 2, -L / 2, L / 2, y, mod);
      } else {
        for (let x = -W / 2 + b + mod; x < W / 2 - b - 1e-6 && segs.length < MAX_SEAMS; x += mod) segs.push([x, y, -L / 2 + b, x, y, L / 2 - b]);
        for (let z = -L / 2 + b + mod; z < L / 2 - b - 1e-6 && segs.length < MAX_SEAMS; z += mod) segs.push([-W / 2 + b, y, z, W / 2 - b, y, z]);
      }
      if (b > 0) {
        const x0 = -W / 2 + b, x1 = W / 2 - b, z0 = -L / 2 + b, z1 = L / 2 - b;
        segs.push([x0, y, z0, x1, y, z0], [x1, y, z0, x1, y, z1], [x1, y, z1, x0, y, z1], [x0, y, z1, x0, y, z0]);
      }
      if (layout.motif === 'medallion') {
        // Художественная: a round medallion with a rosette in the middle of
        // the diagonal field (the field's joints stop at its rim).
        const R = Math.min(W, L) * 0.25;
        segs = clipOutsideCircle(segs, R);
        const ring = (r, n) => {
          for (let i = 0; i < n; i++) {
            const a0 = i / n * 2 * Math.PI, a1 = (i + 1) / n * 2 * Math.PI;
            segs.push([r * Math.cos(a0), y, r * Math.sin(a0), r * Math.cos(a1), y, r * Math.sin(a1)]);
          }
        };
        ring(R, 48);
        ring(R * 0.7, 40);
        for (let i = 0; i < 8; i++) {
          const a = i / 8 * 2 * Math.PI;
          segs.push([0, y, 0, R * 0.7 * Math.cos(a), y, R * 0.7 * Math.sin(a)]);
        }
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

  // The client's step count (GeometryModel.stairs.count) is drawn exactly.
  // A model built without one (no calculator state) still gets a flight.
  function stepCountOf(s) {
    return Math.max(1, Math.round(s.count || 1));
  }

  function stairParts(m) {
    const T = m.visualThicknessM;
    const s = m.stairs;
    const edge = m.edge ? m.edge.type : null;
    const parts = [];
    const up = [-1, 0], side = [0, 1]; // flights climb away from the viewer (toward X-)

    if (s.kind === 'steps') {
      // The entered size is one tread: lengthM across the flight, widthM deep.
      const count = stepCountOf(s);
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

    // Лестница: widthM is the flight's width, lengthM its walking length,
    // shared by exactly the client's number of treads.
    const width = m.widthM;
    const n = stepCountOf(s);
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
