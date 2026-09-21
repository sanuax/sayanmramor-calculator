(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.WebglSupport = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {

  function isWebglAvailable(doc) {
    try {
      const d = doc || document;
      const canvas = d.createElement('canvas');
      const ctx = canvas.getContext('webgl2') || canvas.getContext('webgl');
      return !!ctx;
    } catch (e) {
      return false;
    }
  }

  return { isWebglAvailable };
});
