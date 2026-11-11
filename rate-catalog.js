(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.RateCatalog = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {

  // Ставки компании - таблица v2 (Ставки_для_калькулятора_заполненные_v2.xlsx), заполнена 2026-11-08.
  // Единственное место ставок калькулятора: цифра ставки живёт здесь ровно один раз,
  // с ID из таблицы. Все суммы - в рублях (валюты нет). Пустая ячейка компании = null
  // («уточнит менеджер» или, для полировки, нет галочки) -- никогда не 0 и не ставка соседнего типа.

  // «Ставки изделий» (₽ за м² изделия): изготовление / монтаж / полировка.
  // `shape` -- колонка «Тип» таблицы v2; `variant` у типов без второго уровня пустой.
  function productRow(id, categoryLabel, shape, fabrication, installation, polish) {
    return {
      id, categoryLabel, shape, variant: '', unit: 'м²',
      fabricationRatePerM2: fabrication, installationRatePerM2: installation, polishRatePerM2: polish,
    };
  }

  const PRODUCT_SUBCATEGORIES = [
    productRow('STAIR-01', 'Лестницы', 'Прямая', 50000, 25000, null),
    productRow('STAIR-03', 'Лестницы', 'Г-образная', 50000, 25000, null),
    productRow('STAIR-05', 'Лестницы', 'П-образная', 50000, 25000, null),
    productRow('STAIR-07', 'Лестницы', 'Винтовая', 90000, 40000, null),
    productRow('STAIR-11', 'Лестницы', 'Площадка между маршами', 50000, 25000, null),

    productRow('PANEL-01', 'Панно', 'Стеновое', 25000, 40000, 20000),
    productRow('PANEL-02', 'Панно', 'Декоративное', 40000, 40000, 20000),
    productRow('PANEL-03', 'Панно', 'Художественное', 60000, 60000, 20000),
    productRow('PANEL-04', 'Панно', 'С подсветкой', 40000, 40000, 20000),

    productRow('SILL-01', 'Подоконники', 'Прямой', 30000, 15000, 18000),
    productRow('SILL-02', 'Подоконники', 'Угловой', 30000, 20000, 18000),
    productRow('SILL-03', 'Подоконники', 'Эркерный', 40000, 25000, 18000),
    productRow('SILL-04', 'Подоконники', 'Эркерный радиусный', 45000, 30000, 18000),
    productRow('SILL-05', 'Подоконники', 'Фигурный передний край', 50000, 30000, 18000),

    productRow('FLOOR-01', 'Полы', 'Прямая раскладка', 15000, 18000, 18000),
    productRow('FLOOR-02', 'Полы', 'Диагональная', 15000, 18000, 18000),
    productRow('FLOOR-03', 'Полы', 'Крупноформатные плиты', 25000, 30000, 18000),
    productRow('FLOOR-04', 'Полы', 'По рисунку', 35000, 40000, 20000),
    productRow('FLOOR-05', 'Полы', 'Художественная', 60000, 50000, 20000),

    productRow('WALL-01', 'Стены', 'Облицовка сеткой плит', 25000, 25000, 20000),
    productRow('WALL-02', 'Стены', 'Панели во всю высоту', 25000, 35000, 20000),
    productRow('WALL-03', 'Стены', 'Крупноформатные плиты', 25000, 40000, 20000),
    productRow('WALL-04', 'Стены', 'Радиусная', 45000, 50000, 25000),
    productRow('WALL-05', 'Стены', 'С подсветкой', 30000, 40000, 20000),

    // Фасады: единица -- м² камня, как калькулятор и считает (поштучных ставок нет).
    productRow('FACADE-01', 'Фасады', 'Фасад здания', 50000, 25000, 25000),
    productRow('FACADE-02', 'Фасады', 'Обрамление окна / двери', 120000, 40000, null),
    productRow('FACADE-03', 'Фасады', 'Колонны', 150000, 40000, 30000),
    productRow('FACADE-04', 'Фасады', 'Цоколь', 50000, 25000, 25000),
    productRow('FACADE-05', 'Фасады', 'Декоративный элемент', 200000, 50000, null),
    productRow('FACADE-06', 'Фасады', 'Пилястры', 150000, 50000, null),
    productRow('FACADE-07', 'Фасады', 'Карниз', 150000, 50000, null),
    productRow('FACADE-08', 'Фасады', 'Фасадный пояс', 150000, 50000, null),

    productRow('BATH-01', 'Столешницы в ванную', 'Прямая', 40000, 20000, 18000),
    productRow('BATH-02', 'Столешницы в ванную', 'Г-образная (угловая)', 40000, 20000, 18000),
    productRow('BATH-03', 'Столешницы в ванную', 'П-образная', 40000, 20000, 18000),

    productRow('KITCHEN-11', 'Столешницы на кухню', 'Прямая', 40000, 20000, 18000),
    productRow('KITCHEN-12', 'Столешницы на кухню', 'Г-образная', 40000, 20000, 18000),
    productRow('KITCHEN-13', 'Столешницы на кухню', 'П-образная', 40000, 20000, 18000),

    productRow('STEP-01', 'Ступени', 'Прямая', 50000, 25000, null),
    productRow('STEP-02', 'Ступени', 'Забежная', 60000, 35000, null),
    productRow('STEP-03', 'Ступени', 'Радиусная', 90000, 40000, null),

    // «Камины» (fireplace-model.js FIREPLACE_TYPES): единица -- м² камня плит.
    productRow('FIREPLACE-01', 'Камины', 'Портал', 40000, 60000, 30000),
    productRow('FIREPLACE-02', 'Камины', 'Облицовка короба', 40000, 60000, 30000),
    productRow('FIREPLACE-03', 'Камины', 'Подиум', 25000, 30000, 20000),
  ];

  // Подступенки -- одна ставка на все лестницы и ступени (м² подступенков).
  const RISER_RATES = { id: 'RISER-00', fabricationRatePerM2: 5000, installationRatePerM2: 5000, polishRatePerM2: null };

  // «Доп. работы и элементы столешницы». `rate` -- работа, `installRate` -- колонка
  // «Монтаж» (null там, где у компании «-»). CUT-03 -- в м.п. (длина раковины).
  const ADDITIONAL_WORKS = [
    { id: 'CUT-01', group: 'Вырезы', operation: 'Раковина', variant: 'Накладная', unit: 'шт.', rate: 8000, installRate: null },
    { id: 'CUT-02', group: 'Вырезы', operation: 'Раковина', variant: 'Подстольная', unit: 'шт.', rate: 20000, installRate: null },
    { id: 'CUT-03', group: 'Вырезы', operation: 'Раковина', variant: 'Интегрированная', unit: 'м.п.', rate: 70000, installRate: null },
    { id: 'CUT-04', group: 'Вырезы', operation: 'Варочная панель', variant: 'Вырез', unit: 'шт.', rate: 6000, installRate: null },
    { id: 'CUT-05', group: 'Отверстия', operation: 'Смеситель', variant: 'Отверстие', unit: 'шт.', rate: 1500, installRate: null },
    { id: 'CUT-06', group: 'Отверстия', operation: 'Розетка', variant: 'Отверстие', unit: 'шт.', rate: 1000, installRate: null },
    { id: 'CUT-07', group: 'Отверстия', operation: 'Дозатор', variant: 'Отверстие', unit: 'шт.', rate: 1000, installRate: null },
    { id: 'EDGE-01', group: 'Кромка', operation: 'Кромка', variant: 'Прямая', unit: 'м.п.', rate: 5000, installRate: null },
    { id: 'EDGE-03', group: 'Кромка', operation: 'Кромка', variant: 'Фигурная / сложная', unit: 'м.п.', rate: 20000, installRate: null },
    { id: 'EDGE-04', group: 'Кромка', operation: 'Скругление', variant: 'Радиус / профиль', unit: 'м.п.', rate: 10000, installRate: null },
    { id: 'EDGE-05', group: 'Кромка', operation: 'Фаска', variant: '', unit: 'м.п.', rate: 1000, installRate: null },
    { id: 'EDGE-06', group: 'Кромка', operation: 'Подгиб камнем', variant: 'Склейка 45°', unit: 'м.п.', rate: 15000, installRate: null },
    { id: 'EXTRA-01', group: 'Дополнительно', operation: 'Бортик', variant: '', unit: 'м.п.', rate: 25000, installRate: null },
    { id: 'EXTRA-02', group: 'Дополнительно', operation: 'Фартук', variant: '', unit: 'м²', rate: 15000, installRate: 18000 },
    { id: 'EXTRA-03', group: 'Дополнительно', operation: 'Стеновая панель', variant: '', unit: 'м²', rate: 15000, installRate: 20000 },
    { id: 'EXTRA-04', group: 'Дополнительно', operation: 'Остров', variant: 'Прямоугольный', unit: 'м²', rate: 40000, installRate: 50000 },
    { id: 'EXTRA-05', group: 'Дополнительно', operation: 'Остров', variant: 'Фигурный / радиусный', unit: 'м²', rate: 60000, installRate: 50000 },
    { id: 'EXTRA-06', group: 'Дополнительно', operation: 'Барная стойка', variant: 'Стандартная', unit: 'м²', rate: 40000, installRate: 50000 },
    { id: 'EXTRA-07', group: 'Дополнительно', operation: 'Барная стойка', variant: 'Сложная', unit: 'м²', rate: 60000, installRate: 50000 },
    { id: 'SEAM-01', group: 'Швы', operation: 'Переполировка шва столешницы', variant: '±50 см от шва', unit: 'шт.', rate: 25000, installRate: null },
    { id: 'LIGHT-01', group: 'Подсветка', operation: 'Подсветка камня', variant: 'Матричная, с диммированием и блоками питания', unit: 'м²', rate: 110000, installRate: null },
  ];

  // «Прочее». MISC-03 (доставка за город, ₽/км) и MISC-08 (общая наценка 0%) не подключаются.
  const MISC = {
    measure: 15000,              // MISC-01: замер на объекте -- по желанию клиента
    delivery: 12000,             // MISC-02: доставка -- по желанию клиента
    unloadingPerM2: 3500,        // MISC-04: разгрузка и подъём, ₽/м² изделия
    consumablesPerM2: 2500,      // MISC-05: расходные материалы, ₽/м² изделия
    complexShapeMultiplier: 1.5, // MISC-06: сложная форма, +50% к изготовлению
    minOrder: 20000,             // MISC-07: минимальный заказ, ₽ (итог меньше -- берётся эта сумма)
  };

  // Коэффициент вида камня (только к изготовлению). Ключ -- поле `category` камня из
  // data/slabs.json; вид без коэффициента компании (и любой новый) -- молча ×1.
  const STONE_COEFFICIENTS = {
    'marble': 1,
    'travertin': 1,
    'granite': 1.3,
    'quartz-agglomerate': 1.3,
    'oniks': 1.5,
    'quartzite': 2,
    'agate': 3,
    'kvarc': 2,
    'labradorite': 2,
    'limestone': 1,
    'specennyi-kamen': 1.3,
    'petrified-wood': 1.3,
    'artificial-marble': 1,
    'obsidian': 2,
    'soapstone': 2,
  };

  // Форма столешницы -> строка каталога (у столешниц тип выбирается на шаге «Форма»).
  const COUNTERTOP_TYPE_IDS = {
    stoleshnitsa_kuhnya: { straight: 'KITCHEN-11', lshape: 'KITCHEN-12', ushape: 'KITCHEN-13' },
    stoleshnitsa_vannaya: { straight: 'BATH-01', lshape: 'BATH-02', ushape: 'BATH-03' },
  };

  function hasOwn(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
  }

  function getSubcategoriesForProduct(categoryLabel) {
    return PRODUCT_SUBCATEGORIES.filter(row => row.categoryLabel === categoryLabel);
  }

  function getProductRates(id) {
    const row = PRODUCT_SUBCATEGORIES.find(r => r.id === id);
    if (!row) return null;
    return {
      fabricationRatePerM2: row.fabricationRatePerM2,
      installationRatePerM2: row.installationRatePerM2,
      polishRatePerM2: row.polishRatePerM2,
    };
  }

  function hasPolishRate(id) {
    const rates = getProductRates(id);
    return !!rates && Number.isFinite(rates.polishRatePerM2);
  }

  function countertopTypeId(productKey, shape) {
    const byShape = hasOwn(COUNTERTOP_TYPE_IDS, productKey) ? COUNTERTOP_TYPE_IDS[productKey] : null;
    return byShape && hasOwn(byShape, shape) ? byShape[shape] : null;
  }

  function getAdditionalWorkRate(id) {
    const row = ADDITIONAL_WORKS.find(r => r.id === id);
    return row ? row.rate : null;
  }

  function getAdditionalWorkInstallRate(id) {
    const row = ADDITIONAL_WORKS.find(r => r.id === id);
    return row ? row.installRate : null;
  }

  function stoneCoefficient(category) {
    return typeof category === 'string' && hasOwn(STONE_COEFFICIENTS, category) ? STONE_COEFFICIENTS[category] : 1;
  }

  return {
    PRODUCT_SUBCATEGORIES, getSubcategoriesForProduct,
    getProductRates, hasPolishRate, countertopTypeId, RISER_RATES,
    ADDITIONAL_WORKS, getAdditionalWorkRate, getAdditionalWorkInstallRate,
    MISC, STONE_COEFFICIENTS, stoneCoefficient,
  };
});
