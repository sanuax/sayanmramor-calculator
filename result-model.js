// result-model.js
//
// Pure adapter: constructor state (constructor-state.js) + the pricing
// outcome calculate() already computed -> one plain configuration object
// and one pricing summary. The Result screen renders from these, and
// lead-payload.js serialises the very same objects, so what the client sees
// and what a future backend receives can never drift apart. No DOM access,
// no pricing math of its own -- every number here was already produced by
// constructor-state.js or pricing.js.
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.ResultModel = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {

  const RESULT_TITLES = {
    lestnitsa: 'Ваша лестница',
    panno: 'Ваше панно',
    podokonnik: 'Ваш подоконник',
    pol: 'Ваш пол',
    stena: 'Ваша стена',
    fasad: 'Ваш фасад',
    stoleshnitsa_vannaya: 'Ваша столешница',
    stoleshnitsa_kuhnya: 'Ваша столешница',
    stupeni: 'Ваши ступени',
  };

  function resultTitle(productKey) {
    return (productKey && RESULT_TITLES[productKey]) || 'Ваше изделие';
  }

  const SHAPE_LABELS = { straight: 'Прямая', lshape: 'Г-образная', ushape: 'П-образная' };
  const CORNER_LABELS = { left: 'угол слева', right: 'угол справа' };
  const SINK_LABELS = { overlay: 'накладная', undermount: 'снизу', integrated: 'интегрированная' };
  const HOLE_LABELS = { mixer: 'смеситель', socket: 'розетку', dispenser: 'дозатор' };
  // Same wording as the checkboxes on the "Опции" step.
  const OPTION_LABELS = {
    complexEnabled: 'Сложная форма / фигурный рез',
    polishEnabled: 'Дополнительная полировка',
    installEnabled: 'Монтаж на объекте',
  };

  function mToMm(m) {
    return Math.round((m || 0) * 1000);
  }

  function hasArea(part) {
    return !!part && part.widthM > 0 && part.lengthM > 0;
  }

  function areaWork(key, label, part) {
    return { key, label, quantity: null, unit: null, lengthMm: mToMm(part.lengthM), widthMm: mToMm(part.widthM) };
  }

  // One entry per real, priced additional work -- iterates the raw counts
  // (not the single derived sink) so the list matches exactly what
  // ConstructorState.buildPricingInputs() charged for.
  function buildAdditionalWorks(state) {
    const caps = (state.product && state.product.capabilities) || {};
    const works = [];
    if (caps.sinkCutout) {
      ['overlay', 'undermount', 'integrated'].forEach(t => {
        const n = state.sinkCounts[t];
        if (n > 0) works.push({ key: 'sink.' + t, label: 'Мойка — ' + SINK_LABELS[t], quantity: n, unit: 'шт.' });
      });
    }
    if (caps.cooktopCutout && state.cooktopCount > 0) {
      works.push({ key: 'cooktop', label: 'Вырез под варочную панель', quantity: state.cooktopCount, unit: 'шт.' });
    }
    if (caps.holes) {
      ['mixer', 'socket', 'dispenser'].forEach(t => {
        const n = state.holeCounts[t];
        if (n > 0) works.push({ key: 'hole.' + t, label: 'Отверстие под ' + HOLE_LABELS[t], quantity: n, unit: 'шт.' });
      });
    }
    if (caps.curb && state.curbLengthM > 0) {
      works.push({ key: 'curb', label: 'Бортик', quantity: null, unit: null, lengthMm: mToMm(state.curbLengthM) });
    }
    if (caps.backsplash && hasArea(state.backsplash)) works.push(areaWork('backsplash', 'Фартук', state.backsplash));
    if (caps.wallPanel && hasArea(state.wallPanel)) works.push(areaWork('wallPanel', 'Стеновая панель', state.wallPanel));
    if (caps.island) {
      if (hasArea(state.island.standard)) works.push(areaWork('island.standard', 'Остров — прямоугольный', state.island.standard));
      if (hasArea(state.island.figured)) works.push(areaWork('island.figured', 'Остров — фигурный', state.island.figured));
    }
    if (caps.barCounter) {
      if (hasArea(state.barCounter.standard)) works.push(areaWork('barCounter.standard', 'Барная стойка — стандартная', state.barCounter.standard));
      if (hasArea(state.barCounter.complex)) works.push(areaWork('barCounter.complex', 'Барная стойка — сложная', state.barCounter.complex));
    }
    return works;
  }

  function buildMaterial(stone) {
    if (!stone) return null;
    const country = stone.countries && stone.countries[0] && stone.countries[0].label_ru;
    return {
      id: stone.id,
      name: stone.name,
      category: stone.category || null,
      categoryLabel: stone.category_label_ru || null,
      country: country || null,
      available: stone.available !== false,
    };
  }

  // params:
  //   state            -- ConstructorState.readConstructorState() output
  //   productLabel     -- PRODUCTS[key].label
  //   subcategory      -- { id, label, unit } for the selected 'type' row, or null
  //   edgeTitles       -- { straight: 'Прямая', ... } (the edge cards' own titles)
  //   dimensionLabels  -- { length, width } as shown on the dimensions step
  function buildConfiguration({ state, productLabel, subcategory, edgeTitles, dimensionLabels }) {
    const product = state.product || {};
    const caps = product.capabilities || {};
    const key = product.key || null;

    const lengthMm = mToMm(state.dimensions.lengthM);
    const widthMm = mToMm(state.dimensions.widthM);
    const labels = dimensionLabels || { length: 'Длина', width: 'Ширина' };

    let shape = null;
    if (caps.supportsShapeSelection) {
      const isL = state.shape === 'lshape';
      const hasWings = isL || state.shape === 'ushape';
      shape = {
        type: state.shape,
        label: SHAPE_LABELS[state.shape] || SHAPE_LABELS.straight,
        corner: isL ? state.corner : null,
        cornerLabel: isL ? (CORNER_LABELS[state.corner] || null) : null,
        wing: hasWings && hasArea(state.wing) ? { lengthMm: mToMm(state.wing.lengthM), widthMm: mToMm(state.wing.widthM), count: isL ? 1 : 2 } : null,
      };
    }

    let edge = null;
    if (caps.supportsEdgeWork && state.edge && state.edge.type) {
      edge = {
        type: state.edge.type,
        label: (edgeTitles && edgeTitles[state.edge.type]) || null,
        lengthMm: state.edge.lengthMm || null,
      };
      if (!edge.label) edge = null;
    }

    let typeInfo = null;
    if (subcategory && subcategory.id && subcategory.label) {
      const qty = state.subcategory && state.subcategory.qty;
      typeInfo = {
        id: subcategory.id,
        label: subcategory.label,
        quantity: subcategory.unit === 'шт.' && qty > 0 ? qty : null,
      };
    }

    const options = Object.keys(OPTION_LABELS)
      .filter(k => state.options && state.options[k])
      .map(k => ({ key: k.replace(/Enabled$/, ''), label: OPTION_LABELS[k] }));

    return {
      product: { key, label: productLabel || product.label || null, title: resultTitle(key) },
      type: typeInfo,
      shape,
      dimensions: {
        lengthMm, widthMm,
        areaM2: Math.round(state.dimensions.lengthM * state.dimensions.widthM * 100) / 100,
        lengthLabel: labels.length, widthLabel: labels.width,
      },
      material: buildMaterial(state.stone),
      edge,
      riser: key === 'stupeni' ? !!(state.productConfig && state.productConfig.stupeni && state.productConfig.stupeni.riser) : null,
      steps: state.stepCount ? { count: state.stepCount } : null,
      additionalWorksAvailable: !!caps.supportsCountertopExtras,
      additionalWorks: caps.supportsCountertopExtras ? buildAdditionalWorks(state) : [],
      options,
    };
  }

  // outcome is what calculate() ended with:
  //   { kind: 'ok', result }                   -- Pricing.calculatePrice() ok:true
  //   { kind: 'manual', reason, message }      -- price needs a manager
  //   { kind: 'incomplete' }                   -- required inputs missing
  // Lines are only the parts of the existing breakdown that actually carry
  // money: a null rate is 0 contribution (pricing.js), and "0 ₽" would read
  // as "free", so zero lines are dropped rather than shown.
  function summarizePricing(outcome, pricesUpdatedAt) {
    const base = { currency: 'RUB', pricesUpdatedAt: pricesUpdatedAt || null };
    if (!outcome || outcome.kind === 'incomplete') {
      return Object.assign({ status: 'incomplete', total: null, lines: [], nSlabs: null, reason: null, message: null }, base);
    }
    if (outcome.kind !== 'ok' || !outcome.result || !outcome.result.ok) {
      return Object.assign({
        status: 'manual', total: null, lines: [], nSlabs: null,
        reason: outcome.reason || (outcome.result && outcome.result.reason) || null,
        message: outcome.message || null,
      }, base);
    }
    const r = outcome.result;
    const candidates = [
      ['stone', 'Камень', r.subtotal],
      ['fabrication', 'Изготовление', r.fabrication],
      ['installation', 'Монтаж', r.installation],
      ['polish', 'Полировка', r.polish],
      ['works', 'Кромка и дополнительные работы', (r.extras || 0) + (r.catalogExtras || 0)],
      ['misc', 'Прочие работы', r.misc],
    ];
    const lines = candidates
      .filter(([, , amount]) => typeof amount === 'number' && amount > 0)
      .map(([key, label, amount]) => ({ key, label, amountRub: Math.round(amount) }));
    return Object.assign({
      status: 'ok', total: Math.round(r.total), lines, nSlabs: r.nSlabs || null, reason: null, message: outcome.message || null,
    }, base);
  }

  function formatRub(n) {
    return Math.round(n).toLocaleString('ru-RU') + ' ₽';
  }

  function formatArea(m2) {
    return m2.toFixed(2).replace('.', ',') + ' м²';
  }

  function formatWorkDetail(work) {
    if (work.quantity) return work.quantity + ' ' + work.unit;
    if (work.widthMm) return work.lengthMm + ' × ' + work.widthMm + ' мм';
    if (work.lengthMm) return work.lengthMm + ' мм';
    return '';
  }

  // Display rows for the Result screen: only rows that apply to this
  // product and actually carry a value -- no empty/"—"/null lines.
  function buildResultView(configuration) {
    const c = configuration;
    const specs = [];
    if (c.type) {
      specs.push({ key: 'type', label: 'Тип', value: c.type.label, detail: c.type.quantity ? c.type.quantity + ' шт.' : '' });
    }
    if (c.shape) {
      specs.push({ key: 'shape', label: 'Форма', value: c.shape.label, detail: c.shape.cornerLabel || '' });
    }
    const d = c.dimensions;
    specs.push({
      key: 'dimensions', label: 'Размер',
      value: d.lengthMm + ' × ' + d.widthMm + ' мм',
      detail: d.lengthLabel.toLowerCase() + ' × ' + d.widthLabel.toLowerCase() + ' · ' + formatArea(d.areaM2),
    });
    if (c.steps) {
      specs.push({ key: 'steps', label: 'Количество ступеней', value: c.steps.count + ' шт.', detail: '' });
    }
    if (c.shape && c.shape.wing) {
      const two = c.shape.wing.count === 2;
      specs.push({ key: 'wing', label: two ? 'Крылья' : 'Крыло', value: c.shape.wing.lengthMm + ' × ' + c.shape.wing.widthMm + ' мм', detail: two ? 'длина × ширина, каждое из двух' : 'длина × ширина' });
    }
    if (c.material) {
      const meta = [c.material.categoryLabel, c.material.country].filter(Boolean);
      if (!c.material.available) meta.push('нет в наличии');
      specs.push({ key: 'material', label: 'Материал', value: c.material.name, detail: meta.join(' · ') });
    }
    if (c.edge) {
      specs.push({ key: 'edge', label: 'Кромка', value: c.edge.label, detail: c.edge.lengthMm ? c.edge.lengthMm + ' мм' : '' });
    }
    if (c.riser !== null) {
      specs.push({ key: 'riser', label: 'Подступенки', value: c.riser ? 'С подступенками' : 'Без подступенков', detail: '' });
    }
    if (c.options.length) {
      specs.push({ key: 'options', label: 'Опции', value: c.options.map(o => o.label).join(', '), detail: '' });
    }

    const works = c.additionalWorksAvailable
      ? c.additionalWorks.map(w => ({ key: w.key, label: w.label, detail: formatWorkDetail(w) }))
      : null;

    return { title: c.product.title, specs, works };
  }

  // Edit shortcuts: every real step of this product except the Result
  // itself, in the product's own step order (step-engine.js).
  function buildEditTargets(steps, stepLabels) {
    return (steps || [])
      .filter(id => id !== 'review')
      .map(id => ({ stepId: id, label: (stepLabels && stepLabels[id]) || id }));
  }

  return {
    RESULT_TITLES,
    resultTitle, buildConfiguration, summarizePricing, buildResultView, buildEditTargets,
    formatRub, formatWorkDetail,
  };
});
