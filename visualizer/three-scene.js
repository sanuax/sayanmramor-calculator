// visualizer/three-scene.js
import * as THREE from '../vendor/three/three.module.js';
import { OrbitControls } from '../vendor/three/OrbitControls.js';

let renderer, scene, camera, controls, countertopMesh, currentCanvas, resizeObserver;
let frameId = null;
let cameraPresetTracker = null;

function buildMesh(geometryModel, materialDescriptor) {
  const geometry = new THREE.BoxGeometry(geometryModel.widthM, geometryModel.visualThicknessM, geometryModel.lengthM);
  const material = new THREE.MeshStandardMaterial({
    color: materialDescriptor.fallbackColor,
    roughness: materialDescriptor.roughness,
    metalness: materialDescriptor.metalness,
  });
  return new THREE.Mesh(geometry, material);
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
  const isFirstModel = !countertopMesh;
  if (countertopMesh) {
    scene.remove(countertopMesh);
    countertopMesh.geometry.dispose();
    countertopMesh.material.dispose();
  }
  countertopMesh = buildMesh(geometryModel, materialDescriptor);
  scene.add(countertopMesh);

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
  const distance = countertopMesh ? frameCameraOnModel({
    widthM: countertopMesh.geometry.parameters.width,
    lengthM: countertopMesh.geometry.parameters.depth,
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
  if (countertopMesh) {
    countertopMesh.geometry.dispose();
    countertopMesh.material.dispose();
  }
  if (controls) controls.dispose();
  if (renderer) renderer.dispose();
  renderer = scene = camera = controls = countertopMesh = currentCanvas = resizeObserver = null;
  cameraPresetTracker = null;
}

const ThreeScene = { init, update, setView, resetView, dispose };
window.ThreeScene = ThreeScene;
export default ThreeScene;
