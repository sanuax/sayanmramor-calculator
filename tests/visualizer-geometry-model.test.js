// tests/visualizer-geometry-model.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildGeometryModel } = require('../visualizer/geometry-model.js');
const { VISUAL_FALLBACK_THICKNESS_M } = require('../visualizer/constants.js');

function stateWith(overrides) {
  return Object.assign({
    dimensions: { widthM: 2, lengthM: 0.6, thicknessM: null },
    shape: 'straight',
    wing: { widthM: 0, lengthM: 0 },
    corner: 'left',
    edge: { type: null, lengthMm: null },
    additionalWorks: { sink: { type: null, count: 0, position: null }, cooktop: { count: 0, position: null } },
    holeCounts: { mixer: 0, socket: 0, dispenser: 0 },
    backsplash: { widthM: 0, lengthM: 0 },
    curbLengthM: 0,
    island: { standard: { widthM: 0, lengthM: 0 } },
    product: null,
  }, overrides);
}

test('buildGeometryModel reports shape "straight" when state.shape is "straight" or wing is unfilled', () => {
  assert.equal(buildGeometryModel(stateWith({})).shape, 'straight');
  // shape:'lshape' selected in the UI, but wing dimensions still 0 -- degrades to straight.
  assert.equal(buildGeometryModel(stateWith({ shape: 'lshape', wing: { widthM: 0, lengthM: 1.2 } })).shape, 'straight');
});

test('buildGeometryModel copies widthM/lengthM from state.dimensions', () => {
  const model = buildGeometryModel(stateWith({ dimensions: { widthM: 3, lengthM: 1.2, thicknessM: null } }));
  assert.equal(model.widthM, 3);
  assert.equal(model.lengthM, 1.2);
});

test('buildGeometryModel.visualThicknessM is the constant fallback, never state.dimensions.thicknessM', () => {
  const model = buildGeometryModel(stateWith({ dimensions: { widthM: 2, lengthM: 0.6, thicknessM: 0.02 } }));
  assert.equal(model.visualThicknessM, VISUAL_FALLBACK_THICKNESS_M);
  assert.notEqual(model.visualThicknessM, 0.02);
});

test('buildGeometryModel.wing is null when shape is "straight", populated when "lshape" with both wing dimensions > 0', () => {
  assert.equal(buildGeometryModel(stateWith({})).wing, null);
  const model = buildGeometryModel(stateWith({ shape: 'lshape', wing: { widthM: 0.6, lengthM: 1.2 }, corner: 'right' }));
  assert.equal(model.shape, 'lshape');
  assert.deepEqual(model.wing, { widthM: 0.6, lengthM: 1.2, corner: 'right' });
});

test('buildGeometryModel.edge passes state.edge through unchanged', () => {
  const model = buildGeometryModel(stateWith({ edge: { type: 'bevel', lengthMm: 500 } }));
  assert.deepEqual(model.edge, { type: 'bevel', lengthMm: 500 });
});

test('buildGeometryModel.sink/cooktop delegate to cutout-geometry (null when count is 0, populated cut otherwise)', () => {
  assert.equal(buildGeometryModel(stateWith({})).sink, null);
  assert.equal(buildGeometryModel(stateWith({})).cooktop, null);
  const model = buildGeometryModel(stateWith({
    additionalWorks: { sink: { type: 'undermount', count: 1, position: null }, cooktop: { count: 1, position: null } },
  }));
  assert.equal(model.sink.type, 'undermount');
  assert.equal(model.sink.cut.source, 'fallback');
  assert.equal(model.cooktop.count, 1);
  assert.equal(model.cooktop.cut.source, 'fallback');
});

test('buildGeometryModel.holes delegates to cutout-geometry for mixer/socket/dispenser', () => {
  const empty = buildGeometryModel(stateWith({}));
  assert.deepEqual(empty.holes, { mixer: null, socket: null, dispenser: null });
  const model = buildGeometryModel(stateWith({ holeCounts: { mixer: 1, socket: 0, dispenser: 0 } }));
  assert.equal(model.holes.mixer.count, 1);
  assert.equal(model.holes.socket, null);
});

test('buildGeometryModel.backsplash/curb/island delegate to attachment-geometry', () => {
  const empty = buildGeometryModel(stateWith({}));
  assert.equal(empty.backsplash, null);
  assert.equal(empty.curb, null);
  assert.equal(empty.island, null);

  const model = buildGeometryModel(stateWith({
    backsplash: { widthM: 0.6, lengthM: 2 },
    curbLengthM: 0.5,
    island: { standard: { widthM: 1.2, lengthM: 0.8 } },
  }));
  assert.equal(model.backsplash.heightM, 0.6);
  assert.equal(model.curb.lengthM, 0.5);
  assert.equal(model.island.widthM, 1.2);
  // island offset is relative to the MAIN segment's lengthM (0.6 in stateWith's default dimensions).
  assert.ok(model.island.offsetZM > 0.6);
});

test('buildGeometryModel.cameraPreset copies the product\'s cameraPreset when present', () => {
  const model = buildGeometryModel(stateWith({
    product: { key: 'pol', label: 'Полы', type: 'B', capabilities: null, cameraPreset: 'top' },
  }));
  assert.equal(model.cameraPreset, 'top');
});

test('buildGeometryModel.cameraPreset falls back to "iso" when the product has none set', () => {
  const model = buildGeometryModel(stateWith({
    product: { key: 'panno', label: 'Панно', type: 'B', capabilities: null, cameraPreset: null },
  }));
  assert.equal(model.cameraPreset, 'iso');
});

test('buildGeometryModel.cameraPreset falls back to "iso" when no product is selected', () => {
  const model = buildGeometryModel(stateWith({ product: null }));
  assert.equal(model.cameraPreset, 'iso');
});
