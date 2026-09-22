// step-engine.js
//
// Adaptive Step Engine: a thin orchestration layer over the existing
// constructor state / pricing / geometry-model / three-scene pipeline. It
// owns exactly one thing -- "which single configuration step is currently
// open, and what comes before/after it for THIS product" -- and nothing
// else. It never reads DOM, never touches ConstructorState/pricing/geometry,
// and never decides whether a field's VALUE is valid (that stays with the
// existing per-field logic in sayanmramor-calculator.html); it only answers
// pure "given a product and a step, what step is next/first/last/valid"
// questions so the UI has one place to ask instead of scattering
// if(product===...) chains through the page.
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.StepEngine = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {

  // Единственный источник порядка шагов адаптивного конфигуратора для
  // каждого продукта. Это АВТОРСКАЯ таблица, а не производная от
  // product-types.js capability-флагов (supportsShapeSelection и т.д.) --
  // те флаги решают другой вопрос ("показывать ли конкретное ПОЛЕ и
  // учитывать ли его в pricing/geometry"), а не "в каком порядке идут шаги
  // мастера". Сегодня оба вопроса дают один и тот же ответ для каждого
  // продукта (см. комментарии по каждому ключу ниже), но это совпадение, а
  // не тождество -- добавить, например, 'shape' подоконнику в будущем можно
  // будет, просто дописав его сюда, без изменения capability-флагов, если
  // потребуется отдельный шаг без реальной геометрии формы.
  //
  // 'review' явно входит в каждый список (не подставляется автоматически)
  // -- так весь порядок шагов продукта виден целиком в одном месте, без
  // скрытого постпроцессинга; getSteps() ничего не добавляет и не убирает.
  //
  // 'options' (существующий шаг "Опции" -- сложная форма/доп.полировка/
  // монтаж) включён для всех сегодняшних продуктов, потому что calculate()
  // читает все три чекбокса безусловно, для любого выбранного продукта (см.
  // sayanmramor-calculator.html, ConstructorState.buildPricingInputs) -- то
  // есть шаг НИКОГДА не пуст сегодня ни для одного продукта. Это не
  // "универсальный шаг по умолчанию": если бы calculate() гейтил эти поля
  // capability-флагом для какого-то продукта, для него 'options' сюда бы не
  // попал.
  const PRODUCT_STEPS = {
    // Столешницы: форма (прямая/Г-образная) -- самостоятельный шаг с
    // реальной геометрией (supportsShapeSelection), плюс кромка и
    // дополнительные позиции (вырезы/отверстия/бортик/фартук/остров/...).
    stoleshnitsa_kuhnya:  ['shape', 'dimensions', 'material', 'edge', 'additionalWorks', 'options', 'review'],
    stoleshnitsa_vannaya: ['shape', 'dimensions', 'material', 'edge', 'additionalWorks', 'options', 'review'],
    // Подоконник/ступени/лестница: сегодня поддерживают только кромку
    // (supportsEdgeWork) -- ни выбора формы, ни доп.позиций у них в
    // constructor-state/geometry нет, поэтому эти шаги для них не заявлены.
    podokonnik: ['dimensions', 'material', 'edge', 'options', 'review'],
    stupeni:    ['dimensions', 'material', 'edge', 'options', 'review'],
    lestnitsa:  ['dimensions', 'material', 'edge', 'options', 'review'],
    // Панно/пол/стена/фасад: ни формы, ни кромки, ни доп.позиций сегодня не
    // поддерживают -- только размеры, материал и опции.
    panno: ['dimensions', 'material', 'options', 'review'],
    pol:   ['dimensions', 'material', 'options', 'review'],
    stena: ['dimensions', 'material', 'options', 'review'],
    fasad: ['dimensions', 'material', 'options', 'review'],
  };

  // Человекочитаемые подписи для прогресса -- UI не должен сам решать, как
  // назвать шаг по его id.
  const STEP_LABELS = {
    shape: 'Форма',
    dimensions: 'Размеры',
    material: 'Материал',
    edge: 'Кромка',
    additionalWorks: 'Доп. работы',
    options: 'Опции',
    review: 'Проверка',
  };

  // Продукт без записи в PRODUCT_STEPS (или ключ null/undefined -- ничего
  // ещё не выбрано) безопасно даёт пустой список, а не throw/undefined --
  // тот же принцип, что у hasAdditionalWork() в product-types.js.
  function getSteps(productKey) {
    return (productKey && PRODUCT_STEPS[productKey]) ? PRODUCT_STEPS[productKey].slice() : [];
  }

  function stepIndex(productKey, stepId) {
    return getSteps(productKey).indexOf(stepId);
  }

  function firstStep(productKey) {
    const steps = getSteps(productKey);
    return steps.length ? steps[0] : null;
  }

  function lastStep(productKey) {
    const steps = getSteps(productKey);
    return steps.length ? steps[steps.length - 1] : null;
  }

  function isFirstStep(productKey, stepId) {
    return !!stepId && stepIndex(productKey, stepId) === 0;
  }

  function isLastStep(productKey, stepId) {
    const steps = getSteps(productKey);
    return !!stepId && steps.length > 0 && stepIndex(productKey, stepId) === steps.length - 1;
  }

  function nextStep(productKey, currentStepId) {
    const steps = getSteps(productKey);
    const i = steps.indexOf(currentStepId);
    if (i === -1 || i >= steps.length - 1) return null;
    return steps[i + 1];
  }

  function previousStep(productKey, currentStepId) {
    const steps = getSteps(productKey);
    const i = steps.indexOf(currentStepId);
    if (i <= 0) return null;
    return steps[i - 1];
  }

  function isValidStepId(productKey, stepId) {
    return stepIndex(productKey, stepId) !== -1;
  }

  // Отвечает "на каком шаге должен оказаться конфигуратор для этого
  // продукта", учитывая желаемый шаг (обычно -- currentStepId ДО этого
  // вызова). Если желаемый шаг не передан (или это шаг из списка ДРУГОГО
  // продукта, которого нет в текущем списке) -- первый шаг продукта. Один и
  // тот же вызов покрывает оба случая, которые раньше требовали бы двух
  // разных функций:
  //   - смена продукта: вызывающий код передаёт desiredStepId = null,
  //     сознательно НЕ перенося старый шаг -- получаем первый шаг нового
  //     продукта;
  //   - любой другой пересчёт (ввод размеров, выбор камня и т.п.): вызывающий
  //     код передаёт ТЕКУЩИЙ currentStepId как желаемый -- если он всё ещё
  //     валиден для продукта (обычно да, продукт не менялся), state/шаг не
  //     трогается, только перерисовывается.
  function resolveCurrentStep(productKey, desiredStepId) {
    const steps = getSteps(productKey);
    if (!steps.length) return null;
    if (desiredStepId && steps.indexOf(desiredStepId) !== -1) return desiredStepId;
    return steps[0];
  }

  // canAdvance -- чистая функция: сама НЕ знает, валидны ли данные текущего
  // шага (это решает constructor-state/DOM снаружи, см. §9 задачи) --
  // принимает готовый булев результат и решает только "есть ли вообще куда
  // идти дальше и не запрещает ли валидность". Проверяется ТОЛЬКО текущий
  // шаг, а не вся форма целиком -- на последующих шагах Step Engine ничего
  // не знает и знать не должен.
  function canAdvance(productKey, currentStepId, isCurrentStepValid) {
    return nextStep(productKey, currentStepId) !== null && isCurrentStepValid !== false;
  }

  // Готовый к отрисовке список шагов с позицией (1-based, для номера-бэйджа)
  // и флагами active/done -- UI просто маппит это в разметку, никакой
  // логики прогресса в HTML не остаётся.
  function buildProgress(productKey, currentStepId) {
    const steps = getSteps(productKey);
    const currentIndex = steps.indexOf(currentStepId);
    return steps.map((id, i) => ({
      id,
      label: STEP_LABELS[id] || id,
      position: i + 1,
      active: i === currentIndex,
      done: currentIndex !== -1 && i < currentIndex,
    }));
  }

  return {
    PRODUCT_STEPS, STEP_LABELS,
    getSteps, stepIndex, firstStep, lastStep,
    isFirstStep, isLastStep, nextStep, previousStep,
    isValidStepId, resolveCurrentStep, canAdvance, buildProgress,
  };
});
