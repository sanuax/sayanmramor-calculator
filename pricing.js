(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.Pricing = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {

  // A slab the scraper captured a per-m2 price for can still lack a total
  // price (the supplier page showed no parseable number for that row) --
  // `null` coerces to `0` in both `<` comparisons and arithmetic, so without
  // this guard a priceless slab silently wins "cheapest" comparisons and
  // produces a ≈0 ₽ quote instead of surfacing as unusable.
  function hasValidPrice(slab) {
    return typeof slab.price_total_rub === 'number' && Number.isFinite(slab.price_total_rub) && slab.price_total_rub > 0;
  }

  function findBestTypeASlab(slabs, widthM, lengthM, marginCm) {
    const needW = widthM * 100 + 2 * marginCm;
    const needL = lengthM * 100 + 2 * marginCm;
    let best = null;
    for (const slab of slabs) {
      if (!hasValidPrice(slab)) continue;
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

  // Minimum-cost 0/1 "reach at least `target`" cover: given items each with
  // a positive integer capacity and a cost, each usable at most once, finds
  // the lowest-cost subset whose summed (capacity-clamped-to-target) output
  // is >= target. This is a knapsack-cover DP -- exact, not a greedy
  // approximation. Greedy-by-price is not just imprecise but genuinely wrong
  // here: e.g. target 10 with items {cap:5,cost:5} and {cap:10,cost:9} --
  // greedy takes the cheap one first, then still needs the other (total 14);
  // the true optimum is the one item alone (9). Runs in O(items.length *
  // target), which for realistic stock (hundreds of slabs) and targets (a
  // few thousand cm, or a few thousand 0.1m2 units) is a few million array
  // ops -- fast enough for a one-off calculator request, so no approximation
  // is needed.
  function minCostCover(items, target) {
    target = Math.max(0, Math.ceil(target));
    if (target === 0) return { chosen: [], cost: 0 };

    const n = items.length;
    const INF = Infinity;
    let dp = new Float64Array(target + 1).fill(INF);
    dp[0] = 0;
    // Per-item history (not a single shared array) so backtracking is exact:
    // usedAt[i][j] / fromAt[i][j] record, for the state of dp as of
    // processing item i, whether item i was used to reach capacity-state j
    // and which prior state it came from.
    const usedAt = new Array(n);
    const fromAt = new Array(n);

    for (let i = 0; i < n; i++) {
      const c = Math.min(items[i].capacity, target);
      const cost = items[i].cost;
      const nextDp = dp.slice();
      const used = new Uint8Array(target + 1);
      const from = new Int32Array(target + 1).fill(-1);
      for (let j = 0; j <= target; j++) {
        if (dp[j] === INF) continue;
        const nj = j + c > target ? target : j + c;
        const candidate = dp[j] + cost;
        if (candidate < nextDp[nj]) {
          nextDp[nj] = candidate;
          used[nj] = 1;
          from[nj] = j;
        }
      }
      dp = nextDp;
      usedAt[i] = used;
      fromAt[i] = from;
    }

    if (dp[target] === INF) return null;

    const chosen = [];
    let j = target;
    for (let i = n - 1; i >= 0; i--) {
      if (usedAt[i][j]) {
        chosen.push(items[i].ref);
        j = fromAt[i][j];
      }
    }
    return { chosen, cost: dp[target] };
  }

  function findTypeASegmentedResult(slabs, widthM, lengthM, marginCm) {
    const needW = widthM * 100 + 2 * marginCm;
    const needL = lengthM * 100 + 2 * marginCm;
    const cross = Math.min(needW, needL);
    const long = Math.max(needW, needL);

    const items = [];
    for (const slab of slabs) {
      if (!hasValidPrice(slab)) continue;
      const capacity = Math.floor(slabCapacityForCross(slab, cross));
      if (capacity <= 0) continue; // cross exceeds every side of this slab — unusable, even with a seam
      items.push({ capacity, cost: slab.price_total_rub, ref: slab });
    }
    if (!items.length) return null; // geometry limit: nothing fits the cross dimension at all

    const covered = minCostCover(items, long);
    if (!covered) return { slabs: null, subtotal: null }; // fits geometrically, but combined stock falls short
    return { slabs: covered.chosen, subtotal: covered.cost };
  }

  function computeRemainderAreaM2(slab, widthM, lengthM) {
    const slabAreaM2 = (slab.width_cm / 100) * (slab.length_cm / 100);
    return slabAreaM2 - widthM * lengthM;
  }

  // Area is discretized to 0.1 m2 steps for the covering DP -- fine enough
  // for a quote (there's already a waste-factor fudge and a manager
  // confirms the real price), while keeping the DP grid small regardless of
  // how large the job or how many slabs the stone has in stock.
  const AREA_DP_UNIT_M2 = 0.1;

  function computeTypeBResult(slabs, widthM, lengthM, wasteFactor) {
    const items = [];
    for (const slab of slabs) {
      if (!hasValidPrice(slab)) continue;
      const areaM2 = (slab.width_cm / 100) * (slab.length_cm / 100);
      const capacity = Math.floor(areaM2 / AREA_DP_UNIT_M2);
      if (capacity <= 0) continue;
      items.push({ capacity, cost: slab.price_total_rub, ref: slab });
    }
    if (!items.length) return null;

    const areaNeeded = widthM * lengthM * wasteFactor;
    const target = Math.ceil(areaNeeded / AREA_DP_UNIT_M2);
    const covered = minCostCover(items, target);
    if (!covered) return { slabs: null, subtotal: null }; // combined stock falls short of the needed area
    return { slabs: covered.chosen, subtotal: covered.cost };
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

    const empty = { subtotal: null, work: null, total: null, nSlabs: 0, remainderM2: null, matchedSlab: null, matchedSlabs: [] };

    if (!(widthM > 0) || !(lengthM > 0)) {
      return Object.assign({ ok: false, reason: 'invalid_dimensions' }, empty);
    }
    if (!stone || !stone.slabs || stone.slabs.length === 0) {
      return Object.assign({ ok: false, reason: 'no_slabs_for_stone' }, empty);
    }
    // Distinct from 'no_slabs_for_stone': slabs exist (so stock is real) but
    // none of them have a usable total price -- without this check the
    // request would fall through to the geometry-fit paths below, which
    // (now that they skip priceless slabs) would report 'no_fitting_slab'
    // and wrongly blame the product's dimensions instead of missing price data.
    if (!stone.slabs.some(hasValidPrice)) {
      return Object.assign({ ok: false, reason: 'no_priced_slab' }, empty);
    }

    if (productType === 'A') {
      const slab = findBestTypeASlab(stone.slabs, widthM, lengthM, marginCm);
      if (slab) {
        const subtotal = slab.price_total_rub;
        const { work, total } = computeWorkAndTotal(subtotal, workMultiplier, complexityMultiplier, optionSurchargeSum);
        const remainderM2 = computeRemainderAreaM2(slab, widthM, lengthM);
        return { ok: true, reason: null, subtotal, work, total, nSlabs: 1, remainderM2, matchedSlab: slab, matchedSlabs: [slab] };
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
        return Object.assign({ ok: false, reason: 'insufficient_stock' }, empty);
      }
      const { work, total } = computeWorkAndTotal(segmented.subtotal, workMultiplier, complexityMultiplier, optionSurchargeSum);
      return {
        ok: true, reason: null, subtotal: segmented.subtotal, work, total,
        nSlabs: segmented.slabs.length, remainderM2: null,
        matchedSlab: segmented.slabs[0], matchedSlabs: segmented.slabs
      };
    }

    const typeBResult = computeTypeBResult(stone.slabs, widthM, lengthM, wasteFactor);
    if (!typeBResult) {
      return Object.assign({ ok: false, reason: 'no_slabs_for_stone' }, empty);
    }
    if (typeBResult.subtotal === null) {
      return Object.assign({ ok: false, reason: 'insufficient_stock' }, empty);
    }
    const { work, total } = computeWorkAndTotal(typeBResult.subtotal, workMultiplier, complexityMultiplier, optionSurchargeSum);
    return {
      ok: true, reason: null, subtotal: typeBResult.subtotal, work, total,
      nSlabs: typeBResult.slabs.length, remainderM2: null,
      matchedSlab: typeBResult.slabs[0], matchedSlabs: typeBResult.slabs
    };
  }

  return {
    findBestTypeASlab, slabCapacityForCross, minCostCover, findTypeASegmentedResult,
    computeRemainderAreaM2, computeTypeBResult, computeWorkAndTotal, calculatePrice
  };
});
