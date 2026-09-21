# 3D Visualizer — Vertical Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a live-updating, interactive 3D preview (Three.js) of a straight countertop — real dimensions, selected material, full camera controls — to `sayanmramor-calculator.html`, driven by a single new `ConstructorState` object that also becomes the sole input to pricing, with zero change to computed prices.

**Architecture:** `readConstructorState()` reads the DOM/product/stone once into one plain object; `buildPricingInputs()` (pricing-facing) and `buildGeometryModel()` + `resolveMaterial()` (3D-facing) all derive from that same object. `ThreeScene` is the only module that touches Three.js; it consumes only plain data (`ProductGeometryModel`, `MaterialDescriptor`), never the DOM or `stone` records directly.

**Tech Stack:** Vanilla JS, no build step, no npm dependencies. Existing modules use the UMD `(function(root, factory){...})` pattern loaded via `<script src>`. Three.js is vendored locally under `vendor/three/` and loaded via `<script type="module">` (Three's current distribution has no classic UMD/global build — this is the one deliberate exception to the project's module pattern). Tests run via plain `node --test tests/`.

**Spec:** [docs/superpowers/specs/2026-09-21-3d-visualizer-design.md](../specs/2026-09-21-3d-visualizer-design.md)

## Global Constraints

- No build step, no bundler, no npm dependencies. Every new file is either plain UMD JS loaded via `<script src>`, or (Three.js only) an ES module loaded via `<script type="module">`.
- `pricing.js`, `rate-catalog.js`, `material-picker.js`, and all pricing-relevant fields of `product-types.js` (`PRODUCTS`, `WORK_RATES`, `COUNTERTOP_EXTRAS_RATES`, capability flags) are never modified.
- Refactoring `calculate()` to read from `ConstructorState` must be strictly behavior-preserving: for every existing scenario, `ConstructorState → pricing` must produce byte-identical results to today's `DOM → pricing`. This includes scenarios with **more than one** edge-length field or sink-count field non-zero at once — the current pricing logic charges each independently, and that must keep working exactly as it does today, even though the 3D-facing `edge`/`sink` fields are simplified to a single type each (see Task 2).
- Three.js is vendored into the repo (`vendor/three/`), never loaded from a CDN at runtime.
- `thicknessM` (real) and `visualThicknessM` (rendering-only fallback) are never merged or aliased — the UI must never present the fallback as a real product spec.
- Sink/cooktop placements with no real coordinate data are tagged `source: 'fallback'` in the geometry model and must not be rendered identically to a real, confirmed position.
- If WebGL is unavailable, none of the `visualizer/*` code runs and the calculator's price flow is completely unaffected.

---

## File Structure

| File | Responsibility |
|---|---|
| `tests/helpers/fake-dom.js` (new) | Minimal fake `document` (`getElementById` only) for testing DOM-reading code without a browser or jsdom. |
| `constructor-state.js` (new, UMD) | `readConstructorState()` — the single state-reading function. `buildPricingInputs()` — turns `ConstructorState` into the exact object `Pricing.calculatePrice()` expects today. |
| `tests/constructor-state.test.js` (new) | Unit tests for both functions above. |
| `tests/pricing-equivalence.test.js` (new) | Characterization test: an independently-transcribed "legacy" reference of today's inline pricing-assembly logic vs. the new `constructor-state.js` path, across representative scenarios. Must pass before *and* after Task 5's HTML refactor. |
| `visualizer/constants.js` (new, UMD) | `VISUAL_FALLBACK_THICKNESS_M` and other rendering-only constants, explicitly separated from real product data. |
| `visualizer/geometry-model.js` (new, UMD) | `buildGeometryModel(state)` — pure, no Three.js import. |
| `tests/visualizer-geometry-model.test.js` (new) | Unit tests for `buildGeometryModel`. |
| `visualizer/material-adapter.js` (new, UMD) | `resolveMaterial(stone, bookmatchMode)` — pure, no Three.js import, no knowledge of anything outside a `stone` record. |
| `tests/visualizer-material-adapter.test.js` (new) | Unit tests for `resolveMaterial`. |
| `visualizer/webgl-support.js` (new, UMD) | `isWebglAvailable()` — side-effect-free WebGL context probe. |
| `tests/visualizer-webgl-support.test.js` (new) | Unit tests using a fake `canvas`/`document`. |
| `vendor/three/three.module.js`, `vendor/three/OrbitControls.js`, `vendor/three/VERSION.txt` (new) | Vendored Three.js build, pinned version. |
| `visualizer/three-scene.js` (new, ES module) | `ThreeScene`: the only file importing Three.js. `init`, `update`, `setView`, `dispose`. Not unit-testable (WebGL); verified manually (Task 11). |
| `sayanmramor-calculator.html` (modified) | `calculate()` refactored to build state via `readConstructorState()` + `buildPricingInputs()` (Task 5); 3D panel markup/CSS + script wiring + live-update hook added (Task 12). |

---

### Task 1: Fake-DOM test helper

**Files:**
- Create: `tests/helpers/fake-dom.js`
- Test: covered indirectly by every test file that uses it (Tasks 2, 4, 9)

**Interfaces:**
- Consumes: nothing.
- Produces: `createFakeDoc(values)` — `values` is a plain object mapping element id → `{ value }` or `{ checked }`. Returns an object with a `getElementById(id)` method. Missing ids return an element whose `.value` is `''` and `.checked` is `false` (matching a real un-filled `<input>`), never `null` — this mirrors how `readConstructorState()` will call `.value`/`.checked` on the result without a null-check, exactly like `calculate()` does today on real DOM elements that are always present in the page.

- [ ] **Step 1: Write `tests/helpers/fake-dom.js`**

```js
// tests/helpers/fake-dom.js
function createFakeDoc(values) {
  values = values || {};
  return {
    getElementById(id) {
      const entry = values[id];
      return {
        value: entry && entry.value !== undefined ? entry.value : '',
        checked: entry && entry.checked !== undefined ? entry.checked : false,
      };
    },
  };
}

module.exports = { createFakeDoc };
```

- [ ] **Step 2: Write a tiny self-test to confirm the helper behaves as intended**

```js
// tests/helpers/fake-dom.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { createFakeDoc } = require('./fake-dom.js');

test('createFakeDoc returns provided value/checked, and safe defaults for missing ids', () => {
  const doc = createFakeDoc({ width: { value: '2000' }, 'opt-complex': { checked: true } });
  assert.equal(doc.getElementById('width').value, '2000');
  assert.equal(doc.getElementById('opt-complex').checked, true);
  assert.equal(doc.getElementById('nonexistent').value, '');
  assert.equal(doc.getElementById('nonexistent').checked, false);
});
```

- [ ] **Step 3: Run it**

Run: `node --test tests/helpers/fake-dom.test.js`
Expected: PASS (1 test)

- [ ] **Step 4: Commit**

```bash
git add tests/helpers/fake-dom.js tests/helpers/fake-dom.test.js
git commit -m "test: add fake-DOM helper for DOM-reading unit tests

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: `constructor-state.js` — `readConstructorState()`

**Files:**
- Create: `constructor-state.js`
- Test: `tests/constructor-state.test.js`

**Interfaces:**
- Consumes: `tests/helpers/fake-dom.js` (`createFakeDoc`). In production, the real `document` and the caller's `product`/`stone`/`selectedProductKey`/`hasAdditionalWork` (from `product-types.js`, already global as `ProductTypes.hasAdditionalWork`).
- Produces: `readConstructorState({ doc, selectedProductKey, product, stone, hasAdditionalWork })` returning the `ConstructorState` shape below. This is consumed by `buildPricingInputs()` (Task 3), `buildGeometryModel()` (Task 7), and `resolveMaterial()` (Task 8, via `state.stone`/`state.bookmatchMode`).

**`ConstructorState` shape** (superset of the spec's shape — see Global Constraints for why the raw per-type fields exist alongside the derived single-value ones):

```js
{
  product: { key, label, type, capabilities: { supportsEdgeWork, supportsCountertopExtras, sinkCutout, cooktopCutout, holes, curb, backsplash, wallPanel, island, barCounter } } | null,
  stone: <the stone record itself, or null>,

  dimensions: { widthM, lengthM, thicknessM: null },

  // Raw, full-fidelity data. buildPricingInputs() reads ONLY this block.
  edgeLineItems: [ { rateId, type, lengthMm } ],   // one entry per non-zero legacy field, ALL of them
  sinkCounts: { overlay, undermount, integrated }, // always present, zeroed if !capabilities.sinkCutout
  cooktopCount: number,                             // zeroed if !capabilities.cooktopCutout
  holeCounts: { mixer, socket, dispenser },         // zeroed if !capabilities.holes
  curbLengthM: number,                              // zeroed if !capabilities.curb
  backsplash: { widthM, lengthM },                  // zeroed if !capabilities.backsplash
  wallPanel: { widthM, lengthM },                   // zeroed if !capabilities.wallPanel
  island: { standard: { widthM, lengthM }, figured: { widthM, lengthM } }, // zeroed if !capabilities.island
  barCounter: { standard: { widthM, lengthM }, complex: { widthM, lengthM } }, // zeroed if !capabilities.barCounter

  // Derived, simplified single-value views. buildGeometryModel() reads ONLY this block (plus `dimensions`).
  edge: { type: 'straight'|'figured'|'rounding'|'bevel'|'stone-wrap'|null, lengthMm: number|null },
  additionalWorks: {
    sink: { type: 'overlay'|'undermount'|'integrated'|null, count: number, position: null },
    cooktop: { count: number, position: null },
  },

  bookmatchMode: 'none',
  options: { complexEnabled, polishEnabled, installEnabled },
  subcategory: { id: string|null, qty: number },
}
```

- [ ] **Step 1: Write the failing tests**

```js
// tests/constructor-state.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { createFakeDoc } = require('./helpers/fake-dom.js');
const ConstructorState = require('../constructor-state.js');
const ProductTypes = require('../product-types.js');

const { PRODUCTS, hasAdditionalWork } = ProductTypes;

test('readConstructorState reads dimensions and converts mm to m', () => {
  const doc = createFakeDoc({ width: { value: '2000' }, length: { value: '600' } });
  const state = ConstructorState.readConstructorState({
    doc, selectedProductKey: 'stoleshnitsa_kuhnya', product: PRODUCTS.stoleshnitsa_kuhnya,
    stone: null, hasAdditionalWork,
  });
  assert.equal(state.dimensions.widthM, 2);
  assert.equal(state.dimensions.lengthM, 0.6);
  assert.equal(state.dimensions.thicknessM, null);
});

test('readConstructorState.edge picks the first non-zero legacy field by fixed priority, not by length', () => {
  // edge-round (300) is numerically larger than edge-straight (100), but
  // straight has higher priority -- straight must win.
  const doc = createFakeDoc({
    width: { value: '1000' }, length: { value: '600' },
    'edge-straight': { value: '100' }, 'edge-round': { value: '300' },
  });
  const state = ConstructorState.readConstructorState({
    doc, selectedProductKey: 'stoleshnitsa_kuhnya', product: PRODUCTS.stoleshnitsa_kuhnya,
    stone: null, hasAdditionalWork,
  });
  assert.deepEqual(state.edge, { type: 'straight', lengthMm: 100 });
});

test('readConstructorState.edge maps all 5 legacy field ids to the new type enum', () => {
  const cases = [
    ['edge-straight', 'straight'], ['edge-figured', 'figured'], ['edge-round', 'rounding'],
    ['edge-chamfer', 'bevel'], ['edge-stonefold', 'stone-wrap'],
  ];
  for (const [elId, expectedType] of cases) {
    const doc = createFakeDoc({ width: { value: '1000' }, length: { value: '600' }, [elId]: { value: '500' } });
    const state = ConstructorState.readConstructorState({
      doc, selectedProductKey: 'stoleshnitsa_kuhnya', product: PRODUCTS.stoleshnitsa_kuhnya,
      stone: null, hasAdditionalWork,
    });
    assert.deepEqual(state.edge, { type: expectedType, lengthMm: 500 });
  }
});

test('readConstructorState.edge is null/null when no legacy field is set', () => {
  const doc = createFakeDoc({ width: { value: '1000' }, length: { value: '600' } });
  const state = ConstructorState.readConstructorState({
    doc, selectedProductKey: 'pol', product: PRODUCTS.pol, stone: null, hasAdditionalWork,
  });
  assert.deepEqual(state.edge, { type: null, lengthMm: null });
});

test('readConstructorState.edgeLineItems keeps EVERY non-zero legacy field, not just the priority winner (pricing fidelity)', () => {
  const doc = createFakeDoc({
    width: { value: '1000' }, length: { value: '600' },
    'edge-straight': { value: '100' }, 'edge-chamfer': { value: '50' },
  });
  const state = ConstructorState.readConstructorState({
    doc, selectedProductKey: 'stoleshnitsa_kuhnya', product: PRODUCTS.stoleshnitsa_kuhnya,
    stone: null, hasAdditionalWork,
  });
  assert.deepEqual(state.edgeLineItems, [
    { rateId: 'EDGE-01', type: 'straight', lengthMm: 100 },
    { rateId: 'EDGE-05', type: 'bevel', lengthMm: 50 },
  ]);
});

test('readConstructorState.additionalWorks.sink is derived by the same fixed-priority rule (overlay > undermount > integrated)', () => {
  const doc = createFakeDoc({
    width: { value: '1000' }, length: { value: '600' },
    'cut-sink-undermount': { value: '2' }, 'cut-sink-integrated': { value: '5' },
  });
  const state = ConstructorState.readConstructorState({
    doc, selectedProductKey: 'stoleshnitsa_kuhnya', product: PRODUCTS.stoleshnitsa_kuhnya,
    stone: null, hasAdditionalWork,
  });
  assert.deepEqual(state.additionalWorks.sink, { type: 'undermount', count: 2, position: null });
  // Raw counts for pricing keep BOTH values, independent of the derived single-type view.
  assert.deepEqual(state.sinkCounts, { overlay: 0, undermount: 2, integrated: 5 });
});

test('readConstructorState zeroes countertop-extras fields for a product without that capability, even if the field has a leftover value', () => {
  const doc = createFakeDoc({
    width: { value: '1000' }, length: { value: '600' },
    'extra-bortik': { value: '500' }, // leftover from a previously selected product
  });
  const state = ConstructorState.readConstructorState({
    doc, selectedProductKey: 'pol', product: PRODUCTS.pol, stone: null, hasAdditionalWork,
  });
  assert.equal(state.curbLengthM, 0);
});

test('readConstructorState.product.capabilities matches ProductTypes.hasAdditionalWork for every capability', () => {
  const doc = createFakeDoc({ width: { value: '1000' }, length: { value: '600' } });
  const state = ConstructorState.readConstructorState({
    doc, selectedProductKey: 'stoleshnitsa_vannaya', product: PRODUCTS.stoleshnitsa_vannaya,
    stone: null, hasAdditionalWork,
  });
  assert.deepEqual(state.product.capabilities, {
    supportsEdgeWork: true, supportsCountertopExtras: true,
    sinkCutout: true, cooktopCutout: false, holes: true,
    curb: true, backsplash: true, wallPanel: true, island: false, barCounter: false,
  });
});

test('readConstructorState.product is null when no product is selected', () => {
  const doc = createFakeDoc({ width: { value: '1000' }, length: { value: '600' } });
  const state = ConstructorState.readConstructorState({
    doc, selectedProductKey: null, product: null, stone: null, hasAdditionalWork,
  });
  assert.equal(state.product, null);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/constructor-state.test.js`
Expected: FAIL — `Cannot find module '../constructor-state.js'`

- [ ] **Step 3: Implement `constructor-state.js`**

```js
// constructor-state.js
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.ConstructorState = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {

  function mmToM(mmValue) {
    return mmValue / 1000;
  }

  function numFromField(doc, id) {
    return parseFloat(doc.getElementById(id).value) || 0;
  }

  // Same 5 legacy fields the real calculator's #edgeWork block reads today,
  // in a fixed priority order used both to pick the single `edge` view and
  // to label each raw `edgeLineItems` entry. Order/ids/rateIds match
  // EDGE_LINE_ITEMS in sayanmramor-calculator.html exactly.
  const EDGE_FIELDS = [
    { elId: 'edge-straight', rateId: 'EDGE-01', type: 'straight' },
    { elId: 'edge-figured', rateId: 'EDGE-03', type: 'figured' },
    { elId: 'edge-round', rateId: 'EDGE-04', type: 'rounding' },
    { elId: 'edge-chamfer', rateId: 'EDGE-05', type: 'bevel' },
    { elId: 'edge-stonefold', rateId: 'EDGE-06', type: 'stone-wrap' },
  ];

  function readEdgeLineItems(doc) {
    const items = [];
    EDGE_FIELDS.forEach(({ elId, rateId, type }) => {
      const lengthMm = numFromField(doc, elId);
      if (lengthMm > 0) items.push({ rateId, type, lengthMm });
    });
    return items;
  }

  // Fixed priority order, not magnitude -- see docs/superpowers/specs/2026-09-21-3d-visualizer-design.md.
  function deriveSingleEdge(edgeLineItems) {
    if (edgeLineItems.length === 0) return { type: null, lengthMm: null };
    const winner = EDGE_FIELDS.find(f => edgeLineItems.some(item => item.type === f.type));
    const item = edgeLineItems.find(i => i.type === winner.type);
    return { type: item.type, lengthMm: item.lengthMm };
  }

  function readSinkCounts(doc, hasCapability) {
    if (!hasCapability) return { overlay: 0, undermount: 0, integrated: 0 };
    return {
      overlay: numFromField(doc, 'cut-sink-overlay'),
      undermount: numFromField(doc, 'cut-sink-undermount'),
      integrated: numFromField(doc, 'cut-sink-integrated'),
    };
  }

  const SINK_PRIORITY = ['overlay', 'undermount', 'integrated'];

  function deriveSingleSink(sinkCounts) {
    const type = SINK_PRIORITY.find(t => sinkCounts[t] > 0) || null;
    return { type, count: type ? sinkCounts[type] : 0, position: null };
  }

  function readConstructorState({ doc, selectedProductKey, product, stone, hasAdditionalWork }) {
    const d = doc;
    const cap = (name) => !!(product && hasAdditionalWork(product, name));

    const capabilities = product ? {
      supportsEdgeWork: !!product.supportsEdgeWork,
      supportsCountertopExtras: !!product.supportsCountertopExtras,
      sinkCutout: cap('sinkCutout'), cooktopCutout: cap('cooktopCutout'), holes: cap('holes'),
      curb: cap('curb'), backsplash: cap('backsplash'), wallPanel: cap('wallPanel'),
      island: cap('island'), barCounter: cap('barCounter'),
    } : null;

    const edgeLineItems = product && product.supportsEdgeWork ? readEdgeLineItems(d) : [];
    const sinkCounts = readSinkCounts(d, capabilities && capabilities.sinkCutout);
    const cooktopCount = capabilities && capabilities.cooktopCutout ? numFromField(d, 'cut-cooktop') : 0;
    const holeCounts = capabilities && capabilities.holes
      ? { mixer: numFromField(d, 'hole-mixer'), socket: numFromField(d, 'hole-socket'), dispenser: numFromField(d, 'hole-dispenser') }
      : { mixer: 0, socket: 0, dispenser: 0 };
    const curbLengthM = capabilities && capabilities.curb ? mmToM(numFromField(d, 'extra-bortik')) : 0;
    const backsplash = capabilities && capabilities.backsplash
      ? { widthM: mmToM(numFromField(d, 'extra-fartuk-width')), lengthM: mmToM(numFromField(d, 'extra-fartuk-length')) }
      : { widthM: 0, lengthM: 0 };
    const wallPanel = capabilities && capabilities.wallPanel
      ? { widthM: mmToM(numFromField(d, 'extra-wallpanel-width')), lengthM: mmToM(numFromField(d, 'extra-wallpanel-length')) }
      : { widthM: 0, lengthM: 0 };
    const island = capabilities && capabilities.island
      ? {
          standard: { widthM: mmToM(numFromField(d, 'extra-ostrov-width')), lengthM: mmToM(numFromField(d, 'extra-ostrov-length')) },
          figured: { widthM: mmToM(numFromField(d, 'extra-ostrov-figured-width')), lengthM: mmToM(numFromField(d, 'extra-ostrov-figured-length')) },
        }
      : { standard: { widthM: 0, lengthM: 0 }, figured: { widthM: 0, lengthM: 0 } };
    const barCounter = capabilities && capabilities.barCounter
      ? {
          standard: { widthM: mmToM(numFromField(d, 'extra-bar-standard-width')), lengthM: mmToM(numFromField(d, 'extra-bar-standard-length')) },
          complex: { widthM: mmToM(numFromField(d, 'extra-bar-complex-width')), lengthM: mmToM(numFromField(d, 'extra-bar-complex-length')) },
        }
      : { standard: { widthM: 0, lengthM: 0 }, complex: { widthM: 0, lengthM: 0 } };

    return {
      product: product ? { key: selectedProductKey, label: product.label, type: product.type, capabilities } : null,
      stone: stone || null,
      dimensions: {
        widthM: mmToM(numFromField(d, 'width')),
        lengthM: mmToM(numFromField(d, 'length')),
        thicknessM: null,
      },
      edgeLineItems,
      sinkCounts,
      cooktopCount,
      holeCounts,
      curbLengthM,
      backsplash,
      wallPanel,
      island,
      barCounter,
      edge: deriveSingleEdge(edgeLineItems),
      additionalWorks: {
        sink: deriveSingleSink(sinkCounts),
        cooktop: { count: cooktopCount, position: null },
      },
      bookmatchMode: 'none',
      options: {
        complexEnabled: d.getElementById('opt-complex').checked,
        polishEnabled: d.getElementById('opt-polish').checked,
        installEnabled: d.getElementById('opt-install').checked,
      },
      subcategory: {
        id: d.getElementById('productSubcategory').value || null,
        qty: numFromField(d, 'subcategoryQty'),
      },
    };
  }

  return { readConstructorState };
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/constructor-state.test.js`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add constructor-state.js tests/constructor-state.test.js
git commit -m "feat: add readConstructorState as the single constructor-state source

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: `constructor-state.js` — `buildPricingInputs()`

**Files:**
- Modify: `constructor-state.js` (add export, no changes to `readConstructorState`)
- Test: `tests/constructor-state.test.js` (append)

**Interfaces:**
- Consumes: a `ConstructorState` from Task 2, plus `productRates` (one entry of `ProductTypes.WORK_RATES`), and the same rate-catalog lookups already used in the HTML (`RateCatalog.getAdditionalWorkRate`).
- Produces: `buildPricingInputs(state, { productRates, miscFlatSum, miscRatePerM2, complexShapeMultiplier, countertopExtrasRates, getAdditionalWorkRate })` returning `{ rates, extraLineItems, extraDimensions }` — exactly the 3 pieces `sayanmramor-calculator.html`'s `calculate()` assembles today before calling `Pricing.calculatePrice()`. Consumed by Task 5 (the HTML refactor) and by Task 4 (the equivalence test).

- [ ] **Step 1: Write the failing tests**

```js
// appended to tests/constructor-state.test.js
const RateCatalog = require('../rate-catalog.js');

function baseRatesConfig(productKey) {
  return {
    productRates: ProductTypes.WORK_RATES[productKey],
    miscFlatSum: ProductTypes.MISC_FLAT_SUM,
    miscRatePerM2: ProductTypes.MISC_RATE_PER_M2,
    complexShapeMultiplier: ProductTypes.COMPLEX_SHAPE_MULTIPLIER,
    countertopExtrasRates: ProductTypes.COUNTERTOP_EXTRAS_RATES,
    getAdditionalWorkRate: RateCatalog.getAdditionalWorkRate,
  };
}

test('buildPricingInputs assembles one extraLineItems entry per edge field, using rate-catalog rates', () => {
  const doc = createFakeDoc({
    width: { value: '1000' }, length: { value: '600' },
    'edge-straight': { value: '100' }, 'edge-chamfer': { value: '50' },
  });
  const state = ConstructorState.readConstructorState({
    doc, selectedProductKey: 'stoleshnitsa_kuhnya', product: PRODUCTS.stoleshnitsa_kuhnya, stone: null, hasAdditionalWork,
  });
  const { extraLineItems } = ConstructorState.buildPricingInputs(state, baseRatesConfig('stoleshnitsa_kuhnya'));
  assert.equal(extraLineItems.length, 2);
  assert.equal(extraLineItems[0].rate, RateCatalog.getAdditionalWorkRate('EDGE-01'));
  assert.equal(extraLineItems[0].quantity, 0.1); // 100mm -> 0.1m
  assert.equal(extraLineItems[1].rate, RateCatalog.getAdditionalWorkRate('EDGE-05'));
  assert.equal(extraLineItems[1].quantity, 0.05);
});

test('buildPricingInputs sums BOTH sink counts as independent line items when more than one is non-zero (pricing must not collapse to one type)', () => {
  const doc = createFakeDoc({
    width: { value: '1000' }, length: { value: '600' },
    'cut-sink-overlay': { value: '1' }, 'cut-sink-undermount': { value: '2' },
  });
  const state = ConstructorState.readConstructorState({
    doc, selectedProductKey: 'stoleshnitsa_kuhnya', product: PRODUCTS.stoleshnitsa_kuhnya, stone: null, hasAdditionalWork,
  });
  const { extraLineItems } = ConstructorState.buildPricingInputs(state, baseRatesConfig('stoleshnitsa_kuhnya'));
  const cutItems = extraLineItems.filter(i => i.rate === RateCatalog.getAdditionalWorkRate('CUT-01') || i.rate === RateCatalog.getAdditionalWorkRate('CUT-02'));
  assert.equal(cutItems.length, 2);
});

test('buildPricingInputs.extraDimensions carries bortik/fartuk/ostrov, zero when capability absent', () => {
  const doc = createFakeDoc({
    width: { value: '1000' }, length: { value: '600' },
    'extra-bortik': { value: '500' },
    'extra-fartuk-width': { value: '600' }, 'extra-fartuk-length': { value: '2000' },
  });
  const state = ConstructorState.readConstructorState({
    doc, selectedProductKey: 'stoleshnitsa_kuhnya', product: PRODUCTS.stoleshnitsa_kuhnya, stone: null, hasAdditionalWork,
  });
  const { extraDimensions } = ConstructorState.buildPricingInputs(state, baseRatesConfig('stoleshnitsa_kuhnya'));
  assert.equal(extraDimensions.bortikLengthM, 0.5);
  assert.ok(Math.abs(extraDimensions.fartukAreaM2 - 1.2) < 1e-9);
  assert.equal(extraDimensions.ostrovAreaM2, 0);
});

test('buildPricingInputs.rates carries the product\'s own fabrication/installation/polish rates', () => {
  const doc = createFakeDoc({ width: { value: '1000' }, length: { value: '600' } });
  const state = ConstructorState.readConstructorState({
    doc, selectedProductKey: 'pol', product: PRODUCTS.pol, stone: null, hasAdditionalWork,
  });
  const { rates } = ConstructorState.buildPricingInputs(state, baseRatesConfig('pol'));
  assert.equal(rates.fabricationRatePerM2, ProductTypes.WORK_RATES.pol.fabricationRatePerM2);
  assert.equal(rates.installationRatePerM2, ProductTypes.WORK_RATES.pol.installationRatePerM2);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/constructor-state.test.js`
Expected: FAIL — `ConstructorState.buildPricingInputs is not a function`

- [ ] **Step 3: Implement `buildPricingInputs`, mirroring today's inline logic exactly**

Add to `constructor-state.js`, inside the factory function, before the final `return`:

```js
  function buildPricingInputs(state, config) {
    const { productRates, miscFlatSum, miscRatePerM2, complexShapeMultiplier, countertopExtrasRates, getAdditionalWorkRate } = config;

    const rates = {
      fabricationRatePerM2: productRates.fabricationRatePerM2,
      installationRatePerM2: productRates.installationRatePerM2,
      polishRatePerM2: productRates.polishRatePerM2,
      miscFlatSum, miscRatePerM2, complexShapeMultiplier,
      bortikRatePerM: countertopExtrasRates.bortikRatePerM,
      fartukRatePerM2: countertopExtrasRates.fartukRatePerM2,
      ostrovRatePerM2: countertopExtrasRates.ostrovRatePerM2,
    };

    let extraLineItems = state.edgeLineItems.map(item => ({
      rate: getAdditionalWorkRate(item.rateId), quantity: mmToM(item.lengthMm),
    }));

    const QUANTITY_ITEMS = [
      ['CUT-01', state.sinkCounts.overlay], ['CUT-02', state.sinkCounts.undermount], ['CUT-03', state.sinkCounts.integrated],
      ['CUT-04', state.cooktopCount],
      ['CUT-05', state.holeCounts.mixer], ['CUT-06', state.holeCounts.socket], ['CUT-07', state.holeCounts.dispenser],
    ];
    QUANTITY_ITEMS.forEach(([rateId, qty]) => {
      if (qty > 0) extraLineItems.push({ rate: getAdditionalWorkRate(rateId), quantity: qty });
    });

    const AREA_ITEMS = [
      ['EXTRA-05', state.island.figured.widthM * state.island.figured.lengthM],
      ['EXTRA-03', state.wallPanel.widthM * state.wallPanel.lengthM],
      ['EXTRA-06', state.barCounter.standard.widthM * state.barCounter.standard.lengthM],
      ['EXTRA-07', state.barCounter.complex.widthM * state.barCounter.complex.lengthM],
    ];
    AREA_ITEMS.forEach(([rateId, areaM2]) => {
      if (areaM2 > 0) extraLineItems.push({ rate: getAdditionalWorkRate(rateId), quantity: areaM2 });
    });

    const extraDimensions = {
      bortikLengthM: state.curbLengthM,
      fartukAreaM2: state.backsplash.widthM * state.backsplash.lengthM,
      ostrovAreaM2: state.island.standard.widthM * state.island.standard.lengthM,
    };

    return { rates, extraLineItems, extraDimensions };
  }
```

Update the final `return` statement to also export `buildPricingInputs`:

```js
  return { readConstructorState, buildPricingInputs };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/constructor-state.test.js`
Expected: PASS (13 tests)

- [ ] **Step 5: Commit**

```bash
git add constructor-state.js tests/constructor-state.test.js
git commit -m "feat: add buildPricingInputs, mirroring today's inline pricing assembly

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Pricing-equivalence characterization test

**Files:**
- Create: `tests/pricing-equivalence.test.js`

**Interfaces:**
- Consumes: `constructor-state.js` (Tasks 2-3), `pricing.js`, `product-types.js`, `rate-catalog.js` (all unmodified), `tests/helpers/fake-dom.js`.
- Produces: nothing new — this is a pure regression guard. It must pass now (before Task 5 touches the HTML) and must still pass after Task 5, unmodified, as direct evidence the refactor didn't change price.

This test independently transcribes today's `sayanmramor-calculator.html` inline logic (the exact code currently between `EDGE_LINE_ITEMS`/`QUANTITY_LINE_ITEMS`/`AREA_LINE_ITEMS` and the `Pricing.calculatePrice(...)` call) as a **separate, from-scratch reference implementation** inside the test file, and compares its output against the new `constructor-state.js` path for several representative scenarios. Because it's written independently (not by calling the new code's own internals), a bug that made the new path silently diverge from the old one would show up as a real assertion failure here.

- [ ] **Step 1: Write the test**

```js
// tests/pricing-equivalence.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { createFakeDoc } = require('./helpers/fake-dom.js');
const Pricing = require('../pricing.js');
const ProductTypes = require('../product-types.js');
const RateCatalog = require('../rate-catalog.js');
const ConstructorState = require('../constructor-state.js');

const { PRODUCTS, hasAdditionalWork, WORK_RATES, MISC_FLAT_SUM, MISC_RATE_PER_M2, COMPLEX_SHAPE_MULTIPLIER, COUNTERTOP_EXTRAS_RATES, SAW_MARGIN_CM, AREA_WASTE_FACTOR } = ProductTypes;
const { getAdditionalWorkRate } = RateCatalog;

function mmToM(mm) { return mm / 1000; }
function num(doc, id) { return parseFloat(doc.getElementById(id).value) || 0; }

// Independent transcription of today's sayanmramor-calculator.html calculate()
// logic (as of the commit that introduced this test), for characterization
// purposes only. Deliberately NOT calling into constructor-state.js.
function legacyBuildPricingInputs(doc, product) {
  const EDGE_LINE_ITEMS = [
    { rateId: 'EDGE-01', elId: 'edge-straight' }, { rateId: 'EDGE-03', elId: 'edge-figured' },
    { rateId: 'EDGE-04', elId: 'edge-round' }, { rateId: 'EDGE-05', elId: 'edge-chamfer' },
    { rateId: 'EDGE-06', elId: 'edge-stonefold' },
  ];
  let extraLineItems = [];
  EDGE_LINE_ITEMS.forEach(({ rateId, elId }) => {
    const lengthM = mmToM(num(doc, elId));
    if (lengthM > 0) extraLineItems.push({ rate: getAdditionalWorkRate(rateId), quantity: lengthM });
  });

  let bortikLengthM = 0, fartukAreaM2 = 0, ostrovAreaM2 = 0;
  if (product.supportsCountertopExtras) {
    bortikLengthM = hasAdditionalWork(product, 'curb') ? mmToM(num(doc, 'extra-bortik')) : 0;
    const fartukWidthM = hasAdditionalWork(product, 'backsplash') ? mmToM(num(doc, 'extra-fartuk-width')) : 0;
    const fartukLengthM = hasAdditionalWork(product, 'backsplash') ? mmToM(num(doc, 'extra-fartuk-length')) : 0;
    fartukAreaM2 = fartukWidthM * fartukLengthM;
    const ostrovWidthM = hasAdditionalWork(product, 'island') ? mmToM(num(doc, 'extra-ostrov-width')) : 0;
    const ostrovLengthM = hasAdditionalWork(product, 'island') ? mmToM(num(doc, 'extra-ostrov-length')) : 0;
    ostrovAreaM2 = ostrovWidthM * ostrovLengthM;

    const QUANTITY_LINE_ITEMS = [
      { rateId: 'CUT-01', elId: 'cut-sink-overlay', capability: 'sinkCutout' },
      { rateId: 'CUT-02', elId: 'cut-sink-undermount', capability: 'sinkCutout' },
      { rateId: 'CUT-03', elId: 'cut-sink-integrated', capability: 'sinkCutout' },
      { rateId: 'CUT-04', elId: 'cut-cooktop', capability: 'cooktopCutout' },
      { rateId: 'CUT-05', elId: 'hole-mixer', capability: 'holes' },
      { rateId: 'CUT-06', elId: 'hole-socket', capability: 'holes' },
      { rateId: 'CUT-07', elId: 'hole-dispenser', capability: 'holes' },
    ];
    QUANTITY_LINE_ITEMS.forEach(({ rateId, elId, capability }) => {
      if (!hasAdditionalWork(product, capability)) return;
      const qty = num(doc, elId);
      if (qty > 0) extraLineItems.push({ rate: getAdditionalWorkRate(rateId), quantity: qty });
    });

    const AREA_LINE_ITEMS = [
      { rateId: 'EXTRA-05', widthElId: 'extra-ostrov-figured-width', lengthElId: 'extra-ostrov-figured-length', capability: 'island' },
      { rateId: 'EXTRA-03', widthElId: 'extra-wallpanel-width', lengthElId: 'extra-wallpanel-length', capability: 'wallPanel' },
      { rateId: 'EXTRA-06', widthElId: 'extra-bar-standard-width', lengthElId: 'extra-bar-standard-length', capability: 'barCounter' },
      { rateId: 'EXTRA-07', widthElId: 'extra-bar-complex-width', lengthElId: 'extra-bar-complex-length', capability: 'barCounter' },
    ];
    AREA_LINE_ITEMS.forEach(({ rateId, widthElId, lengthElId, capability }) => {
      if (!hasAdditionalWork(product, capability)) return;
      const areaM2 = mmToM(num(doc, widthElId)) * mmToM(num(doc, lengthElId));
      if (areaM2 > 0) extraLineItems.push({ rate: getAdditionalWorkRate(rateId), quantity: areaM2 });
    });
  }

  const productRates = WORK_RATES[Object.keys(PRODUCTS).find(k => PRODUCTS[k] === product)];
  const rates = {
    fabricationRatePerM2: productRates.fabricationRatePerM2,
    installationRatePerM2: productRates.installationRatePerM2,
    polishRatePerM2: productRates.polishRatePerM2,
    miscFlatSum: MISC_FLAT_SUM, miscRatePerM2: MISC_RATE_PER_M2, complexShapeMultiplier: COMPLEX_SHAPE_MULTIPLIER,
    bortikRatePerM: COUNTERTOP_EXTRAS_RATES.bortikRatePerM,
    fartukRatePerM2: COUNTERTOP_EXTRAS_RATES.fartukRatePerM2,
    ostrovRatePerM2: COUNTERTOP_EXTRAS_RATES.ostrovRatePerM2,
  };

  return { rates, extraLineItems, extraDimensions: { bortikLengthM, fartukAreaM2, ostrovAreaM2 } };
}

const stone = {
  id: 'delicato-brown', category: 'marble', colors: [{ segment: 'beige' }],
  slabs: [{ width_cm: 300, length_cm: 200, price_per_m2_rub: 11000, price_total_rub: 66000 }],
};

const SCENARIOS = [
  {
    name: 'kitchen countertop, two simultaneous edge types + sink + cooktop + curb + backsplash, all options on',
    productKey: 'stoleshnitsa_kuhnya',
    values: {
      width: { value: '2000' }, length: { value: '600' },
      'edge-straight': { value: '2000' }, 'edge-chamfer': { value: '500' },
      'cut-sink-overlay': { value: '1' }, 'cut-cooktop': { value: '1' }, 'hole-mixer': { value: '1' },
      'extra-bortik': { value: '500' }, 'extra-fartuk-width': { value: '600' }, 'extra-fartuk-length': { value: '2000' },
      'opt-complex': { checked: true }, 'opt-polish': { checked: true }, 'opt-install': { checked: true },
    },
  },
  {
    name: 'windowsill: edge work but no countertop extras',
    productKey: 'podokonnik',
    values: { width: { value: '1200' }, length: { value: '300' }, 'edge-round': { value: '1200' } },
  },
  {
    name: 'floor: no edge work, no countertop extras, all zero',
    productKey: 'pol',
    values: { width: { value: '3000' }, length: { value: '2000' } },
  },
];

SCENARIOS.forEach(({ name, productKey, values }) => {
  test(`legacy vs constructor-state pricing inputs match: ${name}`, () => {
    const doc = createFakeDoc(values);
    const product = PRODUCTS[productKey];

    const legacy = legacyBuildPricingInputs(doc, product);

    const state = ConstructorState.readConstructorState({ doc, selectedProductKey: productKey, product, stone, hasAdditionalWork });
    const fresh = ConstructorState.buildPricingInputs(state, {
      productRates: WORK_RATES[productKey], miscFlatSum: MISC_FLAT_SUM, miscRatePerM2: MISC_RATE_PER_M2,
      complexShapeMultiplier: COMPLEX_SHAPE_MULTIPLIER, countertopExtrasRates: COUNTERTOP_EXTRAS_RATES, getAdditionalWorkRate,
    });

    assert.deepEqual(fresh.rates, legacy.rates);
    assert.deepEqual(fresh.extraDimensions, legacy.extraDimensions);
    assert.deepEqual(fresh.extraLineItems, legacy.extraLineItems);

    const priceParams = {
      stone, widthM: state.dimensions.widthM, lengthM: state.dimensions.lengthM, productType: product.type,
      marginCm: SAW_MARGIN_CM, wasteFactor: AREA_WASTE_FACTOR, allowSeam: product.allowSeam !== false,
      installEnabled: state.options.installEnabled, polishEnabled: state.options.polishEnabled, complexEnabled: state.options.complexEnabled,
    };
    const legacyResult = Pricing.calculatePrice(Object.assign({}, priceParams, legacy));
    const freshResult = Pricing.calculatePrice(Object.assign({}, priceParams, fresh));
    assert.deepEqual(freshResult, legacyResult);
  });
});
```

- [ ] **Step 2: Run it**

Run: `node --test tests/pricing-equivalence.test.js`
Expected: PASS (3 tests) — this must pass now, before any HTML change, proving the new path already matches today's behavior in isolation.

- [ ] **Step 3: Commit**

```bash
git add tests/pricing-equivalence.test.js
git commit -m "test: pin price-equivalence between legacy inline logic and constructor-state

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Refactor `calculate()` in `sayanmramor-calculator.html` to use `ConstructorState`

**Files:**
- Modify: `sayanmramor-calculator.html` (inline `<script>`, the `calculate()` function and its supporting read-helper functions, roughly lines 924–1255 per the current file)
- Add: `<script src="constructor-state.js"></script>` before the inline `<script>` block

**Interfaces:**
- Consumes: `ConstructorState.readConstructorState`, `ConstructorState.buildPricingInputs` (Tasks 2-3).
- Produces: no new exports — this task only changes `calculate()`'s internals. Its output (DOM text content, `Pricing.calculatePrice()` results) must be unchanged for every existing scenario.

- [ ] **Step 1: Add the script tag**

In `sayanmramor-calculator.html`, change:

```html
<script src="pricing.js"></script>
<script src="material-picker.js"></script>
<script src="product-types.js"></script>
<script src="rate-catalog.js"></script>
```

to:

```html
<script src="pricing.js"></script>
<script src="material-picker.js"></script>
<script src="product-types.js"></script>
<script src="rate-catalog.js"></script>
<script src="constructor-state.js"></script>
```

- [ ] **Step 2: Replace the parameter-assembly section of `calculate()`**

In the inline `<script>`, find:

```js
    const edgeResult = readLengthLineItems(EDGE_LINE_ITEMS);
    let extraLineItems = edgeResult.items;
    optionLabels.push(...edgeResult.labels);

    // Defensive zeroing: ...
    let extraDimensions = { bortikLengthM: 0, fartukAreaM2: 0, ostrovAreaM2: 0 };
    if (product.supportsCountertopExtras) {
      ...
      const areaResult = readAreaLineItems(AREA_LINE_ITEMS, product);
      extraLineItems = extraLineItems.concat(areaResult.items);
      optionLabels.push(...areaResult.labels);
    }

    const productRates = WORK_RATES[selectedProductKey];
    const rates = {
      fabricationRatePerM2: productRates.fabricationRatePerM2,
      installationRatePerM2: productRates.installationRatePerM2,
      polishRatePerM2: productRates.polishRatePerM2,
      miscFlatSum: MISC_FLAT_SUM,
      miscRatePerM2: MISC_RATE_PER_M2,
      complexShapeMultiplier: COMPLEX_SHAPE_MULTIPLIER,
      bortikRatePerM: COUNTERTOP_EXTRAS_RATES.bortikRatePerM,
      fartukRatePerM2: COUNTERTOP_EXTRAS_RATES.fartukRatePerM2,
      ostrovRatePerM2: COUNTERTOP_EXTRAS_RATES.ostrovRatePerM2
    };
```

with:

```js
    const constructorState = ConstructorState.readConstructorState({
      doc: document, selectedProductKey, product, stone, hasAdditionalWork,
    });

    const { rates, extraLineItems, extraDimensions } = ConstructorState.buildPricingInputs(constructorState, {
      productRates: WORK_RATES[selectedProductKey],
      miscFlatSum: MISC_FLAT_SUM, miscRatePerM2: MISC_RATE_PER_M2,
      complexShapeMultiplier: COMPLEX_SHAPE_MULTIPLIER,
      countertopExtrasRates: COUNTERTOP_EXTRAS_RATES,
      getAdditionalWorkRate,
    });

    // Breakdown labels are UI text, not pricing -- built from the same
    // constructorState so the displayed text and the priced quantities can
    // never drift apart.
    constructorState.edgeLineItems.forEach(item => {
      const labels = { straight: 'кромка прямая', figured: 'кромка фигурная/сложная', rounding: 'скругление', bevel: 'скос/фаска', 'stone-wrap': 'подгиб камнем' };
      optionLabels.push(`${labels[item.type]}: ${mmToM(item.lengthMm).toFixed(2)} м.п.`);
    });
    if (constructorState.curbLengthM > 0) optionLabels.push(`бортик: ${constructorState.curbLengthM} м.п.`);
    const fartukAreaM2 = constructorState.backsplash.widthM * constructorState.backsplash.lengthM;
    if (fartukAreaM2 > 0) optionLabels.push(`фартук: ${fartukAreaM2.toFixed(2)} м²`);
    const ostrovAreaM2 = constructorState.island.standard.widthM * constructorState.island.standard.lengthM;
    if (ostrovAreaM2 > 0) optionLabels.push(`остров/полуостров: ${ostrovAreaM2.toFixed(2)} м²`);
    const QUANTITY_LABELS = [
      [constructorState.sinkCounts.overlay, 'вырез под накладную раковину'],
      [constructorState.sinkCounts.undermount, 'вырез под подшивную раковину'],
      [constructorState.sinkCounts.integrated, 'вырез под интегрированную раковину'],
      [constructorState.cooktopCount, 'вырез под варочную панель'],
      [constructorState.holeCounts.mixer, 'отверстие под смеситель'],
      [constructorState.holeCounts.socket, 'отверстие под розетку'],
      [constructorState.holeCounts.dispenser, 'отверстие под дозатор'],
    ];
    QUANTITY_LABELS.forEach(([qty, label]) => { if (qty > 0) optionLabels.push(`${label}: ${qty} шт.`); });
    const AREA_LABELS = [
      [constructorState.island.figured.widthM * constructorState.island.figured.lengthM, 'остров фигурный'],
      [constructorState.wallPanel.widthM * constructorState.wallPanel.lengthM, 'стеновая панель'],
      [constructorState.barCounter.standard.widthM * constructorState.barCounter.standard.lengthM, 'барная стойка стандартная'],
      [constructorState.barCounter.complex.widthM * constructorState.barCounter.complex.lengthM, 'барная стойка сложная'],
    ];
    AREA_LABELS.forEach(([areaM2, label]) => { if (areaM2 > 0) optionLabels.push(`${label}: ${areaM2.toFixed(2)} м²`); });
```

Note: `stone` at this point in `calculate()` is already resolved (`const stone = STONES_BY_ID[selectedStoneId];`, a few lines above this block) — pass that existing variable straight into `readConstructorState`. The now-unused `readLengthLineItems`, `readQuantityLineItems`, `readAreaLineItems`, `EDGE_LINE_ITEMS`, `QUANTITY_LINE_ITEMS`, `AREA_LINE_ITEMS` function/constant definitions and their `.addEventListener` wiring further down in the file are deleted in Step 3 below (they're replaced by a single generic listener).

- [ ] **Step 3: Replace the removed helpers' event wiring**

The `EDGE_LINE_ITEMS.forEach(...)`, `QUANTITY_LINE_ITEMS.forEach(...)`, and `AREA_LINE_ITEMS.forEach(...)` listener-registration blocks near the bottom of the script (each calling `.addEventListener('input', calculate)`) stay conceptually the same, but must attach to the raw element ids directly now that the line-item config arrays are gone. Replace those three `.forEach` blocks with:

```js
  [
    'edge-straight', 'edge-figured', 'edge-round', 'edge-chamfer', 'edge-stonefold',
    'cut-sink-overlay', 'cut-sink-undermount', 'cut-sink-integrated', 'cut-cooktop',
    'hole-mixer', 'hole-socket', 'hole-dispenser',
    'extra-ostrov-figured-width', 'extra-ostrov-figured-length',
    'extra-wallpanel-width', 'extra-wallpanel-length',
    'extra-bar-standard-width', 'extra-bar-standard-length',
    'extra-bar-complex-width', 'extra-bar-complex-length',
  ].forEach(id => document.getElementById(id).addEventListener('input', calculate));
```

Delete the now-dead `readLengthLineItems`, `readQuantityLineItems`, `readAreaLineItems` function definitions and the `EDGE_LINE_ITEMS`/`QUANTITY_LINE_ITEMS`/`AREA_LINE_ITEMS` constant declarations. Keep `extraBortikInput`/`extraFartukWidthInput`/etc. and their existing `[el1, el2, ...].forEach(el => el.addEventListener('input', calculate))` block as-is — those already attach by direct element reference, not through a removed config array.

- [ ] **Step 4: Run the full existing test suite**

Run: `node --test tests/`
Expected: PASS, same test count as before this task (this task doesn't add or remove any `tests/*.test.js` file — `pricing.test.js`, `product-types.test.js`, `rate-catalog.test.js`, `material-picker.test.js`, `pricing-product-types-integration.test.js` all pass unmodified, since none of them exercise the HTML file at all).

- [ ] **Step 5: Re-run the equivalence test specifically**

Run: `node --test tests/pricing-equivalence.test.js`
Expected: PASS (3 tests) — unchanged from Task 4, confirming the transcribed-legacy reference still matches; this file is not touched by this task.

- [ ] **Step 6: Manual smoke test in the browser**

Start the dev server (`python -m http.server 8934` per `.claude/launch.json`, or the project's `preview_start` tool with the `static-server` config) and open `sayanmramor-calculator.html`. For each of the 3 scenarios in Task 4's `SCENARIOS` array, set the same field values by hand in the real form and confirm the displayed price and breakdown text match what they showed **before this task's edit** (compare against a `git stash`/`git show HEAD~1:sayanmramor-calculator.html` side-by-side check, or simply trust the automated equivalence test plus a spot-check of one scenario). Confirm the browser console shows zero errors.

- [ ] **Step 7: Commit**

```bash
git add sayanmramor-calculator.html
git commit -m "refactor: calculate() reads ConstructorState instead of scattered DOM reads

Price output is unchanged -- verified by tests/pricing-equivalence.test.js
and the full existing test suite, both passing unmodified.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: `visualizer/constants.js`

**Files:**
- Create: `visualizer/constants.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `VISUAL_FALLBACK_THICKNESS_M`, `VISUAL_FALLBACK_SINK_INSET_M` (how far from the front edge a fallback-placed sink/cooktop marker is drawn), `CAMERA_PRESETS` (relative direction vectors for top/front/side/iso, used by Task 11). Consumed by Task 7 (`geometry-model.js`) and Task 11 (`three-scene.js`).

- [ ] **Step 1: Write `visualizer/constants.js`**

```js
// visualizer/constants.js
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.VisualizerConstants = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {

  // Rendering-only constants. None of these describe a real product
  // property -- see docs/superpowers/specs/2026-09-21-3d-visualizer-design.md
  // ("Thickness: real data vs. visual fallback"). Never display these
  // numbers to the client as if they were a real spec.
  const VISUAL_FALLBACK_THICKNESS_M = 0.04;
  const VISUAL_FALLBACK_SINK_INSET_M = 0.15;

  const CAMERA_PRESETS = {
    top:   { direction: [0, 1, 0.0001] }, // near-vertical avoids a degenerate up-vector
    front: { direction: [0, 0.3, 1] },
    side:  { direction: [1, 0.3, 0] },
    iso:   { direction: [1, 0.8, 1] },
  };

  return { VISUAL_FALLBACK_THICKNESS_M, VISUAL_FALLBACK_SINK_INSET_M, CAMERA_PRESETS };
});
```

- [ ] **Step 2: Write a smoke test**

```js
// tests/visualizer-constants.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { VISUAL_FALLBACK_THICKNESS_M, CAMERA_PRESETS } = require('../visualizer/constants.js');

test('VISUAL_FALLBACK_THICKNESS_M is a small positive number', () => {
  assert.equal(typeof VISUAL_FALLBACK_THICKNESS_M, 'number');
  assert.ok(VISUAL_FALLBACK_THICKNESS_M > 0 && VISUAL_FALLBACK_THICKNESS_M < 0.2);
});

test('CAMERA_PRESETS has all 4 required views', () => {
  assert.deepEqual(Object.keys(CAMERA_PRESETS).sort(), ['front', 'iso', 'side', 'top']);
});
```

- [ ] **Step 3: Run it**

Run: `node --test tests/visualizer-constants.test.js`
Expected: PASS (2 tests)

- [ ] **Step 4: Commit**

```bash
git add visualizer/constants.js tests/visualizer-constants.test.js
git commit -m "feat: add visualizer rendering-only constants

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: `visualizer/geometry-model.js`

**Files:**
- Create: `visualizer/geometry-model.js`
- Test: `tests/visualizer-geometry-model.test.js`

**Interfaces:**
- Consumes: a `ConstructorState` (Task 2), `VisualizerConstants` (Task 6).
- Produces: `buildGeometryModel(state)` returning:

```js
{
  shape: 'straight',
  widthM, lengthM,        // from state.dimensions, unchanged
  visualThicknessM,        // VISUAL_FALLBACK_THICKNESS_M, always -- state.dimensions.thicknessM is never read here
  edge: { type, lengthMm }, // passthrough of state.edge
  sink: null | { type, count, placement: { xM, yM, source: 'fallback' } },
  cooktop: null | { count, placement: { xM, yM, source: 'fallback' } },
}
```

Consumed by Task 11 (`three-scene.js`).

- [ ] **Step 1: Write the failing tests**

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/visualizer-geometry-model.test.js`
Expected: FAIL — `Cannot find module '../visualizer/geometry-model.js'`

- [ ] **Step 3: Implement**

```js
// visualizer/geometry-model.js
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.GeometryModel = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {

  const { VISUAL_FALLBACK_THICKNESS_M, VISUAL_FALLBACK_SINK_INSET_M } =
    (typeof module !== 'undefined' && module.exports) ? require('./constants.js') : root.VisualizerConstants;

  function resolvePlacement(position, widthM) {
    if (position) {
      return { xM: position.xMm / 1000, yM: position.yMm / 1000, source: 'real' };
    }
    // No real coordinate data exists anywhere in the calculator yet -- this
    // is a demonstration-only point, tagged so the renderer can draw it
    // differently from a confirmed position (see spec: "Sink/cooktop:
    // fallback placement is visually disclosed, not just undocumented").
    return { xM: widthM / 2, yM: VISUAL_FALLBACK_SINK_INSET_M, source: 'fallback' };
  }

  function buildGeometryModel(state) {
    const { widthM, lengthM } = state.dimensions;
    const sinkState = state.additionalWorks.sink;
    const cooktopState = state.additionalWorks.cooktop;

    return {
      shape: 'straight',
      widthM, lengthM,
      visualThicknessM: VISUAL_FALLBACK_THICKNESS_M,
      edge: { type: state.edge.type, lengthMm: state.edge.lengthMm },
      sink: sinkState.count > 0 ? {
        type: sinkState.type, count: sinkState.count,
        placement: resolvePlacement(sinkState.position, widthM),
      } : null,
      cooktop: cooktopState.count > 0 ? {
        count: cooktopState.count,
        placement: resolvePlacement(cooktopState.position, widthM),
      } : null,
    };
  }

  return { buildGeometryModel };
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/visualizer-geometry-model.test.js`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add visualizer/geometry-model.js tests/visualizer-geometry-model.test.js
git commit -m "feat: add buildGeometryModel, pure ConstructorState -> geometry transform

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 8: `visualizer/material-adapter.js`

**Files:**
- Create: `visualizer/material-adapter.js`
- Test: `tests/visualizer-material-adapter.test.js`

**Interfaces:**
- Consumes: a `stone` record (`{ category, colors: [{segment}], image }`, from `data/slabs.json` shape) and a `bookmatchMode` string.
- Produces: `resolveMaterial(stone, bookmatchMode)` returning `{ fallbackColor, roughness, metalness, textureUrl: null, bookmatchMode }`. Consumed by Task 11 (`three-scene.js`), which must never read `stone` directly.

- [ ] **Step 1: Write the failing tests**

```js
// tests/visualizer-material-adapter.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveMaterial } = require('../visualizer/material-adapter.js');

test('resolveMaterial returns a marble-ish appearance for category "marble"', () => {
  const result = resolveMaterial({ category: 'marble', colors: [{ segment: 'beige' }] }, 'none');
  assert.equal(typeof result.fallbackColor, 'string');
  assert.ok(/^#[0-9a-f]{6}$/i.test(result.fallbackColor));
  assert.ok(result.roughness >= 0 && result.roughness <= 1);
  assert.ok(result.metalness >= 0 && result.metalness <= 1);
});

test('resolveMaterial returns a darker fallback color for a dark color segment than a light one, same category', () => {
  const dark = resolveMaterial({ category: 'granite', colors: [{ segment: 'black' }] }, 'none');
  const light = resolveMaterial({ category: 'granite', colors: [{ segment: 'white' }] }, 'none');
  const luminance = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    return ((n >> 16) & 0xff) + ((n >> 8) & 0xff) + (n & 0xff);
  };
  assert.ok(luminance(dark.fallbackColor) < luminance(light.fallbackColor));
});

test('resolveMaterial falls back to a generic grey for an unknown category', () => {
  const result = resolveMaterial({ category: 'unobtainium', colors: [] }, 'none');
  assert.equal(typeof result.fallbackColor, 'string');
});

test('resolveMaterial falls back to a generic grey when stone is null (no material selected yet)', () => {
  const result = resolveMaterial(null, 'none');
  assert.equal(typeof result.fallbackColor, 'string');
  assert.equal(result.textureUrl, null);
});

test('resolveMaterial.textureUrl is always null today (no real seamless textures exist yet)', () => {
  const result = resolveMaterial({ category: 'marble', colors: [{ segment: 'beige' }], image: 'delicato-brown.jpg' }, 'none');
  assert.equal(result.textureUrl, null);
});

test('resolveMaterial passes bookmatchMode through unchanged', () => {
  const result = resolveMaterial({ category: 'marble', colors: [] }, 'mirrored');
  assert.equal(result.bookmatchMode, 'mirrored');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/visualizer-material-adapter.test.js`
Expected: FAIL — `Cannot find module '../visualizer/material-adapter.js'`

- [ ] **Step 3: Implement**

```js
// visualizer/material-adapter.js
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.MaterialAdapter = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {

  const GENERIC_FALLBACK = { fallbackColor: '#b8b3ac', roughness: 0.5, metalness: 0.05 };

  // Coarse, deliberately approximate lookup -- there is no per-stone
  // appearance data in the catalog beyond category/color segment. See
  // spec: real texture wiring is reserved (textureUrl), not implemented.
  const CATEGORY_BASE = {
    marble:  { roughness: 0.25, metalness: 0.02 },
    granite: { roughness: 0.45, metalness: 0.05 },
    quartz:  { roughness: 0.15, metalness: 0.0 },
    travertine: { roughness: 0.55, metalness: 0.0 },
  };

  const COLOR_HEX = {
    beige: '#e8ddc7', white: '#f2f0ec', black: '#2b2b2b', grey: '#8f8c88',
    brown: '#6b5744', cream: '#eee5d3', gold: '#c9a86a',
  };

  function resolveMaterial(stone, bookmatchMode) {
    if (!stone) {
      return Object.assign({ textureUrl: null, bookmatchMode }, GENERIC_FALLBACK);
    }
    const base = CATEGORY_BASE[stone.category] || { roughness: GENERIC_FALLBACK.roughness, metalness: GENERIC_FALLBACK.metalness };
    const colorSegment = (stone.colors && stone.colors[0] && stone.colors[0].segment) || null;
    const fallbackColor = COLOR_HEX[colorSegment] || GENERIC_FALLBACK.fallbackColor;

    return {
      fallbackColor,
      roughness: base.roughness,
      metalness: base.metalness,
      textureUrl: null, // stone.image is a photo of one slab, not a tileable texture -- not used as a map
      bookmatchMode,
    };
  }

  return { resolveMaterial };
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/visualizer-material-adapter.test.js`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add visualizer/material-adapter.js tests/visualizer-material-adapter.test.js
git commit -m "feat: add resolveMaterial, stone record -> MaterialDescriptor adapter

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 9: `visualizer/webgl-support.js`

**Files:**
- Create: `visualizer/webgl-support.js`
- Test: `tests/visualizer-webgl-support.test.js`

**Interfaces:**
- Consumes: `document` (for `document.createElement('canvas')`).
- Produces: `isWebglAvailable(doc)` — `doc` defaults to the global `document` when omitted, but is injectable for tests. Consumed by Task 12 (HTML wiring), which gates whether any `visualizer/*` code runs at all.

- [ ] **Step 1: Write the failing tests**

```js
// tests/visualizer-webgl-support.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { isWebglAvailable } = require('../visualizer/webgl-support.js');

function fakeDoc(contextResult) {
  return {
    createElement: () => ({
      getContext: () => contextResult,
    }),
  };
}

test('isWebglAvailable returns true when the canvas yields a webgl context', () => {
  assert.equal(isWebglAvailable(fakeDoc({ someWebglApi: true })), true);
});

test('isWebglAvailable returns false when getContext returns null (no WebGL support)', () => {
  assert.equal(isWebglAvailable(fakeDoc(null)), false);
});

test('isWebglAvailable returns false, not throws, when createElement itself throws', () => {
  const doc = { createElement: () => { throw new Error('no canvas in this environment'); } };
  assert.equal(isWebglAvailable(doc), false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/visualizer-webgl-support.test.js`
Expected: FAIL — `Cannot find module '../visualizer/webgl-support.js'`

- [ ] **Step 3: Implement**

```js
// visualizer/webgl-support.js
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.WebglSupport = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {

  function isWebglAvailable(doc) {
    try {
      const d = doc || document;
      const canvas = d.createElement('canvas');
      const ctx = canvas.getContext('webgl2') || canvas.getContext('webgl');
      return !!ctx;
    } catch (e) {
      return false;
    }
  }

  return { isWebglAvailable };
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/visualizer-webgl-support.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add visualizer/webgl-support.js tests/visualizer-webgl-support.test.js
git commit -m "feat: add isWebglAvailable feature-detection helper

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 10: Vendor Three.js

**Files:**
- Create: `vendor/three/three.module.js`, `vendor/three/OrbitControls.js`, `vendor/three/VERSION.txt`

**Interfaces:**
- Consumes: nothing (external download).
- Produces: local ES modules consumed by Task 11 (`three-scene.js`) via relative `import`.

- [ ] **Step 1: Download the pinned build**

Pin a specific, recent release — `r160` (Three.js switched to `0.16x` version numbers matching the old `r16x` revision numbers; either naming refers to the same release train). Fetch the two files needed for a module-based, no-bundler setup:

```bash
mkdir -p vendor/three
curl -fsSL -o vendor/three/three.module.js https://unpkg.com/three@0.160.0/build/three.module.js
curl -fsSL -o vendor/three/OrbitControls.js https://unpkg.com/three@0.160.0/examples/jsm/controls/OrbitControls.js
```

`unpkg.com` is used here only as a one-time download source at vendoring time — the resulting files are committed to the repo and the calculator never fetches anything from `unpkg.com` (or any CDN) at runtime.

- [ ] **Step 2: Fix `OrbitControls.js`'s import path**

`OrbitControls.js` as published imports Three via a bare specifier:

```js
import { ... } from 'three';
```

Since there's no bundler/import-map resolving bare specifiers here, edit that line to a relative import:

```js
import { ... } from '../vendor/three/three.module.js';
```

(Keep the exact list of named imports `OrbitControls.js` already declares — only change the module specifier string, nothing else in the file.)

- [ ] **Step 3: Record the version**

```
// vendor/three/VERSION.txt
three.js 0.160.0
Source: https://unpkg.com/three@0.160.0/
License: MIT (see https://github.com/mrdoob/three.js/blob/dev/LICENSE)
Vendored: 2026-09-21
Files: three.module.js (core), OrbitControls.js (examples/jsm/controls, import path adjusted to load three.module.js relatively instead of via a bare "three" specifier)
```

- [ ] **Step 4: Verify the files load without a network request**

Manual check: open a throwaway local HTML file with `<script type="module">import * as THREE from './vendor/three/three.module.js'; console.log(THREE.REVISION);</script>`, serve it via the project's static server, and confirm the console prints a revision number with the browser's network tab showing no request to any external domain.

- [ ] **Step 5: Commit**

```bash
git add vendor/three/three.module.js vendor/three/OrbitControls.js vendor/three/VERSION.txt
git commit -m "chore: vendor three.js 0.160.0 locally (three.module.js + OrbitControls)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 11: `visualizer/three-scene.js`

**Files:**
- Create: `visualizer/three-scene.js`

**Interfaces:**
- Consumes: `vendor/three/three.module.js`, `vendor/three/OrbitControls.js` (Task 10); a `ProductGeometryModel` (Task 7) and `MaterialDescriptor` (Task 8) at call time.
- Produces (attached to `window.ThreeScene` since this file is an ES module, not UMD — see Global Constraints):
  - `init(canvasEl)` — creates renderer/scene/camera/`OrbitControls` bound to `canvasEl`, starts the render loop.
  - `update(geometryModel, materialDescriptor)` — updates (not rebuilds, where possible) the countertop mesh's dimensions and material.
  - `setView(presetName)` — animates the camera to one of `CAMERA_PRESETS` (`top`/`front`/`side`/`iso`), framing the current model's bounding box.
  - `resetView()` — returns to the default (`iso`) camera position.
  - `dispose()` — stops the render loop, disposes geometries/materials/renderer.

This file is not unit-testable in Node (it requires a real WebGL context); it's verified manually in Task 13.

- [ ] **Step 1: Implement**

```js
// visualizer/three-scene.js
import * as THREE from '../vendor/three/three.module.js';
import { OrbitControls } from '../vendor/three/OrbitControls.js';

let renderer, scene, camera, controls, countertopMesh, currentCanvas, resizeObserver;
let frameId = null;

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
  if (countertopMesh) {
    scene.remove(countertopMesh);
    countertopMesh.geometry.dispose();
    countertopMesh.material.dispose();
  }
  countertopMesh = buildMesh(geometryModel, materialDescriptor);
  scene.add(countertopMesh);

  const distance = frameCameraOnModel(geometryModel);
  controls.target.set(0, 0, 0);
  if (camera.position.length() < 0.01) camera.position.set(distance, distance * 0.8, distance);
  controls.update();
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
  setView('iso');
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
}

const ThreeScene = { init, update, setView, resetView, dispose };
window.ThreeScene = ThreeScene;
export default ThreeScene;
```

- [ ] **Step 2: Manual verification (no automated test — WebGL requires a real browser)**

Using the project's dev server and the Browser tool (or a real browser), build a throwaway test page (e.g. `visualizer/manual-test.html`, not committed — delete it before Step 3's commit) that loads `<script src="constants.js"></script>` (classic, so `window.VisualizerConstants` exists — `setView` reads `CAMERA_PRESETS` from it) followed by `<script type="module">` importing `./three-scene.js` as its default export, with a `<canvas>` in the page. Call `ThreeScene.init(canvas)` then `ThreeScene.update({ widthM: 2, lengthM: 0.6, visualThicknessM: 0.04, edge: {type:null,lengthMm:null}, sink:null, cooktop:null }, { fallbackColor: '#e8ddc7', roughness: 0.25, metalness: 0.02 })`:

1. A beige box roughly 2×0.6 renders, proportioned like a countertop (wide/shallow, not a cube).
2. Left-drag rotates the view; scroll/pinch zooms; right-drag (or two-finger drag) pans.
3. Calling `ThreeScene.setView('top')` shows the box from directly above; `'front'`, `'side'`, `'iso'` each produce a visibly different, sensible angle.
4. Calling `ThreeScene.resetView()` returns to the isometric angle.
5. Resizing the browser window resizes the canvas without stretching/distorting the box.
6. Calling `ThreeScene.update(...)` again with different `widthM`/`lengthM` visibly resizes the box without a visible flicker/rebuild of the whole scene (lighting/background stay stable).
7. Browser console (`read_console_messages` if using the Claude Browser tool) shows zero errors or warnings throughout.
8. Calling `ThreeScene.dispose()` and checking `renderer.info` beforehand vs. confirming no further frames render afterward (e.g. rotate the now-disposed canvas and confirm nothing responds).

- [ ] **Step 3: Commit**

```bash
git add visualizer/three-scene.js
git commit -m "feat: add ThreeScene, the sole Three.js-facing rendering module

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 12: Wire the 3D panel into `sayanmramor-calculator.html`

**Files:**
- Modify: `sayanmramor-calculator.html`

**Interfaces:**
- Consumes: `WebglSupport.isWebglAvailable`, `GeometryModel.buildGeometryModel`, `MaterialAdapter.resolveMaterial`, `window.ThreeScene` (Tasks 6-11), and the `constructorState` already built in `calculate()` (Task 5).
- Produces: nothing new for other tasks to consume — this is the final integration point.

- [ ] **Step 1: Add markup**

Inside `<div class="card">`, after the closing `</div>` of `result-panel` and before the closing `</div>` of `.card`, add a third grid cell:

```html
    <div class="viewer-panel" id="viewerPanel" hidden>
      <div class="viewer-canvas-wrap">
        <canvas id="viewerCanvas"></canvas>
      </div>
      <div class="viewer-controls">
        <button type="button" data-view="top">Сверху</button>
        <button type="button" data-view="front">Спереди</button>
        <button type="button" data-view="side">Сбоку</button>
        <button type="button" data-view="iso">Изометрия</button>
        <button type="button" id="viewerReset">Сбросить вид</button>
      </div>
    </div>
```

- [ ] **Step 2: Add CSS**

Add to the `<style>` block, near `.card`'s existing rules:

```css
  .card { grid-template-columns: 1fr 1fr 1fr; }
  .viewer-panel { grid-column: 1 / -1; display: flex; flex-direction: column; gap: 8px; }
  .viewer-canvas-wrap { width: 100%; aspect-ratio: 4 / 3; background: #eee; border-radius: 4px; overflow: hidden; }
  .viewer-canvas-wrap canvas { width: 100%; height: 100%; display: block; touch-action: none; }
  .viewer-controls { display: flex; gap: 6px; flex-wrap: wrap; }
  .viewer-controls button {
    padding: 6px 12px; border: 1px solid #ddd; border-radius: 3px; background: #fafafa;
    font-size: 12px; cursor: pointer;
  }
  .viewer-controls button:hover { border-color: #bbb; }

  /* Desktop: form / result / 3D side by side, 3D on the right. */
  @media (min-width: 900px) {
    .card { grid-template-columns: 1fr 1fr 1fr; }
    .viewer-panel { grid-column: 3; grid-row: 1; order: 3; }
  }
  /* Mobile (existing single-column breakpoint at 700px): 3D goes near the
     top, above the form, per spec. */
  @media (max-width: 700px) {
    .card { grid-template-columns: 1fr; }
    .viewer-panel { order: -1; }
  }
```

- [ ] **Step 3: Load the new scripts**

After the existing `<script src="constructor-state.js"></script>` (added in Task 5) and before the inline `<script>` block:

```html
<script src="visualizer/constants.js"></script>
<script src="visualizer/geometry-model.js"></script>
<script src="visualizer/material-adapter.js"></script>
<script src="visualizer/webgl-support.js"></script>
<script type="module" src="visualizer/three-scene.js"></script>
```

- [ ] **Step 4: Mount the viewer and hook it into `calculate()`**

In the inline `<script>`, near the other top-level `const`s, add:

```js
  const viewerPanel = document.getElementById('viewerPanel');
  const viewerCanvas = document.getElementById('viewerCanvas');
  let viewerReady = false;

  function mountViewerIfSupported() {
    if (!WebglSupport.isWebglAvailable()) return;
    if (!window.ThreeScene) return; // see DOMContentLoaded note below
    viewerPanel.hidden = false;
    window.ThreeScene.init(viewerCanvas);
    viewerReady = true;
    document.querySelectorAll('.viewer-controls [data-view]').forEach(btn => {
      btn.addEventListener('click', () => window.ThreeScene.setView(btn.dataset.view));
    });
    document.getElementById('viewerReset').addEventListener('click', () => window.ThreeScene.resetView());
  }
  // A `<script type="module">` (visualizer/three-scene.js) is always deferred
  // by the HTML spec -- it executes after the document finishes parsing but
  // BEFORE `DOMContentLoaded` fires, even though it's declared before this
  // classic, non-deferred inline script (which runs immediately, at parse
  // time, before the module has had a chance to run). Do NOT call
  // mountViewerIfSupported() directly here, and do NOT poll for
  // window.ThreeScene with a recursive Promise.resolve().then() -- a
  // microtask that re-schedules itself every time it finds ThreeScene
  // missing never yields to the task queue the module's own execution is
  // waiting on, so it hangs the page instead of just being slow. Waiting for
  // DOMContentLoaded is both correct (module execution is spec-guaranteed to
  // finish before it fires) and simple:
  document.addEventListener('DOMContentLoaded', mountViewerIfSupported);
```

At the end of `calculate()`, right before its final closing `}` (after `updatedAtOut.textContent = ...`), add:

```js
    if (viewerReady) {
      const geometryModel = GeometryModel.buildGeometryModel(constructorState);
      const materialDescriptor = MaterialAdapter.resolveMaterial(constructorState.stone, constructorState.bookmatchMode);
      window.ThreeScene.update(geometryModel, materialDescriptor);
    }
```

Because `calculate()` returns early in several branches (missing dimensions, no product, no stone, out-of-stock, no fitting slab) before reaching its normal end, and the 3D preview should still show *something* reasonable whenever there are valid dimensions even if price can't be computed yet, add the same 4-line block immediately after the existing `dimError.style.display = 'none';` line (right after the width/length validity check passes) as well.

To avoid running `readConstructorState()` twice, move the call up to immediately after `dimError.style.display = 'none';`, before the `if (!selectedProductKey)` early return. At that point `selectedStoneId` may still be `null` (the `const stone = STONES_BY_ID[selectedStoneId];` line hasn't executed yet at this point in the function), so resolve the stone inline instead of reusing that later declaration:

```js
    dimError.style.display = 'none';

    const constructorState = ConstructorState.readConstructorState({
      doc: document, selectedProductKey, product,
      stone: selectedStoneId ? STONES_BY_ID[selectedStoneId] : null,
      hasAdditionalWork,
    });
    if (viewerReady) {
      const geometryModel = GeometryModel.buildGeometryModel(constructorState);
      const materialDescriptor = MaterialAdapter.resolveMaterial(constructorState.stone, constructorState.bookmatchMode);
      window.ThreeScene.update(geometryModel, materialDescriptor);
    }

    if (!selectedProductKey) {
```

`readConstructorState` already tolerates `product: null` and `stone: null` (Task 2 covers this: capabilities become `null`, every capability-gated field zeroes safely) — this is exactly why it's safe to call before the product/stone existence checks below it. Delete the original `const constructorState = ConstructorState.readConstructorState(...)` call and its accompanying `if (viewerReady) { ... }` block that Task 5 placed later in the function (just before the `rates`/`extraLineItems`/`extraDimensions` destructuring) — both are now redundant with this single earlier call, which the rest of the function (including the `ConstructorState.buildPricingInputs(constructorState, ...)` call from Task 5) continues to reference by the same `constructorState` variable name.

- [ ] **Step 5: Manual verification**

1. Open the calculator via the dev server. With no product/material/dimensions selected, confirm the 3D panel stays hidden (or shows an empty/neutral scene) and the rest of the page behaves exactly as before.
2. Select a product, a material, and enter width/length. The 3D panel appears with a box roughly matching the entered proportions.
3. Change width or length — the box visibly resizes without a full page reload or visible flicker.
4. Open the material picker and choose a different stone — the box's color visibly changes.
5. Click each of the 4 view-preset buttons and "Сбросить вид" — camera moves as expected each time.
6. Resize the browser window and confirm the canvas resizes without distortion.
7. Check the console (`read_console_messages`) — zero errors.

- [ ] **Step 6: Commit**

```bash
git add sayanmramor-calculator.html
git commit -m "feat: wire the 3D viewer panel into the calculator, live-updating

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 13: WebGL-fallback verification and full regression pass

**Files:** none modified — verification only.

- [ ] **Step 1: Automated regression run**

Run: `node --test tests/`
Expected: PASS, every test file including `tests/pricing-equivalence.test.js`, `tests/constructor-state.test.js`, `tests/visualizer-*.test.js`, and all pre-existing test files (`pricing.test.js`, `product-types.test.js`, `rate-catalog.test.js`, `material-picker.test.js`, `pricing-product-types-integration.test.js`).

- [ ] **Step 2: Simulate WebGL unavailability**

Using the Browser tool, run this before the page's scripts execute (or immediately after load, before any calculation) to force `isWebglAvailable()` to return false:

```js
HTMLCanvasElement.prototype.getContext = function () { return null; };
```

Reload the calculator with this override active (e.g. via the browser tool's `javascript_tool`, injected then the page reloaded with the override re-applied before load — or simpler: temporarily monkey-patch by opening the page, running the override, then triggering `calculate()` again by touching a field). Confirm:
1. `#viewerPanel` never becomes visible (`hidden` stays `true`).
2. Selecting a product/material/dimensions still computes and displays a price exactly as in Task 5's manual smoke test.
3. Console shows zero errors (specifically: no "Cannot read property of undefined" from `window.ThreeScene` being referenced before it exists — `mountViewerIfSupported()` returns early on the `isWebglAvailable()` check before ever touching `window.ThreeScene`).

- [ ] **Step 3: Mobile viewport check**

Using the Browser tool's `resize_window` with the `mobile` preset, reload the calculator, and confirm: the 3D panel (when WebGL is available) renders above the form fields (`order: -1` from Task 12's CSS), the canvas is usable with touch drag/pinch, and the rest of the form remains fully usable below it.

- [ ] **Step 4: Final price-output spot check against the pre-3D behavior**

Pick one scenario from Task 4 (`SCENARIOS[0]`, the kitchen countertop), enter the same values into the live calculator, and confirm the displayed price and breakdown text match the value asserted by `tests/pricing-equivalence.test.js` for that scenario (compute `Pricing.calculatePrice(...)` for that scenario in a scratch Node REPL if a byte-for-byte comparison against the displayed rounded/formatted price is needed).

- [ ] **Step 5: Record the outcome in the plan file itself**

No commit needed for this task beyond checking off its steps — it's a verification gate, not a code change. If any step fails, stop and fix the underlying task before proceeding (do not patch around it here).

---

## Deferred to later slices (explicitly not part of this plan)

L-shape geometry, sink/cooktop/curb/backsplash/island/bar-counter 3D rendering, real edge-profile bevels, real per-side edge assignment, real sink/cooktop coordinate input, bookmatch UV mirroring, real seamless stone textures. Each becomes its own follow-up plan once the vertical slice above is merged and confirmed working.
