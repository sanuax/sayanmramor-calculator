// tests/additional-works-integration.test.js
//
// Block 4 (Additional Works 2.0): most of the underlying rules (sink
// priority derivation, per-hole positions, island/bar mutual exclusion,
// capability gating, null-rate safety) already have dedicated coverage in
// tests/constructor-state.test.js, tests/pricing.test.js,
// tests/visualizer-*.test.js and tests/product-configuration.test.js -- this
// file only adds the specific named scenarios Block 4 calls out that were
// not yet covered anywhere else: Kitchen<->Bathroom round-trip isolation,
// and one full end-to-end "everything selected at once" sanity check per
// product, all the way through to the geometry model.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createFakeDoc } = require('./helpers/fake-dom.js');
const ConstructorState = require('../constructor-state.js');
const GeometryModel = require('../visualizer/geometry-model.js');
const ProductTypes = require('../product-types.js');

const { PRODUCTS, hasAdditionalWork } = ProductTypes;

function readState(productKey, values) {
  const doc = createFakeDoc(Object.assign({ width: { value: '600' }, length: { value: '2400' } }, values));
  return ConstructorState.readConstructorState({
    doc, selectedProductKey: productKey, product: PRODUCTS[productKey], stone: null, hasAdditionalWork,
  });
}

test('Kitchen -> Bathroom -> Kitchen: island/bar (kitchen-only) never survive the round trip, and switching back does not resurrect them from a stale DOM value', () => {
  // Kitchen state with island+bar filled in.
  const kitchenValues = {
    'extra-ostrov-width': { value: '1200' }, 'extra-ostrov-length': { value: '800' },
    'extra-bar-standard-width': { value: '600' }, 'extra-bar-standard-length': { value: '1500' },
  };
  const kitchenState1 = readState('stoleshnitsa_kuhnya', kitchenValues);
  assert.ok(kitchenState1.island.standard.widthM > 0);
  assert.ok(kitchenState1.barCounter.standard.widthM > 0);

  // Switch to bathroom -- SAME underlying DOM values are still physically
  // present (the real app clears them via renderSubcategoryOptions-style
  // resets on capability change; this test deliberately does NOT clear them,
  // to prove readConstructorState's own capability gate is what protects
  // bathroom, not a UI-level cleanup step it might not always run before
  // reading state).
  const bathroomState = readState('stoleshnitsa_vannaya', kitchenValues);
  assert.equal(bathroomState.product.capabilities.island, false);
  assert.equal(bathroomState.product.capabilities.barCounter, false);
  assert.deepEqual(bathroomState.island.standard, { widthM: 0, lengthM: 0 });
  assert.deepEqual(bathroomState.barCounter.standard, { widthM: 0, lengthM: 0 });
  const bathroomModel = GeometryModel.buildGeometryModel(bathroomState);
  assert.equal(bathroomModel.island, null);
  assert.equal(bathroomModel.barCounter, null);

  // Switch back to kitchen -- island/bar are real again (same DOM values
  // never actually changed, matching "material/state that should persist
  // isn't reset without reason").
  const kitchenState2 = readState('stoleshnitsa_kuhnya', kitchenValues);
  assert.deepEqual(kitchenState2.island.standard, kitchenState1.island.standard);
  assert.deepEqual(kitchenState2.barCounter.standard, kitchenState1.barCounter.standard);
});

test('Bathroom -> Kitchen -> Bathroom: bathroom-supported extras (sink/holes/curb/backsplash/wallPanel) survive the round trip, kitchen-only ones never leak in either direction', () => {
  const bathroomValues = {
    'cut-sink-undermount': { value: '1' },
    'hole-mixer': { value: '1' },
    'extra-bortik': { value: '1000' },
    'extra-fartuk-width': { value: '600' }, 'extra-fartuk-length': { value: '2000' },
    'extra-wallpanel-width': { value: '900' }, 'extra-wallpanel-length': { value: '2400' },
  };
  const bathroomState1 = readState('stoleshnitsa_vannaya', bathroomValues);
  assert.equal(bathroomState1.additionalWorks.sink.type, 'undermount');
  assert.equal(bathroomState1.holeCounts.mixer, 1);
  assert.ok(bathroomState1.curbLengthM > 0);

  const kitchenState = readState('stoleshnitsa_kuhnya', bathroomValues);
  // Kitchen DOES support sink/holes/curb/backsplash/wallPanel too (it's a
  // superset of bathroom's capabilities), so these values legitimately
  // carry over -- that is correct, not a leak. What must NOT happen is
  // island/barCounter appearing from nothing.
  assert.equal(kitchenState.additionalWorks.sink.type, 'undermount');
  assert.deepEqual(kitchenState.island.standard, { widthM: 0, lengthM: 0 });
  assert.deepEqual(kitchenState.barCounter.standard, { widthM: 0, lengthM: 0 });

  const bathroomState2 = readState('stoleshnitsa_vannaya', bathroomValues);
  assert.deepEqual(bathroomState2.additionalWorks.sink, bathroomState1.additionalWorks.sink);
  assert.deepEqual(bathroomState2.holeCounts, bathroomState1.holeCounts);
  assert.equal(bathroomState2.curbLengthM, bathroomState1.curbLengthM);
});

test('kitchen end-to-end: every additional work selected at once reaches the geometry model correctly, none overwriting another', () => {
  const state = readState('stoleshnitsa_kuhnya', {
    'cut-sink-undermount': { value: '1' },
    'cut-cooktop': { value: '1' },
    'hole-mixer': { value: '1' }, 'hole-dispenser': { value: '1' }, 'hole-socket': { value: '1' },
    'extra-bortik': { value: '1200' },
    'extra-fartuk-width': { value: '100' }, 'extra-fartuk-length': { value: '2400' },
    'extra-wallpanel-width': { value: '900' }, 'extra-wallpanel-length': { value: '2400' },
    'extra-ostrov-width': { value: '1200' }, 'extra-ostrov-length': { value: '800' },
    'extra-bar-standard-width': { value: '600' }, 'extra-bar-standard-length': { value: '1500' },
  });
  const model = GeometryModel.buildGeometryModel(state);
  assert.equal(model.sink.type, 'undermount');
  assert.equal(model.cooktop.count, 1);
  assert.ok(model.holes.mixer && model.holes.dispenser && model.holes.socket);
  // The three holes must not collapse onto the same point.
  const points = [model.holes.mixer.position, model.holes.dispenser.position, model.holes.socket.position];
  const unique = new Set(points.map(p => p.xM + ',' + p.zM));
  assert.equal(unique.size, 3, 'mixer/dispenser/socket must not share a position');
  assert.ok(model.curb && model.curb.lengthM > 0);
  assert.ok(model.backsplash && model.backsplash.heightM > 0);
  assert.ok(model.wallPanel && model.wallPanel.heightM > 0);
  assert.ok(model.island && model.island.widthM > 0);
  assert.ok(model.barCounter && model.barCounter.widthM > 0);
  // Island faces the LENGTH run (offset along width, zero offset along
  // length); bar counter extends past one length-end (offset along length,
  // zero offset along width) -- the two can never collide.
  assert.ok(model.island.offsetXM > 0);
  assert.equal(model.island.offsetZM, 0);
  assert.equal(model.barCounter.offsetXM, 0);
  assert.ok(model.barCounter.offsetZM > 0);
});

test('bathroom end-to-end: every bathroom-supported additional work reaches the geometry model, cooktop/island/barCounter stay null (no capability)', () => {
  const state = readState('stoleshnitsa_vannaya', {
    'cut-sink-overlay': { value: '1' },
    'cut-cooktop': { value: '1' }, // leftover value, bathroom has no cooktop capability
    'hole-socket': { value: '1' },
    'extra-bortik': { value: '800' },
    'extra-fartuk-width': { value: '100' }, 'extra-fartuk-length': { value: '1800' },
    'extra-wallpanel-width': { value: '700' }, 'extra-wallpanel-length': { value: '2100' },
  });
  const model = GeometryModel.buildGeometryModel(state);
  assert.equal(model.sink.type, 'overlay');
  assert.equal(model.cooktop, null);
  assert.equal(model.holes.socket.count, 1);
  assert.ok(model.curb);
  assert.ok(model.backsplash);
  assert.ok(model.wallPanel);
  assert.equal(model.island, null);
  assert.equal(model.barCounter, null);
});
