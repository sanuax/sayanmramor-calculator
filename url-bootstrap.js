// url-bootstrap.js
//
// Pure validation for the SITE -> CONFIGURATOR URL contract
// (?product=<productKey>&stone=<stoneId>), and the one link back the other
// way: CONFIGURATOR Result -> SITE showroom (buildShowroomUrl). No DOM, no URLSearchParams --
// callers extract the raw query value themselves and pass it in here, so
// this stays a plain lookup that's trivial to unit-test and reuse at the
// two different points in the page's load sequence where each becomes
// checkable (product keys are known synchronously; stone ids only once
// data/slabs.json has loaded).
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.UrlBootstrap = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {

  function resolveInitialProductKey(rawValue, products) {
    return rawValue && Object.prototype.hasOwnProperty.call(products, rawValue) ? rawValue : null;
  }

  function resolveInitialStoneId(rawValue, stonesById) {
    return rawValue && Object.prototype.hasOwnProperty.call(stonesById, rawValue) ? rawValue : null;
  }

  // The site's showroom, entered at the configured product's object. The
  // contract is the same two stable ids and nothing else -- never sizes,
  // shape, edge, extras, price or lead data (the showroom is not a second
  // configurator). Only a known product gets a link; a stone id is kept
  // only when it is a real catalog stone.
  const SHOWROOM_PATH = '/sayanmramor-site/showroom.html';

  function buildShowroomUrl(productKey, stoneId, products, stonesById) {
    const product = resolveInitialProductKey(productKey, products);
    if (!product) return null;
    let url = SHOWROOM_PATH + '?product=' + encodeURIComponent(product);
    const stone = resolveInitialStoneId(stoneId, stonesById || {});
    if (stone) url += '&stone=' + encodeURIComponent(stone);
    return url;
  }

  return { resolveInitialProductKey, resolveInitialStoneId, buildShowroomUrl, SHOWROOM_PATH };
});
