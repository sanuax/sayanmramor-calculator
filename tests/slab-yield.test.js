// tests/slab-yield.test.js
//
// The material rule: every product is a set of real pieces (or a cladded
// surface) laid out on real slabs, and takes at most 65% of every slab it is
// cut from -- a 35% reserve. The slabs come from the geometry of the pieces,
// never from "area / 0.65". Each scenario reports:
//   product area / slab area / used area / utilization / waste / slab count.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createFakeDoc } = require('./helpers/fake-dom.js');
const Pricing = require('../pricing.js');
const ProductTypes = require('../product-types.js');
const ProductParts = require('../product-parts.js');
const ConstructorState = require('../constructor-state.js');
const GeometryModel = require('../visualizer/geometry-model.js');
const SceneLayout = require('../visualizer/scene-layout.js');
const DATA = require('../data/slabs.json');

const { SLAB_USAGE_LIMIT: LIMIT, SAW_MARGIN_CM: MARGIN, PRODUCTS, WORK_RATES } = ProductTypes;
const ZERO = { fabricationRatePerM2: 0, installationRatePerM2: 0, polishRatePerM2: 0, miscFlatSum: 0, miscRatePerM2: 0, complexShapeMultiplier: 1 };
const close = (a, b, msg, eps) => assert.ok(Math.abs(a - b) < (eps || 1e-6), (msg || '') + ': ' + a + ' vs ' + b);

// A stock of N identical slabs (cm), each priced.
const stock = (n, w, l, price) => ({ slabs: Array.from({ length: n }, (_, i) => ({ article: 'S' + i, width_cm: w, length_cm: l, price_total_rub: price || 50000 + i })) });
// The real stock of a stone from data/slabs.json -- real slab sizes and prices.
const REAL = DATA.stones.find(s => s.id === 'delicato-brown');

function stateFor(key, values) {
  return ConstructorState.readConstructorState({ doc: createFakeDoc(values), selectedProductKey: key, product: PRODUCTS[key], stone: null, hasAdditionalWork: ProductTypes.hasAdditionalWork });
}
function inputsFor(state, riserRates) {
  return ConstructorState.buildPricingInputs(state, {
    productRates: WORK_RATES[state.product.key], miscFlatSum: null, miscRatePerM2: null, complexShapeMultiplier: 1.5,
    countertopExtrasRates: ProductTypes.COUNTERTOP_EXTRAS_RATES, getAdditionalWorkRate: () => null,
    riserRates: riserRates || ProductTypes.RISER_WORK_RATES,
  });
}
function priceJob(stone, job, extra) {
  return Pricing.calculatePrice(Object.assign({ stone, productType: 'A', rates: ZERO, marginCm: MARGIN, usageLimit: LIMIT, job }, extra || {}));
}
function priceState(stone, key, values, extra) {
  const state = stateFor(key, values);
  const inputs = inputsFor(state, extra && extra.riserRates);
  const r = priceJob(stone, inputs.job, Object.assign({ rates: inputs.rates, groupRates: inputs.groupRates }, extra || {}));
  return { state, inputs, r };
}

// The report line, and the rule on every slab: used <= 65%, the pieces lie
// inside the slab without overlapping.
function report(t, name, r) {
  const m = r.material;
  t.diagnostic(name + ': product area ' + m.productAreaM2.toFixed(3) + ' m² / slab area ' + m.slabAreaM2.toFixed(3) + ' m² / used area ' + m.usedAreaM2.toFixed(3) +
    ' m² / utilization ' + (100 * m.utilization).toFixed(1) + '% / waste ' + (100 * m.waste).toFixed(1) + '% / slabs ' + m.nSlabs);
  close(m.utilization + m.waste, 1, name + ' utilization + waste');
  m.layout.forEach((slab, i) => {
    assert.ok(slab.utilization <= LIMIT + 1e-9, name + ': slab ' + i + ' used ' + slab.utilization);
    const W = slab.slab.width_cm, L = slab.slab.length_cm;
    const fitsA = slab.placements.every(p => p.x + p.dx <= W + 1e-9 && p.y + p.dy <= L + 1e-9);
    const fitsB = slab.placements.every(p => p.x + p.dx <= L + 1e-9 && p.y + p.dy <= W + 1e-9);
    assert.ok(fitsA || fitsB, name + ': pieces inside slab ' + i);
    slab.placements.forEach((a, j) => slab.placements.slice(j + 1).forEach(b => {
      const apart = a.x + a.dx <= b.x + 1e-9 || b.x + b.dx <= a.x + 1e-9 || a.y + a.dy <= b.y + 1e-9 || b.y + b.dy <= a.y + 1e-9;
      assert.ok(apart, name + ': pieces overlap on slab ' + i);
    }));
  });
  if (m.nSlabs) assert.ok(m.waste >= 1 - LIMIT - 1e-9, name + ': waste >= 35%');
  return m;
}

const cnt = n => ({ 'step-count': { value: String(n) } });
const dims = (w, l, extra) => Object.assign({ width: { value: String(w) }, length: { value: String(l) } }, extra || {});
const type = id => ({ productSubcategory: { value: id } });

// ---- the rule itself ----------------------------------------------------------

test('the reserve: 35% -- a product takes at most 65% of any slab; the old 1.3 waste factor is gone', () => {
  assert.equal(LIMIT, 0.65);
  assert.equal(ProductTypes.AREA_WASTE_FACTOR, undefined);
});

test('several identical pieces share one slab: the count is laid out, not "one slab per piece"', t => {
  // 4 steps 1200 x 300 on a 300 x 180 slab (5.4 m², 65% = 3.51 m²).
  const r = priceJob(stock(5, 300, 180), { pieces: [{ key: 'tread', group: 'main', lengthM: 1.2, widthM: 0.3, areaM2: 0.36, count: 4, seam: true }] });
  const m = report(t, '4 x 1200x300 on 300x180', r);
  assert.equal(m.nSlabs, 1);
  assert.equal(m.pieceCount, 4);
  assert.equal(m.layout[0].placements.length, 4);
  close(m.productAreaM2, 1.44);
});

test('area alone would be wrong: 6 pieces of 1 x 1 m take 3 slabs, not the 2 that "area / 0.65" gives', t => {
  // 6 m²; a 300 x 180 slab could take 3.51 m² by area (3 pieces), but only
  // 2 pieces of 1.08 x 1.08 (with the saw margins) fit on it.
  const r = priceJob(stock(10, 300, 180), { pieces: [{ key: 'p', group: 'main', lengthM: 1, widthM: 1, areaM2: 1, count: 6, seam: false }] });
  const m = report(t, '6 x 1000x1000 on 300x180', r);
  assert.equal(m.nSlabs, 3, 'two per slab, by geometry');
  assert.equal(Math.ceil(6 / (LIMIT * 5.4)), 2, 'what area / 0.65 would say');
  // And where the geometry allows more than a naive grid: 1.25 x 0.9 pieces
  // turned across the slab -- three on one 300 x 180 slab.
  const turned = priceJob(stock(10, 300, 180), { pieces: [{ key: 'p', group: 'main', lengthM: 1.25, widthM: 0.9, areaM2: 1.125, count: 3, seam: false }] });
  assert.equal(report(t, '3 x 1250x900 on 300x180', turned).nSlabs, 1);
});

// ---- «Ступени» ------------------------------------------------------------------------

test('«Ступени»: 1 step -- one piece, one slab, the step\'s own area', t => {
  const { r, inputs } = priceState(stock(3, 300, 180), 'stupeni', dims(300, 1200, Object.assign(type('STEP-01'), cnt(1))));
  const m = report(t, 'step x1', r);
  assert.equal(m.nSlabs, 1);
  assert.equal(inputs.job.pieces[0].count, 1);
  close(inputs.job.mainAreaM2, 0.36);
});

test('«Ступени»: 4 steps on ONE slab; the price is one step x 4 for the work and the real layout for the stone', t => {
  const stone = stock(3, 300, 180);
  const one = priceState(stone, 'stupeni', dims(300, 1200, Object.assign(type('STEP-01'), cnt(1))), { rates: WORK_RATES.stupeni });
  const four = priceState(stone, 'stupeni', dims(300, 1200, Object.assign(type('STEP-01'), cnt(4))), { rates: WORK_RATES.stupeni });
  const m = report(t, 'step x4', four.r);
  assert.equal(m.nSlabs, 1, 'all 4 from one slab');
  close(four.r.fabrication, 4 * one.r.fabrication, 'fabrication = one step x 4');
  assert.equal(four.r.subtotal, one.r.subtotal, 'the same single slab');
  assert.ok(four.r.total > one.r.total);
});

test('«Ступени»: a count that needs 2+ slabs -- each slab within the reserve', t => {
  const r = priceState(stock(10, 300, 180), 'stupeni', dims(300, 1200, Object.assign(type('STEP-01'), cnt(20)))).r;
  const m = report(t, 'step x20', r);
  assert.ok(m.nSlabs >= 2);
  assert.equal(m.pieceCount, 20);
  close(m.productAreaM2, 7.2);
});

test('«Ступени» + подступенки: risers are their own parts -- in the same layout, their own (unset) rates, never the step\'s', t => {
  const stone = stock(4, 300, 180);
  const values = dims(300, 1200, Object.assign(type('STEP-01'), cnt(4), { 'stupeni-riser': { checked: true }, 'riser-height': { value: '170' } }));
  const { r, inputs } = priceState(stone, 'stupeni', values, { rates: WORK_RATES.stupeni, installEnabled: true });
  const m = report(t, 'step x4 + risers', r);
  const riser = inputs.job.pieces.find(p => p.group === 'riser');
  assert.equal(riser.count, 4);
  close(inputs.job.riserAreaM2, 4 * 1.2 * 0.17);
  close(m.productAreaM2, 1.44 + 4 * 1.2 * 0.17, 'the stone of steps and risers');
  assert.equal(m.pieceCount, 8);
  assert.equal(m.nSlabs, 1, 'the risers fit the steps\' slab');
  // Work: the steps at the step rate on the steps' area only.
  close(r.fabrication, WORK_RATES.stupeni.fabricationRatePerM2 * 1.44);
  const g = r.groups.find(x => x.key === 'riser');
  assert.deepEqual(g.unpriced, ['fabrication', 'installation'], 'no company rate for risers yet');
  assert.equal(g.work, 0);
  assert.ok(g.stone >= 0);
  // With a riser rate: exactly that rate x the risers' area.
  const rated = priceState(stone, 'stupeni', values, { rates: WORK_RATES.stupeni, riserRates: { fabricationRatePerM2: 10000, installationRatePerM2: null, polishRatePerM2: null } }).r;
  close(rated.groups[0].fabrication, 10000 * 4 * 1.2 * 0.17);
  close(rated.total, rated.subtotal + rated.fabrication + rated.misc + rated.groupWork + rated.extras + rated.catalogExtras + rated.installation + rated.polish);
  // Risers chosen without a height: no price for a made-up riser.
  const noHeight = inputsFor(stateFor('stupeni', dims(300, 1200, Object.assign(type('STEP-01'), cnt(4), { 'stupeni-riser': { checked: true } }))));
  assert.deepEqual(noHeight.job.missing, ['riserHeight']);
});

test('radius step: «Глубина ступени» is the deepest point -- the 3D reaches it, the price counts the real shape', t => {
  const values = dims(300, 1200, Object.assign(type('STEP-03'), cnt(1)));
  const state = stateFor('stupeni', values);
  const plan = GeometryModel.stairPlan('steps', 'radius', 1.2, 0.3, 1);
  close(plan.edgeDepthM + plan.bulgeM, 0.3, 'side depth + arc = the entered depth');
  const tread = SceneLayout.buildSceneLayout(GeometryModel.buildGeometryModel(state)).parts.find(p => p.name === 'tread');
  const xs = tread.outline.map(p => p[0]);
  close(Math.max(...xs) - Math.min(...xs), 0.3, '3D depth at the deepest point', 1e-9);
  const job = inputsFor(state).job;
  close(job.mainAreaM2, GeometryModel.polygonArea(tread.outline), 'the priced area is the drawn shape', 2e-3);
  assert.ok(job.mainAreaM2 < 1.2 * 0.3, 'less than the bounding rectangle');
  const r = priceJob(stock(2, 300, 180), job);
  report(t, 'radius step', r);
});

// ---- «Лестницы» ------------------------------------------------------------------------

test('Г-образная лестница: 2 marches x N steps + 1 landing, all priced', t => {
  const { r, inputs, state } = priceState({ slabs: REAL.slabs }, 'lestnitsa', dims(1000, 3000, Object.assign(type('STAIR-03'), cnt(6))));
  assert.equal(state.stepCount, 12);
  assert.deepEqual([state.productConfig.lestnitsa.marches, state.productConfig.lestnitsa.stepsPerMarch, state.productConfig.lestnitsa.landings], [2, 6, 1]);
  const d = (3 - 1) / 6;
  close(inputs.job.mainAreaM2, 12 * 1 * d + 1 * 1, 'treads + the landing');
  const landing = inputs.job.pieces.find(p => p.key === 'landing');
  assert.equal(landing.count, 1);
  // The same as the 3D draws.
  const layout = SceneLayout.buildSceneLayout(GeometryModel.buildGeometryModel(state));
  const drawn = layout.parts.filter(p => p.role === 'stone' && (p.name === 'tread' || p.name === 'landing')).reduce((s, p) => s + GeometryModel.polygonArea(p.outline), 0);
  close(drawn, inputs.job.mainAreaM2, 'the drawn treads and landing');
  report(t, 'Г stair 2x6', r);
});

test('П-образная лестница: 2 marches, the landing spans both marches and the gap', t => {
  const { r, inputs } = priceState({ slabs: REAL.slabs }, 'lestnitsa', dims(1000, 3000, Object.assign(type('STAIR-05'), cnt(6))));
  const landing = inputs.job.pieces.find(p => p.key === 'landing');
  close(landing.areaM2, (2 * 1 + GeometryModel.U_FLIGHT_GAP_M) * 1);
  close(inputs.job.mainAreaM2, 12 * (2 / 6) + 2.1);
  report(t, 'П stair 2x6', r);
});

test('several marches -> marches - 1 landings (the stair model is general; the 3D offers Г/П with two)', () => {
  const plan = { flights: [5, 5, 5], landings: [{ lengthM: 1, widthM: 1 }, { lengthM: 1, widthM: 1 }], treadLengthM: 1, treadDepthM: 0.3 };
  const pieces = ProductParts.flightPieces(plan, 0.17);
  assert.equal(pieces.find(p => p.key === 'tread').count, 15);
  assert.equal(pieces.filter(p => p.key === 'landing').length, 2, '3 marches -> 2 landings');
  assert.equal(pieces.find(p => p.key === 'riser').count, 15 + 2, 'a riser under every step and every landing edge');
  const two = GeometryModel.stairPlan('flight', 'l', 3, 1, 10);
  assert.equal(two.marches, 2);
  assert.equal(two.landings.length, two.marches - 1);
  assert.equal(GeometryModel.stairPlan('flight', 'straight', 3, 1, 10).landings.length, 0);
});

test('the size diagram and its tread-depth hint use the same stair as the 3D: marches x the steps of one march', () => {
  const html = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'sayanmramor-calculator.html'), 'utf8');
  const start = html.indexOf('function currentStairPlan');
  const fn = html.slice(start, html.indexOf('\n  }\n', start));
  assert.match(fn, /const marches = currentMarches\(\);/);
  assert.match(fn, /const total = count \* Math\.max\(1, marches\);/);
  assert.match(fn, /stairPlan\('flight', variant, lengthM, widthM, total, marches\)/);
  // The same depth as the 3D's plan for 6 steps in each of 2 marches.
  const state = stateFor('lestnitsa', dims(1000, 3000, Object.assign(type('STAIR-03'), cnt(6))));
  close(GeometryModel.buildGeometryModel(state).stairs.plan.treadDepthM, (3 - 1) / 6, 'the 3D tread depth');
  close(GeometryModel.stairPlan('flight', 'l', 3, 1, 6 * 2).treadDepthM, (3 - 1) / 6, 'the diagram with marches x 6');
});

test('a stair with risers: every step and the landing edge; the height is required', t => {
  const { r, inputs } = priceState({ slabs: REAL.slabs }, 'lestnitsa', dims(1000, 3000, Object.assign(type('STAIR-04'), cnt(6), { 'riser-height': { value: '170' } })));
  assert.equal(inputs.job.pieces.find(p => p.group === 'riser').count, 13);
  report(t, 'Г stair 2x6 + risers', r);
  assert.deepEqual(inputsFor(stateFor('lestnitsa', dims(1000, 3000, Object.assign(type('STAIR-04'), cnt(6))))).job.missing, ['riserHeight']);
});

test('wedge steps are cut in pairs head to tail: (narrow + 3 x wide) / 2 per pair, an odd one alone', () => {
  const plan = GeometryModel.stairPlan('steps', 'winder', 1.2, 0.3, 5);
  const one = ProductParts.wedgeShape(plan, false);
  const half = plan.angle / 2, a = 2 * plan.rIn * Math.sin(half), b = 2 * plan.rOut * Math.sin(half);
  close(one.widthM, b, 'one wedge: the wide end');
  const { pieces } = ProductParts.wedgePieces(plan, false, 5, 'Ступень');
  const pair = pieces.find(p => p.key === 'tread-pair'), single = pieces.find(p => p.key === 'tread');
  assert.equal(pair.count, 2);
  assert.equal(single.count, 1);
  close(pair.widthM, (a + 3 * b) / 2, 'the pair');
  assert.ok(pair.widthM < 2 * b, 'narrower than two wide ends');
  close(pair.areaM2 * 2 + single.areaM2, 5 * one.areaM2, 'the area of all 5 steps');
  // Two rectangles (a = b) side by side: exactly 2b.
  close((b + 3 * b) / 2, 2 * b);
});

test('винтовая лестница: the count changes the area, the stone and the price -- not "diameter x width"', t => {
  const price = n => priceState({ slabs: REAL.slabs }, 'lestnitsa', dims(800, 2000, Object.assign(type('STAIR-07'), cnt(n))), { rates: WORK_RATES.lestnitsa });
  const p12 = price(12), p24 = price(24);
  const plan = GeometryModel.stairPlan('flight', 'spiral', 2, 0.8, 12);
  const wedge = plan.angle / 2 * (plan.rOut * plan.rOut - plan.rIn * plan.rIn);
  close(p12.inputs.job.mainAreaM2, 12 * wedge, '12 wedge steps');
  close(p24.inputs.job.mainAreaM2, 24 * wedge, '24 wedge steps');
  assert.notEqual(p12.inputs.job.mainAreaM2, 2 * 0.8, 'not diameter x width');
  assert.ok(p24.r.total > p12.r.total && p24.r.fabrication > p12.r.fabrication);
  // As drawn.
  const layout = SceneLayout.buildSceneLayout(GeometryModel.buildGeometryModel(p12.state));
  const drawn = layout.parts.filter(p => p.name === 'tread').reduce((s, p) => s + GeometryModel.polygonArea(p.outline), 0);
  close(drawn, p12.inputs.job.mainAreaM2, 'the drawn wedges', 0.02);
  report(t, 'spiral x12', p12.r);
  report(t, 'spiral x24', p24.r);
});

// ---- countertops -----------------------------------------------------------------------

test('Г-образная столешница: one product, the main run + the wing -- one area; the wing is its own piece (joined by a seam)', t => {
  const wing = { 'wing-width': { value: '600' }, 'wing-length': { value: '1400' } };
  const { r, inputs } = priceState({ slabs: REAL.slabs }, 'stoleshnitsa_kuhnya', dims(600, 2400, Object.assign({ productShape: { value: 'lshape' } }, wing)), { rates: WORK_RATES.stoleshnitsa_kuhnya });
  close(inputs.job.mainAreaM2, 1.44 + 0.84);
  assert.equal(inputs.job.pieces.length, 2);
  close(r.fabrication, WORK_RATES.stoleshnitsa_kuhnya.fabricationRatePerM2 * 2.28, 'the work on the whole area');
  report(t, 'Г countertop', r);
});

test('П-образная столешница: the main run + two wings', t => {
  const wing = { 'wing-width': { value: '600' }, 'wing-length': { value: '1400' } };
  const { r, inputs } = priceState({ slabs: REAL.slabs }, 'stoleshnitsa_kuhnya', dims(600, 2400, Object.assign({ productShape: { value: 'ushape' } }, wing)));
  close(inputs.job.mainAreaM2, 1.44 + 2 * 0.84);
  assert.equal(r.material.pieceCount, 3);
  report(t, 'П countertop', r);
});

test('a run too long for any slab is cut into segments with seams (as before); each within the reserve', t => {
  const r = priceJob(stock(10, 300, 180), { pieces: [{ key: 'main', group: 'main', lengthM: 7, widthM: 0.65, areaM2: 4.55, count: 1, seam: true }] });
  const m = report(t, '7000 x 650 run', r);
  assert.ok(m.seams >= 2, 'at least 3 segments of < 3 m');
  close(m.productAreaM2, 4.55);
});

// ---- walls and sills --------------------------------------------------------------------

test('радиусная стена: the radius and the arc length the client enters; area = arc x height; the 3D arc is that long', t => {
  const values = dims(4000, 2700, Object.assign(type('WALL-04'), { 'wall-radius': { value: '3000' } }));
  const state = stateFor('stena', values);
  const job = inputsFor(state).job;
  close(job.surfaceAreaM2, 4 * 2.7, 'arc x height');
  const arc = GeometryModel.radiusWallPlan(3, 4);
  assert.ok(arc.chordM < 4, 'the chord is shorter than the arc');
  const wall = SceneLayout.buildSceneLayout(GeometryModel.buildGeometryModel(state)).parts.find(p => p.name === 'wall');
  // The front edge of the drawn wall: its first half of the outline.
  const front = wall.outline.slice(0, wall.outline.length / 2);
  let len = 0;
  for (let i = 1; i < front.length; i++) len += Math.hypot(front[i][0] - front[i - 1][0], front[i][1] - front[i - 1][1]);
  close(len, 4, 'the drawn arc length', 0.01);
  report(t, 'radius wall R3000 arc 4000 x 2700', priceJob({ slabs: REAL.slabs }, job));
  assert.deepEqual(inputsFor(stateFor('stena', dims(4000, 2700, type('WALL-04')))).job.missing, ['wallRadius']);
  assert.deepEqual(inputsFor(stateFor('stena', dims(20000, 2700, Object.assign(type('WALL-04'), { 'wall-radius': { value: '3000' } })))).job.missing, ['wallArc'], 'longer than the whole circle');
});

test('угловой подоконник: the main run + the second arm (entered), two pieces', t => {
  const { r, inputs } = priceState({ slabs: REAL.slabs }, 'podokonnik', dims(300, 1500, Object.assign(type('SILL-02'), { 'sill-arm-length': { value: '900' } })));
  close(inputs.job.mainAreaM2, 1.5 * 0.3 + (0.9 - 0.3) * 0.3);
  assert.equal(inputs.job.pieces.length, 2);
  report(t, 'corner sill', r);
  assert.deepEqual(inputsFor(stateFor('podokonnik', dims(300, 1500, type('SILL-02')))).job.missing, ['sillArm']);
});

test('эркерный подоконник: the bay\'s depth and front (entered); the real shape\'s area', t => {
  const { r, inputs } = priceState({ slabs: REAL.slabs }, 'podokonnik', dims(300, 1500, Object.assign(type('SILL-03'), { 'sill-bay-depth': { value: '400' }, 'sill-bay-front': { value: '800' } })));
  // The room part 1.5 x 0.3 plus the trapezoid (1.5 + 0.8) / 2 x 0.4.
  close(inputs.job.mainAreaM2, 1.5 * 0.3 + (1.5 + 0.8) / 2 * 0.4);
  report(t, 'bay sill', r);
  const radius = priceState({ slabs: REAL.slabs }, 'podokonnik', dims(300, 1500, Object.assign(type('SILL-04'), { 'sill-bay-depth': { value: '400' } })));
  const R = (0.75 * 0.75 + 0.16) / 0.8, half = Math.asin(0.75 / R);
  close(radius.inputs.job.mainAreaM2, 1.5 * 0.3 + (R * R * (2 * half - Math.sin(2 * half)) / 2), 'the circular segment', 2e-3);
  report(t, 'radius bay sill', radius.r);
  assert.deepEqual(inputsFor(stateFor('podokonnik', dims(300, 1500, type('SILL-03')))).job.missing, ['sillBayDepth', 'sillBayFront']);
});

// ---- facades ------------------------------------------------------------------------------

test('фасадные элементы: the pieces add up to the facade formula; a round column is a surface', t => {
  const facade = (id, form, params, qty) => {
    const values = { productSubcategory: { value: id }, 'facade-form': { value: form || '' }, 'facade-quantity': { value: String(qty || '') } };
    Object.keys(params).forEach(k => { values[k] = { value: String(params[k]) }; });
    return priceState({ slabs: REAL.slabs }, 'fasad', values);
  };
  [
    ['window x2', facade('FACADE-02', 'window', { 'facade-opening-width': 1200, 'facade-opening-height': 1500, 'facade-frame': 150 }, 2)],
    ['door', facade('FACADE-02', 'door', { 'facade-opening-width': 1000, 'facade-opening-height': 2100, 'facade-frame': 150 }, 1)],
    ['square column x2', facade('FACADE-03', 'square', { 'facade-side': 400, 'facade-height': 3000 }, 2)],
    ['pilaster x3', facade('FACADE-06', null, { 'facade-width': 400, 'facade-projection': 100, 'facade-height': 3000 }, 3)],
    ['decor x2', facade('FACADE-05', null, { 'facade-width': 800, 'facade-height': 600 }, 2)],
    ['round column x4', facade('FACADE-03', 'round', { 'facade-radius': 200, 'facade-height': 3000 }, 4)],
    ['facade wall', facade('FACADE-01', null, { 'facade-length': 6000, 'facade-height': 3000 })],
  ].forEach(([name, { r, inputs, state }]) => {
    close(inputs.job.mainAreaM2, state.productConfig.fasad.areaM2, name + ': the pieces = the formula', 1e-9);
    report(t, name, r);
  });
});

// ---- surfaces, sizes, impossible layouts ---------------------------------------------

test('облицовка (пол / стена): cut freely, each slab up to 65% -- the reserve is at least 35%', t => {
  const r = priceState({ slabs: REAL.slabs }, 'pol', dims(3000, 4000, type('FLOOR-01'))).r;
  const m = report(t, 'floor 3x4', r);
  assert.ok(m.waste >= 0.35 - 1e-9 && m.waste < 0.45);
});

test('small and large sizes on real slabs: 1 mm to a 9 m countertop, every slab within the reserve', t => {
  [[0.001, 0.001], [0.3, 0.3], [0.6, 2.4], [0.9, 4.2], [0.65, 9]].forEach(([w, l]) => {
    const r = priceJob({ slabs: REAL.slabs }, { pieces: [{ key: 'main', group: 'main', lengthM: l, widthM: w, areaM2: w * l, count: 1, seam: true }] });
    assert.equal(r.ok, true, w + 'x' + l);
    report(t, w + 'x' + l, r);
  });
});

test('impossible layouts are named, never priced: too wide, too big for the reserve, not enough stock', () => {
  const stone = stock(3, 300, 180);
  // 3.2 x 3.1: even its short side (plus margins) is longer than any slab side.
  assert.equal(priceJob(stone, { pieces: [{ key: 'p', group: 'main', lengthM: 3.2, widthM: 3.1, areaM2: 9.92, count: 1, seam: true }] }).reason, 'no_fitting_slab', 'wider than every slab');
  // 2 x 1.9 is not: its 1.9 m fits across the slab's 3 m, cut with a seam.
  assert.equal(priceJob(stock(4, 300, 180), { pieces: [{ key: 'p', group: 'main', lengthM: 2, widthM: 1.9, areaM2: 3.8, count: 1, seam: true }] }).ok, true);
  // Fits a 300 x 180 slab, but takes 2.8 x 1.6 = 83% of it -- and may not be split.
  assert.equal(priceJob(stone, { pieces: [{ key: 'p', group: 'main', lengthM: 2.8, widthM: 1.6, areaM2: 4.48, count: 1, seam: false }] }).reason, 'exceeds_usage_limit');
  // The same piece may have a seam: split until each part fits the reserve.
  const split = priceJob(stock(4, 300, 180), { pieces: [{ key: 'p', group: 'main', lengthM: 2.8, widthM: 1.6, areaM2: 4.48, count: 1, seam: true }] });
  assert.equal(split.ok, true);
  assert.ok(split.material.seams >= 1);
  assert.equal(priceJob(stone, { pieces: [{ key: 'p', group: 'main', lengthM: 1.2, widthM: 0.3, areaM2: 0.36, count: 60, seam: false }] }).reason, 'insufficient_stock');
});

test('the layout is fast on the real stock (668 slabs), even for 60 pieces', () => {
  const t0 = Date.now();
  const r = priceState({ slabs: REAL.slabs }, 'lestnitsa', dims(1200, 5000, Object.assign(type('STAIR-06'), cnt(30), { 'riser-height': { value: '170' } }))).r;
  assert.equal(r.ok, true);
  assert.ok(Date.now() - t0 < 1500, (Date.now() - t0) + ' ms');
});
