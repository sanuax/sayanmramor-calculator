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
let keyLight, fillLight, rimLight, hemiLight;
let frameId = null;
let cameraPresetTracker = null;
let lastBounds = null;
let lastLayout = null;
let lastProductKey = null;
let hasModel = false;
// True once the client orbits/zooms by hand -- until then, a canvas resize
// (e.g. entering the Result layout) reframes the model automatically.
let userAdjusted = false;
// The client's «reduce motion» setting: views, sizes and stones change at once.
const reducedMotion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
let cameraMove = null;   // a glide to a new view: { spring, goal }
let morph = null;        // the model easing to a new size: { spring } over the shown bounds
let lastFrameTime = 0;
// «Студия» / «День» / «Вечер» and the furniture fronts' colour (RoomLayout).
let roomMode = 'studio';
let facadeId = null;
let roomLights = [];   // the evening's lamps and bounce light, only while shown
let textures = null;

const FOV_DEG = 32;
let framePadding = 0.1;
const BACKGROUND_TOP = '#2f3632';      // the site's green-graphite, lit from above (2026-10-10)
const BACKGROUND_BOTTOM = '#161a18';
// Lighter than the studio behind it, so even a near-black stone has a
// silhouette against the floor it stands on.
const FLOOR_COLOR = '#3e4540';

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
      try {
        record.entry = photoTexture(img, desc);
        // Uploaded now, while nothing moves, not in a fade's first frame.
        renderer.initTexture(record.entry.texture);
      } catch (e) { record.entry = null; }
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
//
// Another stone on the same model: the stone on screen stays
// until the new one's photo is ready, then the new one fades in over it
// (STONE_FADE_S) -- no flash of the procedural look between two photos. A
// photo that takes long (PHOTO_WAIT_S) fades in the procedural look first.
const STONE_FADE_S = 0.35;
const PHOTO_WAIT_S = 0.6;

// A look: the map and tint on the stone, and its whole finish.
const baseFinish = desc => ({ roughness: desc.roughness, metalness: desc.metalness || 0, bumpScale: desc.bumpScale });

function proceduralLook(materials, desc) {
  return { ...baseFinish(desc), map: materials.cloud, color: new THREE.Color(desc.fallbackColor), envMapIntensity: desc.envMapIntensity,
    clearcoat: desc.clearcoat || 0, clearcoatRoughness: desc.clearcoatRoughness, tiles: null,
    seam: new THREE.Color(desc.fallbackColor).multiplyScalar(0.62) };
}

function photoLook(materials, desc, photo) {
  const tuned = window.MaterialAdapter.adjustForLuminance(desc, photo.luminance);
  const tiles = materials.tiled && window.MaterialAdapter.tileParams(materials.tiled.tiling, materials.tiled.projection, desc.patternSizeM);
  return { ...baseFinish(desc), map: photo.texture, color: new THREE.Color(PHOTO_TINT), envMapIntensity: tuned.envMapIntensity,
    clearcoat: tuned.clearcoat, clearcoatRoughness: tuned.clearcoatRoughness, tiles: tiles || null,
    seam: new THREE.Color().setRGB(...photo.color, THREE.SRGBColorSpace).multiplyScalar(0.62) };
}

// The finish numbers a fade moves between.
const FADED = ['roughness', 'metalness', 'clearcoat', 'clearcoatRoughness', 'bumpScale', 'envMapIntensity'];
const finishOf = stone => Object.fromEntries(FADED.map(k => [k, stone[k]]));

// What is on screen now becomes the "before" a fade starts from: its photo
// (or procedural map) with its placement, tint, tiling, finish and UVs.
// Mid-fade, the nearer of the two looks is kept.
function holdCurrentLook(materials) {
  const stone = materials.stone, u = stone.userData.tileUniforms;
  if (materials.fade && u.stoneMix.value < 0.5) return;
  stone.map.updateMatrix();
  u.stonePrevMap.value = stone.map;
  u.stonePrevTransform.value.copy(stone.map.matrix);
  u.stonePrevColor.value.copy(stone.color);
  u.stonePrevTileOn.value = u.stoneTileOn.value;
  u.stonePrevTileCell.value.copy(u.stoneTileCell.value);
  u.stonePrevTileRoom.value.copy(u.stoneTileRoom.value);
  u.stonePrevTileSplit.value.copy(u.stoneTileSplit.value);
  productGroup.userData.stoneMeshes.forEach(({ mesh }) => mesh.geometry.setAttribute('stoneUvPrev', mesh.geometry.getAttribute('uv')));
  materials.heldFinish = finishOf(stone);
}

// Puts a look on the material: at once, or fading in over the held one.
function showLook(materials, look, fade) {
  const stone = materials.stone, u = stone.userData.tileUniforms;
  stone.color.copy(look.color);
  stone.map = look.map;
  FADED.forEach(k => { stone[k] = look[k]; });
  u.stoneTileOn.value = look.tiles ? 1 : 0;
  if (look.tiles) {
    u.stoneTileCell.value.set(...look.tiles.cell);
    u.stoneTileRoom.value.set(...look.tiles.room);
    u.stoneTileSplit.value.set(...look.tiles.split);
  }
  stone.needsUpdate = true;
  materials.seam.color.copy(look.seam);
  materials.pending = null;
  if (fade && materials.heldFinish) {
    materials.fade = { start: null, from: materials.heldFinish, to: finishOf(stone) };
    Object.assign(stone, materials.heldFinish);
    u.stoneMix.value = 0;
  } else {
    materials.fade = { to: finishOf(stone) };
    finishFade(materials);
  }
}

function finishFade(materials) {
  const stone = materials.stone, u = stone.userData.tileUniforms;
  if (materials.fade) Object.assign(stone, materials.fade.to);
  materials.fade = null;
  u.stoneMix.value = 1;
  u.stonePrevMap.value = stone.map;
  (materials.retired || []).forEach(t => t.dispose());
  materials.retired = [];
}

// One frame of a running fade; a look held for a loading photo waits.
function stepFade(materials) {
  const fade = materials.fade;
  if (!fade || materials.pending) return;
  // The fade runs from the first frame that draws it.
  if (fade.start === null) fade.start = performance.now();
  const t = window.Motion.fadeAt((performance.now() - fade.start) / 1000, STONE_FADE_S);
  if (t >= 1) { finishFade(materials); return; }
  const stone = materials.stone;
  FADED.forEach(k => { stone[k] = fade.from[k] + (fade.to[k] - fade.from[k]) * t; });
  stone.userData.tileUniforms.stoneMix.value = t;
}

// `fade`: the caller has held the look on screen (holdCurrentLook) and the
// new stone fades in over it.
function applyStone(materials, desc, fade) {
  const stone = materials.stone;
  // The old maps go once nothing shows them any more.
  materials.retired = (materials.retired || []).concat(materials.owned || []);
  if (!fade) { materials.retired.forEach(t => t.dispose()); materials.retired = []; }
  const grain = scaledTexture(textures.grain, 1.5, desc);
  const cloud = scaledTexture(proceduralMap(desc.procedural), desc.procedural.pattern === 'speckle' ? 2.5 : 0.6, desc);
  materials.owned = [grain, cloud];
  materials.cloud = cloud;
  materials.descriptor = desc;
  stone.roughness = desc.roughness;
  stone.roughnessMap = desc.microGrain ? grain : null;
  stone.metalness = desc.metalness || 0;
  stone.clearcoat = desc.clearcoat || 0;
  stone.clearcoatRoughness = desc.clearcoatRoughness;
  stone.bumpMap = desc.bumpScale > 0 ? grain : null;
  stone.bumpScale = desc.bumpScale;
  stone.envMapIntensity = desc.envMapIntensity;
  const current = () => materials.descriptor === desc && productGroup && productGroup.userData.materials === materials;

  const cached = desc.source === 'image' && stoneTextures.get(desc.imageUrl);
  if (cached && cached.entry) {
    cached.lastUsed = ++stoneUseCounter;
    showLook(materials, photoLook(materials, desc, cached.entry), fade);
    return;
  }
  if (desc.source !== 'image' || !fade) {
    showLook(materials, proceduralLook(materials, desc), fade);
  } else {
    // The stone on screen (its finish too) stays while the photo loads.
    materials.pending = desc;
    materials.fade = { from: materials.heldFinish, to: finishOf(stone) };
    Object.assign(stone, materials.heldFinish);
    stone.userData.tileUniforms.stoneMix.value = 0;
    stone.needsUpdate = true;
    setTimeout(() => {
      if (current() && materials.pending === desc) showLook(materials, proceduralLook(materials, desc), true);
    }, PHOTO_WAIT_S * 1000);
  }
  if (desc.source !== 'image') return;
  loadStonePhoto(desc).then(photo => {
    // Only if this stone is still the one on screen.
    if (!photo || !current()) return;
    const smoothly = !reducedMotion.matches;
    if (smoothly && !materials.pending) holdCurrentLook(materials);
    showLook(materials, photoLook(materials, desc, photo), smoothly);
  });
}

// Tiled surfaces (see MaterialAdapter.tileCoords): the photo is sampled
// per tile -- each tile its own region, chosen by a fixed hash of the tile's
// grid cell. textureGrad keeps the mip level continuous across the joints.
// During a fade the stone shown before is sampled the same way, from its
// own photo, UVs and tiling (the stonePrev* uniforms), and mixed under it;
// at rest (stoneMix 1) only the stone on screen is sampled.
const STONE_TILE_VERTEX = `
attribute vec2 stoneTile;
varying vec2 vStoneTile;
attribute vec2 stoneUvPrev;
uniform mat3 stonePrevTransform;
varying vec2 vStonePrevUv;
`;
const STONE_TILE_FRAGMENT = `
uniform float stoneTileOn;
uniform vec2 stoneTileCell;
uniform vec2 stoneTileRoom;
uniform vec2 stoneTileSplit;
varying vec2 vStoneTile;
uniform float stoneMix;
uniform sampler2D stonePrevMap;
uniform vec3 stonePrevColor;
uniform float stonePrevTileOn;
uniform vec2 stonePrevTileCell;
uniform vec2 stonePrevTileRoom;
uniform vec2 stonePrevTileSplit;
varying vec2 vStonePrevUv;
vec4 stoneSample(sampler2D tex, vec2 baseUv, float tileOn, vec2 tileCell, vec2 tileRoom, vec2 tileSplit) {
  vec2 stoneUv = baseUv;
  vec2 stoneGx = dFdx(baseUv), stoneGy = dFdy(baseUv);
  vec2 tileGx = dFdx(vStoneTile) * tileCell, tileGy = dFdy(vStoneTile) * tileCell;
  if (tileOn > 0.5 && vStoneTile.x > -1000.0) {
    vec2 cell = floor(vStoneTile) * tileSplit;
    vec2 pick = fract(sin(vec2(dot(cell, vec2(127.1, 311.7)), dot(cell, vec2(269.5, 183.3)))) * 43758.5453);
    // Split axes restart the photo in every tile; a joint-free axis runs on.
    stoneUv = mix(vStoneTile, fract(vStoneTile), tileSplit) * tileCell + pick * tileRoom;
    stoneGx = tileGx;
    stoneGy = tileGy;
  }
  return textureGrad(tex, stoneUv, stoneGx, stoneGy);
}
`;
const STONE_TILE_MAP = `
#ifdef USE_MAP
  vec4 stoneNow = stoneSample(map, vMapUv, stoneTileOn, stoneTileCell, stoneTileRoom, stoneTileSplit);
  if (stoneMix < 1.0) {
    vec4 stoneBefore = vec4(stonePrevColor, diffuseColor.a) * stoneSample(stonePrevMap, vStonePrevUv, stonePrevTileOn, stonePrevTileCell, stonePrevTileRoom, stonePrevTileSplit);
    diffuseColor = mix(stoneBefore, diffuseColor * stoneNow, stoneMix);
  } else {
    diffuseColor *= stoneNow;
  }
#endif
`;

function buildStoneMaterial(desc) {
  const stone = new THREE.MeshPhysicalMaterial({ color: desc.fallbackColor });
  const uniforms = {
    stoneTileOn: { value: 0 },
    stoneTileCell: { value: new THREE.Vector2(1, 1) },
    stoneTileRoom: { value: new THREE.Vector2(0, 0) },
    stoneTileSplit: { value: new THREE.Vector2(1, 1) },
    stoneMix: { value: 1 },
    stonePrevMap: { value: null },
    stonePrevTransform: { value: new THREE.Matrix3() },
    stonePrevColor: { value: new THREE.Color() },
    stonePrevTileOn: { value: 0 },
    stonePrevTileCell: { value: new THREE.Vector2(1, 1) },
    stonePrevTileRoom: { value: new THREE.Vector2(0, 0) },
    stonePrevTileSplit: { value: new THREE.Vector2(1, 1) },
  };
  stone.userData.tileUniforms = uniforms;
  stone.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = STONE_TILE_VERTEX + shader.vertexShader.replace('#include <uv_vertex>',
      '#include <uv_vertex>\n  vStoneTile = stoneTile;\n  vStonePrevUv = (stonePrevTransform * vec3(stoneUvPrev, 1.0)).xy;');
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
    // Backlight (a panel or wall «с подсветкой»): a warm LED glow, unlit.
    light: new THREE.MeshBasicMaterial({ color: '#ffd7a3' }),
  };
}

// ---- geometry ------------------------------------------------------------

// A stone prism is a solid with its real edge profile (EdgeProfile, a UMD
// script on window): the profile only along the edges open to the room, the
// plan its exact size, smooth where the stone is curved.
const toVec2 = pts => pts.map(p => new THREE.Vector2(p.x, p.y));
function buildStoneSolid(part) {
  const solid = window.EdgeProfile.buildSolid(part, {
    triangulate: (contour, holes) => THREE.ShapeUtils.triangulateShape(toVec2(contour), holes.map(toVec2)),
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(solid.positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(solid.normals, 3));
  return geometry;
}

function buildPrismGeometry(part) {
  if (part.role === 'stone') return buildStoneSolid(part);
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
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: Math.max(0.001, part.y1 - part.y0), bevelEnabled: false, curveSegments: 20 });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, part.y0, 0);
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

// Integrated sink: a real hollow stone bowl under the slab's opening --
// stone walls of real thickness around the cavity and a stone floor -- so
// its inner faces are there from any camera angle. (Built from single-sided
// planes, as the steel basins are, the walls faced outward and vanished
// when looking into the bowl.) The cavity is flush with the opening's
// straight face, which is the cut itself (EdgeProfile: the profile goes into
// the stone).
//
// No seam (2026-10-10): the slab's profile rounds its opening at the bottom
// too, and a bowl that began at the slab's underside left that rounding as
// a groove all round the bowl -- a line where the bowl met the slab. So the
// walls rise inside the opening up to where its top rounding begins, a
// hair inside it (STONE_BOWL_OVERLAP_M) so they alone are seen: from the
// countertop, the stone turns over the softened rim straight down into the
// bowl. (The bowl also takes the slab's own piece of stone -- see
// buildProductGroup -- so the veins run on into it.)
const STONE_BOWL_WALL_M = 0.02;
const STONE_BOWL_OVERLAP_M = 0.0005;
function buildStoneBowl(group, part, materials) {
  const [cx, top, cz] = part.center;
  const [sx, depth, sz] = part.size;
  const slabM = part.slabThicknessM || 0;
  const rounding = window.EdgeProfile.profile(part.edge, 0, slabM).topSize;
  const rise = Math.max(0, slabM - rounding);   // from the slab's underside to where its top rounding begins
  const w = sx / 2 - STONE_BOWL_OVERLAP_M, l = sz / 2 - STONE_BOWL_OVERLAP_M, t = STONE_BOWL_WALL_M;
  const shape = new THREE.Shape();
  shape.moveTo(-w - t, -l - t); shape.lineTo(w + t, -l - t); shape.lineTo(w + t, l + t); shape.lineTo(-w - t, l + t); shape.closePath();
  const cavity = new THREE.Path();
  cavity.moveTo(-w, -l); cavity.lineTo(-w, l); cavity.lineTo(w, l); cavity.lineTo(w, -l); cavity.closePath();
  shape.holes.push(cavity);
  const walls = new THREE.ExtrudeGeometry(shape, { depth: depth + rise, bevelEnabled: false });
  walls.rotateX(-Math.PI / 2);
  addMesh(group, walls, materials.stone, [cx, top - depth, cz]);
  addMesh(group, new THREE.BoxGeometry(2 * (w + t), t, 2 * (l + t)), materials.stone, [cx, top - depth - t / 2, cz]);
  const drain = new THREE.CircleGeometry(Math.min(w, l) * 0.18, 32);
  drain.rotateX(-Math.PI / 2);
  addMesh(group, drain, materials.metal, [cx, top - depth + 0.0008, cz], false);
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
  group.userData.floorDisc = mesh;
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
    const uv = new THREE.BufferAttribute(window.MaterialAdapter.stoneUVs(positions, normals, { projection, patternSizeM: desc.patternSizeM }), 2);
    mesh.geometry.setAttribute('uv', uv);
    // The UVs a fade samples the stone shown before with (holdCurrentLook).
    if (!mesh.geometry.getAttribute('stoneUvPrev')) mesh.geometry.setAttribute('stoneUvPrev', uv);
  });
  group.userData.patternSizeM = desc.patternSizeM.join('x');
}

const APRON_NAMES = ['wrap', 'wing-wrap'];
function buildProductGroup(layout, materialDescriptor) {
  const group = new THREE.Group();
  const materials = buildMaterials(materialDescriptor);
  group.userData.materials = materials;
  group.userData.stoneMeshes = [];
  let stoneIndex = 0;
  let mainStone = null;   // the countertop's own slab: { part, index }
  let lastSlab = null;    // the stone part drawn last, apart from aprons
  layout.parts.forEach(part => {
    const before = group.children.length;
    buildPart(group, part, materials);
    if (part.role === 'stone') {
      const index = stoneIndex++;
      if (part.name === 'main' && !mainStone) mainStone = { part, index };
      // An integrated sink is the countertop's own stone, not a piece of its own:
      // the bowl takes the slab's projection, so the veins run on into it unbroken.
      // So does a «подгиб камнем» apron (laid out right after its slab): the
      // stone folds over the edge, the veins run down the edge and the apron.
      const apron = APRON_NAMES.includes(part.name) && lastSlab;
      const own = part.kind === 'basin' && mainStone ? mainStone : (apron ? lastSlab : { part, index });
      if (!apron) lastSlab = own;
      group.children.slice(before).forEach(mesh => {
        if (mesh.isMesh) group.userData.stoneMeshes.push(captureStoneMesh(mesh, own.part, own.index));
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
    const cast = part.role !== 'context' && part.role !== 'context-glass' && part.role !== 'light';
    if (part.kind === 'prism') {
      addMesh(group, buildPrismGeometry(part), materials[part.role], null, cast);
    } else if (part.kind === 'box') {
      addMesh(group, new THREE.BoxGeometry(...part.size), materials[part.role], part.center, cast);
    } else if (part.kind === 'basin' && part.role === 'stone') {
      buildStoneBowl(group, part, materials);
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
  (materials.owned || []).concat(materials.retired || []).forEach(t => t.dispose());
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

// ---- the room: «Студия», «День», «Вечер» -----------------------------------

// «Студия» is the plain studio, as before. «День» and «Вечер» stand the
// product in a room (RoomLayout: a wall and a floor, kitchen cabinets, a
// wall-hung vanity with a mirror, a wall along a stair) under daylight or
// warm evening lamps. The room is built only when it is first shown, as a
// part of the product's group (so it eases with a new size), and never
// appears in a passport shot.
function facadeColor() {
  const list = window.RoomLayout.FACADES;
  return (list.find(f => f.id === facadeId) || list[0]).hex;
}

// The room fades in and out, so its materials are see-through from the start
// (at full opacity they draw as solid ones).
function roomMaterials() {
  const flat = (color, roughness) => new THREE.MeshStandardMaterial({ color, roughness, metalness: 0, envMapIntensity: 0.3, transparent: true, opacity: 0 });
  const { wall, floor } = window.RoomLayout.ROOM_COLORS;
  return {
    wall: flat(wall, 0.95), floor: flat(floor, 0.7),
    front: flat('#ffffff', 0.6), carcass: flat('#ffffff', 0.88), plinth: flat('#ffffff', 0.88),
    // A mirror reflects the room: the studio's dark surroundings would make it
    // a black panel, so it shows a soft, light reflection instead.
    mirror: new THREE.MeshStandardMaterial({ color: '#e4e7ea', roughness: 0.18, metalness: 0.9, envMapIntensity: 2.4, transparent: true, opacity: 0 }),
    glow: new THREE.MeshBasicMaterial({ color: '#ffd7a3', transparent: true, opacity: 0 }),
  };
}

// The fronts in the given colour; the carcass and plinth a shade darker, so
// the gaps between the fronts read.
function paintFacades(materials, color) {
  const c = color || new THREE.Color(facadeColor());
  materials.front.color.copy(c);
  materials.carcass.color.copy(c).multiplyScalar(0.8);
  materials.plinth.color.copy(c).multiplyScalar(0.55);
}

function buildRoom(group) {
  const data = window.RoomLayout.buildRoom(lastLayout, lastProductKey);
  const room = { data, group: new THREE.Group(), materials: roomMaterials() };
  paintFacades(room.materials, shown.front);
  (data ? data.boxes : []).forEach(b => {
    const size = [0, 1, 2].map(i => b.max[i] - b.min[i]);
    const center = [0, 1, 2].map(i => (b.min[i] + b.max[i]) / 2);
    const flat = b.role === 'wall' || b.role === 'floor' || b.role === 'glow' || b.role === 'mirror';
    const mesh = addMesh(room.group, new THREE.BoxGeometry(...size), room.materials[b.role], center, !flat);
    mesh.userData.role = b.role;
  });
  group.add(room.group);
  group.userData.room = room;
  return room;
}

function disposeRoom(group) {
  const room = group.userData.room;
  if (!room) return;
  Object.values(room.materials).forEach(m => m.dispose());
}

// A switch of mode or front colour fades (ROOM_FADE_S, the colour faster):
// the lights, the exposure, the room's opacity (and the studio floor disc's,
// the other way), the mirror's glow, the evening's lamps and bounce light,
// and the fronts' colour all move together from what is on screen to the new
// mode. At the end of a fade to «Студия» the room is hidden and the lamps go:
// the studio is exactly as before. Reduced motion: at once.
const ROOM_FADE_S = 0.6;
const FACADE_FADE_S = 0.35;
let shown = { room: 0, glow: 0, lamps: 0, front: null };   // what the scene shows now, between modes
let roomFade = null;     // { from, to, start, duration }
let lampsLayout = null;  // the layout the lamps were placed for

function roomTarget(mode) {
  const L = window.RoomLayout.LIGHTS[mode];
  return {
    key: [new THREE.Color(L.key[0]), L.key[1]], fill: [new THREE.Color(L.fill[0]), L.fill[1]], rim: [new THREE.Color(L.rim[0]), L.rim[1]],
    hemi: [new THREE.Color(L.hemi[0]), new THREE.Color(L.hemi[1]), L.hemi[2]], exposure: L.exposure,
    room: mode === 'studio' ? 0 : 1, glow: mode === 'evening' ? 1 : 0, lamps: L.lamp ? 1 : 0,
    front: new THREE.Color(facadeColor()),
  };
}

function roomCurrent() {
  return {
    key: [keyLight.color.clone(), keyLight.intensity], fill: [fillLight.color.clone(), fillLight.intensity], rim: [rimLight.color.clone(), rimLight.intensity],
    hemi: [hemiLight.color.clone(), hemiLight.groundColor.clone(), hemiLight.intensity], exposure: renderer.toneMappingExposure,
    room: shown.room, glow: shown.glow, lamps: shown.lamps, front: (shown.front || new THREE.Color(facadeColor())).clone(),
  };
}

function mixRoom(a, b, t) {
  const n = (x, y) => x + (y - x) * t, c = (x, y) => x.clone().lerp(y, t);
  return {
    key: [c(a.key[0], b.key[0]), n(a.key[1], b.key[1])], fill: [c(a.fill[0], b.fill[0]), n(a.fill[1], b.fill[1])], rim: [c(a.rim[0], b.rim[0]), n(a.rim[1], b.rim[1])],
    hemi: [c(a.hemi[0], b.hemi[0]), c(a.hemi[1], b.hemi[1]), n(a.hemi[2], b.hemi[2])], exposure: n(a.exposure, b.exposure),
    room: n(a.room, b.room), glow: n(a.glow, b.glow), lamps: n(a.lamps, b.lamps), front: c(a.front, b.front),
  };
}

// The evening's bounce light and lamps for the current model (off).
function makeLampLights() {
  const E = window.RoomLayout.LIGHTS.evening, b = lastBounds;
  const [color, strength, dir] = E.bounce;
  const bounce = new THREE.DirectionalLight(color, 0);
  const c = [0, 1, 2].map(i => (b.min[i] + b.max[i]) / 2);
  bounce.position.set(c[0] + dir[0] * 5, c[1] + dir[1] * 5, c[2] + dir[2] * 5);
  bounce.target.position.set(...c);
  bounce.target.updateMatrixWorld();
  bounce.userData.strength = strength;
  const lamps = window.RoomLayout.lampsFor(lastLayout, lastProductKey).map(lamp => {
    const light = new THREE.PointLight(E.lamp[0], 0, 0, 2);
    light.position.set(...lamp.position);
    light.userData.strength = lamp.kind === 'mirror' ? E.lamp[1] * 0.6 : E.lamp[1];
    return light;
  });
  return [bounce].concat(lamps);
}

// The evening's lights at `weight` of their strength: placed for the
// current model, gone at 0.
function setLamps(weight) {
  if (weight <= 0 || lampsLayout !== lastLayout) {
    roomLights.forEach(l => { scene.remove(l); if (l.target) scene.remove(l.target); });
    roomLights = [];
    lampsLayout = null;
  }
  if (weight <= 0 || !lastLayout) return;
  if (!roomLights.length) {
    roomLights = makeLampLights();
    roomLights.forEach(l => { scene.add(l); if (l.target) scene.add(l.target); });
    lampsLayout = lastLayout;
  }
  roomLights.forEach(l => { l.intensity = l.userData.strength * weight; });
}

function applyRoomState(S) {
  keyLight.color.copy(S.key[0]); keyLight.intensity = S.key[1];
  fillLight.color.copy(S.fill[0]); fillLight.intensity = S.fill[1];
  rimLight.color.copy(S.rim[0]); rimLight.intensity = S.rim[1];
  hemiLight.color.copy(S.hemi[0]); hemiLight.groundColor.copy(S.hemi[1]); hemiLight.intensity = S.hemi[2];
  renderer.toneMappingExposure = S.exposure;
  shown = { room: S.room, glow: S.glow, lamps: S.lamps, front: S.front.clone() };
  setLamps(S.lamps);
  if (!productGroup) return;
  let room = productGroup.userData.room;
  if (S.room > 0 && !room) room = buildRoom(productGroup);
  if (room) {
    room.group.visible = S.room > 0;
    Object.entries(room.materials).forEach(([role, m]) => { m.opacity = role === 'glow' ? S.room * S.glow : S.room; });
    room.group.children.forEach(m => { if (m.userData.role === 'glow') m.visible = S.glow > 0; });
    paintFacades(room.materials, S.front);
  }
  const disc = productGroup.userData.floorDisc;
  if (disc) {
    const opacity = room && room.data ? 1 - S.room : 1;
    disc.material.opacity = opacity;
    // Fading, it must not hide the room's floor below it.
    disc.material.depthWrite = opacity >= 1;
    disc.visible = opacity > 0;
  }
}

function fadeRoomTo(to, duration) {
  if (reducedMotion.matches || !hasModel) {
    roomFade = null;
    applyRoomState(to);
    return;
  }
  const fade = roomFade = { from: roomCurrent(), to, start: null, duration, ready: false };
  // The room and the lamps the fade brings in are new to the GPU: their
  // shaders (and the stone's, with more lights) are compiled first, off the
  // main thread where the browser can, so the fade runs without a stall.
  const go = () => { if (roomFade === fade) fade.ready = true; };
  if (to.room > 0 && productGroup && !productGroup.userData.room) buildRoom(productGroup).group.visible = false;
  if (!renderer.compileAsync) { go(); return; }
  const target = new THREE.Scene();
  target.environment = scene.environment;
  if (to.lamps > 0 && !roomLights.length && lastLayout) makeLampLights().forEach(l => target.add(l));
  renderer.compileAsync(scene, camera, target).then(go, go);
}

function stepRoomFade() {
  if (!roomFade || !roomFade.ready) return;
  // The fade runs from the first frame that draws it.
  if (roomFade.start === null) roomFade.start = performance.now();
  const t = window.Motion.fadeAt((performance.now() - roomFade.start) / 1000, roomFade.duration);
  if (t >= 1) {
    const { to } = roomFade;
    roomFade = null;
    applyRoomState(to);
    return;
  }
  applyRoomState(mixRoom(roomFade.from, roomFade.to, t));
}

// The current mode on a new model, at once (it arrives with the model).
function showRoom() {
  if (roomFade) { const { to } = roomFade; roomFade = null; applyRoomState(to); return; }
  if (roomMode !== 'studio') applyRoomState(roomTarget(roomMode));
}

// `mode`: 'studio' | 'day' | 'evening'; `facade`: a RoomLayout.FACADES id.
function setRoom({ mode, facade }) {
  const modeChanged = !!mode && window.RoomLayout.MODES.includes(mode) && mode !== roomMode;
  if (modeChanged) roomMode = mode;
  const facadeChanged = !!facade && facade !== facadeId;
  if (facadeChanged) facadeId = facade;
  if (!modeChanged && !facadeChanged) return;
  fadeRoomTo(roomTarget(roomMode), modeChanged ? ROOM_FADE_S : FACADE_FADE_S);
}

// What the room offers for the current product: a room at all, and fronts
// to colour.
function roomOptions() {
  const data = hasModel && window.RoomLayout.buildRoom(lastLayout, lastProductKey);
  return { hasRoom: !!data, hasFacades: !!(data && data.hasFacades) };
}

// ---- camera --------------------------------------------------------------

function currentDirection() {
  const d = camera.position.clone().sub(controls.target);
  return d.lengthSq() > 1e-9 ? [d.x, d.y, d.z] : [1, 0.8, 1];
}

// Where the camera goes to show the whole product from `direction`.
function fitView(direction) {
  const fit = window.CameraFraming.fitCamera({ bounds: lastBounds, direction, fovDeg: FOV_DEG, aspect: camera.aspect, padding: framePadding });
  return {
    target: fit.target, position: fit.position,
    near: Math.max(0.01, fit.distance / 100), far: fit.distance * 40,
    minDistance: fit.distance * 0.3, maxDistance: fit.distance * 3.5,
  };
}

function placeCamera(view) {
  controls.target.set(...view.target);
  camera.position.set(...view.position);
  camera.near = view.near;
  camera.far = view.far;
  camera.updateProjectionMatrix();
  controls.minDistance = view.minDistance;
  controls.maxDistance = view.maxDistance;
  controls.update();
}

// `smooth`: the camera glides there (moveCamera) instead of jumping.
function frame(direction, smooth) {
  if (!lastBounds) return;
  moveCamera(fitView(direction), smooth);
}

// The camera glides to a new view around the model, never through it: the
// target, the angles around it (as OrbitControls has them: azimuth about the
// vertical, tilt from straight above -- so a glide into the top view turns
// the picture smoothly instead of snapping at the end) and the distance (on
// a log scale, so a close look and a whole kitchen move alike) each ease
// toward the view (Motion, a critically damped spring); a new view mid-way
// is picked up without a jump. Grabbing the model stops the glide.
function cameraValues(target, position) {
  const d = [position[0] - target[0], position[1] - target[1], position[2] - target[2]];
  const dist = Math.hypot(d[0], d[1], d[2]) || 1e-6;
  const azimuth = Math.atan2(d[0], d[2]);
  const tilt = Math.acos(Math.max(-1, Math.min(1, d[1] / dist)));
  return [target[0], target[1], target[2], azimuth, tilt, Math.log(dist)];
}

// The goal's azimuth the short way round from where the camera is.
function nearAzimuth(values, from) {
  const turn = 2 * Math.PI;
  values[3] = from + ((((values[3] - from) % turn) + turn + Math.PI) % turn) - Math.PI;
  return values;
}

function moveCamera(view, smooth) {
  if (!smooth || reducedMotion.matches || !hasModel) {
    cameraMove = null;
    placeCamera(view);
    return;
  }
  if (!cameraMove) {
    cameraMove = { spring: window.Motion.createSpring(cameraValues(controls.target.toArray(), camera.position.toArray())) };
  }
  cameraMove.goal = view;
  window.Motion.retarget(cameraMove.spring, nearAzimuth(cameraValues(view.target, view.position), cameraMove.spring.x[3]));
}

function stepCamera(dt) {
  const { spring, goal } = cameraMove;
  if (window.Motion.step(spring, dt, 2e-4)) {
    cameraMove = null;
    placeCamera(goal);
    return;
  }
  const [tx, ty, tz, azimuth, tilt, logDist] = spring.x;
  const dist = Math.exp(logDist);
  controls.target.set(tx, ty, tz);
  camera.position.set(tx + dist * Math.sin(tilt) * Math.sin(azimuth), ty + dist * Math.cos(tilt), tz + dist * Math.sin(tilt) * Math.cos(azimuth));
  camera.lookAt(controls.target);
  camera.near = Math.max(0.005, dist / 100);
  camera.far = Math.max(goal.far, dist * 40);
  camera.updateProjectionMatrix();
}

// The client takes over mid-glide: the camera stays where it is, and the
// zoom limits leave room for that distance.
function stopCameraMove() {
  if (!cameraMove) return;
  const { goal } = cameraMove;
  cameraMove = null;
  const dist = camera.position.distanceTo(controls.target);
  controls.minDistance = Math.min(goal.minDistance, dist);
  controls.maxDistance = Math.max(goal.maxDistance, dist);
}

// The direction the camera is looking from -- or, mid-glide, going to.
function viewDirection() {
  if (!cameraMove) return currentDirection();
  const g = cameraMove.goal;
  return [g.position[0] - g.target[0], g.position[1] - g.target[1], g.position[2] - g.target[2]];
}

// ---- the model easing to a new size ----------------------------------------

// A new size of the same product (the same parts, only longer, wider, ...):
// the model eases from the size on screen to the new one instead of jumping
// -- the new model is drawn stretched to the old one's bounds and relaxes to
// its own (Motion; the bounds on screen spring toward the new bounds, so a
// size typed digit by digit is followed without jumps). Lights and shadows
// follow the bounds on screen. A product that gains or loses parts (a wing,
// a sink, another step count) changes at once.
function structureOf(layout) {
  return layout.parts.map(p => [p.kind, p.role, p.name || '', p.outline ? p.outline.length : 0, (p.holes || []).length].join(':')).join('|');
}

const boundsValues = b => b.min.concat(b.max);

function shownBounds() {
  if (!morph) return lastBounds;
  const x = morph.spring.x;
  return { min: x.slice(0, 3), max: x.slice(3, 6) };
}

function startMorph(from, to) {
  if (!morph) morph = { spring: window.Motion.createSpring(boundsValues(from)) };
  window.Motion.retarget(morph.spring, boundsValues(to));
  applyMorph();
}

// Maps the product's own bounds onto the bounds on screen.
function applyMorph() {
  const shown = shownBounds(), own = lastBounds;
  for (let i = 0; i < 3; i++) {
    const size = own.max[i] - own.min[i];
    const s = size > 1e-6 ? (shown.max[i] - shown.min[i]) / size : 1;
    productGroup.scale.setComponent(i, s);
    productGroup.position.setComponent(i, shown.min[i] - s * own.min[i]);
  }
  placeLights(shown);
}

function stepMorph(dt) {
  if (window.Motion.step(morph.spring, dt, 1e-4)) {
    morph = null;
    productGroup.scale.set(1, 1, 1);
    productGroup.position.set(0, 0, 0);
    placeLights(lastBounds);
    return;
  }
  applyMorph();
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

  hemiLight = new THREE.HemisphereLight('#fff2e0', '#2b231c', 0.3);
  scene.add(hemiLight);
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
  controls.addEventListener('start', () => { userAdjusted = true; stopCameraMove(); });

  resizeObserver = new ResizeObserver(() => resize());
  resizeObserver.observe(canvasEl.parentElement);
  resize();

  function animate(now) {
    frameId = requestAnimationFrame(animate);
    const dt = lastFrameTime && now ? (now - lastFrameTime) / 1000 : 0;
    lastFrameTime = now || 0;
    if (morph) stepMorph(dt);
    if (productGroup) stepFade(productGroup.userData.materials);
    stepRoomFade();
    if (cameraMove) stepCamera(dt);
    else controls.update();
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
  if (hasModel && !userAdjusted) frame(viewDirection(), !!cameraMove);
}

// Only sizes changed (the same product, parts and choices): while a size is
// being typed digit by digit the model would pass through 1 mm, 15 mm, ...
// so the 3D waits for a pause (RESIZE_SETTLE_MS) and then eases straight to
// the size typed. Anything else changes at once.
const RESIZE_SETTLE_MS = 350;
let pendingResize = null;   // { geometryModel, materialDescriptor, timer }
const shapeOf = geometryModel => JSON.stringify(geometryModel, (k, v) => (typeof v === 'number' ? 0 : v));

function flushResize() {
  if (!pendingResize) return;
  const { geometryModel, materialDescriptor, timer } = pendingResize;
  clearTimeout(timer);
  pendingResize = null;
  rebuild(geometryModel, materialDescriptor);
}

function update(geometryModel, materialDescriptor) {
  if (pendingResize) { clearTimeout(pendingResize.timer); pendingResize = null; }
  // Same geometry, another stone (or the same one again): only the stone
  // material changes -- meshes, lights, camera and controls stay as they are.
  const geometryKey = JSON.stringify(geometryModel);
  if (productGroup && productGroup.userData.geometryKey === geometryKey) {
    const materials = productGroup.userData.materials;
    const previous = materials.descriptor;
    if (previous && JSON.stringify(previous) === JSON.stringify(materialDescriptor)) return;
    const fade = !reducedMotion.matches && !!materials.stone.map;
    if (fade) holdCurrentLook(materials);
    if (productGroup.userData.patternSizeM !== materialDescriptor.patternSizeM.join('x')) projectStoneUVs(productGroup, materialDescriptor);
    applyStone(materials, materialDescriptor, fade);
    return;
  }
  if (productGroup && !reducedMotion.matches && productGroup.userData.shape === shapeOf(geometryModel)) {
    pendingResize = { geometryModel, materialDescriptor, timer: setTimeout(flushResize, RESIZE_SETTLE_MS) };
    return;
  }
  rebuild(geometryModel, materialDescriptor);
}

function rebuild(geometryModel, materialDescriptor) {
  const geometryKey = JSON.stringify(geometryModel);
  const layout = window.SceneLayout.buildSceneLayout(geometryModel);
  const structure = geometryModel.productKey + '#' + structureOf(layout);
  const resized = productGroup && lastBounds && layout.bounds && !reducedMotion.matches
    && productGroup.userData.structure === structure ? shownBounds() : null;
  if (productGroup) {
    scene.remove(productGroup);
    disposeRoom(productGroup);
    disposeGroup(productGroup);
  }
  productGroup = buildProductGroup(layout, materialDescriptor);
  productGroup.userData.geometryKey = geometryKey;
  productGroup.userData.structure = structure;
  productGroup.userData.shape = shapeOf(geometryModel);
  scene.add(productGroup);
  if (!resized) morph = null;
  if (layout.bounds && !resized) placeLights(layout.bounds);

  // Every update() adopts the current product's own default -- switching
  // products immediately changes what "Сбросить вид" returns to.
  const previousPreset = cameraPresetTracker.getDefaultPreset();
  cameraPresetTracker.setDefaultFromGeometryModel(geometryModel);

  const action = window.CameraFraming.decideCameraAction({
    hasPrevious: hasModel,
    previousProductKey: lastProductKey,
    nextProductKey: geometryModel.productKey,
    previousBounds: lastBounds,
    nextBounds: layout.bounds,
    previousPreset,
    nextPreset: cameraPresetTracker.getDefaultPreset(),
  });
  lastBounds = layout.bounds;
  lastLayout = layout;
  framePadding = layout.framePadding;
  lastProductKey = geometryModel.productKey;
  if (resized) startMorph(resized, layout.bounds);
  showRoom();
  const first = !hasModel;
  hasModel = true;
  if (action === 'reset') setView(cameraPresetTracker.getDefaultPreset(), !first);
  else if (action === 'refit') { frame(viewDirection(), true); userAdjusted = false; }
}

// The view buttons glide (`smooth` unless false); the first model is
// placed at once.
function setView(presetName, smooth) {
  // CAMERA_PRESETS lives in visualizer/constants.js -- one source of truth
  // for the view directions.
  const presetsByName = window.VisualizerConstants.CAMERA_PRESETS;
  const preset = presetsByName[presetName] || presetsByName.iso;
  frame(preset.direction, smooth !== false);
  userAdjusted = false;
}

// «Кромка»: up close to the chosen edge profile (CameraFraming.edgeCloseup).
// The client may orbit and zoom on from there; a canvas resize keeps it.
function showEdge() {
  const view = canShowEdge() && window.CameraFraming.edgeCloseup(lastLayout);
  if (!view) return;
  const limits = cameraMove ? cameraMove.goal : { minDistance: controls.minDistance, maxDistance: controls.maxDistance };
  moveCamera({
    target: view.target, position: view.position,
    near: Math.max(0.005, view.distance / 100), far: camera.far,
    minDistance: Math.min(limits.minDistance, view.distance * 0.4), maxDistance: limits.maxDistance,
  }, true);
  userAdjusted = true;
}

function canShowEdge() {
  return !!(hasModel && lastLayout && window.CameraFraming.edgeCloseup(lastLayout));
}

function resetView() {
  // Deliberately NOT "the last view the user manually picked" -- always the
  // current product's own declared default, tracked separately from manual
  // setView() calls. See visualizer/camera-preset-tracker.js.
  setView(cameraPresetTracker.getDefaultPreset(), true);
}

// A still of the current product from a preset view, for the passport: the
// canvas is resized, framed, drawn and read in one go -- the drawing buffer is
// read before the browser can clear it (no preserveDrawingBuffer) and before
// it paints, so the client never sees it -- then everything is put back. The
// client's own view (userAdjusted) is not touched.
function capture(presetName, { width, height }) {
  if (!renderer || !hasModel || !lastBounds) return null;
  flushResize();
  if (morph) { morph.spring.x = morph.spring.goal.slice(); stepMorph(0); }
  const presets = window.VisualizerConstants.CAMERA_PRESETS;
  const preset = presets[presetName] || presets.iso;
  const size = renderer.getSize(new THREE.Vector2());
  const saved = {
    pixelRatio: renderer.getPixelRatio(), aspect: camera.aspect, near: camera.near, far: camera.far,
    position: camera.position.clone(), target: controls.target.clone(),
    minDistance: controls.minDistance, maxDistance: controls.maxDistance,
  };
  let url = null;
  const onScreen = roomCurrent();
  const studio = onScreen.room === 0 && onScreen.lamps === 0 && !roomFade;
  try {
    if (!studio) applyRoomState(roomTarget('studio'));
    renderer.setPixelRatio(1);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    placeCamera(fitView(preset.direction));
    renderer.render(scene, camera);
    url = renderer.domElement.toDataURL('image/jpeg', 0.9);
  } finally {
    if (!studio) applyRoomState(onScreen);
    restoreView(saved, size);
  }
  return url;
}

function restoreView(saved, size) {
  renderer.setPixelRatio(saved.pixelRatio);
  renderer.setSize(size.x, size.y, false);
  camera.aspect = saved.aspect;
  camera.near = saved.near;
  camera.far = saved.far;
  camera.position.copy(saved.position);
  controls.target.copy(saved.target);
  controls.minDistance = saved.minDistance;
  controls.maxDistance = saved.maxDistance;
  camera.updateProjectionMatrix();
  controls.update();
  renderer.render(scene, camera);
}

function dispose() {
  if (frameId !== null) cancelAnimationFrame(frameId);
  if (pendingResize) { clearTimeout(pendingResize.timer); pendingResize = null; }
  if (resizeObserver) resizeObserver.disconnect();
  if (productGroup) { disposeRoom(productGroup); disposeGroup(productGroup); }
  if (controls) controls.dispose();
  if (scene && scene.environment) scene.environment.dispose();
  if (textures) Object.values(textures).forEach(t => t.dispose());
  stoneTextures.forEach(r => { if (r.entry) r.entry.texture.dispose(); });
  stoneTextures.clear();
  proceduralMaps.forEach(t => t.dispose());
  proceduralMaps.clear();
  if (renderer) renderer.dispose();
  renderer = scene = camera = controls = productGroup = currentCanvas = resizeObserver = null;
  keyLight = fillLight = rimLight = hemiLight = null;
  roomLights = []; roomFade = null; lampsLayout = null;
  shown = { room: 0, glow: 0, lamps: 0, front: null };
  cameraPresetTracker = null;
  textures = null;
  lastBounds = null; lastLayout = null; lastProductKey = null; hasModel = false; userAdjusted = false;
  cameraMove = null; morph = null; lastFrameTime = 0;
}

const ThreeScene = { init, update, setView, resetView, showEdge, canShowEdge, setRoom, roomOptions, capture, dispose };
window.ThreeScene = ThreeScene;
export default ThreeScene;
