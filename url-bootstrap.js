// url-bootstrap.js
//
// Pure validation for the SITE -> CONFIGURATOR URL contract
// (?product=<productKey>&stone=<stoneId>). No DOM, no URLSearchParams --
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

  return { resolveInitialProductKey, resolveInitialStoneId };
});
