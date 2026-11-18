// tests/mode-choice.test.js
//
// «Одно изделие» or «Проект» (the owner, 2026-11-18): the calculator opened on its own starts with a
// full-page choice; a link that already says what it is (a product or a stone from the site, a
// product's passport, a project's link) skips it. One product is the calculator as on the site; its
// Result can turn it into a project («Сделать проектом»). The choice is one step back in the browser.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'sayanmramor-calculator.html'), 'utf8');
const fn = name => {
  const s = html.indexOf('function ' + name + '(');
  assert.ok(s > 0, 'function ' + name);
  return html.slice(s, s + html.slice(s).search(/\r?\n  \}\r?\n/));
};

test('the page has the choice screen with its two cards and a way back to it', () => {
  ['modeChoice', 'modeChoiceSingle', 'modeChoiceProject', 'modeChoiceNew', 'modeSwitch'].forEach(id => {
    assert.equal((html.match(new RegExp('id="' + id + '"', 'g')) || []).length, 1, id);
  });
  assert.match(html, /Что будем считать\?/);
  assert.match(html, /body\.choosing-mode \.configurator/, 'the calculator is hidden while the choice is on screen');
});

test('a link that says what it is skips the choice: a project link -> project; a product, a stone or a passport -> one product', () => {
  const boot = fn('chooseStartMode');
  assert.match(boot, /projectLink/);
  assert.match(boot, /'project'/);
  assert.match(boot, /passportLink/);
  assert.match(boot, /get\('product'\)/);
  assert.match(boot, /get\('stone'\)/);
  assert.match(boot, /'single'/);
  assert.match(boot, /showModeChoice\(\)/);
  // The stored project is no longer restored behind the client's back: only from the choice («Продолжить»).
  assert.doesNotMatch(html, /if \(!passportLink && !projectLink && !bootstrapParams\.get\('product'\)\) restoreStoredProject\(\);/);
  assert.match(fn('continueStoredProject'), /restoreStoredProject\(\)/);
});

test('one product is the calculator as on the site: no project, nothing stored', () => {
  assert.match(fn('renderProjectBlock'), /calcMode !== 'project'/);
  assert.match(fn('storeProject'), /calcMode !== 'project'/);
  assert.match(fn('renderModeTexts'), /Сделать проектом/);
  assert.match(fn('renderModeTexts'), /Рассчитайте стоимость проекта/);
});

test('«Сделать проектом»: the product counted becomes the project\'s first, a new one starts; a stored project is replaced only when the client says so', () => {
  const make = fn('makeProjectFromSingle');
  assert.match(make, /confirm\(/);
  assert.match(make, /setCalcMode\('project'\)/);
  assert.match(make, /addProjectItem\(\)/);
});

test('the choice is one step back in the browser; «Одно изделие» from the choice starts from a clean form', () => {
  assert.match(fn('setCalcMode'), /history\.pushState/);
  assert.match(html, /addEventListener\('popstate'/);
  const single = fn('startSingle');
  assert.match(single, /resetFormToInitial\(\)/);
  assert.match(single, /project = null/);
});
