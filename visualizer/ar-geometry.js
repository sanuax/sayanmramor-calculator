// visualizer/ar-geometry.js
//
// The pure geometry of AR («Поставить у себя в комнате», the owner,
// 2026-10-22): how the product is turned and placed in the client's room,
// and the tiled stone baked into plain UVs for a USDZ (AR Quick Look draws
// standard materials only, not our stone shader). Loaded only with
// ar-view.js, on the tap -- never with the page.
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.ArGeometry = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {

  // Hung on a wall: walls, panels and every facade piece but a column
  // (the owner, 2026-10-23). Everything else stands on the floor or on a
  // surface (a countertop on the client's own cabinets or a table; a
  // fireplace, a column, stairs on the floor).
  const WALL_PRODUCTS = ['stena', 'panno'];
  function anchorFor(productKey, model) {
    if (productKey === 'fasad') return model && model.facade && model.facade.type === 'column' ? 'floor' : 'wall';
    return WALL_PRODUCTS.includes(productKey) ? 'wall' : 'floor';
  }

  // AR Quick Look hangs a model on a wall in the wall anchor's own frame,
  // where Y points out of the wall (as Y points up from a floor): a wall
  // piece standing upright came out of the wall like a shelf (the owner's
  // iPhone, 2026-10-23: walls and panels lay flat). So for Quick Look it
  // goes in lying face up -- its front (+Z after placeFor) turned to +Y, its
  // top to -Z. WebXR places in the room's own frame and needs no turn.
  const QUICK_LOOK_WALL_TURN_X = -Math.PI / 2;
  function quickLookTurnX(anchor) {
    return anchor === 'wall' ? QUICK_LOOK_WALL_TURN_X : 0;
  }

  // The layout's front -- the room side -- is +X (VisualizerConstants); in AR
  // the front faces the viewer, +Z: a quarter turn about Y. Then, from the
  // product's own bounds: on a surface its bottom on it, centred; on a wall
  // its back on the wall, centred on the point tapped.
  const AR_TURN = -Math.PI / 2;
  function placeFor(bounds, anchor) {
    const { min, max } = bounds;
    const across = (min[2] + max[2]) / 2;
    return anchor === 'wall'
      ? { rotationY: AR_TURN, position: [across, -(min[1] + max[1]) / 2, -min[0]] }
      : { rotationY: AR_TURN, position: [across, -min[1], -(min[0] + max[0]) / 2] };
  }

  // UVs through a texture's transform (three.js Matrix3 elements, column-major).
  function transformUvs(uvs, m) {
    const out = new Float32Array(uvs.length);
    for (let i = 0; i < uvs.length; i += 2) {
      const u = uvs[i], v = uvs[i + 1];
      out[i] = m[0] * u + m[3] * v + m[6];
      out[i + 1] = m[1] * u + m[4] * v + m[7];
    }
    return out;
  }

  // ---- tiles ----------------------------------------------------------------
  //
  // On screen every tile is sampled from its own region of the photo
  // (three-scene.js STONE_TILE_FRAGMENT): u = (split ? fract(tile) : tile) *
  // cell + pick * room, pick a fixed hash of the tile's grid cell. Baked here:
  // each triangle cut along the tile joints, so a piece lies in one tile, and
  // its UVs computed with the same formula. (The hash runs in double here and
  // in float on the GPU -- the regions may differ from the screen; each tile
  // is still its own piece of stone.)

  const NO_TILE_ABOVE = -1000;   // MaterialAdapter.NO_TILE: a face outside the tiling
  const fract = x => x - Math.floor(x);

  function tilePick(cell) {
    return [
      fract(Math.sin(cell[0] * 127.1 + cell[1] * 311.7) * 43758.5453),
      fract(Math.sin(cell[0] * 269.5 + cell[1] * 183.3) * 43758.5453),
    ];
  }

  const lerp = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  const lerpVertex = (a, b, t) => ({ p: lerp(a.p, b.p, t), n: lerp(a.n, b.n, t), t: lerp(a.t, b.t, t) });

  // The part of a convex polygon where sign * (tile[axis] - k) >= 0.
  function clip(poly, axis, k, sign) {
    const out = [];
    poly.forEach((a, i) => {
      const b = poly[(i + 1) % poly.length];
      const da = sign * (a.t[axis] - k), db = sign * (b.t[axis] - k);
      if (da >= 0) out.push(a);
      if ((da >= 0) !== (db >= 0)) out.push(lerpVertex(a, b, da / (da - db)));
    });
    return out;
  }

  // A polygon cut into the tiles it covers along one axis.
  function cutAxis(poly, axis) {
    const values = poly.map(v => v.t[axis]);
    const first = Math.floor(Math.min(...values)), last = Math.ceil(Math.max(...values));
    if (last - first <= 1) return [poly];
    const pieces = [];
    for (let k = first; k < last; k++) {
      const piece = clip(clip(poly, axis, k, 1), axis, k + 1, -1);
      if (piece.length >= 3) pieces.push(piece);
    }
    return pieces;
  }

  function tileUv(v, cellIndex, params) {
    const pick = tilePick(cellIndex);
    return [0, 1].map(k => (params.split[k] ? v.t[k] - cellIndex[k] : v.t[k]) * params.cell[k] + pick[k] * params.room[k]);
  }

  const unit = n => { const l = Math.hypot(...n); return l > 1e-12 ? n.map(c => c / l) : n; };

  // Non-indexed triangles in, non-indexed triangles out: positions and
  // normals (3 per vertex), uvs and tile coordinates (2 per vertex);
  // params = MaterialAdapter.tileParams(). A triangle outside the tiling
  // keeps its UVs.
  function cutByTiles(positions, normals, uvs, tiles, params) {
    const P = [], N = [], U = [];
    const vertex = i => ({ p: [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]], n: [normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2]], t: [tiles[i * 2], tiles[i * 2 + 1]] });
    for (let tri = 0; tri < positions.length / 9; tri++) {
      const ids = [tri * 3, tri * 3 + 1, tri * 3 + 2];
      if (ids.some(i => tiles[i * 2] <= NO_TILE_ABOVE)) {
        ids.forEach(i => { P.push(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]); N.push(normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2]); U.push(uvs[i * 2], uvs[i * 2 + 1]); });
        continue;
      }
      let pieces = [ids.map(vertex)];
      [0, 1].forEach(axis => { if (params.split[axis]) pieces = pieces.flatMap(poly => cutAxis(poly, axis)); });
      pieces.forEach(poly => {
        const centre = [0, 1].map(k => poly.reduce((s, v) => s + v.t[k], 0) / poly.length);
        const cellIndex = [0, 1].map(k => (params.split[k] ? Math.floor(centre[k]) : 0));
        for (let j = 1; j + 1 < poly.length; j++) {
          [poly[0], poly[j], poly[j + 1]].forEach(v => {
            P.push(...v.p); N.push(...unit(v.n)); U.push(...tileUv(v, cellIndex, params));
          });
        }
      });
    }
    return { positions: new Float32Array(P), normals: new Float32Array(N), uvs: new Float32Array(U) };
  }

  // ---- seams ----------------------------------------------------------------
  //
  // The 3D draws the joints between tiles and slabs as lines a hair over
  // the stone; a USDZ has no lines. Each becomes a thin square bar along the
  // line instead -- seen from any side, whatever surface it lies on (flat,
  // a radius wall, a panel's inlay).
  const SEAM_WIDTH_M = 0.0016;

  function seamBars(segments, width) {
    const w = (width || SEAM_WIDTH_M) / 2;
    const P = [], N = [];
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    for (let i = 0; i + 5 < segments.length; i += 6) {
      const a = [segments[i], segments[i + 1], segments[i + 2]], b = [segments[i + 3], segments[i + 4], segments[i + 5]];
      const d = unit(sub(b, a));
      if (!(Math.hypot(...d) > 0.5)) continue;   // a zero-length segment
      const u = unit(cross(d, Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));
      const v = cross(d, u);
      // The bar's four sides, each facing out: +u, +v, -u, -v.
      [[u, v], [v, u.map(c => -c)], [u.map(c => -c), v.map(c => -c)], [v.map(c => -c), u]].forEach(([n, side]) => {
        const corner = (p, s) => [0, 1, 2].map(k => p[k] + n[k] * w + side[k] * w * s);
        const a0 = corner(a, -1), a1 = corner(a, 1), b0 = corner(b, -1), b1 = corner(b, 1);
        // Counter-clockwise seen from outside: a USDZ is drawn one-sided.
        [a0, b1, b0, a0, a1, b1].forEach(q => { P.push(...q); N.push(...n); });
      });
    }
    return { positions: new Float32Array(P), normals: new Float32Array(N) };
  }

  return { anchorFor, placeFor, quickLookTurnX, transformUvs, tilePick, cutByTiles, seamBars, WALL_PRODUCTS, SEAM_WIDTH_M };
});
