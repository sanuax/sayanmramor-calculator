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

// ---- the final review's fixes (2026-11-18) ----
test('the counts of a product not edited are read through the fields they mirror; the edited one is priced from the form', () => {
  assert.match(html, /const PROJECT_MIRRORS = \{ 'step-count': 'stepCountInput', 'facade-quantity': 'facadeQtyInput' \};/);
  assert.match(fn('itemComputed'), /PROJECT_MIRRORS/);
  assert.match(fn('priceProjectNow'), /lastCalcSnapshot/);
});

test('a stored project of several products is not overwritten by a page opened for one product', () => {
  assert.match(fn('storeProject'), /projectOwned/);
});

test('a stock that is short for all the products of a stone together is said in words', () => {
  assert.match(fn('projectReasonText'), /не хватает/);
  assert.match(fn('renderProjectPricing'), /projectReasonText\(p\)/);
  assert.match(fn('renderResultProject'), /projectReasonText\(p\)/);
});

test('the per-product memories of the form go back to their start too', () => {
  const reset = fn('resetFormToInitial');
  ['stepCountByProduct', 'facadeQtyByType', 'facadeSizesByType', 'fireplaceSizesByType', 'facadeFieldsOwner', 'fireplaceFieldsOwner'].forEach(n => assert.match(reset, new RegExp(n), n));
});

test('no product on screen: the 3D buttons for it (edge, sizes, AR, rooms) are refreshed', () => {
  assert.match(fn('updateProjectScene'), /updateViewerButtons\(\)/);
});

test('a product the calculator does not know never reaches the form', () => {
  assert.match(html, /ProjectModel\.deserialize\(localStorage\.getItem\(PROJECT_STORE_KEY\), isKnownProduct\)/);
  assert.match(html, /ProjectModel\.readProjectQuery\(bootstrapParams, passportFieldControls\(\)\.map\(el => el\.id\), isKnownProduct\)/);
});
