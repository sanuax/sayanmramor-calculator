# Sayan Mramor — Start Here

Короткая шпаргалка. Полная версия — `CLAUDE_HANDOFF.md` рядом, одинаковая в обоих репозиториях.

## Где находятся проекты

- `D:\sayanmramor-site` — сайт-каталог + 3D-шоурум. Git `sanuax/sayanmramor-site`, ветка `master`.
- `D:\calculator\.worktrees\rate-catalog-subcategories` — **актуальный калькулятор с 3D**. Git `sanuax/sayanmramor-calculator`, ветка `rate-catalog-subcategories`; других веток на GitHub нет.
- `D:\calculator` — **старый master-checkout (без 3D), не использовать.**
- `D:\photo_marble` — архив фото + инструменты отбора (не git).

## Что это за проект

Изделия из натурального камня на заказ: столешницы, лестницы, ступени, полы, стены, панно, подоконники, фасады. Клиент выбирает камень поставщика Venezia Stone, собирает изделие в конфигураторе с 3D-моделью и получает ориентировочную цену.

## Как устроен сайт

Статический HTML/CSS/JS без сборки:

- главная;
- 9 страниц категорий: портфолио-плейсхолдер + галерея камня + CTA в конфигуратор;
- `katalog.html` — готовые изделия (`data/products.json`, 3 заглушки: светильник, стол, ракушка);
- `showroom.html` — 3D-дом.

С калькулятором связан **только** URL `/calculator/sayanmramor-calculator.html?product=<key>&stone=<id>` и чтением `/calculator/data/slabs.json`. Локально — `python D:\sayanmramor-site\scripts\dev_server.py`, затем `http://localhost:8000/`.

## Как устроен калькулятор

- `sayanmramor-calculator.html` — шаги из `step-engine.js`, большой встроенный JS.
- `product-types.js` — 9 `PRODUCTS`, capability flags, `WORK_RATES`.
- `pricing.js` — раскрой на реальных слэбах, запас 35%.
- `product-parts.js`, `constructor-state.js` — детали изделия и единое состояние.
- `rate-catalog.js` — строки ставок, все `null`, только UI.
- `material-picker.js` — фильтры страна/тип/цвет.
- `facade-model.js` — фасады.

## Как устроен 3D

three.js r160:

```
ввод (мм) → ConstructorState → GeometryModel (visualizer/geometry-model.js)
→ SceneLayout → ThreeScene.update (visualizer/three-scene.js)
```

- Камера — `camera-framing.js`, пресеты в `constants.js`.
- Материал — `material-adapter.js`: фото камня как один большой кусок, зеркальный bookmatch, не плитка.
- Цена считается по той же геометрии.

## Где данные материалов

`<калькулятор>\data\slabs.json` (891 камень, 28 334 слэба с ценами) + `data\images\` — **не в git**. Парсер — `scripts\scrape_slabs.py` (Playwright), данные от 15.09.

## Где цены

- `product-types.js` → `WORK_RATES`: реальные только у столешниц, пола и частично стен, остальное — оценки.
- Логика — `docs\pricing-logic.md`.
- Таблица для компании — `D:\calculator\Ставки_для_калькулятора.xlsx`: пустая, не в git.
- `null` = не задано, фиктивных ставок не делать.

## Где фотографии

- `D:\photo_marble\Мрамор все фото.zip` — 352 JPG, не распаковывать.
- Решения пользователя: `photo_review_state.json` (201 KEEP / 150 REJECT) и `photo_keep.csv` (201 строка).
- Инструмент отбора: `python review_server.py`, затем `http://127.0.0.1:8003/photo_review.html`.
- Механизма «фото из архива → сайт» ещё нет. Есть только `data/portfolio.json` и `data/products.json` в сайте.

## Что уже сделано

- 3D-конфигуратор всех 9 изделий.
- Цена по раскрою.
- Шоурум (оптимизирован без потери качества).
- Инвентаризация фото V3.2 + аудит.
- Визуальный отбор 351 из 352 фото.

## Что сейчас НЕ ТРОГАТЬ

- ZIP и CSV V3.2;
- `slabs.json`;
- структуру ставок;
- master-checkout `D:\calculator`;
- качество шоурума;
- алгоритм материалов: V3.3 и aliases не делать;
- фото не перемещать и не переименовывать.

Push и commit — только по явной просьбе пользователя.

## Главная следующая задача

Классифицировать 201 отобранное фото (`photo_keep.csv`) по реальной архитектуре сайта. Для каждого фото отдельно определить:

- категорию сайта;
- портфолио продукта;
- готовое изделие;
- «не для каталога».

Категория фото ≠ категория калькулятора ≠ 3D. Камины на сайте пока отсутствуют — это решение пользователя.

## Ключевые файлы

- **Сайт:** `js/showroom/showroom-data.js` (product keys, URL), `js/category-page.js`, `data/portfolio.json`, `data/products.json`, `scripts/dev_server.py`, `README.md`.
- **Калькулятор:** `product-types.js`, `pricing.js`, `product-parts.js`, `constructor-state.js`, `visualizer/*`, `rate-catalog.js`, `docs/pricing-logic.md`, `scripts/scrape_slabs.py`.
- **Фото:** `D:\photo_marble\photo_keep.csv`, `photo_review_state.json`, `результат\photo_inventory_v3_2.csv`.

## Ключевые коммиты

- Сайт: `eb9d019` — последний, `master` = `origin/master`.
- Калькулятор: `eee7e60` — последний, **ветка на 12 коммитов впереди origin, не запушена**.

## Известные ограничения

- Прод-топология и хранение `slabs.json` не решены.
- Заявка никуда не отправляется.
- Большая часть ставок — оценки.
- Портфолио сайта — плейсхолдеры.
- Тесты: калькулятор 490/490 (`node --test tests/*.test.js`), сайт 78/78. Тесты парсера требуют pytest, здесь его нет.

## Как безопасно продолжать работу

1. Работать только в нужной папке. Для калькулятора это worktree, а не `D:\calculator`.
2. Перед правкой прочитать соответствующий раздел handoff и `docs/pricing-logic.md`, запустить тесты.
3. Ничего не удалять и не перемещать в `D:\photo_marble`. Ключ фото — полный путь в ZIP.
4. Проверять изменения в браузере через dev-сервер. Скачивание, push и внешние действия — только с разрешения пользователя.

Перед изменением кода сначала прочитай CLAUDE_HANDOFF.md и CLAUDE_START_HERE.md.
