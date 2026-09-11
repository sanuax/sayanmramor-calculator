(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.Pricing = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {

  function findBestTypeASlab(slabs, widthM, lengthM, marginCm) {
    const needW = widthM * 100 + 2 * marginCm;
    const needL = lengthM * 100 + 2 * marginCm;
    let best = null;
    for (const slab of slabs) {
      const fitsDirect = slab.width_cm >= needW && slab.length_cm >= needL;
      const fitsRotated = slab.width_cm >= needL && slab.length_cm >= needW;
      if (!fitsDirect && !fitsRotated) continue;
      if (!best || slab.price_total_rub < best.price_total_rub) {
        best = slab;
      }
    }
    return best;
  }

  function computeRemainderAreaM2(slab, widthM, lengthM) {
    const slabAreaM2 = (slab.width_cm / 100) * (slab.length_cm / 100);
    return slabAreaM2 - widthM * lengthM;
  }

  function computeTypeBResult(slabs, widthM, lengthM, wasteFactor) {
    if (!slabs.length) return null;
    let cheapest = slabs[0];
    for (const slab of slabs) {
      if (slab.price_per_m2_rub < cheapest.price_per_m2_rub) cheapest = slab;
    }
    const areaNeeded = widthM * lengthM;
    const slabAreaM2 = (cheapest.width_cm / 100) * (cheapest.length_cm / 100);
    const nSlabs = Math.ceil((areaNeeded * wasteFactor) / slabAreaM2);
    const subtotal = nSlabs * cheapest.price_total_rub;
    return { slab: cheapest, nSlabs, subtotal };
  }

  return { findBestTypeASlab, computeRemainderAreaM2, computeTypeBResult };
});
