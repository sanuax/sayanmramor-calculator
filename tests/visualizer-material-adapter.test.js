const test = require('node:test');
const assert = require('node:assert/strict');
const MaterialAdapter = require('../visualizer/material-adapter.js');
const { createFakeDoc } = require('./helpers/fake-dom.js');
const ConstructorState = require('../constructor-state.js');
const ProductTypes = require('../product-types.js');
const GeometryModel = require('../visualizer/geometry-model.js');
const SceneLayout = require('../visualizer/scene-layout.js');

const { resolveMaterial, adjustForLuminance, partProjection, stoneUVs } = MaterialAdapter;

const DELICATO = { id: 'delicato-brown', name: 'Delicato Brown', category: 'marble', colors: [{ segment: 'beige' }], image: 'images/delicato-brown.webp' };

// ---- resolver ---------------------------------------------------------------

test('resolveMaterial returns a marble-ish appearance for category "marble"', () => {
  const result = resolveMaterial({ category: 'marble', colors: [{ segment: 'beige' }] }, 'none');
  assert.equal(typeof result.fallbackColor, 'string');
  assert.ok(/^#[0-9a-f]{6}$/i.test(result.fallbackColor));
  assert.ok(result.roughness >= 0 && result.roughness <= 1);
  assert.ok(result.metalness >= 0 && result.metalness <= 1);
});

test('resolveMaterial returns a darker fallback color for a dark color segment than a light one, same category', () => {
  const dark = resolveMaterial({ category: 'granite', colors: [{ segment: 'black' }] }, 'none');
  const light = resolveMaterial({ category: 'granite', colors: [{ segment: 'white' }] }, 'none');
  const luminance = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    return ((n >> 16) & 0xff) + ((n >> 8) & 0xff) + (n & 0xff);
  };
  assert.ok(luminance(dark.fallbackColor) < luminance(light.fallbackColor));
});

test('resolveMaterial falls back to a generic grey for an unknown category', () => {
  const result = resolveMaterial({ category: 'unobtainium', colors: [] }, 'none');
  assert.equal(typeof result.fallbackColor, 'string');
});

test('resolveMaterial falls back to a generic grey when stone is null (no material selected yet)', () => {
  const result = resolveMaterial(null, 'none');
  assert.equal(typeof result.fallbackColor, 'string');
  assert.equal(result.source, 'procedural');
  assert.equal(result.imageUrl, null);
});

test('resolveMaterial passes bookmatchMode through unchanged', () => {
  const result = resolveMaterial({ category: 'marble', colors: [] }, 'mirrored');
  assert.equal(result.bookmatchMode, 'mirrored');
});

test('a stone with a catalog photo is drawn from that photo, relative to the calculator page', () => {
  const result = resolveMaterial(DELICATO, 'none');
  assert.equal(result.source, 'image');
  assert.equal(result.imageUrl, 'data/images/delicato-brown.webp');
  assert.equal(result.stoneId, 'delicato-brown');
  assert.equal(result.projection, 'world-planar');
});

test('a stone without a photo gets the procedural stone -- its listed color, category finish', () => {
  const result = resolveMaterial({ id: 'x', category: 'granite', colors: [{ segment: 'green' }] }, 'none');
  assert.equal(result.source, 'procedural');
  assert.equal(result.imageUrl, null);
  assert.equal(result.fallbackColor, MaterialAdapter.COLOR_HEX.green);
  assert.deepEqual(result.patternSizeM, [1, 1]);
});

test('the procedural fallback is category-aware: figured stone clouds more than calm, granular stone speckles', () => {
  const noPhoto = category => resolveMaterial({ id: 'x', category, colors: [{ segment: 'white' }] }, 'none').procedural;
  assert.equal(noPhoto('marble').pattern, 'cloud');
  assert.equal(noPhoto('travertin').pattern, 'cloud');
  assert.equal(noPhoto('granite').pattern, 'speckle');
  assert.ok(noPhoto('marble').amount > noPhoto('travertin').amount);
  [noPhoto('marble'), noPhoto('granite'), resolveMaterial(null, 'none').procedural].forEach(p => assert.ok(p.amount > 0 && p.amount <= 0.25, 'never over-textured'));
  assert.ok(resolveMaterial(null, 'none').procedural.amount <= noPhoto('travertin').amount, 'nothing chosen: the calmest surface');
});

test('an unusable image path never becomes a texture: URLs, path escapes, non-images, non-strings', () => {
  ['http://evil.example/x.webp', '//cdn/x.webp', '../images/x.webp', 'images/../../x.webp', 'images/x.exe', 'x.webp', '', 42, null].forEach(image => {
    const result = resolveMaterial(Object.assign({}, DELICATO, { image }), 'none');
    assert.equal(result.source, 'procedural', String(image));
    assert.equal(result.imageUrl, null, String(image));
  });
});

test('a stone without color data gets a safe neutral fallback color, never undefined/NaN', () => {
  [{ category: 'marble' }, { category: 'marble', colors: [] }, { category: 'marble', colors: [{}] }, { category: 'marble', colors: [{ segment: 'exclusive' }] }, {}].forEach(stone => {
    const result = resolveMaterial(stone, 'none');
    assert.ok(/^#[0-9a-f]{6}$/i.test(result.fallbackColor));
  });
});

test('every category x color segment gives a complete descriptor: no undefined, no NaN', () => {
  const categories = Object.keys(MaterialAdapter.CATEGORY_BASE).concat(['unknown', undefined]);
  const segments = Object.keys(MaterialAdapter.COLOR_HEX).concat([undefined]);
  categories.forEach(category => segments.forEach(segment => {
    [true, false].forEach(withImage => {
      const stone = { id: 's', category, colors: segment ? [{ segment }] : [], image: withImage ? 'images/s.webp' : undefined };
      const d = resolveMaterial(stone, 'none');
      Object.entries(d).forEach(([k, v]) => {
        assert.notEqual(v, undefined, category + '/' + segment + ': ' + k);
        if (typeof v === 'number') assert.ok(Number.isFinite(v), category + '/' + segment + ': ' + k);
      });
      d.patternSizeM.forEach(n => assert.ok(Number.isFinite(n) && n > 0));
      assert.ok(['polished', 'honed', 'matte'].includes(d.finish));
    });
  }));
});

test('resolveMaterial is deterministic: the same stone always resolves to the same descriptor', () => {
  assert.deepEqual(resolveMaterial(DELICATO, 'none'), resolveMaterial(JSON.parse(JSON.stringify(DELICATO)), 'none'));
});

test('finish follows the stone type: polished stone is smoother and coated, honed/matte diffuse -- none is a mirror', () => {
  const marble = resolveMaterial({ category: 'marble' }, 'none');
  const travertine = resolveMaterial({ category: 'travertin' }, 'none');
  const slate = resolveMaterial({ category: 'slate' }, 'none');
  assert.equal(marble.finish, 'polished');
  assert.equal(travertine.finish, 'honed');
  assert.equal(slate.finish, 'matte');
  assert.ok(marble.roughness < travertine.roughness && travertine.roughness < slate.roughness);
  assert.ok(marble.clearcoat > travertine.clearcoat);
  assert.ok(marble.bumpScale < travertine.bumpScale, 'a polished face carries its detail in the photo, not relief');
  Object.values(MaterialAdapter.CATEGORY_BASE).forEach(base => {
    assert.ok(base.roughness >= 0.25, 'never mirror-smooth');
    assert.ok(base.clearcoat <= 0.6);
  });
});

test('expressive stones show a large piece of their photo at full contrast; calm and granular ones less', () => {
  const marble = resolveMaterial(Object.assign({}, DELICATO, { category: 'marble' }), 'none');
  const onyx = resolveMaterial(Object.assign({}, DELICATO, { category: 'oniks' }), 'none');
  const travertine = resolveMaterial(Object.assign({}, DELICATO, { category: 'travertin' }), 'none');
  const granite = resolveMaterial(Object.assign({}, DELICATO, { category: 'granite' }), 'none');
  assert.equal(marble.character, 'expressive');
  assert.equal(onyx.character, 'expressive');
  assert.equal(travertine.character, 'calm');
  assert.equal(granite.character, 'granular');
  assert.equal(marble.contrast, 1);
  assert.ok(travertine.contrast < 1 && granite.contrast < 1);
  assert.ok(marble.patternSizeM[0] > travertine.patternSizeM[0] && travertine.patternSizeM[0] > granite.patternSizeM[0]);
});

test('a dark marble reads as calm, and gets more of the studio reflection so it does not vanish', () => {
  const black = resolveMaterial(Object.assign({}, DELICATO, { colors: [{ segment: 'black' }] }), 'none');
  const beige = resolveMaterial(DELICATO, 'none');
  assert.equal(black.character, 'calm');
  assert.ok(black.envMapIntensity > beige.envMapIntensity);
});

test('the photo keeps its proportions on the model: pattern size has the photo\'s aspect (no stretch)', () => {
  const d = resolveMaterial(DELICATO, 'none');
  const cropped = (850 * (1 - 2 * d.imageCrop)) / (500 * (1 - 2 * d.imageCrop));
  assert.ok(Math.abs(d.patternSizeM[0] / d.patternSizeM[1] - cropped) < 0.01);
});

test('adjustForLuminance: near-black photos get more reflection and a finer coat, others are untouched; bad input is safe', () => {
  const d = resolveMaterial(DELICATO, 'none');
  const light = adjustForLuminance(d, 0.6);
  assert.equal(light.envMapIntensity, d.envMapIntensity);
  assert.equal(light.clearcoat, d.clearcoat);
  const black = adjustForLuminance(d, 0.04);
  assert.ok(black.envMapIntensity > d.envMapIntensity);
  assert.ok(black.clearcoat >= d.clearcoat);
  assert.ok(black.clearcoatRoughness <= d.clearcoatRoughness);
  [NaN, undefined, -1, 7].forEach(v => {
    const r = adjustForLuminance(d, v);
    Object.values(r).forEach(x => { if (typeof x === 'number') assert.ok(Number.isFinite(x)); });
  });
  assert.deepEqual(adjustForLuminance(d, 0.04), adjustForLuminance(d, 0.04));
});

// ---- projection on the real product geometry -----------------------------------

const { PRODUCTS, hasAdditionalWork } = ProductTypes;
const L_SHAPE = { productShape: { value: 'lshape' }, 'wing-width': { value: '600' }, 'wing-length': { value: '1400' } };
const ISLAND = { 'extra-ostrov-width': { value: '900' }, 'extra-ostrov-length': { value: '1800' } };
const BAR = { 'extra-bar-standard-width': { value: '500' }, 'extra-bar-standard-length': { value: '1200' } };

function layoutFor(productKey, values) {
  const doc = createFakeDoc(Object.assign({ width: { value: '650' }, length: { value: '2400' } }, values));
  const state = ConstructorState.readConstructorState({ doc, selectedProductKey: productKey, product: PRODUCTS[productKey], stone: null, hasAdditionalWork });
  return SceneLayout.buildSceneLayout(GeometryModel.buildGeometryModel(state));
}

const named = (layout, name) => layout.parts.filter(p => p.name === name);

// A part's surface as the renderer would see it: the top face corners
// (normal +Y) and the middle of every side face (outward normal).
function sampleSurface(part) {
  const positions = [], normals = [];
  const push = (p, n) => { positions.push(...p); normals.push(...n); };
  if (part.outline) {
    const pts = part.outline;
    pts.forEach(([x, z]) => push([x, part.y1, z], [0, 1, 0]));
    pts.forEach(([x0, z0], i) => {
      const [x1, z1] = pts[(i + 1) % pts.length];
      const len = Math.hypot(x1 - x0, z1 - z0) || 1;
      // Either winding: both edge normals are valid face directions here.
      push([(x0 + x1) / 2, (part.y0 + part.y1) / 2, (z0 + z1) / 2], [(z1 - z0) / len, 0, -(x1 - x0) / len]);
    });
  } else {
    const [cx, cy, cz] = part.center, [sx, sy, sz] = part.size;
    [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].forEach(n => {
      [-1, 1].forEach(a => [-1, 1].forEach(b => {
        const p = n[0] ? [cx + n[0] * sx / 2, cy + a * sy / 2, cz + b * sz / 2]
          : n[1] ? [cx + a * sx / 2, cy + n[1] * sy / 2, cz + b * sz / 2]
            : [cx + a * sx / 2, cy + b * sy / 2, cz + n[2] * sz / 2];
        push(p, n);
      }));
    });
  }
  return { positions: new Float32Array(positions), normals: new Float32Array(normals) };
}

function uvsFor(part, desc, index) {
  const { positions, normals } = sampleSurface(part);
  return stoneUVs(positions, normals, { projection: partProjection(part, index), patternSizeM: desc.patternSizeM });
}

function assertFinite(uv, label) {
  uv.forEach(v => assert.ok(Number.isFinite(v), label + ': NaN/Infinity in UVs'));
}

// A part that fits inside one photo must not cross a photo edge -- no
// mirrored join on it.
function assertNoJoin(uv, label) {
  uv.forEach(v => assert.ok(v >= -1e-6 && v <= 1 + 1e-6, label + ': crosses a photo edge (' + v + ')'));
}

function stoneParts(layout) {
  return layout.parts.filter(p => p.role === 'stone' && (p.kind === 'prism' || p.kind === 'box'));
}

const MARBLE = resolveMaterial(DELICATO, 'none');
const [U, V] = MARBLE.patternSizeM;

test('horizontal surface: the grain runs along the countertop\'s run (Z), the photo is not stretched', () => {
  const layout = layoutFor('stoleshnitsa_kuhnya', {});
  const main = named(layout, 'main')[0];
  const projection = partProjection(main, 0);
  assert.deepEqual(projection.grain, [0, 1]);
  assert.equal(projection.upright, false);
  assert.deepEqual(projection.extent.slice(0, 2), [2.4, 0.65]);
  const at = (x, z) => stoneUVs(new Float32Array([x, 0, z]), new Float32Array([0, 1, 0]), { projection, patternSizeM: MARBLE.patternSizeM });
  const du = at(0, 1)[0] - at(0, 0)[0];
  const dv = at(1, 0)[1] - at(0, 0)[1];
  assert.ok(Math.abs(Math.abs(du) * U - 1) < 1e-6 && Math.abs(Math.abs(dv) * V - 1) < 1e-6, 'one metre is the same length of stone both ways');
  assertFinite(uvsFor(main, MARBLE, 0), 'main');
});

test('scale is physical, not per product: a 2.4 m run is one piece of a figured stone, a small top a small piece of it', () => {
  const big = named(layoutFor('stoleshnitsa_kuhnya', {}), 'main')[0];
  const small = stoneParts(layoutFor('stoleshnitsa_vannaya', { width: { value: '450' }, length: { value: '600' } }))[0];
  const spanU = (part) => {
    const uv = uvsFor(part, MARBLE, 0);
    const us = [];
    // The top face only: sampleSurface() lists its corners first.
    for (let i = 0; i < part.outline.length; i++) us.push(uv[i * 2]);
    return Math.max(...us) - Math.min(...us);
  };
  assert.ok(Math.abs(spanU(big) - 2.4 / U) < 1e-6, 'no grid of copies on a long run');
  assertNoJoin(uvsFor(big, MARBLE, 0).slice(0, big.outline.length * 2), 'a usual 2.4 m top is cut from one slab');
  assert.ok(Math.abs(spanU(small) - 0.6 / U) < 1e-6, 'no giant veins filling a small top');
  assertNoJoin(uvsFor(small, MARBLE, 0), 'small top');
});

test('a part that fits inside the photo shows no join; its region of the photo depends only on its index', () => {
  const layout = layoutFor('stoleshnitsa_kuhnya', Object.assign({}, L_SHAPE, ISLAND, BAR));
  ['wing', 'island', 'bar'].forEach((name, i) => {
    const part = named(layout, name)[0];
    assertNoJoin(uvsFor(part, MARBLE, i + 1), name);
    assert.deepEqual([...uvsFor(part, MARBLE, i + 1)], [...uvsFor(part, MARBLE, i + 1)], name + ': deterministic');
  });
});

test('vertical surfaces: a wall keeps the photo lying along its run; an upright panno stands the photo up', () => {
  const stena = layoutFor('stena', { length: { value: '2700' }, width: { value: '4000' }, productSubcategory: { value: 'WALL-01' } });
  const panno = layoutFor('panno', { width: { value: '1200' }, length: { value: '800' } }); // 1.2 m high, 0.8 m wide
  const wall = partProjection(stena.parts.find(p => p.role === 'stone'), 0);
  const panel = partProjection(panno.parts.find(p => p.role === 'stone'), 0);
  assert.equal(wall.upright, false);
  assert.equal(panel.upright, true);
  const face = (projection, y, z) => stoneUVs(new Float32Array([0, y, z]), new Float32Array([1, 0, 0]), { projection, patternSizeM: MARBLE.patternSizeM });
  assert.ok(Math.abs(face(wall, 0, 1)[0] - face(wall, 0, 0)[0]) > 0, 'wall: u runs along the run');
  assert.equal(face(wall, 1, 0)[0], face(wall, 0, 0)[0], 'wall: u does not change with height');
  assert.ok(Math.abs(face(panel, 1, 0)[0] - face(panel, 0, 0)[0]) > 0, 'panno: u (the long side of the photo) runs up');
  assert.equal(face(panel, 0, 0.5)[0], face(panel, 0, 0)[0], 'panno: u does not change across');
  const dv = face(panel, 0, 1)[1] - face(panel, 0, 0)[1];
  assert.ok(Math.abs(Math.abs(dv) * V - 1) < 1e-6, 'panno: no stretch across');
  assertFinite(uvsFor(stena.parts.find(p => p.role === 'stone'), MARBLE, 0), 'wall');
  assertNoJoin(uvsFor(panno.parts.find(p => p.role === 'stone'), MARBLE, 0), 'panno 1.2 x 0.8 fits one photo');
});

test('a countertop\'s front edge continues the top\'s veins (same along-grain coordinate at the arris)', () => {
  const main = named(layoutFor('stoleshnitsa_kuhnya', {}), 'main')[0];
  const projection = partProjection(main, 0);
  const x = 0.325, z = 0.4;
  const top = stoneUVs(new Float32Array([x, main.y1, z]), new Float32Array([0, 1, 0]), { projection, patternSizeM: MARBLE.patternSizeM });
  const front = stoneUVs(new Float32Array([x, main.y1, z]), new Float32Array([1, 0, 0]), { projection, patternSizeM: MARBLE.patternSizeM });
  assert.ok(Math.abs(top[0] - front[0]) < 1e-6);
});

test('backsplash and wall panel (thin boxes on the wall) run along the wall at the product\'s scale', () => {
  const layout = layoutFor('stoleshnitsa_kuhnya', {
    'extra-backsplash-width': { value: '600' }, 'extra-backsplash-length': { value: '2400' },
    'extra-wallpanel-width': { value: '900' }, 'extra-wallpanel-length': { value: '2400' },
  });
  const boxes = layout.parts.filter(p => p.role === 'stone' && p.kind === 'box');
  assert.ok(boxes.length >= 1);
  boxes.forEach((b, i) => {
    const projection = partProjection(b, i);
    assert.deepEqual(projection.grain, [0, 1]);
    assert.equal(projection.upright, false);
    assertFinite(uvsFor(b, MARBLE, i), 'box');
  });
});

test('L-shape: each leg is cut along its own length (like real slabs); the wing fits one photo -- no join', () => {
  const layout = layoutFor('stoleshnitsa_kuhnya', Object.assign({ 'shape-corner': { value: 'right' } }, L_SHAPE));
  assert.deepEqual(partProjection(named(layout, 'main')[0], 0).grain, [0, 1]);
  const wing = named(layout, 'wing')[0];
  assert.deepEqual(partProjection(wing, 1).grain, [1, 0], 'the wing (1.4 m into the room) runs along X');
  assertNoJoin(uvsFor(wing, MARBLE, 1), 'wing');
  stoneParts(layout).forEach((p, i) => assertFinite(uvsFor(p, MARBLE, i), p.name));
});

test('island and bar counter: grain along their own length, finite UVs', () => {
  const layout = layoutFor('stoleshnitsa_kuhnya', Object.assign({}, L_SHAPE, ISLAND, BAR));
  ['island', 'bar'].forEach(name => {
    const part = named(layout, name)[0];
    const xs = part.outline.map(p => p[0]), zs = part.outline.map(p => p[1]);
    const alongZ = Math.max(...zs) - Math.min(...zs) >= Math.max(...xs) - Math.min(...xs);
    assert.deepEqual(partProjection(part, 0).grain, alongZ ? [0, 1] : [1, 0], name);
    assertFinite(uvsFor(part, MARBLE, 0), name);
  });
});

test('steps: every tread is cut along its width, fits one photo, and neighbours show different regions of it', () => {
  const treads = named(layoutFor('stupeni', { width: { value: '350' }, length: { value: '1200' }, 'stupeni-riser': { checked: true } }), 'tread');
  treads.forEach((t, i) => {
    assert.deepEqual(partProjection(t, i).grain, [0, 1]);
    assertNoJoin(uvsFor(t, MARBLE, i), 'tread ' + i);
  });
  // The same corner of two treads (identical shape) lands on different
  // points of the photo.
  assert.notDeepEqual([...uvsFor(treads[0], MARBLE, 0)].slice(0, 2), [...uvsFor(treads[1], MARBLE, 1)].slice(0, 2), 'two treads are not two copies');
  const winderLayout = layoutFor('stupeni', { productSubcategory: { value: 'STEP-02' } });
  const winder = named(winderLayout, 'tread');
  assert.notDeepEqual(partProjection(winder[0], 0).grain, partProjection(winder[winder.length - 1], 1).grain, 'grain turns with the treads');
  winder.forEach((t, i) => assertFinite(uvsFor(t, MARBLE, i), 'winder tread'));
  stoneParts(layoutFor('stupeni', { productSubcategory: { value: 'STEP-03' } })).forEach((p, i) => assertFinite(uvsFor(p, MARBLE, i), 'radius step'));
});

test('stairs: treads, risers and landings of every stair type project to finite UVs with a unit grain', () => {
  ['STAIR-01', 'STAIR-02', 'STAIR-03', 'STAIR-05', 'STAIR-07'].forEach(type => {
    const parts = stoneParts(layoutFor('lestnitsa', { width: { value: '1000' }, length: { value: '3000' }, productSubcategory: { value: type } }));
    assert.ok(parts.length > 0, type);
    parts.forEach((p, i) => {
      assertFinite(uvsFor(p, MARBLE, i), type + ' ' + p.name);
      const g = partProjection(p, i).grain;
      assert.ok(Math.abs(Math.hypot(g[0], g[1]) - 1) < 1e-6, type + ': unit grain');
    });
  });
});

test('floor and sill: finite, and the same geometry + stone always gives identical UVs', () => {
  ['pol', 'podokonnik'].forEach(key => {
    const values = { width: { value: '3000' }, length: { value: '4000' } };
    const a = stoneParts(layoutFor(key, values)), b = stoneParts(layoutFor(key, values));
    a.forEach((p, i) => {
      assertFinite(uvsFor(p, MARBLE, i), key);
      assert.deepEqual([...uvsFor(p, MARBLE, i)], [...uvsFor(b[i], MARBLE, i)]);
    });
  });
});

test('every product projects every stone part without NaN, for a photo stone and a procedural one', () => {
  const procedural = resolveMaterial({ category: 'granite', colors: [{ segment: 'black' }] }, 'none');
  Object.keys(PRODUCTS).forEach(key => {
    stoneParts(layoutFor(key, { width: { value: '900' }, length: { value: '2000' } })).forEach((p, i) => {
      assertFinite(uvsFor(p, MARBLE, i), key);
      assertFinite(uvsFor(p, procedural, i), key);
    });
  });
});

test('partProjection is safe for odd input: a missing index, a degenerate part', () => {
  const p = partProjection({ kind: 'box', center: [0, 0, 0], size: [0, 0, 0] });
  assert.equal(p.seed, 0);
  assertFinite(stoneUVs(new Float32Array([0, 0, 0]), new Float32Array([0, 1, 0]), { projection: p, patternSizeM: MARBLE.patternSizeM }), 'degenerate');
});

// ---- tiled surfaces -------------------------------------------------------------

test('tiled floor: the layout marks the floor with its joint grid; tile coordinates hit integers exactly at the joints', () => {
  const layout = layoutFor('pol', { width: { value: '3000' }, length: { value: '4000' }, productSubcategory: { value: 'FLOOR-01' } });
  const floor = named(layout, 'floor')[0];
  assert.deepEqual(floor.tiling, { plane: 'top', pattern: 'grid', moduleM: 0.6, x0: -1.5, x1: 1.5, z0: -2, z1: 2 });
  const seams = layout.parts.find(p => p.kind === 'seams').segments;
  const projection = partProjection(floor, 0);
  seams.forEach(([x0, , z0, x1, , z1]) => {
    const tc = MaterialAdapter.tileCoords(new Float32Array([(x0 + x1) / 2, floor.y1, (z0 + z1) / 2]), new Float32Array([0, 1, 0]), floor.tiling, projection);
    assert.ok([tc[0], tc[1]].some(v => Math.abs(v - Math.round(v)) < 1e-6), 'a joint lies on a tile boundary');
  });
});

test('tiled floor: only the top face is tiled; each tile fits the photo and may start anywhere in the room left', () => {
  const layout = layoutFor('pol', { width: { value: '3000' }, length: { value: '4000' }, productSubcategory: { value: 'FLOOR-03' } });
  const floor = named(layout, 'floor')[0];
  const projection = partProjection(floor, 0);
  const side = MaterialAdapter.tileCoords(new Float32Array([1.5, 0.01, 0]), new Float32Array([1, 0, 0]), floor.tiling, projection);
  assert.equal(side[0], MaterialAdapter.NO_TILE);
  const p = MaterialAdapter.tileParams(floor.tiling, projection, MARBLE.patternSizeM);
  assert.deepEqual(p.split, [1, 1]);
  p.cell.forEach((c, k) => assert.ok(Math.abs(c + p.room[k] - Math.max(1, c)) < 1e-6, 'tile + room = the photo'));
});

test('diagonal floor: joints (z = +-x + c) fall on tile boundaries of the turned grid', () => {
  const layout = layoutFor('pol', { width: { value: '3000' }, length: { value: '4000' }, productSubcategory: { value: 'FLOOR-02' } });
  const floor = named(layout, 'floor')[0];
  const projection = partProjection(floor, 0);
  layout.parts.find(p => p.kind === 'seams').segments.forEach(([x0, , z0, x1, , z1]) => {
    const tc = MaterialAdapter.tileCoords(new Float32Array([(x0 + x1) / 2, floor.y1, (z0 + z1) / 2]), new Float32Array([0, 1, 0]), floor.tiling, projection);
    assert.ok([tc[0], tc[1]].some(v => Math.abs(v - Math.round(v)) < 1e-6), 'diagonal joint on a boundary');
  });
});

test('walls: a grid wall is tiled on its room-side face; a panel wall is split along its run only, photo standing', () => {
  const grid = layoutFor('stena', { length: { value: '2700' }, width: { value: '4000' }, productSubcategory: { value: 'WALL-01' } }).parts.find(p => p.role === 'stone');
  const panels = layoutFor('stena', { length: { value: '2700' }, width: { value: '4000' }, productSubcategory: { value: 'WALL-02' } }).parts.find(p => p.role === 'stone');
  assert.equal(grid.tiling.plane, 'front');
  const pg = MaterialAdapter.tileParams(grid.tiling, partProjection(grid, 0), MARBLE.patternSizeM);
  assert.deepEqual(pg.split, [1, 1]);
  const pp = MaterialAdapter.tileParams(panels.tiling, partProjection(panels, 0), MARBLE.patternSizeM);
  assert.deepEqual(pp.split, [0, 1], 'panels: joints only along the run');
  // Panel coordinates: first = height (the photo's long side), second = run.
  const tc = MaterialAdapter.tileCoords(new Float32Array([0.02, 1.2, 0.3]), new Float32Array([1, 0, 0]), panels.tiling, partProjection(panels, 0));
  assert.ok(Math.abs(tc[0] - 1.2 / 0.6) < 1e-6 && Math.abs(tc[1] - (0.3 + 2) / 0.6) < 1e-6);
  const back = MaterialAdapter.tileCoords(new Float32Array([-0.02, 1.2, 0.3]), new Float32Array([-1, 0, 0]), panels.tiling, partProjection(panels, 0));
  assert.equal(back[0], MaterialAdapter.NO_TILE, 'the hidden back face is not tiled');
});

test('a surface without a chosen layout is not tiled (no joints are invented)', () => {
  const custom = layoutFor('pol', { width: { value: '3000' }, length: { value: '4000' }, productSubcategory: { value: '' } });
  assert.equal(named(custom, 'floor')[0].tiling, undefined);
  assert.equal(MaterialAdapter.tileParams(undefined, { upright: false }, MARBLE.patternSizeM), null);
  const out = MaterialAdapter.tileCoords(new Float32Array([0, 0, 0]), new Float32Array([0, 1, 0]), undefined, { grain: [0, 1] });
  assert.equal(out[0], MaterialAdapter.NO_TILE);
});

// ---- photo exposure ----------------------------------------------------------------

test('photoExposure lifts only an underexposed photo of a light-listed stone, moderately and capped', () => {
  const white = resolveMaterial(Object.assign({}, DELICATO, { colors: [{ segment: 'white' }] }), 'none');
  const black = resolveMaterial(Object.assign({}, DELICATO, { colors: [{ segment: 'black' }] }), 'none');
  const unknown = resolveMaterial(Object.assign({}, DELICATO, { colors: [] }), 'none');
  assert.ok(MaterialAdapter.photoExposure(white, 0.55) > 1);
  assert.ok(MaterialAdapter.photoExposure(white, 0.1) <= 1.35, 'capped');
  assert.equal(MaterialAdapter.photoExposure(white, 0.8), 1, 'a bright photo is kept as shot');
  assert.equal(MaterialAdapter.photoExposure(black, 0.1), 1, 'dark stone is never lightened');
  assert.equal(MaterialAdapter.photoExposure(unknown, 0.3), 1, 'no listed color: no guess');
  [NaN, 0, -1, undefined].forEach(v => assert.equal(MaterialAdapter.photoExposure(white, v), 1));
});
