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
  const titles = [...block.matchAll(/title: '([^']+)'/g)].map(m => m[1]);
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
