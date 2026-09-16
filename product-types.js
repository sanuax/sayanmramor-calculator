(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.ProductTypes = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {

  const PRODUCTS = {
    lestnitsa:            { label: "Лестницы", complexityMultiplier: 1.8, type: 'B' },
    panno:                { label: "Панно", complexityMultiplier: 1.6, type: 'B' },
    podokonnik:           { label: "Подоконники", complexityMultiplier: 0.8, type: 'A' },
    pol:                  { label: "Полы", complexityMultiplier: 1.0, type: 'B' },
    stena:                { label: "Стены", complexityMultiplier: 1.1, type: 'B' },
    fasad:                { label: "Фасады", complexityMultiplier: 1.3, type: 'B' },
    stoleshnitsa_vannaya: { label: "Столешницы в ванную", complexityMultiplier: 0.9, type: 'A' },
    // TODO: кухонные столешницы нуждаются в отдельной фильтрации камня по
    // устойчивости к мех./хим. воздействиям (нож, вино и т.д.) — не весь
    // камень из общего каталога годится для кухни. Фильтрации пока нет,
    // добавим отдельным шагом, когда определим критерий классификации камня.
    stoleshnitsa_kuhnya:  { label: "Столешницы на кухню", complexityMultiplier: 1.15, type: 'A' },
    stupeni:              { label: "Ступени", complexityMultiplier: 1.4, type: 'A' }
  };

  const SAW_MARGIN_CM = 4;       // запас на распил с каждого края
  const AREA_WASTE_FACTOR = 1.3; // на подрезку/подгонку швов и брак (тип B)
  const WORK_MULTIPLIER = 2;     // работа (обработка+распил+маржа) = subtotal × это число

  // Множитель работы по категории твёрдости камня — используется вместо
  // WORK_MULTIPLIER, когда для камня известен hardness_category. Пока это
  // условные значения до того, как появятся реальные данные по стоимости
  // заказов; категория 1 намеренно совпадает с WORK_MULTIPLIER, чтобы
  // сегодняшние цены на лёгкий камень не менялись. Камни без
  // hardness_category (ещё не пересканированы после добавления этого поля,
  // либо тип камня не попал в маппинг) откатываются на WORK_MULTIPLIER — цена
  // для них не меняется в любом случае.
  const HARDNESS_WORK_MULTIPLIER = { 1: WORK_MULTIPLIER, 2: 2.3, 3: 2.8 };

  const OPTION_SURCHARGE = {
    complex: 0.25,   // +25% за сложную форму
    polish: 0.10,    // +10% за доп. полировку
    install: 0.15    // +15% за монтаж
  };

  return { PRODUCTS, SAW_MARGIN_CM, AREA_WASTE_FACTOR, WORK_MULTIPLIER, HARDNESS_WORK_MULTIPLIER, OPTION_SURCHARGE };
});
