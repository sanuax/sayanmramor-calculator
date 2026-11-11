// constructor-state.js
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.ConstructorState = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {

  const FacadeModel = (typeof module !== 'undefined' && module.exports)
    ? require('./facade-model.js')
    : (typeof window !== 'undefined' ? window : globalThis).FacadeModel;
  // Loaded after this file in the page -- looked up when used.
  const isNode = typeof module !== 'undefined' && module.exports;
  const lazy = (file, name) => () => (isNode ? require(file) : (typeof window !== 'undefined' ? window : globalThis)[name]);
  const Geometry = lazy('./visualizer/geometry-model.js', 'GeometryModel');
  const Parts = lazy('./product-parts.js', 'ProductParts');
  const Fireplace = lazy('./fireplace-model.js', 'FireplaceModel');
  const Catalog = lazy('./rate-catalog.js', 'RateCatalog');

  // Products whose sizes are their own named fields (facade-model.js,
  // fireplace-model.js), not the generic width x length -- a value left in
  // those fields by another product must never reach them.
  const OWN_SIZE_PRODUCTS = ['fasad', 'kaminy'];

  function mmToM(mmValue) {
    return mmValue / 1000;
  }

  function numFromField(doc, id) {
    return parseFloat(doc.getElementById(id).value) || 0;
  }

  // Same 5 legacy fields the real calculator's #edgeWork block reads today,
  // in a fixed priority order used both to pick the single `edge` view and
  // to label each raw `edgeLineItems` entry. Order/ids/rateIds match
  // EDGE_LINE_ITEMS in sayanmramor-calculator.html exactly.
  const EDGE_FIELDS = [
    { elId: 'edge-straight', rateId: 'EDGE-01', type: 'straight' },
    { elId: 'edge-figured', rateId: 'EDGE-03', type: 'figured' },
    { elId: 'edge-round', rateId: 'EDGE-04', type: 'rounding' },
    { elId: 'edge-chamfer', rateId: 'EDGE-05', type: 'bevel' },
    { elId: 'edge-stonefold', rateId: 'EDGE-06', type: 'stone-wrap' },
  ];

  function readEdgeLineItems(doc) {
    const items = [];
    EDGE_FIELDS.forEach(({ elId, rateId, type }) => {
      const lengthMm = numFromField(doc, elId);
      if (lengthMm > 0) items.push({ rateId, type, lengthMm });
    });
    return items;
  }

  // The edge step is a single profile choice: the calculator's UI stores the
  // chosen profile in #edge-type and has no length input (a typed length
  // never changed the model -- the profile is applied to the whole edge).
  // There is no automatic edge-length rule yet, so such a selection carries
  // lengthMm: null and adds no priced edgeLineItems; the legacy per-type
  // length fields above are still read for pricing, unchanged.
  function readSelectedEdgeType(doc) {
    const value = doc.getElementById('edge-type').value;
    return EDGE_FIELDS.some(f => f.type === value) ? value : null;
  }

  // Fixed priority order, not magnitude -- see docs/superpowers/specs/2026-09-21-3d-visualizer-design.md.
  function deriveSingleEdge(edgeLineItems, selectedType) {
    if (edgeLineItems.length === 0) return { type: selectedType || null, lengthMm: null };
    const winner = EDGE_FIELDS.find(f => edgeLineItems.some(item => item.type === f.type));
    const item = edgeLineItems.find(i => i.type === winner.type);
    return { type: item.type, lengthMm: item.lengthMm };
  }

  function readSinkCounts(doc, hasCapability) {
    if (!hasCapability) return { overlay: 0, undermount: 0, integrated: 0 };
    return {
      overlay: numFromField(doc, 'cut-sink-overlay'),
      undermount: numFromField(doc, 'cut-sink-undermount'),
      integrated: numFromField(doc, 'cut-sink-integrated'),
    };
  }

  const SINK_PRIORITY = ['overlay', 'undermount', 'integrated'];

  function deriveSingleSink(sinkCounts) {
    const type = SINK_PRIORITY.find(t => sinkCounts[t] > 0) || null;
    return { type, count: type ? sinkCounts[type] : 0, position: null };
  }

  // Количество ступеней («Лестницы», «Ступени»): the whole number of treads
  // the client asks for -- the ONE source of the flight drawn in 3D, of the
  // Result's "Количество ступеней" row and of the lead. The calculator keeps
  // only valid values in #step-count (the visible field validates first), so
  // the product default is used only when there is no UI at all; it is the
  // same default the visible field starts with. 30 is a technical cap (no
  // business limit exists): a flight that tall is still one scene.
  const STEP_COUNT_RANGE = { min: 1, max: 30 };
  const STEP_COUNT_DEFAULTS = { lestnitsa: 12, stupeni: 4 };

  // Забежные ступени (STEP-02) wind around one pivot: more than 10 of them
  // wind past a full turn, so that type allows at most 10.
  const STEP_COUNT_MAX_BY_TYPE = { 'STEP-02': 10 };

  // The allowed count for this product and type (the UI validates against
  // exactly this range).
  function stepCountRange(productKey, typeId) {
    const typeMax = productKey === 'stupeni' ? STEP_COUNT_MAX_BY_TYPE[typeId] : undefined;
    return { min: STEP_COUNT_RANGE.min, max: typeMax || STEP_COUNT_RANGE.max };
  }

  function isValidStepCount(n, range) {
    const r = range || STEP_COUNT_RANGE;
    return Number.isInteger(n) && n >= r.min && n <= r.max;
  }

  function readStepCount(doc, productKey, typeId) {
    if (!(productKey in STEP_COUNT_DEFAULTS)) return null;
    const raw = String(doc.getElementById('step-count').value).trim();
    const n = raw === '' ? NaN : Number(raw);
    const count = isValidStepCount(n) ? n : STEP_COUNT_DEFAULTS[productKey];
    // A count entered for another type (e.g. 30, then «Забежные») is brought
    // down to this type's limit -- the state never holds more.
    return Math.min(count, stepCountRange(productKey, typeId).max);
  }

  function readConstructorState({ doc, selectedProductKey, product, stone, hasAdditionalWork }) {
    const d = doc;
    const cap = (name) => !!(product && hasAdditionalWork(product, name));

    // Every countertop-extras capability read below assumes
    // product.supportsCountertopExtras is true whenever product.additionalWorks
    // is defined -- enforced by a test in tests/product-types.test.js. If that
    // ever stops holding, calculate()'s UI-visibility gate (supportsCountertopExtras)
    // and this file's pricing gate (per-capability hasAdditionalWork) would disagree.
    const capabilities = product ? {
      supportsEdgeWork: !!product.supportsEdgeWork,
      supportsCountertopExtras: !!product.supportsCountertopExtras,
      supportsShapeSelection: !!product.supportsShapeSelection,
      sinkCutout: cap('sinkCutout'), cooktopCutout: cap('cooktopCutout'), holes: cap('holes'),
      curb: cap('curb'), backsplash: cap('backsplash'), wallPanel: cap('wallPanel'),
      island: cap('island'), barCounter: cap('barCounter'),
    } : null;

    // shape/wing/corner: real user-entered geometry (Прямая/Г-образная/
    // П-образная -- a П uses the same wing size for both of its wings).
    // Zeroed/forced to 'straight' for a product without supportsShapeSelection,
    // same defensive-zeroing pattern as the countertop-extras fields below --
    // wing.widthM/lengthM are only promoted to a real ProductGeometryModel.wing
    // by buildGeometryModel() once both are > 0 (see visualizer/geometry-model.js).
    const supportsShapeSelection = !!(capabilities && capabilities.supportsShapeSelection);
    const shapeValue = d.getElementById('productShape').value;
    const shape = supportsShapeSelection && (shapeValue === 'lshape' || shapeValue === 'ushape') ? shapeValue : 'straight';
    const wing = {
      widthM: supportsShapeSelection ? mmToM(numFromField(d, 'wing-width')) : 0,
      lengthM: supportsShapeSelection ? mmToM(numFromField(d, 'wing-length')) : 0,
    };
    const corner = supportsShapeSelection ? (d.getElementById('shape-corner').value || 'left') : 'left';

    // Unconditional, matching sayanmramor-calculator.html's calculate(): the
    // real app's `const edgeResult = readLengthLineItems(EDGE_LINE_ITEMS);`
    // has no capability gate (unlike the countertop-extras block below it),
    // so a stale edge value left over from a previously selected product is
    // still priced today. See task-4-fix-report.md for the ruling on this.
    const edgeLineItems = readEdgeLineItems(d);
    const sinkCounts = readSinkCounts(d, capabilities && capabilities.sinkCutout);
    const cooktopCount = capabilities && capabilities.cooktopCutout ? numFromField(d, 'cut-cooktop') : 0;
    const holeCounts = capabilities && capabilities.holes
      ? { mixer: numFromField(d, 'hole-mixer'), socket: numFromField(d, 'hole-socket'), dispenser: numFromField(d, 'hole-dispenser') }
      : { mixer: 0, socket: 0, dispenser: 0 };
    const curbLengthM = capabilities && capabilities.curb ? mmToM(numFromField(d, 'extra-bortik')) : 0;
    const backsplash = capabilities && capabilities.backsplash
      ? { widthM: mmToM(numFromField(d, 'extra-fartuk-width')), lengthM: mmToM(numFromField(d, 'extra-fartuk-length')) }
      : { widthM: 0, lengthM: 0 };
    const wallPanel = capabilities && capabilities.wallPanel
      ? { widthM: mmToM(numFromField(d, 'extra-wallpanel-width')), lengthM: mmToM(numFromField(d, 'extra-wallpanel-length')) }
      : { widthM: 0, lengthM: 0 };
    const island = capabilities && capabilities.island
      ? {
          standard: { widthM: mmToM(numFromField(d, 'extra-ostrov-width')), lengthM: mmToM(numFromField(d, 'extra-ostrov-length')) },
          figured: { widthM: mmToM(numFromField(d, 'extra-ostrov-figured-width')), lengthM: mmToM(numFromField(d, 'extra-ostrov-figured-length')) },
        }
      : { standard: { widthM: 0, lengthM: 0 }, figured: { widthM: 0, lengthM: 0 } };
    const barCounter = capabilities && capabilities.barCounter
      ? {
          standard: { widthM: mmToM(numFromField(d, 'extra-bar-standard-width')), lengthM: mmToM(numFromField(d, 'extra-bar-standard-length')) },
          complex: { widthM: mmToM(numFromField(d, 'extra-bar-complex-width')), lengthM: mmToM(numFromField(d, 'extra-bar-complex-length')) },
        }
      : { standard: { widthM: 0, lengthM: 0 }, complex: { widthM: 0, lengthM: 0 } };

    const ownSizes = OWN_SIZE_PRODUCTS.includes(selectedProductKey);
    // «Опции» (сложная форма / полировка / монтаж) exist only where the
    // product offers them (PRODUCTS[key].supportsOptions !== false); a box
    // left ticked for another product never reaches one without them.
    const optionsSupported = !(product && product.supportsOptions === false);
    const typeIdValue = d.getElementById('productSubcategory').value;
    const enteredSteps = readStepCount(d, selectedProductKey, typeIdValue);
    let stairConfig = null;
    let stairTotal = enteredSteps;
    if (selectedProductKey === 'lestnitsa') {
      const G = Geometry();
      const shape = G.STAIR_SHAPES[typeIdValue] || 'straight';
      // «Количество маршей»: only a number this shape can be built with
      // (GeometryModel.MARCH_RANGE), otherwise the shape's default.
      const marches = G.marchesFor(shape, d.getElementById('stair-marches').value);
      // Risers are their own flag (the hidden #stair-risers box), not part of the type id.
      const risers = !!d.getElementById('stair-risers').checked;
      stairTotal = marches > 0 ? enteredSteps * marches : enteredSteps;
      stairConfig = {
        shape, marches, stepsPerMarch: marches > 0 ? enteredSteps : null,
        landings: Math.max(0, marches - 1), totalSteps: stairTotal,
        risers, riserHeightM: risers ? mmToM(numFromField(d, 'riser-height')) : 0,
      };
    }

    return {
      product: product ? {
        key: selectedProductKey, label: product.label, type: product.type, capabilities,
        // A piece of this product may be split with a seam (PRODUCTS[key].allowSeam).
        allowSeam: product.allowSeam !== false,
        // Non-pricing metadata for the 3D layer's default camera angle --
        // see visualizer/geometry-model.js, which applies the ultimate
        // 'iso' fallback if a product defines none.
        cameraPreset: product.cameraPreset || null,
      } : null,
      stone: stone || null,
      // A facade or a fireplace has no generic width/length (its sizes are
      // in productConfig.fasad / .kaminy) -- a value left in these fields by
      // another product must not reach it.
      dimensions: {
        widthM: ownSizes ? 0 : mmToM(numFromField(d, 'width')),
        lengthM: ownSizes ? 0 : mmToM(numFromField(d, 'length')),
        thicknessM: null,
      },
      shape,
      wing,
      corner,
      edgeLineItems,
      sinkCounts,
      cooktopCount,
      holeCounts,
      curbLengthM,
      backsplash,
      wallPanel,
      island,
      barCounter,
      edge: deriveSingleEdge(edgeLineItems, readSelectedEdgeType(d)),
      additionalWorks: {
        sink: deriveSingleSink(sinkCounts),
        cooktop: { count: cooktopCount, position: null },
      },
      bookmatchMode: 'none',
      options: {
        complexEnabled: optionsSupported && d.getElementById('opt-complex').checked,
        polishEnabled: optionsSupported && d.getElementById('opt-polish').checked,
        installEnabled: optionsSupported && d.getElementById('opt-install').checked,
      },
      subcategory: {
        id: d.getElementById('productSubcategory').value || null,
        // For «Ступени» the number of pieces IS the step count (stepCount
        // below), for «Фасады» it is the facade's own validated quantity
        // (productConfig.fasad), a fireplace is always one -- the generic
        // "Количество, шт." is none of theirs.
        qty: selectedProductKey === 'stupeni' || ownSizes ? 0 : numFromField(d, 'subcategoryQty'),
      },
      // Every step of the product. «Лестницы» with marches: the client enters
      // the steps of ONE march -- the stair has marches x that (see
      // productConfig.lestnitsa); a spiral stair and «Ступени»: the count itself.
      stepCount: stairTotal,
      // Product-specific state that doesn't fit the shared fields above --
      // same "always the same shape, capability-zeroed when not this
      // product" convention as island/barCounter/etc. above, so the state
      // contract never changes shape between products. The sizes of each
      // product's own shape live here: the risers of «Ступени» and of a stair
      // (their parts and stone -- product-parts.js; their work has its own,
      // not yet set, rates), a stair's marches, a sill's arm or bay, a
      // radius wall's radius, a facade's type and sizes.
      productConfig: {
        stupeni: {
          riser: selectedProductKey === 'stupeni' && !!d.getElementById('stupeni-riser').checked,
          // «Высота подступенка» -- the riser's own size (its area, its stone).
          riserHeightM: selectedProductKey === 'stupeni' ? mmToM(numFromField(d, 'riser-height')) : 0,
        },
        // «Лестницы»: the shape's marches (straight 1, Г/П 2, spiral none),
        // the steps in one march, landings = marches - 1, and the risers of
        // a "+ подступенки" type with their height.
        lestnitsa: stairConfig,
        // «Подоконники»: the sizes of a shaped sill (GeometryModel.sillPlan).
        podokonnik: selectedProductKey === 'podokonnik'
          ? {
              armLengthM: mmToM(numFromField(d, 'sill-arm-length')),
              bayDepthM: mmToM(numFromField(d, 'sill-bay-depth')),
              bayFrontM: mmToM(numFromField(d, 'sill-bay-front')),
            }
          : null,
        // «Стены»: a radius wall's radius (its arc length is the width field).
        stena: selectedProductKey === 'stena' ? { radiusM: mmToM(numFromField(d, 'wall-radius')) } : null,
        // «Фасады»: the type's form, its own physical sizes (m), quantity and
        // cladded area -- see facade-model.js. The generic width/length are
        // not a facade's sizes; null for every other product.
        fasad: selectedProductKey === 'fasad'
          ? FacadeModel.readFacadeConfig(d, d.getElementById('productSubcategory').value)
          : null,
        // «Камины»: the type, the portal's form and the type's own sizes (m)
        // -- see fireplace-model.js (its area, its rules). One fireplace, no
        // quantity; null for every other product.
        kaminy: selectedProductKey === 'kaminy'
          ? Fireplace().readFireplaceConfig(d, typeIdValue)
          : null,
      },
    };
  }

  // The catalog row of the chosen type (rate-catalog.js): a countertop's type
  // is its shape (KITCHEN-11..13 / BATH-01..03), every other product's is the
  // type picked on its «Тип» step (STAIR-xx, STEP-xx, PANEL-xx, FACADE-xx,
  // FIREPLACE-xx ...). null -- no type yet.
  function resolveTypeId(state) {
    const productKey = state && state.product ? state.product.key : null;
    return Catalog().countertopTypeId(productKey, state && state.shape)
      || (state && state.subcategory && state.subcategory.id) || null;
  }

  const isRate = v => typeof v === 'number' && Number.isFinite(v);
  // A rate x the stone coefficient; no rate stays no rate (null), never 0.
  const times = (rate, k) => (isRate(rate) ? rate * k : null);
  const NO_RATES = { fabricationRatePerM2: null, installationRatePerM2: null, polishRatePerM2: null };

  // The integrated sink is priced per metre of its cut along the countertop
  // (CUT-03, м.п.): the length the 3D draws (GeometryModel sink.cut.lengthM).
  // No length -- null (the manager prices it), never 1 m.
  function integratedSinkCutLengthM(state) {
    try {
      const model = Geometry().buildGeometryModel(state);
      const len = model && model.sink && model.sink.cut ? model.sink.cut.lengthM : null;
      return isRate(len) && len > 0 ? len : null;
    } catch (e) {
      return null;
    }
  }

  // config.catalog -- the RateCatalog (rate-catalog.js), the only place the
  // company's rates live. Work = the chosen type's rate; fabrication x the
  // stone coefficient (RateCatalog.stoneCoefficient of state.stone.category,
  // an unknown kind x1); installation and polish without it.
  function buildPricingInputs(state, config) {
    const catalog = (config && config.catalog) || Catalog();
    const k = catalog.stoneCoefficient(state.stone && state.stone.category);
    const typeRates = catalog.getProductRates(resolveTypeId(state)) || NO_RATES;

    // The product as it is cut (product-parts.js): its pieces or surface,
    // the sizes still missing, and the parts with their own rates.
    const job = state.product ? Parts().buildJob(state) : null;
    // A stair's landings (pieces 'landing') are priced at STAIR-11, not at
    // the type's rate (pricing.js calculatePrice).
    const hasLandings = !!(job && job.pieces && job.pieces.some(p => p.key === 'landing'));
    const landing = hasLandings ? (catalog.getProductRates('STAIR-11') || NO_RATES) : null;

    const rates = {
      fabricationRatePerM2: times(typeRates.fabricationRatePerM2, k),
      installationRatePerM2: typeRates.installationRatePerM2,
      polishRatePerM2: typeRates.polishRatePerM2,
      complexShapeMultiplier: catalog.MISC.complexShapeMultiplier,
      landingRates: landing ? {
        fabricationRatePerM2: times(landing.fabricationRatePerM2, k),
        installationRatePerM2: landing.installationRatePerM2,
        polishRatePerM2: landing.polishRatePerM2,
      } : null,
    };

    // Edge fields are read for every product (a leftover value survives a
    // product switch -- see readConstructorState), but edge work is only
    // charged on a product that actually supports it.
    const edgeSupported = !!(state.product && state.product.capabilities && state.product.capabilities.supportsEdgeWork);
    const extraLineItems = edgeSupported
      ? state.edgeLineItems.map(item => ({ rate: catalog.getAdditionalWorkRate(item.rateId), quantity: mmToM(item.lengthMm) }))
      : [];

    // Cuts and holes: the rate x the count, without the stone coefficient.
    const QUANTITY_ITEMS = [
      ['CUT-01', state.sinkCounts.overlay], ['CUT-02', state.sinkCounts.undermount],
      ['CUT-04', state.cooktopCount],
      ['CUT-05', state.holeCounts.mixer], ['CUT-06', state.holeCounts.socket], ['CUT-07', state.holeCounts.dispenser],
    ];
    QUANTITY_ITEMS.forEach(([rateId, qty]) => {
      if (qty > 0) extraLineItems.push({ rate: catalog.getAdditionalWorkRate(rateId), quantity: qty });
    });
    if (state.sinkCounts.integrated > 0) {
      const lengthM = integratedSinkCutLengthM(state);
      extraLineItems.push(lengthM === null
        ? { rate: null, quantity: state.sinkCounts.integrated }
        : { rate: catalog.getAdditionalWorkRate('CUT-03'), quantity: state.sinkCounts.integrated * lengthM });
    }

    // The countertop's elements (EXTRA-01..07): their work x the stone
    // coefficient, per metre (бортик) or per m² of the element.
    const area = part => part.widthM * part.lengthM;
    const ELEMENT_ITEMS = [
      ['EXTRA-01', state.curbLengthM],
      ['EXTRA-02', area(state.backsplash)],
      ['EXTRA-03', area(state.wallPanel)],
      ['EXTRA-04', area(state.island.standard)],
      ['EXTRA-05', area(state.island.figured)],
      ['EXTRA-06', area(state.barCounter.standard)],
      ['EXTRA-07', area(state.barCounter.complex)],
    ];
    ELEMENT_ITEMS.forEach(([rateId, qty]) => {
      if (qty > 0) extraLineItems.push({ rate: times(catalog.getAdditionalWorkRate(rateId), k), quantity: qty });
    });

    // The priced area when it is not simply width x length: a facade's
    // cladded surface (all pieces) from facade-model.js. null = width x length.
    const facade = state.productConfig && state.productConfig.fasad;
    const areaM2 = facade ? facade.areaM2 : null;

    // Подступенки: RISER-00 (fabrication x the stone coefficient). A
    // countertop's extra stone elements: their work is already the
    // additional works above (extraLineItems), so here only their stone counts.
    const riser = catalog.RISER_RATES;
    const groupRates = [
      { key: 'riser', rates: { fabricationRatePerM2: times(riser.fabricationRatePerM2, k), installationRatePerM2: riser.installationRatePerM2, polishRatePerM2: riser.polishRatePerM2 } },
      { key: 'extra', work: false },
    ];

    // Монтаж of each extra stone element at its own rate (the «Монтаж»
    // column of EXTRA-02..07), on the element's stone area, only when
    // «Монтаж» is on: a missing rate adds nothing and never falls back to
    // the countertop's installation rate.
    const pick = (a, b, idA, idB) => (area(a) > 0 ? idA : (area(b) > 0 ? idB : null));
    const INSTALL_IDS = {
      backsplash: 'EXTRA-02',
      wallPanel: 'EXTRA-03',
      island: pick(state.island.standard, state.island.figured, 'EXTRA-04', 'EXTRA-05'),
      barCounter: pick(state.barCounter.standard, state.barCounter.complex, 'EXTRA-06', 'EXTRA-07'),
    };
    if (state.options && state.options.installEnabled && job && job.pieces) {
      job.pieces.filter(p => p.group === 'extra').forEach(p => {
        const rate = INSTALL_IDS[p.key] ? catalog.getAdditionalWorkInstallRate(INSTALL_IDS[p.key]) : null;
        if (isRate(rate)) extraLineItems.push({ rate, quantity: p.areaM2 * p.count, install: p.key });
      });
    }

    return { rates, extraLineItems, areaM2, job, groupRates };
  }

  return { readConstructorState, buildPricingInputs, resolveTypeId, STEP_COUNT_RANGE, STEP_COUNT_DEFAULTS, stepCountRange, isValidStepCount };
});
