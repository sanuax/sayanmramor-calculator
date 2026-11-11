(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.ProductTypes = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {

  // cameraPreset: НЕ ценообразующее поле -- имя стартового ракурса 3D-камеры
  // для этого типа изделия (см. visualizer/constants.js: CAMERA_PRESETS и
  // docs/superpowers/specs/2026-09-21-3d-visualizer-design.md, раздел
  // "Per-product-type default camera preset"). Кнопки Сверху/Спереди/Сбоку/
  // Изометрия остаются доступны всегда -- это только то, что показывается
  // по умолчанию и куда возвращает "Сбросить вид".
  const PRODUCTS = {
    lestnitsa:            { label: "Лестницы", type: 'B', supportsEdgeWork: true, cameraPreset: 'iso-side-high' },
    panno:                { label: "Панно", type: 'B', cameraPreset: 'front' },
    podokonnik:           { label: "Подоконники", type: 'A', supportsEdgeWork: true, cameraPreset: 'front-high' },
    pol:                  { label: "Полы", type: 'B', cameraPreset: 'top' },
    stena:                { label: "Стены", type: 'B', cameraPreset: 'front' },
    fasad:                { label: "Фасады", type: 'B', cameraPreset: 'front' },
    // additionalWorks: тонкая доступность конкретных доп. работ столешницы --
    // отсутствие объекта (как у всех остальных изделий выше/ниже) через
    // hasAdditionalWork() всегда безопасно читается как "всё false", так что
    // ни одно изделие без него не может случайно получить доступную работу.
    stoleshnitsa_vannaya: {
      label: "Столешницы в ванную", type: 'A',
      supportsEdgeWork: true,
      supportsCountertopExtras: true,
      // supportsShapeSelection: выбор формы (прямая/Г/П). Крылья -- детали
      // изделия: их площадь входит в площадь и цену, а раскрой идёт по
      // реальным деталям со швом к основному сегменту (product-parts.js).
      supportsShapeSelection: true,
      // UX-аудит: "Вариант исполнения" (BATH-01..04) дублирует реальный шаг
      // "Форма" (Прямая/Г-образная) и дополнительно предлагает
      // "П-образная"/"Фигурная", которых не существует ни в state, ни в
      // geometry. См. product-types.js:stoleshnitsa_kuhnya для того же
      // фикса. PRODUCT_SUBCATEGORIES/BATH-01..04 не трогаются -- это
      // заготовка будущей ценовой модели, просто больше не показывается
      // клиенту как шаг выбора для этого продукта.
      hideVariantStep: true,
      cameraPreset: 'iso-high',
      additionalWorks: {
        sinkCutout: true, cooktopCutout: false, holes: true,
        curb: true, backsplash: true, wallPanel: true,
        island: false, barCounter: false
      }
    },
    stoleshnitsa_kuhnya:  {
      label: "Столешницы на кухню", type: 'A',
      supportsEdgeWork: true,
      supportsCountertopExtras: true,
      supportsShapeSelection: true,
      // UX-аудит показал: этот шаг для кухонных столешниц не влияет ни на
      // geometry, ни на pricing, ни на состав доп.работ -- реальную форму
      // задаёт шаг "Форма" (straight/lshape), а "Остров"/"Барная стойка"
      // здесь дублируют одноимённые объекты, уже настраиваемые отдельно в
      // "Дополнительных позициях". Старые KITCHEN-01..05 удалены из каталога (rate-catalog.js, таблица v2);
      // тип столешницы -- её форма (KITCHEN-11..13 / BATH-01..03), а остров и
      // барная стойка -- EXTRA-04..07. Шаг выбора варианта клиенту не показывается.
      hideVariantStep: true,
      cameraPreset: 'iso-eye-level',
      additionalWorks: {
        sinkCutout: true, cooktopCutout: true, holes: true,
        curb: true, backsplash: true, wallPanel: true,
        island: true, barCounter: true
      }
    },
    stupeni:              { label: "Ступени", type: 'A', supportsEdgeWork: true, cameraPreset: 'iso-side-high' },
    // «Камины» (fireplace-model.js): портал (с полкой / без полки), облицовка
    // каминного короба, подиум -- each with its own sizes, always one piece;
    // cut as the stone plates of GeometryModel.fireplacePlan (product-parts.js).
    // No edge work and no countertop extras; the «Опции» step is the one every
    // product has (сложная форма, доп. полировка, монтаж -- FIREPLACE-01..03 in rate-catalog.js).
    // showroom: false -- the site's 3D showroom has no fireplace, so there
    // is no «в шоурум» link for one (url-bootstrap.js).
    kaminy:               { label: "Камины", type: 'A', cameraPreset: 'front', showroom: false }
  };

  // Единая точка чтения additionalWorks -- отсутствие объекта или неизвестный
  // ключ всегда безопасно дают false, а не undefined/throw. Используется и
  // тестами, и sayanmramor-calculator.html, чтобы это правило не могло
  // разойтись между местами, где оно проверяется.
  function hasAdditionalWork(product, capability) {
    return !!(product && product.additionalWorks && product.additionalWorks[capability]);
  }

  const SAW_MARGIN_CM = 4;       // запас на распил с каждого края детали
  // Запас материала 35%: изделие занимает не больше 65% площади каждого
  // слэба, из которого его режут (утверждённое правило компании). Какие
  // слэбы нужны, решает реальный раскрой деталей (pricing.js planMaterial),
  // а не деление площади на 0.65; этот предел -- ограничение на каждый слэб.
  // Заменяет прежний коэффициент отходов 1.3 для облицовки (тип B).
  const SLAB_USAGE_LIMIT = 0.65;

  // Ставки работы, сложная форма и «Прочее» -- только в rate-catalog.js
  // (таблица компании v2): ConstructorState.buildPricingInputs берёт ставку
  // выбранного типа оттуда.

  return {
    PRODUCTS, hasAdditionalWork, SAW_MARGIN_CM, SLAB_USAGE_LIMIT
  };
});
