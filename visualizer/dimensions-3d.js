// visualizer/dimensions-3d.js
//
// «Размеры» in the 3D view: every size the client entered -- for every
// product, every type of it and every additional work with sizes (a wing,
// an island, a bar counter, a backsplash, a wall panel, a curb, a riser) --
// drawn on the model as a dimension: beside the edge it measures, lifted off
// it by GAP, with extension lines back to the edge and its label in the
// middle, worded as on the page's size diagram («2400 мм», a radius «R …»,
// a diameter «⌀ …»). Each one is drawn on geometry of exactly that size --
// a curved length along its curve -- and names the field it shows
// (`field`, the input's id). Nothing the model only assumes (the thickness,
// a curb's height, where an island stands) is ever given as a size; a size
// the drawing cannot show as entered (a backsplash longer than the run it
// is drawn along, a stair too short for its steps, placeholder sizes before
// all are entered) is left out rather than shown wrong.
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
  // A drawn size within this of the entered one is that size.
  const TOLERANCE_M = 0.0005;

  const UP = [0, 1, 0];
  const mm = m => Math.round(m * 1000);
  const labelFor = (m, prefix) => (prefix || '') + mm(m) + ' мм';
  const add = (p, v, s) => [p[0] + v[0] * s, p[1] + v[1] * s, p[2] + v[2] * s];
  const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const pathLength = pts => pts.slice(1).reduce((s, p, i) => s + dist(pts[i], p), 0);
  const unit = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

  // A dimension of `valueM` measured along `pts` (two points, or a curve),
  // drawn `out` of them -- one direction, or one per point for a curve.
  // `gap`: how far (default GAP_M). Only if the drawn size is the entered one.
  function pathDim(field, valueM, pts, out, opts) {
    const o = opts || {};
    if (!(valueM > 0) || Math.abs(pathLength(pts) - valueM) > TOLERANCE_M) return null;
    const gap = o.gap || GAP_M;
    const outAt = i => (Array.isArray(out[0]) ? out[i] : out);
    const line = pts.map((p, i) => add(p, outAt(i), gap));
    const ends = [0, pts.length - 1];
    // The label at the middle of the line, by length.
    const half = pathLength(line) / 2;
    let labelAt = line[0], run = 0;
    for (let i = 1; i < line.length; i++) {
      const seg = dist(line[i - 1], line[i]);
      if (run + seg >= half) {
        const t = seg ? (half - run) / seg : 0;
        labelAt = [0, 1, 2].map(k => line[i - 1][k] + (line[i][k] - line[i - 1][k]) * t);
        break;
      }
      run += seg;
    }
    // `labelAtEnd`: at the line's far end -- a radius read where it meets its curve.
    if (o.labelAtEnd) labelAt = line[line.length - 1];
    return {
      field, valueMm: mm(valueM), label: labelFor(valueM, o.prefix),
      measured: pts, line,
      extensions: o.noExtensions ? [] : ends.map(i => [pts[i], add(pts[i], outAt(i), gap + OVERSHOOT_M)]),
      tickOut: ends.map(outAt),
      labelAt,
    };
  }

  const dim = (field, valueM, a, b, out, opts) => pathDim(field, valueM, [a, b], out, opts);

  function extentOf(outline) {
    const xs = outline.map(p => p[0]), zs = outline.map(p => p[1]);
    return { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
  }
  function boxExtent(part) {
    const [cx, cy, cz] = part.center, [sx, sy, sz] = part.size;
    return { x0: cx - sx / 2, x1: cx + sx / 2, y0: cy - sy / 2, y1: cy + sy / 2, z0: cz - sz / 2, z1: cz + sz / 2 };
  }
  // A part's extent, a box or a prism alike.
  const partExtent = part => (part.outline ? Object.assign(extentOf(part.outline), { y0: part.y0, y1: part.y1 }) : boxExtent(part));
  const named = (layout, name) => layout.parts.filter(p => p.name === name);
  const kebab = key => key.replace(/[A-Z]/g, c => '-' + c.toLowerCase());

  // ---- countertops: the main run, its wings and every attachment ------------

  function countertopDims(model, layout) {
    const main = named(layout, 'main').find(p => p.outline);
    if (!main) return [];
    const e = extentOf(main.outline), y = main.y1;
    const wingParts = named(layout, 'wing').map(w => ({ part: w, e: extentOf(w.outline) }));
    const wingAt = z => wingParts.some(w => Math.abs(w.e.z0 - z) < 1e-6 || Math.abs(w.e.z1 - z) < 1e-6);
    const out = [];
    // The run along the room side -- with wings (their tops lie along that
    // side) along the back edge, lifted above it.
    out.push(wingParts.length
      ? dim('length', model.lengthM, [e.x0, y, e.z0], [e.x0, y, e.z1], UP)
      : dim('length', model.lengthM, [e.x1, y, e.z0], [e.x1, y, e.z1], [1, 0, 0]));
    // The depth across a free end; both ends with wings: across the middle.
    if (!wingAt(e.z1)) out.push(dim('width', model.widthM, [e.x0, y, e.z1], [e.x1, y, e.z1], [0, 0, 1]));
    else if (!wingAt(e.z0)) out.push(dim('width', model.widthM, [e.x0, y, e.z0], [e.x1, y, e.z0], [0, 0, -1]));
    else out.push(dim('width', model.widthM, [e.x0, y, (e.z0 + e.z1) / 2], [e.x1, y, (e.z0 + e.z1) / 2], UP));
    (model.wings || []).forEach((w, i) => {
      const wing = wingParts[i];
      if (!wing) return;
      const we = wing.e, wy = wing.part.y1;
      // A wing at the +Z end faces -Z (toward the kitchen): its length runs
      // out into the room along its front, its width across its far end.
      const faceMinusZ = we.z1 > (e.z0 + e.z1) / 2;
      const zf = faceMinusZ ? we.z0 : we.z1;
      out.push(dim('wing-length', w.lengthM, [we.x0, wy, zf], [we.x1, wy, zf], [0, 0, faceMinusZ ? -1 : 1]));
      out.push(dim('wing-width', w.widthM, [we.x1, wy, we.z0], [we.x1, wy, we.z1], [1, 0, 0]));
    });
    if (model.island) {
      const part = named(layout, 'island')[0];
      if (part) {
        const ie = extentOf(part.outline), iy = part.y1;
        const f = model.island.variant === 'figured' ? 'extra-ostrov-figured-' : 'extra-ostrov-';
        out.push(dim(f + 'length', model.island.lengthM, [ie.x1, iy, ie.z0], [ie.x1, iy, ie.z1], [1, 0, 0]));
        out.push(dim(f + 'width', model.island.widthM, [ie.x0, iy, ie.z1], [ie.x1, iy, ie.z1], [0, 0, 1]));
      }
    }
    if (model.barCounter) {
      const b = model.barCounter, part = named(layout, 'bar')[0];
      if (part) {
        const be = extentOf(part.outline), by = part.y1;
        const f = b.variant === 'complex' ? 'extra-bar-complex-' : 'extra-bar-standard-';
        // Its run out into the room is the larger entered size, its depth the
        // smaller (attachment-geometry.js); the run along its outer side.
        const runField = b.widthM >= b.lengthM ? 'width' : 'length', depthField = runField === 'width' ? 'length' : 'width';
        const outer = (be.z0 + be.z1) / 2 > 0 ? be.z1 : be.z0, side = outer === be.z1 ? 1 : -1;
        out.push(dim(f + runField, b.runM, [be.x0, by, outer], [be.x1, by, outer], [0, 0, side]));
        const xm = (be.x0 + be.x1) / 2;
        out.push(dim(f + depthField, b.depthM, [xm, by, be.z0], [xm, by, be.z1], UP));
      }
    }
    // On the wall: the backsplash's and the wall panel's length along their
    // top, their height at an end (the backsplash's at +Z, the panel's at
    // -Z); the curb's length along its top.
    const onWall = (name, sizes, lengthField, heightField, end) => {
      const part = named(layout, name)[0];
      if (!part || !sizes) return;
      const be = boxExtent(part), x = be.x1;
      out.push(dim(lengthField, sizes.lengthM, [x, be.y1, be.z0], [x, be.y1, be.z1], UP));
      if (heightField) {
        const z = end > 0 ? be.z1 : be.z0;
        out.push(dim(heightField, sizes.heightM, [x, be.y0, z], [x, be.y1, z], [0, 0, end]));
      }
    };
    onWall('backsplash', model.backsplash, 'extra-fartuk-length', 'extra-fartuk-width', 1);
    onWall('wall-panel', model.wallPanel, 'extra-wallpanel-length', 'extra-wallpanel-width', -1);
    onWall('curb', model.curb, 'extra-bortik', null, 1);
    return out;
  }

  // ---- windowsills: each shape by its own sizes -------------------------------

  function sillDims(model, layout) {
    const sill = model.sill || {};
    if (!sill.plan) return countertopDims(model, layout);
    const main = named(layout, 'main')[0];
    if (!main) return [];
    const y = main.y1, W = model.widthM, L = model.lengthM, xw = -W / 2, p = sill.params || {};
    const out = [];
    if (sill.variant === 'corner') {
      out.push(dim('length', L, [xw, y, -L / 2], [xw, y, L / 2], UP));
      out.push(dim('width', W, [xw, y, -L / 2], [W / 2, y, -L / 2], [0, 0, -1]));
      out.push(dim('sill-arm-length', p.armLengthM, [xw, y, L / 2], [xw + p.armLengthM, y, L / 2], [0, 0, 1]));
    } else if (sill.variant === 'bay' || sill.variant === 'bay-radius') {
      const D = p.bayDepthM;
      out.push(dim('length', L, [W / 2, y, -L / 2], [W / 2, y, L / 2], [1, 0, 0]));
      out.push(dim('width', W, [xw, y, L / 2], [W / 2, y, L / 2], [0, 0, 1]));
      out.push(dim('sill-bay-depth', D, [xw - D, y, 0], [xw, y, 0], UP));
      if (sill.variant === 'bay') out.push(dim('sill-bay-front', p.bayFrontM, [xw - D, y, -p.bayFrontM / 2], [xw - D, y, p.bayFrontM / 2], [-1, 0, 0], { gap: 2 * GAP_M }));
    } else if (sill.variant === 'figured') {
      // The length between its front corners, in front of the shaped edge
      // (fullest at the middle, where its full depth is measured).
      const corner = z => Math.max(...main.outline.filter(q => Math.abs(q[1] - z) < 1e-6).map(q => q[0]));
      const xe = Math.min(corner(-L / 2), corner(L / 2));
      out.push(dim('length', L, [xe, y, -L / 2], [xe, y, L / 2], [1, 0, 0], { gap: GAP_M + W / 2 - xe }));
      out.push(dim('width', W, [xw, y, 0], [W / 2, y, 0], UP));
    }
    return out;
  }

  // ---- floors, walls, panels ----------------------------------------------------

  function floorDims(model, layout) {
    const part = layout.parts.find(p => p.outline && p.role === 'floor') || layout.parts.find(p => p.outline);
    if (!part) return [];
    const e = extentOf(part.outline), y = part.y1;
    return [
      dim('length', model.lengthM, [e.x1, y, e.z0], [e.x1, y, e.z1], [1, 0, 0]),
      dim('width', model.widthM, [e.x0, y, e.z1], [e.x1, y, e.z1], [0, 0, 1]),
    ];
  }

  // An upright slab (a wall, a panno): its height up the end facing the
  // viewer, its width along the top.
  function uprightDims(part, heightField, heightM, widthField, widthM) {
    const be = boxExtent(part), x = be.x1;
    return [
      dim(heightField, heightM, [x, be.y0, be.z1], [x, be.y1, be.z1], [0, 0, 1]),
      dim(widthField, widthM, [x, be.y1, be.z0], [x, be.y1, be.z1], UP),
    ];
  }

  function wallDims(model, layout) {
    const arc = model.surface && model.surface.arc;
    if (model.surface && model.surface.form === 'radius') {
      const wall = named(layout, 'wall')[0];
      if (!wall) return [];
      const n = (wall.outline.length) / 2;
      const front = wall.outline.slice(0, n);
      const H = model.lengthM;
      const out = [dim('length', H, [front[n - 1][0], 0, front[n - 1][1]], [front[n - 1][0], H, front[n - 1][1]], [0, 0, 1])];
      if (arc) {
        // «Длина дуги» along the top of the curved front; «Радиус стены» from
        // the arc's centre to its middle, above the wall.
        out.push(pathDim('width', arc.arcM, front.map(([x, z]) => [x, H, z]), UP));
        const cx = front[(n - 1) / 2][0] - arc.radiusM;
        const end = front[0];
        out.push(dim('wall-radius', arc.radiusM, [cx, H, 0], [end[0], H, end[1]], UP, { gap: 2 * GAP_M, prefix: 'R ', labelAtEnd: true }));
      }
      return out;
    }
    const wall = named(layout, 'wall')[0];
    return wall ? uprightDims(wall, 'length', model.lengthM, 'width', model.widthM) : [];
  }

  function pannoDims(model, layout) {
    const panel = named(layout, 'panel')[0];
    return panel ? uprightDims(panel, 'width', model.widthM, 'length', model.lengthM) : [];
  }

  // ---- steps and stairs ---------------------------------------------------------

  // The riser under the lowest step: its height at its outer end.
  function riserDim(model, layout) {
    const s = model.stairs;
    if (!s.risers) return null;
    const risers = named(layout, 'riser');
    if (!risers.length) return null;
    const r = risers.reduce((a, b) => (b.y0 < a.y0 ? b : a));
    // The outline's corner farthest out (+Z on a straight flight, the outer
    // end of a fan's riser), and outward from there.
    const fan = s.variant === 'winder' || s.shape === 'spiral';
    const corner = r.outline.reduce((a, b) => ((fan ? Math.hypot(b[0], b[1]) > Math.hypot(a[0], a[1]) : b[1] > a[1]) ? b : a));
    const out = fan ? unit([corner[0], 0, corner[1]]) : [0, 0, 1];
    return dim('riser-height', s.riserHeightM, [corner[0], r.y0, corner[1]], [corner[0], r.y1, corner[1]], out);
  }

  // A fan tread (winder, spiral): its outline starts with the outer end of
  // its front edge and ends with the inner one.
  function fanFront(tread) {
    const pts = tread.outline, outer = pts[0], inner = pts[pts.length - 1];
    const a0 = Math.atan2(outer[1], outer[0]);
    return { outer, inner, a0, back: [Math.sin(a0), 0, -Math.cos(a0)] };
  }

  function stepsDims(model, layout) {
    const s = model.stairs, p = s.plan;
    const treads = named(layout, 'tread');
    if (!treads.length) return [];
    const low = treads.reduce((a, t) => (t.y1 < a.y1 ? t : a));
    const y = low.y1, out = [];
    if (s.variant === 'winder') {
      const f = fanFront(low);
      out.push(dim('length', model.lengthM, [f.inner[0], y, f.inner[1]], [f.outer[0], y, f.outer[1]], f.back));
      // The depth is measured along the middle of the tread.
      const rMid = (p.rIn + p.rOut) / 2, steps = 16, arc = [];
      for (let i = 0; i <= steps; i++) {
        const a = f.a0 + p.angle * (i / steps);
        arc.push([Math.cos(a) * rMid, y, Math.sin(a) * rMid]);
      }
      out.push(pathDim('width', model.widthM, arc, UP));
    } else {
      const e = extentOf(low.outline);
      if (s.variant === 'radius') {
        // The front bows out: the length clear of the bow, the full depth at
        // the middle.
        out.push(dim('length', model.lengthM, [e.x1 - p.bulgeM, y, e.z0], [e.x1 - p.bulgeM, y, e.z1], [1, 0, 0], { gap: GAP_M + p.bulgeM }));
        out.push(dim('width', model.widthM, [e.x0, y, 0], [e.x1, y, 0], UP));
      } else {
        out.push(dim('length', model.lengthM, [e.x1, y, e.z0], [e.x1, y, e.z1], [1, 0, 0]));
        out.push(dim('width', model.widthM, [e.x0, y, e.z1], [e.x1, y, e.z1], [0, 0, 1]));
      }
    }
    out.push(riserDim(model, layout));
    return out;
  }

  function stairDims(model, layout) {
    const s = model.stairs, p = s.plan;
    const treads = named(layout, 'tread');
    if (!treads.length) return [];
    const low = treads.reduce((a, t) => (t.y1 < a.y1 ? t : a));
    const y = low.y1, out = [];
    if (s.shape === 'spiral') {
      const f = fanFront(low);
      out.push(dim('length', model.lengthM, [0, 0, -p.rOut], [0, 0, p.rOut], UP, { prefix: '⌀ ' }));
      out.push(dim('width', model.widthM, [f.inner[0], y, f.inner[1]], [f.outer[0], y, f.outer[1]], f.back));
    } else {
      // The march width at the first step; the first run (its landings
      // included) along the floor, on the side the stair does not turn to.
      const e = extentOf(low.outline), W = model.widthM;
      out.push(dim('width', W, [e.x1, y, e.z0], [e.x1, y, e.z1], [1, 0, 0]));
      if (p.fits !== false) out.push(dim('length', model.lengthM, [0, 0, W / 2], [-model.lengthM, 0, W / 2], [0, 0, 1]));
    }
    out.push(riserDim(model, layout));
    return out;
  }

  // ---- facades ----------------------------------------------------------------

  function facadeDims(model, layout) {
    const f = model.facade;
    if (!f || f.placeholder) return [];
    const P = f.params, field = key => 'facade-' + kebab(key), out = [];
    // The first of the pieces drawn side by side (the one at -Z).
    const first = name => named(layout, name).reduce((a, b) => (!a || partExtent(b).z0 < partExtent(a).z0 ? b : a), null);
    const vertical = (key, part, x, z, out3) => dim(field(key), P[key], [x, part.y0, z], [x, part.y1, z], out3);
    if (f.type === 'wall' || f.type === 'plinth' || f.type === 'decor') {
      const part = first(f.type);
      if (!part) return [];
      const be = boxExtent(part);
      out.push(dim(field(f.type === 'decor' ? 'width' : 'length'), f.type === 'decor' ? P.width : P.length, [be.x1, be.y1, be.z0], [be.x1, be.y1, be.z1], UP));
      out.push(vertical('height', be, be.x1, be.z1, [0, 0, 1]));
    } else if (f.type === 'surround') {
      const top = first('frame-top');
      if (!top) return [];
      const t = boxExtent(top), zc = (t.z0 + t.z1) / 2, x = t.x1, W = P.openingWidth, H = P.openingHeight;
      const yTop = t.y0, yBase = yTop - H;
      out.push(dim(field('openingWidth'), W, [x, yTop, zc - W / 2], [x, yTop, zc + W / 2], [0, -1, 0]));
      out.push(dim(field('openingHeight'), H, [x, yBase, zc - W / 2], [x, yTop, zc - W / 2], [0, 0, 1]));
      out.push(dim(field('frame'), P.frame, [x, t.y0, t.z1], [x, t.y1, t.z1], [0, 0, 1]));
    } else if (f.type === 'column') {
      const shaft = first('column');
      if (!shaft) return [];
      const ex = partExtent(shaft);
      const zc = (ex.z0 + ex.z1) / 2;
      out.push(vertical('height', ex, 0, ex.z1, [0, 0, 1]));
      if (f.form === 'square') out.push(dim(field('side'), P.side, [ex.x1, (ex.y0 + ex.y1) / 2, ex.z0], [ex.x1, (ex.y0 + ex.y1) / 2, ex.z1], [1, 0, 0]));
      else out.push(dim(field('radius'), P.radius, [0, ex.y1, zc], [P.radius, ex.y1, zc], UP, { gap: 1e-9, prefix: 'R ', noExtensions: true }));
    } else if (f.type === 'pilaster') {
      const part = first('pilaster');
      if (!part) return [];
      const be = boxExtent(part);
      out.push(dim(field('width'), P.width, [be.x1, be.y1, be.z0], [be.x1, be.y1, be.z1], UP));
      out.push(dim(field('projection'), P.projection, [be.x0, be.y0, be.z1], [be.x1, be.y0, be.z1], [0, 0, 1]));
      out.push(vertical('height', be, be.x1, be.z1, [0, 0, 1]));
    } else if (f.type === 'cornice' || f.type === 'belt') {
      const tiers = named(layout, f.type).map(boxExtent);
      if (!tiers.length) return [];
      const topTier = tiers.reduce((a, b) => (b.y1 > a.y1 ? b : a));
      const y0 = Math.min(...tiers.map(t => t.y0)), y1 = topTier.y1, z1 = topTier.z1;
      out.push(dim(field('length'), P.length, [topTier.x1, y1, topTier.z0], [topTier.x1, y1, z1], UP));
      out.push(dim(field('height'), P.height, [topTier.x1, y0, z1], [topTier.x1, y1, z1], [0, 0, 1]));
      out.push(dim(field('projection'), P.projection, [topTier.x0, y1, z1], [topTier.x1, y1, z1], [0, 0, 1], { gap: 2 * GAP_M }));
    }
    return out;
  }

  // ---- fireplaces -------------------------------------------------------------

  function fireplaceDims(model) {
    const fp = model.fireplace;
    if (!fp || fp.placeholder || !fp.plan || !fp.plan.ok) return [];
    const P = fp.params, T = fp.plan.thicknessM, field = key => 'fireplace-' + kebab(key), out = [];
    const d = (key, a, b, o, opts) => dim(field(key), P[key], a, b, o, opts);
    if (fp.type === 'portal') {
      const W = P.openingWidth, H = P.openingHeight, b = P.pierWidth, h = P.lintelHeight, D = P.depth;
      const zR = W / 2, zO = zR + b;
      out.push(d('openingWidth', [D, H, -zR], [D, H, zR], [0, -1, 0]));
      out.push(d('openingHeight', [D, 0, -zR], [D, H, -zR], [0, 0, 1]));
      out.push(d('pierWidth', [D, 0, zR], [D, 0, zO], [1, 0, 0]));
      out.push(d('lintelHeight', [D, H, zO], [D, H + h, zO], [0, 0, 1]));
      out.push(d('depth', [0, 0, -zO], [D, 0, -zO], [0, 0, -1]));
      if (fp.form === 'with-shelf') {
        const o = P.shelfProjection, top = H + h + T;
        out.push(d('shelfProjection', [D + o, top, zO], [D + o, top, zO + o], UP));
      }
    } else if (fp.type === 'cladding') {
      const Wb = P.claddingWidth, Hb = P.claddingHeight, D = P.depth, W = P.fireboxWidth, H = P.fireboxHeight, e = P.fireboxBottom;
      out.push(d('claddingWidth', [D, Hb, -Wb / 2], [D, Hb, Wb / 2], UP));
      out.push(d('claddingHeight', [D, 0, Wb / 2], [D, Hb, Wb / 2], [0, 0, 1]));
      out.push(d('depth', [0, 0, -Wb / 2], [D, 0, -Wb / 2], [0, 0, -1]));
      out.push(d('fireboxWidth', [D, e + H, -W / 2], [D, e + H, W / 2], [0, -1, 0]));
      out.push(d('fireboxHeight', [D, e, -W / 2], [D, e + H, -W / 2], [0, 0, 1]));
      if (e > 0) out.push(d('fireboxBottom', [D, 0, W / 2], [D, e, W / 2], [1, 0, 0]));
    } else {
      const L = P.length, Hp = P.height, D = P.depth;
      out.push(d('length', [D, Hp, -L / 2], [D, Hp, L / 2], UP));
      out.push(d('height', [D, 0, L / 2], [D, Hp, L / 2], [0, 0, 1]));
      out.push(d('depth', [0, 0, -L / 2], [D, 0, -L / 2], [0, 0, -1]));
    }
    return out;
  }

  // The dimensions for a model and its layout ([] = none to show).
  function build(model, layout) {
    if (!model || !layout || !layout.bounds) return [];
    let dims;
    switch (model.productKey) {
      case 'stoleshnitsa_kuhnya':
      case 'stoleshnitsa_vannaya':
        dims = countertopDims(model, layout); break;
      case 'podokonnik': dims = sillDims(model, layout); break;
      case 'pol': dims = floorDims(model, layout); break;
      case 'stena': dims = wallDims(model, layout); break;
      case 'panno': dims = pannoDims(model, layout); break;
      case 'stupeni': dims = model.stairs ? stepsDims(model, layout) : []; break;
      case 'lestnitsa': dims = model.stairs ? stairDims(model, layout) : []; break;
      case 'fasad': dims = facadeDims(model, layout); break;
      case 'kaminy': dims = fireplaceDims(model); break;
      default: dims = [];
    }
    return dims.filter(Boolean);
  }

  return { GAP_M, OVERSHOOT_M, TOLERANCE_M, build, labelFor, pathLength };
});
