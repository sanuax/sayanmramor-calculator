// tests/project-page.test.js
//
// The project on the page (the owner, 2026-11-17): «+ Добавить изделие», the project's list in the
// price panel, a product's choices loaded into the form for editing -- the form first back to the
// page's own start, so nothing of one product leaks into another -- the 3D's buttons for each
// product and the whole project, the project kept in the browser.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const PassportModel = require('../passport-model.js');

const html = fs.readFileSync(path.join(__dirname, '..', 'sayanmramor-calculator.html'), 'utf8');
const fn = name => {
  const s = html.indexOf('function ' + name + '(');
  assert.ok(s > 0, 'function ' + name);
  const end = html.slice(s).search(/\r?\n  \}\r?\n/);
  return html.slice(s, s + end);
};

test('the page has the project\'s list, its «+ Добавить изделие» and the 3D\'s project buttons', () => {
  ['projectBlock', 'projectList', 'projectAddBtn', 'viewerProject'].forEach(id => {
    assert.equal((html.match(new RegExp('id="' + id + '"', 'g')) || []).length, 1, id);
  });
  assert.match(html, /<script src="project-model\.js\?v=[0-9a-f]+"><\/script>/);
  assert.match(html, />\+ Добавить изделие</);
});

test('the form goes back to its start before another product is loaded: nothing leaks between products', () => {
  const reset = fn('resetFormToInitial');
  assert.match(reset, /selectedEdgeType/, 'the edge card');
  assert.match(reset, /selectSinkVariant\(/, 'the sink');
  assert.match(reset, /data-toggle-field/, 'the cooktop, holes, the curb');
  assert.match(reset, /clearWingRow\(/, 'the wings\' rows');
  assert.match(reset, /facadeFormByType/);
  assert.match(reset, /fireplaceFormByType/);
  assert.match(reset, /passportInitial/, 'every other field to the page\'s own start');
  assert.match(reset, /selectShapeCard\(/);
  const load = fn('loadItem');
  assert.match(load, /resetFormToInitial\(\)/);
  assert.match(load, /restorePassportChoices\(/);
  assert.match(load, /projectSwitching = true/);
});

test('while a product is being loaded, nothing is calculated half-way; the project is stored after a calculation', () => {
  assert.match(fn('calculate'), /if \(projectSwitching\) return;/);
  assert.match(fn('calculate'), /syncProject\(\)/);
  assert.match(fn('syncProject'), /storeProject\(\)/);
  assert.match(fn('storeProject'), /PROJECT_STORE_KEY/);
  assert.match(html, /const PROJECT_STORE_KEY = 'sayan-calc-project';/);
});

test('removing a product asks first; the last one has no «убрать»', () => {
  assert.match(fn('removeProjectItem'), /confirm\(/);
  assert.match(fn('renderProjectBlock'), /items\.length > 1/);
});

test('the passport\'s titles name each product of the project in the singular', () => {
  assert.equal(PassportModel.PASSPORT_TITLES.stoleshnitsa_kuhnya, 'Столешница на кухню');
  assert.equal(PassportModel.PASSPORT_TITLES.podokonnik, 'Подоконник');
});

// ---- one total, one Result, one request, one link (the owner, 2026-11-17) ----

test('a project link (pv=2) opens the whole project; a one-product passport link (pv=1) as before', () => {
  assert.match(html, /const projectLink = ProjectModel\.readProjectQuery\(bootstrapParams, /);
  assert.match(html, /const passportLink = projectLink \? null : PassportLink\.readPassportQuery\(/);
  assert.match(html, /if \(projectLink\) \{/);
});

test('the project\'s price is one: ProjectPricing over every product', () => {
  assert.match(fn('priceProjectNow'), /ProjectPricing\.priceProject\(/);
  assert.match(fn('renderProjectPricing'), /Стоимость проекта/);
});

test('«Получить расчёт» of a project: one card for the whole project, its own link', () => {
  const piece = fn('projectPiece');
  assert.match(piece, /'Проект: '/);
  assert.match(piece, /ProjectModel\.buildProjectQuery\(project\)/);
  assert.match(fn('sendToRequest'), /projectPiece\(\)/);
  assert.match(fn('currentShareQuery'), /ProjectModel\.buildProjectQuery\(project\)/);
});

test('the Result of a project lists its products, each with its price and a way back to it', () => {
  assert.equal((html.match(/id="resultProject"/g) || []).length, 1);
  const render = fn('renderResultProject');
  assert.match(render, /switchToItem\(/);
  assert.match(render, /Изделия проекта|resultProject/);
});

test('the Result has its own «+ Добавить изделие»; the panel of a project is «Ваш проект»', () => {
  assert.equal((html.match(/id="resultAddBtn"/g) || []).length, 1);
  assert.match(html, /resultAddBtn'\)\.addEventListener\('click', addProjectItem\)/);
  assert.match(fn('renderProjectPricing'), /'Ваш проект'/);
});

test('the passport of a project: the project\'s page and each product\'s, shots of each product alone', () => {
  assert.match(fn('buildPassportFile'), /buildProjectPassportFile\(\)/);
  const project = fn('buildProjectPassportFile');
  assert.match(project, /PassportModel\.buildProjectPassport\(/);
  assert.match(project, /\{ only(: | \})/, 'each product shot alone');
  assert.match(fn('itemResultData'), /ProjectPricing\.priceItem\(/);
});

test('«Весь проект» in a room goes back to «Студия», where the whole project is', () => {
  assert.match(fn('renderViewerProject'), /data-room="studio"/);
});
