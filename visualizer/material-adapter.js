(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.MaterialAdapter = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {

  // Neutral warm stone for a stone with no color data (398 of the catalog)
  // or no stone selected yet -- deliberately not a guess at its real color.
  const GENERIC_FALLBACK = { fallbackColor: '#bab2a6', roughness: 0.4, metalness: 0, clearcoat: 0.3 };

  // Surface finish per catalog category (slabs.json `category`). The catalog
  // has no finish field, so this is the usual finish for the stone type:
  // polished stones get a clear coat (sharp reflections over a softer
  // base), honed/matte ones none. Coarse by design -- appearance only.
  const POLISHED = { roughness: 0.32, metalness: 0, clearcoat: 0.55 };
  const HIGH_GLOSS = { roughness: 0.22, metalness: 0, clearcoat: 0.75 };
  const HONED = { roughness: 0.68, metalness: 0, clearcoat: 0.05 };
  const MATTE = { roughness: 0.82, metalness: 0, clearcoat: 0 };
  const CATEGORY_BASE = {
    marble: POLISHED, granite: POLISHED, quartzite: POLISHED, 'artificial-marble': POLISHED,
    'quartz-agglomerate': HIGH_GLOSS, quartz: HIGH_GLOSS,
    oniks: HIGH_GLOSS, agate: HIGH_GLOSS, labradorite: HIGH_GLOSS, obsidian: HIGH_GLOSS,
    jasper: HIGH_GLOSS, kvarc: HIGH_GLOSS, 'tigrovyi-glaz': HIGH_GLOSS, 'petrified-wood': POLISHED,
    aragonit: POLISHED, septariya: POLISHED, 'specennyi-kamen': POLISHED,
    travertin: HONED, travertine: HONED, limestone: HONED, soapstone: HONED,
    slate: MATTE, pescanik: MATTE,
  };

  // One representative tone per catalog color segment (slabs.json
  // `colors[0].segment`) -- the stone's own listed color, not an invention.
  const COLOR_HEX = {
    white: '#ece8e1', beige: '#d8c8ac', cream: '#ece3cf', gray: '#8f8b86', grey: '#8f8b86',
    'light-grey': '#c4c0ba', black: '#2b2927', brown: '#6e5442', yellow: '#d2b776',
    golden: '#c8a668', gold: '#c8a668', 'black-and-gold': '#35302a', 'cerno-belyi': '#8c8986',
    green: '#5f7b63', red: '#8b4336', pink: '#d4aaa0', blue: '#4f6e89', 'light-blue': '#a3b9c8',
    violet: '#6f5b79',
  };

  function resolveMaterial(stone, bookmatchMode) {
    if (!stone) {
      return Object.assign({ textureUrl: null, bookmatchMode }, GENERIC_FALLBACK);
    }
    const base = CATEGORY_BASE[stone.category] || GENERIC_FALLBACK;
    const colorSegment = (stone.colors && stone.colors[0] && stone.colors[0].segment) || null;
    const fallbackColor = COLOR_HEX[colorSegment] || GENERIC_FALLBACK.fallbackColor;

    return {
      fallbackColor,
      roughness: base.roughness,
      metalness: base.metalness,
      clearcoat: base.clearcoat,
      textureUrl: null, // stone.image is a photo of one slab, not a tileable texture -- not used as a map
      bookmatchMode,
    };
  }

  return { resolveMaterial, COLOR_HEX, CATEGORY_BASE };
});
