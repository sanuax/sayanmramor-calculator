// visualizer/ar-view.js
//
// AR «Поставить у себя в комнате» (the owner, 2026-10-22): the product as
// configured, at its real size, with its stone, in the client's room through
// the phone's camera. The product alone: no room, studio floor, dimensions,
// mode lights or context (a window's wall). Imported by three-scene.js only
// when the button is pressed -- nothing of AR loads with the page.
//
//   iPhone, iPad: a USDZ built here and opened in AR Quick Look, scaling off
//     (always 1:1). The USDZ exporter is imported only for this.
//   Android: a WebXR immersive-ar session drawn by three.js on a renderer of
//     its own, with the very materials of the 3D view (the stone shader
//     included): a ring on the surface found, a tap puts the product there.
import * as THREE from '../vendor/three/three.module.js';
import './ar-geometry.js';

const ArGeometry = window.ArGeometry;

// The product's own materials (three-scene.js buildMaterials); the rest --
// context, the floor disc, the room, the dimension lines -- stays out.
const PRODUCT_MATERIALS = ['stone', 'metal', 'glass', 'body', 'burner', 'light'];

function productMeshes(product) {
  const keep = new Set(PRODUCT_MATERIALS.map(k => product.materials[k]));
  return product.group.children.filter(o => o.isMesh && keep.has(o.material));
}

// The joints between tiles and slabs (lines a hair over the stone).
function seamLines(product) {
  return product.group.children.filter(o => o.isLineSegments && o.material === product.materials.seam);
}

// In the product's own frame (the layout's), whatever the view's easing.
function boundsOf(meshes) {
  const box = new THREE.Box3(), part = new THREE.Box3();
  meshes.forEach(mesh => {
    mesh.updateMatrix();
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    box.union(part.copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrix));
  });
  return { min: box.min.toArray(), max: box.max.toArray() };
}

// The product (its meshes' bounds) turned and set for its anchor
// (ArGeometry.placeFor); the objects given by `copyOf` (a copy for the USDZ,
// the view's own for WebXR).
function placed(objects, bounds, anchor, copyOf) {
  const place = ArGeometry.placeFor(bounds, anchor);
  const holder = new THREE.Group();
  holder.rotation.y = place.rotationY;
  holder.position.set(...place.position);
  objects.forEach(mesh => {
    const copy = copyOf(mesh);
    copy.position.copy(mesh.position);
    copy.quaternion.copy(mesh.quaternion);
    copy.scale.copy(mesh.scale);
    holder.add(copy);
  });
  return holder;
}

// ---- iPhone, iPad: AR Quick Look --------------------------------------------

// The stone's finish as it ends (a fade in progress is finished by
// three-scene.js; this only reads it).
function stoneFor(stone) {
  const map = stone.map && stone.map.clone();
  if (map) {
    // The texture's own transform is baked into the UVs (stoneGeometry):
    // Quick Look reads texture transforms its own way.
    map.repeat.set(1, 1);
    map.offset.set(0, 0);
    map.rotation = 0;
    map.center.set(0, 0);
  }
  return new THREE.MeshPhysicalMaterial({
    map, color: stone.color.clone(), roughness: stone.roughness, metalness: stone.metalness,
    clearcoat: stone.clearcoat, clearcoatRoughness: stone.clearcoatRoughness,
  });
}

function exportMaterial(material, materials) {
  if (material === materials.stone) return stoneFor(material);
  // Unlit ones as Quick Look has them: a backlight glows, a burner is matt.
  if (material === materials.light) return new THREE.MeshStandardMaterial({ color: '#000000', emissive: material.color.clone() });
  if (material === materials.burner) return new THREE.MeshStandardMaterial({ color: material.color.clone(), roughness: 0.6 });
  const copy = material.clone();
  copy.side = THREE.FrontSide;
  return copy;
}

function attributesOnly(positions, normals, uvs) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  if (uvs) g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return g;
}

// The stone's UVs as the screen samples them: through the photo's
// transform, and on tiled surfaces cut into tiles, each its own region.
function stoneGeometry(source, stone) {
  const flat = source.index ? source.toNonIndexed() : source;
  const { position, normal } = flat.attributes;
  let uvs = flat.attributes.uv.array;
  if (stone.map) { stone.map.updateMatrix(); uvs = ArGeometry.transformUvs(uvs, stone.map.matrix.elements); }
  const u = stone.userData.tileUniforms, tiles = flat.getAttribute('stoneTile');
  let g;
  if (u.stoneTileOn.value > 0.5 && tiles) {
    const cut = ArGeometry.cutByTiles(position.array, normal.array, uvs, tiles.array,
      { cell: u.stoneTileCell.value.toArray(), room: u.stoneTileRoom.value.toArray(), split: u.stoneTileSplit.value.toArray() });
    g = attributesOnly(cut.positions, cut.normals, cut.uvs);
  } else {
    g = attributesOnly(position.array.slice(), normal.array.slice(), uvs.slice());
  }
  if (flat !== source) flat.dispose();
  return g;
}

function plainGeometry(source) {
  const flat = source.index ? source.toNonIndexed() : source;
  const { position, normal, uv } = flat.attributes;
  const g = attributesOnly(position.array.slice(), normal.array.slice(), uv ? uv.array.slice() : null);
  if (flat !== source) flat.dispose();
  return g;
}

let quickLookUrl = null;

export async function quickLook(product) {
  const { USDZExporter } = await import('../vendor/three/USDZExporter.js');
  const anchor = ArGeometry.anchorFor(product.productKey, product.model);
  const materials = new Map();
  const meshes = productMeshes(product);
  // The 3D's seam colour (the stone's mean x 0.62) at its 0.7 opacity over the stone.
  const seamMaterial = new THREE.MeshStandardMaterial({ color: product.materials.seam.color.clone().multiplyScalar(0.7 + 0.3 / 0.62), roughness: 0.8 });
  materials.set(product.materials.seam, seamMaterial);
  const root = new THREE.Group();
  root.rotation.x = ArGeometry.quickLookTurnX(anchor);
  root.add(placed(meshes.concat(seamLines(product)), boundsOf(meshes), anchor, obj => {
    if (obj.isLineSegments) {
      const bars = ArGeometry.seamBars(obj.geometry.attributes.position.array);
      return new THREE.Mesh(attributesOnly(bars.positions, bars.normals, null), seamMaterial);
    }
    if (!materials.has(obj.material)) materials.set(obj.material, exportMaterial(obj.material, product.materials));
    const geometry = obj.material === product.materials.stone ? stoneGeometry(obj.geometry, obj.material) : plainGeometry(obj.geometry);
    return new THREE.Mesh(geometry, materials.get(obj.material));
  }));
  root.updateMatrixWorld(true);
  let usdz;
  try {
    usdz = await new USDZExporter().parse(root, {
      ar: { anchoring: { type: 'plane' }, planeAnchoring: { alignment: anchor === 'wall' ? 'vertical' : 'horizontal' } },
    });
  } finally {
    root.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    materials.forEach(m => m.dispose());
  }
  if (quickLookUrl) URL.revokeObjectURL(quickLookUrl);
  quickLookUrl = URL.createObjectURL(new Blob([usdz], { type: 'model/vnd.usdz+zip' }));
  // Safari opens Quick Look for <a rel="ar"> around an image; a generated
  // (blob) model also needs `download`. No scaling: the product stays 1:1.
  const a = document.createElement('a');
  a.rel = 'ar';
  a.href = quickLookUrl + '#allowsContentScaling=0';
  a.setAttribute('download', 'sayanmramor.usdz');
  a.appendChild(document.createElement('img'));
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// ---- Android: WebXR ---------------------------------------------------------

const HINTS = {
  floor: 'Наведите телефон на пол или стол и коснитесь экрана, чтобы поставить изделие',
  wall: 'Наведите телефон на стену и коснитесь экрана, чтобы повесить изделие',
  placed: 'Изделие в натуральную величину. Коснитесь в другом месте, чтобы переставить',
};

function fillOverlay(overlay, session) {
  overlay.style.cssText = 'display:block;position:fixed;inset:0;pointer-events:none;font:15px/1.35 system-ui,sans-serif;color:#fff';
  const hint = document.createElement('div');
  hint.style.cssText = 'position:absolute;left:16px;right:16px;bottom:calc(24px + env(safe-area-inset-bottom));padding:12px 16px;border-radius:10px;background:rgba(22,26,24,.78);text-align:center';
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = 'Закрыть';
  close.style.cssText = 'position:absolute;top:calc(16px + env(safe-area-inset-top));right:16px;pointer-events:auto;padding:10px 16px;border-radius:8px;border:1px solid rgba(255,255,255,.5);background:rgba(22,26,24,.78);color:#fff;font:inherit';
  // A tap on the button is not a tap into the room.
  close.addEventListener('beforexrselect', e => e.preventDefault());
  close.addEventListener('click', () => session.end());
  overlay.replaceChildren(hint, close);
  return hint;
}

export async function webXr(session, product, overlay, rendering) {
  const anchor = ArGeometry.anchorFor(product.productKey, product.model);
  const meshes = productMeshes(product);
  const bounds = boundsOf(meshes);
  const size = Math.max(...bounds.max.map((v, i) => v - bounds.min[i]));

  const renderer = new THREE.WebGLRenderer({ canvas: document.createElement('canvas'), alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType('local');

  const scene = new THREE.Scene();
  scene.environment = product.environment(renderer);
  // As in the studio: a key light from the client's side, high, and a soft
  // fill from the other side (placed with the product, below).
  const hemi = new THREE.HemisphereLight('#ffffff', '#5a5148', 0.6);
  const sun = new THREE.DirectionalLight('#fff6ea', 1.6);
  const fill = new THREE.DirectionalLight('#e6ecf2', 0.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.015;
  Object.assign(sun.shadow.camera, { left: -size, right: size, top: size, bottom: -size, near: 0.05, far: size * 4 + 4 });
  scene.add(hemi, sun, sun.target, fill, fill.target);

  // The view's own meshes and materials (same geometry, same stone), in
  // two holders: standing on a surface, hung on a wall.
  const share = obj => {
    if (obj.isLineSegments) return new THREE.LineSegments(obj.geometry, obj.material);
    const m = new THREE.Mesh(obj.geometry, obj.material);
    m.castShadow = obj.castShadow;
    m.receiveShadow = true;
    return m;
  };
  const parts = meshes.concat(seamLines(product));
  const model = new THREE.Group();
  const standing = placed(parts, bounds, 'floor', share);
  const hanging = anchor === 'wall' ? placed(parts, bounds, 'wall', share) : null;
  // The product's shadow on the client's floor.
  const catcherGeometry = new THREE.PlaneGeometry(size * 2 + 1, size * 2 + 1).rotateX(-Math.PI / 2);
  const catcherMaterial = new THREE.ShadowMaterial({ opacity: 0.28 });
  const catcher = new THREE.Mesh(catcherGeometry, catcherMaterial);
  catcher.receiveShadow = true;
  model.add(standing, catcher);
  if (hanging) model.add(hanging);
  model.visible = false;
  scene.add(model);

  const ringGeometry = new THREE.RingGeometry(0.1, 0.13, 48).rotateX(-Math.PI / 2);
  const ringMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9 });
  const reticle = new THREE.Mesh(ringGeometry, ringMaterial);
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  scene.add(reticle);

  const camera = new THREE.PerspectiveCamera();
  const hint = fillOverlay(overlay, session);
  hint.textContent = HINTS[anchor];

  let hitSource = null;
  session.addEventListener('end', () => {
    renderer.setAnimationLoop(null);
    try { if (hitSource) hitSource.cancel(); } catch (e) { /* gone with the session */ }
    scene.environment.dispose();
    [catcherGeometry, catcherMaterial, ringGeometry, ringMaterial].forEach(x => x.dispose());
    sun.dispose();
    fill.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    overlay.remove();
    rendering.resume();
  });

  // Set before the session starts: three.js then stops its window loop
  // (onXRSessionStart); only the session's frames draw.
  renderer.setAnimationLoop((time, frame) => {
    if (!frame || !hitSource) return;
    const space = renderer.xr.getReferenceSpace();
    const hit = frame.getHitTestResults(hitSource)[0];
    const pose = hit && hit.getPose(space);
    // A floor, a table or a wall -- never a ceiling.
    reticle.visible = !!pose && pose.transform.matrix[5] > -0.5;
    if (reticle.visible) reticle.matrix.fromArray(pose.transform.matrix);
    renderer.render(scene, camera);
  });

  await renderer.xr.setSession(session);
  rendering.pause();
  const viewerSpace = await session.requestReferenceSpace('viewer');
  hitSource = await session.requestHitTestSource({ space: viewerSpace });

  const point = new THREE.Vector3(), normal = new THREE.Vector3(), eye = new THREE.Vector3(), toward = new THREE.Vector3();
  session.addEventListener('select', () => {
    if (!reticle.visible) return;
    point.setFromMatrixPosition(reticle.matrix);
    normal.setFromMatrixColumn(reticle.matrix, 1).normalize();   // a hit's Y axis is the surface normal
    const onWall = !!hanging && Math.abs(normal.y) < 0.5;
    standing.visible = catcher.visible = !onWall;
    if (hanging) hanging.visible = onWall;
    model.position.copy(point);
    renderer.xr.getCamera().getWorldPosition(eye);
    if (onWall) {
      model.rotation.set(0, Math.atan2(normal.x, normal.z), 0);   // the front away from the wall
    } else {
      model.rotation.set(0, Math.atan2(eye.x - point.x, eye.z - point.z), 0);   // the front to the client
    }
    model.visible = true;
    // The key light comes from the client's side, 30 degrees off to the
    // left and high; the fill from the right.
    toward.set(eye.x - point.x, 0, eye.z - point.z).normalize();
    const reach = size * 1.5 + 1.5;
    sun.position.copy(point).addScaledVector(toward.clone().applyAxisAngle(THREE.Object3D.DEFAULT_UP, 0.5), reach).setY(point.y + reach);
    fill.position.copy(point).addScaledVector(toward.clone().applyAxisAngle(THREE.Object3D.DEFAULT_UP, -1.2), reach).setY(point.y + reach * 0.4);
    sun.target.position.copy(point);
    fill.target.position.copy(point);
    hint.textContent = HINTS.placed;
  });
}
