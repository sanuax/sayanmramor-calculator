// tests/fireplace-model.test.js
//
// «Камины», the domain model only: the types and forms a client can pick,
// the sizes each form asks for, how they are read from the page, the rules
// they must keep, the stone area and the description for the Result and
// the lead. No geometry, pricing or page here yet.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createFakeDoc } = require('./helpers/fake-dom.js');
const FireplaceModel = require('../fireplace-model.js');

const { FIREPLACE_TYPES, PARAM_FIELDS, FORM_FIELD } = FireplaceModel;
const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, (msg || '') + ': ' + a + ' vs ' + b);

const portal = FireplaceModel.getTypeByKey('portal');
const cladding = FireplaceModel.getTypeByKey('cladding');
const podium = FireplaceModel.getTypeByKey('podium');

// Sizes in millimetres for every form (valid, the firebox fits its cladding).
const SIZES = {
  'with-shelf': { openingWidth: 900, openingHeight: 700, pierWidth: 250, lintelHeight: 250, depth: 200, shelfProjection: 60 },
  'without-shelf': { openingWidth: 900, openingHeight: 700, pierWidth: 250, lintelHeight: 250, depth: 200 },
  cladding: { claddingWidth: 1600, claddingHeight: 2600, depth: 500, fireboxWidth: 900, fireboxHeight: 600, fireboxBottom: 400 },
  podium: { length: 1800, depth: 450, height: 200 },
};
const TYPE_OF_FORM = { 'with-shelf': portal, 'without-shelf': portal, cladding, podium };

// The page's fields for a fireplace: the form and the sizes (mm), as strings.
function doc(formId, sizesMm) {
  const v = { [FORM_FIELD]: { value: formId || '' } };
  Object.entries(sizesMm).forEach(([key, mm]) => { v[PARAM_FIELDS[key]] = { value: mm === '' ? '' : String(mm) }; });
  return createFakeDoc(v);
}

function configOf(formId, overridesMm) {
  const type = TYPE_OF_FORM[formId];
  return FireplaceModel.readFireplaceConfig(doc(formId, Object.assign({}, SIZES[formId], overridesMm || {})), type.id);
}

const toM = sizesMm => Object.fromEntries(Object.entries(sizesMm).map(([k, mm]) => [k, mm / 1000]));

// ---- A. types and forms -----------------------------------------------------

test('A. the MVP has exactly three types: portal, cladding, podium', () => {
  assert.deepEqual(FIREPLACE_TYPES.map(t => t.key), ['portal', 'cladding', 'podium']);
  assert.ok(portal && cladding && podium);
  assert.equal(portal.title, 'Каминный портал');
  assert.equal(cladding.title, 'Облицовка каминного короба');
  assert.equal(podium.title, 'Подиум камина');
  // Type ids are unique and looked up both ways.
  assert.equal(new Set(FIREPLACE_TYPES.map(t => t.id)).size, 3);
  FIREPLACE_TYPES.forEach(t => {
    assert.equal(FireplaceModel.getType(t.id), t);
    assert.equal(FireplaceModel.getTypeByKey(t.key), t);
  });
  assert.equal(FireplaceModel.getType('FACADE-01'), null);
  assert.equal(FireplaceModel.getTypeByKey('island'), null);
});

test('A. portal has two forms (with / without a shelf); cladding and podium one each', () => {
  assert.deepEqual(portal.forms.map(f => f.id), ['with-shelf', 'without-shelf']);
  assert.deepEqual(portal.forms.map(f => f.title), ['С полкой', 'Без полки']);
  assert.equal(cladding.forms.length, 1);
  assert.equal(podium.forms.length, 1);
  // An unknown form (or none) falls back to the type's first form.
  assert.equal(FireplaceModel.getForm(portal, 'nope').id, 'with-shelf');
  assert.equal(FireplaceModel.getForm(portal, 'without-shelf').id, 'without-shelf');
  assert.equal(FireplaceModel.getForm(null, 'with-shelf'), null);
});

test('A. no quantity: a fireplace is always one piece', () => {
  FIREPLACE_TYPES.forEach(t => assert.equal(t.quantity, undefined, t.key));
  assert.equal(configOf('podium').quantity, undefined);
});

// ---- B. parameters per form -------------------------------------------------

test('B. portal with a shelf asks for 6 sizes, without a shelf for 5', () => {
  assert.deepEqual(FireplaceModel.getForm(portal, 'with-shelf').params.map(p => p.key),
    ['openingWidth', 'openingHeight', 'pierWidth', 'lintelHeight', 'depth', 'shelfProjection']);
  assert.deepEqual(FireplaceModel.getForm(portal, 'without-shelf').params.map(p => p.key),
    ['openingWidth', 'openingHeight', 'pierWidth', 'lintelHeight', 'depth']);
});

test('B. cladding asks for 6 sizes, podium for 3', () => {
  assert.deepEqual(cladding.forms[0].params.map(p => p.key),
    ['claddingWidth', 'claddingHeight', 'depth', 'fireboxWidth', 'fireboxHeight', 'fireboxBottom']);
  assert.deepEqual(podium.forms[0].params.map(p => p.key), ['length', 'depth', 'height']);
});

test('B. every size has a label, a formula symbol, mm and a placeholder, and its own page field', () => {
  FIREPLACE_TYPES.forEach(t => t.forms.forEach(f => f.params.forEach(p => {
    const where = t.key + '/' + f.id + '/' + p.key;
    assert.ok(p.label && p.symbol, where);
    assert.equal(p.unit, 'мм', where);
    assert.ok(p.placeholderMm > 0, where);
    assert.ok(PARAM_FIELDS[p.key], where + ' has a field');
  })));
  // Only «От пола до топки» may be zero.
  const zeroable = [];
  FIREPLACE_TYPES.forEach(t => t.forms.forEach(f => f.params.forEach(p => { if (p.allowZero) zeroable.push(p.key); })));
  assert.deepEqual(zeroable, ['fireboxBottom']);
  // One field per physical size: «depth» is shared, with a label per type.
  assert.deepEqual([portal, cladding, podium].map(t => t.forms[0].params.find(p => p.key === 'depth').label),
    ['Глубина портала', 'Глубина короба', 'Глубина подиума']);
});

// ---- C. reading the page -----------------------------------------------------

test('C. readFireplaceConfig reads every form: type, form, sizes in metres, complete', () => {
  Object.keys(SIZES).forEach(formId => {
    const cfg = configOf(formId);
    const type = TYPE_OF_FORM[formId];
    assert.equal(cfg.typeId, type.id, formId);
    assert.equal(cfg.type, type.key, formId);
    assert.equal(cfg.form, formId, formId);
    assert.deepEqual(Object.keys(cfg.params), Object.keys(SIZES[formId]), formId);
    Object.entries(SIZES[formId]).forEach(([k, mm]) => close(cfg.params[k], mm / 1000, formId + '/' + k));
    assert.equal(cfg.complete, true, formId);
    assert.deepEqual(cfg.missing, [], formId);
    assert.deepEqual(cfg.violations, [], formId);
    assert.ok(cfg.areaM2 > 0, formId);
  });
});

test('C. fireboxBottom = 0 is read as 0, not as a missing size', () => {
  const cfg = configOf('cladding', { fireboxBottom: 0 });
  assert.equal(cfg.params.fireboxBottom, 0);
  assert.ok(!cfg.missing.includes('fireboxBottom'));
  assert.equal(cfg.complete, true);
  // «0» typed with spaces is still zero; an empty field is missing.
  assert.equal(configOf('cladding', { fireboxBottom: ' 0 ' }).params.fireboxBottom, 0);
  const empty = configOf('cladding', { fireboxBottom: '' });
  assert.equal(empty.params.fireboxBottom, null);
  assert.deepEqual(empty.missing, ['fireboxBottom']);
  assert.equal(empty.complete, false);
  assert.equal(empty.areaM2, 0);
});

test('C. only the chosen form is read: a shelf left over from «С полкой» is not part of «Без полки»', () => {
  const d = doc('without-shelf', SIZES['with-shelf']);
  const cfg = FireplaceModel.readFireplaceConfig(d, portal.id);
  assert.equal(cfg.form, 'without-shelf');
  assert.equal('shelfProjection' in cfg.params, false);
});

test('C. no form chosen -> the type\'s first form; an unknown type -> null', () => {
  const cfg = FireplaceModel.readFireplaceConfig(doc('', SIZES['with-shelf']), portal.id);
  assert.equal(cfg.form, 'with-shelf');
  assert.equal(FireplaceModel.readFireplaceConfig(doc('', {}), 'FIREPLACE-99'), null);
  assert.equal(FireplaceModel.readFireplaceConfig(doc('', {}), undefined), null);
});

test('C. absent page fields do not throw: every size is simply missing', () => {
  // A real page returns null for an id it does not have.
  const blank = { getElementById: () => null };
  const cfg = FireplaceModel.readFireplaceConfig(blank, cladding.id);
  assert.equal(cfg.form, 'cladding');
  assert.deepEqual(cfg.missing, cladding.forms[0].params.map(p => p.key));
  assert.equal(cfg.complete, false);
  assert.equal(cfg.areaM2, 0);
  assert.doesNotThrow(() => FireplaceModel.readFireplaceConfig(null, portal.id));
});

test('C. text that is not a number is missing, not NaN', () => {
  const cfg = configOf('podium', { length: 'abc' });
  assert.equal(cfg.params.length, null);
  assert.deepEqual(cfg.missing, ['length']);
  assert.ok(Number.isFinite(cfg.areaM2));
});

// ---- D. constraints ---------------------------------------------------------

test('D. valid positive sizes pass for every form', () => {
  Object.keys(SIZES).forEach(formId => {
    const type = TYPE_OF_FORM[formId];
    const r = FireplaceModel.checkConstraints(type, FireplaceModel.getForm(type, formId), toM(SIZES[formId]));
    assert.deepEqual(r, { ok: true, missing: [], violations: [] }, formId);
  });
});

test('D. fireboxBottom = 0 passes', () => {
  const r = FireplaceModel.checkConstraints(cladding, cladding.forms[0], toM(Object.assign({}, SIZES.cladding, { fireboxBottom: 0 })));
  assert.equal(r.ok, true);
});

test('D. a firebox as wide as the cladding (or wider) is an error', () => {
  [1600, 1700].forEach(w => {
    const cfg = configOf('cladding', { fireboxWidth: w });
    assert.equal(cfg.complete, false, String(w));
    assert.equal(cfg.areaM2, 0, String(w));
    assert.deepEqual(cfg.violations.map(v => v.rule), ['fireboxWidth'], String(w));
    assert.deepEqual(cfg.violations[0].params, ['fireboxWidth', 'claddingWidth']);
    assert.ok(cfg.violations[0].message);
  });
});

test('D. a firebox reaching the top of the cladding (or past it) is an error', () => {
  // 2000 + 600 = 2600 = Hb (touches the top); 2100 + 600 > Hb.
  [2000, 2100].forEach(e => {
    const cfg = configOf('cladding', { fireboxBottom: e });
    assert.equal(cfg.complete, false, String(e));
    assert.deepEqual(cfg.violations.map(v => v.rule), ['fireboxHeight'], String(e));
  });
  assert.equal(configOf('cladding', { fireboxBottom: 1999 }).complete, true);
});

test('D. zero or negative sizes are rejected, never corrected', () => {
  const zero = configOf('with-shelf', { depth: 0 });
  assert.equal(zero.complete, false);
  assert.deepEqual(zero.violations.map(v => [v.rule, v.params[0]]), [['positive', 'depth']]);
  assert.equal(zero.params.depth, 0, 'the entered value is kept as is');
  const negative = configOf('cladding', { fireboxBottom: -50 });
  assert.deepEqual(negative.violations.map(v => [v.rule, v.params[0]]), [['nonNegative', 'fireboxBottom']]);
  close(negative.params.fireboxBottom, -0.05);
  assert.equal(negative.areaM2, 0);
});

test('D. a fit rule is not judged on a size that is missing or out of range', () => {
  const cfg = configOf('cladding', { claddingWidth: '' });
  assert.deepEqual(cfg.missing, ['claddingWidth']);
  assert.deepEqual(cfg.violations, [], 'no «fireboxWidth» error while the cladding width is not entered');
});

test('D. portal and podium have no fit rules -- only that their stone plates fit', () => {
  portal.forms.forEach(f => assert.deepEqual(f.rules, [], f.id));
  assert.deepEqual(podium.forms[0].rules, []);
  // A portal opening wider than anything else is still a valid portal.
  assert.equal(configOf('without-shelf', { openingWidth: 5000 }).complete, true);
});

// ---- D. the stone plates must fit (30 mm plates) ------------------------------------

test('D. the plate thickness is 30 mm, one number for the model and the geometry', () => {
  assert.equal(FireplaceModel.PLATE_THICKNESS_M, 0.03);
});

// [form, size, the largest size that fails, the smallest that passes] (mm).
const PLATE_LIMITS = [
  ['with-shelf', 'depth', 30, 31],             // > 1 plate
  ['with-shelf', 'pierWidth', 59, 60],         // >= 2 plates
  ['with-shelf', 'lintelHeight', 29, 30],      // >= 1 plate under a shelf
  ['without-shelf', 'depth', 30, 31],
  ['without-shelf', 'pierWidth', 59, 60],
  ['without-shelf', 'lintelHeight', 59, 60],   // >= 2 plates without one
  ['cladding', 'depth', 30, 31],               // > 1 plate
  ['podium', 'depth', 30, 31],                 // > 1 plate
  ['podium', 'height', 30, 31],                // > 1 plate
  ['podium', 'length', 59, 60],                // >= 2 plates
];

test('D. every plate rule, at its exact limit: one size under it fails, the size at it passes', () => {
  PLATE_LIMITS.forEach(([formId, key, fails, passes]) => {
    const bad = configOf(formId, { [key]: fails });
    assert.equal(bad.complete, false, formId + '/' + key + '=' + fails);
    assert.equal(bad.areaM2, 0);
    assert.deepEqual(bad.violations.map(v => [v.rule, v.params]), [['plateThickness', [key]]], formId + '/' + key + '=' + fails);
    assert.equal(configOf(formId, { [key]: passes }).complete, true, formId + '/' + key + '=' + passes);
  });
});

test('D. the panels beside the firebox must be at least one plate wide', () => {
  // (1600 − 1542) / 2 = 29 mm fails; (1600 − 1540) / 2 = 30 mm passes.
  const bad = configOf('cladding', { fireboxWidth: 1542 });
  assert.deepEqual(bad.violations.map(v => [v.rule, v.params]), [['plateThickness', ['fireboxWidth', 'claddingWidth']]]);
  assert.equal(bad.complete, false);
  assert.equal(configOf('cladding', { fireboxWidth: 1540 }).complete, true);
});

test('D. plate messages name the sizes and the 30 mm plate', () => {
  assert.equal(configOf('with-shelf', { pierWidth: 50 }).violations[0].message,
    'Размер «Ширина простенка» не оставляет места для каменных плит толщиной 30 мм.');
  assert.equal(configOf('cladding', { fireboxWidth: 1580 }).violations[0].message,
    'Размеры «Ширина топки» и «Ширина короба» не оставляют места для каменных плит толщиной 30 мм.');
});

test('D. plates are judged only once the fireplace is otherwise right', () => {
  // A firebox wider than its cladding is that error alone, not also a plate one.
  assert.deepEqual(configOf('cladding', { fireboxWidth: 1700 }).violations.map(v => v.rule), ['fireboxWidth']);
  // A missing or non-positive size is reported as such, not as a plate problem.
  assert.deepEqual(configOf('podium', { length: '', height: 20 }).violations, []);
  assert.deepEqual(configOf('with-shelf', { depth: 0 }).violations.map(v => v.rule), ['positive']);
});

// ---- E. area formulas ---------------------------------------------------------

test('E. portal with a shelf: Wo(H+h) − WH + 2(H+h)d + 2Hd + Wd + (Wo+2o)(d+o)', () => {
  // W .9, H .7, b .25, h .25, d .2, o .06 -> Wo 1.4:
  // 1.33 − .63 + .38 + (.28 + .18) + 1.52 × .26 = 1.9352
  close(configOf('with-shelf').areaM2, 1.9352, 'with shelf');
});

test('E. portal without a shelf: the shelf is replaced by the lintel top Wo·d', () => {
  // 1.54 + 1.4 × .2 = 1.82
  close(configOf('without-shelf').areaM2, 1.82, 'without shelf');
});

test('E. cladding: Wb·Hb − W·H + 2·Hb·Db', () => {
  // 1.6 × 2.6 − .9 × .6 + 2 × 2.6 × .5 = 4.16 − .54 + 2.6 = 6.22
  close(configOf('cladding').areaM2, 6.22, 'cladding');
});

test('E. podium: L·D + L·Hp + 2·D·Hp', () => {
  // 1.8 × .45 + 1.8 × .2 + 2 × .45 × .2 = .81 + .36 + .18 = 1.35
  close(configOf('podium').areaM2, 1.35, 'podium');
});

test('E. computeArea works in metres and gives zero (not NaN) for an incomplete form', () => {
  const r = FireplaceModel.computeArea(podium, podium.forms[0], { length: 1.8, depth: null, height: 0.2 });
  assert.equal(r.complete, false);
  assert.equal(r.areaM2, 0);
  assert.deepEqual(r.check.missing, ['depth']);
  const ok = FireplaceModel.computeArea(podium, podium.forms[0], toM(SIZES.podium));
  close(ok.areaM2, 1.35);
});

// ---- F. the firebox height from the floor does not change the stone ----------

test('F. cladding area is the same whatever the firebox height from the floor', () => {
  const low = configOf('cladding', { fireboxBottom: 0 });
  const high = configOf('cladding', { fireboxBottom: 300 });
  assert.equal(low.complete && high.complete, true);
  close(low.areaM2, high.areaM2, 'e = 0 vs e = 300');
});

// ---- G. every size that should change the area does ----------------------------

test('G. changing any one size changes the area -- except fireboxBottom, which never does', () => {
  Object.keys(SIZES).forEach(formId => {
    const base = configOf(formId).areaM2;
    Object.keys(SIZES[formId]).forEach(key => {
      const changed = configOf(formId, { [key]: SIZES[formId][key] + 10 });
      assert.equal(changed.complete, true, formId + '/' + key + ' stays valid');
      if (key === 'fireboxBottom') close(changed.areaM2, base, formId + '/' + key + ' must not change the area');
      else assert.ok(Math.abs(changed.areaM2 - base) > 1e-6, formId + '/' + key + ' must change the area');
    });
  });
});

// ---- H. description -------------------------------------------------------------

test('H. describeFireplace: type, form, every size under its own name in mm, area, formula', () => {
  const info = FireplaceModel.describeFireplace(configOf('with-shelf'));
  assert.equal(info.type, 'portal');
  assert.equal(info.typeLabel, 'Каминный портал');
  assert.equal(info.form, 'with-shelf');
  assert.equal(info.formLabel, 'С полкой');
  assert.deepEqual(info.params.map(p => [p.key, p.label, p.valueMm, p.unit]), [
    ['openingWidth', 'Ширина проёма', 900, 'мм'],
    ['openingHeight', 'Высота проёма', 700, 'мм'],
    ['pierWidth', 'Ширина простенка', 250, 'мм'],
    ['lintelHeight', 'Высота перемычки', 250, 'мм'],
    ['depth', 'Глубина портала', 200, 'мм'],
    ['shelfProjection', 'Вылет полки', 60, 'мм'],
  ]);
  assert.equal(info.complete, true);
  assert.equal(info.areaM2, 1.94);
  assert.equal(info.areaUnit, 'м²');
  assert.equal(info.areaTitle, 'Площадь камня портала');
  assert.match(info.formula, /Wo × \(H \+ h\)/);
  assert.match(info.surface, /полка/);
  assert.equal(info.priceNote, 'Стоимость указана за каменный портал.');
});

test('H. describeFireplace for the single-form types and for a zero firebox height', () => {
  const clad = FireplaceModel.describeFireplace(configOf('cladding', { fireboxBottom: 0 }));
  assert.equal(clad.typeLabel, 'Облицовка каминного короба');
  assert.equal(clad.formLabel, null);
  assert.equal(clad.params.find(p => p.key === 'fireboxBottom').valueMm, 0);
  assert.equal(clad.areaM2, 6.22);
  assert.match(clad.surface, /не облицовываются/);
  const pod = FireplaceModel.describeFireplace(configOf('podium'));
  assert.deepEqual(pod.params.map(p => p.label), ['Длина подиума', 'Глубина подиума', 'Высота подиума']);
  assert.equal(pod.areaM2, 1.35);
});

test('H. describeFireplace of an incomplete config keeps the entered sizes and a zero area', () => {
  const info = FireplaceModel.describeFireplace(configOf('podium', { height: '' }));
  assert.equal(info.complete, false);
  assert.equal(info.areaM2, 0);
  assert.equal(info.params.find(p => p.key === 'height').valueMm, null);
  assert.equal(info.params.find(p => p.key === 'length').valueMm, 1800);
});

// ---- I. never throws ---------------------------------------------------------------

test('I. bad input gives a structured result, never an exception', () => {
  assert.doesNotThrow(() => {
    assert.equal(FireplaceModel.describeFireplace(null), null);
    assert.equal(FireplaceModel.describeFireplace({ typeId: 'nope' }), null);
    const r = FireplaceModel.checkConstraints(null, null, null);
    assert.equal(r.ok, false);
    assert.deepEqual(r.violations.map(v => v.rule), ['unknownType']);
    const empty = FireplaceModel.checkConstraints(podium, podium.forms[0], undefined);
    assert.deepEqual(empty.missing, ['length', 'depth', 'height']);
    const nan = FireplaceModel.computeArea(cladding, cladding.forms[0], { claddingWidth: NaN });
    assert.equal(nan.areaM2, 0);
    assert.ok(Array.isArray(nan.check.missing));
  });
});

// ---- the model stays pure -------------------------------------------------------------

test('the model loads nothing else: no Three.js, scene, parts, pricing, slabs or rates', () => {
  // The code only -- the comments are allowed to say what the model is not.
  const src = fs.readFileSync(path.join(__dirname, '..', 'fireplace-model.js'), 'utf8').replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(src, /require\(/);
  assert.doesNotMatch(src, /THREE|SceneLayout|ProductParts|Pricing|RateCatalog|WORK_RATES|slabs/);
});
