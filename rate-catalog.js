(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.RateCatalog = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {

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

    { id: 'BATH-01', categoryLabel: 'Столешницы в ванную', shape: 'Прямая', variant: 'Без раковины', unit: 'м²', rate: null, currency: null },
    { id: 'BATH-02', categoryLabel: 'Столешницы в ванную', shape: 'Угловая', variant: 'Без раковины', unit: 'м²', rate: null, currency: null },
    { id: 'BATH-03', categoryLabel: 'Столешницы в ванную', shape: 'П-образная', variant: 'Без раковины', unit: 'м²', rate: null, currency: null },
    { id: 'BATH-04', categoryLabel: 'Столешницы в ванную', shape: 'Фигурная', variant: 'Без раковины', unit: 'м²', rate: null, currency: null },

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

  function getSubcategoriesForProduct(categoryLabel) {
    return PRODUCT_SUBCATEGORIES.filter(row => row.categoryLabel === categoryLabel);
  }

  return {
    PRODUCT_SUBCATEGORIES, getSubcategoriesForProduct,
  };
});
