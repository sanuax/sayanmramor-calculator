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
    const availableCount = slabs.length;
    if (nSlabs > availableCount) {
      return { slab: cheapest, nSlabs, subtotal: null, availableCount };
    }
    const subtotal = nSlabs * cheapest.price_total_rub;
    return { slab: cheapest, nSlabs, subtotal, availableCount };
  }

  function computeWorkAndTotal(subtotal, workMultiplier, complexityMultiplier, optionSurchargeSum) {
    const work = subtotal * workMultiplier * complexityMultiplier * (1 + optionSurchargeSum);
    const total = subtotal + work;
    return { work, total };
  }

  function calculatePrice(params) {
    const {
      stone, widthM, lengthM, productType, complexityMultiplier,
      optionSurchargeSum, marginCm, wasteFactor, workMultiplier
    } = params;

    const empty = { subtotal: null, work: null, total: null, nSlabs: 0, remainderM2: null, matchedSlab: null, availableCount: null };

    if (!(widthM > 0) || !(lengthM > 0)) {
      return Object.assign({ ok: false, reason: 'invalid_dimensions' }, empty);
    }
    if (!stone || !stone.slabs || stone.slabs.length === 0) {
      return Object.assign({ ok: false, reason: 'no_slabs_for_stone' }, empty);
    }

    if (productType === 'A') {
      const slab = findBestTypeASlab(stone.slabs, widthM, lengthM, marginCm);
      if (!slab) {
        return Object.assign({ ok: false, reason: 'no_fitting_slab' }, empty);
      }
      const subtotal = slab.price_total_rub;
      const { work, total } = computeWorkAndTotal(subtotal, workMultiplier, complexityMultiplier, optionSurchargeSum);
      const remainderM2 = computeRemainderAreaM2(slab, widthM, lengthM);
      return { ok: true, reason: null, subtotal, work, total, nSlabs: 1, remainderM2, matchedSlab: slab };
    }

    const typeBResult = computeTypeBResult(stone.slabs, widthM, lengthM, wasteFactor);
    if (!typeBResult) {
      return Object.assign({ ok: false, reason: 'no_slabs_for_stone' }, empty);
    }
    if (typeBResult.subtotal === null) {
      return Object.assign({ ok: false, reason: 'insufficient_stock' }, empty, {
        nSlabs: typeBResult.nSlabs, matchedSlab: typeBResult.slab, availableCount: typeBResult.availableCount
      });
    }
    const { work, total } = computeWorkAndTotal(typeBResult.subtotal, workMultiplier, complexityMultiplier, optionSurchargeSum);
    return { ok: true, reason: null, subtotal: typeBResult.subtotal, work, total, nSlabs: typeBResult.nSlabs, remainderM2: null, matchedSlab: typeBResult.slab, availableCount: typeBResult.availableCount };
  }

  return { findBestTypeASlab, computeRemainderAreaM2, computeTypeBResult, computeWorkAndTotal, calculatePrice };
});
