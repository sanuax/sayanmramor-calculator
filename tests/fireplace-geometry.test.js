// tests/fireplace-geometry.test.js
//
// «Камины», the one plan of stone plates (GeometryModel.fireplacePlan) and
// its 3D (SceneLayout): the plates each form is made of, that their faces
// add up to the model's area, that every size moves the plates it should,
// that the firebox, glass and wall are never stone, that no two faces share
// a plane, and that a fireplace never falls through to the countertop.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createFakeDoc } = require('./helpers/fake-dom.js');
const FireplaceModel = require('../fireplace-model.js');
const ConstructorState = require('../constructor-state.js');
const ProductTypes = require('../product-types.js');
const GeometryModel = require('../visualizer/geometry-model.js');
const SceneLayout = require('../visualizer/scene-layout.js');

const { PARAM_FIELDS, FORM_FIELD } = FireplaceModel;
const T = FireplaceModel.PLATE_THICKNESS_M;
const EPS = 1e-9;
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
// Sizes as fireplace-model gives them: metres, an empty field is null.
const toM = sizesMm => Object.fromEntries(Object.entries(sizesMm).map(([k, mm]) => [k, mm === '' ? null : mm / 1000]));

function planOf(formId, overridesMm) {
  const type = TYPE_OF_FORM[formId];
  return GeometryModel.fireplacePlan(type, FireplaceModel.getForm(type, formId), toM(sizes(formId, overridesMm)));
}

// The whole path the page will take: page fields (the type in the
// subcategory select, the form, the sizes) -> ConstructorState (through
// fireplace-model) -> GeometryModel -> SceneLayout.
function modelOf(formId, overridesMm) {
  const type = TYPE_OF_FORM[formId];
  const values = { productSubcategory: { value: type.id }, [FORM_FIELD]: { value: formId } };
  Object.entries(sizes(formId, overridesMm)).forEach(([k, mm]) => { values[PARAM_FIELDS[k]] = { value: mm === '' ? '' : String(mm) }; });
  const doc = createFakeDoc(Object.assign({ width: { value: '650' }, length: { value: '2400' } }, values));
  const state = ConstructorState.readConstructorState({ doc, selectedProductKey: 'kaminy', product: ProductTypes.PRODUCTS.kaminy, stone: null, hasAdditionalWork: ProductTypes.hasAdditionalWork });
  return GeometryModel.buildGeometryModel(state);
}
const layoutOf = (formId, overridesMm) => SceneLayout.buildSceneLayout(modelOf(formId, overridesMm));

// A box part's extent: [[x0,x1],[y0,y1],[z0,z1]].
const extent = b => [0, 1, 2].map(i => [b.center[i] - b.size[i] / 2, b.center[i] + b.size[i] / 2]);
const AXES = { x: 0, y: 1, z: 2 };

// ---- A. a plan for every variant ------------------------------------------------

test('A. every variant has a plan: portal with / without a shelf, cladding, podium', () => {
  VARIANTS.forEach(formId => {
    const plan = planOf(formId);
    assert.equal(plan.ok, true, formId);
    assert.equal(plan.type, TYPE_OF_FORM[formId].key, formId);
    assert.equal(plan.form, formId, formId);
    assert.deepEqual(plan.missing, [], formId);
    assert.deepEqual(plan.violations, [], formId);
    assert.equal(plan.thicknessM, 0.03);
  });
});

// ---- B. the plates of each form -----------------------------------------------------

test('B. portal: 11 stone plates with and without a shelf -- the shelf or the lintel top', () => {
  const common = [
    'portal-pier-left', 'portal-pier-right', 'portal-pier-side-left', 'portal-pier-side-right',
    'portal-opening-left', 'portal-opening-right', 'portal-lintel-front',
    'portal-lintel-side-left', 'portal-lintel-side-right', 'portal-lintel-bottom',
  ];
  assert.deepEqual(planOf('with-shelf').plates.map(p => p.key), common.concat('portal-shelf'));
  assert.deepEqual(planOf('without-shelf').plates.map(p => p.key), common.concat('portal-lintel-top'));
});

test('B. cladding: 6 plates with the firebox above the floor, 5 with it on the floor', () => {
  assert.deepEqual(planOf('cladding').plates.map(p => p.key), [
    'cladding-front-left', 'cladding-front-right', 'cladding-front-top', 'cladding-front-bottom',
    'cladding-side-left', 'cladding-side-right',
  ]);
  assert.deepEqual(planOf('cladding', { fireboxBottom: 0 }).plates.map(p => p.key), [
    'cladding-front-left', 'cladding-front-right', 'cladding-front-top', 'cladding-side-left', 'cladding-side-right',
  ]);
});

test('B. podium: 4 plates', () => {
  assert.deepEqual(planOf('podium').plates.map(p => p.key), ['podium-top', 'podium-front', 'podium-side-left', 'podium-side-right']);
});

test('B. every plate is one piece with a unique key, a label and a face ready for the cut', () => {
  VARIANTS.forEach(formId => {
    const plates = planOf(formId).plates;
    assert.equal(new Set(plates.map(p => p.key)).size, plates.length, formId);
    plates.forEach(p => {
      assert.ok(p.label, p.key);
      assert.equal(p.count, 1, p.key);
      assert.ok(p.lengthM >= p.widthM && p.widthM > 0, p.key);
      close(p.areaM2, p.lengthM * p.widthM, p.key);
    });
  });
});

// ---- C. area -------------------------------------------------------------------------

test('C. the plates\' faces add up to the plan\'s area, which is the model\'s formula', () => {
  const expected = { 'with-shelf': 1.9352, 'without-shelf': 1.82, cladding: 6.22, podium: 1.35 };
  VARIANTS.forEach(formId => {
    const plan = planOf(formId);
    const type = TYPE_OF_FORM[formId];
    const sum = plan.plates.reduce((s, p) => s + p.areaM2 * p.count, 0);
    close(sum, plan.areaM2, formId + ' plates vs plan');
    const model = FireplaceModel.computeArea(type, FireplaceModel.getForm(type, formId), toM(SIZES[formId]));
    close(plan.areaM2, model.areaM2, formId + ' plan vs model');
    close(plan.areaM2, expected[formId], formId);
  });
});

test('C. a plate\'s solid is its face, shortened by exactly one plate thickness where a neighbour covers its edge', () => {
  VARIANTS.forEach(formId => {
    planOf(formId).plates.forEach(p => {
      const n = AXES[p.normal];
      close(p.size[n], T, p.key + ' is T thick');
      const inFace = p.size.filter((_, i) => i !== n).sort((a, b) => b - a);
      const face = [p.lengthM, p.widthM];
      // Each in-face side is the face's own or T shorter (never longer).
      const matches = (sides, f) => sides.every((s, i) => [0, T].some(trim => Math.abs(f[i] - trim - s) < EPS));
      assert.ok(matches(inFace, face) || matches(inFace, face.slice().reverse()), p.key + ': ' + inFace + ' vs face ' + face);
    });
  });
});

// ---- D. every size moves the plates it should -------------------------------------------

const EXPECTED_CHANGES = {
  'with-shelf': {
    openingWidth: ['portal-lintel-front', 'portal-lintel-bottom', 'portal-opening-left', 'portal-opening-right', 'portal-shelf'],
    openingHeight: ['portal-pier-left', 'portal-pier-side-left', 'portal-opening-left', 'portal-lintel-front', 'portal-shelf'],
    pierWidth: ['portal-pier-left', 'portal-pier-side-left', 'portal-lintel-front', 'portal-shelf'],
    lintelHeight: ['portal-lintel-front', 'portal-lintel-side-left', 'portal-shelf'],
    depth: ['portal-pier-left', 'portal-pier-side-left', 'portal-opening-left', 'portal-lintel-bottom', 'portal-shelf'],
    shelfProjection: ['portal-shelf'],
  },
  'without-shelf': {
    openingWidth: ['portal-lintel-front', 'portal-lintel-bottom', 'portal-lintel-top'],
    openingHeight: ['portal-pier-left', 'portal-lintel-front', 'portal-lintel-top'],
    pierWidth: ['portal-pier-left', 'portal-lintel-front', 'portal-lintel-top'],
    lintelHeight: ['portal-lintel-front', 'portal-lintel-side-left', 'portal-lintel-top'],
    depth: ['portal-pier-side-left', 'portal-opening-left', 'portal-lintel-bottom', 'portal-lintel-top'],
  },
  cladding: {
    claddingWidth: ['cladding-front-left', 'cladding-side-left'],
    claddingHeight: ['cladding-front-left', 'cladding-front-top', 'cladding-side-left'],
    depth: ['cladding-front-left', 'cladding-side-left'],
    fireboxWidth: ['cladding-front-left', 'cladding-front-top', 'cladding-front-bottom'],
    fireboxHeight: ['cladding-front-top'],
    fireboxBottom: ['cladding-front-top', 'cladding-front-bottom'],
  },
  podium: {
    length: ['podium-top', 'podium-front', 'podium-side-left'],
    depth: ['podium-top', 'podium-front', 'podium-side-left'],
    height: ['podium-top', 'podium-front', 'podium-side-left'],
  },
};

const plateState = p => JSON.stringify([p.center, p.size, p.areaM2]);

test('D. every size changes the plates it shapes (and the 3D); only the firebox height keeps the area', () => {
  VARIANTS.forEach(formId => {
    const base = planOf(formId);
    const byKey = Object.fromEntries(base.plates.map(p => [p.key, plateState(p)]));
    assert.deepEqual(Object.keys(EXPECTED_CHANGES[formId]).sort(), Object.keys(SIZES[formId]).sort(), formId + ': every size is covered');
    Object.entries(EXPECTED_CHANGES[formId]).forEach(([key, plates]) => {
      const plan = planOf(formId, { [key]: SIZES[formId][key] + 10 });
      assert.equal(plan.ok, true, formId + '/' + key);
      const changed = plan.plates.filter(p => byKey[p.key] !== plateState(p)).map(p => p.key);
      plates.forEach(k => assert.ok(changed.includes(k), formId + '/' + key + ' must move ' + k + ' (moved: ' + changed + ')'));
      if (key === 'fireboxBottom') close(plan.areaM2, base.areaM2, formId + '/' + key + ' keeps the area');
      else assert.ok(Math.abs(plan.areaM2 - base.areaM2) > 1e-6, formId + '/' + key + ' changes the area');
      // The 3D follows: the scene's stone parts move with the plan.
      const before = JSON.stringify(layoutOf(formId).parts.filter(p => p.role === 'stone'));
      const after = JSON.stringify(layoutOf(formId, { [key]: SIZES[formId][key] + 10 }).parts.filter(p => p.role === 'stone'));
      assert.notEqual(after, before, formId + '/' + key + ' redraws the 3D');
    });
  });
});

test('D. the firebox height moves the firebox and its glass, and the panels around it', () => {
  const low = planOf('cladding', { fireboxBottom: 100 });
  const high = planOf('cladding', { fireboxBottom: 500 });
  const fb = plan => plan.visual.find(v => v.key === 'firebox');
  close(extent(fb(low))[1][0], 0.1, 'firebox bottom at e');
  close(extent(fb(high))[1][0], 0.5, 'firebox bottom at e');
  close(low.areaM2, high.areaM2, 'same stone');
});

test('D. the geometry works in the model\'s metres: sizes come out as entered, no mm round trip', () => {
  const plan = planOf('with-shelf');
  const pier = plan.plates.find(p => p.key === 'portal-pier-left');
  close(pier.lengthM, 0.7);
  close(pier.widthM, 0.25);
  assert.deepEqual(plan.extent, { widthM: 0.9 + 0.5 + 0.12, heightM: 0.7 + 0.25 + T, depthM: 0.2 + 0.06 });
});

// ---- where things stand -------------------------------------------------------------------------

test('the fireplace stands on the floor against the wall (x = 0), the shelf on top, the firebox in the opening', () => {
  VARIANTS.forEach(formId => {
    const plan = planOf(formId);
    plan.plates.forEach(p => {
      const [x, y] = extent(p);
      assert.ok(x[0] >= -EPS, p.key + ' stays in front of the wall');
      assert.ok(y[0] >= -EPS, p.key + ' stays above the floor');
    });
    assert.ok(plan.plates.some(p => Math.abs(extent(p)[1][0]) < EPS), formId + ' stands on the floor');
    assert.ok(plan.plates.some(p => Math.abs(extent(p)[0][0]) < EPS), formId + ' touches the wall');
  });
  const shelf = planOf('with-shelf').plates.find(p => p.key === 'portal-shelf');
  close(extent(shelf)[1][0], 0.7 + 0.25, 'the shelf lies on the lintel');
  close(extent(shelf)[0][1], 0.2 + 0.06, 'the shelf reaches o past the front');
  // Portal: the firebox is set into the wall behind the opening, exactly its size.
  const pf = planOf('with-shelf').visual.find(v => v.key === 'firebox');
  assert.deepEqual(extent(pf).map(r => r.map(v => Math.round(v * 1e6) / 1e6)), [[-0.3, 0], [0, 0.7], [-0.45, 0.45]]);
  // Cladding: the firebox is inside the box, behind the front, centred.
  const cf = planOf('cladding').visual.find(v => v.key === 'firebox');
  const [cx, cy, cz] = extent(cf);
  close(cx[1], 0.5 - T, 'firebox front at the back of the front panels');
  assert.ok(cx[0] >= -EPS);
  close(cy[0], 0.4); close(cy[1], 1.0);
  close(cz[0], -0.45); close(cz[1], 0.45);
});

// ---- E. visualOnly ----------------------------------------------------------------------------------

test('E. the firebox, its glass and the wall are never plates', () => {
  VARIANTS.forEach(formId => {
    const plan = planOf(formId);
    const plateKeys = plan.plates.map(p => p.key);
    plan.visual.forEach(v => assert.ok(!plateKeys.includes(v.key), formId + ': ' + v.key));
    assert.ok(!plateKeys.some(k => /firebox|glass|wall/.test(k)), formId);
  });
  assert.deepEqual(planOf('with-shelf').visual.map(v => [v.key, v.role]), [['firebox', 'metal']]);
  assert.deepEqual(planOf('without-shelf').visual.map(v => [v.key, v.role]), [['firebox', 'metal']]);
  assert.deepEqual(planOf('cladding').visual.map(v => [v.key, v.role]), [['firebox', 'metal'], ['firebox-glass', 'glass']]);
  assert.deepEqual(planOf('podium').visual, []);
});

test('E. in the scene: exactly the plates are stone; the firebox and glass are visualOnly; nothing else is added', () => {
  VARIANTS.forEach(formId => {
    const plan = planOf(formId);
    const layout = layoutOf(formId);
    const stone = layout.parts.filter(p => p.role === 'stone');
    assert.deepEqual(stone.map(p => p.name), plan.plates.map(p => p.key), formId);
    stone.forEach((p, i) => {
      assert.equal(p.visualOnly, undefined, p.name + ' is priced stone');
      assert.deepEqual(p.center, plan.plates[i].center, p.name);
      assert.deepEqual(p.size, plan.plates[i].size, p.name);
    });
    const visual = layout.parts.filter(p => p.role === 'metal' || p.role === 'glass');
    assert.deepEqual(visual.map(p => p.name), plan.visual.map(v => v.key), formId);
    visual.forEach(p => assert.equal(p.visualOnly, true, p.name));
    // No other roles: stone, the firebox (metal/glass) and the wall (context).
    assert.ok(layout.parts.every(p => ['stone', 'metal', 'glass', 'context'].includes(p.role)), formId);
  });
});

// ---- F. the wall ----------------------------------------------------------------------------------------

test('F. a context wall stands behind every fireplace; a portal\'s is open around its firebox', () => {
  VARIANTS.forEach(formId => {
    const walls = layoutOf(formId).parts.filter(p => p.name === 'fireplace-wall');
    assert.ok(walls.length > 0, formId);
    walls.forEach(w => {
      assert.equal(w.role, 'context');
      assert.ok(extent(w)[0][1] <= EPS, formId + ': the wall is behind x = 0');
    });
  });
  assert.equal(layoutOf('podium').parts.filter(p => p.name === 'fireplace-wall').length, 1);
  assert.equal(layoutOf('cladding').parts.filter(p => p.name === 'fireplace-wall').length, 1);
  // Portal: three pieces around the opening, none of them in front of the firebox.
  const layout = layoutOf('with-shelf');
  const walls = layout.parts.filter(p => p.name === 'fireplace-wall');
  assert.equal(walls.length, 3);
  const fb = extent(layout.parts.find(p => p.name === 'firebox'));
  walls.forEach(w => {
    const e = extent(w);
    const overlapZ = Math.min(e[2][1], fb[2][1]) - Math.max(e[2][0], fb[2][0]);
    const overlapY = Math.min(e[1][1], fb[1][1]) - Math.max(e[1][0], fb[1][0]);
    assert.ok(overlapZ <= EPS || overlapY <= EPS, 'the wall does not cover the firebox');
  });
  // The wall is not part of the fireplace's bounds (the camera frames the fireplace).
  assert.ok(layout.bounds.min[0] >= -0.3 - EPS);
});

// ---- G. no plan for an impossible fireplace ----------------------------------------------------------------

test('G. a firebox that does not fit its cladding gets no plan -- the model\'s violations, no plates', () => {
  [
    [{ fireboxWidth: 1600 }, 'fireboxWidth'],
    [{ fireboxWidth: 1700 }, 'fireboxWidth'],
    [{ fireboxBottom: 2000 }, 'fireboxHeight'],
    [{ fireboxBottom: 2100 }, 'fireboxHeight'],
  ].forEach(([over, rule]) => {
    const plan = planOf('cladding', over);
    assert.equal(plan.ok, false, JSON.stringify(over));
    assert.deepEqual(plan.plates, []);
    assert.deepEqual(plan.visual, []);
    assert.equal(plan.areaM2, 0);
    assert.deepEqual(plan.violations.map(v => v.rule), [rule], JSON.stringify(over));
  });
  const missing = planOf('podium', { height: '' });
  assert.equal(missing.ok, false);
  assert.deepEqual(missing.missing, ['height']);
});

test('G. sizes too small for 30 mm plates get no plan either (plates would run into each other)', () => {
  [
    ['with-shelf', { depth: 30 }, ['depth']],
    ['with-shelf', { pierWidth: 50 }, ['pierWidth']],
    ['without-shelf', { lintelHeight: 50 }, ['lintelHeight']],
    ['cladding', { depth: 20 }, ['depth']],
    ['cladding', { fireboxWidth: 1560 }, ['fireboxWidth', 'claddingWidth']],
    ['podium', { height: 30 }, ['height']],
    ['podium', { length: 50 }, ['length']],
  ].forEach(([formId, over, params]) => {
    const plan = planOf(formId, over);
    assert.equal(plan.ok, false, formId + ' ' + JSON.stringify(over));
    assert.deepEqual(plan.plates, []);
    assert.deepEqual(plan.violations.map(v => [v.rule, v.params]), [['plateThickness', params]], formId + ' ' + JSON.stringify(over));
    assert.ok(plan.violations[0].message.includes('30 мм'));
  });
  // Exactly at the limit is still a fireplace: piers of 2 plates, a firebox margin of one.
  assert.equal(planOf('with-shelf', { pierWidth: 60 }).ok, true);
  assert.equal(planOf('cladding', { fireboxWidth: 1540 }).ok, true);
});

test('G. the plan has no size rules of its own: whatever the model decides, the plan follows', () => {
  // The same verdict, violation for violation, for sizes the model accepts
  // and for every kind it rejects (fit, plate thickness, missing, sign).
  [
    ['with-shelf', {}], ['with-shelf', { depth: 30 }], ['without-shelf', { lintelHeight: 50 }],
    ['cladding', { fireboxWidth: 1700 }], ['cladding', { fireboxWidth: 1560 }], ['cladding', { fireboxBottom: -1 }],
    ['podium', { height: '' }], ['podium', { length: 50 }],
  ].forEach(([formId, over]) => {
    const type = TYPE_OF_FORM[formId];
    const form = FireplaceModel.getForm(type, formId);
    const params = toM(sizes(formId, over));
    const model = FireplaceModel.checkConstraints(type, form, params);
    const plan = GeometryModel.fireplacePlan(type, form, params);
    assert.equal(plan.ok, model.ok, formId + ' ' + JSON.stringify(over));
    assert.deepEqual(plan.missing, model.missing);
    assert.deepEqual(plan.violations, model.violations);
  });
  // No second copy of the rules or of the plate thickness in the geometry.
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'visualizer', 'geometry-model.js'), 'utf8')
    .replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(src, /plateThickness|PLATE_MINIMUMS|0\.03\b/);
  assert.equal(planOf('podium').thicknessM, FireplaceModel.PLATE_THICKNESS_M);
});

test('G. the 3D never draws an impossible fireplace: it shows the form\'s placeholder instead', () => {
  const bad = modelOf('cladding', { fireboxWidth: 1700 }).fireplace;
  assert.equal(bad.placeholder, true);
  assert.equal(bad.plan.ok, true);
  const tooThin = modelOf('with-shelf', { depth: 30 }).fireplace;
  assert.equal(tooThin.placeholder, true);
  assert.equal(tooThin.plan.ok, true);
  const good = modelOf('with-shelf').fireplace;
  assert.equal(good.placeholder, false);
  close(good.plan.areaM2, 1.9352);
  // Every placeholder is itself a valid fireplace.
  [portal, cladding, podium].forEach(t => t.forms.forEach(f => {
    const p = {};
    f.params.forEach(s => { p[s.key] = s.placeholderMm / 1000; });
    assert.equal(GeometryModel.fireplacePlan(t, f, p).ok, true, t.key + '/' + f.id);
  }));
});

// ---- H. firebox on the floor -------------------------------------------------------------------------------

test('H. e = 0: no zero-high panel, the firebox stands on the floor, the area is unchanged', () => {
  const floor = planOf('cladding', { fireboxBottom: 0 });
  const raised = planOf('cladding', { fireboxBottom: 300 });
  assert.equal(floor.ok, true);
  assert.equal(floor.plates.length, 5);
  assert.ok(!floor.plates.some(p => p.key === 'cladding-front-bottom'));
  assert.ok(floor.plates.every(p => p.size.every(s => s > 0)), 'no zero-size plate');
  const fb = extent(floor.visual.find(v => v.key === 'firebox'));
  close(fb[1][0], 0, 'the firebox starts at the floor');
  close(floor.areaM2, raised.areaM2, 'e = 0 vs e = 300');
});

// ---- I. no two faces in one plane ---------------------------------------------------------------------------

// Every face of every box of the scene -- plates, firebox, glass and wall.
// Two boxes may touch; two faces facing the same way must never lie in one
// plane over the same area (they would flicker), and no two boxes may
// overlap in volume.
function assertNoCoplanarFaces(parts, label) {
  const boxes = parts.filter(p => p.kind === 'box').map(p => ({ name: p.name || p.role, e: extent(p) }));
  const overlap = (a, b) => Math.min(a[1], b[1]) - Math.max(a[0], b[0]);
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const A = boxes[i], B = boxes[j];
      const vol = [0, 1, 2].map(k => overlap(A.e[k], B.e[k]));
      assert.ok(!(vol[0] > EPS && vol[1] > EPS && vol[2] > EPS), label + ': ' + A.name + ' and ' + B.name + ' overlap');
      for (let axis = 0; axis < 3; axis++) {
        const others = [0, 1, 2].filter(k => k !== axis);
        const shared = overlap(A.e[others[0]], B.e[others[0]]) > EPS && overlap(A.e[others[1]], B.e[others[1]]) > EPS;
        if (!shared) continue;
        [0, 1].forEach(side => {
          assert.ok(Math.abs(A.e[axis][side] - B.e[axis][side]) > EPS,
            label + ': ' + A.name + ' and ' + B.name + ' share a face (axis ' + 'xyz'[axis] + ', ' + (side ? '+' : '-') + ')');
        });
      }
    }
  }
}

test('I. no two faces share a plane: plates, firebox, glass and wall, every variant', () => {
  VARIANTS.forEach(formId => assertNoCoplanarFaces(layoutOf(formId).parts, formId));
  assertNoCoplanarFaces(layoutOf('cladding', { fireboxBottom: 0 }).parts, 'cladding e = 0');
  // At the plate limits too.
  assertNoCoplanarFaces(layoutOf('with-shelf', { pierWidth: 60, lintelHeight: 30 }).parts, 'portal at the limits');
  assertNoCoplanarFaces(layoutOf('without-shelf', { lintelHeight: 60 }).parts, 'portal without shelf at the limit');
  assertNoCoplanarFaces(layoutOf('cladding', { fireboxWidth: 1540 }).parts, 'cladding at the limit');
});

test('I. the check catches a face laid over another (control)', () => {
  const parts = layoutOf('podium').parts.slice();
  const top = parts.find(p => p.name === 'podium-top');
  parts.push(Object.assign({}, top, { name: 'copy', size: [top.size[0] / 2, top.size[1], top.size[2]], center: [top.size[0] / 4, top.center[1] + top.size[1], top.center[2]] }));
  // The copy sits on the top: its underside and the top's upper face are
  // opposite faces (allowed); now lay a second plate flush with the front.
  const front = parts.find(p => p.name === 'podium-front');
  parts.push(Object.assign({}, front, { name: 'flush', center: [front.center[0], front.center[1], front.center[2]] }));
  assert.throws(() => assertNoCoplanarFaces(parts, 'control'));
});

// ---- J. never the countertop ----------------------------------------------------------------------------------

test('J. a fireplace is never drawn as a countertop -- not even without a plan', () => {
  VARIANTS.forEach(formId => {
    const layout = layoutOf(formId);
    assert.ok(!layout.parts.some(p => p.kind === 'prism'), formId + ': no countertop slab (prism)');
    assert.ok(layout.parts.every(p => p.role !== 'stone' || /^(portal|cladding|podium)-/.test(p.name)), formId);
  });
  // A «kaminy» model without a fireplace: an empty scene, not a slab.
  const model = modelOf('podium');
  const empty = SceneLayout.buildSceneLayout(Object.assign({}, model, { fireplace: null }));
  assert.deepEqual(empty.parts, []);
  // The same sizes as any other product do give the countertop slab -- the
  // branch is what keeps a fireplace out of it.
  const slab = SceneLayout.buildSceneLayout(Object.assign({}, model, { productKey: 'stoleshnitsa_kuhnya', fireplace: null }));
  assert.ok(slab.parts.some(p => p.kind === 'prism' && p.role === 'stone'));
});

test('the geometry model carries the fireplace only for «kaminy», with its own camera angle', () => {
  const model = modelOf('cladding');
  assert.equal(model.productKey, 'kaminy');
  assert.equal(model.cameraPreset, 'front');
  assert.equal(model.fireplace.type, 'cladding');
  assert.equal(model.fireplace.form, 'cladding');
  assert.equal(model.stairs, null);
  assert.equal(model.surface, null);
  assert.equal(model.facade, null);
  Object.keys(ProductTypes.PRODUCTS).filter(key => key !== 'kaminy').forEach(key => {
    const doc = createFakeDoc({ width: { value: '650' }, length: { value: '2400' } });
    const state = ConstructorState.readConstructorState({ doc, selectedProductKey: key, product: ProductTypes.PRODUCTS[key], stone: null, hasAdditionalWork: ProductTypes.hasAdditionalWork });
    assert.equal(GeometryModel.buildGeometryModel(state).fireplace, null, key);
  });
});
