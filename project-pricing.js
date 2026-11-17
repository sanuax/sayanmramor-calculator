// project-pricing.js
//
// One price for the project (the owner, 2026-11-17): several products, one total.
//   - Each product is priced as the page prices it alone (priceItem: the same calculatePrice call
//     as computeAndRenderSummary) -- its work: изготовление, вырезы, кромка, швы, монтаж...
//   - The stone: the products are grouped by stone. Every piece of every product of a group is laid
//     out on that stone's slabs together, in one layout (as a countertop's backsplash and island are
//     with it); a product priced by its area (a floor, a wall, a facade) takes the slabs the pieces
//     left. Products of another stone are cut from their own slabs.
//   - Each product's price in the project is its work plus its share of its group's stone (by the
//     area of its stone): the products' prices add up to the total.
//   - The measure and the delivery are charged once for the project, if any product asks for them;
//     the minimum order is on the project's total.
// Pure, no DOM.
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(
      require('./constructor-state.js'), require('./pricing.js'), require('./product-types.js'), require('./rate-catalog.js'),
      require('./product-parts.js'), require('./edge-length.js'), require('./visualizer/geometry-model.js'), require('./visualizer/scene-layout.js'),
    );
  } else {
    root.ProjectPricing = factory(root.ConstructorState, root.Pricing, root.ProductTypes, root.RateCatalog,
      root.ProductParts, root.EdgeLength, root.GeometryModel, root.SceneLayout);
  }
})(typeof window !== 'undefined' ? window : globalThis, function (ConstructorState, Pricing, ProductTypes, RateCatalog, ProductParts, EdgeLength, GeometryModel, SceneLayout) {

  const isNumber = x => typeof x === 'number' && Number.isFinite(x);

  // The open edge the edge is priced on (as the page's openEdgeLengthM): 0 without a profile.
  function edgeLengthOf(state) {
    const caps = state.product && state.product.capabilities;
    if (!(caps && caps.supportsEdgeWork && state.edge && state.edge.type)) return 0;
    return EdgeLength.openEdgeLengthM(SceneLayout.buildSceneLayout(GeometryModel.buildGeometryModel(state)));
  }

  function sizesReady(state) {
    const key = state.product && state.product.key;
    const cfg = state.productConfig || {};
    if (key === 'fasad') return !!(cfg.fasad && cfg.fasad.complete);
    if (key === 'kaminy') return !!(cfg.kaminy && cfg.kaminy.complete);
    return state.dimensions.widthM > 0 && state.dimensions.lengthM > 0;
  }

  // A product as the page prices it alone.
  //   incomplete -- no product, sizes, a shape's own size or a stone yet
  //   manual     -- the manager's (a sold-out stone, no slab that fits, ...): `reason`
  //   ok         -- `result` (Pricing.calculatePrice), `inputs` (ConstructorState.buildPricingInputs)
  function priceItem(state) {
    const edgeLengthM = state && state.product ? edgeLengthOf(state) : 0;
    if (!state || !state.product || !sizesReady(state)) return { kind: 'incomplete', edgeLengthM };
    if (ProductParts.buildJob(state).missing.length) return { kind: 'incomplete', edgeLengthM };
    const stone = state.stone;
    if (!stone) return { kind: 'incomplete', edgeLengthM };
    if (stone.available === false) return { kind: 'manual', reason: 'stone_unavailable', edgeLengthM };
    const product = ProductTypes.PRODUCTS[state.product.key];
    const inputs = ConstructorState.buildPricingInputs(state, { catalog: RateCatalog, edgeLengthM });
    const o = state.options;
    const result = Pricing.calculatePrice({
      stone, widthM: state.dimensions.widthM, lengthM: state.dimensions.lengthM, productType: product.type,
      rates: inputs.rates,
      installEnabled: o.installEnabled, polishEnabled: o.polishEnabled, complexEnabled: o.complexEnabled,
      lightEnabled: o.lightEnabled, measureEnabled: o.measureEnabled, deliveryEnabled: o.deliveryEnabled,
      extraLineItems: inputs.extraLineItems, marginCm: ProductTypes.SAW_MARGIN_CM, allowSeam: product.allowSeam !== false,
      job: inputs.job, usageLimit: ProductTypes.SLAB_USAGE_LIMIT, groupRates: inputs.groupRates,
      seamRate: inputs.seamRate, shape: inputs.shape,
    });
    if (!result.ok) return { kind: 'manual', reason: result.reason, edgeLengthM, inputs };
    return { kind: 'ok', result, inputs, edgeLengthM };
  }

  const jobAreaOf = job => (job.pieces
    ? job.pieces.reduce((s, p) => s + p.areaM2 * Math.max(0, Math.round(p.count || 1)), 0)
    : job.surfaceAreaM2);

  // One stone's products cut together: the pieces in one layout, the surfaces on the slabs left.
  function cutGroup(stone, jobs) {
    const pieces = [].concat(...jobs.filter(j => j.pieces).map(j => j.pieces));
    const surfaceAreaM2 = jobs.filter(j => !j.pieces).reduce((s, j) => s + j.surfaceAreaM2, 0);
    let slabs = [], subtotal = 0;
    if (pieces.length) {
      const plan = Pricing.planMaterial({ slabs: stone.slabs, job: { pieces }, marginCm: ProductTypes.SAW_MARGIN_CM, usageLimit: ProductTypes.SLAB_USAGE_LIMIT });
      if (!plan.ok) return { ok: false, reason: plan.reason };
      slabs = plan.slabs.slice();
      subtotal += plan.subtotal;
    }
    if (surfaceAreaM2 > 0) {
      const left = stone.slabs.filter(s => !slabs.includes(s));
      const plan = Pricing.planSurface(left, surfaceAreaM2, ProductTypes.SLAB_USAGE_LIMIT);
      if (!plan.ok) return { ok: false, reason: plan.reason };
      plan.used.forEach(u => { slabs.push(u.slab); subtotal += u.slab.price_total_rub; });
    }
    return { ok: true, slabs, subtotal };
  }

  // states: every product of the project, as ConstructorState reads it (its stone in state.stone).
  function priceProject(states) {
    const priced = states.map(priceItem);
    const items = priced.map(p => ({ kind: p.kind, reason: p.reason || null, price: null, stoneShare: null, work: null }));

    // The work of each product, without the measure and the delivery (charged once below).
    priced.forEach((p, i) => {
      if (p.kind !== 'ok') return;
      const r = p.result;
      items[i].work = r.work === null ? null : r.work - (r.measure || 0) - (r.delivery || 0);
    });

    // The stone, per stone.
    const groups = [];
    priced.forEach((p, i) => {
      if (p.kind !== 'ok') return;
      const id = states[i].stone.id;
      let g = groups.find(x => x.stoneId === id);
      if (!g) { g = { stoneId: id, stone: states[i].stone, itemIndexes: [] }; groups.push(g); }
      g.itemIndexes.push(i);
    });
    let groupFailed = null;
    groups.forEach(g => {
      const cut = cutGroup(g.stone, g.itemIndexes.map(i => priced[i].inputs.job));
      g.ok = cut.ok;
      if (!cut.ok) { g.reason = cut.reason; groupFailed = groupFailed || cut.reason; g.nSlabs = 0; g.subtotal = null; g.slabs = []; return; }
      g.slabs = cut.slabs;
      g.nSlabs = cut.slabs.length;
      g.subtotal = cut.subtotal;
      const areas = g.itemIndexes.map(i => jobAreaOf(priced[i].inputs.job));
      const total = areas.reduce((s, a) => s + a, 0);
      g.itemIndexes.forEach((i, k) => {
        items[i].stoneShare = total > 0 ? cut.subtotal * areas[k] / total : 0;
        items[i].price = items[i].work === null ? null : items[i].work + items[i].stoneShare;
      });
    });
    groups.forEach(g => { delete g.stone; });

    // Once for the project: the measure and the delivery (at the company's rate), the minimum order.
    const ok = priced.filter(p => p.kind === 'ok');
    const misc = ok.length ? (ok[0].inputs.rates.misc || {}) : {};
    const asked = name => states.some(s => s && s.options && s.options[name]);
    const measure = asked('measureEnabled') && isNumber(misc.measure) ? misc.measure : 0;
    const delivery = asked('deliveryEnabled') && isNumber(misc.delivery) ? misc.delivery : 0;
    const out = { measure, delivery, minOrderTopUp: 0, items, groups, total: null, kind: 'ok', reason: null };

    if (priced.some(p => p.kind === 'incomplete')) { out.kind = 'incomplete'; return out; }
    const manual = priced.find(p => p.kind === 'manual');
    if (manual || groupFailed || items.some(it => it.work === null)) {
      out.kind = 'manual';
      out.reason = manual ? manual.reason : (groupFailed || 'unpriced_work');
      return out;
    }
    const raw = items.reduce((s, it) => s + it.price, 0) + measure + delivery;
    const minOrder = isNumber(misc.minOrder) ? misc.minOrder : 0;
    out.minOrderTopUp = raw < minOrder ? minOrder - raw : 0;
    out.total = raw + out.minOrderTopUp;
    return out;
  }

  return { edgeLengthOf, priceItem, priceProject };
});
