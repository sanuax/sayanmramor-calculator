// tests/step-placement.test.js
//
// Where a choice is asked (the owner, 2026-11-14):
//  - a countertop's wing sizes («Крыло, ширина / длина», the corner) are asked with the other sizes, in the
//    «Размеры» step, not under the form cards of the «Форма» step;
//  - «Ступени»: with or without risers is asked in the first step, as for «Лестницы» (the second question of the
//    «Тип» step), and the riser's height with the sizes in the second step; there is no «Подступенок» step.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'sayanmramor-calculator.html'), 'utf8');
const StepEngine = require('../step-engine.js');
const ResultModel = require('../result-model.js');

const sectionOf = stepId => {
  const start = html.indexOf('data-step-id="' + stepId + '"');
  assert.ok(start > 0, 'the step ' + stepId + ' exists');
  return html.slice(start, html.indexOf('</section>', start));
};

test('countertops: the wing sizes and the corner are in the sizes step, not under the form cards', () => {
  const shape = sectionOf('shape'), dims = sectionOf('dimensions');
  ['id="wingField"', 'id="wing-width"', 'id="wing-length"', 'id="shape-corner"', 'id="wingWidthLabel"', 'id="wingLengthLabel"'].forEach(s => {
    assert.ok(!shape.includes(s), 'not in «Форма»: ' + s);
    assert.ok(dims.includes(s), 'in «Размеры»: ' + s);
  });
  // The form step keeps its cards and the select the price reads.
  assert.ok(shape.includes('id="shapeCardGrid"') && shape.includes('id="productShape"'));
});

test('the wing fields show only for a product that has a shape (they now share the sizes step with every product)', () => {
  const fn = html.slice(html.indexOf('function updateWingVisibility()'), html.indexOf('function svgIcon('));
  assert.match(fn, /const hasShape = !!\(product && product\.supportsShapeSelection\);/);
  assert.match(fn, /wingField\.style\.display = hasShape && \(isLshape \|\| isUshape\) \? '' : 'none';/);
  assert.match(fn, /shapeCornerSelect\.style\.display = hasShape && isLshape \? '' : 'none';/);
});

test('«Ступени»: the steps are type, sizes, material, edge, options, result (no «Подступенок» step)', () => {
  assert.deepEqual(StepEngine.getSteps('stupeni'), ['type', 'dimensions', 'material', 'edge', 'options', 'review']);
  assert.ok(!('riser' in StepEngine.STEP_LABELS));
  assert.deepEqual(StepEngine.getSteps('lestnitsa'), ['type', 'dimensions', 'material', 'edge', 'options', 'review']);
  assert.ok(!html.includes('data-step-id="riser"'));
  assert.ok(!html.includes('stupeniRiserGrid') && !html.includes('riserStepHost'));
});

test('«Ступени»: with / without risers is the second question of the first step, as for a stair', () => {
  const type = sectionOf('type');
  assert.ok(type.includes('id="stairRiserField"') && type.includes('id="stairRiserGrid"'));
  assert.ok(type.includes('id="stupeni-riser"'), 'the field the price reads lives with the cards that drive it');
  assert.match(html, /if \(productKey === 'lestnitsa' \|\| productKey === 'stupeni'\) \{/);
  // The riser's height is asked with the sizes, for both products.
  const dims = sectionOf('dimensions');
  assert.ok(dims.includes('id="riserHeightField"') && dims.includes('id="riser-height"'));
  const place = html.slice(html.indexOf('function placeRiserHeightField()'), html.indexOf('// «Лестницы» with marches'));
  assert.doesNotMatch(place, /riserStepHost/);
  assert.match(place, /riserHeightField\.hidden = !\(stairRisers \|\| stepRisers\);/);
});

test('«Ступени»: the sizes step asks the riser height once risers are chosen (it is no longer left to a step of its own)', () => {
  const fn = html.slice(html.indexOf('function isCurrentStepDataValid('), html.indexOf('// The progress strip is also the step navigation'));
  assert.doesNotMatch(fn, /stepId === 'riser'/);
  assert.doesNotMatch(fn, /k !== 'riserHeight' \|\| selectedProductKey !== 'stupeni'/);
});

test('the result: a wing is on the «Размеры» card, a step\'s risers on the «Тип» card', () => {
  const view = { specs: [{ key: 'shape', label: 'Форма', value: 'Г-образная' }, { key: 'wing', label: 'Крыло', value: '1200 × 600 мм' }] };
  const kitchen = ResultModel.buildResultCards(view, StepEngine.getSteps('stoleshnitsa_kuhnya'), StepEngine.STEP_LABELS);
  assert.deepEqual(kitchen.find(c => c.stepId === 'shape').items.map(i => i.key), ['shape']);
  assert.deepEqual(kitchen.find(c => c.stepId === 'dimensions').items.map(i => i.key), ['wing']);
  const steps = ResultModel.buildResultCards({ specs: [{ key: 'riser', label: 'Подступенки', value: 'С подступенками' }] }, StepEngine.getSteps('stupeni'), StepEngine.STEP_LABELS);
  assert.deepEqual(steps.find(c => c.stepId === 'type').items.map(i => i.key), ['riser']);
});
