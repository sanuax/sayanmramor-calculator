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
  assert.doesNotMatch(html, /Количество — /);
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
  titles.forEach(t => assert.doesNotMatch(t, /тандартн|—|подступен/i, t));
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
  // Next to the chosen stone (the specs list), before the price and the request form.
  const at = review.indexOf(TEXTURE_NOTE);
  assert.ok(review.indexOf('id="resultSpecs"') < at && at < review.indexOf('class="result-pricing"') && at < review.indexOf('id="leadArea"'));
});

test('the stone gallery names the supplier once, with a link to Venezia Stone in a new tab', () => {
  const overlay = html.slice(html.indexOf('id="pickerOverlay"'), html.indexOf('id="lightboxOverlay"'));
  assert.equal(overlay.split('Камень в нашей коллекции закупается у Venezia Stone').length - 1, 1);
  const links = overlay.match(/<a [^>]*href="https:\/\/veneziastone\.com\/"[^>]*>([^<]*)<\/a>/g) || [];
  assert.equal(links.length, 1);
  assert.match(links[0], /target="_blank"/);
  assert.match(links[0], /rel="noopener"/);
  assert.match(links[0], />Подробнее о коллекции и материалах — на сайте Venezia Stone</);
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
  assert.match(header, /<a class="site-logo" href="\/sayanmramor-site\/index\.html">Саянмрамор<\/a>/);
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
