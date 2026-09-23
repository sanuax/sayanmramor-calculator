// visualizer/material-adapter.js
//
// Stone data -> how the stone looks in 3D. DOM-free and Three.js-free, so
// every rule here is unit-tested in Node:
//
//   resolveMaterial(stone)   the material descriptor: image or procedural
//                            source, finish, pattern scale, tone tweaks
//   partProjection(part, i)  a part as its own piece of stone: grain, extent
//   stoneUVs(...)            world-space planar UVs for a part's vertices
//   adjustForLuminance(...)  keeps near-black stone readable on a dark stage
//   photoExposure(...)       lifts an underexposed photo of a light stone
//   tileCoords/tileParams    tiled floors/walls: every tile its own stone
//
// The stone photo (slabs.json `image`, 850x500, a close-up of the slab's
// surface) is mapped as ONE large piece of stone at a fixed physical size,
// projected in world metres -- never as a small repeating tile. Past its
// edge the photo is mirrored (a bookmatch, how real slabs are joined), so a
// part up to one photo long shows no join and a longer one a bookmatch --
// never a grid of copies.
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.MaterialAdapter = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {

  // Neutral warm stone for a stone with no color data (398 of the catalog)
  // or no stone selected yet -- deliberately not a guess at its real color.
  const GENERIC_FALLBACK = { fallbackColor: '#bab2a6', roughness: 0.4, metalness: 0, clearcoat: 0.3 };

  // Surface finish per catalog category (slabs.json `category`). The catalog
  // has no finish field, so this is the usual finish for the stone type.
  // Polished stone: a thin clear coat for a calm, soft reflection over a
  // slightly rough base -- never a mirror. Honed/matte: diffuse, no coat.
  const POLISHED = { finish: 'polished', roughness: 0.34, metalness: 0, clearcoat: 0.42, clearcoatRoughness: 0.16 };
  const HIGH_GLOSS = { finish: 'polished', roughness: 0.28, metalness: 0, clearcoat: 0.55, clearcoatRoughness: 0.12 };
  const HONED = { finish: 'honed', roughness: 0.66, metalness: 0, clearcoat: 0.04, clearcoatRoughness: 0.4 };
  const MATTE = { finish: 'matte', roughness: 0.82, metalness: 0, clearcoat: 0, clearcoatRoughness: 0.5 };
  const CATEGORY_BASE = {
    marble: POLISHED, granite: POLISHED, quartzite: POLISHED, 'artificial-marble': POLISHED,
    'quartz-agglomerate': HIGH_GLOSS, quartz: HIGH_GLOSS,
    oniks: HIGH_GLOSS, agate: HIGH_GLOSS, labradorite: HIGH_GLOSS, obsidian: HIGH_GLOSS,
    jasper: HIGH_GLOSS, kvarc: HIGH_GLOSS, 'tigrovyi-glaz': HIGH_GLOSS, 'petrified-wood': POLISHED,
    aragonit: POLISHED, septariya: POLISHED, 'specennyi-kamen': POLISHED,
    travertin: HONED, travertine: HONED, limestone: HONED, soapstone: HONED,
    slate: MATTE, pescanik: MATTE,
  };

  // How much the stone's pattern should speak, per category. The span is
  // the physical length the photo covers: close to a real slab's usable
  // length for figured stone, so a usual countertop, island or panel is ONE
  // piece with no join, as it would be cut from one slab. Expressive
  // stones keep their photo as is and show a large piece of it; calm ones
  // are toned down slightly; granular ones (granite, engineered stone) are
  // a fine, even grain photographed close up, so a smaller span keeps the
  // grain at its real size instead of blowing it up into blotches.
  // `procedural` is the look of the same stone WITHOUT a photo: soft
  // clouding in its own color (stronger for figured stone), or a fine
  // speckle for granular stone -- a quiet stand-in, never fake veins.
  const CHARACTER = {
    expressive: { patternSpanM: 2.4, contrast: 1, saturation: 1, procedural: { pattern: 'cloud', amount: 0.2 } },
    calm: { patternSpanM: 2, contrast: 0.92, saturation: 0.96, procedural: { pattern: 'cloud', amount: 0.12 } },
    granular: { patternSpanM: 1.2, contrast: 0.94, saturation: 0.96, procedural: { pattern: 'speckle', amount: 0.16 } },
  };
  // Nothing chosen yet: the calmest neutral surface.
  const NEUTRAL_PROCEDURAL = { pattern: 'cloud', amount: 0.1 };
  const CATEGORY_CHARACTER = {
    marble: 'expressive', oniks: 'expressive', quartzite: 'expressive', labradorite: 'expressive',
    agate: 'expressive', jasper: 'expressive', 'tigrovyi-glaz': 'expressive', 'petrified-wood': 'expressive',
    aragonit: 'expressive', septariya: 'expressive', obsidian: 'expressive',
    limestone: 'calm', travertin: 'calm', travertine: 'calm', soapstone: 'calm', slate: 'calm',
    pescanik: 'calm', 'artificial-marble': 'calm',
    granite: 'granular', 'quartz-agglomerate': 'granular', quartz: 'granular', kvarc: 'granular',
    'specennyi-kamen': 'granular',
  };
  // Dark stones read as calm whatever their type: their pattern is a
  // low-key play of light, not a figure.
  const DARK_SEGMENTS = ['black', 'black-and-gold'];

  // One representative tone per catalog color segment (slabs.json
  // `colors[0].segment`) -- the stone's own listed color, not an invention.
  const COLOR_HEX = {
    white: '#ece8e1', beige: '#d8c8ac', cream: '#ece3cf', gray: '#8f8b86', grey: '#8f8b86',
    'light-grey': '#c4c0ba', black: '#2b2927', brown: '#6e5442', yellow: '#d2b776',
    golden: '#c8a668', gold: '#c8a668', 'black-and-gold': '#35302a', 'cerno-belyi': '#8c8986',
    green: '#5f7b63', red: '#8b4336', pink: '#d4aaa0', blue: '#4f6e89', 'light-blue': '#a3b9c8',
    violet: '#6f5b79',
  };

  // The stone photos: 850x500 px. A thin border is cropped off every photo
  // so a scanner edge or a slab's rim never reaches the model.
  const IMAGE_ASPECT = 850 / 500;
  const IMAGE_CROP = 0.03;
  const IMAGE_DIR = 'data/';
  // slabs.json stores `images/<id>.webp`; anything else (a URL, a path
  // escaping data/, a non-image) is not trusted as a texture.
  const IMAGE_PATH = /^images\/[a-z0-9][a-z0-9._-]*\.(webp|jpe?g|png)$/i;

  function imageUrlFor(stone) {
    const image = stone && typeof stone.image === 'string' ? stone.image : '';
    return IMAGE_PATH.test(image) && !image.includes('..') ? IMAGE_DIR + image : null;
  }

  function characterFor(stone) {
    const segment = stone && stone.colors && stone.colors[0] && stone.colors[0].segment;
    if (DARK_SEGMENTS.includes(segment)) return 'calm';
    return (stone && CATEGORY_CHARACTER[stone.category]) || 'calm';
  }

  function resolveMaterial(stone, bookmatchMode) {
    const base = (stone && CATEGORY_BASE[stone.category]) || Object.assign({ finish: 'polished', clearcoatRoughness: 0.16 }, GENERIC_FALLBACK);
    const segment = (stone && stone.colors && stone.colors[0] && stone.colors[0].segment) || null;
    const fallbackColor = COLOR_HEX[segment] || GENERIC_FALLBACK.fallbackColor;
    const imageUrl = imageUrlFor(stone);
    const characterName = characterFor(stone);
    const character = CHARACTER[characterName];
    const dark = DARK_SEGMENTS.includes(segment);
    const polished = base.finish === 'polished';

    return {
      stoneId: (stone && stone.id) || null,
      source: imageUrl ? 'image' : 'procedural',
      imageUrl,
      imageCrop: IMAGE_CROP,
      // Color shown until the photo is loaded, and for a stone without one.
      fallbackColor,
      colorSegment: segment,
      finish: base.finish,
      roughness: base.roughness,
      metalness: base.metalness,
      clearcoat: base.clearcoat,
      clearcoatRoughness: base.clearcoatRoughness,
      // A polished surface carries its detail in the photo -- no relief and
      // an even sheen (a grain in its roughness reads as blotchy metal); a
      // honed one keeps a soft tactile grain in both.
      bumpScale: polished ? 0 : 0.28,
      microGrain: !polished,
      // Dark stone is revealed by what it reflects, so it gets more of the
      // studio's soft light -- without being lightened.
      envMapIntensity: dark ? 1 : polished ? 0.8 : 0.55,
      character: characterName,
      contrast: character.contrast,
      saturation: character.saturation,
      // Physical size of the photo on the model: [long side, short side] in
      // metres. A procedural stone keeps 1 m so its fine noise stays as is.
      patternSizeM: imageUrl
        ? [character.patternSpanM, round3(character.patternSpanM / IMAGE_ASPECT)]
        : [1, 1],
      procedural: Object.assign({}, stone ? character.procedural : NEUTRAL_PROCEDURAL),
      projection: 'world-planar',
      bookmatchMode,
    };
  }

  // Measured mean luminance of the loaded photo (0..1) -> final tweaks.
  // Near-black stone gets a touch more reflection and a slightly finer
  // clear coat so its form reads on the dark stage; its color is untouched.
  function adjustForLuminance(descriptor, meanLuminance) {
    const lum = Number.isFinite(meanLuminance) ? Math.min(1, Math.max(0, meanLuminance)) : 0.5;
    if (lum >= 0.14) return Object.assign({}, descriptor, { meanLuminance: round3(lum) });
    const k = (0.14 - lum) / 0.14; // 0 at the threshold, 1 for pure black
    return Object.assign({}, descriptor, {
      meanLuminance: round3(lum),
      envMapIntensity: round3(Math.max(descriptor.envMapIntensity, 1 + 0.2 * k)),
      clearcoat: round3(Math.max(descriptor.clearcoat, 0.5)),
      clearcoatRoughness: round3(Math.min(descriptor.clearcoatRoughness, 0.12)),
    });
  }

  // Catalog photos are not exposed alike: a stone the catalog lists as
  // white can arrive as a dull grey picture. For light-listed stones only,
  // a photo darker than the listed tone gets a moderate, capped exposure
  // lift (a multiplier for the photo's pixels); every other photo is kept
  // exactly as shot.
  const LIGHT_SEGMENTS = ['white', 'cream', 'light-grey'];
  const LIGHT_MIN_LUMINANCE = 0.66;
  const MAX_EXPOSURE_GAIN = 1.35;

  function photoExposure(descriptor, meanLuminance) {
    if (!descriptor || !LIGHT_SEGMENTS.includes(descriptor.colorSegment)) return 1;
    if (!Number.isFinite(meanLuminance) || meanLuminance <= 0) return 1;
    return round3(Math.min(MAX_EXPOSURE_GAIN, Math.max(1, LIGHT_MIN_LUMINANCE / meanLuminance)));
  }

  function round3(n) { return Math.round(n * 1000) / 1000; }

  // ---- projection ----------------------------------------------------------

  // Each stone part of a product (a countertop, its L wing, an island, a
  // tread, a riser) is its own piece of stone, as in reality: the grain runs
  // along the part's longest horizontal edge (on a turning stair, each tread
  // along itself), the photo starts at the part's own corner, and a part
  // that fits inside the photo shows NO join at all. Parts that stand next
  // to each other take different, deterministic regions of the photo, so
  // ten treads never look like ten copies. A part taller than it is long (a
  // standing panel) turns the photo upright on its faces.
  const GOLDEN = 0.6180339887;

  function frac(n) { return n - Math.floor(n); }

  function partProjection(part, index) {
    let grain = [0, 1];
    let footprint;
    let y0, y1;
    if (part.outline && part.outline.length >= 2) {
      let best = -1;
      const pts = part.outline;
      for (let i = 0; i < pts.length; i++) {
        const [x0, z0] = pts[i];
        const [x1, z1] = pts[(i + 1) % pts.length];
        const len = Math.hypot(x1 - x0, z1 - z0);
        if (len > best + 1e-9) { best = len; grain = [(x1 - x0) / len, (z1 - z0) / len]; }
      }
      footprint = pts;
      y0 = part.y0 || 0; y1 = part.y1 || 0;
    } else {
      const [cx, cy, cz] = part.center, [sx, sy, sz] = part.size;
      grain = sx > sz ? [1, 0] : [0, 1];
      footprint = [[cx - sx / 2, cz - sz / 2], [cx + sx / 2, cz - sz / 2], [cx + sx / 2, cz + sz / 2], [cx - sx / 2, cz + sz / 2]];
      y0 = cy - sy / 2; y1 = cy + sy / 2;
    }
    // A consistent sense: grain always points toward +Z (or +X on ties),
    // so two parts with parallel edges get identical projections.
    if (grain[1] < -1e-9 || (Math.abs(grain[1]) <= 1e-9 && grain[0] < 0)) grain = [-grain[0], -grain[1]];
    grain = [round6(grain[0]) + 0, round6(grain[1]) + 0];
    const along = footprint.map(([x, z]) => x * grain[0] + z * grain[1]);
    const across = footprint.map(([x, z]) => x * -grain[1] + z * grain[0]);
    const a0 = Math.min(...along), b0 = Math.min(...across);
    const lengthM = Math.max(...along) - a0, widthM = Math.max(...across) - b0, heightM = y1 - y0;
    return {
      grain,
      upright: heightM > Math.max(lengthM, widthM),
      start: [round6(a0), round6(b0), round6(y0)],
      extent: [round6(lengthM), round6(widthM), round6(heightM)],
      seed: Number.isInteger(index) && index >= 0 ? index : 0,
    };
  }

  function round6(n) { return Math.round(n * 1e6) / 1e6; }

  // Where in the photo a part starts (photo units): somewhere inside the
  // room left once the part itself fits, chosen by its index -- never
  // random, never past the photo edge when the part fits.
  function photoOffset(seed, extentM, spanM, salt) {
    const room = Math.max(0, 1 - extentM / spanM);
    return frac((seed + 1) * GOLDEN + salt) * room;
  }

  // Planar UVs in "photo units" (1 = one photo span) for vertices in layout
  // space (metres; wall = -X, room = +X, run = Z, up = +Y). Each face is
  // projected onto its own plane:
  //   horizontal faces -> (along grain, across grain)
  //   vertical faces   -> (along the face, height); turned for an upright
  //                       part so the long side of the photo stands
  // A face that runs along the grain shares the top's `along` coordinate,
  // so a countertop's veins run on over its front edge.
  function stoneUVs(positions, normals, { projection, patternSizeM }) {
    const count = positions.length / 3;
    const uv = new Float32Array(count * 2);
    const { grain: [gx, gz], upright, start: [a0, b0, y0], extent: [lengthM, widthM, heightM], seed } = projection;
    const U = patternSizeM[0], V = patternSizeM[1];
    // Where the part starts in the photo, per axis and in that axis' units.
    const offA = photoOffset(seed, lengthM, U, 0), offB = photoOffset(seed, widthM, V, 0.5);
    const offAcrossU = photoOffset(seed, widthM, U, 0.75), offHeightV = photoOffset(seed, heightM, V, 0.5);
    const offHeightU = photoOffset(seed, heightM, U, 0.25);
    const offAlongV = photoOffset(seed, lengthM, V, 0.25), offAcrossV = offB;
    for (let i = 0; i < count; i++) {
      const x = positions[i * 3], y = positions[i * 3 + 1] - y0, z = positions[i * 3 + 2];
      const nx = normals[i * 3], ny = normals[i * 3 + 1], nz = normals[i * 3 + 2];
      const a = x * gx + z * gz - a0;   // along the grain
      const b = x * -gz + z * gx - b0;  // across it
      let u, v;
      if (Math.abs(ny) >= Math.max(Math.abs(nx), Math.abs(nz))) {
        u = a / U + offA; v = b / V + offB;
      } else {
        // The face's horizontal direction: along the grain or across it,
        // from the face's orientation -- independent of vertex order.
        const faceAlong = Math.abs(nx * gx + nz * gz) < Math.abs(nx * -gz + nz * gx);
        if (upright) {
          u = y / U + offHeightU;
          v = faceAlong ? a / V + offAlongV : b / V + offAcrossV;
        } else {
          u = faceAlong ? a / U + offA : b / U + offAcrossU;
          v = y / V + offHeightV;
        }
      }
      uv[i * 2] = u;
      uv[i * 2 + 1] = v;
    }
    return uv;
  }

  // ---- tiled surfaces (floor, wall, facade with a joint layout) -------------

  // A tiled surface is many pieces of stone, not one: each tile shows its
  // own region of the photo, picked per tile by a fixed hash of its grid
  // cell (in the renderer's shader), so a floor never becomes one giant
  // mirrored kaleidoscope across its joints. Here: the tile-grid coordinate
  // of every vertex on the tiled face (in tiles; integer = joint), NO_TILE
  // for every other face.
  const NO_TILE = -1e5;

  function tileCoords(positions, normals, tiling, projection) {
    const count = positions.length / 3;
    const out = new Float32Array(count * 2).fill(NO_TILE);
    if (!tiling || !(tiling.moduleM > 0)) return out;
    const mod = tiling.moduleM;
    const alongZ = Math.abs(projection.grain[1]) >= Math.abs(projection.grain[0]);
    for (let i = 0; i < count; i++) {
      const x = positions[i * 3], y = positions[i * 3 + 1], z = positions[i * 3 + 2];
      const nx = normals[i * 3], ny = normals[i * 3 + 1];
      let s, t;
      if (tiling.plane === 'top') {
        if (ny <= 0.5) continue;
        if (tiling.pattern === 'diagonal') {
          // Joints run along z = x + c and z = -x + c from the slab's
          // corners (SceneLayout's diagonalSeams): a square grid turned 45deg.
          s = ((x + z) - (tiling.x0 + tiling.z0)) / (Math.SQRT2 * mod);
          t = ((z - x) - (tiling.z0 - tiling.x1)) / (Math.SQRT2 * mod);
        } else if (alongZ) {
          s = (z - tiling.z0) / mod; t = (x - tiling.x0) / mod;
        } else {
          s = (x - tiling.x0) / mod; t = (z - tiling.z0) / mod;
        }
      } else if (tiling.plane === 'front') {
        if (nx <= 0.5) continue;
        const hz = (z - tiling.z0) / mod, hy = (y - tiling.y0) / mod;
        // A full-height panel is a standing slab: the photo's long side up.
        if (projection.upright || tiling.pattern === 'panels') { s = hy; t = hz; } else { s = hz; t = hy; }
      } else {
        continue;
      }
      out[i * 2] = s;
      out[i * 2 + 1] = t;
    }
    return out;
  }

  // One tile in photo units, how far into the photo a tile may start (so a
  // tile that fits the photo never crosses its edge), and which grid axes
  // really have joints. A "panels" wall is split only along its run; along
  // the height each panel is one standing slab (bookmatched where it
  // outgrows the photo), started at its own height so that neighbouring
  // panels never repeat each other.
  function tileParams(tiling, projection, patternSizeM) {
    if (!tiling || !(tiling.moduleM > 0)) return null;
    const mod = tiling.moduleM;
    const split = tiling.pattern === 'panels' ? [0, 1] : [1, 1];
    const cell = [round6(mod / patternSizeM[0]), round6(mod / patternSizeM[1])];
    const room = cell.map((c, k) => (split[k] ? round6(Math.max(0, 1 - c)) : 1));
    return { cell, room, split };
  }

  return {
    resolveMaterial, adjustForLuminance, photoExposure, partProjection, stoneUVs, imageUrlFor,
    tileCoords, tileParams, NO_TILE,
    COLOR_HEX, CATEGORY_BASE, CATEGORY_CHARACTER, CHARACTER, IMAGE_ASPECT, IMAGE_CROP,
  };
});
