# Шрифты калькулятора

Те же шрифты, что на сайте (`sayanmramor-site`, `assets/fonts/`, описание там в
`SOURCES.md`): Montserrat — текст, Unbounded — заголовки `h1`/`h2` и название
«Саянмрамор». Файлы скопированы с сайта без изменений 2026-10-10, чтобы
калькулятор и сайт выглядели одним продуктом. Подключены в
`sayanmramor-calculator.html` (`@font-face` в начале `<style>`).

Оба шрифта под SIL Open Font License 1.1, лицензии рядом:
`LICENSE-montserrat.txt`, `LICENSE-unbounded.txt`. Исходник — пакеты
`@fontsource-variable/montserrat@5.3.0` и `@fontsource-variable/unbounded@5.3.0`
(`cdn.jsdelivr.net/npm/...`).

| Файл | Байт | SHA-256 |
|---|---|---|
| `montserrat-cyrillic-wght-normal.woff2` | 23 828 | `a187b077090fe8ae3fd2d7496aabbeae604819c718a282e0afc92df72b450766` |
| `montserrat-latin-wght-normal.woff2` | 37 956 | `06b16db7a969135d48d38c49183be7fb88d4452e2a3011957c7851941f4e4879` |
| `montserrat-latin-ext-wght-normal.woff2` | 70 688 | `54d9a78b7ff60b689ad9f3017ffac8547b5d871afec733f6c1c3ae36577ee504` |
| `unbounded-cyrillic-wght-normal.woff2` | 31 424 | `e30bf6a6063b6a47232bbd657e24c7cf4fdaf76fc2c50d92d9ee63e2ad2087cf` |
| `unbounded-latin-wght-normal.woff2` | 50 904 | `22f9b928aa3928a896340422b54d690fbb5875c30eae4c106f029c61f2289fd6` |

`montserrat-latin-ext` нужен ради знака ₽ (U+20BD) в ценах; браузер скачивает
каждый файл только если на странице есть символы его диапазона (`unicode-range`).

Если шрифты на сайте поменяются, их нужно заменить и здесь.

## TTF для паспорта изделия (2026-10-20)

PDF-библиотека (jsPDF, `vendor/jspdf/`) встраивает только статические TrueType,
поэтому для паспорта лежат TTF тех же шрифтов (та же лицензия SIL OFL 1.1).
Грузятся только по кнопке «Скачать паспорт».

| Файл | Источник | Байт | SHA-256 |
|---|---|---|---|
| `Montserrat-Regular.ttf` | github.com/JulietaUla/Montserrat, `fonts/ttf/` | 445928 | `3e8abe50c44c82e2242e97d1ec8c0d385c4890cdc50447bcdb8605c81a38cfb2` |
| `Montserrat-SemiBold.ttf` | github.com/JulietaUla/Montserrat, `fonts/ttf/` | 454716 | `b4e1563393d73fdff491a869441245aef31add2ec03d9c97a6dae4de07c52fd0` |
| `Unbounded-Medium.ttf` | github.com/googlefonts/unbounded, `fonts/ttf/` | 478652 | `1d6ab5ee3296ab9eb1c1db6ed4bdf501129c65cc9ee818dcf99e4338089483a3` |
