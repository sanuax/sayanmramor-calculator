(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.RateCatalog = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {

  // The 50 rows below exist purely as UI/data structure for the subcategory
  // selector (product -> shape/variant dropdown); this is deliberately
  // display-only per the design spec, and no pricing code reads from this
  // array yet. Filling in a `rate` here has no effect on the displayed
  // price until a future task wires subcategory rates into
  // computeWorkAndTotal/WORK_RATES.
  const PRODUCT_SUBCATEGORIES = [
    { id: 'STAIR-01', categoryLabel: 'Лестницы', shape: 'Прямая', variant: 'Ступени', unit: 'м²', rate: null, currency: null },
    { id: 'STAIR-02', categoryLabel: 'Лестницы', shape: 'Прямая', variant: 'Ступени + подступенки', unit: 'м²', rate: null, currency: null },
    { id: 'STAIR-03', categoryLabel: 'Лестницы', shape: 'Г-образная', variant: 'Ступени', unit: 'м²', rate: null, currency: null },
    { id: 'STAIR-04', categoryLabel: 'Лестницы', shape: 'Г-образная', variant: 'Ступени + подступенки', unit: 'м²', rate: null, currency: null },
    { id: 'STAIR-05', categoryLabel: 'Лестницы', shape: 'П-образная', variant: 'Ступени', unit: 'м²', rate: null, currency: null },
    { id: 'STAIR-06', categoryLabel: 'Лестницы', shape: 'П-образная', variant: 'Ступени + подступенки', unit: 'м²', rate: null, currency: null },
    { id: 'STAIR-07', categoryLabel: 'Лестницы', shape: 'Винтовая / радиусная', variant: 'Ступени', unit: 'м²', rate: null, currency: null },
    { id: 'STAIR-08', categoryLabel: 'Лестницы', shape: 'Винтовая / радиусная', variant: 'Ступени + подступенки', unit: 'м²', rate: null, currency: null },
    { id: 'STAIR-09', categoryLabel: 'Лестницы', shape: 'Любая', variant: 'Калошница / тетива', unit: 'м²', rate: null, currency: null },
    { id: 'STAIR-10', categoryLabel: 'Лестницы', shape: 'Любая', variant: 'Боковина / торец лестницы', unit: 'м²', rate: null, currency: null },
    { id: 'STAIR-11', categoryLabel: 'Лестницы', shape: 'Любая', variant: 'Площадка', unit: 'м²', rate: null, currency: null },
    { id: 'STAIR-12', categoryLabel: 'Лестницы', shape: 'Любая', variant: 'Полная облицовка лестницы', unit: 'компл.', rate: null, currency: null },
    { id: 'STAIR-13', categoryLabel: 'Лестницы', shape: 'Наружная / входная группа', variant: 'Облицовка', unit: 'м²', rate: null, currency: null },

    { id: 'PANEL-01', categoryLabel: 'Панно', shape: 'Стеновое', variant: 'Стандартное', unit: 'м²', rate: null, currency: null },
    { id: 'PANEL-02', categoryLabel: 'Панно', shape: 'Декоративное', variant: 'Стандартное', unit: 'м²', rate: null, currency: null },
    { id: 'PANEL-03', categoryLabel: 'Панно', shape: 'Художественное / наборное', variant: 'Нестандартное', unit: 'м²', rate: null, currency: null },
    { id: 'PANEL-04', categoryLabel: 'Панно', shape: 'С подсветкой', variant: 'Подготовка / монтаж', unit: 'м²', rate: null, currency: null },

    { id: 'SILL-01', categoryLabel: 'Подоконники', shape: 'Прямой', variant: 'Стандартный', unit: 'м²', rate: null, currency: null },
    { id: 'SILL-02', categoryLabel: 'Подоконники', shape: 'Угловой', variant: 'Стандартный', unit: 'м²', rate: null, currency: null },
    { id: 'SILL-03', categoryLabel: 'Подоконники', shape: 'Эркерный', variant: 'Стандартный', unit: 'м²', rate: null, currency: null },
    { id: 'SILL-04', categoryLabel: 'Подоконники', shape: 'Эркерный радиусный', variant: 'Стандартный', unit: 'м²', rate: null, currency: null },
    { id: 'SILL-05', categoryLabel: 'Подоконники', shape: 'Фигурный', variant: 'Нестандартный', unit: 'м²', rate: null, currency: null },

    { id: 'FLOOR-01', categoryLabel: 'Полы', shape: 'Прямая раскладка', variant: 'Стандартная', unit: 'м²', rate: null, currency: null },
    { id: 'FLOOR-02', categoryLabel: 'Полы', shape: 'Диагональная', variant: 'Стандартная', unit: 'м²', rate: null, currency: null },
    { id: 'FLOOR-03', categoryLabel: 'Полы', shape: 'Крупноформатные плиты', variant: 'Стандартная', unit: 'м²', rate: null, currency: null },
    { id: 'FLOOR-04', categoryLabel: 'Полы', shape: 'По рисунку', variant: 'Нестандартная раскладка', unit: 'м²', rate: null, currency: null },
    { id: 'FLOOR-05', categoryLabel: 'Полы', shape: 'Художественная / сложная', variant: 'Нестандартная', unit: 'м²', rate: null, currency: null },

    { id: 'WALL-01', categoryLabel: 'Стены', shape: 'Обычная облицовка', variant: 'Стандартная', unit: 'м²', rate: null, currency: null },
    { id: 'WALL-02', categoryLabel: 'Стены', shape: 'Стеновые панели', variant: 'Стандартная', unit: 'м²', rate: null, currency: null },
    { id: 'WALL-03', categoryLabel: 'Стены', shape: 'Крупноформатные плиты', variant: 'Стандартная', unit: 'м²', rate: null, currency: null },
    { id: 'WALL-04', categoryLabel: 'Стены', shape: 'Радиусная', variant: 'Нестандартная', unit: 'м²', rate: null, currency: null },
    { id: 'WALL-05', categoryLabel: 'Стены', shape: 'С подсветкой', variant: 'Подготовка / монтаж', unit: 'м²', rate: null, currency: null },

    { id: 'FACADE-01', categoryLabel: 'Фасады', shape: 'Фасад здания', variant: 'Облицовка', unit: 'м²', rate: null, currency: null },
    { id: 'FACADE-02', categoryLabel: 'Фасады', shape: 'Фасадный элемент', variant: 'Изделие', unit: 'шт.', rate: null, currency: null },
    { id: 'FACADE-03', categoryLabel: 'Фасады', shape: 'Колонны', variant: 'Облицовка', unit: 'м²', rate: null, currency: null },
    { id: 'FACADE-04', categoryLabel: 'Фасады', shape: 'Цоколь', variant: 'Облицовка', unit: 'м²', rate: null, currency: null },
    { id: 'FACADE-05', categoryLabel: 'Фасады', shape: 'Декоративные элементы', variant: 'Изделие', unit: 'шт.', rate: null, currency: null },

    { id: 'BATH-01', categoryLabel: 'Столешницы в ванную', shape: 'Прямая', variant: '', unit: 'м²', rate: null, currency: null },
    { id: 'BATH-02', categoryLabel: 'Столешницы в ванную', shape: 'Угловая', variant: '', unit: 'м²', rate: null, currency: null },
    { id: 'BATH-03', categoryLabel: 'Столешницы в ванную', shape: 'П-образная', variant: '', unit: 'м²', rate: null, currency: null },
    { id: 'BATH-04', categoryLabel: 'Столешницы в ванную', shape: 'Фигурная', variant: '', unit: 'м²', rate: null, currency: null },

    { id: 'KITCHEN-01', categoryLabel: 'Столешницы на кухню', shape: 'Основная столешница', variant: 'Стандартная', unit: 'м²', rate: null, currency: null },
    { id: 'KITCHEN-02', categoryLabel: 'Столешницы на кухню', shape: 'Остров', variant: 'Прямоугольный', unit: 'м²', rate: null, currency: null },
    { id: 'KITCHEN-03', categoryLabel: 'Столешницы на кухню', shape: 'Остров', variant: 'Фигурный / радиусный', unit: 'м²', rate: null, currency: null },
    { id: 'KITCHEN-04', categoryLabel: 'Столешницы на кухню', shape: 'Барная стойка', variant: 'Стандартная', unit: 'м²', rate: null, currency: null },
    { id: 'KITCHEN-05', categoryLabel: 'Столешницы на кухню', shape: 'Барная стойка', variant: 'Сложная / радиусная', unit: 'м²', rate: null, currency: null },

    { id: 'STEP-01', categoryLabel: 'Ступени', shape: 'Ступень', variant: 'Прямая', unit: 'шт.', rate: null, currency: null },
    { id: 'STEP-02', categoryLabel: 'Ступени', shape: 'Ступень', variant: 'Забежная', unit: 'шт.', rate: null, currency: null },
    { id: 'STEP-03', categoryLabel: 'Ступени', shape: 'Ступень', variant: 'Радиусная', unit: 'шт.', rate: null, currency: null },
    { id: 'STEP-04', categoryLabel: 'Ступени', shape: 'Подступенок', variant: 'Стандартный', unit: 'шт.', rate: null, currency: null },
  ];

  const ADDITIONAL_WORKS = [
    { id: 'CUT-01', group: 'Вырезы', operation: 'Раковина', variant: 'Накладная', unit: 'шт.', rate: null, currency: null },
    { id: 'CUT-02', group: 'Вырезы', operation: 'Раковина', variant: 'Подшивная снизу', unit: 'шт.', rate: null, currency: null },
    { id: 'CUT-03', group: 'Вырезы', operation: 'Раковина', variant: 'Интегрированная', unit: 'шт.', rate: null, currency: null },
    { id: 'CUT-04', group: 'Вырезы', operation: 'Варочная панель', variant: 'Стандартный вырез', unit: 'шт.', rate: null, currency: null },
    { id: 'CUT-05', group: 'Отверстия', operation: 'Смеситель', variant: '1 отверстие', unit: 'шт.', rate: null, currency: null },
    { id: 'CUT-06', group: 'Отверстия', operation: 'Розетка', variant: '1 отверстие', unit: 'шт.', rate: null, currency: null },
    { id: 'CUT-07', group: 'Отверстия', operation: 'Дозатор', variant: '1 отверстие', unit: 'шт.', rate: null, currency: null },
    { id: 'EDGE-01', group: 'Кромка', operation: 'Кромка', variant: 'Прямая', unit: 'м.п.', rate: null, currency: null },
    { id: 'EDGE-03', group: 'Кромка', operation: 'Кромка', variant: 'Фигурная / сложная', unit: 'м.п.', rate: null, currency: null },
    { id: 'EDGE-04', group: 'Кромка', operation: 'Скругление', variant: 'R / профиль', unit: 'м.п.', rate: null, currency: null },
    { id: 'EDGE-05', group: 'Кромка', operation: 'Скос', variant: 'Фаска / скос', unit: 'м.п.', rate: null, currency: null },
    { id: 'EDGE-06', group: 'Кромка', operation: 'Подгиб камнем', variant: 'Столешница / фасад', unit: 'м.п.', rate: null, currency: null },
    // NOTE: EXTRA-01's `.rate` is NOT read by any code. The «Бортик» UI
    // input in sayanmramor-calculator.html is wired to the older, separate
    // COUNTERTOP_EXTRAS_RATES.bortikRatePerM field in product-types.js
    // instead. Setting a rate here has no effect on the displayed price.
    { id: 'EXTRA-01', group: 'Дополнительно', operation: 'Бортик', variant: 'Стандартный', unit: 'м.п.', rate: null, currency: null },
    // NOTE: EXTRA-02's `.rate` is NOT read by any code. The «Фартук» UI
    // input in sayanmramor-calculator.html is wired to the older, separate
    // COUNTERTOP_EXTRAS_RATES.fartukRatePerM2 field in product-types.js
    // instead. Setting a rate here has no effect on the displayed price.
    { id: 'EXTRA-02', group: 'Дополнительно', operation: 'Фартук', variant: 'Стандартный', unit: 'м²', rate: null, currency: null },
    // EXTRA-03, unlike EXTRA-01/02/04 above/below, IS read via
    // getAdditionalWorkRate() as part of the extraLineItems mechanism.
    { id: 'EXTRA-03', group: 'Дополнительно', operation: 'Стеновая панель', variant: 'Стандартная', unit: 'м²', rate: null, currency: null },
    // NOTE: EXTRA-04's `.rate` is NOT read by any code. The «Остров
    // прямоугольный» UI input in sayanmramor-calculator.html is wired to
    // the older, separate COUNTERTOP_EXTRAS_RATES.ostrovRatePerM2 field in
    // product-types.js instead. Setting a rate here has no effect on the
    // displayed price.
    { id: 'EXTRA-04', group: 'Дополнительно', operation: 'Остров', variant: 'Прямоугольный', unit: 'м²', rate: null, currency: null },
    // EXTRA-05, unlike EXTRA-04 above, IS read via getAdditionalWorkRate()
    // as part of the extraLineItems mechanism.
    { id: 'EXTRA-05', group: 'Дополнительно', operation: 'Остров', variant: 'Фигурный / радиусный', unit: 'м²', rate: null, currency: null },
    { id: 'EXTRA-06', group: 'Дополнительно', operation: 'Барная стойка', variant: 'Стандартная', unit: 'м²', rate: null, currency: null },
    { id: 'EXTRA-07', group: 'Дополнительно', operation: 'Барная стойка', variant: 'Сложная / радиусная', unit: 'м²', rate: null, currency: null },
  ];

  // The 9 INST-* rows from «Ставки изделий» -- kept as their own array, in
  // the same row shape as PRODUCT_SUBCATEGORIES, because there is exactly
  // one per product category (not several shape/variant options) and it is
  // a distinct pricing concept that already has a live UI+field (the
  // "Монтаж на объекте" checkbox -> WORK_RATES[key].installationRatePerM2
  // in product-types.js). Kept for completeness/traceability of the source
  // spreadsheet; nothing reads from this array yet.
  const INSTALLATION_RATES = [
    { id: 'INST-100', categoryLabel: 'Лестницы', shape: 'Монтаж', variant: 'Монтаж на объекте', unit: 'м²', rate: null, currency: null },
    { id: 'INST-101', categoryLabel: 'Панно', shape: 'Монтаж', variant: 'Монтаж на объекте', unit: 'м²', rate: null, currency: null },
    { id: 'INST-102', categoryLabel: 'Подоконники', shape: 'Монтаж', variant: 'Монтаж на объекте', unit: 'м²', rate: null, currency: null },
    { id: 'INST-103', categoryLabel: 'Полы', shape: 'Монтаж', variant: 'Монтаж на объекте', unit: 'м²', rate: null, currency: null },
    { id: 'INST-104', categoryLabel: 'Стены', shape: 'Монтаж', variant: 'Монтаж на объекте', unit: 'м²', rate: null, currency: null },
    { id: 'INST-105', categoryLabel: 'Фасады', shape: 'Монтаж', variant: 'Монтаж на объекте', unit: 'м²', rate: null, currency: null },
    { id: 'INST-106', categoryLabel: 'Столешницы в ванную', shape: 'Монтаж', variant: 'Монтаж на объекте', unit: 'м²', rate: null, currency: null },
    { id: 'INST-107', categoryLabel: 'Столешницы на кухню', shape: 'Монтаж', variant: 'Монтаж на объекте', unit: 'м²', rate: null, currency: null },
    { id: 'INST-108', categoryLabel: 'Ступени', shape: 'Монтаж', variant: 'Монтаж на объекте', unit: 'м²', rate: null, currency: null },
  ];

  function getSubcategoriesForProduct(categoryLabel) {
    return PRODUCT_SUBCATEGORIES.filter(row => row.categoryLabel === categoryLabel);
  }

  function getAdditionalWorkRate(id) {
    const row = ADDITIONAL_WORKS.find(r => r.id === id);
    return row ? row.rate : null;
  }

  function getInstallationRow(categoryLabel) {
    return INSTALLATION_RATES.find(row => row.categoryLabel === categoryLabel) || null;
  }

  return {
    PRODUCT_SUBCATEGORIES, getSubcategoriesForProduct,
    ADDITIONAL_WORKS, getAdditionalWorkRate,
    INSTALLATION_RATES, getInstallationRow,
  };
});
