(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.ProductTypes = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {

  const PRODUCTS = {
    lestnitsa:            { label: "Лестницы", type: 'B', supportsEdgeWork: true },
    panno:                { label: "Панно", type: 'B' },
    podokonnik:           { label: "Подоконники", type: 'A', supportsEdgeWork: true },
    pol:                  { label: "Полы", type: 'B' },
    stena:                { label: "Стены", type: 'B' },
    fasad:                { label: "Фасады", type: 'B' },
    // additionalWorks: тонкая доступность конкретных доп. работ столешницы --
    // отсутствие объекта (как у всех остальных изделий выше/ниже) через
    // hasAdditionalWork() всегда безопасно читается как "всё false", так что
    // ни одно изделие без него не может случайно получить доступную работу.
    stoleshnitsa_vannaya: {
      label: "Столешницы в ванную", type: 'A',
      supportsEdgeWork: true,
      supportsCountertopExtras: true,
      additionalWorks: {
        sinkCutout: true, cooktopCutout: false, holes: true,
        curb: true, backsplash: true, wallPanel: true,
        island: false, barCounter: false
      }
    },
    // TODO: кухонные столешницы нуждаются в отдельной фильтрации камня по
    // устойчивости к мех./хим. воздействиям (нож, вино и т.д.) — не весь
    // камень из общего каталога годится для кухни. Фильтрации пока нет,
    // добавим отдельным шагом, когда определим критерий классификации камня.
    stoleshnitsa_kuhnya:  {
      label: "Столешницы на кухню", type: 'A',
      supportsEdgeWork: true,
      supportsCountertopExtras: true,
      additionalWorks: {
        sinkCutout: true, cooktopCutout: true, holes: true,
        curb: true, backsplash: true, wallPanel: true,
        island: true, barCounter: true
      }
    },
    stupeni:              { label: "Ступени", type: 'A', supportsEdgeWork: true }
  };

  // Единая точка чтения additionalWorks -- отсутствие объекта или неизвестный
  // ключ всегда безопасно дают false, а не undefined/throw. Используется и
  // тестами, и sayanmramor-calculator.html, чтобы это правило не могло
  // разойтись между местами, где оно проверяется.
  function hasAdditionalWork(product, capability) {
    return !!(product && product.additionalWorks && product.additionalWorks[capability]);
  }

  const SAW_MARGIN_CM = 4;       // запас на распил с каждого края
  const AREA_WASTE_FACTOR = 1.3; // на подрезку/подгонку швов и брак (тип B)

  // Ставки работы ₽/м², заменяют старую формулу
  // subtotal × WORK_MULTIPLIER × HARDNESS_WORK_MULTIPLIER × complexityMultiplier.
  // Разбор 11 реальных коммерческих предложений показал, что изготовление и
  // монтаж в компании считаются как фиксированная ставка за м² (почти не
  // зависящая от цены камня), а не как множитель на стоимость камня — см.
  // docs/superpowers/specs/2026-09-17-work-cost-pricing-redesign-design.md.
  //
  // Каждая запись помечена источником:
  //   РЕАЛЬНОЕ  — взято непосредственно из разобранного КП.
  //   ОЦЕНКА    — прямых данных нет; посчитано как соответствующая ставка
  //               столешницы × прежний complexityMultiplier этого типа
  //               (значение множителя сохранено в комментарии для
  //               прослеживаемости). Уточнить, когда появятся реальные
  //               заказы по этому типу изделия.
  //
  // ⚠️ ВНИМАНИЕ: метод экстраполяции (ставка столешницы × прежний
  // complexityMultiplier) проверен на реальных данных только один раз — на
  // типе "pol", у которого прежний complexityMultiplier был ровно 1.0. Эта
  // единственная проверка показывает, что метод НЕНАДЁЖЕН: он предсказал бы
  // fabricationRatePerM2 = 37500 для "pol", а реальное КП даёт 3600 —
  // расхождение в 10.4 раза. Installation расходится в 1.8 раза в ту же
  // сторону (метод завышает). При этом для "stena" реальная installation
  // (25000) расходится с методом уже в ОБРАТНУЮ сторону — метод предсказал
  // бы ~19250 (метод занижает). То есть ошибка не только большая, но и
  // непредсказуема по знаку. Вывод: каждая запись с пометкой ОЦЕНКА
  // (panno, lestnitsa, fasad, stupeni, podokonnik, а также оценочная часть
  // fabricationRatePerM2 у stena) — это грубая заглушка, а не число, на
  // которое можно полагаться. Это должно быть в начале списка "что
  // проверить в первую очередь", когда будут разобраны следующие КП.
  const WORK_RATES = {
    // РЕАЛЬНЫЕ КП (7 шт.): диапазон изготовления 30 000-65 000 ₽/м² в
    // зависимости от камня и сложности выреза — единой зависимости от
    // hardness_category не найдено (травертин, category 1, дал одну из
    // самых высоких ставок из-за пор в камне, а не из-за твёрдости).
    // По решению пользователя взято усреднённое значение без разбивки по
    // материалу. ТРЕБУЕТ УТОЧНЕНИЯ при разборе оставшихся 3-4 КП.
    stoleshnitsa_kuhnya:  { fabricationRatePerM2: 37500, installationRatePerM2: 17500, polishRatePerM2: 18000 /* ОЦЕНКА: нет своих данных по полировке столешниц, взята ставка пола/стен */ },
    stoleshnitsa_vannaya: { fabricationRatePerM2: 37500, installationRatePerM2: 17500, polishRatePerM2: 18000 /* тот же источник и та же оговорка */ },

    // РЕАЛЬНОЕ: обычный пол без герба, из КП «панно-герб».
    pol: { fabricationRatePerM2: 3600, installationRatePerM2: 9600, polishRatePerM2: 18000 },

    // ЧАСТИЧНО РЕАЛЬНОЕ: санузел. installationRatePerM2/polishRatePerM2 —
    // из КП (там была одна позиция монтаж+переполировка = 45000, разложена
    // на 25000/20000). fabricationRatePerM2 — ОЦЕНКА: 37500 × 1.1 (прежний
    // complexityMultiplier типа "stena"); в КП изготовление стен санузла
    // шло одной общей позицией без отдельной разбивки.
    stena: { fabricationRatePerM2: 41250, installationRatePerM2: 25000, polishRatePerM2: 20000 },

    // ОЦЕНКА целиком: 37500/17500/18000 × 1.6 (прежний complexityMultiplier
    // типа "panno"). Реальный КП по панно есть, но это крайний случай —
    // гидроабразивная резка герба, 510 000 ₽/м² — НЕ берём как типовую
    // ставку, это пример верхней границы сложности, не рабочее число:
    // panno_extreme_example_rub_per_m2 = 510000 (герб, гидроабразивная резка)
    panno: { fabricationRatePerM2: 60000, installationRatePerM2: 28000, polishRatePerM2: 28800 },

    // ОЦЕНКИ целиком, данных нет вообще — соответствующая ставка столешницы
    // × прежний complexityMultiplier каждого типа.
    lestnitsa:  { fabricationRatePerM2: 67500, installationRatePerM2: 31500, polishRatePerM2: 32400 }, // × 1.8
    fasad:      { fabricationRatePerM2: 48750, installationRatePerM2: 22750, polishRatePerM2: 23400 }, // × 1.3
    stupeni:    { fabricationRatePerM2: 52500, installationRatePerM2: 24500, polishRatePerM2: 25200 }, // × 1.4
    podokonnik: { fabricationRatePerM2: 30000, installationRatePerM2: 14000, polishRatePerM2: 14400 }  // × 0.8
  };

  // "Прочее" (замер/доставка/расходники/разгрузка) — ни один из 7
  // разобранных КП не даёт эти суммы отдельно от камня и работы. Известно
  // только, что "прочее" — 15-25% от суммы КП и что оно неоднородно
  // (замер и один рейс доставки — фиксированная часть; расходники и
  // разгрузка — растущая с площадью часть). Осознанно оставлено `null`, а
  // не подставлено случайным числом на глаз — `computeWorkAndTotal`
  // трактует `null` как 0, то есть "прочее" пока честно не учитывается в
  // цене. ТРЕБУЕТ ЗАПОЛНЕНИЯ, когда появятся построчные данные.
  const MISC_FLAT_SUM = null;
  const MISC_RATE_PER_M2 = null;

  // ОЦЕНКА по одному наблюдению: остров с вырезом под мойку/варочную
  // панель дал 35 000 → 95 000 ₽/м² изготовление (≈×2.7), но это самый
  // сложный из виденных случаев, а не типичная "сложная форма". Берём
  // более умеренную оценку до появления второго наблюдения.
  const COMPLEX_SHAPE_MULTIPLIER = 1.5;

  // Ставки для доп. позиций столешницы (бортик/фартук/остров). Ни один из
  // 7 разобранных КП не даёт эти суммы отдельной строкой от базовой
  // столешницы (в Tundra Grey бортик+остров учтены одной суммой внутри
  // "изготовления" — 135300 ₽ на 5.32 м², что уже превышает ставку
  // столешницы 37500 ₽/м² почти вдвое, если считать всё как одну
  // столешницу). ТРЕБУЕТ ЗАПОЛНЕНИЯ реальными данными, когда появится
  // КП с этими позициями, выделенными отдельно.
  const COUNTERTOP_EXTRAS_RATES = {
    bortikRatePerM: null,
    fartukRatePerM2: null,
    ostrovRatePerM2: null
  };

  return {
    PRODUCTS, hasAdditionalWork, SAW_MARGIN_CM, AREA_WASTE_FACTOR,
    WORK_RATES, MISC_FLAT_SUM, MISC_RATE_PER_M2, COMPLEX_SHAPE_MULTIPLIER,
    COUNTERTOP_EXTRAS_RATES
  };
});
