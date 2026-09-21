// tests/visualizer-geometry-model.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildGeometryModel } = require('../visualizer/geometry-model.js');
const { VISUAL_FALLBACK_THICKNESS_M } = require('../visualizer/constants.js');

function stateWith(overrides) {
  return Object.assign({
    dimensions: { widthM: 2, lengthM: 0.6, thicknessM: null },
    edge: { type: null, lengthMm: null },
    additionalWorks: { sink: { type: null, count: 0, position: null }, cooktop: { count: 0, position: null } },
  }, overrides);
}

test('buildGeometryModel always reports shape "straight" for the vertical slice', () => {
  const model = buildGeometryModel(stateWith({}));
  assert.equal(model.shape, 'straight');
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

test('buildGeometryModel.edge passes state.edge through unchanged', () => {
  const model = buildGeometryModel(stateWith({ edge: { type: 'bevel', lengthMm: 500 } }));
  assert.deepEqual(model.edge, { type: 'bevel', lengthMm: 500 });
});

test('buildGeometryModel.sink is null when count is 0', () => {
  const model = buildGeometryModel(stateWith({}));
  assert.equal(model.sink, null);
});

test('buildGeometryModel.sink has a fallback placement, tagged as such, when position is null and count > 0', () => {
  const model = buildGeometryModel(stateWith({
    additionalWorks: { sink: { type: 'undermount', count: 1, position: null }, cooktop: { count: 0, position: null } },
  }));
  assert.equal(model.sink.type, 'undermount');
  assert.equal(model.sink.count, 1);
  assert.equal(model.sink.placement.source, 'fallback');
  assert.equal(typeof model.sink.placement.xM, 'number');
  assert.equal(typeof model.sink.placement.yM, 'number');
});

test('buildGeometryModel.sink uses the real position (tagged "real") when one is provided', () => {
  const model = buildGeometryModel(stateWith({
    additionalWorks: { sink: { type: 'undermount', count: 1, position: { xMm: 300, yMm: 150 } }, cooktop: { count: 0, position: null } },
  }));
  assert.equal(model.sink.placement.source, 'real');
  assert.equal(model.sink.placement.xM, 0.3);
  assert.equal(model.sink.placement.yM, 0.15);
});

test('buildGeometryModel.cooktop is null when count is 0, fallback-placed otherwise', () => {
  const empty = buildGeometryModel(stateWith({}));
  assert.equal(empty.cooktop, null);
  const withCooktop = buildGeometryModel(stateWith({
    additionalWorks: { sink: { type: null, count: 0, position: null }, cooktop: { count: 1, position: null } },
  }));
  assert.equal(withCooktop.cooktop.count, 1);
  assert.equal(withCooktop.cooktop.placement.source, 'fallback');
});
