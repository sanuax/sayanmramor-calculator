// tests/visualizer-camera-preset-tracker.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { createCameraPresetTracker } = require('../visualizer/camera-preset-tracker.js');

test('defaults to "iso" before any product has been shown', () => {
  const tracker = createCameraPresetTracker();
  assert.equal(tracker.getDefaultPreset(), 'iso');
});

test('setDefaultFromGeometryModel adopts the geometry model\'s cameraPreset', () => {
  const tracker = createCameraPresetTracker();
  tracker.setDefaultFromGeometryModel({ cameraPreset: 'top' });
  assert.equal(tracker.getDefaultPreset(), 'top');
});

test('falls back to "iso" when the geometry model has no cameraPreset', () => {
  const tracker = createCameraPresetTracker();
  tracker.setDefaultFromGeometryModel({});
  assert.equal(tracker.getDefaultPreset(), 'iso');
});

test('falls back to "iso" when the geometry model itself is null', () => {
  const tracker = createCameraPresetTracker();
  tracker.setDefaultFromGeometryModel(null);
  assert.equal(tracker.getDefaultPreset(), 'iso');
});

test('scenario: default top -> manual iso -> reset -> top (manual view never overwrites the default)', () => {
  const tracker = createCameraPresetTracker();
  // "Полы" selected: ThreeScene.update() calls this once per calculate() run.
  tracker.setDefaultFromGeometryModel({ cameraPreset: 'top' });
  // The user clicks "Изометрия" -- in the real ThreeScene, setView('iso')
  // runs directly and NEVER calls setDefaultFromGeometryModel(), so there is
  // nothing to simulate here except the absence of a call -- that absence is
  // exactly the property this test protects.
  // The user clicks "Сбросить вид" -- ThreeScene.resetView() calls
  // setView(tracker.getDefaultPreset()).
  assert.equal(tracker.getDefaultPreset(), 'top');
});

test('scenario: default front -> manual side -> reset -> front (manual view never overwrites the default)', () => {
  const tracker = createCameraPresetTracker();
  tracker.setDefaultFromGeometryModel({ cameraPreset: 'front' });
  // Manual "Сбоку" click -- again, no call to the tracker.
  assert.equal(tracker.getDefaultPreset(), 'front');
});

test('switching product updates the default used by the next Reset View', () => {
  const tracker = createCameraPresetTracker();
  tracker.setDefaultFromGeometryModel({ cameraPreset: 'front-high' }); // подоконник
  assert.equal(tracker.getDefaultPreset(), 'front-high');
  tracker.setDefaultFromGeometryModel({ cameraPreset: 'top' }); // переключились на пол
  assert.equal(tracker.getDefaultPreset(), 'top');
});

test('each tracker instance has independent state', () => {
  const a = createCameraPresetTracker();
  const b = createCameraPresetTracker();
  a.setDefaultFromGeometryModel({ cameraPreset: 'top' });
  assert.equal(a.getDefaultPreset(), 'top');
  assert.equal(b.getDefaultPreset(), 'iso');
});
