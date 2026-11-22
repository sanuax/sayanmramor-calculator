// product-icons.js
//
// The product cards' pictures («Тип изделия», the owner, 2026-11-22/23): every product is a small 3D model
// of boxes, planes and true circles, drawn in one isometric projection (30°) and fitted to the 120x80 frame,
// so the geometry is exact and the ten read as one set. The look «Макет» (the owner's pick of three,
// 2026-11-23): an architectural white model -- no lights, no gradients, no outline, three flat tones per
// material (top, left face, right face) in the calculator's colours.
// The «Одно изделие / Проект» cards and the project's cards keep the rendered pictures (icons/products/lux).
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.ProductIcons = factory();
})(typeof window !== 'undefined' ? window : globalThis, function () {

  // ---- the model ----
  const C30 = Math.cos(Math.PI / 6);
  const project = p => [(p[0] - p[1]) * C30, (p[0] + p[1]) * 0.5 - p[2]];

  function Scene() { this.items = []; }
  // A flat face; its tone from its plane: z const -> top, x const -> right (faces +x), y const -> left (faces +y).
  Scene.prototype.face = function (pts, mat, holes) {
    const same = i => pts.every(p => Math.abs(p[i] - pts[0][i]) < 1e-9);
    const tone = same(2) ? 'top' : same(0) ? 'right' : 'left';
    this.items.push({ kind: 'face', pts, mat, tone, holes: holes || null });
    return this;
  };
  // An axis-aligned block: its three faces that face the viewer (+x, +y, +z).
  Scene.prototype.box = function (x0, x1, y0, y1, z0, z1, mat) {
    this.face([[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], mat);
    this.face([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], mat);
    this.face([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], mat);
    return this;
  };
  // A rectangle in a plane: 'xz' at y, 'yz' at x, 'xy' at z.
  Scene.prototype.rect = function (plane, at, a0, a1, b0, b1, mat, holes) {
    return this.face(rectPts(plane, at, a0, a1, b0, b1), mat, holes);
  };
  // The outline of what the frustum or cylinder between two horizontal circles shows (a bowl, a post).
  Scene.prototype.solid = function (ringA, ringB, mat) {
    this.items.push({ kind: 'hull', pts: ringA.concat(ringB), mat, tone: 'left' });
    return this;
  };
  Scene.prototype.line = function (pts, style) {
    this.items.push({ kind: 'line', pts, style: style || 'seam' });
    return this;
  };

  function rectPts(plane, at, a0, a1, b0, b1) {
    if (plane === 'xz') return [[a0, at, b0], [a1, at, b0], [a1, at, b1], [a0, at, b1]];
    if (plane === 'yz') return [[at, a0, b0], [at, a1, b0], [at, a1, b1], [at, a0, b1]];
    return [[a0, b0, at], [a1, b0, at], [a1, b1, at], [a0, b1, at]];
  }
  // A true circle as 96 points: 'xy' (horizontal) around (cx, cy) at z = at, or 'xz' (on a wall) at y = at.
  function ring(plane, cx, cy, at, r) {
    const out = [];
    for (let i = 0; i < 96; i++) {
      const a = i / 96 * Math.PI * 2, u = cx + r * Math.cos(a), v = cy + r * Math.sin(a);
      out.push(plane === 'xy' ? [u, v, at] : [u, at, v]);
    }
    return out;
  }
  function hull(points) {
    const p = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lower = [], upper = [];
    p.forEach(q => { while (lower.length > 1 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop(); lower.push(q); });
    for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (upper.length > 1 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop(); upper.push(q); }
    return lower.slice(0, -1).concat(upper.slice(0, -1));
  }

  // A flight: steps from the front (the lowest) back, each `run` deep (a list, front first), `rise` high, `w` wide.
  // The side is one face (its sawtooth profile), so no seams run down it.
  function flight(s, w, runs, rise, mat) {
    const total = runs.reduce((a, b) => a + b, 0);
    let y = total;
    const steps = runs.map((run, i) => { const st = { y0: y - run, y1: y, z: (i + 1) * rise }; y -= run; return st; });
    const side = [[w, total, 0]];
    steps.forEach(st => { side.push([w, st.y1, st.z], [w, st.y0, st.z]); });
    side.push([w, 0, 0]);
    // Each riser only from the tread below it to its own (nothing hidden is drawn), back to front; the side last.
    for (let i = steps.length - 1; i >= 0; i--) {
      const st = steps[i], below = i ? steps[i - 1].z : 0;
      s.face([[0, st.y1, below], [w, st.y1, below], [w, st.y1, st.z], [0, st.y1, st.z]], mat);
      s.face([[0, st.y0, st.z], [w, st.y0, st.z], [w, st.y1, st.z], [0, st.y1, st.z]], mat);
    }
    s.face(side, mat);
    return steps;
  }

  // ---- the ten products ----
  const MODELS = {
    // Лестницы: a long narrow flight with a rail on its open side.
    lestnitsa(s) {
      const w = 2.6, rise = 0.62, steps = flight(s, w, [1, 1, 1, 1, 1, 1, 1], rise, 'stone');
      const top = st => [w - 0.18, (st.y0 + st.y1) / 2, st.z];
      // A post on every other step, the first and the last included.
      const tops = steps.filter((st, i) => i % 2 === 0).map(st => { const b = top(st), t = [b[0], b[1], b[2] + 2.1]; s.line([b, t], 'metal-thin'); return t; });
      const a = tops[0], b = tops[tops.length - 1], k = (b[2] - a[2]) / (b[1] - a[1]);
      s.line([[a[0], a[1] + 0.6, a[2] + 0.6 * k], [b[0], b[1] - 0.5, b[2] - 0.5 * k]], 'metal');
    },

    // Ступени: three wide steps up to a landing.
    stupeni(s) {
      flight(s, 6.4, [1.25, 1.25, 2.6], 0.55, 'stone');
    },

    // Подоконники: a window in a wall, the sill running out of it.
    podokonnik(s) {
      const x0 = 2, x1 = 6, z0 = 2.2, z1 = 6.2, back = -0.55;
      s.rect('xy', 7, 0, 8, -1, 0, 'ctx');                    // the wall's top
      s.rect('yz', 8, -1, 0, 0.6, 7, 'ctx');                 // its end
      s.rect('xz', back, x0, x1, z0, z1, 'glass');
      const mx = (x0 + x1) / 2, mz = 4.35, f = 0.14;
      s.line([[x0 + f, back, z0], [x0 + f, back, z1 - f], [x1 - f, back, z1 - f], [x1 - f, back, z0]], 'frame');
      s.line([[mx, back, z0], [mx, back, z1 - f]], 'frame').line([[x0 + f, back, mz], [x1 - f, back, mz]], 'frame');
      s.rect('yz', x0, back, 0, z0, z1, 'ctx');               // the left reveal
      s.box(x0, x1, back, 0, z0 - 0.2, z0, 'stone');           // the sill inside the reveal
      s.rect('xz', 0, 0, 8, 0.6, 7, 'ctx', [rectPts('xz', 0, x0, x1, z0, z1)]);
      s.box(x0 - 0.4, x1 + 0.4, 0, 0.6, z0 - 0.2, z0, 'stone'); // and out of the wall
    },

    // Полы: a floor of nine slabs, every other one a shade lighter.
    pol(s) {
      const n = 3, a = 2, t = 0.28;
      s.box(0, n * a, 0, n * a, 0, t, 'stone');
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++)
        s.rect('xy', t, i * a, (i + 1) * a, j * a, (j + 1) * a, (i + j) % 2 ? 'stone' : 'stone2');
      for (let i = 1; i < n; i++) {
        s.line([[i * a, 0, t], [i * a, n * a, t]]).line([[0, i * a, t], [n * a, i * a, t]]);
        s.line([[i * a, n * a, 0], [i * a, n * a, t]]).line([[n * a, i * a, 0], [n * a, i * a, t]]);
      }
    },

    // Стены: a room's corner clad in slabs.
    stena(s) {
      const h = 5.4, t = 0.28, L = 7, D = 4.6;
      s.rect('xy', 0, 0, L, 0, D, 'ctx');
      s.box(0, L, -t, 0, 0, h, 'stone');
      s.box(-t, 0, -t, D, 0, h, 'stone');
      [L / 3, 2 * L / 3].forEach(x => s.line([[x, 0, 0], [x, 0, h]]));
      s.line([[0, D / 2, 0], [0, D / 2, h]]);
    },

    // Панно: one slab on a wall, bookmatched, set in a slim dark frame.
    panno(s) {
      const x0 = 2, x1 = 5.2, z0 = 1, z1 = 5.6, y = 0.12, b = 0.11, fy = 0.24, i = 0, mx = (x0 + x1) / 2;
      s.rect('xz', 0, -0.6, 7.8, 0, 6.6, 'ctx');
      s.rect('xz', y, x0, x1, z0, z1, 'stone');
      s.box(x0 - b, x1 + b, 0, fy, z1, z1 + b, 'frame');
      s.box(x0 - b, x0, 0, fy, z0, z1, 'frame');
      s.box(x1, x1 + b, 0, fy, z0, z1, 'frame');
      s.box(x0 - b, x1 + b, 0, fy, z0 - b, z0, 'frame');
      // The veins, mirrored about the middle (bookmatch).
      const vein = (side, zA, zB) => {
        const pts = [];
        for (let k = 0; k <= 16; k++) {
          const u = k / 16, dx = (x1 - x0) / 2 - i;
          pts.push([mx + side * dx * (1 - u), y, zA + (zB - zA) * u - Math.sin(u * Math.PI) * 0.12]);
        }
        return pts;
      };
      [-1, 1].forEach(sd => s.line(vein(sd, z1 - 0.9, z0 + 1.2), 'vein'));
    },

    // Фасады: a house of two floors faced in stone.
    fasad(s) {
      const L = 7, D = 4.6, H = 5.6, fl = 2.8;
      s.box(0, L, 0, D, 0, H, 'stone');
      s.line([[0.22, 0.22, H], [L - 0.22, 0.22, H], [L - 0.22, D - 0.22, H], [0.22, D - 0.22, H], [0.22, 0.22, H]]);
      s.line([[0, D, fl], [L, D, fl], [L, 0, fl]]);
      // Front (+y): a door and windows; side (+x): windows.
      [[0.6, 2.3], [4.7, 6.4]].forEach(([a, b]) => s.rect('xz', D, a, b, 0.7, 2.3, 'glass'));
      s.rect('xz', D, 3.0, 4.0, 0, 2.3, 'dark');
      [[0.6, 2.3], [2.85, 4.15], [4.7, 6.4]].forEach(([a, b]) => s.rect('xz', D, a, b, 3.4, 5.0, 'glass'));
      [[0.6, 2.0], [2.6, 4.0]].forEach(([a, b]) => { s.rect('yz', L, a, b, 0.7, 2.3, 'glass'); s.rect('yz', L, a, b, 3.4, 5.0, 'glass'); });
    },

    // Столешницы в ванную: a wall-hung vanity, a stone top, a vessel bowl, a round mirror.
    stoleshnitsa_vannaya(s) {
      s.rect('xz', 0, -0.6, 6.6, 0, 7.2, 'ctx');
      s.face(ring('xz', 3, 5.55, 0, 1.25), 'metal-face');
      s.face(ring('xz', 3, 5.55, 0.01, 1.1), 'glass');
      s.box(0.3, 5.7, 0, 2.0, 1.5, 2.95, 'wood');
      s.line([[3, 2.0, 1.5], [3, 2.0, 2.95]]);
      s.box(0, 6, 0, 2.3, 2.95, 3.2, 'stone');
      const by = 1.2;
      s.line([[3, 0.2, 3.2], [3, 0.2, 4.95], [3, 0.95, 4.95], [3, 0.95, 4.7]], 'metal');
      s.solid(ring('xy', 3, by, 3.9, 1.05), ring('xy', 3, by, 3.2, 0.55), 'ceramic');
      s.face(ring('xy', 3, by, 3.9, 1.05), 'ceramic-in');
    },

    // Столешницы на кухню: an island, its stone top falling down one side, a sink and a tap.
    stoleshnitsa_kuhnya(s) {
      const L = 6.6, D = 2.6, H = 2.7, t = 0.25;
      s.box(0, L - t, 0, D, 0, H, 'wood');
      [2.1, 4.2].forEach(x => s.line([[x, D, 0], [x, D, H]]));
      s.box(L - t, L, -0.1, D + 0.1, 0, H, 'stone');
      s.box(-0.1, L, -0.1, D + 0.1, H, H + t, 'stone');
      s.rect('xy', H + t, 1.1, 2.9, 0.75, 1.95, 'dark');
      s.line([[2, 0.3, H + t], [2, 0.3, H + 1.7], [2, 1.05, H + 1.7], [2, 1.05, H + 1.4]], 'metal');
    },

    // Камины: a portal with a mantel on a hearth, the firebox deep in the wall.
    kaminy(s) {
      const back = -0.7, f0 = 1, f1 = 5, z0 = 0.2, z1 = 3.1;
      s.rect('xz', back, f0, f1, z0, z1, 'dark');
      s.rect('yz', f0, back, 0, z0, z1, 'dark');
      s.rect('xy', z0, f0, f1, back, 0, 'dark');
      s.rect('xz', 0, -1, 7, 0, 6, 'ctx', [rectPts('xz', 0, f0, f1, z0, z1)]);
      s.box(-0.4, 6.4, 0, 1.4, 0, z0, 'stone');
      s.box(0, f0, 0, 0.7, z0, z1, 'stone');
      s.box(f1, 6, 0, 0.7, z0, z1, 'stone');
      s.box(0, 6, 0, 0.7, z1, 3.9, 'stone');
      s.box(-0.35, 6.35, 0, 1.05, 3.9, 4.15, 'stone');
    },
  };

  // ---- the looks ----
  // Per material: [top, left, right]; per line style: [colour, width in px].
  const THEMES = {
    model: {
      name: 'Макет', bg: '#e8e6e0',
      mat: {
        // The stone: warm and the lightest; what stands around it (a wall, a floor): cooler and quieter.
        stone: ['#faf8f4', '#e4ded3', '#c9c1b3'], stone2: ['#f1ece3', '#e4ded3', '#c9c1b3'],
        ctx: ['#eeece8', '#e0ded9', '#d1cfc9'], wood: ['#b7aa98', '#9d8e7b', '#857764'],
        frame: ['#a39b8e', '#8f877a', '#7a7366'],
        glass: ['#7d8985', '#7d8985', '#6d7874'], dark: ['#3b3b38', '#2f2f2c', '#262624'],
        ceramic: ['#fdfcf9', '#ebe8e1', '#ebe8e1'], 'ceramic-in': ['#d6d0c5', '#d6d0c5', '#d6d0c5'],
        'metal-face': ['#4a4944', '#4a4944', '#4a4944'],
      },
      lines: { seam: ['rgba(60,52,40,0.26)', 0.8], frame: ['#e7ebe8', 0.9], vein: ['rgba(60,52,40,0.26)', 0.8], metal: ['#4a4944', 1.5], 'metal-thin': ['#4a4944', 1] },
    },
  };
  const TONE = { top: 0, left: 1, right: 2 };

  // ---- drawing ----
  const PAD = 9, W = 120, H = 80;
  const f2 = v => Math.round(v * 100) / 100;

  function svg(key, themeName) {
    const build = MODELS[key];
    const theme = THEMES[themeName || 'model'];
    if (!build || !theme) return '';
    const s = new Scene();
    build(s);
    // Project everything once; fit the whole to the frame.
    const shapes = s.items.map(it => {
      const pts = it.kind === 'hull' ? hull(it.pts.map(project)) : it.pts.map(project);
      return Object.assign({}, it, { p: pts, h: it.holes ? it.holes.map(r => r.map(project)) : null });
    });
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    // The product fills the frame; its surroundings (a wall, a floor) may run out of it.
    shapes.filter(sh => sh.mat !== 'ctx').forEach(sh => sh.p.forEach(([x, y]) => { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }));
    const k = Math.min((W - 2 * PAD) / (maxX - minX), (H - 2 * PAD) / (maxY - minY));
    const ox = (W - (maxX - minX) * k) / 2 - minX * k, oy = (H - (maxY - minY) * k) / 2 - minY * k;
    const pt = ([x, y]) => f2(x * k + ox) + ' ' + f2(y * k + oy);
    const d = ring => 'M' + ring.map(pt).join('L') + 'Z';

    let out = '';
    shapes.forEach(sh => {
      if (sh.kind === 'line') {
        const [c, w] = theme.lines[sh.style] || theme.lines.seam;
        out += '<path d="M' + sh.p.map(pt).join('L') + '" fill="none" stroke="' + c + '" stroke-width="' + w + '" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>';
        return;
      }
      const fill = theme.mat[sh.mat][TONE[sh.tone]];
      const path = d(sh.p) + (sh.h ? sh.h.map(d).join('') : '');
      // A hairline of the face's own colour closes the seams between faces.
      const edge = [fill, 0.6];
      out += '<path d="' + path + '" fill="' + fill + '"' + (sh.h ? ' fill-rule="evenodd"' : '') +
        ' stroke="' + edge[0] + '" stroke-width="' + edge[1] + '" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>';
    });
    return '<svg class="pi-svg" viewBox="0 0 120 80" preserveAspectRatio="xMidYMid meet" aria-hidden="true">' +
      '<rect width="120" height="80" fill="' + theme.bg + '"/>' + out + '</svg>';
  }

  // Kept for the page's call: nothing shared to install any more.
  function install() {}

  return { install, svg, keys: Object.keys(MODELS), themes: Object.keys(THEMES).map(id => ({ id, name: THEMES[id].name })) };
});
