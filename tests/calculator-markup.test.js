// tests/calculator-markup.test.js
//
// The single-object countertop extras (sink, cooktop cut-out, holes) and the
// edge profile are choices, not user-typed numbers: the fields
// constructor-state.js reads stay, but only as hidden 1/empty flags.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'sayanmramor-calculator.html'), 'utf8');
const inputTags = id => html.match(new RegExp('<input[^>]*id="' + id + '"[^>]*>', 'g')) || [];

test('sink, cooktop and hole counts are hidden flags, never a visible quantity input', () => {
  ['cut-sink-overlay', 'cut-sink-undermount', 'cut-sink-integrated', 'cut-cooktop', 'hole-mixer', 'hole-socket', 'hole-dispenser'].forEach(id => {
    const tags = inputTags(id);
    assert.equal(tags.length, 1, id);
    assert.match(tags[0], /type="hidden"/, id);
  });
  assert.doesNotMatch(html, /Количество - /);
});

test('cooktop and each hole are toggle cards bound to their field', () => {
  ['cut-cooktop', 'hole-mixer', 'hole-socket', 'hole-dispenser'].forEach(id => {
    assert.match(html, new RegExp('data-toggle-field="' + id + '"'), id);
  });
});

test('edge: a hidden profile field, no edge-length input', () => {
  assert.match(inputTags('edge-type')[0], /type="hidden"/);
  assert.equal(inputTags('edge-length-shared').length, 0);
  assert.doesNotMatch(html, /Длина кромки/);
});

test('Back/Next carry SVG arrows, not text glyphs', () => {
  assert.match(html, /id="stepBackBtn"><svg class="step-nav-arrow"[^]*?<span>Назад<\/span><\/button>/);
  assert.match(html, /id="stepNextBtn"><span>Далее<\/span><svg class="step-nav-arrow"/);
  assert.doesNotMatch(html, /← Назад|Далее →/);
});

test('cooktop: the row itself is the switch -- no nested single-option card', () => {
  assert.match(html, /<button type="button" class="work-item-head" data-toggle-field="cut-cooktop"/);
  assert.doesNotMatch(html, /Вырез под панель/);
});

test('type cards: client-facing names only -- no rate-catalog suffixes or riser combinations', () => {
  const block = html.slice(html.indexOf('const TYPE_CARDS = {'), html.indexOf('const RISER_CARDS'));
  // Facade cards are built from facade-model.js (their one source of names).
  const titles = [...block.matchAll(/title: '([^']+)'/g)].map(m => m[1])
    .concat(require('../facade-model.js').FACADE_TYPES.map(t => t.title));
  assert.ok(titles.length >= 30, 'every product type has a card');
  titles.forEach(t => assert.doesNotMatch(t, /тандартн| - |подступен/i, t));   // « - »: a «name - suffix» separator, not the hyphen of «Г-образная»
});

test('countertop shape offers П-образная', () => {
  assert.match(html, /<option value="ushape">П-образная<\/option>/);
});

test('step count sits with the sizes (dimensions step), not on the type step', () => {
  const dims = html.slice(html.indexOf('data-step-id="dimensions"'), html.indexOf('data-step-id="shape"'));
  assert.match(dims, /id="stepCountInput"/);
  assert.match(dims, /id="step-count"/);
  const type = html.slice(html.indexOf('data-step-id="type"'), html.indexOf('data-step-id="material"'));
  assert.doesNotMatch(type, /stepCountInput/);
});

const TEXTURE_NOTE = 'Текстура камня на изделии носит ориентированный характер. Точная раскладка и направление рисунка будут согласованы с дизайнером при разработке проекта.';
const sectionOf = stepId => {
  const start = html.indexOf('data-step-id="' + stepId + '"');
  return html.slice(start, html.indexOf('</section>', start));
};

test('the stone texture note: one wording, under the material choice and once on the result screen', () => {
  assert.doesNotMatch(html, /Текстура камня носит ориентированный характер/, 'the old wording is gone');
  assert.equal(html.split(TEXTURE_NOTE).length - 1, 2, 'exactly two places, no variant');
  assert.equal(sectionOf('material').split(TEXTURE_NOTE).length - 1, 1);
  const review = sectionOf('review');
  assert.equal(review.split(TEXTURE_NOTE).length - 1, 1);
  // Variant B (2026-10-20, the owner): last on the Result, under what was built.
  const at = review.indexOf(TEXTURE_NOTE);
  assert.ok(review.indexOf('id="resultCards"') < at && review.indexOf('id="leadArea"') < at);
});

test('the stone gallery names the supplier once, with a link to Venezia Stone in a new tab', () => {
  const overlay = html.slice(html.indexOf('id="pickerOverlay"'), html.indexOf('id="lightboxOverlay"'));
  assert.equal(overlay.split('Камень в нашей коллекции закупается у Venezia Stone').length - 1, 1);
  const links = overlay.match(/<a [^>]*href="https:\/\/veneziastone\.com\/"[^>]*>([^<]*)<\/a>/g) || [];
  assert.equal(links.length, 1);
  assert.match(links[0], /target="_blank"/);
  assert.match(links[0], /rel="noopener"/);
  assert.match(links[0], />Подробнее о коллекции и материалах - на сайте Venezia Stone</);
  assert.equal(html.split('veneziastone.com').length - 1, 1, 'nowhere else in the calculator');
  assert.doesNotMatch(html, /взят с сайта/);
});

test('the 3D/price panel waits for a product: hidden until the first choice, shown by the product change handler', () => {
  assert.match(html, /\.configurator-columns:not\(\.has-product\) \.configurator-side \{ display: none; \}/);
  const handler = html.slice(html.indexOf("input.addEventListener('change', () => {\n      selectedProductKey = key;"));
  assert.match(handler.slice(0, 400), /classList\.add\('has-product'\)/);
  // The markup itself does not pre-set it: with no product the panel is hidden.
  assert.doesNotMatch(html, /class="configurator-columns has-product"/);
});

// The site's header (2026-10-10, the owner's request): the same capsule and menu
// as on the site, drawn by the site's own css/header.css and js/header.js, without
// «Заказать» and «Создать изделие» (this page is where they lead). The menu itself
// is compared with the site's by tests/site.test.js in sayanmramor-site.
test('the site header: the capsule from the site, its menu, no actions; the sticky side panel stays clear of it', () => {
  const header = html.slice(html.indexOf('<header class="site-header">'), html.indexOf('</header>') + 9);
  assert.ok(header.length > 1000, 'the header is there');
  assert.ok(html.indexOf('<header class="site-header">') < html.indexOf('<div class="wrap">'), 'above the page, not inside it');
  assert.match(header, /<a class="site-logo" href="\/sayanmramor-site\/index\.html">Саянмрамор studio<\/a>/);   // «studio» only here, not on the site (the owner, 2026-10-20)
  assert.match(header, /<nav class="site-nav" id="siteNav" aria-label="Основное меню">/);
  assert.doesNotMatch(header, /site-header-actions|Заказать|Создать изделие|aria-current/);
  assert.doesNotMatch(html, /class="brand-mark"/, 'the old name-only mark is gone');
  const head = html.slice(0, html.indexOf('</head>'));
  const flag = head.indexOf("document.documentElement.classList.add('js')");
  const sheet = head.indexOf('<link rel="stylesheet" href="/sayanmramor-site/css/header.css">');
  assert.ok(flag > 0 && sheet > flag, 'the «js» flag, then the header stylesheet');
  assert.ok(sheet < head.indexOf('<style>'), 'before the page\'s own styles, so they win where they speak');
  assert.ok(head.includes('<script src="/sayanmramor-site/js/header.js" defer></script>'));
  assert.match(html, /\.configurator-side \{ position: sticky; top: var\(--below-header\); \}/);
});

// The step track (2026-10-10, the owner's choice: concept A of
// sayanmramor-site/.claude/concepts/steps.html): all the steps in one capsule
// of glass that sticks under the site's header, so the stones of the picker
// pass under it; the current step is a verde lens that travels to the step
// you go to. Where the steps do not fit, only the current one keeps its name.
test('the step track: a sticky glass capsule under the header, a travelling lens, compact when it does not fit; calm when less motion or transparency is asked', () => {
  const css = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));
  const rule = sel => { const i = css.indexOf('\n  ' + sel + ' {'); return i < 0 ? '' : css.slice(i, css.indexOf('}', i)); };
  assert.match(rule('.step-progress'), /position: sticky; top: var\(--track-top\);/);
  assert.match(css, /--track-top: 80px;/, 'under the desktop header (12 + 60 px)');
  assert.match(css, /@media \(max-width: 1000px\) \{\s*:root \{ --track-top: 72px; \}/, 'under the phone header (8 + 56 px)');
  const track = rule('.step-progress-list');
  assert.match(track, /border-radius: 999px;/);
  assert.match(track, /-webkit-backdrop-filter: blur\(12px\) saturate\(1\.7\); backdrop-filter: blur\(12px\) saturate\(1\.7\);/);
  assert.match(track, /overflow-x: auto;/);
  assert.match(css, /\.glass-bend \.step-progress-list \{ backdrop-filter: url\(#lg-bend\) blur\(12px\) saturate\(1\.7\); \}/);
  const lens = rule('.step-progress-lens');
  assert.match(lens, /background: var\(--accent\);/);
  assert.match(lens, /transition: transform 0\.26s var\(--ease-move\), width 0\.26s var\(--ease-move\);/);
  assert.match(css, /\.step-progress-list\.is-compact \.step-progress-item:not\(\.active\) \.step-progress-label \{/);
  assert.match(css, /@media \(min-width: 981px\) \{\s*\.step-progress-list \{ max-width: min\(820px, calc\(100% - 536px\)\); \}/, 'never over the 3D column');
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*\.step-progress-lens \{ transition: none; \}/);
  assert.match(css, /@media \(prefers-reduced-transparency: reduce\) \{\s*\.step-progress-list, \.glass-bend \.step-progress-list \{ background: var\(--card\); -webkit-backdrop-filter: none; backdrop-filter: none; \}/);
  // The script: the lens is one aria-hidden item after the steps; the steps keep their indexes.
  const js = html.slice(html.indexOf('function renderStepProgress'), html.indexOf('function applyStep('));
  assert.match(js, /lens\.className = 'step-progress-lens';[\s\S]*lens\.setAttribute\('aria-hidden', 'true'\);/);
  assert.match(js, /list\.classList\.toggle\('is-compact'/);
  assert.match(js, /list\.scrollTo\(/, 'the current step scrolled into the capsule, never the page');
  assert.doesNotMatch(js, /scrollIntoView/);
});

// The stone picker in glass (2026-10-10, the owner's request: more liquid glass in
// the configurator, the icons and the 3D untouched). The picker's chrome -- search,
// filters, the count, the sort -- is one pane of glass and the stones scroll under
// it; the filter panels are glass over the stones; the zoomed stone lies over the
// picker blurred, not over black.
test('the stone picker in glass: the chrome over the scrolling stones, the filter panels, the sort, the zoomed stone; solid where less transparency is asked', () => {
  const css = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));
  const rule = sel => { const i = css.indexOf('\n  ' + sel + ' {'); return i < 0 ? '' : css.slice(i, css.indexOf('}', i)); };
  const overlay = html.slice(html.indexOf('id="pickerOverlay"'), html.indexOf('id="lightboxOverlay"'));
  const chrome = overlay.slice(overlay.indexOf('<div class="picker-chrome" id="pickerChrome">'), overlay.indexOf('<div class="picker-results"'));
  ['class="picker-header"', 'id="pickerFilters"', 'class="picker-meta-row"', 'id="pickerSort"'].forEach(part =>
    assert.ok(chrome.includes(part), part + ' sits in the glass chrome'));
  assert.ok(!chrome.includes('id="pickerGrid"'), 'the stones are not in it');
  assert.match(rule('.picker-chrome'), /position: absolute; top: 0; left: 0; right: 0; z-index: 2;/);
  // The glass on its own layer, not on the chrome: a filter panel inside the chrome must still see the stones under it.
  const glass = rule('.picker-chrome::before');
  assert.match(glass, /-webkit-backdrop-filter: blur\(18px\) saturate\(1\.6\); backdrop-filter: blur\(18px\) saturate\(1\.6\);/);
  assert.match(css, /\.glass-bend \.picker-chrome::before \{ backdrop-filter: url\(#lg-bend\) blur\(18px\) saturate\(1\.6\); \}/);
  assert.match(rule('.picker-results'), /position: absolute; inset: 0;[^}]*padding: calc\(var\(--picker-chrome-h, 160px\) \+ 20px\) 20px 56px;/, 'the stones start under the chrome and scroll beneath it');
  assert.match(rule('.filter-dropdown-panel'), /backdrop-filter: blur\(16px\) saturate\(1\.6\);/);
  assert.match(rule('.lightbox-overlay'), /backdrop-filter: blur\(24px\) saturate\(1\.3\);/);
  assert.match(rule('#lightboxClose'), /backdrop-filter: blur\(12px\) saturate\(1\.6\);/);
  const calm = css.slice(css.indexOf('@media (prefers-reduced-transparency: reduce) {\n    .picker-chrome::before'));
  assert.ok(calm.length > 0, 'one block for less transparency');
  assert.match(calm.slice(0, calm.indexOf('\n  }\n')), /\.picker-chrome::before, \.glass-bend \.picker-chrome::before \{ background: #fff; -webkit-backdrop-filter: none; backdrop-filter: none; \}/);
  // The script measures the chrome (it wraps to more rows on a phone) for the stones' first row.
  const picker = fs.readFileSync(path.join(__dirname, '..', 'material-picker.js'), 'utf8');
  assert.match(picker, /getElementById\('pickerChrome'\)/);
  assert.match(picker, /style\.setProperty\('--picker-chrome-h', /);
  assert.match(picker, /new ResizeObserver\(/);
});

// The result column, variant B (2026-10-20, the owner: «цена как будто должна быть сверху всего»):
// the chosen stone with the price on it, the actions, what the price is made of, then what was
// built -- one card per step, each with its own «Изменить» -- and the texture note last.
test("the result column: the price on the stone first, then the actions, the price's make-up, the cards and the texture note", () => {
  const review = html.slice(html.indexOf('<section class="step" data-step-id="review"'), html.indexOf('</section>', html.indexOf('data-step-id="review"')));
  const order = ['id="resultHero"', 'id="resultTotal"', 'id="resultPriceNote"', 'id="leadArea"', 'id="resultCtaBtn"', 'id="passportBtn"', 'id="resultShowroomLink"',
    'class="result-price-parts"', 'id="resultLines"', 'class="result-built-title">Что вы собрали', 'id="resultCards"', 'id="resultScopeNote"',
    'class="stone-texture-note result-texture-note"'].map(part => {
    const at = review.indexOf(part);
    assert.ok(at > 0, part);
    return at;
  });
  order.reduce((prev, at) => { assert.ok(prev < at, 'in this order'); return at; });
  assert.ok(review.indexOf('id="leadForm"') > review.indexOf('id="resultShowroomLink"'), 'the form opens under the actions');
  ['Конфигурация готова', 'Изменить конфигурацию', 'result-eyebrow', 'id="resultSpecs"', 'id="resultEditActions"'].forEach(old => assert.ok(!review.includes(old), old));
});

test('every result card links back to its own step, and the cards come from ResultModel.buildResultCards', () => {
  const fn = html.slice(html.indexOf('function renderResult('), html.indexOf('function renderResult(') + 6000);
  assert.match(fn, /ResultModel\.buildResultCards\(/);
  assert.match(fn, /goToStep\(card\.stepId\)/);
});

test('the glass leaves the icons and the 3D alone: the product, type and extras icons and the 3D panel keep their own rules', () => {
  const css = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));
  const glassy = [...css.matchAll(/([^{}]+)\{[^}]*backdrop-filter/g)].map(m => m[1].replace(/\/\*[\s\S]*?\*\//g, ''));
  glassy.forEach(sel => assert.doesNotMatch(sel, /product-card|product-grid|card-grid|pick-card|icon|shape-card|option-card|toggle-card|work-item|viewer-|configurator-side|summary-block|canvas/, sel.trim()));
});

// On a phone (2026-10-14, the owner: «всё скачет, в лишний раз открывается клавиатура
// - при расчёте и каталоге камня»): a step change brings the new step's start into view
// under the step strip and closes the keyboard of the step left behind; the stone picker
// and the request form open without putting the cursor in a field on a touch screen, so
// the keyboard comes up only when a field is tapped. With a mouse, as before.
test('phone: steps scroll to their start, no keyboard unless a field is tapped', () => {
  const picker = fs.readFileSync(path.join(__dirname, '..', 'material-picker.js'), 'utf8');
  const open = picker.slice(picker.indexOf('function open()'), picker.indexOf('return { open, close };'));
  assert.match(open, /if \(finePointer\(\)\) searchInput\.focus\(\);\s*else overlay\.focus\(\{ preventScroll: true \}\);/);
  assert.match(picker, /matchMedia\('\(hover: hover\) and \(pointer: fine\)'\)/);
  assert.match(html, /<div class="picker-overlay" id="pickerOverlay" hidden role="dialog" aria-modal="true" aria-label="Выбор камня" tabindex="-1">/);

  const lead = html.slice(html.indexOf('function applyLeadMode('), html.indexOf('function showLeadErrors('));
  assert.match(lead, /leadMode === 'form' \? \(finePointer\(\) \? leadFields\.name\.input : leadForm\)/, 'the form itself, not «Имя», on a touch screen');
  assert.match(html, /<form class="lead-form" id="leadForm" novalidate hidden tabindex="-1">/);

  const apply = html.slice(html.indexOf('function applyStep('), html.indexOf('function updateStepUI('));
  assert.match(apply, /if \(transitionDirection\) \{\s*releaseFieldIn\(fromEl\);\s*if \(!enteringResult\) bringStepIntoView\(\);/, 'the Result keeps its own scroll to the columns');
  const helpers = html.slice(html.indexOf('function releaseFieldIn('), html.indexOf('function applyStep('));
  assert.match(helpers, /document\.activeElement\.blur\(\)/);
  assert.match(helpers, /const strip = stepProgressEl\.getBoundingClientRect\(\);[\s\S]*strip\.bottom/, 'under the sticky step strip');
  assert.match(helpers, /window\.scrollBy\(\{ top: [^,]+, behavior: reducedMotion\.matches \? 'auto' : 'smooth' \}\)/);
});

// The tab icon is the site's (the old site's favicon, 2026-10-14), from the site on the same host.
test('the configurator wears the site\'s tab icon', () => {
  assert.match(html, /<\/title>\r?\n<link rel="icon" href="\/sayanmramor-site\/assets\/brand\/favicon\.ico">/);
});

// Phone (2026-10-15, the owner: «при вводе размеров всё двигается вправо-влево», «открывается вся
// клавиатура»): iPhone Safari zooms into any field whose text is under 16 px and stays zoomed, so
// the page slides sideways; and a type="number" field without inputmode gets the full keyboard.
test('phone: every number field asks for the digit keypad (inputmode="numeric")', () => {
  const visible = (html.match(/<input [^>]*type="number"[^>]*>/g) || []).filter(tag => !/\shidden[\s>]/.test(tag));
  assert.ok(visible.length > 20, 'the size fields are found');
  visible.forEach(tag => assert.match(tag, /inputmode="numeric"/, tag));
});

test('phone: on a touch screen every field is at least 16 px, so focusing it never zooms the page', () => {
  assert.match(html, /@media \(pointer: coarse\) \{\s*input:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\), select, textarea \{ font-size: 16px !important; \}\s*\}/);
});

test('the tab: «Конфигуратор изделий из камня - Саянмрамор» (2026-10-15, the owner)', () => {
  assert.match(html, /<title>Конфигуратор изделий из камня - Саянмрамор<\/title>/);
});

test('the size step shows no formula: no «Формула: …» line under the fireplace or facade sizes (2026-10-15, the owner)', () => {
  assert.doesNotMatch(html, /'Формула: '/);
});

test('«Схема без крыла» only for a product with the «Форма» step (the countertops), not for the steps after a countertop was Г/П-shaped (2026-10-20, the owner)', () => {
  const fn = html.slice(html.indexOf('function updateWingVisibility()'), html.indexOf('function svgIcon('));
  assert.match(fn, /const hasShape = !!\(product && product\.supportsShapeSelection\);/);
  assert.match(fn, /dimShapeNote\.hidden = !\(hasShape && \(isLshape \|\| isUshape\)\);/);
});

test('size fields: label over the field, «мм» centred on the field itself, fields in a row on one line however their labels wrap (2026-10-20, the owner)', () => {
  assert.match(html, /\.field-unit \{ min-width: 0; display: grid;[^}]*align-content: end; \}/);
  assert.match(html, /\.field-unit \.unit \{ grid-row: 2; grid-column: 1; justify-self: end; align-self: center;/);
});

test('the size step\'s notes stand in the fields\' column, from its left edge, not centred across the card (2026-10-20, the owner)', () => {
  assert.match(html, /\.dim-note \{ max-width: var\(--dim-col\); margin: 12px auto 0;[^}]*text-align: left; line-height: 1\.45; \}/);
  assert.doesNotMatch(html, /#facadeAreaNote, #fireplaceAreaNote \{[^}]*max-width/, 'the area notes take the same column');
});

test('no long dash anywhere a client reads in the configurator, only « - » (2026-10-20, the owner)', () => {
  const root = path.join(__dirname, '..');
  const js = dir => fs.readdirSync(path.join(root, dir)).filter(f => f.endsWith('.js')).map(f => path.join(dir, f));
  ['sayanmramor-calculator.html', ...js('.'), ...js('visualizer')]
    .forEach(f => assert.doesNotMatch(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), /[–—]/, f));
});

test('the size step says no more than asked (2026-10-20, the owner): what a size means is behind the «?» of its label, what the calculator works out is one line of figures, only what the client must fix is written out', () => {
  // The «?»: a label gets it by setTip; a tap shows «Название: …» under its block, a second tap hides it.
  assert.match(html, /function setTip\(el, text\) \{/);
  assert.match(html, /slot\.textContent = el\.textContent\.trim\(\) \+ ': ' \+ el\.dataset\.tip;/);
  assert.match(html, /\.has-tip::after \{[^}]*content: '\?' \/ '';/);
  // No paragraph in the markup of the size step: the march and riser notes are tips on their titles.
  const sizes = html.slice(html.indexOf('<section class="step" data-step-id="dimensions"'), html.indexOf('<section class="step" id="shapeField"'));
  assert.doesNotMatch(sizes, /Марш - |Подступенок - /);
  assert.match(html, /setTip\(document\.getElementById\('riserHeightTitle'\), /);
  // The windowsill and radius-wall sizes: one tip per field, no paragraph.
  const labels = html.slice(html.indexOf('const TYPE_DIMENSION_LABELS = {'), html.indexOf('const MISSING_SIZE_HINTS'));
  assert.doesNotMatch(labels, /note: /);
  ['WALL-04', 'SILL-02', 'SILL-03', 'SILL-04'].forEach(id => assert.match(labels, new RegExp("'" + id + "'[^\\n]*\\n[^\\n]*\\n\\s+tips: \\{"), id));
  // A stair: the figures under the count, the tread depth with them; only «Длины не хватает» written out.
  const hint = html.slice(html.indexOf('function updateDimHint('), html.indexOf("const dimShapeNote = document.getElementById('dimShapeNote');"));
  assert.match(hint, /figures\.push\('глубина ступени ' \+ depthMm \+ ' мм'\)/);
  assert.match(hint, /stepCountNoteEl\.textContent = figures\.join\(' · '\);/);
  assert.match(hint, /warn = 'Длины не хватает/);
  // Facades and fireplaces: the area in figures; what the price covers is said by the price, on the result screen.
  assert.doesNotMatch(html, /facade-area-scope/);
  // The countertop diagram: three words under it.
  assert.match(html, /dimShapeNote\.textContent = isUshape \? 'Схема без крыльев' : 'Схема без крыла';/);
  assert.ok(html.indexOf('id="dimShapeNote"') > html.indexOf('id="dimDiagram"') && html.indexOf('id="dimShapeNote"') < html.indexOf('id="dimGenericFields"'));
  assert.ok(html.indexOf('id="facadeAreaNote"') > html.indexOf('id="facadeQtyField"'));
});

test('the size column: 400 px, two fields side by side with every label on one line, one per row where two do not fit (2026-10-20, the owner)', () => {
  assert.match(html, /--dim-col: 400px;/);
  assert.match(html, /\.dim-fields \{ display: grid; grid-template-columns: repeat\(auto-fit, minmax\(180px, 1fr\)\); gap: 12px; max-width: var\(--dim-col\);/);
  assert.doesNotMatch(html, /max-width: 320px/);
});

// ---- The passport link (2026-10-20, the owner): the link reopens the same product ----
test('the page loads passport-link.js next to url-bootstrap.js', () => {
  assert.match(html, /<script src="url-bootstrap\.js"><\/script>\s*<script src="passport-link\.js"><\/script>/);
});

test('a passport link whose stone left the catalog: one hidden line in the material step, in the owner\'s words', () => {
  const step = html.slice(html.indexOf('data-step-id="material"'), html.indexOf('data-step-id="dimensions"'));
  const note = step.match(/<p[^>]*id="stoneGoneNote"[^>]*>([^<]*)<\/p>/);
  assert.ok(note, '#stoneGoneNote in the material step');
  assert.match(note[0], /\shidden[\s>]/);
  assert.equal(note[1], 'Камень из паспорта больше не в каталоге - выберите другой');
});

test('every edge card carries its profile, so a link can pick it the way a click does', () => {
  assert.match(html, /card\.dataset\.edgeType = edgeDef\.type;/);
});

// ---- The passport download (2026-10-20, the owner): on the Result, no contacts needed ----
test('«Скачать паспорт» sits in the lead area beside «Получить расчёт», outside the contact form, styled like its neighbours', () => {
  const area = html.slice(html.indexOf('<div class="lead" id="leadArea">'), html.indexOf('<form class="lead-form" id="leadForm"'));
  assert.match(area, /<button type="button" class="lead-secondary-btn passport-btn" id="passportBtn">Скачать паспорт<\/button>/);
});

test('the passport modules load with the page; the PDF / QR libraries only on the click', () => {
  assert.match(html, /<script src="passport-link\.js"><\/script>\s*<script src="passport-model\.js"><\/script>\s*<script src="passport-pdf\.js"><\/script>/);
  assert.doesNotMatch(html, /<script[^>]+vendor\/(jspdf|qrcode)\//);
  assert.match(html, /'vendor\/jspdf\/jspdf\.umd\.min\.js'/);
  assert.match(html, /'vendor\/qrcode\/qrcode\.js'/);
});

test('the price snapshot keeps what the passport\'s table needs: the rates, the area and the complex-shape choice', () => {
  assert.match(html, /return \{ state: constructorState, outcome: \{ kind: 'ok', result, message \}, pricingInputs: \{ rates, mainAreaM2: job\.mainAreaM2, complexEnabled \} \};/);
});

test('applyLeadMode never hides the passport button', () => {
  const fn = html.slice(html.indexOf('function applyLeadMode('), html.indexOf('function showLeadErrors('));
  assert.doesNotMatch(fn, /passportBtn/);
});

// ---- Final review fixes (2026-10-20) ----
test("a passport link restores the steps' riser choice through its card, so the card shows it", () => {
  const fn = html.slice(html.indexOf('function restorePassportChoices('), html.indexOf('function openPassportStep('));
  assert.match(fn, /id === 'stupeni-riser'/);
  assert.match(fn, /stupeniRiserGrid/);
});

test('the link leaves out the hidden mirrors of the visible count fields (shorter link, smaller QR)', () => {
  const fn = html.slice(html.indexOf('const PASSPORT_MIRRORS'), html.indexOf('const passportInitial'));
  assert.match(fn, /\.filter\(el => !PASSPORT_MIRRORS\.includes\(el\.id\)\)/);
  assert.match(fn, /step-count/);
  assert.match(fn, /facade-quantity/);
});

test('the passport button never sticks: everything after it turns busy runs inside the promise chain', () => {
  const fn = html.slice(html.indexOf('function downloadPassport('), html.indexOf("passportBtn.addEventListener('click', downloadPassport);"));
  const busy = fn.indexOf("passportBtn.textContent = 'Готовим паспорт...';");
  const chain = fn.indexOf('Promise.resolve().then(');
  assert.ok(chain > busy, 'a chain after the busy state');
  assert.ok(fn.indexOf('PassportModel.buildPassport') > chain, 'buildPassport inside it');
  assert.ok(fn.indexOf('ThreeScene.capture') > chain, 'the shots inside it');
});

test('a stone photo that never loads or loads empty gives the placeholder, not a failed passport', () => {
  const fn = html.slice(html.indexOf('function passportStonePhoto('), html.indexOf('function downloadPassport('));
  assert.match(fn, /naturalWidth/);
  assert.match(fn, /setTimeout\(/);
});

test('the stone photo is cropped to the shape of the views beside it (PassportPdf.SMALL_RATIO), not to a square', () => {
  const fn = html.slice(html.indexOf('function passportStonePhoto('), html.indexOf('function downloadPassport('));
  assert.match(fn, /PassportPdf\.SMALL_RATIO/);
});

// ---- The page holds still on a phone (2026-10-20, the owner): as on the site ----
test('the calculator\'s viewport is fixed at the phone\'s width, and the page only scrolls up and down', () => {
  assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1\.0, maximum-scale=1\.0, user-scalable=no">/);
  assert.match(html, /\n {2}html \{ touch-action: pan-y; \}/);
  assert.match(html, /\n {2}body \{[^}]*overflow-x: clip;/);
});

// ---- The passport on an iPhone (2026-10-20, the owner: nothing was saved) ----
// WebKit saves a file only from a tap itself; the passport is ready a moment after the tap
// (fonts, shots, the PDF), when that tap no longer counts. So on an iPhone / iPad the first
// tap prepares the passport and the button turns into «Сохранить паспорт»; the second tap
// hands the file over at once -- the share sheet («Сохранить в Файлы», messengers), or a
// download where there is none. Elsewhere one tap still downloads.
const passportCode = () => html.slice(html.indexOf('// ---- The product passport'), html.indexOf("passportBtn.addEventListener('click', downloadPassport);"));

test('passport on an iPhone: the first tap prepares, the second saves within the tap itself', () => {
  const code = passportCode();
  assert.match(code, /function appleTouch\(\)/);
  assert.match(code, /'Сохранить паспорт'/);
  const handler = code.slice(code.indexOf('function downloadPassport('));
  const save = handler.indexOf('savePassportFile(preparedPassport.file)');
  assert.ok(save > 0, 'a prepared passport is saved straight from the tap');
  assert.ok(save < handler.indexOf('Promise.resolve()'), 'before anything waits');
});

test('passport saving: the share sheet with the file where there is one, a download otherwise', () => {
  const fn = passportCode().slice(passportCode().indexOf('function savePassportFile('));
  assert.match(fn, /navigator\.canShare && navigator\.canShare\(\{ files: \[file\] \}\)/);
  assert.match(fn, /navigator\.share\(\{ files: \[file\]/);
  assert.match(fn, /downloadPassportFile\(file\)/);
});

test('a prepared passport is dropped as soon as the product changes', () => {
  const fn = html.slice(html.indexOf('function renderResult('), html.indexOf('function renderResult(') + 9000);
  assert.match(fn, /preparedPassport = null;/);
});
