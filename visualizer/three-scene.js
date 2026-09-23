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
  // Broad, very low-contrast mottling -- depth in the colour, not a pattern.
  const cloud = noiseCanvas(256, 3, 4, 226, 255);
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
    cloud: repeatTexture(cloud, 0.6, THREE.SRGBColorSpace),
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

// ---- materials -----------------------------------------------------------

function buildMaterials(desc) {
  const stone = new THREE.MeshPhysicalMaterial({
    color: desc.fallbackColor,
    map: textures.cloud,
    roughness: desc.roughness,
    roughnessMap: textures.grain,
    metalness: desc.metalness || 0,
    clearcoat: desc.clearcoat || 0,
    clearcoatRoughness: 0.14,
    bumpMap: textures.grain,
    bumpScale: 0.35,
    envMapIntensity: 0.7,
  });
  const seamColor = new THREE.Color(desc.fallbackColor).multiplyScalar(0.62);
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
    seam: new THREE.LineBasicMaterial({ color: seamColor, transparent: true, opacity: 0.7 }),
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

function buildProductGroup(layout, materialDescriptor) {
  const group = new THREE.Group();
  const materials = buildMaterials(materialDescriptor);
  group.userData.materials = materials;
  layout.parts.forEach(part => {
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
  });
  if (layout.bounds) buildFloor(group, layout, materials);
  return group;
}

function disposeGroup(group) {
  group.traverse(obj => { if (obj.geometry) obj.geometry.dispose(); });
  Object.values(group.userData.materials || {}).forEach(m => m.dispose());
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
  const layout = window.SceneLayout.buildSceneLayout(geometryModel);
  if (productGroup) {
    scene.remove(productGroup);
    disposeGroup(productGroup);
  }
  productGroup = buildProductGroup(layout, materialDescriptor);
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
