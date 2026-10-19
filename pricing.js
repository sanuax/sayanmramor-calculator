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

  // findBestTypeASlab / findTypeASegmentedResult / computeTypeBResult* below
  // are the earlier single-product searches. calculatePrice no longer calls
  // them -- every product goes through planMaterial (the slab layout with
  // the 35% reserve); they stay as tested building blocks (slabCapacityForCross
  // and minCostCover are the ones the layout reuses).
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
  // sills, steps) can still be cut with a seam - but the seam must run along
  // one straight axis of the piece, so the check is geometric, not areal:
  // one dimension ("cross") must fit across a single slab, and the other
  // ("long") gets split into pieces cut from one or more slabs.
  //
  // A single slab can usually yield more than one piece: cutting a strip of
  // width `cross` doesn't consume the slab's other dimension, only `cross`
  // worth of it - so floor(side / cross) parallel strips fit side by side,
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
    // Even every item together cannot reach the target: the answer is "no
    // cover" -- known before allocating the DP arrays below, whose size (x
    // the number of items) grows with the target. The same answer the DP
    // would give, without its memory.
    const reachable = items.reduce((sum, item) => sum + Math.min(Math.max(0, item.capacity), target), 0);
    if (!(reachable >= target)) return null;

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
      if (capacity <= 0) continue; // cross exceeds every side of this slab - unusable, even with a seam
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
    return computeTypeBResultForArea(slabs, widthM * lengthM, wasteFactor);
  }

  // Type B needs only an area: the stone is covered by area, whatever shape
  // it clads (a facade's column or cornice gives its own area, not w x l).
  function computeTypeBResultForArea(slabs, areaM2, wasteFactor) {
    const items = [];
    for (const slab of slabs) {
      if (!hasValidPrice(slab)) continue;
      const areaM2 = (slab.width_cm / 100) * (slab.length_cm / 100);
      const capacity = Math.floor(areaM2 / AREA_DP_UNIT_M2);
      if (capacity <= 0) continue;
      items.push({ capacity, cost: slab.price_total_rub, ref: slab });
    }
    if (!items.length) return null;

    const areaNeeded = areaM2 * wasteFactor;
    const target = Math.ceil(areaNeeded / AREA_DP_UNIT_M2);
    const covered = minCostCover(items, target);
    if (!covered) return { slabs: null, subtotal: null }; // combined stock falls short of the needed area
    return { slabs: covered.chosen, subtotal: covered.cost };
  }

  // ---- Раскрой: изделие как набор деталей на реальных слэбах --------------
  //
  // Every product is a job:
  //   { pieces: [...] }      -- separate stone parts with real sizes (steps,
  //                             risers, treads, landings, a countertop and its
  //                             wings, sills, facade pieces), or
  //   { surfaceAreaM2 }      -- a cladded surface (floor, wall, panel, a
  //                             facade's wall/cornice/round column) that is
  //                             cut into whatever pieces the slabs give.
  // A piece: { key, group, lengthM, widthM (its bounding rectangle), areaM2
  // (the real area of its shape), count, seam (may be split along its
  // length and joined with a seam) }.
  //
  // The reserve rule: the stone of the product takes at most `usageLimit`
  // (65%, i.e. 35% reserve -- ProductTypes.SLAB_USAGE_LIMIT) of every slab
  // it is cut from. The slabs are chosen by the geometry of the real pieces,
  // never by "area / 0.65": a slab counts only for the pieces that actually
  // fit on it.

  const PIECE_DP_UNIT_M2 = 0.01;

  function slabArea(slab) {
    return (slab.width_cm / 100) * (slab.length_cm / 100);
  }

  function fitsRect(slab, a, b) {
    return (slab.width_cm >= a && slab.length_cm >= b) || (slab.width_cm >= b && slab.length_cm >= a);
  }

  // A piece in centimetres with its saw margin on every edge (SAW_MARGIN_CM,
  // as for a single slab); `cross` is the short side, `run` the long one.
  function footprintCm(lengthM, widthM, marginCm) {
    const a = widthM * 100 + 2 * marginCm, b = lengthM * 100 + 2 * marginCm;
    return { cross: Math.min(a, b), run: Math.max(a, b) };
  }

  // The pieces as they are cut: a piece that fits no slab whole (or would
  // take more than the reserve allows of every slab it fits) is split along
  // its length into the fewest equal segments that do -- if it may have a
  // seam; otherwise the job cannot be cut. Same geometry as the segmented
  // Type A path: the seam runs across the run, the cross must fit a slab.
  function cutPieces(pieces, slabs, marginCm, usageLimit) {
    const out = [];
    let seams = 0;
    for (let pi = 0; pi < pieces.length; pi++) {
      const p = pieces[pi];
      const count = Math.max(0, Math.round(p.count || 1));
      if (!count) continue;
      const cross = footprintCm(p.lengthM, p.widthM, marginCm).cross;
      const longM = Math.max(p.lengthM, p.widthM);
      // The fewest segments k for which some slab holds one segment, both
      // geometrically and within the reserve.
      const segmentsFor = slab => {
        let best = Infinity;
        [[slab.width_cm, slab.length_cm], [slab.length_cm, slab.width_cm]].forEach(([side, other]) => {
          if (cross > side) return;
          const usable = other - 2 * marginCm;
          if (!(usable > 0)) return;
          let k = Math.max(1, Math.ceil(longM * 100 / usable - 1e-9));
          while (k <= 400 && p.areaM2 / k > usageLimit * slabArea(slab) + 1e-9) k++;
          if (k <= 400) best = Math.min(best, k);
        });
        return best;
      };
      let k = Infinity;
      for (const slab of slabs) k = Math.min(k, segmentsFor(slab));
      if (k === Infinity) {
        const fitsSomewhere = slabs.some(s => fitsRect(s, cross, footprintCm(p.lengthM, p.widthM, marginCm).run));
        return { error: fitsSomewhere ? 'exceeds_usage_limit' : 'no_fitting_slab', piece: p };
      }
      if (k > 1 && !p.seam) {
        const whole = footprintCm(p.lengthM, p.widthM, marginCm);
        return { error: slabs.some(s => fitsRect(s, whole.cross, whole.run)) ? 'exceeds_usage_limit' : 'no_fitting_slab', piece: p };
      }
      const segRun = (longM / k) * 100 + 2 * marginCm;
      for (let c = 0; c < count; c++) {
        for (let j = 0; j < k; j++) {
          out.push({ key: p.key, group: p.group || 'main', piece: pi, copy: c, segment: j, segments: k, cross, run: segRun, areaM2: p.areaM2 / k });
        }
      }
      seams += count * (k - 1);
    }
    return { cut: out, seams };
  }

  // Shelf packing of the given cut pieces on one slab laid X by Y (cm): the
  // pieces go in rows ("shelves"), each piece turned the preferred way where
  // it fits (`longAlongX`: its long side along X, or across) and the other
  // way where only that fits -- so a slab can take a row of pieces across it
  // and then rows along it. A piece is skipped once the slab's reserve
  // budget (usageLimit x slab area) would be passed. `order` lists the piece
  // indices, largest first.
  function shelfPack(X, Y, cut, order, budgetM2, longAlongX) {
    const shelves = [];
    let usedY = 0, area = 0;
    const placed = [];
    for (const idx of order) {
      const p = cut[idx];
      if (area + p.areaM2 > budgetM2 + 1e-9) continue;
      const orients = longAlongX === false ? [[p.cross, p.run], [p.run, p.cross]] : [[p.run, p.cross], [p.cross, p.run]];
      let spot = null;
      for (const sh of shelves) {
        const o = orients.find(([dx, dy]) => dy <= sh.h && sh.x + dx <= X);
        if (o) { spot = { x: sh.x, y: sh.y, dx: o[0], dy: o[1] }; sh.x += o[0]; break; }
      }
      if (!spot) {
        const o = orients.find(([dx, dy]) => dx <= X && usedY + dy <= Y);
        if (o) {
          spot = { x: 0, y: usedY, dx: o[0], dy: o[1] };
          shelves.push({ y: usedY, h: o[1], x: o[0] });
          usedY += o[1];
        }
      }
      if (spot) {
        area += p.areaM2;
        placed.push(Object.assign({ index: idx }, spot));
      }
    }
    return { placed, area };
  }

  // The most of the remaining pieces one slab holds: the slab both ways
  // round, the pieces preferring either way -- the best of the four layouts.
  function packSlab(slab, cut, remaining, usageLimit) {
    const order = remaining.slice().sort((i, j) => (cut[j].cross - cut[i].cross) || (cut[j].run - cut[i].run));
    const budget = usageLimit * slabArea(slab);
    let best = null;
    [[slab.width_cm, slab.length_cm], [slab.length_cm, slab.width_cm]].forEach(([X, Y]) => {
      [true, false].forEach(longAlongX => {
        const r = shelfPack(X, Y, cut, order, budget, longAlongX);
        if (!best || r.area > best.area + 1e-9) best = r;
      });
    });
    return best;
  }

  // Slabs for a set of pieces: each slab's yield is what it holds of the job
  // (packSlab); minCostCover picks the cheapest slabs whose yields reach the
  // job's area; then the pieces are really laid out on those slabs, and any
  // piece left over (yields overlap) gets more slabs the same way.
  // The cheapest of a few layouts of the same pieces: all of them together,
  // then by part (the product, its risers, a countertop's extra elements),
  // then by kind of piece. A partitioned layout takes the stock in turn --
  // a slab used for one part is out of the pool for the next -- so no slab
  // is ever counted twice. The yield-based cover is a good guess, not an
  // optimum; this keeps "all together" from ever costing more than cutting
  // the parts on their own.
  function planPieces(slabs, pieces, marginCm, usageLimit) {
    const partitions = [
      [pieces],
      groupBy(pieces, p => p.group || 'main'),
      groupBy(pieces, p => (p.group || 'main') + '/' + p.key),
    ];
    let best = null, firstFailure = null;
    const seen = new Set();
    partitions.forEach(parts => {
      const signature = parts.map(part => part.length).join(',');
      if (parts.length > 1 && seen.has(signature)) return;
      seen.add(signature);
      const plan = planPartsInTurn(slabs, parts, marginCm, usageLimit);
      if (!plan.ok) { if (!firstFailure) firstFailure = plan; return; }
      const cost = plan.used.reduce((s, u) => s + u.slab.price_total_rub, 0);
      if (!best || cost < best.cost - 1e-9 || (Math.abs(cost - best.cost) < 1e-9 && plan.used.length < best.plan.used.length)) best = { plan, cost };
    });
    return best ? best.plan : firstFailure;
  }

  function groupBy(items, keyOf) {
    const map = new Map();
    items.forEach(it => { const k = keyOf(it); if (!map.has(k)) map.set(k, []); map.get(k).push(it); });
    // The largest part first: it gets the pick of the stock.
    return Array.from(map.values()).sort((a, b) => b.reduce((s, p) => s + p.areaM2 * p.count, 0) - a.reduce((s, p) => s + p.areaM2 * p.count, 0));
  }

  function planPartsInTurn(slabs, parts, marginCm, usageLimit) {
    let pool = slabs;
    const merged = { ok: true, used: [], seams: 0, pieceCount: 0 };
    for (const part of parts) {
      const plan = planPiecesOnce(pool, part, marginCm, usageLimit);
      if (!plan.ok) return plan;
      merged.used = merged.used.concat(plan.used);
      merged.seams += plan.seams;
      merged.pieceCount += plan.pieceCount;
      const taken = new Set(plan.used.map(u => u.slab));
      pool = pool.filter(s => !taken.has(s));
    }
    return merged;
  }

  function planPiecesOnce(slabs, pieces, marginCm, usageLimit) {
    const priced = slabs.filter(hasValidPrice);
    const cutResult = cutPieces(pieces, priced, marginCm, usageLimit);
    if (cutResult.error) return { ok: false, reason: cutResult.error };
    const cut = cutResult.cut;
    let remaining = cut.map((_, i) => i);
    const used = [];
    const taken = new Set();
    for (let round = 0; remaining.length && round < 50; round++) {
      const yields = new Map();
      const items = [];
      priced.forEach((slab, si) => {
        if (taken.has(si)) return;
        const size = slab.width_cm + 'x' + slab.length_cm;
        if (!yields.has(size)) yields.set(size, packSlab(slab, cut, remaining, usageLimit).area);
        // Rounded up: a tiny piece still takes a slab (the layout below checks it).
        const capacity = Math.ceil(yields.get(size) / PIECE_DP_UNIT_M2 - 1e-9);
        if (capacity > 0) items.push({ capacity, cost: slab.price_total_rub, ref: si });
      });
      const need = remaining.reduce((s, i) => s + cut[i].areaM2, 0);
      const cover = minCostCover(items, Math.max(1, Math.ceil(need / PIECE_DP_UNIT_M2 - 1e-9)));
      if (!cover) return { ok: false, reason: 'insufficient_stock' };
      const capacityOf = new Map(items.map(it => [it.ref, it.capacity]));
      const chosen = cover.chosen.slice().sort((a, b) => capacityOf.get(b) - capacityOf.get(a));
      let progress = false;
      for (const si of chosen) {
        if (!remaining.length) break;
        const r = packSlab(priced[si], cut, remaining, usageLimit);
        if (!r.placed.length) continue;
        progress = true;
        taken.add(si);
        const placedSet = new Set(r.placed.map(p => p.index));
        remaining = remaining.filter(i => !placedSet.has(i));
        used.push({ slab: priced[si], placements: r.placed.map(p => Object.assign({}, p, { key: cut[p.index].key, group: cut[p.index].group })), usedAreaM2: r.area });
      }
      if (!progress) return { ok: false, reason: 'insufficient_stock' };
    }
    if (remaining.length) return { ok: false, reason: 'insufficient_stock' };
    return { ok: true, used, seams: cutResult.seams, pieceCount: cut.length };
  }

  // A cladded surface: cut freely, so a slab holds up to the reserve budget
  // of its own area -- the same covering DP as before, with the budget on
  // the supply side (usageLimit x slab) instead of a waste factor on demand.
  function planSurface(slabs, areaM2, usageLimit) {
    const items = [];
    for (const slab of slabs) {
      if (!hasValidPrice(slab)) continue;
      const capacity = Math.floor(usageLimit * slabArea(slab) / AREA_DP_UNIT_M2 + 1e-9);
      if (capacity > 0) items.push({ capacity, cost: slab.price_total_rub, ref: slab });
    }
    if (!items.length) return { ok: false, reason: 'no_slabs_for_stone' };
    const covered = minCostCover(items, Math.ceil(areaM2 / AREA_DP_UNIT_M2 - 1e-9));
    if (!covered) return { ok: false, reason: 'insufficient_stock' };
    // The area laid on each chosen slab, largest slab first, each up to its budget.
    let left = areaM2;
    const used = covered.chosen.slice().sort((a, b) => slabArea(b) - slabArea(a)).map(slab => {
      const take = Math.max(0, Math.min(left, usageLimit * slabArea(slab)));
      left -= take;
      return { slab, placements: [], usedAreaM2: take };
    });
    return { ok: true, used, seams: 0, pieceCount: 0 };
  }

  function jobArea(job, group) {
    if (job.pieces) {
      return job.pieces.filter(p => !group || (p.group || 'main') === group)
        .reduce((s, p) => s + p.areaM2 * Math.max(0, Math.round(p.count || 1)), 0);
    }
    return group && group !== 'main' ? 0 : job.surfaceAreaM2;
  }

  // The material of a job: which slabs, how much of them the product takes,
  // the reserve that is left. `utilization` + `waste` = 1.
  function planMaterial({ slabs, job, marginCm, usageLimit }) {
    const plan = job.pieces
      ? planPieces(slabs, job.pieces, marginCm, usageLimit)
      : planSurface(slabs, job.surfaceAreaM2, usageLimit);
    if (!plan.ok) return plan;
    const slabAreaM2 = plan.used.reduce((s, u) => s + slabArea(u.slab), 0);
    const usedAreaM2 = plan.used.reduce((s, u) => s + u.usedAreaM2, 0);
    return {
      ok: true, reason: null,
      slabs: plan.used.map(u => u.slab),
      layout: plan.used.map(u => ({ slab: u.slab, slabAreaM2: slabArea(u.slab), usedAreaM2: u.usedAreaM2, utilization: u.usedAreaM2 / slabArea(u.slab), placements: u.placements })),
      nSlabs: plan.used.length,
      subtotal: plan.used.reduce((s, u) => s + u.slab.price_total_rub, 0),
      productAreaM2: jobArea(job), slabAreaM2, usedAreaM2,
      utilization: usedAreaM2 / slabAreaM2, waste: 1 - usedAreaM2 / slabAreaM2,
      seams: plan.seams, pieceCount: plan.pieceCount,
    };
  }

  // Work for a part of the product that has its own rates (подступенки):
  // a null rate is "no company rate yet" -- nothing is charged for it and
  // the part is reported in `unpriced`, never silently priced at another
  // part's rate.
  function computeGroupWork(group, options) {
    const r = group.rates || {};
    const area = Math.max(0, group.areaM2 || 0);
    const priced = rate => typeof rate === 'number' && Number.isFinite(rate);
    const unpriced = [];
    const line = (rate, on, name) => {
      if (!on || !(area > 0)) return 0;
      if (!priced(rate)) { unpriced.push(name); return 0; }
      return rate * area;
    };
    const fabrication = line(r.fabricationRatePerM2, true, 'fabrication');
    const installation = line(r.installationRatePerM2, options.installEnabled, 'installation');
    const polish = line(r.polishRatePerM2, options.polishEnabled, 'polish');
    return { key: group.key, areaM2: area, fabrication, installation, polish, work: fabrication + installation + polish, unpriced };
  }

  // A work rate the company has set: a finite number. null (or none) is
  // «не задано» -- never 0.
  function isRateSet(rate) {
    return typeof rate === 'number' && Number.isFinite(rate);
  }

  // What the client reads when some of the product's own work has no rate:
  // «Стоимость изготовления уточнит менеджер.»
  const UNPRICED_WORK_NAMES = { fabrication: 'изготовления', installation: 'монтажа', polish: 'полировки' };
  function unpricedWorkNote(unpriced) {
    const names = (unpriced || []).map(k => UNPRICED_WORK_NAMES[k]).filter(Boolean);
    if (!names.length) return null;
    const list = names.length > 1 ? names.slice(0, -1).join(', ') + ' и ' + names[names.length - 1] : names[0];
    return 'Стоимость ' + list + ' уточнит менеджер.';
  }

  function computeWorkAndTotal(subtotal, area, rates, options, extraDimensions, extraLineItems) {
    const { installEnabled, polishEnabled, complexEnabled } = options;
    const { bortikLengthM = 0, fartukAreaM2 = 0, ostrovAreaM2 = 0 } = extraDimensions || {};
    // The product's own work that is asked for but has no rate yet: it is
    // not free -- its line, the work and the total stay unknown (null) and
    // `unpriced` names it; the stone (subtotal) is still what it is.
    const unpriced = [];
    if (!isRateSet(rates.fabricationRatePerM2)) unpriced.push('fabrication');
    if (installEnabled && !isRateSet(rates.installationRatePerM2)) unpriced.push('installation');
    if (polishEnabled && !isRateSet(rates.polishRatePerM2)) unpriced.push('polish');
    const fabrication = unpriced.includes('fabrication') ? null
      : rates.fabricationRatePerM2 * (complexEnabled ? rates.complexShapeMultiplier : 1) * area;
    const installation = !installEnabled ? 0 : (unpriced.includes('installation') ? null : rates.installationRatePerM2 * area);
    const polish = !polishEnabled ? 0 : (unpriced.includes('polish') ? null : rates.polishRatePerM2 * area);
    // miscFlatSum/miscRatePerM2/bortikRatePerM/fartukRatePerM2/ostrovRatePerM2
    // are `null` in product-types.js until real КП data is available for
    // each -- treat that as "not charged yet", not NaN.
    const miscFlatSum = rates.miscFlatSum || 0;
    const miscRatePerM2 = rates.miscRatePerM2 || 0;
    const misc = miscFlatSum + miscRatePerM2 * area;
    const bortikRatePerM = rates.bortikRatePerM || 0;
    const fartukRatePerM2 = rates.fartukRatePerM2 || 0;
    const ostrovRatePerM2 = rates.ostrovRatePerM2 || 0;
    const extras = Math.max(0, bortikLengthM) * bortikRatePerM
                 + Math.max(0, fartukAreaM2) * fartukRatePerM2
                 + Math.max(0, ostrovAreaM2) * ostrovRatePerM2;
    // Generic sum for the rate-catalog-backed additional works (cuts, holes,
    // edge treatment, and the expanded "Дополнительно" items) -- each entry
    // already carries its own resolved rate (or null, until the company
    // fills in rate-catalog.js), so this needs no lookup of its own.
    const catalogExtras = (extraLineItems || []).reduce(
      (sum, item) => sum + Math.max(0, item.quantity) * (item.rate || 0),
      0
    );
    const work = unpriced.length ? null : fabrication + installation + polish + misc + extras + catalogExtras;
    const total = work === null ? null : subtotal + work;
    return { fabrication, installation, polish, misc, extras, catalogExtras, work, total, unpriced };
  }

  // The online estimate's limits: a product past them is a project for a
  // manager, not a quick calculation -- and an absurd size (a mistyped
  // 99 999 999 mm) must never reach the slab search, whose work grows with
  // the size. One place to change them.
  const PRICING_LIMITS = { maxSideM: 100, maxAreaM2: 10000 };

  function isTooLarge(widthM, lengthM, areaM2) {
    return !(widthM <= PRICING_LIMITS.maxSideM) || !(lengthM <= PRICING_LIMITS.maxSideM) || !(areaM2 <= PRICING_LIMITS.maxAreaM2);
  }

  // The job of a plain width x length product when the caller gives none:
  // Type A -- one piece (with a seam along its length if allowed), Type B --
  // a cladded surface of that area (or of `areaM2`, a facade's surface).
  function defaultJob(productType, widthM, lengthM, allowSeam, areaM2) {
    if (productType === 'A') {
      return { pieces: [{ key: 'main', group: 'main', lengthM, widthM, areaM2: widthM * lengthM, count: 1, seam: allowSeam }] };
    }
    return { surfaceAreaM2: areaM2 !== null && areaM2 !== undefined ? areaM2 : widthM * lengthM };
  }

  // A size that is not a finite number is "too large" (jobIsTooLarge), not
  // invalid -- except a surface given as an explicit area (a facade's), which
  // must be a real positive number.
  function jobIsValid(job, explicitArea) {
    if (job.pieces) {
      return job.pieces.length > 0 && job.pieces.every(p => p.lengthM > 0 && p.widthM > 0 && p.areaM2 > 0 && p.count >= 1)
        && job.pieces.some(p => (p.group || 'main') === 'main');
    }
    return job.surfaceAreaM2 > 0 && (!explicitArea || Number.isFinite(job.surfaceAreaM2));
  }

  function jobIsTooLarge(job) {
    if (job.pieces) {
      return job.pieces.some(p => isTooLarge(p.widthM, p.lengthM, 0)) || isTooLarge(0, 0, jobArea(job));
    }
    return isTooLarge(0, 0, job.surfaceAreaM2);
  }

  function calculatePrice(params) {
    const {
      stone, widthM, lengthM, productType, marginCm,
      rates, installEnabled = false, polishEnabled = false, complexEnabled = false,
      extraDimensions = {}, extraLineItems = [], allowSeam = true,
      // Optional, Type B only: the priced area when it is not width x length
      // (a facade's cladded surface -- see ConstructorState.buildPricingInputs).
      areaM2 = null,
      // The product as pieces or a surface (ProductParts.buildJob); without
      // one, the plain width x length product (defaultJob).
      job: givenJob = null,
      // The share of every slab the product may take: 0.65 = 35% reserve
      // (ProductTypes.SLAB_USAGE_LIMIT).
      usageLimit = 0.65,
      // Parts with their own rates (подступенки): [{ key, rates }].
      groupRates = [],
    } = params;
    const explicitArea = !givenJob && productType !== 'A' && areaM2 !== null && areaM2 !== undefined;
    const job = givenJob || defaultJob(productType, widthM, lengthM, allowSeam, explicitArea ? areaM2 : null);

    const empty = {
      subtotal: null, fabrication: null, installation: null, polish: null, misc: null, extras: null,
      catalogExtras: null, work: null, total: null, nSlabs: 0, remainderM2: null, matchedSlab: null, matchedSlabs: [],
      material: null, groups: [], unpriced: [], workNote: null
    };

    if (!jobIsValid(job, explicitArea || (givenJob && !givenJob.pieces))) {
      return Object.assign({ ok: false, reason: 'invalid_dimensions' }, empty);
    }
    // Past the online limits (or not a finite size at all): a controlled
    // outcome the page explains, before any slab search.
    if (jobIsTooLarge(job)) {
      return Object.assign({ ok: false, reason: 'dimensions_too_large' }, empty);
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

    const material = planMaterial({ slabs: stone.slabs, job, marginCm, usageLimit });
    if (!material.ok) {
      return Object.assign({ ok: false, reason: material.reason }, empty);
    }

    // The product's own work (изготовление, монтаж, полировка) is counted on
    // its main parts; parts with their own rates are counted separately.
    const options = { installEnabled, polishEnabled, complexEnabled };
    const mainArea = jobArea(job, 'main');
    const groups = [];
    if (job.pieces) {
      const otherKeys = Array.from(new Set(job.pieces.map(p => p.group || 'main').filter(g => g !== 'main')));
      // What the stone of these parts adds: the material with them minus
      // the material of the main parts alone (0 when they come out of the
      // same slabs' reserve-free room).
      const mainOnly = otherKeys.length
        ? planMaterial({ slabs: stone.slabs, job: { pieces: job.pieces.filter(p => (p.group || 'main') === 'main') }, marginCm, usageLimit })
        : null;
      otherKeys.forEach(key => {
        const entry = groupRates.find(g => g.key === key) || { key, rates: null };
        // work: false -- the part's work is priced elsewhere (a countertop's
        // extra elements: the additional works); only its stone counts here.
        const work = entry.work === false
          ? { key, areaM2: jobArea(job, key), fabrication: 0, installation: 0, polish: 0, work: 0, unpriced: [], workElsewhere: true }
          : computeGroupWork({ key, areaM2: jobArea(job, key), rates: entry.rates }, options);
        work.stone = mainOnly && mainOnly.ok ? Math.max(0, material.subtotal - mainOnly.subtotal) : null;
        groups.push(work);
      });
    }
    const subtotal = material.subtotal;
    const base = computeWorkAndTotal(subtotal, mainArea, rates, options, extraDimensions, extraLineItems);
    const groupWork = groups.reduce((s, g) => s + g.work, 0);
    // The product's own work without a rate (base.unpriced): the stone is
    // priced, the work and the total are left to the manager -- never a
    // total that looks final (see computeWorkAndTotal).
    const work = base.work === null ? null : base.work + groupWork;
    // Only one slab, one uncut piece: how much of that slab is left.
    const single = job.pieces && material.nSlabs === 1 && material.seams === 0 && job.pieces.length === 1 && job.pieces[0].count === 1;
    return {
      ok: true, reason: null, subtotal,
      fabrication: base.fabrication, installation: base.installation, polish: base.polish, misc: base.misc,
      extras: base.extras, catalogExtras: base.catalogExtras, groupWork, work, total: work === null ? null : subtotal + work,
      unpriced: base.unpriced, workNote: unpricedWorkNote(base.unpriced),
      nSlabs: material.nSlabs,
      remainderM2: single ? material.slabAreaM2 - material.productAreaM2 : null,
      matchedSlab: material.slabs[0], matchedSlabs: material.slabs,
      material, groups,
    };
  }

  return {
    findBestTypeASlab, slabCapacityForCross, minCostCover, findTypeASegmentedResult,
    computeRemainderAreaM2, computeTypeBResult, computeTypeBResultForArea, computeWorkAndTotal, calculatePrice,
    isRateSet, unpricedWorkNote,
    cutPieces, shelfPack, packSlab, planPieces, planSurface, planMaterial, computeGroupWork, defaultJob,
    PRICING_LIMITS
  };
});
