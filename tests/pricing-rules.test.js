// tests/pricing-rules.test.js
//
// The company's pricing rules, fixed: the 35% reserve and seams, risers with
// their own (unset) rates, stairs of 1-6 marches that can really be climbed,
// spiral stairs by their count, the countertop's extra stone elements in the
// same slab layout, the sills' commercial areas.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createFakeDoc } = require('./helpers/fake-dom.js');
const Pricing = require('../pricing.js');
const ProductTypes = require('../product-types.js');
const ConstructorState = require('../constructor-state.js');
const GeometryModel = require('../visualizer/geometry-model.js');
const SceneLayout = require('../visualizer/scene-layout.js');
const C = require('../visualizer/constants.js');
const DATA = require('../data/slabs.json');

const html = fs.readFileSync(path.join(__dirname, '..', 'sayanmramor-calculator.html'), 'utf8');
const { SLAB_USAGE_LIMIT: LIMIT, SAW_MARGIN_CM: MARGIN, PRODUCTS, WORK_RATES } = ProductTypes;
const REAL = DATA.stones.find(s => s.id === 'delicato-brown');
const ZERO = { fabricationRatePerM2: 0, installationRatePerM2: 0, polishRatePerM2: 0, miscFlatSum: 0, miscRatePerM2: 0, complexShapeMultiplier: 1 };
const close = (a, b, msg, eps) => assert.ok(Math.abs(a - b) < (eps || 1e-6), (msg || '') + ': ' + a + ' vs ' + b);
const stock = (n, w, l) => ({ slabs: Array.from({ length: n }, (_, i) => ({ article: 'S' + i, width_cm: w, length_cm: l, price_total_rub: 50000 + i })) });
const dims = (w, l, extra) => Object.assign({ width: { value: String(w) }, length: { value: String(l) } }, extra || {});
const type = id => ({ productSubcategory: { value: id } });

function stateFor(key, values) {
  return ConstructorState.readConstructorState({ doc: createFakeDoc(values), selectedProductKey: key, product: PRODUCTS[key], stone: null, hasAdditionalWork: ProductTypes.hasAdditionalWork });
}
function inputsFor(state) {
  return ConstructorState.buildPricingInputs(state, {
    productRates: WORK_RATES[state.product.key], miscFlatSum: null, miscRatePerM2: null, complexShapeMultiplier: 1.5,
    countertopExtrasRates: ProductTypes.COUNTERTOP_EXTRAS_RATES, getAdditionalWorkRate: () => null, riserRates: ProductTypes.RISER_WORK_RATES,
  });
}
function price(stone, state, extra) {
  const inputs = inputsFor(state);
  const r = Pricing.calculatePrice(Object.assign({ stone, productType: state.product.type, rates: inputs.rates, marginCm: MARGIN, usageLimit: LIMIT,
    job: inputs.job, groupRates: inputs.groupRates, extraDimensions: inputs.extraDimensions, extraLineItems: inputs.extraLineItems }, extra || {}));
  return { r, inputs };
}
const one = (lengthM, widthM, seam, count) => ({ pieces: [{ key: 'p', group: 'main', lengthM, widthM, areaM2: lengthM * widthM, count: count || 1, seam }] });
const priceJob = (stone, job) => Pricing.calculatePrice({ stone, productType: 'A', rates: ZERO, marginCm: MARGIN, usageLimit: LIMIT, job });
const everySlabWithin = r => r.material.layout.forEach(l => assert.ok(l.utilization <= LIMIT + 1e-9, 'slab used ' + l.utilization));

// ---- 1-2. the reserve and seams ---------------------------------------------------

test('a piece within 65% of a slab: one piece, one slab, no seam', () => {
  const r = priceJob(stock(3, 300, 180), one(2.4, 0.6, true));
  assert.equal(r.ok, true);
  assert.equal(r.material.nSlabs, 1);
  assert.equal(r.material.seams, 0);
  everySlabWithin(r);
});

test('a piece over 65% of every slab, a seam allowed: split into pieces, each counted and within the reserve', () => {
  // 2.8 x 1.6 = 4.48 m² on 300 x 180 (5.4 m²): 83% -- more than 65%.
  const r = priceJob(stock(4, 300, 180), one(2.8, 1.6, true));
  assert.equal(r.ok, true, 'not sent to a manager');
  assert.ok(r.material.seams >= 1, 'split with a seam');
  assert.equal(r.material.pieceCount, r.material.seams + 1, 'every part a piece of its own');
  close(r.material.productAreaM2, 4.48, 'the whole area');
  everySlabWithin(r);
});

test('a piece over 65% where the product allows no seam: a controlled "ask a manager", no price', () => {
  const r = priceJob(stock(4, 300, 180), one(2.8, 1.6, false));
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'exceeds_usage_limit');
  assert.equal(r.total, null);
  // Through the product itself: a product whose pieces must stay whole.
  const state = stateFor('podokonnik', dims(1600, 2800, type('SILL-01')));
  state.product.allowSeam = false;
  const job = inputsFor(state).job;
  assert.ok(job.pieces.every(p => p.seam === false));
  assert.equal(priceJob(stock(4, 300, 180), job).reason, 'exceeds_usage_limit');
  // The page explains that outcome.
  assert.match(html, /result\.reason === 'exceeds_usage_limit'/);
  // Every product today allows a seam (as before) -- the rule is not new.
  Object.keys(PRODUCTS).forEach(key => assert.notEqual(PRODUCTS[key].allowSeam, false, key));
});

test('an impossible layout: wider than any slab, or more than the stock -- no price', () => {
  assert.equal(priceJob(stock(3, 300, 180), one(3.2, 3.1, true)).reason, 'no_fitting_slab');
  assert.equal(priceJob(stock(2, 300, 180), one(1.2, 0.3, false, 60)).reason, 'insufficient_stock');
});

test('several pieces on one slab', () => {
  const r = priceJob(stock(3, 300, 180), one(1.2, 0.3, true, 6));
  assert.equal(r.material.nSlabs, 1);
  assert.equal(r.material.layout[0].placements.length, 6);
  everySlabWithin(r);
});

// ---- 3-4. sills -----------------------------------------------------------------------

test('corner sill: two pieces with a seam, both arms priced; parts, pricing and 3D use the same entered sizes', () => {
  const state = stateFor('podokonnik', dims(300, 1500, Object.assign(type('SILL-02'), { 'sill-arm-length': { value: '900' } })));
  const { r, inputs } = price({ slabs: REAL.slabs }, state);
  assert.equal(inputs.job.pieces.length, 2);
  close(inputs.job.mainAreaM2, 1.5 * 0.3 + 0.6 * 0.3, 'both arms');
  const sill = SceneLayout.buildSceneLayout(GeometryModel.buildGeometryModel(state)).parts.find(p => p.name === 'main');
  close(GeometryModel.polygonArea(sill.outline), inputs.job.mainAreaM2, 'the 3D outline');
  close(r.material.productAreaM2, inputs.job.mainAreaM2);
  // The page's diagram draws the same plan.
  assert.match(html, /GeometryModel\.sillPlan\(variant, W, L, draft\)/);
});

test('figured sill: priced and cut by its bounding rectangle; the drawn contour adds no hidden area', () => {
  const state = stateFor('podokonnik', dims(300, 1500, type('SILL-05')));
  const job = inputsFor(state).job;
  close(job.mainAreaM2, 1.5 * 0.3, 'the entered L x W');
  const sill = SceneLayout.buildSceneLayout(GeometryModel.buildGeometryModel(state)).parts.find(p => p.name === 'main');
  const drawn = GeometryModel.polygonArea(sill.outline);
  assert.ok(drawn <= job.mainAreaM2 + 1e-9, 'the contour lies within the priced rectangle');
});

// ---- 5-6. radius steps, spiral stairs -------------------------------------------------

test('radius step: the entered depth is the deepest point; the real shape is priced, not the rectangle', () => {
  const job = inputsFor(stateFor('stupeni', dims(300, 1200, Object.assign(type('STEP-03'), { 'step-count': { value: '4' } })))).job;
  const plan = GeometryModel.stairPlan('steps', 'radius', 1.2, 0.3, 4);
  close(plan.edgeDepthM + plan.bulgeM, 0.3);
  assert.ok(job.mainAreaM2 < 4 * 1.2 * 0.3);
});

test('spiral stair: the fixed 300 mm walking step; the count changes pieces, area, slabs and price', () => {
  const at = n => price({ slabs: REAL.slabs }, stateFor('lestnitsa', dims(800, 2000, Object.assign(type('STAIR-07'), { 'step-count': { value: String(n) } }))), { rates: WORK_RATES.lestnitsa });
  const runs = [6, 12, 24].map(at);
  const plan = GeometryModel.stairPlan('flight', 'spiral', 2, 0.8, 12);
  close(plan.treadDepthM, C.VISUAL_STAIR_TREAD_DEPTH_M, 'the walking step on the middle line', 1e-9);
  for (let i = 1; i < runs.length; i++) {
    assert.ok(runs[i].inputs.job.mainAreaM2 > runs[i - 1].inputs.job.mainAreaM2, 'area grows');
    assert.ok(runs[i].r.material.pieceCount > runs[i - 1].r.material.pieceCount, 'more pieces');
    assert.ok(runs[i].r.material.nSlabs >= runs[i - 1].r.material.nSlabs, 'slabs');
    assert.ok(runs[i].r.total > runs[i - 1].r.total, 'price grows');
  }
  close(runs[2].inputs.job.mainAreaM2, 4 * runs[0].inputs.job.mainAreaM2, 'area proportional to the count');
  assert.notEqual(runs[1].inputs.job.mainAreaM2, 2 * 0.8, 'not diameter x width');
  // Wedge steps are still cut in pairs.
  assert.ok(runs[1].inputs.job.pieces.some(p => p.key === 'tread-pair'));
});

// ---- 7. stairs of 1-6 marches that can be climbed --------------------------------

const RISE = C.VISUAL_STAIR_RISE_M;
const add = (p, v, k) => [p[0] + v[0] * k, p[1] + v[1] * k];
const box = pts => ({ x0: Math.min(...pts.map(p => p[0])), x1: Math.max(...pts.map(p => p[0])), z0: Math.min(...pts.map(p => p[1])), z1: Math.max(...pts.map(p => p[1])) });
const overlap = (a, b) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0));
const onBoundary = (p, b) => (Math.abs(p[0] - b.x0) < 1e-9 || Math.abs(p[0] - b.x1) < 1e-9 || Math.abs(p[1] - b.z0) < 1e-9 || Math.abs(p[1] - b.z1) < 1e-9)
  && p[0] >= b.x0 - 1e-9 && p[0] <= b.x1 + 1e-9 && p[1] >= b.z0 - 1e-9 && p[1] <= b.z1 + 1e-9;

function stairFor(shape, M, n) {
  const W = 1, depth = 0.3;
  const g1 = shape === 'straight' ? M : Math.ceil(M / 2);
  const runSteps = n * g1, runLandings = shape === 'straight' ? M - 1 : g1;
  const L = runSteps * depth + runLandings * W;
  return { plan: GeometryModel.stairPlan('flight', shape, L, W, n * M, M), W, L };
}

function checkClimbable(shape, M, n) {
  const { plan, W } = stairFor(shape, M, n);
  const p = plan.path;
  const tag = shape + ' x ' + M;
  assert.equal(plan.fits, true, tag);
  assert.equal(p.marches.length, M, tag + ': marches');
  assert.equal(p.landings.length, M - 1, tag + ': landings = marches - 1');
  assert.ok(p.marches.every(m => m.count === n), tag + ': the same steps in each march');
  const footprints = [];
  p.marches.forEach((m, i) => {
    const end = add(m.origin, m.dir, m.count * m.depth);
    const rect = [add(m.origin, m.across, -W / 2), add(end, m.across, -W / 2), add(end, m.across, W / 2), add(m.origin, m.across, W / 2)];
    footprints.push({ tag: 'march ' + i, b: box(rect) });
    if (i === 0) assert.equal(m.level, 0, tag + ': the first march starts at the lower level');
    if (i < M - 1) {
      const l = p.landings[i];
      assert.equal(l.from, i);
      assert.equal(l.to, i + 1);
      // March i ends at landing i: one rise below it, at its near edge.
      assert.equal(l.top, m.level + m.count + 1, tag + ': landing ' + i + ' one rise above the top step of march ' + i);
      close(Math.hypot(end[0] - l.edge[0], end[1] - l.edge[1]), 0, tag + ': march ' + i + ' reaches landing ' + i);
      const lb = box(l.outline);
      assert.ok(onBoundary(end, lb), tag + ': the end of march ' + i + ' is on landing ' + i);
      // The next march leaves from the landing, one rise above it.
      const next = p.marches[i + 1];
      assert.equal(next.level, l.top, tag + ': march ' + (i + 1) + ' starts from landing ' + i);
      assert.ok(onBoundary(next.origin, lb), tag + ': march ' + (i + 1) + ' starts on the edge of landing ' + i);
      footprints.push({ tag: 'landing ' + i, b: lb });
    } else {
      assert.equal(m.level + m.count, p.topLevel, tag + ': the last march reaches the upper level');
    }
  });
  assert.equal(p.topLevel, M * n + (M - 1), tag + ': every step and landing rise');
  // Nothing crosses anything in plan: pieces only touch.
  footprints.forEach((a, i) => footprints.slice(i + 1).forEach(b => {
    assert.ok(overlap(a.b, b.b) < 1e-9, tag + ': ' + a.tag + ' overlaps ' + b.tag);
  }));
  return plan;
}

test('stairs of 2, 3, 4, 5 and 6 marches: one continuous way up, landings = marches - 1, no gaps or crossings -- every shape', () => {
  ['straight', 'l', 'u'].forEach(shape => {
    [2, 3, 4, 5, 6].forEach(M => checkClimbable(shape, M, 5));
  });
  checkClimbable('straight', 1, 8);
  // The shapes' turns: Г turns 90° once, П turns back 180° once, a straight stair never.
  const dirs = shape => stairFor(shape, 4, 5).plan.path.marches.map(m => m.dir.map(v => Math.round(v)).join(','));
  assert.deepEqual(dirs('straight'), ['-1,0', '-1,0', '-1,0', '-1,0']);
  assert.deepEqual(dirs('l'), ['-1,0', '-1,0', '0,-1', '0,-1']);
  assert.deepEqual(dirs('u'), ['-1,0', '-1,0', '1,0', '1,0']);
  // The heights rise evenly: every march climbs the same n rises.
  const plan = stairFor('u', 6, 5).plan;
  plan.path.marches.forEach((m, i) => assert.equal(m.level, i * (5 + 1)));
});

test('the marches the UI offers are exactly the ones that build: straight 1-6, Г and П 2-6; spiral has none', () => {
  assert.deepEqual(GeometryModel.MARCH_RANGE, { straight: { min: 1, max: 6 }, l: { min: 2, max: 6 }, u: { min: 2, max: 6 } });
  assert.equal(GeometryModel.marchesFor('l', '1'), 2, 'Г cannot be one march');
  assert.equal(GeometryModel.marchesFor('straight', '7'), 1, 'more than 6: the default');
  assert.equal(GeometryModel.marchesFor('u', '6'), 6);
  assert.equal(GeometryModel.marchesFor('spiral', '3'), 0);
  assert.match(html, /<select id="stair-marches"/);
  assert.match(html, /Марш — один участок лестницы между площадками или уровнями\./);
  assert.match(html, /const range = shape \? GeometryModel\.MARCH_RANGE\[shape\] : null;/);
});

test('the 3D builds exactly that stair: every tread and landing at its level, landings = marches - 1, risers at every landing edge', () => {
  [['STAIR-02', 'straight'], ['STAIR-04', 'l'], ['STAIR-06', 'u']].forEach(([id, shape]) => {
    [2, 3, 4, 5, 6].forEach(M => {
      const range = GeometryModel.MARCH_RANGE[shape];
      if (M < range.min) return;
      const W = 1, n = 4;
      const g1 = shape === 'straight' ? M : Math.ceil(M / 2);
      const L = g1 * n * 0.3 + (shape === 'straight' ? M - 1 : g1) * W;
      const state = stateFor('lestnitsa', dims(1000, Math.round(L * 1000), Object.assign(type(id), { 'step-count': { value: String(n) }, 'stair-marches': { value: String(M) }, 'riser-height': { value: '170' } })));
      assert.equal(state.productConfig.lestnitsa.marches, M);
      assert.equal(state.productConfig.lestnitsa.landings, M - 1);
      assert.equal(state.stepCount, M * n);
      const layout = SceneLayout.buildSceneLayout(GeometryModel.buildGeometryModel(state));
      const treads = layout.parts.filter(p => p.name === 'tread');
      const landings = layout.parts.filter(p => p.name === 'landing');
      assert.equal(treads.length, M * n, id + ' x ' + M);
      assert.equal(landings.length, M - 1, id + ' x ' + M);
      const plan = GeometryModel.buildGeometryModel(state).stairs.plan;
      landings.forEach((l, i) => close(l.y1, plan.path.landings[i].top * RISE, 'landing ' + i + ' height'));
      // The treads climb one rise at a time, landings in between.
      const tops = treads.map(t => Math.round(t.y1 / RISE)).sort((a, b) => a - b);
      const expected = [];
      plan.path.marches.forEach(m => { for (let k = 1; k <= m.count; k++) expected.push(m.level + k); });
      assert.deepEqual(tops, expected.sort((a, b) => a - b));
      assert.equal(layout.parts.filter(p => p.name === 'riser').length, M * n + (M - 1), 'a riser under every step and at every landing edge');
      // The parts priced are the ones drawn.
      const job = inputsFor(state).job;
      assert.equal(job.pieces.find(p => p.key === 'tread').count, M * n);
      assert.equal(job.pieces.filter(p => p.key === 'landing').length, M - 1);
      const drawn = treads.concat(landings).reduce((s, p) => s + GeometryModel.polygonArea(p.outline), 0);
      close(drawn, job.mainAreaM2, id + ' x ' + M + ': the priced area is the drawn stone', 1e-6);
    });
  });
});

test('a length too short for the marches and landings: no price, the page says what to change', () => {
  const state = stateFor('lestnitsa', dims(1000, 2000, Object.assign(type('STAIR-01'), { 'step-count': { value: '6' }, 'stair-marches': { value: '3' } })));
  assert.equal(GeometryModel.buildGeometryModel(state).stairs.plan.fits, false);
  assert.deepEqual(inputsFor(state).job.missing, ['stairLength']);
  assert.match(html, /stairLength: 'Длины лестницы не хватает/);
});

// ---- 1. risers ---------------------------------------------------------------------------

test('risers: their stone in the one layout; their own rate; an unset rate is never the step\'s', () => {
  const state = stateFor('stupeni', dims(300, 1200, Object.assign(type('STEP-01'), { 'step-count': { value: '4' }, 'stupeni-riser': { checked: true }, 'riser-height': { value: '170' } })));
  const { r, inputs } = price(stock(4, 300, 180), state, { rates: WORK_RATES.stupeni, installEnabled: true });
  assert.equal(r.material.pieceCount, 8, 'steps and risers in the same layout');
  const g = r.groups.find(x => x.key === 'riser');
  assert.equal(g.fabrication, 0);
  assert.equal(g.installation, 0);
  assert.deepEqual(g.unpriced, ['fabrication', 'installation']);
  close(r.fabrication, WORK_RATES.stupeni.fabricationRatePerM2 * inputs.job.mainAreaM2, 'the step rate on the steps only');
  assert.deepEqual(ProductTypes.RISER_WORK_RATES, { fabricationRatePerM2: null, installationRatePerM2: null, polishRatePerM2: null });
  assert.match(html, /стоимость работ по подступенкам \(' \+ list \+ '\) уточнит менеджер/);
});

// ---- 8. countertop extras ---------------------------------------------------------------

const KITCHEN = {
  'wing-width': { value: '600' }, 'wing-length': { value: '1400' },
  'extra-fartuk-width': { value: '600' }, 'extra-fartuk-length': { value: '2400' },
  'extra-wallpanel-width': { value: '900' }, 'extra-wallpanel-length': { value: '1200' },
  'extra-ostrov-width': { value: '900' }, 'extra-ostrov-length': { value: '1800' },
  'extra-bar-standard-width': { value: '500' }, 'extra-bar-standard-length': { value: '1200' },
};

test('countertop Г and П with a backsplash, a wall panel, an island and a bar: all in one slab layout', () => {
  ['lshape', 'ushape'].forEach(shape => {
    const state = stateFor('stoleshnitsa_kuhnya', dims(600, 2400, Object.assign({ productShape: { value: shape } }, KITCHEN)));
    const { r, inputs } = price({ slabs: REAL.slabs }, state);
    const keys = inputs.job.pieces.map(p => p.key);
    assert.deepEqual(keys, ['main', 'wing', 'backsplash', 'wallPanel', 'island', 'barCounter'], shape);
    const extras = inputs.job.pieces.filter(p => p.group === 'extra');
    close(inputs.job.extraAreaM2, 0.6 * 2.4 + 0.9 * 1.2 + 0.9 * 1.8 + 0.5 * 1.2, 'the extras\' stone');
    close(inputs.job.mainAreaM2, 1.44 + (shape === 'lshape' ? 1 : 2) * 0.84, 'the countertop itself');
    assert.equal(extras.length, 4);
    // One layout: every piece placed once, every slab once.
    const placed = r.material.layout.reduce((s, l) => s + l.placements.length, 0);
    assert.equal(placed, r.material.pieceCount);
    const articles = r.material.slabs.map(s => s.article + '/' + s.pachka + '/' + s.party + '/' + s.price_total_rub + '/' + s.city);
    assert.equal(new Set(articles).size, articles.length, 'no slab counted twice');
    assert.equal(r.subtotal, r.material.slabs.reduce((s, x) => s + x.price_total_rub, 0));
    everySlabWithin(r);
    // The extras' stone is not free: more than the countertop alone...
    const alone = Pricing.planMaterial({ slabs: REAL.slabs, job: { pieces: inputs.job.pieces.filter(p => p.group === 'main') }, marginCm: MARGIN, usageLimit: LIMIT });
    assert.ok(r.subtotal > alone.subtotal, shape + ': the extras cost stone');
    // ...and never more than cutting them separately.
    const extrasAlone = Pricing.planMaterial({ slabs: REAL.slabs, job: { pieces: extras.map(p => Object.assign({}, p, { group: 'main' })) }, marginCm: MARGIN, usageLimit: LIMIT });
    assert.ok(r.subtotal <= alone.subtotal + extrasAlone.subtotal, shape + ': shared slabs, not counted twice');
    // Their work stays with the additional works (not the countertop rate).
    const g = r.groups.find(x => x.key === 'extra');
    assert.equal(g.work, 0);
    assert.ok(g.workElsewhere);
  });
});

test('each extra on its own: backsplash, wall panel, island, bar -- the configured variant only', () => {
  const only = (extra, key) => {
    const job = inputsFor(stateFor('stoleshnitsa_kuhnya', dims(600, 2400, extra))).job;
    const extras = job.pieces.filter(p => p.group === 'extra');
    assert.deepEqual(extras.map(p => p.key), [key]);
    return extras[0];
  };
  close(only({ 'extra-fartuk-width': { value: '600' }, 'extra-fartuk-length': { value: '2400' } }, 'backsplash').areaM2, 1.44);
  close(only({ 'extra-wallpanel-width': { value: '900' }, 'extra-wallpanel-length': { value: '1200' } }, 'wallPanel').areaM2, 1.08);
  close(only({ 'extra-ostrov-figured-width': { value: '1000' }, 'extra-ostrov-figured-length': { value: '2000' } }, 'island').areaM2, 2);
  close(only({ 'extra-bar-complex-width': { value: '500' }, 'extra-bar-complex-length': { value: '1500' } }, 'barCounter').areaM2, 0.75);
  // Both island variants filled: the rectangular one (as the 3D) -- never both.
  const both = inputsFor(stateFor('stoleshnitsa_kuhnya', dims(600, 2400, {
    'extra-ostrov-width': { value: '900' }, 'extra-ostrov-length': { value: '1800' },
    'extra-ostrov-figured-width': { value: '1000' }, 'extra-ostrov-figured-length': { value: '2000' },
  }))).job.pieces.filter(p => p.key === 'island');
  assert.equal(both.length, 1);
  close(both[0].areaM2, 1.62);
  // A bathroom top has no island / bar capability: none, even with stale values.
  const bath = inputsFor(stateFor('stoleshnitsa_vannaya', dims(500, 1200, KITCHEN))).job.pieces.map(p => p.key);
  assert.ok(!bath.includes('island') && !bath.includes('barCounter'));
});

// ---- 9. the stair note -----------------------------------------------------------------

test('the stair note is the neutral one; the old "requires clarifying the count" text is gone', () => {
  assert.doesNotMatch(html, /Точный расчёт лестницы|уточнения количества и размера ступеней/);
  assert.match(html, /Предварительная стоимость\. Финальный расчёт подтверждает менеджер после проверки проекта\./);
});
