// tests/edge-length.test.js
//
// The edge is priced on the length of every open edge that is not at a wall
// (the owner's rule, docs/superpowers/specs/2026-11-08-company-rates-v2-design.md,
// «Кромка»): EdgeLength.openEdgeLengthM over the real 3D scene layout
// (GeometryModel + SceneLayout), so the price and the 3D never disagree on
// which edges are open. Every figure below was checked against the layout.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createFakeDoc } = require('./helpers/fake-dom.js');
const ConstructorState = require('../constructor-state.js');
const ProductTypes = require('../product-types.js');
const GeometryModel = require('../visualizer/geometry-model.js');
const SceneLayout = require('../visualizer/scene-layout.js');
const EdgeLength = require('../edge-length.js');

const { PRODUCTS, hasAdditionalWork } = ProductTypes;
const v = x => ({ value: String(x) });

function layoutOf(key, values) {
  const state = ConstructorState.readConstructorState({
    doc: createFakeDoc(values), selectedProductKey: key, product: PRODUCTS[key], stone: null, hasAdditionalWork,
  });
  return SceneLayout.buildSceneLayout(GeometryModel.buildGeometryModel(state));
}
const lengthOf = (key, values) => EdgeLength.openEdgeLengthM(layoutOf(key, values));
const near = (actual, expected, msg) => assert.ok(Math.abs(actual - expected) < 1e-9, (msg || '') + ': ' + actual + ' vs ' + expected);

const kitchen = extra => Object.assign({ width: v(600), length: v(3000), 'edge-type': v('straight') }, extra || {});
const kitchenL = extra => kitchen(Object.assign({ productShape: v('lshape'), 'wing-width': v(600), 'wing-length': v(1500) }, extra || {}));

test('straight countertop against the wall: front edge and both ends', () => {
  near(lengthOf('stoleshnitsa_kuhnya', kitchen()), 4.2);   // 3.0 + 0.6 + 0.6
  near(lengthOf('stoleshnitsa_vannaya', kitchen()), 4.2);
});

test('L countertop: no edge along the walls or at the joint', () => {
  // Main: front 2.4 (the 0.6 where the wing joins is a joint) + its free end 0.6;
  // its other end is against the wing's wall. Wing: its long open side 1.5 + its far end 0.6.
  near(lengthOf('stoleshnitsa_kuhnya', kitchenL()), 5.1);
  near(lengthOf('stoleshnitsa_kuhnya', kitchenL({ 'shape-corner': v('right') })), 5.1);
});

test('U countertop: the main run\'s front between the wings + each wing\'s open side and far end', () => {
  near(lengthOf('stoleshnitsa_kuhnya', kitchenL({ productShape: v('ushape') })), 6.0);   // 1.8 + 2 x (1.5 + 0.6)
});

test('an L countertop whose wing has no size yet is priced as the straight run', () => {
  near(lengthOf('stoleshnitsa_kuhnya', kitchen({ productShape: v('lshape') })), 4.2);
  near(lengthOf('stoleshnitsa_kuhnya', kitchen({ productShape: v('lshape'), 'wing-width': v(0), 'wing-length': v(1500) })), 4.2);
});

test('a sink or tap hole is not an edge', () => {
  near(lengthOf('stoleshnitsa_kuhnya', kitchen({ 'cut-sink-undermount': v(1), 'hole-mixer': v(1) })), 4.2);
  near(lengthOf('stoleshnitsa_kuhnya', kitchen({ 'cut-sink-integrated': v(1) })), 4.2);
});

test('island: full perimeter', () => {
  near(lengthOf('stoleshnitsa_kuhnya', kitchen({ 'extra-ostrov-width': v(800), 'extra-ostrov-length': v(1200) })), 4.2 + 4.0);
  // Фигурный: the rounded outline, segment by segment.
  near(lengthOf('stoleshnitsa_kuhnya', kitchen({ 'extra-ostrov-figured-width': v(800), 'extra-ostrov-figured-length': v(1200) })), 4.2 + 3.582);
});

test('bar counter: full perimeter (it stands a step above the worktop, every edge in view)', () => {
  near(lengthOf('stoleshnitsa_kuhnya', kitchen({ 'extra-bar-standard-width': v(500), 'extra-bar-standard-length': v(1500) })), 4.2 + 4.0);
  near(lengthOf('stoleshnitsa_kuhnya', kitchen({ 'extra-bar-complex-width': v(500), 'extra-bar-complex-length': v(1500) })), 4.2 + 3.782);
});

test('stone wrap: the same open edges as any other profile; the apron strips are not counted again', () => {
  near(lengthOf('stoleshnitsa_kuhnya', kitchen({ 'edge-type': v('stone-wrap') })), 4.2);
  near(lengthOf('stoleshnitsa_kuhnya', kitchenL({ 'edge-type': v('stone-wrap') })), 5.1);
});

test('sill: only the room side', () => {
  const sill = extra => Object.assign({ width: v(300), length: v(1500), 'edge-type': v('straight') }, extra);
  near(lengthOf('podokonnik', sill({})), 1.5);   // the ends at the reveals and the window side are closed
  // Угловой: the main run's room side 1.2 + the arm's 0.5 (its end at the wall is closed).
  near(lengthOf('podokonnik', sill({ productSubcategory: v('SILL-02'), 'sill-arm-length': v(800) })), 1.7);
  // Эркерный (трапеция и радиус): the bay is the window line; the room side is straight.
  near(lengthOf('podokonnik', sill({ productSubcategory: v('SILL-03'), 'sill-bay-depth': v(400), 'sill-bay-front': v(700) })), 1.5);
  near(lengthOf('podokonnik', sill({ productSubcategory: v('SILL-04'), 'sill-bay-depth': v(400) })), 1.5);
  // Фигурный: the shaped room-side edge, along its curve.
  near(lengthOf('podokonnik', sill({ productSubcategory: v('SILL-05') })), 1.551);
  // A shaped type whose sizes are not in yet is drawn (and priced) straight.
  near(lengthOf('podokonnik', sill({ productSubcategory: v('SILL-03') })), 1.5);
});

test('straight stair: one nosing per tread', () => {
  const stair = extra => Object.assign({ width: v(1000), length: v(3000), 'step-count': v(10), productSubcategory: v('STAIR-01'), 'edge-type': v('straight') }, extra);
  near(lengthOf('lestnitsa', stair({})), 10.0);
  near(lengthOf('lestnitsa', stair({ 'stair-risers': { checked: true }, 'riser-height': v(170) })), 10.0);
  near(lengthOf('lestnitsa', stair({ 'edge-type': v('stone-wrap') })), 10.0);
});

test('L and U stairs: every tread\'s nosing + the landing\'s open front', () => {
  const stair = (type, extra) => Object.assign({ width: v(1000), length: v(3000), 'step-count': v(5), productSubcategory: v(type), 'edge-type': v('straight') }, extra);
  // Г: 2 x 5 treads x 1.0 + the landing's front 1.0 (the upper march leaves from its side).
  near(lengthOf('lestnitsa', stair('STAIR-03')), 11.0);
  // П: the landing's front is 2.1 wide, but the upper march starts on 1.0 of
  // it -- open are the arriving march's 1.0 and the 0.1 gap over the well.
  near(lengthOf('lestnitsa', stair('STAIR-05')), 11.1);
  near(lengthOf('lestnitsa', stair('STAIR-05', { 'edge-type': v('stone-wrap') })), 11.1);
});

test('spiral stair: the front (radial) edge of every tread, not the outer arc', () => {
  near(lengthOf('lestnitsa', { width: v(1000), length: v(3000), 'step-count': v(12), productSubcategory: v('STAIR-07'), 'edge-type': v('straight') }), 12.0);
});

test('steps: the front edge of every tread (straight, winder, radius arc)', () => {
  const steps = (type, extra) => Object.assign({ width: v(300), length: v(1200), 'step-count': v(3), productSubcategory: v(type), 'edge-type': v('straight') }, extra);
  near(lengthOf('stupeni', steps('STEP-01')), 3.6);
  near(lengthOf('stupeni', steps('STEP-02')), 3.6);   // the radial front of each wedge, 1.2
  near(lengthOf('stupeni', steps('STEP-03')), 3.637);   // 3 x the 1.2122 arc
});

test('floor and wall have no edge', () => {
  assert.equal(lengthOf('pol', { width: v(3000), length: v(3000), 'edge-type': v('straight') }), 0);
  assert.equal(lengthOf('stena', { width: v(3000), length: v(3000), 'edge-type': v('straight') }), 0);
});

test('an incomplete or missing layout is 0, never a throw', () => {
  assert.equal(lengthOf('stoleshnitsa_kuhnya', {}), 0);
  assert.equal(EdgeLength.openEdgeLengthM(null), 0);
  assert.equal(EdgeLength.openEdgeLengthM({ parts: [] }), 0);
});
