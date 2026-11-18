// tests/project-model.test.js
//
// The project (the owner, 2026-11-17): several products in one calculation. ProjectModel keeps the
// list of the products' snapshots (their choices as a passport link keeps them), which one is being
// edited, the project's own link (pv=2) and what the browser stores.
const test = require('node:test');
const assert = require('node:assert/strict');
const ProjectModel = require('../project-model.js');

const item = (id, productKey, stoneId, fields) => ({ id, productKey, stoneId, fields: fields || {} });
const ids = p => p.items.map(i => i.id);
const activeId = p => p.items[p.active].id;

test('add makes the new product the active one; set/update never touch the original', () => {
  const p0 = ProjectModel.createProject(item('a', 'stoleshnitsa_kuhnya', 'delicato'));
  assert.deepEqual(ids(p0), ['a']);
  assert.equal(p0.active, 0);
  const p1 = ProjectModel.addItem(p0, item('b', 'podokonnik', 'nero'));
  assert.deepEqual(ids(p1), ['a', 'b']);
  assert.equal(activeId(p1), 'b');
  assert.deepEqual(ids(p0), ['a'], 'the earlier project is left as it was');
  const p2 = ProjectModel.setActive(p1, 0);
  assert.equal(activeId(p2), 'a');
  const p3 = ProjectModel.updateItem(p2, 1, { stoneId: 'other', fields: { width: '300' } });
  assert.equal(p3.items[1].stoneId, 'other');
  assert.deepEqual(p3.items[1].fields, { width: '300' });
  assert.equal(p2.items[1].stoneId, 'nero');
});

test('remove keeps the active product active; removing the active one makes a neighbour active', () => {
  let p = ProjectModel.createProject(item('a', 'pol', 's'));
  p = ProjectModel.addItem(p, item('b', 'pol', 's'));
  p = ProjectModel.addItem(p, item('c', 'pol', 's'));
  p = ProjectModel.setActive(p, 1);
  const beforeActive = ProjectModel.removeItem(p, 0);
  assert.deepEqual(ids(beforeActive), ['b', 'c']);
  assert.equal(activeId(beforeActive), 'b', 'still the same product');
  const theActive = ProjectModel.removeItem(p, 1);
  assert.deepEqual(ids(theActive), ['a', 'c']);
  assert.equal(activeId(theActive), 'c', 'the next one');
  const last = ProjectModel.removeItem(ProjectModel.setActive(p, 2), 2);
  assert.equal(activeId(last), 'b', 'no next: the one before');
  const single = ProjectModel.createProject(item('a', 'pol', 's'));
  assert.deepEqual(ProjectModel.removeItem(single, 0), single, 'a project is never empty');
});

test('the project link (pv=2) round-trips every product, its stone and fields, and the active one', () => {
  let p = ProjectModel.createProject(item('a', 'stoleshnitsa_kuhnya', 'delicato-brown', { width: '600', length: '2400', productShape: 'lshape' }));
  p = ProjectModel.addItem(p, item('b', 'podokonnik', 'nero', { width: '300' }));
  p = ProjectModel.setActive(p, 0);
  const query = ProjectModel.buildProjectQuery(p);
  assert.match(query, /(^|&)pv=2(&|$)/);
  const back = ProjectModel.readProjectQuery(new URLSearchParams(query), ['width', 'length', 'productShape']);
  assert.equal(back.active, 0);
  assert.deepEqual(back.items.map(i => [i.productKey, i.stoneId, i.fields]), [
    ['stoleshnitsa_kuhnya', 'delicato-brown', { width: '600', length: '2400', productShape: 'lshape' }],
    ['podokonnik', 'nero', { width: '300' }],
  ]);
  assert.ok(back.items.every(i => typeof i.id === 'string' && i.id), 'every product gets an id');
  // A one-product passport link (pv=1) is not a project.
  assert.equal(ProjectModel.readProjectQuery(new URLSearchParams('product=pol&pv=1&width=300'), ['width']), null);
  assert.equal(ProjectModel.readProjectQuery(new URLSearchParams(''), []), null);
});

test('only the page\'s own field ids come back from a project link', () => {
  const p = ProjectModel.createProject(item('a', 'pol', 's', { width: '300', bogus: '1' }));
  const back = ProjectModel.readProjectQuery(new URLSearchParams(ProjectModel.buildProjectQuery(p)), ['width']);
  assert.deepEqual(back.items[0].fields, { width: '300' });
});

test('serialize / deserialize: the stored project comes back; a broken one is null', () => {
  let p = ProjectModel.createProject(item('a', 'pol', 's', { width: '300' }));
  p = ProjectModel.addItem(p, Object.assign(item('b', null, 's'), { stepId: 'type' }));
  assert.deepEqual(ProjectModel.deserialize(ProjectModel.serialize(p)), p);
  assert.equal(ProjectModel.deserialize('{'), null);
  assert.equal(ProjectModel.deserialize('{"items":[]}'), null, 'never an empty project');
  assert.equal(ProjectModel.deserialize(null), null);
});

test('snapshotDoc: a product\'s choices as the state reader sees a form', () => {
  const initial = {
    width: { value: '', checked: false, type: 'number' },
    'shape-corner': { value: 'left', checked: false, type: 'select-one' },
    'opt-install': { value: 'on', checked: false, type: 'checkbox' },
    'opt-polish': { value: 'on', checked: true, type: 'checkbox' },
  };
  const doc = ProjectModel.snapshotDoc({ width: '600', 'opt-install': '1', 'opt-polish': '0' }, initial);
  assert.deepEqual(doc.getElementById('width'), { value: '600', checked: false });
  assert.deepEqual(doc.getElementById('shape-corner'), { value: 'left', checked: false }, 'not in the snapshot: the page\'s own start');
  assert.equal(doc.getElementById('opt-install').checked, true);
  assert.equal(doc.getElementById('opt-polish').checked, false);
  assert.deepEqual(doc.getElementById('nothing-here'), { value: '', checked: false });
});

test('newItemId: different every time', () => {
  const a = ProjectModel.newItemId(), b = ProjectModel.newItemId();
  assert.ok(a && b && a !== b);
});

// ---- the final review's fixes (2026-11-18) ----

test('snapshotDoc: a mirrored field (the step count, the facade quantity) is read from the field it mirrors', () => {
  const mirrors = { 'step-count': 'stepCountInput', 'facade-quantity': 'facadeQtyInput' };
  const doc = ProjectModel.snapshotDoc({ stepCountInput: '10' }, {}, mirrors);
  assert.equal(doc.getElementById('step-count').value, '10');
  assert.equal(doc.getElementById('facade-quantity').value, '', 'not in the snapshot: the page\'s own default');
  // The state reader sees the count the client chose, not the product's default.
  const ConstructorState = require('../constructor-state.js');
  const ProductTypes = require('../product-types.js');
  const state = ConstructorState.readConstructorState({
    doc: ProjectModel.snapshotDoc({ width: '300', length: '1200', productSubcategory: 'STEP-01', stepCountInput: '10' }, {}, mirrors),
    selectedProductKey: 'stupeni', product: ProductTypes.PRODUCTS.stupeni, stone: null, hasAdditionalWork: ProductTypes.hasAdditionalWork,
  });
  assert.equal(state.stepCount, 10);
});

test('a project with a product the calculator does not know is cut down to what it knows; nothing known: none', () => {
  const known = key => key === 'pol' || key === 'podokonnik';
  const p = { items: [{ id: 'a', productKey: 'pol', stoneId: 's', fields: {} }, { id: 'b', productKey: 'gone', stoneId: 's', fields: {} }, { id: 'c', productKey: 'podokonnik', stoneId: 's', fields: {} }], active: 2 };
  const back = ProjectModel.deserialize(JSON.stringify(p), known);
  assert.deepEqual(back.items.map(i => i.id), ['a', 'c']);
  assert.equal(back.items[back.active].id, 'c', 'the same product stays active');
  assert.equal(ProjectModel.deserialize(JSON.stringify({ items: [p.items[1]], active: 0 }), known), null);
  const q = new URLSearchParams('pv=2&p1=' + encodeURIComponent('product=gone&pv=1') + '&p2=' + encodeURIComponent('product=pol&pv=1&width=300') + '&a=2');
  const link = ProjectModel.readProjectQuery(q, ['width'], known);
  assert.deepEqual(link.items.map(i => i.productKey), ['pol']);
  assert.equal(link.active, 0);
});

test('the project link: the active product is counted among the products the link carries', () => {
  const p = { items: [{ id: 'a', productKey: null, stoneId: null, fields: {} }, { id: 'b', productKey: 'pol', stoneId: 's', fields: {} }, { id: 'c', productKey: 'podokonnik', stoneId: 's', fields: {} }], active: 2 };
  const back = ProjectModel.readProjectQuery(new URLSearchParams(ProjectModel.buildProjectQuery(p)), []);
  assert.equal(back.items[back.active].productKey, 'podokonnik');
});
