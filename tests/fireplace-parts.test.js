// tests/fireplace-parts.test.js
//
// «Камины» as they are cut: ProductParts.buildJob turns the one fireplace
// plan (GeometryModel.fireplacePlan) into the pieces the slab layout
// (Pricing.planMaterial) places -- one piece per stone plate, with the face
// the plan priced, nothing measured twice; no pieces at all for sizes that
// are not in or do not make a real fireplace. No rates here yet.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createFakeDoc } = require('./helpers/fake-dom.js');
const FireplaceModel = require('../fireplace-model.js');
const ConstructorState = require('../constructor-state.js');
const ProductTypes = require('../product-types.js');
const ProductParts = require('../product-parts.js');
const Pricing = require('../pricing.js');
const GeometryModel = require('../visualizer/geometry-model.js');

const { PARAM_FIELDS, FORM_FIELD } = FireplaceModel;
const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, (msg || '') + ': ' + a + ' vs ' + b);

const portal = FireplaceModel.getTypeByKey('portal');
const cladding = FireplaceModel.getTypeByKey('cladding');
const podium = FireplaceModel.getTypeByKey('podium');

const SIZES = {
  'with-shelf': { openingWidth: 900, openingHeight: 700, pierWidth: 250, lintelHeight: 250, depth: 200, shelfProjection: 60 },
  'without-shelf': { openingWidth: 900, openingHeight: 700, pierWidth: 250, lintelHeight: 250, depth: 200 },
  cladding: { claddingWidth: 1600, claddingHeight: 2600, depth: 500, fireboxWidth: 900, fireboxHeight: 600, fireboxBottom: 400 },
  podium: { length: 1800, depth: 450, height: 200 },
};
const TYPE_OF_FORM = { 'with-shelf': portal, 'without-shelf': portal, cladding, podium };
const VARIANTS = Object.keys(SIZES);
const sizes = (formId, overridesMm) => Object.assign({}, SIZES[formId], overridesMm || {});

// The page -> ConstructorState (through fireplace-model), as for any product:
// the type in the subcategory select, the form, the sizes.
function stateOf(formId, overridesMm) {
  const type = TYPE_OF_FORM[formId];
  const values = { productSubcategory: { value: type.id }, [FORM_FIELD]: { value: formId } };
  Object.entries(sizes(formId, overridesMm)).forEach(([k, mm]) => { values[PARAM_FIELDS[k]] = { value: mm === '' ? '' : String(mm) }; });
  const doc = createFakeDoc(Object.assign({ width: { value: '650' }, length: { value: '2400' } }, values));
  return ConstructorState.readConstructorState({ doc, selectedProductKey: 'kaminy', product: ProductTypes.PRODUCTS.kaminy, stone: null, hasAdditionalWork: ProductTypes.hasAdditionalWork });
}
const jobOf = (formId, overridesMm) => ProductParts.buildJob(stateOf(formId, overridesMm));
function planOf(formId, overridesMm) {
  const cfg = stateOf(formId, overridesMm).productConfig.kaminy;
  const type = FireplaceModel.getType(cfg.typeId);
  return GeometryModel.fireplacePlan(type, FireplaceModel.getForm(type, cfg.form), cfg.params);
}

// Plenty of large slabs: every plate fits one whole, no seams.
const SLABS = Array.from({ length: 12 }, (_, i) => ({ article: 'S' + i, width_cm: 200, length_cm: 320, price_total_rub: 60000 + i }));
const layOut = job => Pricing.planMaterial({ slabs: SLABS, job, marginCm: ProductTypes.SAW_MARGIN_CM, usageLimit: ProductTypes.SLAB_USAGE_LIMIT });

// ---- valid fireplaces: one piece per plate ------------------------------------------

test('a valid fireplace of every variant is cut as pieces -- none missing', () => {
  VARIANTS.forEach(formId => {
    const job = jobOf(formId);
    assert.ok(job.pieces.length > 0, formId);
    assert.deepEqual(job.missing, [], formId);
  });
});

test('one piece per stone plate: the same keys, labels, faces, areas and counts as the plan', () => {
  VARIANTS.forEach(formId => {
    const plan = planOf(formId);
    const job = jobOf(formId);
    assert.equal(job.pieces.length, plan.plates.length, formId);
    job.pieces.forEach((p, i) => {
      const plate = plan.plates[i];
      assert.equal(p.key, plate.key);
      assert.equal(p.label, plate.label);
      assert.equal(p.lengthM, plate.lengthM, p.key);
      assert.equal(p.widthM, plate.widthM, p.key);
      assert.equal(p.areaM2, plate.areaM2, p.key + ': the plan\'s own number, not recomputed');
      assert.equal(p.count, plate.count, p.key);
      assert.equal(p.group, 'main', p.key);
      assert.equal(p.seam, true, p.key + ': a plate may be joined like any other piece');
    });
  });
});

test('the pieces\' area is the plan\'s area, the plates\' sum and the model\'s formula', () => {
  const expected = { 'with-shelf': 1.9352, 'without-shelf': 1.82, cladding: 6.22, podium: 1.35 };
  VARIANTS.forEach(formId => {
    const plan = planOf(formId);
    const job = jobOf(formId);
    const sum = job.pieces.reduce((s, p) => s + p.areaM2 * p.count, 0);
    close(sum, plan.areaM2, formId + ' pieces vs plan');
    close(plan.plates.reduce((s, p) => s + p.areaM2 * p.count, 0), plan.areaM2, formId + ' plates vs plan');
    close(job.mainAreaM2, plan.areaM2, formId + ' job area');
    close(job.mainAreaM2, expected[formId], formId);
    assert.equal(job.riserAreaM2, 0);
    assert.equal(job.extraAreaM2, 0);
  });
});

test('the 30 mm plate thickness never becomes stone to pay for', () => {
  VARIANTS.forEach(formId => {
    const job = jobOf(formId);
    const type = TYPE_OF_FORM[formId];
    const params = stateOf(formId).productConfig.kaminy.params;
    // The area is the faces only -- exactly the formula, with no edge strips.
    close(job.mainAreaM2, FireplaceModel.computeArea(type, FireplaceModel.getForm(type, formId), params).areaM2, formId);
    // No piece is a plate's edge (a strip as wide as the plate is thick).
    job.pieces.forEach(p => assert.ok(p.widthM > FireplaceModel.PLATE_THICKNESS_M, p.key + ' is a face, not an edge'));
  });
});

// ---- what each variant is made of ------------------------------------------------------

test('portal: the piers, their sides, the reveals, the lintel with its sides and underside -- all paid', () => {
  ['with-shelf', 'without-shelf'].forEach(formId => {
    const keys = jobOf(formId).pieces.map(p => p.key);
    ['portal-pier-left', 'portal-pier-right', 'portal-pier-side-left', 'portal-pier-side-right',
      'portal-opening-left', 'portal-opening-right', 'portal-lintel-front',
      'portal-lintel-side-left', 'portal-lintel-side-right', 'portal-lintel-bottom',
    ].forEach(k => assert.ok(keys.includes(k), formId + ' has ' + k));
    assert.equal(keys.length, 11, formId);
  });
  const reveal = jobOf('with-shelf').pieces.find(p => p.key === 'portal-opening-left');
  assert.deepEqual([reveal.lengthM, reveal.widthM], [0.7, 0.2]);   // H x d
  const underside = jobOf('with-shelf').pieces.find(p => p.key === 'portal-lintel-bottom');
  assert.deepEqual([underside.lengthM, underside.widthM], [0.9, 0.2]);   // W x d
});

test('portal with a shelf: the shelf is its own piece, (Wo + 2o) x (d + o)', () => {
  const pieces = jobOf('with-shelf').pieces;
  const shelf = pieces.filter(p => p.key === 'portal-shelf');
  assert.equal(shelf.length, 1);
  close(shelf[0].lengthM, 0.9 + 0.5 + 0.12);
  close(shelf[0].widthM, 0.2 + 0.06);
  assert.ok(!pieces.some(p => p.key === 'portal-lintel-top'));
});

test('portal without a shelf: the lintel\'s top is the piece of the plan, Wo x d', () => {
  const pieces = jobOf('without-shelf').pieces;
  const top = pieces.filter(p => p.key === 'portal-lintel-top');
  assert.equal(top.length, 1);
  close(top[0].lengthM, 1.4);
  close(top[0].widthM, 0.2);
  assert.ok(!pieces.some(p => p.key === 'portal-shelf'));
});

test('cladding: the front around the firebox and two sides -- the top stays open', () => {
  const keys = jobOf('cladding').pieces.map(p => p.key);
  assert.deepEqual(keys, ['cladding-front-left', 'cladding-front-right', 'cladding-front-top', 'cladding-front-bottom', 'cladding-side-left', 'cladding-side-right']);
  // «front-top» is the panel above the firebox, not a top of the box.
  const aboveFirebox = jobOf('cladding').pieces.find(p => p.key === 'cladding-front-top');
  assert.deepEqual([aboveFirebox.lengthM, aboveFirebox.widthM].map(v => Math.round(v * 1000)), [1600, 900]);   // Hb − e − H = 1.6, W = 0.9
  assert.ok(!keys.some(k => /cladding-(top|roof|lid)$/.test(k)), 'no piece on top of the box');
});

test('cladding: the firebox height moves the panels but not the stone; on the floor there is no panel under it', () => {
  const raised = jobOf('cladding', { fireboxBottom: 300 });
  const floor = jobOf('cladding', { fireboxBottom: 0 });
  close(raised.mainAreaM2, floor.mainAreaM2, 'e = 300 vs e = 0');
  assert.equal(raised.pieces.length, 6);
  assert.equal(floor.pieces.length, 5);
  assert.ok(!floor.pieces.some(p => p.key === 'cladding-front-bottom'));
  const top = job => job.pieces.find(p => p.key === 'cladding-front-top');
  assert.notEqual(top(raised).lengthM, top(floor).lengthM, 'the panel above the firebox follows it');
});

test('podium: top, front and two sides', () => {
  const pieces = jobOf('podium').pieces;
  assert.deepEqual(pieces.map(p => p.key), ['podium-top', 'podium-front', 'podium-side-left', 'podium-side-right']);
  assert.deepEqual(pieces.map(p => [p.lengthM, p.widthM]), [[1.8, 0.45], [1.8, 0.2], [0.45, 0.2], [0.45, 0.2]]);
});

// ---- no pieces for what is not a fireplace -----------------------------------------------------

test('sizes not all entered: no pieces, the missing size is named', () => {
  const job = jobOf('podium', { height: '' });
  assert.deepEqual(job.pieces, []);
  assert.equal(job.mainAreaM2, 0);
  assert.deepEqual(job.missing, ['fireplace:height']);
  const portalJob = jobOf('with-shelf', { shelfProjection: '', depth: '' });
  assert.deepEqual(portalJob.pieces, []);
  assert.deepEqual(portalJob.missing.sort(), ['fireplace:depth', 'fireplace:shelfProjection']);
});

test('sizes that break a rule: no pieces of an impossible fireplace, the rule is named', () => {
  [
    ['cladding', { fireboxWidth: 1700 }, ['fireplace:fireboxWidth']],
    ['cladding', { fireboxBottom: 2100 }, ['fireplace:fireboxHeight']],
    ['cladding', { fireboxWidth: 1560 }, ['fireplace:plateThickness']],
    ['with-shelf', { depth: 30 }, ['fireplace:plateThickness']],
    ['podium', { height: 0 }, ['fireplace:positive']],
    ['cladding', { fireboxBottom: -5 }, ['fireplace:nonNegative']],
  ].forEach(([formId, over, missing]) => {
    const job = jobOf(formId, over);
    assert.deepEqual(job.pieces, [], formId + ' ' + JSON.stringify(over));
    assert.equal(job.mainAreaM2, 0);
    assert.deepEqual(job.missing, missing, formId + ' ' + JSON.stringify(over));
  });
});

test('no fireplace type in the state: no pieces, the type is what is missing', () => {
  const state = stateOf('podium');
  state.productConfig.kaminy = null;
  const job = ProductParts.buildJob(state);
  assert.deepEqual(job.pieces, []);
  assert.deepEqual(job.missing, ['fireplace:type']);
  state.productConfig.kaminy = { typeId: 'FIREPLACE-99', form: 'x', params: {} };
  assert.deepEqual(ProductParts.buildJob(state).missing, ['fireplace:type']);
});

// ---- the slab layout gets exactly these pieces ------------------------------------------------

test('planMaterial lays out exactly the fireplace\'s pieces: every plate, once, with the plan\'s area', () => {
  VARIANTS.forEach(formId => {
    const job = jobOf(formId);
    const material = layOut(job);
    assert.equal(material.ok, true, formId);
    close(material.productAreaM2, planOf(formId).areaM2, formId + ' laid-out area');
    assert.equal(material.pieceCount, job.pieces.length, formId + ': one cut piece per plate (large slabs, no seams)');
    assert.equal(material.seams, 0, formId);
    const placed = material.layout.flatMap(s => s.placements.map(p => p.key)).sort();
    assert.deepEqual(placed, job.pieces.map(p => p.key).sort(), formId + ': the placed pieces are the plates');
    // Each slab keeps the company's 35% reserve.
    material.layout.forEach(s => assert.ok(s.utilization <= ProductTypes.SLAB_USAGE_LIMIT + 1e-9, formId));
  });
});

test('a plate longer than any slab is joined with a seam, like any other product\'s piece', () => {
  // A 4 m tall cladding: its 4 m panels are longer than a 3.2 m slab.
  const job = jobOf('cladding', { claddingHeight: 4000 });
  const material = layOut(job);
  assert.equal(material.ok, true);
  assert.ok(material.seams > 0);
  close(material.productAreaM2, planOf('cladding', { claddingHeight: 4000 }).areaM2);
});

// ---- never the countertop, never a second area -------------------------------------------------

test('a fireplace is never cut as a countertop or a plain width x length surface', () => {
  VARIANTS.forEach(formId => {
    const job = jobOf(formId);
    assert.equal(job.surfaceAreaM2, undefined, formId + ': not a surface');
    assert.ok(!job.pieces.some(p => ['main', 'wing', 'backsplash', 'wallPanel', 'island', 'barCounter'].includes(p.key)), formId);
    assert.ok(job.pieces.every(p => /^(portal|cladding|podium)-/.test(p.key)), formId);
  });
  // The leftover generic width x length (650 x 2400) never becomes a fireplace's stone.
  close(jobOf('podium').mainAreaM2, 1.35);
  // Without the «kaminy» branch the same state would be cut as a width x length surface.
  const state = stateOf('podium');
  state.product = Object.assign({}, state.product, { key: 'panno' });
  state.dimensions = { widthM: 0.65, lengthM: 2.4, thicknessM: null };
  close(ProductParts.buildJob(state).mainAreaM2, 0.65 * 2.4, 'the fallback the branch keeps a fireplace out of');
});

test('product-parts measures no fireplace itself: no sizes, no formula, only the plan', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'product-parts.js'), 'utf8').replace(/\/\/.*$/gm, '');
  const body = src.slice(src.indexOf('function fireplaceJob'), src.indexOf('function buildJob'));
  assert.match(body, /fireplacePlan\(/);
  assert.doesNotMatch(body, /openingWidth|openingHeight|pierWidth|lintelHeight|shelfProjection|claddingWidth|claddingHeight|fireboxWidth|fireboxHeight|fireboxBottom/);
  assert.doesNotMatch(body, /\*/, 'no multiplication: every area comes from the plan');
});

test('the other nine products are cut exactly as before', () => {
  Object.keys(ProductTypes.PRODUCTS).filter(key => key !== 'kaminy').forEach(key => {
    const doc = createFakeDoc({ width: { value: '650' }, length: { value: '2400' } });
    const state = ConstructorState.readConstructorState({ doc, selectedProductKey: key, product: ProductTypes.PRODUCTS[key], stone: null, hasAdditionalWork: ProductTypes.hasAdditionalWork });
    const job = ProductParts.buildJob(state);
    assert.ok(!job.missing.some(m => m.startsWith('fireplace:')), key);
    assert.ok(!(job.pieces || []).some(p => /^(portal|cladding|podium)-/.test(p.key)), key);
  });
});
