(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.MaterialAdapter = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {

  const GENERIC_FALLBACK = { fallbackColor: '#b8b3ac', roughness: 0.5, metalness: 0.05 };

  // Coarse, deliberately approximate lookup -- there is no per-stone
  // appearance data in the catalog beyond category/color segment. See
  // spec: real texture wiring is reserved (textureUrl), not implemented.
  const CATEGORY_BASE = {
    marble:  { roughness: 0.25, metalness: 0.02 },
    granite: { roughness: 0.45, metalness: 0.05 },
    quartz:  { roughness: 0.15, metalness: 0.0 },
    travertine: { roughness: 0.55, metalness: 0.0 },
  };

  const COLOR_HEX = {
    beige: '#e8ddc7', white: '#f2f0ec', black: '#2b2b2b', grey: '#8f8c88',
    brown: '#6b5744', cream: '#eee5d3', gold: '#c9a86a',
  };

  function resolveMaterial(stone, bookmatchMode) {
    if (!stone) {
      return Object.assign({ textureUrl: null, bookmatchMode }, GENERIC_FALLBACK);
    }
    const base = CATEGORY_BASE[stone.category] || { roughness: GENERIC_FALLBACK.roughness, metalness: GENERIC_FALLBACK.metalness };
    const colorSegment = (stone.colors && stone.colors[0] && stone.colors[0].segment) || null;
    const fallbackColor = COLOR_HEX[colorSegment] || GENERIC_FALLBACK.fallbackColor;

    return {
      fallbackColor,
      roughness: base.roughness,
      metalness: base.metalness,
      textureUrl: null, // stone.image is a photo of one slab, not a tileable texture -- not used as a map
      bookmatchMode,
    };
  }

  return { resolveMaterial };
});
