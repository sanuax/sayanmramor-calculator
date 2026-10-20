// passport-link.js
//
// The passport's link: every choice the client made, written into the
// calculator's own address (?product=<key>&stone=<id>&pv=1&<field id>=<value>...)
// and read back from it. Plain, readable parameters -- the product and the
// stone are the same ones the site already links with (url-bootstrap.js);
// `pv` marks a passport link and its format version. Pure functions only:
// the page hands in its form controls as plain objects and applies what
// comes back through its own selection mechanism.
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.PassportLink = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {

  const PASSPORT_VERSION = 1;
  const VERSION_PARAM = 'pv';

  // Only what differs from the page's own defaults goes into the link, so
  // it stays short enough for a QR code on paper. A checkbox is 1 / 0.
  function collectFields(controls) {
    const fields = {};
    (controls || []).forEach(c => {
      if (!c || !c.id) return;
      if (c.type === 'checkbox' || c.type === 'radio') {
        if (!!c.checked !== !!c.defaultChecked) fields[c.id] = c.checked ? '1' : '0';
      } else if (String(c.value) !== String(c.defaultValue)) {
        fields[c.id] = String(c.value);
      }
    });
    return fields;
  }

  function buildPassportQuery({ productKey, stoneId, fields }) {
    const params = new URLSearchParams();
    params.set('product', productKey);
    if (stoneId) params.set('stone', stoneId);
    params.set(VERSION_PARAM, String(PASSPORT_VERSION));
    Object.keys(fields || {}).forEach(id => params.set(id, fields[id]));
    return params.toString();
  }

  // null: not a passport link. The fields come back in the page's order
  // (fieldIds), and only the page's own field ids are taken.
  function readPassportQuery(params, fieldIds) {
    const version = params.get(VERSION_PARAM);
    if (!version) return null;
    const fields = {};
    (fieldIds || []).forEach(id => {
      if (params.has(id)) fields[id] = params.get(id);
    });
    return { version: Number(version), productKey: params.get('product'), stoneId: params.get('stone'), fields };
  }

  return { PASSPORT_VERSION, collectFields, buildPassportQuery, readPassportQuery };
});
