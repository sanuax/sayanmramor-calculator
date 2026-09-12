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

  // When no single slab fits the product whole, Type A products (countertops,
  // sills, steps) can still be cut with a seam — but the seam must run along
  // one straight axis of the piece, so the check is geometric, not areal:
  // one dimension ("cross") must fit across a single slab, and the other
  // ("long") gets split into pieces cut from one or more slabs.
  //
  // A single slab can usually yield more than one piece: cutting a strip of
  // width `cross` doesn't consume the slab's other dimension, only `cross`
  // worth of it — so floor(side / cross) parallel strips fit side by side,
  // each up to the slab's other side long. Total length obtainable from one
  // slab is therefore floor(side / cross) * otherSide, maximized over which
  // side hosts the stacked strips.
  function slabCapacityForCross(slab, cross) {
    const a = slab.width_cm;
    const b = slab.length_cm;
    let capacity = 0;
    if (cross <= a) capacity = Math.max(capacity, Math.floor(a / cross) * b);
    if (cross <= b) capacity = Math.max(capacity, Math.floor(b / cross) * a);
    return capacity; // 0 means `cross` doesn't fit this slab in any orientation
  }

  function findTypeASegmentedResult(slabs, widthM, lengthM, marginCm) {
    const needW = widthM * 100 + 2 * marginCm;
    const needL = lengthM * 100 + 2 * marginCm;
    const cross = Math.min(needW, needL);
    const long = Math.max(needW, needL);

    let best = null;
    let bestCapacity = null;
    for (const slab of slabs) {
      const capacity = slabCapacityForCross(slab, cross);
      if (capacity <= 0) continue; // cross exceeds every side of this slab — unusable, even with a seam
      if (!best || slab.price_per_m2_rub < best.price_per_m2_rub) {
        best = slab;
        bestCapacity = capacity;
      }
    }
    if (!best) return null;

    const segments = Math.ceil(long / bestCapacity);
    const availableCount = slabs.length;
    if (segments > availableCount) {
      return { slab: best, segments, subtotal: null, availableCount };
    }
    const subtotal = segments * best.price_total_rub;
    return { slab: best, segments, subtotal, availableCount };
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
      optionSurchargeSum, marginCm, wasteFactor, workMultiplier,
      allowSeam = true
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
      if (slab) {
        const subtotal = slab.price_total_rub;
        const { work, total } = computeWorkAndTotal(subtotal, workMultiplier, complexityMultiplier, optionSurchargeSum);
        const remainderM2 = computeRemainderAreaM2(slab, widthM, lengthM);
        return { ok: true, reason: null, subtotal, work, total, nSlabs: 1, remainderM2, matchedSlab: slab };
      }

      // Some Type A products (e.g. decorative panels) look wrong with a seam,
      // so they skip the segmented fallback entirely and go straight to
      // "ask a manager" when they don't fit a single slab.
      if (!allowSeam) {
        return Object.assign({ ok: false, reason: 'no_fitting_slab' }, empty);
      }

      const segmented = findTypeASegmentedResult(stone.slabs, widthM, lengthM, marginCm);
      if (!segmented) {
        return Object.assign({ ok: false, reason: 'no_fitting_slab' }, empty);
      }
      if (segmented.subtotal === null) {
        return Object.assign({ ok: false, reason: 'insufficient_stock' }, empty, {
          nSlabs: segmented.segments, matchedSlab: segmented.slab, availableCount: segmented.availableCount
        });
      }
      const { work, total } = computeWorkAndTotal(segmented.subtotal, workMultiplier, complexityMultiplier, optionSurchargeSum);
      return {
        ok: true, reason: null, subtotal: segmented.subtotal, work, total,
        nSlabs: segmented.segments, remainderM2: null, matchedSlab: segmented.slab, availableCount: segmented.availableCount
      };
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

  return { findBestTypeASlab, slabCapacityForCross, findTypeASegmentedResult, computeRemainderAreaM2, computeTypeBResult, computeWorkAndTotal, calculatePrice };
});
