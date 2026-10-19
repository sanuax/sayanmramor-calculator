// facade-model.js
//
// The domain model of «Фасады» -- the one place that says, for every facade
// product a client can pick: its forms, the physical sizes the client
// measures (each with its own name -- never a generic «Длина / Ширина»),
// the stone surface each form actually clads, the formula of that surface,
// and whether the product is ordered in pieces (and how many are allowed).
// constructor-state.js reads the client's input through it, pricing gets
// its area from it, the 3D draws its sizes, and the Result and the lead
// carry its description. Pure functions and data only -- no DOM beyond
// doc.getElementById(id).value, no pricing math of its own.
//
// Adding a facade product = one entry in FACADE_TYPES (plus its catalog row
// in rate-catalog.js, its card icon in the page and its 3D in
// scene-layout.js). Commercial rates are NOT here: every facade product is
// priced by the stone and WORK_RATES.fasad per m² of the area below, as
// before -- no per-type rate exists in the company's data yet.
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.FacadeModel = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {

  // Quantity limits of every facade product ordered in pieces -- one place
  // for the business to change. 30 is the calculator's existing technical cap
  // for a count (ConstructorState.STEP_COUNT_RANGE): a quick estimate, not a
  // whole-building order, which goes to a manager anyway.
  const QUANTITY_LIMITS = { minQuantity: 1, maxQuantity: 30 };

  // The size fields, by parameter key -> the page's input id. One input per
  // physical quantity: the same «height» field is «Высота стены» on a wall
  // and «Высота колонны» on a column (the label comes from the form below),
  // so a height entered once carries over when the client changes the type.
  const PARAM_FIELDS = {
    length: 'facade-length',
    height: 'facade-height',
    width: 'facade-width',
    radius: 'facade-radius',
    side: 'facade-side',
    projection: 'facade-projection',
    openingWidth: 'facade-opening-width',
    openingHeight: 'facade-opening-height',
    frame: 'facade-frame',
  };
  const FORM_FIELD = 'facade-form';
  const QUANTITY_FIELD = 'facade-quantity';

  function param(key, label, placeholderMm) {
    return { key, label, placeholderMm };
  }

  // `nouns`: the piece in Russian for 1 / 2-4 / 5+ («4 колонны»).
  function quantity(label, nouns) {
    return Object.assign({ label, unit: 'шт.', nouns }, QUANTITY_LIMITS);
  }

  // Each form: `params` in the order the client fills them in; `area(p)`
  // the cladded surface of ONE piece in m² from sizes in metres; `formula`
  // the same in words (shown next to the area); `surface` what that area is.
  // `cameraPreset` is the 3D's default angle for the type (visualizer/
  // constants.js) -- a column is read from an angle, a wall from the front.
  // What the price is for, in the client's words: `areaTitle` heads the
  // area, `priceScope` completes «Стоимость указана за …», and `visualNote`
  // names what the 3D shows only as the architectural image (a column's base
  // and top, the lintel over a colonnade) -- never part of the area above.
  const FACADE_TYPES = [
    {
      id: 'FACADE-01', key: 'wall', title: 'Фасад здания', desc: 'Облицовка стены',
      cameraPreset: 'front',
      quantity: quantity('Количество одинаковых участков', ['участок', 'участка', 'участков']),
      areaTitle: 'Площадь облицовки стены', priceScope: 'облицовку стены',
      forms: [{
        id: 'wall', title: null,
        params: [param('length', 'Длина стены', 8000), param('height', 'Высота стены', 3000)],
        surface: 'лицевая поверхность стены', formula: 'длина × высота',
        area: p => p.length * p.height,
      }],
    },
    {
      id: 'FACADE-04', key: 'plinth', title: 'Цоколь', desc: 'Нижний пояс стены',
      cameraPreset: 'front',
      quantity: quantity('Количество одинаковых участков', ['участок', 'участка', 'участков']),
      areaTitle: 'Площадь облицовки цоколя', priceScope: 'облицовку цоколя',
      forms: [{
        id: 'plinth', title: null,
        params: [param('length', 'Длина участка', 8000), param('height', 'Высота цоколя', 600)],
        surface: 'лицевая поверхность цоколя', formula: 'длина × высота',
        area: p => p.length * p.height,
      }],
    },
    {
      // Was «Фасадный элемент - Наличник окна»: the 3D always drew a surround
      // around an opening, so its sizes are now the opening's and the frame's.
      id: 'FACADE-02', key: 'surround', title: 'Обрамление проёма', desc: 'Наличник окна или двери',
      cameraPreset: 'front',
      quantity: quantity('Количество проёмов', ['проём', 'проёма', 'проёмов']),
      areaTitle: 'Площадь обрамления проёмов', priceScope: 'обрамление проёмов',
      forms: [
        {
          id: 'window', title: 'Окно', desc: 'Обрамление с четырёх сторон',
          params: [param('openingWidth', 'Ширина проёма', 1200), param('openingHeight', 'Высота проёма', 1500), param('frame', 'Ширина обрамления', 150)],
          surface: 'рамка вокруг проёма', formula: '(Ш + 2·О) × (В + 2·О) − Ш × В',
          area: p => (p.openingWidth + 2 * p.frame) * (p.openingHeight + 2 * p.frame) - p.openingWidth * p.openingHeight,
        },
        {
          id: 'door', title: 'Дверь', desc: 'Обрамление с трёх сторон',
          params: [param('openingWidth', 'Ширина проёма', 1000), param('openingHeight', 'Высота проёма', 2100), param('frame', 'Ширина обрамления', 150)],
          surface: 'рамка вокруг проёма без низа', formula: '(Ш + 2·О) × (В + О) − Ш × В',
          area: p => (p.openingWidth + 2 * p.frame) * (p.openingHeight + p.frame) - p.openingWidth * p.openingHeight,
        },
      ],
    },
    {
      // Колонны: only the side surface is clad (the top and the foot are not).
      id: 'FACADE-03', key: 'column', title: 'Колонны', desc: 'Облицовка колонн',
      cameraPreset: 'iso-eye-level',
      quantity: quantity('Количество колонн', ['колонна', 'колонны', 'колонн']),
      areaTitle: 'Площадь облицовки колонн', priceScope: 'облицовку колонн',
      visualNote: 'Архитектурные элементы колоннады на 3D - визуальный образ и в расчёт не входят.',
      forms: [
        {
          id: 'round', title: 'Круглая', desc: 'Круглое сечение',
          params: [param('radius', 'Радиус колонны', 200), param('height', 'Высота колонны', 3000)],
          surface: 'боковая поверхность колонны', formula: '2 × π × R × H',
          area: p => 2 * Math.PI * p.radius * p.height,
        },
        {
          id: 'square', title: 'Квадратная', desc: 'Квадратное сечение',
          params: [param('side', 'Сторона сечения', 400), param('height', 'Высота колонны', 3000)],
          surface: 'боковая поверхность колонны', formula: '4 × A × H',
          area: p => 4 * p.side * p.height,
        },
      ],
    },
    {
      // Пилястра: a flat column standing out of the wall -- its face and its
      // two sides are clad, the back is the wall.
      id: 'FACADE-06', key: 'pilaster', title: 'Пилястры', desc: 'Плоская колонна на стене',
      cameraPreset: 'iso-eye-level',
      quantity: quantity('Количество пилястр', ['пилястра', 'пилястры', 'пилястр']),
      areaTitle: 'Площадь облицовки пилястр', priceScope: 'облицовку пилястр',
      forms: [{
        id: 'pilaster', title: null,
        params: [param('width', 'Ширина пилястры', 400), param('projection', 'Выступ от стены', 100), param('height', 'Высота пилястры', 3000)],
        surface: 'лицевая грань и две боковые', formula: '(ширина + 2 × выступ) × высота',
        area: p => (p.width + 2 * p.projection) * p.height,
      }],
    },
    {
      // Карниз: a stepped profile crowning the wall -- its front faces and
      // its underside are clad; the top is covered by flashing, not stone.
      id: 'FACADE-07', key: 'cornice', title: 'Карниз', desc: 'Венчающий профиль стены',
      cameraPreset: 'front',
      quantity: null,
      areaTitle: 'Площадь облицовки карниза', priceScope: 'облицовку карниза',
      forms: [{
        id: 'cornice', title: null,
        params: [param('length', 'Длина карниза', 8000), param('height', 'Высота профиля', 300), param('projection', 'Вынос карниза', 250)],
        surface: 'лицевые грани и низ карниза', formula: 'длина × (высота + вынос)',
        area: p => p.length * (p.height + p.projection),
      }],
    },
    {
      // Фасадный пояс: a flat band across the wall between floors -- its
      // face, top and underside are clad.
      id: 'FACADE-08', key: 'belt', title: 'Фасадный пояс', desc: 'Горизонтальная тяга по стене',
      cameraPreset: 'front',
      quantity: null,
      areaTitle: 'Площадь облицовки пояса', priceScope: 'облицовку пояса',
      forms: [{
        id: 'belt', title: null,
        params: [param('length', 'Длина пояса', 8000), param('height', 'Высота пояса', 200), param('projection', 'Выступ от стены', 60)],
        surface: 'лицевая грань, верх и низ пояса', formula: 'длина × (высота + 2 × выступ)',
        area: p => p.length * (p.height + 2 * p.projection),
      }],
    },
    {
      // Декоративный элемент: a flat stone piece on the wall (a panel, an
      // insert) -- its face is clad.
      id: 'FACADE-05', key: 'decor', title: 'Декоративный элемент', desc: 'Плоская вставка на стене',
      cameraPreset: 'front',
      quantity: quantity('Количество элементов', ['элемент', 'элемента', 'элементов']),
      areaTitle: 'Площадь декоративных элементов', priceScope: 'декоративные элементы',
      forms: [{
        id: 'decor', title: null,
        params: [param('width', 'Ширина элемента', 600), param('height', 'Высота элемента', 800)],
        surface: 'лицевая поверхность элемента', formula: 'ширина × высота',
        area: p => p.width * p.height,
      }],
    },
  ];

  const TYPES_BY_ID = {};
  FACADE_TYPES.forEach(t => { TYPES_BY_ID[t.id] = t; });

  function getType(typeId) {
    return TYPES_BY_ID[typeId] || null;
  }

  // The form the client picked -- or the type's first form (a form id of
  // another type, or none, never survives into the state).
  function getForm(type, formId) {
    if (!type) return null;
    return type.forms.find(f => f.id === formId) || type.forms[0];
  }

  function quantityRange(type) {
    return type && type.quantity ? { min: type.quantity.minQuantity, max: type.quantity.maxQuantity } : null;
  }

  function isValidQuantity(n, range) {
    return !!range && Number.isInteger(n) && n >= range.min && n <= range.max;
  }

  // A piece product's quantity from the page's validated field: only a whole
  // number in range counts, anything else is the minimum. A type sold by the
  // metre or by area is always one.
  function readQuantity(raw, type) {
    const range = quantityRange(type);
    if (!range) return 1;
    const s = String(raw == null ? '' : raw).trim();
    const n = s === '' ? NaN : Number(s);
    return isValidQuantity(n, range) ? n : range.min;
  }

  // Sizes in metres -> the cladded area of one piece and of all of them.
  // Incomplete (a size missing or not positive) -> zero, never NaN.
  function computeAreas(type, form, paramsM, qty) {
    if (!type || !form) return { complete: false, pieceAreaM2: 0, areaM2: 0 };
    const complete = form.params.every(p => paramsM[p.key] > 0 && Number.isFinite(paramsM[p.key]));
    const piece = complete ? form.area(paramsM) : 0;
    const pieceAreaM2 = piece > 0 && Number.isFinite(piece) ? piece : 0;
    return { complete: complete && pieceAreaM2 > 0, pieceAreaM2, areaM2: pieceAreaM2 * qty };
  }

  // The client's facade configuration from the page. Only the chosen form's
  // sizes are read -- a radius left over from «Круглая» is not part of a
  // square column.
  function readFacadeConfig(doc, typeId) {
    const type = getType(typeId);
    if (!type) return null;
    const form = getForm(type, doc.getElementById(FORM_FIELD).value);
    const params = {};
    form.params.forEach(p => {
      const mm = parseFloat(doc.getElementById(PARAM_FIELDS[p.key]).value);
      params[p.key] = Number.isFinite(mm) && mm > 0 ? mm / 1000 : 0;
    });
    const qty = readQuantity(doc.getElementById(QUANTITY_FIELD).value, type);
    const areas = computeAreas(type, form, params, qty);
    return {
      typeId: type.id, type: type.key, form: form.id, params, quantity: qty,
      complete: areas.complete, pieceAreaM2: areas.pieceAreaM2, areaM2: areas.areaM2,
    };
  }

  // «4 колонны», «1 проём», «5 элементов».
  function countLabel(n, nouns) {
    const m10 = n % 10, m100 = n % 100;
    const i = m10 === 1 && m100 !== 11 ? 0 : (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? 1 : 2);
    return n + ' ' + nouns[i];
  }

  // What the price covers, as the client reads it: «Стоимость указана за
  // облицовку колонн.» -- plus, where the 3D shows more than is priced (a
  // column's base and top), the note that those are only the image.
  function priceNote(type) {
    return 'Стоимость указана за ' + type.priceScope + '.';
  }

  // The same configuration as plain data for the Result and the lead:
  // every size under its own name, in millimetres.
  function describeFacade(config) {
    if (!config) return null;
    const type = getType(config.typeId);
    const form = getForm(type, config.form);
    if (!type || !form) return null;
    const round2 = x => Math.round(x * 100) / 100;
    return {
      typeId: type.id,
      type: type.key,
      typeLabel: type.title,
      form: form.id,
      formLabel: form.title,
      params: form.params.map(p => ({ key: p.key, label: p.label, valueMm: Math.round((config.params[p.key] || 0) * 1000) })),
      quantity: type.quantity ? config.quantity : null,
      quantityLabel: type.quantity ? type.quantity.label : null,
      unit: type.quantity ? type.quantity.unit : null,
      // «4 колонны» -- the quantity in words (null for a linear product).
      quantityText: type.quantity ? countLabel(config.quantity, type.quantity.nouns) : null,
      surface: form.surface,
      formula: form.formula,
      pieceAreaM2: round2(config.pieceAreaM2),
      areaM2: round2(config.areaM2),
      areaTitle: type.areaTitle,
      priceNote: priceNote(type),
      visualNote: type.visualNote || null,
    };
  }

  return {
    QUANTITY_LIMITS, PARAM_FIELDS, FORM_FIELD, QUANTITY_FIELD, FACADE_TYPES,
    getType, getForm, quantityRange, isValidQuantity, readQuantity, computeAreas,
    readFacadeConfig, describeFacade, countLabel, priceNote,
  };
});
