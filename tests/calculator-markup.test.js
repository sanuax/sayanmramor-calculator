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
