// visualizer/three-scene.js
//
// Renderer only. What to draw and where comes from SceneLayout
// (visualizer/scene-layout.js); how to frame it from CameraFraming
// (visualizer/camera-framing.js) -- both pure, both unit-tested. This file
// turns layout parts into meshes and owns the look: studio environment,
// lighting, soft shadows, a display floor and the stone material.
import * as THREE from '../vendor/three/three.module.js';
import { OrbitControls } from '../vendor/three/OrbitControls.js';

let renderer, scene, camera, controls, productGroup, currentCanvas, resizeObserver;
let keyLight, fillLight, rimLight;
let frameId = null;
let cameraPresetTracker = null;
let lastBounds = null;
let lastProductKey = null;
let hasModel = false;
// True once the client orbits/zooms by hand -- until then, a canvas resize
// (e.g. entering the Result layout) reframes the model automatically.
let userAdjusted = false;
let textures = null;

const FOV_DEG = 32;
let framePadding = 0.1;
const BACKGROUND_TOP = '#3a332b';
const BACKGROUND_BOTTOM = '#1c1814';
// Lighter than the studio behind it, so even a near-black stone has a
// silhouette against the floor it stands on.
const FLOOR_COLOR = '#4a4138';

// ---- procedural textures (no external assets) ----------------------------

// Deterministic, tileable value noise -- same seed, same texture, every run.
function noiseCanvas(size, cells, octaves, lo, hi) {
  let seed = 1234567;
  const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const layers = [];
  for (let o = 0; o < octaves; o++) {
    const n = cells << o;
    const grid = new Float32Array(n * n);
    for (let i = 0; i < grid.length; i++) grid[i] = rand();
    layers.push({ n, grid, weight: 1 / (1 << o) });
  }
  const totalWeight = layers.reduce((s, l) => s + l.weight, 0);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const smooth = t => t * t * (3 - 2 * t);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let v = 0;
      layers.forEach(({ n, grid, weight }) => {
        const fx = (x / size) * n, fy = (y / size) * n;
        const x0 = Math.floor(fx), y0 = Math.floor(fy);
        const tx = smooth(fx - x0), ty = smooth(fy - y0);
        const g = (i, j) => grid[((j % n + n) % n) * n + ((i % n + n) % n)];
        const a = g(x0, y0) + (g(x0 + 1, y0) - g(x0, y0)) * tx;
        const b = g(x0, y0 + 1) + (g(x0 + 1, y0 + 1) - g(x0, y0 + 1)) * tx;
        v += (a + (b - a) * ty) * weight;
      });
      const c = Math.round(lo + (hi - lo) * (v / totalWeight));
      const k = (y * size + x) * 4;
      img.data[k] = img.data[k + 1] = img.data[k + 2] = c;
      img.data[k + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

function repeatTexture(canvas, repeat, colorSpace) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  if (colorSpace) t.colorSpace = colorSpace;
  return t;
}

function buildTextures() {
  // Fine grain: micro-roughness/bump so light breaks up like on real stone.
  const grain = noiseCanvas(256, 48, 2, 150, 255);
  const bg = document.createElement('canvas');
  bg.width = 2; bg.height = 256;
  const g = bg.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, BACKGROUND_TOP);
  grad.addColorStop(1, BACKGROUND_BOTTOM);
  g.fillStyle = grad;
  g.fillRect(0, 0, 2, 256);
  const fade = document.createElement('canvas');
  fade.width = fade.height = 128;
  const f = fade.getContext('2d');
  const radial = f.createRadialGradient(64, 64, 0, 64, 64, 64);
  radial.addColorStop(0, '#ffffff');
  radial.addColorStop(0.55, '#b0b0b0');
  radial.addColorStop(1, '#000000');
  f.fillStyle = radial;
  f.fillRect(0, 0, 128, 128);
  const background = new THREE.CanvasTexture(bg);
  background.colorSpace = THREE.SRGBColorSpace;
  return {
    grain: repeatTexture(grain, 1.5),
    background,
    floorFade: new THREE.CanvasTexture(fade),
  };
}

// A soft photo-studio environment for reflections (clear coat, steel,
// glass): a dark warm room with a large overhead softbox and a warm key
// panel on the room side. Built from plain meshes -- no HDR file.
function buildEnvironment() {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = new THREE.Scene();
  const room = new THREE.Mesh(new THREE.BoxGeometry(20, 10, 20), new THREE.MeshBasicMaterial({ color: '#2a241e', side: THREE.BackSide }));
  env.add(room);
  const panel = (w, h, color, position, lookAt) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
    m.position.set(...position);
    m.lookAt(...lookAt);
    env.add(m);
  };
  panel(8, 8, new THREE.Color(1.3, 1.22, 1.1), [0, 4.8, 0], [0, 0, 0]);
  panel(5, 3.5, new THREE.Color(1.1, 1.0, 0.86), [9.8, 2.5, 3], [0, 1, 0]);
  panel(4, 3, new THREE.Color(0.35, 0.38, 0.42), [-9.8, 2, -2], [0, 1, 0]);
  const texture = pmrem.fromScene(env, 0.03).texture;
  env.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
  pmrem.dispose();
  return texture;
}

// ---- stone photos (loaded on demand, cached) ------------------------------

// Only the selected stone's photo is ever loaded -- never the catalog. A
// few recent ones stay cached so switching back is instant; older ones are
// released from the GPU.
const STONE_CACHE_LIMIT = 6;
// The studio light is warm (the scene's art direction). A photo already
// carries the stone's true color, so it gets a faint cool tint that
// cancels the warm cast on the stone only -- a beige travertine stays
// beige instead of turning to honey-colored wood.
const PHOTO_TINT = '#eef1f6';
const stoneTextures = new Map(); // imageUrl -> { promise, entry, lastUsed }
let stoneUseCounter = 0;

// The photo as a texture: a thin border cropped off, the stone's tone
// adjusted by the descriptor (calm stones slightly softer), mirrored past
// its edges -- a bookmatch, never a visible tile grid.
// Mean color (sRGB 0..1) and luminance of an image, from an 8x8 probe.
function meanColor(source, sx, sy, sw, sh) {
  const probe = document.createElement('canvas');
  probe.width = probe.height = 8;
  const p = probe.getContext('2d');
  p.drawImage(source, sx, sy, sw, sh, 0, 0, 8, 8);
  const data = p.getImageData(0, 0, 8, 8).data;
  const mean = [0, 0, 0];
  for (let i = 0; i < data.length; i += 4) { mean[0] += data[i]; mean[1] += data[i + 1]; mean[2] += data[i + 2]; }
  const color = mean.map(c => c / (data.length / 4) / 255);
  return { color, luminance: 0.2126 * color[0] + 0.7152 * color[1] + 0.0722 * color[2] };
}

function photoTexture(img, desc) {
  const crop = desc.imageCrop || 0;
  const sx = img.naturalWidth * crop, sy = img.naturalHeight * crop;
  const sw = img.naturalWidth - 2 * sx, sh = img.naturalHeight - 2 * sy;
  const gain = window.MaterialAdapter.photoExposure(desc, meanColor(img, sx, sy, sw, sh).luminance);
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = Math.round(1024 * sh / sw);
  const ctx = canvas.getContext('2d');
  const filters = [];
  if (gain !== 1) filters.push(`brightness(${gain})`);
  if (desc.contrast !== 1) filters.push(`contrast(${desc.contrast})`);
  if (desc.saturation !== 1) filters.push(`saturate(${desc.saturation})`);
  if (filters.length) ctx.filter = filters.join(' ');
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.MirroredRepeatWrapping;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  // Mean color of the finished photo: seams, and dark-stone lighting.
  return Object.assign({ texture }, meanColor(canvas, 0, 0, canvas.width, canvas.height));
}

function loadStonePhoto(desc) {
  const cached = stoneTextures.get(desc.imageUrl);
  if (cached) { cached.lastUsed = ++stoneUseCounter; return cached.promise; }
  const record = { entry: null, lastUsed: ++stoneUseCounter };
  record.promise = new Promise(resolve => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      // The renderer may have been disposed while the photo was loading.
      if (!renderer) { resolve(null); return; }
      try { record.entry = photoTexture(img, desc); } catch (e) { record.entry = null; }
      resolve(record.entry);
    };
    // A missing or broken photo: the procedural stone stays -- no error UI.
    img.onerror = () => resolve(null);
    img.src = desc.imageUrl;
  });
  stoneTextures.set(desc.imageUrl, record);
  evictStonePhotos(desc.imageUrl);
  return record.promise;
}

function evictStonePhotos(keepUrl) {
  if (stoneTextures.size <= STONE_CACHE_LIMIT) return;
  const oldest = [...stoneTextures.entries()]
    .filter(([url, r]) => url !== keepUrl && r.entry)
    .sort((a, b) => a[1].lastUsed - b[1].lastUsed);
  while (stoneTextures.size > STONE_CACHE_LIMIT && oldest.length) {
    const [url, r] = oldest.shift();
    r.entry.texture.dispose();
    stoneTextures.delete(url);
  }
}

// ---- materials -----------------------------------------------------------

// The procedural stone's color map, one per pattern/amount (a handful at
// most), built on first use: soft clouding or a fine speckle, both from the
// deterministic noise above, lightest at 255 so the stone keeps its color.
const proceduralMaps = new Map();
function proceduralMap({ pattern, amount }) {
  const key = pattern + ':' + amount;
  if (!proceduralMaps.has(key)) {
    const lo = Math.round(255 * (1 - amount));
    const canvas = pattern === 'speckle' ? noiseCanvas(256, 64, 2, lo, 255) : noiseCanvas(256, 3, 4, lo, 255);
    proceduralMaps.set(key, repeatTexture(canvas, 1, THREE.SRGBColorSpace));
  }
  return proceduralMaps.get(key);
}

// Per-material copy of a shared procedural texture at the stone's pattern
// scale (the copy shares the pixels; only its repeat differs).
function scaledTexture(source, perMetre, desc) {
  const t = source.clone();
  t.repeat.set(perMetre * desc.patternSizeM[0], perMetre * desc.patternSizeM[1]);
  t.needsUpdate = true;
  return t;
}

// (Re)dresses the stone material for a descriptor: finish first (instant),
// then the stone's photo once it is loaded. The procedural look -- the
// stone's listed color over soft mottling -- is shown meanwhile and stays
// for a stone without a usable photo.
function applyStone(materials, desc) {
  const stone = materials.stone;
  (materials.owned || []).forEach(t => t.dispose());
  const grain = scaledTexture(textures.grain, 1.5, desc);
  const cloud = scaledTexture(proceduralMap(desc.procedural), desc.procedural.pattern === 'speckle' ? 2.5 : 0.6, desc);
  materials.owned = [grain, cloud];
  materials.descriptor = desc;
  stone.color.set(desc.fallbackColor);
  stone.map = cloud;
  stone.roughness = desc.roughness;
  stone.roughnessMap = desc.microGrain ? grain : null;
  stone.metalness = desc.metalness || 0;
  stone.clearcoat = desc.clearcoat || 0;
  stone.clearcoatRoughness = desc.clearcoatRoughness;
  stone.bumpMap = desc.bumpScale > 0 ? grain : null;
  stone.bumpScale = desc.bumpScale;
  stone.envMapIntensity = desc.envMapIntensity;
  stone.userData.tileUniforms.stoneTileOn.value = 0;
  stone.needsUpdate = true;
  materials.seam.color.set(desc.fallbackColor).multiplyScalar(0.62);

  if (desc.source !== 'image') return;
  loadStonePhoto(desc).then(photo => {
    // Only if this stone is still the one on screen.
    if (!photo || materials.descriptor !== desc || !productGroup || productGroup.userData.materials !== materials) return;
    const tuned = window.MaterialAdapter.adjustForLuminance(desc, photo.luminance);
    stone.color.set(PHOTO_TINT);
    stone.map = photo.texture;
    stone.envMapIntensity = tuned.envMapIntensity;
    stone.clearcoat = tuned.clearcoat;
    stone.clearcoatRoughness = tuned.clearcoatRoughness;
    const tiles = materials.tiled && window.MaterialAdapter.tileParams(materials.tiled.tiling, materials.tiled.projection, desc.patternSizeM);
    if (tiles) {
      const u = stone.userData.tileUniforms;
      u.stoneTileCell.value.set(...tiles.cell);
      u.stoneTileRoom.value.set(...tiles.room);
      u.stoneTileSplit.value.set(...tiles.split);
      u.stoneTileOn.value = 1;
    }
    stone.needsUpdate = true;
    materials.seam.color.setRGB(...photo.color, THREE.SRGBColorSpace).multiplyScalar(0.62);
  });
}

// Tiled surfaces (see MaterialAdapter.tileCoords): the photo is sampled
// per tile -- each tile its own region, chosen by a fixed hash of the tile's
// grid cell. textureGrad keeps the mip level continuous across the joints.
const STONE_TILE_VERTEX = `
attribute vec2 stoneTile;
varying vec2 vStoneTile;
`;
const STONE_TILE_FRAGMENT = `
uniform float stoneTileOn;
uniform vec2 stoneTileCell;
uniform vec2 stoneTileRoom;
uniform vec2 stoneTileSplit;
varying vec2 vStoneTile;
`;
const STONE_TILE_MAP = `
#ifdef USE_MAP
  vec2 stoneUv = vMapUv;
  vec2 stoneGx = dFdx(vMapUv), stoneGy = dFdy(vMapUv);
  vec2 tileGx = dFdx(vStoneTile) * stoneTileCell, tileGy = dFdy(vStoneTile) * stoneTileCell;
  if (stoneTileOn > 0.5 && vStoneTile.x > -1000.0) {
    vec2 cell = floor(vStoneTile) * stoneTileSplit;
    vec2 pick = fract(sin(vec2(dot(cell, vec2(127.1, 311.7)), dot(cell, vec2(269.5, 183.3)))) * 43758.5453);
    // Split axes restart the photo in every tile; a joint-free axis runs on.
    stoneUv = mix(vStoneTile, fract(vStoneTile), stoneTileSplit) * stoneTileCell + pick * stoneTileRoom;
    stoneGx = tileGx;
    stoneGy = tileGy;
  }
  diffuseColor *= textureGrad(map, stoneUv, stoneGx, stoneGy);
#endif
`;

function buildStoneMaterial(desc) {
  const stone = new THREE.MeshPhysicalMaterial({ color: desc.fallbackColor });
  const uniforms = {
    stoneTileOn: { value: 0 },
    stoneTileCell: { value: new THREE.Vector2(1, 1) },
    stoneTileRoom: { value: new THREE.Vector2(0, 0) },
    stoneTileSplit: { value: new THREE.Vector2(1, 1) },
  };
  stone.userData.tileUniforms = uniforms;
  stone.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = STONE_TILE_VERTEX + shader.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n  vStoneTile = stoneTile;');
    shader.fragmentShader = STONE_TILE_FRAGMENT + shader.fragmentShader.replace('#include <map_fragment>', STONE_TILE_MAP);
  };
  stone.customProgramCacheKey = () => 'stone-tiles';
  return stone;
}

function buildMaterials(desc) {
  const stone = buildStoneMaterial(desc);
  return {
    stone,
    metal: new THREE.MeshStandardMaterial({ color: '#9a9ea2', metalness: 0.85, roughness: 0.32, envMapIntensity: 1.1, side: THREE.DoubleSide }),
    glass: new THREE.MeshPhysicalMaterial({ color: '#0d0d0e', roughness: 0.08, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.2 }),
    // Stair structure (concrete) -- visibly not stone, so stone risers read.
    body: new THREE.MeshStandardMaterial({ color: '#66686a', roughness: 0.95, metalness: 0, envMapIntensity: 0.35 }),
    // Warm plaster: lighter than the studio so a wall reads as a wall, darker
    // than any stone so the product stays the brightest thing in view.
    context: new THREE.MeshStandardMaterial({ color: '#6f675d', roughness: 0.95, metalness: 0, envMapIntensity: 0.4 }),
    'context-glass': new THREE.MeshPhysicalMaterial({ color: '#5f676c', roughness: 0.05, metalness: 0, transparent: true, opacity: 0.45, envMapIntensity: 1.3 }),
    seam: new THREE.LineBasicMaterial({ color: desc.fallbackColor, transparent: true, opacity: 0.7 }),
    burner: new THREE.MeshBasicMaterial({ color: '#4d4a47' }),
  };
}

// ---- geometry ------------------------------------------------------------

// Edge profile as a geometry parameter: a generic, honest approximation of
// the chosen edge (soft round, sharp chamfer, ...), not a CNC profile. Every
// stone edge gets at least a hairline arris so it catches the light.
function bevelFor(part) {
  const depth = part.y1 - part.y0;
  if (part.role !== 'stone' || depth < 0.015) return { size: 0, segments: 0 };
  const cap = depth * 0.35;
  switch (part.edge) {
    case 'rounding': return { size: Math.min(cap, 0.012), segments: 5 };
    case 'bevel': return { size: Math.min(cap, 0.008), segments: 1 };
    case 'figured': return { size: Math.min(cap, 0.01), segments: 3 };
    default: return { size: 0.0015, segments: 1 };
  }
}

function buildPrismGeometry(part) {
  // Shape lives in (x, -z); rotating -90deg about X maps shape-y to world -Z
  // and the extrusion to world +Y.
  const shape = new THREE.Shape();
  part.outline.forEach(([x, z], i) => (i === 0 ? shape.moveTo(x, -z) : shape.lineTo(x, -z)));
  shape.closePath();
  (part.holes || []).forEach(h => {
    const path = new THREE.Path();
    if (h.rect) {
      const { x, z, w, l } = h.rect;
      path.moveTo(x - w / 2, -(z - l / 2));
      path.lineTo(x - w / 2, -(z + l / 2));
      path.lineTo(x + w / 2, -(z + l / 2));
      path.lineTo(x + w / 2, -(z - l / 2));
      path.closePath();
    } else {
      path.absarc(h.circle.x, -h.circle.z, h.circle.r, 0, Math.PI * 2, true);
    }
    shape.holes.push(path);
  });
  const bevel = bevelFor(part);
  const depth = Math.max(0.001, part.y1 - part.y0 - 2 * bevel.size);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel.size > 0,
    bevelThickness: bevel.size,
    bevelSize: bevel.size,
    bevelSegments: bevel.segments,
    curveSegments: 20,
  });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, part.y0 + bevel.size, 0);
  return geometry;
}

function addMesh(group, geometry, material, position, cast) {
  const mesh = new THREE.Mesh(geometry, material);
  if (position) mesh.position.set(...position);
  mesh.castShadow = cast !== false;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function buildBasin(group, part, material) {
  const [cx, top, cz] = part.center;
  const [sx, depth, sz] = part.size;
  const bottom = new THREE.PlaneGeometry(sx, sz);
  bottom.rotateX(-Math.PI / 2);
  addMesh(group, bottom, material, [cx, top - depth, cz]);
  [[sx, 0, sz / 2, 0], [sx, 0, -sz / 2, Math.PI], [sz, sx / 2, 0, Math.PI / 2], [sz, -sx / 2, 0, -Math.PI / 2]].forEach(([w, dx, dz, rot]) => {
    const wall = new THREE.PlaneGeometry(w, depth);
    const mesh = addMesh(group, wall, material, [cx + dx, top - depth / 2, cz + dz]);
    mesh.rotation.y = rot;
  });
}

function buildCooktop(group, part, materials) {
  const [cx, top, cz] = part.center;
  const [sx, sy, sz] = part.size;
  addMesh(group, new THREE.BoxGeometry(sx, sy, sz), materials.glass, [cx, top + sy / 2, cz]);
  const r = Math.min(sx, sz) * 0.17;
  [[-1, -1, 1], [1, -1, 0.78], [-1, 1, 0.78], [1, 1, 1]].forEach(([ix, iz, scale]) => {
    const ring = new THREE.RingGeometry(r * scale * 0.82, r * scale, 48);
    ring.rotateX(-Math.PI / 2);
    addMesh(group, ring, materials.burner, [cx + ix * sx / 4, top + sy + 0.0006, cz + iz * sz / 4], false);
  });
}

function buildFloor(group, layout, materials) {
  const { min, max } = layout.bounds;
  const radius = Math.max(max[0] - min[0], max[2] - min[2]) * 0.9 + 1.2;
  const floorMaterial = new THREE.MeshStandardMaterial({
    color: FLOOR_COLOR, roughness: 0.92, metalness: 0, alphaMap: textures.floorFade, transparent: true, envMapIntensity: 0.3,
  });
  materials.floor = floorMaterial;
  const disc = new THREE.CircleGeometry(radius, 72);
  disc.rotateX(-Math.PI / 2);
  const mesh = addMesh(group, disc, floorMaterial, [(min[0] + max[0]) / 2, layout.floorY - 0.0005, (min[2] + max[2]) / 2], false);
  mesh.receiveShadow = true;
}

// Layout-space vertex positions/normals of a stone mesh, kept so its UVs
// can be re-projected for another stone without rebuilding the geometry.
function captureStoneMesh(mesh, part, index) {
  mesh.updateMatrix();
  const { position, normal } = mesh.geometry.attributes;
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrix);
  const positions = new Float32Array(position.count * 3);
  const normals = new Float32Array(position.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    v.fromBufferAttribute(position, i).applyMatrix4(mesh.matrix);
    positions[i * 3] = v.x; positions[i * 3 + 1] = v.y; positions[i * 3 + 2] = v.z;
    v.fromBufferAttribute(normal, i).applyMatrix3(normalMatrix).normalize();
    normals[i * 3] = v.x; normals[i * 3 + 1] = v.y; normals[i * 3 + 2] = v.z;
  }
  const projection = window.MaterialAdapter.partProjection(part, index);
  const tiles = window.MaterialAdapter.tileCoords(positions, normals, part.tiling, projection);
  mesh.geometry.setAttribute('stoneTile', new THREE.BufferAttribute(tiles, 2));
  return { mesh, positions, normals, projection, tiling: part.tiling || null };
}

// Every stone part is its own piece of stone at the stone's physical
// pattern size (see MaterialAdapter.partProjection).
function projectStoneUVs(group, desc) {
  group.userData.stoneMeshes.forEach(({ mesh, positions, normals, projection }) => {
    const uv = window.MaterialAdapter.stoneUVs(positions, normals, { projection, patternSizeM: desc.patternSizeM });
    mesh.geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  });
  group.userData.patternSizeM = desc.patternSizeM.join('x');
}

function buildProductGroup(layout, materialDescriptor) {
  const group = new THREE.Group();
  const materials = buildMaterials(materialDescriptor);
  group.userData.materials = materials;
  group.userData.stoneMeshes = [];
  let stoneIndex = 0;
  layout.parts.forEach(part => {
    const before = group.children.length;
    buildPart(group, part, materials);
    if (part.role === 'stone') {
      const index = stoneIndex++;
      group.children.slice(before).forEach(mesh => {
        if (mesh.isMesh) group.userData.stoneMeshes.push(captureStoneMesh(mesh, part, index));
      });
    }
  });
  if (layout.bounds) buildFloor(group, layout, materials);
  const tiled = group.userData.stoneMeshes.find(m => m.tiling);
  materials.tiled = tiled ? { tiling: tiled.tiling, projection: tiled.projection } : null;
  projectStoneUVs(group, materialDescriptor);
  applyStone(materials, materialDescriptor);
  return group;
}

function buildPart(group, part, materials) {
  {
    const cast = part.role !== 'context' && part.role !== 'context-glass';
    if (part.kind === 'prism') {
      addMesh(group, buildPrismGeometry(part), materials[part.role], null, cast);
    } else if (part.kind === 'box') {
      addMesh(group, new THREE.BoxGeometry(...part.size), materials[part.role], part.center, cast);
    } else if (part.kind === 'basin') {
      buildBasin(group, part, materials[part.role]);
    } else if (part.kind === 'cooktop') {
      buildCooktop(group, part, materials);
    } else if (part.kind === 'seams') {
      const positions = new Float32Array(part.segments.flat());
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      group.add(new THREE.LineSegments(geometry, materials.seam));
    }
  }
}

function disposeGroup(group) {
  group.traverse(obj => { if (obj.geometry) obj.geometry.dispose(); });
  const materials = group.userData.materials || {};
  // Photo textures belong to the cache, not to a material; only this
  // group's own scaled copies are released here.
  (materials.owned || []).forEach(t => t.dispose());
  Object.values(materials).forEach(m => { if (m && m.isMaterial) m.dispose(); });
}

// ---- lights --------------------------------------------------------------

// Soft architectural light, placed relative to the model so a 0.4 m step
// and a 5 m kitchen get the same quality of light and shadow.
function placeLights(bounds) {
  const c = [0, 1, 2].map(i => (bounds.min[i] + bounds.max[i]) / 2);
  const size = Math.max(bounds.max[0] - bounds.min[0], bounds.max[1] - bounds.min[1], bounds.max[2] - bounds.min[2], 0.5);
  const at = (light, dir, dist) => {
    light.position.set(c[0] + dir[0] * dist, c[1] + dir[1] * dist, c[2] + dir[2] * dist);
    light.target.position.set(c[0], c[1], c[2]);
    light.target.updateMatrixWorld();
  };
  at(keyLight, [0.8, 1.2, 0.55], size * 2.5);
  at(fillLight, [1, 0.3, -0.7], size * 2.5);
  at(rimLight, [-1, 0.8, -0.25], size * 2.5);
  const cam = keyLight.shadow.camera;
  const half = size * 1.1 + 0.6;
  cam.left = -half; cam.right = half; cam.top = half; cam.bottom = -half;
  cam.near = 0.1; cam.far = size * 6 + 2;
  cam.updateProjectionMatrix();
}

// ---- camera --------------------------------------------------------------

function currentDirection() {
  const d = camera.position.clone().sub(controls.target);
  return d.lengthSq() > 1e-9 ? [d.x, d.y, d.z] : [1, 0.8, 1];
}

function frame(direction) {
  if (!lastBounds) return;
  const fit = window.CameraFraming.fitCamera({ bounds: lastBounds, direction, fovDeg: FOV_DEG, aspect: camera.aspect, padding: framePadding });
  controls.target.set(...fit.target);
  camera.position.set(...fit.position);
  camera.near = Math.max(0.01, fit.distance / 100);
  camera.far = fit.distance * 40;
  camera.updateProjectionMatrix();
  controls.minDistance = fit.distance * 0.3;
  controls.maxDistance = fit.distance * 3.5;
  controls.update();
}

function init(canvasEl) {
  currentCanvas = canvasEl;
  // CameraPresetTracker lives in visualizer/camera-preset-tracker.js (a UMD
  // script, not an ES module, so it can't be `import`ed here) -- read it off
  // the global it already attaches to `window`.
  cameraPresetTracker = window.CameraPresetTracker.createCameraPresetTracker();
  renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  textures = buildTextures();
  scene = new THREE.Scene();
  scene.background = textures.background;
  scene.environment = buildEnvironment();

  camera = new THREE.PerspectiveCamera(FOV_DEG, 1, 0.01, 100);
  camera.position.set(1.5, 1.2, 1.5);

  scene.add(new THREE.HemisphereLight('#fff2e0', '#2b231c', 0.3));
  keyLight = new THREE.DirectionalLight('#ffefd9', 1.5);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  keyLight.shadow.bias = -0.0003;
  keyLight.shadow.normalBias = 0.015;
  fillLight = new THREE.DirectionalLight('#dde5ee', 0.45);
  rimLight = new THREE.DirectionalLight('#ffe3c4', 1.3);
  [keyLight, fillLight, rimLight].forEach(l => { scene.add(l); scene.add(l.target); });

  controls = new OrbitControls(camera, canvasEl);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.addEventListener('start', () => { userAdjusted = true; });

  resizeObserver = new ResizeObserver(() => resize());
  resizeObserver.observe(canvasEl.parentElement);
  resize();

  function animate() {
    frameId = requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }
  animate();
}

function resize() {
  if (!renderer || !currentCanvas.parentElement) return;
  const { clientWidth, clientHeight } = currentCanvas.parentElement;
  if (clientWidth === 0 || clientHeight === 0) return;
  renderer.setSize(clientWidth, clientHeight, false);
  camera.aspect = clientWidth / clientHeight;
  camera.updateProjectionMatrix();
  // A new canvas shape (Result layout, rotating a phone) changes what fits:
  // reframe, unless the client is currently looking around by hand.
  if (hasModel && !userAdjusted) frame(currentDirection());
}

function update(geometryModel, materialDescriptor) {
  // Same geometry, another stone (or the same one again): only the stone
  // material changes -- meshes, lights, camera and controls stay as they are.
  const geometryKey = JSON.stringify(geometryModel);
  if (productGroup && productGroup.userData.geometryKey === geometryKey) {
    const materials = productGroup.userData.materials;
    const previous = materials.descriptor;
    if (previous && JSON.stringify(previous) === JSON.stringify(materialDescriptor)) return;
    if (productGroup.userData.patternSizeM !== materialDescriptor.patternSizeM.join('x')) projectStoneUVs(productGroup, materialDescriptor);
    applyStone(materials, materialDescriptor);
    return;
  }
  const layout = window.SceneLayout.buildSceneLayout(geometryModel);
  if (productGroup) {
    scene.remove(productGroup);
    disposeGroup(productGroup);
  }
  productGroup = buildProductGroup(layout, materialDescriptor);
  productGroup.userData.geometryKey = geometryKey;
  scene.add(productGroup);
  if (layout.bounds) placeLights(layout.bounds);

  // Every update() adopts the current product's own default -- switching
  // products immediately changes what "Сбросить вид" returns to.
  cameraPresetTracker.setDefaultFromGeometryModel(geometryModel);

  const action = window.CameraFraming.decideCameraAction({
    hasPrevious: hasModel,
    previousProductKey: lastProductKey,
    nextProductKey: geometryModel.productKey,
    previousBounds: lastBounds,
    nextBounds: layout.bounds,
  });
  lastBounds = layout.bounds;
  framePadding = layout.framePadding;
  lastProductKey = geometryModel.productKey;
  hasModel = true;
  if (action === 'reset') resetView();
  else if (action === 'refit') { frame(currentDirection()); userAdjusted = false; }
}

function setView(presetName) {
  // CAMERA_PRESETS lives in visualizer/constants.js -- one source of truth
  // for the view directions.
  const presetsByName = window.VisualizerConstants.CAMERA_PRESETS;
  const preset = presetsByName[presetName] || presetsByName.iso;
  frame(preset.direction);
  userAdjusted = false;
}

function resetView() {
  // Deliberately NOT "the last view the user manually picked" -- always the
  // current product's own declared default, tracked separately from manual
  // setView() calls. See visualizer/camera-preset-tracker.js.
  setView(cameraPresetTracker.getDefaultPreset());
}

function dispose() {
  if (frameId !== null) cancelAnimationFrame(frameId);
  if (resizeObserver) resizeObserver.disconnect();
  if (productGroup) disposeGroup(productGroup);
  if (controls) controls.dispose();
  if (scene && scene.environment) scene.environment.dispose();
  if (textures) Object.values(textures).forEach(t => t.dispose());
  stoneTextures.forEach(r => { if (r.entry) r.entry.texture.dispose(); });
  stoneTextures.clear();
  proceduralMaps.forEach(t => t.dispose());
  proceduralMaps.clear();
  if (renderer) renderer.dispose();
  renderer = scene = camera = controls = productGroup = currentCanvas = resizeObserver = null;
  keyLight = fillLight = rimLight = null;
  cameraPresetTracker = null;
  textures = null;
  lastBounds = null; lastProductKey = null; hasModel = false; userAdjusted = false;
}

const ThreeScene = { init, update, setView, resetView, dispose };
window.ThreeScene = ThreeScene;
export default ThreeScene;
