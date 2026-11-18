// project-model.js
//
// The project (the owner, 2026-11-17): the client puts several products in one calculation -- a
// kitchen countertop, a sill, steps -- with one price and one request. The form edits one product
// at a time, the active one; every product of the project is kept as a snapshot of its choices,
// the same way a passport link keeps them (passport-link.js: the fields that differ from the
// page's own start):
//   item    = { id, productKey, stoneId, fields: { [field id]: string }, stepId? }
//   project = { items: [item...], active: index }
// A project is never empty. Pure functions only, no DOM: every change returns a new project.
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./passport-link.js'));
  } else {
    root.ProjectModel = factory(root.PassportLink);
  }
})(typeof window !== 'undefined' ? window : globalThis, function (PassportLink) {

  // The project link's format version (a one-product passport link is pv=1).
  const PROJECT_VERSION = 2;
  const ITEM_PARAM = n => 'p' + n;
  const ACTIVE_PARAM = 'a';

  let idCounter = 0;
  function newItemId() {
    idCounter += 1;
    return 'i' + Date.now().toString(36) + '-' + idCounter;
  }

  const copyItem = item => Object.assign({}, item, { fields: Object.assign({}, item.fields || {}) });

  function createProject(item) {
    return { items: [copyItem(item)], active: 0 };
  }

  function addItem(project, item) {
    const items = project.items.map(copyItem).concat([copyItem(item)]);
    return { items, active: items.length - 1 };
  }

  function setActive(project, index) {
    if (!(index >= 0 && index < project.items.length)) return project;
    return { items: project.items.map(copyItem), active: index };
  }

  function updateItem(project, index, patch) {
    const items = project.items.map((item, i) => (i === index ? copyItem(Object.assign({}, item, patch)) : copyItem(item)));
    return { items, active: project.active };
  }

  // The active product stays active; when it is the one removed, the next one is (the one before
  // when it was the last).
  function removeItem(project, index) {
    if (project.items.length <= 1 || !(index >= 0 && index < project.items.length)) return project;
    const items = project.items.filter((_, i) => i !== index).map(copyItem);
    let active = project.active;
    if (index < active) active -= 1;
    else if (index === active) active = Math.min(index, items.length - 1);
    return { items, active };
  }

  // ---- the project's link: pv=2, every product its own passport query (p1, p2, ...) ----------

  function buildProjectQuery(project) {
    const params = new URLSearchParams();
    params.set('pv', String(PROJECT_VERSION));
    let n = 0, active = 1;
    project.items.forEach((item, i) => {
      if (!item.productKey) return;   // a product not chosen yet is no part of the link
      n += 1;
      if (i === project.active) active = n;   // counted among the products the link carries
      params.set(ITEM_PARAM(n), PassportLink.buildPassportQuery({ productKey: item.productKey, stoneId: item.stoneId, fields: item.fields }));
    });
    params.set(ACTIVE_PARAM, String(active));
    return params.toString();
  }

  // null: not a project link. Only the page's own field ids come back (fieldIds); a product the
  // calculator does not know (isKnown(productKey) false -- one taken off, a broken link) is left out.
  function readProjectQuery(params, fieldIds, isKnown) {
    if (params.get('pv') !== String(PROJECT_VERSION)) return null;
    const wanted = parseInt(params.get(ACTIVE_PARAM), 10) || 1;
    const items = [];
    let active = 0;
    for (let n = 1; params.has(ITEM_PARAM(n)); n++) {
      const one = PassportLink.readPassportQuery(new URLSearchParams(params.get(ITEM_PARAM(n))), fieldIds);
      if (!one || !one.productKey || (isKnown && !isKnown(one.productKey))) continue;
      if (n === wanted) active = items.length;
      items.push({ id: newItemId(), productKey: one.productKey, stoneId: one.stoneId || null, fields: one.fields });
    }
    if (!items.length) return null;
    return { items, active };
  }

  // ---- what the browser stores -----------------------------------------------------------------

  function serialize(project) {
    return JSON.stringify(project);
  }

  // isKnown(productKey): a product the calculator still offers; one it does not is left out (a product
  // not chosen yet, productKey null, stays).
  function deserialize(text, isKnown) {
    if (typeof text !== 'string') return null;
    let p;
    try { p = JSON.parse(text); } catch (e) { return null; }
    if (!p || !Array.isArray(p.items) || !p.items.length) return null;
    const ok = p.items.every(i => i && typeof i.id === 'string' && i.fields && typeof i.fields === 'object');
    if (!ok) return null;
    const wasActive = Number.isInteger(p.active) && p.active >= 0 && p.active < p.items.length ? p.items[p.active].id : null;
    const items = p.items.filter(i => !i.productKey || !isKnown || isKnown(i.productKey)).map(copyItem);
    if (!items.length) return null;
    const active = Math.max(0, items.findIndex(i => i.id === wasActive));
    return { items, active };
  }

  // ---- a product's choices as the state reader (ConstructorState) sees a form ------------------

  // `initial`: { [id]: { value, checked, type } } -- every control as the page starts. A field in the
  // snapshot is its value ('1' / '0' for a checkbox); any other control is the page's own start.
  // `mirrors`: { [hidden id]: visible id } -- a hidden field the page keeps equal to a visible one (the
  // step count, the facade quantity) is not in a snapshot; it is read from the field it mirrors.
  function snapshotDoc(fields, initial, mirrors) {
    const init = initial || {};
    const f = Object.assign({}, fields || {});
    Object.keys(mirrors || {}).forEach(hidden => {
      if (!Object.prototype.hasOwnProperty.call(f, hidden) && Object.prototype.hasOwnProperty.call(f, mirrors[hidden])) f[hidden] = f[mirrors[hidden]];
    });
    return {
      getElementById(id) {
        const start = init[id];
        if (!start) return { value: Object.prototype.hasOwnProperty.call(f, id) ? f[id] : '', checked: f[id] === '1' };
        if (start.type === 'checkbox' || start.type === 'radio') {
          return { value: start.value, checked: Object.prototype.hasOwnProperty.call(f, id) ? f[id] === '1' : !!start.checked };
        }
        return { value: Object.prototype.hasOwnProperty.call(f, id) ? f[id] : start.value, checked: !!start.checked };
      },
    };
  }

  return {
    PROJECT_VERSION, newItemId, createProject, addItem, setActive, updateItem, removeItem,
    buildProjectQuery, readProjectQuery, serialize, deserialize, snapshotDoc,
  };
});
