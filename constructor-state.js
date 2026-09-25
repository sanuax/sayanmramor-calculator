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

    const typeIdValue = d.getElementById('productSubcategory').value;
    const enteredSteps = readStepCount(d, selectedProductKey, typeIdValue);
    let stairConfig = null;
    let stairTotal = enteredSteps;
    if (selectedProductKey === 'lestnitsa') {
      const G = Geometry();
      const shape = G.STAIR_SHAPES[typeIdValue] || 'straight';
      const marches = G.STAIR_MARCHES[shape];
      const risers = G.STAIR_WITH_RISERS.includes(typeIdValue);
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
        // Non-pricing metadata for the 3D layer's default camera angle --
        // see visualizer/geometry-model.js, which applies the ultimate
        // 'iso' fallback if a product defines none.
        cameraPreset: product.cameraPreset || null,
      } : null,
      stone: stone || null,
      // A facade has no generic width/length (its sizes are in
      // productConfig.fasad) -- a value left in these fields by another
      // product must not reach it.
      dimensions: {
        widthM: selectedProductKey === 'fasad' ? 0 : mmToM(numFromField(d, 'width')),
        lengthM: selectedProductKey === 'fasad' ? 0 : mmToM(numFromField(d, 'length')),
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
        complexEnabled: d.getElementById('opt-complex').checked,
        polishEnabled: d.getElementById('opt-polish').checked,
        installEnabled: d.getElementById('opt-install').checked,
      },
      subcategory: {
        id: d.getElementById('productSubcategory').value || null,
        // For «Ступени» the number of pieces IS the step count (stepCount
        // below), for «Фасады» it is the facade's own validated quantity
        // (productConfig.fasad) -- the generic "Количество, шт." is neither's source.
        qty: selectedProductKey === 'stupeni' || selectedProductKey === 'fasad' ? 0 : numFromField(d, 'subcategoryQty'),
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
      },
    };
  }

  function buildPricingInputs(state, config) {
    const { productRates, miscFlatSum, miscRatePerM2, complexShapeMultiplier, countertopExtrasRates, getAdditionalWorkRate } = config;

    const rates = {
      fabricationRatePerM2: productRates.fabricationRatePerM2,
      installationRatePerM2: productRates.installationRatePerM2,
      polishRatePerM2: productRates.polishRatePerM2,
      miscFlatSum, miscRatePerM2, complexShapeMultiplier,
      bortikRatePerM: countertopExtrasRates.bortikRatePerM,
      fartukRatePerM2: countertopExtrasRates.fartukRatePerM2,
      ostrovRatePerM2: countertopExtrasRates.ostrovRatePerM2,
    };

    // Edge fields are read for every product (a leftover value survives a
    // product switch -- see readConstructorState), but edge work is only
    // charged on a product that actually supports it. Today every edge rate
    // is null, so this changes no price; it keeps a hidden edge from ever
    // adding to the quote once real rates are filled in.
    const edgeSupported = !!(state.product && state.product.capabilities && state.product.capabilities.supportsEdgeWork);
    let extraLineItems = edgeSupported
      ? state.edgeLineItems.map(item => ({ rate: getAdditionalWorkRate(item.rateId), quantity: mmToM(item.lengthMm) }))
      : [];

    const QUANTITY_ITEMS = [
      ['CUT-01', state.sinkCounts.overlay], ['CUT-02', state.sinkCounts.undermount], ['CUT-03', state.sinkCounts.integrated],
      ['CUT-04', state.cooktopCount],
      ['CUT-05', state.holeCounts.mixer], ['CUT-06', state.holeCounts.socket], ['CUT-07', state.holeCounts.dispenser],
    ];
    QUANTITY_ITEMS.forEach(([rateId, qty]) => {
      if (qty > 0) extraLineItems.push({ rate: getAdditionalWorkRate(rateId), quantity: qty });
    });

    const AREA_ITEMS = [
      ['EXTRA-05', state.island.figured.widthM * state.island.figured.lengthM],
      ['EXTRA-03', state.wallPanel.widthM * state.wallPanel.lengthM],
      ['EXTRA-06', state.barCounter.standard.widthM * state.barCounter.standard.lengthM],
      ['EXTRA-07', state.barCounter.complex.widthM * state.barCounter.complex.lengthM],
    ];
    AREA_ITEMS.forEach(([rateId, areaM2]) => {
      if (areaM2 > 0) extraLineItems.push({ rate: getAdditionalWorkRate(rateId), quantity: areaM2 });
    });

    const extraDimensions = {
      bortikLengthM: state.curbLengthM,
      fartukAreaM2: state.backsplash.widthM * state.backsplash.lengthM,
      ostrovAreaM2: state.island.standard.widthM * state.island.standard.lengthM,
    };

    // The priced area when it is not simply width x length: a facade's
    // cladded surface (all pieces) from facade-model.js. null = width x length.
    const facade = state.productConfig && state.productConfig.fasad;
    const areaM2 = facade ? facade.areaM2 : null;

    // The product as it is cut (product-parts.js): its pieces or surface,
    // the sizes still missing, and the parts with their own rates.
    const job = state.product ? Parts().buildJob(state) : null;
    const groupRates = [{ key: 'riser', rates: config.riserRates || null }];

    return { rates, extraLineItems, extraDimensions, areaM2, job, groupRates };
  }

  return { readConstructorState, buildPricingInputs, STEP_COUNT_RANGE, STEP_COUNT_DEFAULTS, stepCountRange, isValidStepCount };
});
