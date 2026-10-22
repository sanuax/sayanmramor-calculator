// visualizer/edge-profile.js
//
// A stone part as a solid with its real edge profile. The profile the
// client chose (rounding, chamfer, figured, or the hairline arris every
// stone edge has) is cut only along the edges that are open to the room;
// an edge against a wall or at the joint between two pieces stays a
// straight cut, as on a real countertop -- so two pieces meet without a
// groove. The plan outline is the stone's exact size: the profile goes
// into the stone, it never makes the slab bigger.
//
// Smooth profiles (the rounding) and gently turning outlines (a rounded
// island corner, a radius step) get smooth normals; the chamfer and the
// figured edge keep their facets, as their cards show them.
//
// Pure (no three.js): a triangle list of positions and normals in layout
// space (metres; wall = -X, room = +X, run = Z, up = +Y). The caller passes
// the triangulator for the flat top and bottom (the renderer hands in
// THREE.ShapeUtils.triangulateShape).
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.EdgeProfile = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {

  const ROUND_SEGMENTS = 8;
  const CIRCLE_SEGMENTS = 24;
  // Outline turns smaller than this are one curved surface (smooth normals).
  const SMOOTH_TURN = 30 * Math.PI / 180;
  const EPS = 1e-9;

  // ---- the profile: a cross-section of one open edge ------------------------

  // One rim corner of a profile, from the rim (d = 0, on the top or bottom
  // face) to the straight face (s = 0): s = how far into the stone, d = how
  // far from the rim along the thickness, (o, u) = the normal (out, up) for
  // the top corner. A point listed twice is a crease.
  function corner(kind, size, facets) {
    if (!size || kind === 'square') return [];
    const at = (phi, normalPhi) => ({
      s: size * (1 - Math.sin(phi)), d: size * (1 - Math.cos(phi)),
      o: Math.sin(normalPhi), u: Math.cos(normalPhi),
    });
    const pts = [];
    if (kind === 'round') {
      for (let i = 0; i <= ROUND_SEGMENTS; i++) {
        const phi = (Math.PI / 2) * (i / ROUND_SEGMENTS);
        pts.push(at(phi, phi));
      }
    } else {
      for (let i = 0; i < facets; i++) {
        const a = (Math.PI / 2) * (i / facets), b = (Math.PI / 2) * ((i + 1) / facets);
        pts.push(at(a, (a + b) / 2), at(b, (a + b) / 2));
      }
    }
    return pts;
  }

  // The edge cards (sayanmramor-calculator.html EDGE_TYPES) draw these: the
  // same treatment on the top and the bottom corner of the edge. «Подгиб
  // камнем» is the arris on top only -- the stone apron continues the face
  // below, glued flush; the apron ('apron') has it on the bottom only.
  const ARRIS_M = 0.0015;
  function cornersFor(edge, depth) {
    if (depth < 0.015) return { top: ['square', 0], bottom: ['square', 0] };
    const cap = depth * 0.35;
    switch (edge) {
      case 'closed': return { top: ['square', 0], bottom: ['square', 0] };
      case 'rounding': { const r = Math.min(cap, 0.012); return { top: ['round', r], bottom: ['round', r] }; }
      case 'bevel': { const c = Math.min(cap, 0.008); return { top: ['facets', c, 1], bottom: ['facets', c, 1] }; }
      case 'figured': { const f = Math.min(cap, 0.01); return { top: ['facets', f, 3], bottom: ['facets', f, 3] }; }
      case 'stone-wrap': return { top: ['facets', ARRIS_M, 1], bottom: ['square', 0] };
      case 'apron': return { top: ['square', 0], bottom: ['facets', ARRIS_M, 1] };
      default: return { top: ['facets', ARRIS_M, 1], bottom: ['facets', ARRIS_M, 1] };
    }
  }

  // The cross-section of an edge from the top rim down to the bottom rim:
  // points { s, y, o, u }. sTop/sBottom: how far the rims sit inside the
  // outline; size(Top|Bottom): how far down/up the treatment reaches.
  function profile(edge, y0, y1) {
    const c = cornersFor(edge, y1 - y0);
    const top = corner(c.top[0], c.top[1], c.top[2]);
    const bottom = corner(c.bottom[0], c.bottom[1], c.bottom[2]);
    const topSize = c.top[1], bottomSize = c.bottom[1];
    const pts = top.map(p => ({ s: p.s, y: y1 - p.d, o: p.o, u: p.u }));
    if (!top.length) pts.push({ s: 0, y: y1, o: 1, u: 0 });
    pts.push({ s: 0, y: y1 - topSize, o: 1, u: 0 }, { s: 0, y: y0 + bottomSize, o: 1, u: 0 });
    if (!bottom.length) pts.push({ s: 0, y: y0, o: 1, u: 0 });
    bottom.slice().reverse().forEach(p => pts.push({ s: p.s, y: y0 + p.d, o: p.o, u: -p.u }));
    return { points: pts, sTop: pts[0].s, sBottom: pts[pts.length - 1].s, topSize, bottomSize };
  }

  // ---- plan geometry -------------------------------------------------------

  function signedArea(loop) {
    let a = 0;
    loop.forEach(([x1, z1], i) => { const [x2, z2] = loop[(i + 1) % loop.length]; a += x1 * z2 - x2 * z1; });
    return a / 2;
  }

  // The loop's edges with their direction and the normal pointing into the
  // stone (inside the outline; outside a hole).
  function edgesOf(loop, isHole) {
    const side = (signedArea(loop) > 0 ? 1 : -1) * (isHole ? -1 : 1);
    return loop.map((p, i) => {
      const q = loop[(i + 1) % loop.length];
      const len = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
      const dir = [(q[0] - p[0]) / len, (q[1] - p[1]) / len];
      return { p, q, dir, inward: [-side * dir[1], side * dir[0]] };
    });
  }

  // The point on both lines {x : x . n = p . n + s}; parallel lines: the
  // first line's point nearest to p.
  function meet(p, n1, s1, n2, s2) {
    const c1 = p[0] * n1[0] + p[1] * n1[1] + s1;
    const c2 = p[0] * n2[0] + p[1] * n2[1] + s2;
    const det = n1[0] * n2[1] - n1[1] * n2[0];
    if (Math.abs(det) < 1e-9) return [p[0] + n1[0] * s1, p[1] + n1[1] * s1];
    return [(c1 * n2[1] - c2 * n1[1]) / det, (n1[0] * c2 - n2[0] * c1) / det];
  }

  const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
  const collinear = (a, b) => Math.abs(a.dir[0] * b.dir[1] - a.dir[1] * b.dir[0]) < 1e-6 && dot(a.dir, b.dir) > 0;

  // How an edge ends at one of its corners, given the neighbouring edge:
  //   'mitre'   both open: the profiles meet on the corner's bisector
  //   'stop'    the neighbour is a straight cut: the profile runs into it
  //   'inside'  the neighbour is a straight cut in line with this edge -- a
  //             joint where the next piece of stone continues out into the
  //             room (an L wing): the profile turns the inside corner along
  //             that piece's front, so the two pieces' rims meet
  //   'plain'   this edge is a straight cut
  function cornerKind(edge, other) {
    if (!edge.open) return 'plain';
    if (other.open) return 'mitre';
    return collinear(edge, other) ? 'inside' : 'stop';
  }

  // ---- the solid -------------------------------------------------------------

  function createSink() {
    const positions = [], normals = [];
    function tri(a, b, c, na, nb, nc) {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
      const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
      if (fx * fx + fy * fy + fz * fz < 1e-18) return;
      // Wound counter-clockwise seen from where the normals point.
      if (fx * (na[0] + nb[0] + nc[0]) + fy * (na[1] + nb[1] + nc[1]) + fz * (na[2] + nb[2] + nc[2]) < 0) {
        [b, c] = [c, b]; [nb, nc] = [nc, nb];
      }
      positions.push(...a, ...b, ...c);
      normals.push(...na, ...nb, ...nc);
    }
    return { tri, positions, normals };
  }

  function normal3(h, o, u) {
    const x = h[0] * o, z = h[1] * o, l = Math.hypot(x, u, z) || 1;
    return [x / l, u / l, z / l];
  }

  // part: { outline: [[x, z]...], holes, y0, y1, edge, closed: [edge index...] }
  // options.triangulate(contour, holes) -> [[a, b, c]...], contour/holes as
  // arrays of {x, y} (indices into contour.concat(...holes)).
  function buildSolid(part, options) {
    const { y0, y1 } = part;
    const closed = new Set(part.closed || []);
    const prof = profile(part.edge, y0, y1);
    const levels = prof.points;
    const out = createSink();
    const up = [0, 1, 0], down = [0, -1, 0];

    const loops = [{ pts: part.outline, hole: false, closedAt: i => closed.has(i) }];
    (part.holes || []).forEach(h => loops.push({ pts: holeLoop(h), hole: true, closedAt: () => false }));

    const rims = loops.map(loop => {
      const edges = edgesOf(loop.pts, loop.hole);
      edges.forEach((e, i) => { e.open = !loop.closedAt(i); });
      const n = edges.length;
      const prev = i => edges[(i - 1 + n) % n], next = i => edges[(i + 1) % n];
      const outward = e => [-e.inward[0], -e.inward[1]];
      // The horizontal normal of an open edge's face at its corner: one
      // curved surface over a gentle turn, its own face over a sharp one.
      const faceNormal = (e, other) => {
        if (!other.open || Math.acos(Math.max(-1, Math.min(1, dot(e.dir, other.dir)))) > SMOOTH_TURN) return outward(e);
        const m = [-(e.inward[0] + other.inward[0]), -(e.inward[1] + other.inward[1])];
        const l = Math.hypot(m[0], m[1]) || 1;
        return [m[0] / l, m[1] / l];
      };
      // Where level (s at this height) of edge e sits at its corner with
      // `other`; for 'inside' also the point where the turned profile meets
      // the joint. At an inside corner the next piece's front runs out into
      // the room from the joint, its stone on the straight cut's side
      // (`front` points into that stone).
      function cornerPoints(e, other, s, atStart) {
        const p = atStart ? e.p : e.q;
        const kind = cornerKind(e, other);
        if (kind === 'mitre') return [meet(p, e.inward, s, other.inward, s)];
        if (kind === 'stop') return [meet(p, e.inward, s, other.inward, 0)];
        if (kind === 'inside') {
          const front = atStart ? [-other.dir[0], -other.dir[1]] : other.dir;
          const mitre = meet(p, e.inward, s, front, s);
          const joint = meet(p, other.inward, 0, front, s);
          return atStart ? [joint, mitre] : [mitre, joint];
        }
        // A straight cut: its end follows the neighbour's profile.
        if (!other.open) return [meet(p, e.inward, 0, other.inward, 0)];
        const front = collinear(e, other) ? (atStart ? e.dir : [-e.dir[0], -e.dir[1]]) : other.inward;
        return [meet(p, e.inward, 0, front, s)];
      }

      // Side faces.
      edges.forEach((e, i) => {
        const a = prev(i), b = next(i);
        if (e.open) {
          const hA = faceNormal(e, a), hB = faceNormal(e, b);
          for (let j = 0; j + 1 < levels.length; j++) {
            const L0 = levels[j], L1 = levels[j + 1];
            if (Math.abs(L0.s - L1.s) < EPS && Math.abs(L0.y - L1.y) < EPS) continue;
            const s0 = cornerPoints(e, a, L0.s, true), s1 = cornerPoints(e, a, L1.s, true);
            const e0 = cornerPoints(e, b, L0.s, false), e1 = cornerPoints(e, b, L1.s, false);
            const A0 = s0[s0.length - 1], A1 = s1[s1.length - 1], B0 = e0[0], B1 = e1[0];
            const nA0 = normal3(hA, L0.o, L0.u), nA1 = normal3(hA, L1.o, L1.u);
            const nB0 = normal3(hB, L0.o, L0.u), nB1 = normal3(hB, L1.o, L1.u);
            const p = (q, y) => [q[0], y, q[1]];
            out.tri(p(A0, L0.y), p(B0, L0.y), p(B1, L1.y), nA0, nB0, nB1);
            out.tri(p(A0, L0.y), p(B1, L1.y), p(A1, L1.y), nA0, nB1, nA1);
            // The inside corner: the profile turned along the next piece's
            // front, from the mitre to the joint.
            [[s0, s1, a, true], [e0, e1, b, false]].forEach(([c0, c1, other, atStart]) => {
              if (c0.length < 2) return;
              const toward = atStart ? [-other.dir[0], -other.dir[1]] : other.dir;
              const h = [-toward[0], -toward[1]];
              const n0 = normal3(h, L0.o, L0.u), n1 = normal3(h, L1.o, L1.u);
              out.tri(p(c0[0], L0.y), p(c0[1], L0.y), p(c1[1], L1.y), n0, n0, n1);
              out.tri(p(c0[0], L0.y), p(c1[1], L1.y), p(c1[0], L1.y), n0, n1, n1);
            });
          }
        } else {
          // A straight cut: one flat face, its ends shaped by the profiles
          // that run into it. Convex, so a fan from its centre covers it.
          const h = outward(e), nrm = normal3(h, 1, 0);
          const startSide = levels.map(L => [cornerPoints(e, a, L.s, true)[0], L.y]);
          const endSide = levels.map(L => [cornerPoints(e, b, L.s, false)[0], L.y]).reverse();
          const poly = startSide.concat(endSide).map(([q, y]) => [q[0], y, q[1]]);
          const c = poly.reduce((acc, v) => [acc[0] + v[0] / poly.length, acc[1] + v[1] / poly.length, acc[2] + v[2] / poly.length], [0, 0, 0]);
          poly.forEach((v, k) => out.tri(c, v, poly[(k + 1) % poly.length], nrm, nrm, nrm));
        }
      });

      // Rim loops for the caps: each corner's point(s) at the top and bottom.
      const rim = s => {
        const pts = [];
        edges.forEach((e, i) => {
          const a = prev(i);
          const sE = e.open ? s(e) : 0, sA = a.open ? s(a) : 0;
          const kind = cornerKind(e, a), back = cornerKind(a, e);
          if (kind === 'inside') pts.push(...cornerPoints(e, a, sE, true));
          else if (back === 'inside') pts.push(...cornerPoints(a, e, sA, false));
          else pts.push(meet(e.p, e.inward, sE, a.inward, sA));
        });
        return pts;
      };
      return { top: rim(() => prof.sTop), bottom: rim(() => prof.sBottom) };
    });

    // Top and bottom faces.
    [['top', y1, up], ['bottom', y0, down]].forEach(([key, y, nrm]) => {
      const contour = rims[0][key].map(([x, z]) => ({ x, y: z }));
      const holes = rims.slice(1).map(r => r[key].map(([x, z]) => ({ x, y: z })));
      const all = contour.concat(...holes);
      options.triangulate(contour, holes).forEach(([i, j, k]) => {
        out.tri([all[i].x, y, all[i].y], [all[j].x, y, all[j].y], [all[k].x, y, all[k].y], nrm, nrm, nrm);
      });
    });

    return { positions: new Float32Array(out.positions), normals: new Float32Array(out.normals), profile: prof };
  }

  // A hole of the layout ({ rect: {x, z, w, l} } or { circle: {x, z, r} }) as
  // a plan loop.
  function holeLoop(h) {
    if (h.rect) {
      const { x, z, w, l } = h.rect;
      return [[x - w / 2, z - l / 2], [x + w / 2, z - l / 2], [x + w / 2, z + l / 2], [x - w / 2, z + l / 2]];
    }
    const { x, z, r } = h.circle;
    const pts = [];
    for (let i = 0; i < CIRCLE_SEGMENTS; i++) {
      const a = (i / CIRCLE_SEGMENTS) * Math.PI * 2;
      pts.push([x + r * Math.cos(a), z + r * Math.sin(a)]);
    }
    return pts;
  }

  return { profile, buildSolid, holeLoop, signedArea };
});
