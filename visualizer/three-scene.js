// visualizer/three-scene.js
import * as THREE from '../vendor/three/three.module.js';
import { OrbitControls } from '../vendor/three/OrbitControls.js';

let renderer, scene, camera, controls, productGroup, currentCanvas, resizeObserver;
let frameId = null;
let cameraPresetTracker = null;

// Rendering-only proportions with no data significance -- not shared via
// visualizer/constants.js because nothing outside this file needs them and
// they're verified visually, not by assertion.
const CUTOUT_MARKER_DEPTH_M = 0.02;
const BACKSPLASH_PANEL_DEPTH_M = 0.02;
const WALL_PANEL_DEPTH_M = 0.02;
const MARKER_COLOR = '#2b2b2b'; // sink/cooktop/hole markers: symbolic voids/fixtures, not stone
// Ступени: минимальный, не идеальный визуальный профиль лестницы -- N
// одинаковых по толщине проступей, каждая на свою высоту выше предыдущей,
// без подступенков/косоура. Числа ниже -- чисто визуальные, не реальные
// параметры конкретной лестницы (их сейчас неоткуда взять).
const STEPS_COUNT = 4;
const STEPS_RISE_M = 0.17;

// Coordinate convention for the whole group: origin is the MAIN segment's
// center (matching the single-box convention this file used before L-shape/
// attachments existed). X = width (left is -X), Z = length ("front", facing
// the 'front' camera preset, is +Z; "back" is -Z). Y = thickness, centered.
// Cut/hole positions from geometry-model.js are "distance from the left/front
// edge" (0..widthM / 0..lengthM) and are converted to this local frame here.
//
// "Стеновая" сторона для бортика/фартука/стеновой панели -- КОНСТАНТНЫЙ X
// (X = -widthM/2, левый по ширине край), а не константный Z. Причина: X
// (width) -- короткая "глубина от стены до переднего края" столешницы,
// Z (length) -- длинный "пробег вдоль стены". Панель на стену должна тянуться
// вдоль ДЛИННОГО пробега (Z), примыкая к КОРОТКОМУ краю (константный X) --
// раньше было наоборот (панель тянулась вдоль width, торчала с торца по
// length), из-за чего фартук/бортик/стеновая панель выглядели растянутыми
// не в ту сторону.

function buildSlabGeometry(xExtentM, zExtentM, thicknessM, edgeType, holes) {
  const shape = new THREE.Shape();
  const hx = xExtentM / 2, hz = zExtentM / 2;
  shape.moveTo(-hx, -hz);
  shape.lineTo(hx, -hz);
  shape.lineTo(hx, hz);
  shape.lineTo(-hx, hz);
  shape.closePath();

  // Настоящий сквозной вырез (не отдельный меш поверх плиты): дырка в
  // самой THREE.Shape, которую ExtrudeGeometry честно протягивает через
  // всю толщину, включая внутренние стенки отверстия. `holes` -- в тех же
  // мировых X/Z координатах, что и внешний контур; shape-y -> world -Z
  // (см. комментарий у geometry.rotateX ниже), поэтому центр по Z уходит
  // в shape с обратным знаком.
  (holes || []).forEach(hole => {
    const hw = hole.widthM / 2, hl = hole.lengthM / 2;
    const cx = hole.xM, cy = -hole.zM;
    const path = new THREE.Path();
    path.moveTo(cx - hw, cy - hl);
    path.lineTo(cx + hw, cy - hl);
    path.lineTo(cx + hw, cy + hl);
    path.lineTo(cx - hw, cy + hl);
    path.closePath();
    shape.holes.push(path);
  });

  // Кромка (edge.type) как параметр геометрии: одна обобщённая фаска на весь
  // периметр, когда выбран любой тип кромки -- не 5 разных реалистичных
  // профилей (см. docs/superpowers/specs/2026-09-21-3d-visualizer-design.md).
  const hasBevel = !!edgeType;
  const bevel = hasBevel ? Math.min(thicknessM * 0.25, 0.01) : 0;
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: thicknessM,
    bevelEnabled: hasBevel,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: hasBevel ? 2 : 0,
    curveSegments: 1,
  });
  // ExtrudeGeometry extrudes the shape's local (x,y) along +Z by `depth`.
  // Rotating -90 deg around X maps shape-x -> world X (unchanged), the
  // extrude direction -> world Y (thickness), and shape-y -> world -Z (still
  // centered, since the shape itself is symmetric around the origin).
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, -thicknessM / 2, 0); // only Y (0..depth) needs centering
  return geometry;
}

function buildStoneMaterial(materialDescriptor) {
  return new THREE.MeshStandardMaterial({
    color: materialDescriptor.fallbackColor,
    roughness: materialDescriptor.roughness,
    metalness: materialDescriptor.metalness,
  });
}

function buildMarkerMaterial() {
  return new THREE.MeshStandardMaterial({ color: MARKER_COLOR, roughness: 0.6 });
}

// Camera framing must cover the WHOLE composed model, not just the main
// slab -- otherwise an L-shape's wing or an island (which can sit well
// outside the main slab's own footprint) renders half out of frame or reads
// as an unrelated, randomly-placed piece instead of one product. Still just
// a bounding footprint for framing purposes, not a geometry change.
function computeFootprintExtent(geometryModel) {
  let extentX = geometryModel.widthM;
  let extentZ = geometryModel.lengthM;
  if (geometryModel.wing) {
    extentX = Math.max(extentX, geometryModel.widthM + 2 * geometryModel.wing.lengthM);
    // wing.widthM no longer extends the Z footprint: after the corner-join
    // fix the wing's Z-range sits inside the main slab's own [-lengthM/2,
    // lengthM/2] range (flush with its back edge, not past it), so lengthM
    // alone already covers it -- extentZ needs no contribution from wing.
  }
  // Island now offsets along WIDTH (X), bar counter along LENGTH (Z) --
  // see attachment-geometry.js -- so each only ever grows its own axis.
  if (geometryModel.island) {
    const islandFarX = Math.abs(geometryModel.island.offsetXM) + geometryModel.island.widthM / 2;
    extentX = Math.max(extentX, islandFarX * 2);
  }
  if (geometryModel.barCounter) {
    const barFarZ = Math.abs(geometryModel.barCounter.offsetZM) + geometryModel.barCounter.lengthM / 2;
    extentZ = Math.max(extentZ, barFarZ * 2);
  }
  return { widthM: extentX, lengthM: extentZ };
}

// Ступени: N ascending slabs of the product's own tread thickness, each a
// fixed rise higher than the last, together spanning the full entered
// lengthM/widthM -- reads as "a flight of steps", not the single flat
// countertop-style slab every other product uses. Deliberately no risers/
// stringer -- minimal correct shape, not a finished visualization.
function buildStepsGroup(widthM, lengthM, thicknessM, edgeType, stoneMaterial) {
  const group = new THREE.Group();
  const runM = lengthM / STEPS_COUNT;
  for (let i = 0; i < STEPS_COUNT; i++) {
    const mesh = new THREE.Mesh(buildSlabGeometry(widthM, runM, thicknessM, edgeType), stoneMaterial);
    const stepTopY = (i + 1) * STEPS_RISE_M;
    const stepCenterZ = -lengthM / 2 + runM * (i + 0.5);
    mesh.position.set(0, stepTopY - thicknessM / 2, stepCenterZ);
    group.add(mesh);
  }
  return group;
}

function buildProductGroup(geometryModel, materialDescriptor) {
  const group = new THREE.Group();
  const { widthM, lengthM, visualThicknessM: thicknessM, wing, edge, sink, cooktop, holes, backsplash, curb, wallPanel, island, barCounter, productKey } = geometryModel;
  // frameCameraOnModel()/setView() read these back to size the camera to the
  // actual model -- a THREE.Group has no single .geometry.parameters the
  // way the old one-box countertopMesh did.
  const footprint = computeFootprintExtent(geometryModel);
  group.userData.widthM = footprint.widthM;
  group.userData.lengthM = footprint.lengthM;
  const stoneMaterial = buildStoneMaterial(materialDescriptor);
  const markerMaterial = buildMarkerMaterial();

  function toLocalX(xM) { return xM - widthM / 2; }
  function toLocalZ(zM) { return lengthM / 2 - zM; }

  if (productKey === 'stupeni') {
    // Ступени get their own dedicated shape (see buildStepsGroup) instead
    // of the single flat slab every other product uses below -- this
    // product has no shape/sink/cooktop/attachments capability anyway (see
    // product-types.js), so nothing past this block applies to it.
    group.add(buildStepsGroup(widthM, lengthM, thicknessM, edge.type, stoneMaterial));
    return group;
  }

  // Врезная/интегрированная мойка (не накладная) режет насквозь саму плиту
  // столешницы -- настоящая дыра в geometry, а не отдельный меш поверх/внутри
  // неё. Накладная мойка ставится СВЕРХУ готовой плиты (сквозного выреза не
  // требует по этой же модели), поэтому для неё дырка не добавляется --
  // см. addCutoutMarker(sink, true) ниже, где она остаётся приподнятой
  // плашкой-посадочным местом. Варочная панель (cooktop) этой правкой не
  // затронута -- остаётся тем же маркером, что и раньше.
  const sinkHoles = (sink && sink.type !== 'overlay')
    ? [{ xM: toLocalX(sink.cut.xM), zM: toLocalZ(sink.cut.zM), widthM: sink.cut.widthM, lengthM: sink.cut.lengthM }]
    : [];
  group.add(new THREE.Mesh(buildSlabGeometry(widthM, lengthM, thicknessM, edge.type, sinkHoles), stoneMaterial));

  // Г-образная столешница: без CSG, второй прямоугольник визуально
  // состыкован в углу главного (см. спека, "L-shape wing placement").
  // wing.lengthM (его собственный "пробег", вдоль X) и wing.widthM (его
  // "глубина", вдоль Z, заподлицо с задним краем главного сегмента, Z<0)
  // -- поэтому extent-аргументы переставлены местами.
  if (wing) {
    const wingMesh = new THREE.Mesh(buildSlabGeometry(wing.lengthM, wing.widthM, thicknessM, edge.type), stoneMaterial);
    const xSign = wing.corner === 'right' ? 1 : -1;
    wingMesh.position.set(
      xSign * (widthM / 2 + wing.lengthM / 2),
      0,
      -(lengthM / 2 - wing.widthM / 2),
    );
    group.add(wingMesh);
  }

  // Варочная панель (всегда врезная) и накладная мойка (всегда сверху, без
  // сквозного выреза) по-прежнему рисуются этой тёмной плашкой-маркером, а
  // не настоящим отверстием -- варочную панель эта задача не трогает, а
  // накладной мойке сквозной вырез и не нужен по модели (ставится поверх
  // цельной плиты). Врезная/интегрированная мойка теперь режет саму плиту
  // (см. sinkHoles выше) и через этот маркер уже не рисуется.
  function addCutoutMarker(cutout, isRaised) {
    const geometry = new THREE.BoxGeometry(cutout.cut.widthM, CUTOUT_MARKER_DEPTH_M, cutout.cut.lengthM);
    const mesh = new THREE.Mesh(geometry, markerMaterial);
    const yCenter = isRaised
      ? thicknessM / 2 + CUTOUT_MARKER_DEPTH_M / 2
      : thicknessM / 2 - CUTOUT_MARKER_DEPTH_M / 2;
    mesh.position.set(toLocalX(cutout.cut.xM), yCenter, toLocalZ(cutout.cut.zM));
    group.add(mesh);
  }
  // Undermount/integrated already got a real hole in the main slab above --
  // only overlay still needs the raised seating-mark, since it sits on top
  // of a solid (uncut) countertop rather than through it.
  if (sink && sink.type === 'overlay') addCutoutMarker(sink, true);
  if (cooktop) addCutoutMarker(cooktop, false);

  // Отверстия: маленькие символические цилиндры, пронизывающие толщину.
  function addHoleMarker(hole) {
    if (!hole) return;
    const geometry = new THREE.CylinderGeometry(hole.radiusM, hole.radiusM, thicknessM * 1.4, 12);
    const mesh = new THREE.Mesh(geometry, markerMaterial);
    mesh.position.set(toLocalX(hole.position.xM), 0, toLocalZ(hole.position.zM));
    group.add(mesh);
  }
  if (holes) {
    addHoleMarker(holes.mixer);
    addHoleMarker(holes.socket);
    addHoleMarker(holes.dispenser);
  }

  // Фартук: тонкая вертикальная панель вдоль стенового края -- КОНСТАНТНЫЙ
  // X (widthM -- короткая сторона, глубина от стены), тянется вдоль ВСЕЙ
  // длины Z (lengthM -- длинный пробег вдоль стены). backsplash.lengthM
  // (реальный пользовательский ввод) поэтому идёт в Z-протяжённость бокса,
  // а не в X, как было раньше. Тот же материал, что и столешница -- это
  // реальный камень, а не маркер.
  if (backsplash) {
    const geometry = new THREE.BoxGeometry(BACKSPLASH_PANEL_DEPTH_M, backsplash.heightM, backsplash.lengthM);
    const mesh = new THREE.Mesh(geometry, stoneMaterial);
    mesh.position.set(-(widthM / 2 + BACKSPLASH_PANEL_DEPTH_M / 2), thicknessM / 2 + backsplash.heightM / 2, 0);
    group.add(mesh);
  }

  // Стеновая панель: та же ориентация и та же стеновая сторона, что и
  // фартук выше -- просто более крупная панель со своими размерами.
  if (wallPanel) {
    const geometry = new THREE.BoxGeometry(WALL_PANEL_DEPTH_M, wallPanel.heightM, wallPanel.lengthM);
    const mesh = new THREE.Mesh(geometry, stoneMaterial);
    mesh.position.set(-(widthM / 2 + WALL_PANEL_DEPTH_M / 2), thicknessM / 2 + wallPanel.heightM / 2, 0);
    group.add(mesh);
  }

  // Бортик: невысокая приподнятая полоса вдоль ТОЙ ЖЕ стеновой стороны
  // (константный X), что и фартук/стеновая панель выше -- все три примыкают
  // к одной и той же стене, а не к разным краям столешницы. Тянется вдоль
  // Z на всю свою длину (curb.lengthM), а не вдоль X, как было раньше.
  // Квадратное сечение (высота = глубина) -- нет реальных данных для формы
  // сечения, только длина.
  if (curb) {
    const geometry = new THREE.BoxGeometry(curb.heightM, curb.heightM, curb.lengthM);
    const mesh = new THREE.Mesh(geometry, stoneMaterial);
    mesh.position.set(-(widthM / 2 + curb.heightM / 2), thicknessM / 2 + curb.heightM / 2, 0);
    group.add(mesh);
  }

  // Остров: отдельная самостоятельная плита лицом к длинному пробегу
  // столешницы, со смещением по WIDTH (offsetXM/offsetZM -- уже готовые
  // локальные координаты, см. attachment-geometry.js).
  if (island) {
    const mesh = new THREE.Mesh(buildSlabGeometry(island.widthM, island.lengthM, thicknessM, edge.type), stoneMaterial);
    mesh.position.set(island.offsetXM, 0, island.offsetZM);
    group.add(mesh);
  }

  // Барная стойка: продолжение столешницы за одним из LENGTH-концов (Z),
  // а не по WIDTH -- поэтому не может занять то же место, что и остров
  // выше, даже если оба выбраны одновременно.
  if (barCounter) {
    const mesh = new THREE.Mesh(buildSlabGeometry(barCounter.widthM, barCounter.lengthM, thicknessM, edge.type), stoneMaterial);
    mesh.position.set(barCounter.offsetXM, 0, barCounter.offsetZM);
    group.add(mesh);
  }

  return group;
}

function disposeGroup(group) {
  group.traverse(obj => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) obj.material.dispose();
  });
}

function frameCameraOnModel(geometryModel) {
  const maxDim = Math.max(geometryModel.widthM, geometryModel.lengthM, 0.5);
  return maxDim * 1.8;
}

function init(canvasEl) {
  currentCanvas = canvasEl;
  // CameraPresetTracker lives in visualizer/camera-preset-tracker.js (a UMD
  // script, not an ES module, so it can't be `import`ed here) -- read it off
  // the global it already attaches to `window`, same pattern as
  // VisualizerConstants below.
  cameraPresetTracker = window.CameraPresetTracker.createCameraPresetTracker();
  renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  scene = new THREE.Scene();
  scene.background = new THREE.Color('#f4f4f4');

  camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100);
  camera.position.set(1.5, 1.2, 1.5);

  const hemi = new THREE.HemisphereLight('#ffffff', '#444444', 1.1);
  scene.add(hemi);
  const dir = new THREE.DirectionalLight('#ffffff', 0.8);
  dir.position.set(2, 3, 2);
  scene.add(dir);

  controls = new OrbitControls(camera, canvasEl);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;

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
}

function update(geometryModel, materialDescriptor) {
  const isFirstModel = !productGroup;
  if (productGroup) {
    scene.remove(productGroup);
    disposeGroup(productGroup);
  }
  productGroup = buildProductGroup(geometryModel, materialDescriptor);
  scene.add(productGroup);

  // Every update() call (not just the first) adopts the current product's
  // own default -- so switching products mid-session immediately changes
  // what "Сбросить вид" returns to, without needing a page reload.
  cameraPresetTracker.setDefaultFromGeometryModel(geometryModel);

  controls.target.set(0, 0, 0);
  if (isFirstModel) {
    resetView();
  } else {
    controls.update();
  }
}

function setView(presetName) {
  const distance = productGroup ? frameCameraOnModel({
    widthM: productGroup.userData.widthM || 2,
    lengthM: productGroup.userData.lengthM || 2,
  }) : 2;
  // CAMERA_PRESETS lives in visualizer/constants.js (a UMD script, not an ES
  // module, so it can't be `import`ed here) -- read it off the global it
  // already attaches to `window`, so there's one source of truth for the 4
  // view directions instead of a second copy hardcoded in this file.
  const presetsByName = window.VisualizerConstants.CAMERA_PRESETS;
  const preset = presetsByName[presetName] || presetsByName.iso;
  const [dx, dy, dz] = preset.direction;
  camera.position.set(dx * distance, dy * distance, dz * distance);
  controls.target.set(0, 0, 0);
  controls.update();
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
  if (renderer) renderer.dispose();
  renderer = scene = camera = controls = productGroup = currentCanvas = resizeObserver = null;
  cameraPresetTracker = null;
}

const ThreeScene = { init, update, setView, resetView, dispose };
window.ThreeScene = ThreeScene;
export default ThreeScene;
