// fireplace-model.js
//
// The domain model of «Камины» -- the one place that says, for every
// fireplace product a client can pick: its forms, the sizes the client
// measures (each under its own name), which of them may be zero, the rules
// the sizes must keep, the stone surface the product is made of and the
// formula of that surface. Pure data and functions only: no DOM beyond
// doc.getElementById(id).value, no geometry objects, no slabs, no rates.
//
// Every stone part of a fireplace is a flat rectangular plate. The area
// below is the sum of the plates' faces -- the geometry (next stage) lays
// out exactly these plates, so the area, the cut pieces and the stone shown
// in 3D are one number. A fireplace is always ordered as one piece.
//
// Missing sizes are `null`, not 0: «От пола до топки» may truly be 0
// (the firebox starts at the floor), so an empty field and a zero are
// different things here.
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.FireplaceModel = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {

  const LENGTH_UNIT = 'мм';
  const AREA_UNIT = 'м²';

  // The size fields, by parameter key -> the page's input id. One input per
  // physical quantity: «depth» is «Глубина портала», «Глубина короба» or
  // «Глубина подиума» depending on the type, so a value entered once carries
  // over when the client changes the type (as in facade-model.js).
  const PARAM_FIELDS = {
    openingWidth: 'fireplace-opening-width',
    openingHeight: 'fireplace-opening-height',
    pierWidth: 'fireplace-pier-width',
    lintelHeight: 'fireplace-lintel-height',
    depth: 'fireplace-depth',
    shelfProjection: 'fireplace-shelf-projection',
    claddingWidth: 'fireplace-cladding-width',
    claddingHeight: 'fireplace-cladding-height',
    fireboxWidth: 'fireplace-firebox-width',
    fireboxHeight: 'fireplace-firebox-height',
    fireboxBottom: 'fireplace-firebox-bottom',
    length: 'fireplace-length',
    height: 'fireplace-height',
  };
  const FORM_FIELD = 'fireplace-form';

  // `symbol`: the letter the formula uses; `allowZero`: 0 is a real size.
  function param(key, label, symbol, placeholderMm, allowZero) {
    return { key, label, symbol, unit: LENGTH_UNIT, placeholderMm, allowZero: !!allowZero };
  }

  // Every stone part is a plate this thick. A side no deeper than a plate, a
  // pier too narrow for its front, reveal and side, or a panel beside the
  // firebox narrower than a side plate cannot be made of plates at all --
  // `plateRules` say so, and the geometry (GeometryModel.fireplacePlan)
  // builds plates only for sizes that keep them.
  const PLATE_THICKNESS_M = 0.03;
  const PLATE_TOLERANCE_M = 1e-9;   // compares sizes entered in whole mm

  // A plate rule: `measure(p)` must be at least `plates` plate thicknesses
  // (strictly more when `strict`: a side exactly one plate deep is no side).
  function plateRule(params, labels, measure, plates, strict) {
    const least = plates * PLATE_THICKNESS_M;
    const names = labels.map(l => '«' + l + '»').join(' и ');
    return {
      key: 'plateThickness', params,
      message: (params.length > 1 ? 'Размеры ' + names + ' не оставляют' : 'Размер ' + names + ' не оставляет') +
        ' места для каменных плит толщиной ' + Math.round(PLATE_THICKNESS_M * 1000) + ' мм.',
      holds: p => (strict ? measure(p) > least + PLATE_TOLERANCE_M : measure(p) >= least - PLATE_TOLERANCE_M),
    };
  }

  // A portal: depth > 1 plate, piers >= 2 plates (front + reveal + side), the
  // lintel >= 1 plate under a shelf, >= 2 without one (underside + top).
  function portalPlateRules(lintelPlates) {
    return [
      plateRule(['depth'], ['Глубина портала'], p => p.depth, 1, true),
      plateRule(['pierWidth'], ['Ширина простенка'], p => p.pierWidth, 2, false),
      plateRule(['lintelHeight'], ['Высота перемычки'], p => p.lintelHeight, lintelPlates, false),
    ];
  }

  // Портал: W, H -- the opening; b -- a pier (стойка); h -- the lintel
  // (перемычка) over the opening; d -- how far the portal stands out of
  // the wall; o -- how far the shelf reaches past the portal. Wo = W + 2b.
  const PORTAL_PARAMS = [
    param('openingWidth', 'Ширина проёма', 'W', 900),
    param('openingHeight', 'Высота проёма', 'H', 700),
    param('pierWidth', 'Ширина простенка', 'b', 250),
    param('lintelHeight', 'Высота перемычки', 'h', 250),
    param('depth', 'Глубина портала', 'd', 200),
  ];

  // Stone of the portal body: the front around the opening, the outer sides
  // of piers and lintel, the opening's reveals and the lintel's underside.
  function portalBodyArea(p) {
    const wo = p.openingWidth + 2 * p.pierWidth;
    const H = p.openingHeight, h = p.lintelHeight, d = p.depth;
    return wo * (H + h) - p.openingWidth * H + 2 * (H + h) * d + (2 * H * d + p.openingWidth * d);
  }

  // Each form: `params` in the order the client fills them in; `area(p)` the
  // stone surface in m² from sizes in metres; `formula` the same in words;
  // `surface` what that area is made of. `rules` are the checks beyond
  // «every size entered and positive» (a firebox must fit its cladding);
  // `plateRules` -- that the stone plates fit (judged once all else holds).
  const FIREPLACE_TYPES = [
    {
      id: 'FIREPLACE-01', key: 'portal', title: 'Каминный портал', desc: 'Обрамление топки у стены',
      cameraPreset: 'front',
      areaTitle: 'Площадь камня портала', priceScope: 'каменный портал',
      forms: [
        {
          id: 'with-shelf', title: 'С полкой', desc: 'Портал с каминной полкой',
          params: PORTAL_PARAMS.concat([param('shelfProjection', 'Вылет полки', 'o', 60)]),
          surface: 'лицевые грани стоек и перемычки, наружные боковины, откосы проёма, низ перемычки и полка',
          formula: 'Wo × (H + h) − W × H + 2 × (H + h) × d + 2 × H × d + W × d + (Wo + 2 × o) × (d + o), где Wo = W + 2 × b',
          area: p => {
            const wo = p.openingWidth + 2 * p.pierWidth;
            return portalBodyArea(p) + (wo + 2 * p.shelfProjection) * (p.depth + p.shelfProjection);
          },
          rules: [],
          plateRules: portalPlateRules(1),
        },
        {
          id: 'without-shelf', title: 'Без полки', desc: 'Плоская рамка вокруг топки',
          params: PORTAL_PARAMS.slice(),
          surface: 'лицевые грани стоек и перемычки, наружные боковины, откосы проёма, низ и верх перемычки',
          formula: 'Wo × (H + h) − W × H + 2 × (H + h) × d + 2 × H × d + W × d + Wo × d, где Wo = W + 2 × b',
          area: p => portalBodyArea(p) + (p.openingWidth + 2 * p.pierWidth) * p.depth,
          rules: [],
          plateRules: portalPlateRules(2),
        },
      ],
    },
    {
      // The firebox is centred across the cladding; its height from the
      // floor places it but does not change the stone -- only where the
      // front is split into plates.
      id: 'FIREPLACE-02', key: 'cladding', title: 'Облицовка каминного короба', desc: 'Короб камина у стены',
      cameraPreset: 'front',
      areaTitle: 'Площадь облицовки короба', priceScope: 'облицовку каминного короба',
      forms: [{
        id: 'cladding', title: null,
        params: [
          param('claddingWidth', 'Ширина короба', 'Wb', 1600),
          param('claddingHeight', 'Высота короба', 'Hb', 2600),
          param('depth', 'Глубина короба', 'Db', 500),
          param('fireboxWidth', 'Ширина топки', 'W', 900),
          param('fireboxHeight', 'Высота топки', 'H', 600),
          param('fireboxBottom', 'От пола до топки', 'e', 400, true),
        ],
        surface: 'лицевая панель вокруг топки и две боковины короба (верх короба и откосы топки не облицовываются)',
        formula: 'Wb × Hb − W × H + 2 × Hb × Db',
        area: p => p.claddingWidth * p.claddingHeight - p.fireboxWidth * p.fireboxHeight + 2 * p.claddingHeight * p.depth,
        rules: [
          {
            key: 'fireboxWidth', params: ['fireboxWidth', 'claddingWidth'],
            message: 'Ширина топки должна быть меньше ширины короба.',
            holds: p => p.fireboxWidth < p.claddingWidth,
          },
          {
            key: 'fireboxHeight', params: ['fireboxBottom', 'fireboxHeight', 'claddingHeight'],
            message: 'Топка вместе с высотой от пола должна быть ниже короба.',
            holds: p => p.fireboxBottom + p.fireboxHeight < p.claddingHeight,
          },
        ],
        plateRules: [
          plateRule(['depth'], ['Глубина короба'], p => p.depth, 1, true),
          plateRule(['fireboxWidth', 'claddingWidth'], ['Ширина топки', 'Ширина короба'], p => (p.claddingWidth - p.fireboxWidth) / 2, 1, false),
        ],
      }],
    },
    {
      id: 'FIREPLACE-03', key: 'podium', title: 'Подиум камина', desc: 'Каменное основание под камин',
      cameraPreset: 'front',
      areaTitle: 'Площадь камня подиума', priceScope: 'каменный подиум',
      forms: [{
        id: 'podium', title: null,
        params: [
          param('length', 'Длина подиума', 'L', 1800),
          param('depth', 'Глубина подиума', 'D', 450),
          param('height', 'Высота подиума', 'Hp', 200),
        ],
        surface: 'верх, лицевая грань и две боковины (задняя сторона у стены)',
        formula: 'L × D + L × Hp + 2 × D × Hp',
        area: p => p.length * p.depth + p.length * p.height + 2 * p.depth * p.height,
        rules: [],
        plateRules: [
          plateRule(['depth'], ['Глубина подиума'], p => p.depth, 1, true),
          plateRule(['height'], ['Высота подиума'], p => p.height, 1, true),
          plateRule(['length'], ['Длина подиума'], p => p.length, 2, false),
        ],
      }],
    },
  ];

  const TYPES_BY_ID = {};
  const TYPES_BY_KEY = {};
  FIREPLACE_TYPES.forEach(t => { TYPES_BY_ID[t.id] = t; TYPES_BY_KEY[t.key] = t; });

  function getType(typeId) {
    return TYPES_BY_ID[typeId] || null;
  }

  function getTypeByKey(key) {
    return TYPES_BY_KEY[key] || null;
  }

  // The form the client picked -- or the type's first form (a form of
  // another type, or none, never survives into the state).
  function getForm(type, formId) {
    if (!type) return null;
    return type.forms.find(f => f.id === formId) || type.forms[0];
  }

  // A size from the page in millimetres -> metres, or null when the field is
  // absent, empty or not a number. A zero stays a zero; a negative number is
  // kept as entered so the check below can reject it (never «corrected»).
  function readSizeM(doc, fieldId) {
    const el = doc && typeof doc.getElementById === 'function' ? doc.getElementById(fieldId) : null;
    const raw = el && el.value !== undefined && el.value !== null ? String(el.value).trim() : '';
    if (raw === '') return null;
    const mm = Number(raw);
    return Number.isFinite(mm) ? mm / 1000 : null;
  }

  // The sizes must be entered and positive (a zero only where the size
  // allows it), and keep the form's rules. Returns what is wrong, never
  // throws: `missing` -- sizes not entered; `violations` -- sizes out of
  // range and broken rules, each { rule, params, message }.
  function checkConstraints(type, form, params) {
    if (!type || !form) {
      return { ok: false, missing: [], violations: [{ rule: 'unknownType', params: [], message: 'Не выбран тип камина.' }] };
    }
    const p = params || {};
    const missing = [];
    const violations = [];
    form.params.forEach(spec => {
      const v = p[spec.key];
      if (v === null || v === undefined || !Number.isFinite(v)) { missing.push(spec.key); return; }
      if (spec.allowZero ? v < 0 : !(v > 0)) {
        violations.push({
          rule: spec.allowZero ? 'nonNegative' : 'positive', params: [spec.key],
          message: 'Размер «' + spec.label + '» ' + (spec.allowZero ? 'не может быть отрицательным.' : 'должен быть больше нуля.'),
        });
      }
    });
    // A rule is only judged once every size it reads is entered and in range.
    const bad = new Set(missing.concat(...violations.map(v => v.params)));
    form.rules.forEach(r => {
      if (r.params.some(k => bad.has(k))) return;
      if (!r.holds(p)) violations.push({ rule: r.key, params: r.params.slice(), message: r.message });
    });
    // Whether the plates fit is asked only of a fireplace that is otherwise
    // right (a firebox wider than its cladding is that, not a plate problem).
    if (missing.length === 0 && violations.length === 0) {
      form.plateRules.forEach(r => {
        if (!r.holds(p)) violations.push({ rule: r.key, params: r.params.slice(), message: r.message });
      });
    }
    return { ok: missing.length === 0 && violations.length === 0, missing, violations };
  }

  // The stone area in m² from sizes in metres. Incomplete or invalid sizes
  // -> zero, never NaN and never an area of an impossible shape.
  function computeArea(type, form, params) {
    const check = checkConstraints(type, form, params);
    if (!check.ok) return { complete: false, areaM2: 0, check };
    const a = form.area(params);
    const areaM2 = Number.isFinite(a) && a > 0 ? a : 0;
    return { complete: areaM2 > 0, areaM2, check };
  }

  // The client's fireplace from the page. Only the chosen form's sizes are
  // read -- a shelf projection left over from «С полкой» is not part of a
  // portal without a shelf. An unknown type -> null.
  function readFireplaceConfig(doc, typeId) {
    const type = getType(typeId);
    if (!type) return null;
    const formEl = doc && typeof doc.getElementById === 'function' ? doc.getElementById(FORM_FIELD) : null;
    const form = getForm(type, formEl ? formEl.value : null);
    const params = {};
    form.params.forEach(spec => { params[spec.key] = readSizeM(doc, PARAM_FIELDS[spec.key]); });
    const result = computeArea(type, form, params);
    return {
      typeId: type.id, type: type.key, form: form.id, params,
      complete: result.complete, areaM2: result.areaM2,
      missing: result.check.missing, violations: result.check.violations,
    };
  }

  // What the price covers, as the client reads it.
  function priceNote(type) {
    return 'Стоимость указана за ' + type.priceScope + '.';
  }

  // The same configuration as plain data for the Result and the lead: every
  // size under its own name, in millimetres (null where not entered).
  function describeFireplace(config) {
    if (!config) return null;
    const type = getType(config.typeId);
    const form = getForm(type, config.form);
    if (!type || !form) return null;
    const round2 = x => Math.round(x * 100) / 100;
    const params = config.params || {};
    return {
      typeId: type.id,
      type: type.key,
      typeLabel: type.title,
      form: form.id,
      formLabel: form.title,
      params: form.params.map(spec => {
        const v = params[spec.key];
        return {
          key: spec.key, label: spec.label, symbol: spec.symbol, unit: spec.unit,
          valueMm: v === null || v === undefined || !Number.isFinite(v) ? null : Math.round(v * 1000),
        };
      }),
      complete: !!config.complete,
      areaM2: round2(config.areaM2 || 0),
      areaUnit: AREA_UNIT,
      areaTitle: type.areaTitle,
      surface: form.surface,
      formula: form.formula,
      priceNote: priceNote(type),
    };
  }

  // What each size is, behind its «?» on the size step (2026-10-21, the owner): by type, as
  // the same key means a different thing in each (a portal's depth is not a podium's).
  // Lower-case: the line follows the size's name («Глубина портала: насколько ...»).
  const SIZE_TIPS = {
    portal: {
      openingWidth: 'просвет внутри рамки по горизонтали - ширина топки, которую обрамляет портал.',
      openingHeight: 'просвет внутри рамки от пола до низа перемычки.',
      pierWidth: 'ширина каждой боковой стойки портала, слева и справа от проёма.',
      lintelHeight: 'высота верхней части рамки над проёмом.',
      depth: 'насколько портал выступает от стены.',
      shelfProjection: 'насколько каминная полка выступает вперёд за лицевую сторону портала.',
    },
    cladding: {
      claddingWidth: 'ширина передней стороны короба, от края до края.',
      claddingHeight: 'от пола до верха короба.',
      depth: 'насколько короб выступает от стены.',
      fireboxWidth: 'ширина отверстия под топку в передней стороне короба.',
      fireboxHeight: 'высота отверстия под топку.',
      fireboxBottom: 'от пола до нижнего края отверстия топки; 0 - топка у самого пола.',
    },
    podium: {
      length: 'вдоль стены.',
      depth: 'от стены вперёд, в комнату.',
      height: 'от пола до верха подиума.',
    },
  };
  FIREPLACE_TYPES.forEach(type => type.forms.forEach(form => form.params.forEach(p => {
    p.tip = (SIZE_TIPS[type.key] || {})[p.key] || null;
  })));

  return {
    LENGTH_UNIT, AREA_UNIT, PLATE_THICKNESS_M, PARAM_FIELDS, FORM_FIELD, FIREPLACE_TYPES,
    getType, getTypeByKey, getForm, checkConstraints, computeArea,
    readFireplaceConfig, describeFireplace, priceNote,
  };
});
