// tests/step-engine.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const StepEngine = require('../step-engine.js');

test('getSteps returns [] for an unknown or missing product key', () => {
  assert.deepEqual(StepEngine.getSteps('does-not-exist'), []);
  assert.deepEqual(StepEngine.getSteps(null), []);
  assert.deepEqual(StepEngine.getSteps(undefined), []);
});

test('getSteps returns the full declared sequence, ending in "review", for a real product', () => {
  const steps = StepEngine.getSteps('stoleshnitsa_kuhnya');
  assert.deepEqual(steps, ['shape', 'dimensions', 'material', 'edge', 'additionalWorks', 'options', 'review']);
});

test('every product in PRODUCT_STEPS ends with "review" -- it is always the last step regardless of product', () => {
  Object.keys(StepEngine.PRODUCT_STEPS).forEach(key => {
    const steps = StepEngine.PRODUCT_STEPS[key];
    assert.equal(steps[steps.length - 1], 'review', `product "${key}" must end with review`);
  });
});

test('a product missing a capability skips that step entirely -- e.g. podokonnik has no "shape" or "additionalWorks"', () => {
  const steps = StepEngine.getSteps('podokonnik');
  assert.equal(steps.includes('shape'), false);
  assert.equal(steps.includes('additionalWorks'), false);
  assert.deepEqual(steps, ['dimensions', 'material', 'edge', 'options', 'review']);
});

test('firstStep/lastStep reflect each product\'s own sequence', () => {
  assert.equal(StepEngine.firstStep('stoleshnitsa_kuhnya'), 'shape');
  assert.equal(StepEngine.lastStep('stoleshnitsa_kuhnya'), 'review');
  assert.equal(StepEngine.firstStep('podokonnik'), 'dimensions');
  assert.equal(StepEngine.lastStep('podokonnik'), 'review');
  assert.equal(StepEngine.firstStep('unknown-product'), null);
  assert.equal(StepEngine.lastStep('unknown-product'), null);
});

test('isFirstStep/isLastStep', () => {
  assert.equal(StepEngine.isFirstStep('stoleshnitsa_kuhnya', 'shape'), true);
  assert.equal(StepEngine.isFirstStep('stoleshnitsa_kuhnya', 'dimensions'), false);
  assert.equal(StepEngine.isLastStep('stoleshnitsa_kuhnya', 'review'), true);
  assert.equal(StepEngine.isLastStep('stoleshnitsa_kuhnya', 'options'), false);
  // A step id that isn't even in this product's list is neither first nor last.
  assert.equal(StepEngine.isFirstStep('podokonnik', 'shape'), false);
  assert.equal(StepEngine.isLastStep('podokonnik', 'shape'), false);
});

test('nextStep walks the product\'s own sequence and returns null past the end', () => {
  assert.equal(StepEngine.nextStep('stoleshnitsa_kuhnya', 'shape'), 'dimensions');
  assert.equal(StepEngine.nextStep('stoleshnitsa_kuhnya', 'options'), 'review');
  assert.equal(StepEngine.nextStep('stoleshnitsa_kuhnya', 'review'), null);
  // Skips straight over a step this product doesn't have -- podokonnik has
  // no 'shape'/'additionalWorks', so 'edge' goes straight to 'options'.
  assert.equal(StepEngine.nextStep('podokonnik', 'material'), 'edge');
  assert.equal(StepEngine.nextStep('podokonnik', 'edge'), 'options');
});

test('previousStep walks backwards and returns null before the start', () => {
  assert.equal(StepEngine.previousStep('stoleshnitsa_kuhnya', 'dimensions'), 'shape');
  assert.equal(StepEngine.previousStep('stoleshnitsa_kuhnya', 'shape'), null);
  assert.equal(StepEngine.previousStep('podokonnik', 'edge'), 'material');
});

test('nextStep/previousStep return null for a step id that is not in the product\'s own list', () => {
  assert.equal(StepEngine.nextStep('podokonnik', 'shape'), null);
  assert.equal(StepEngine.previousStep('podokonnik', 'additionalWorks'), null);
});

test('isValidStepId', () => {
  assert.equal(StepEngine.isValidStepId('stoleshnitsa_kuhnya', 'shape'), true);
  assert.equal(StepEngine.isValidStepId('podokonnik', 'shape'), false);
  assert.equal(StepEngine.isValidStepId('podokonnik', 'material'), true);
});

test('resolveCurrentStep falls back to the first step when no desired step is given (product just switched)', () => {
  assert.equal(StepEngine.resolveCurrentStep('stoleshnitsa_kuhnya', null), 'shape');
  assert.equal(StepEngine.resolveCurrentStep('podokonnik', undefined), 'dimensions');
});

test('resolveCurrentStep keeps the desired step when it is still valid for this product -- state/step is preserved across an unrelated recalculation', () => {
  assert.equal(StepEngine.resolveCurrentStep('stoleshnitsa_kuhnya', 'edge'), 'edge');
});

test('resolveCurrentStep falls back to the first step when the desired step does not exist for THIS product -- e.g. after switching from kitchen (has "shape") to podokonnik (does not)', () => {
  assert.equal(StepEngine.resolveCurrentStep('podokonnik', 'shape'), 'dimensions');
});

test('resolveCurrentStep returns null for a product with no steps at all', () => {
  assert.equal(StepEngine.resolveCurrentStep('unknown-product', 'shape'), null);
});

test('canAdvance is true only when there is a next step AND the current step is valid', () => {
  assert.equal(StepEngine.canAdvance('stoleshnitsa_kuhnya', 'shape', true), true);
  assert.equal(StepEngine.canAdvance('stoleshnitsa_kuhnya', 'shape', false), false);
  // Last step: no next step exists, regardless of validity.
  assert.equal(StepEngine.canAdvance('stoleshnitsa_kuhnya', 'review', true), false);
});

test('canAdvance treats undefined/omitted validity as valid (steps with no blocking data, e.g. "edge")', () => {
  assert.equal(StepEngine.canAdvance('stoleshnitsa_kuhnya', 'edge', undefined), true);
});

test('buildProgress lists every step of the product with 1-based position and correct active/done flags', () => {
  const progress = StepEngine.buildProgress('stoleshnitsa_kuhnya', 'edge');
  assert.equal(progress.length, 7);
  assert.deepEqual(progress.map(p => p.id), ['shape', 'dimensions', 'material', 'edge', 'additionalWorks', 'options', 'review']);
  assert.deepEqual(progress.map(p => p.position), [1, 2, 3, 4, 5, 6, 7]);
  const active = progress.filter(p => p.active);
  assert.equal(active.length, 1);
  assert.equal(active[0].id, 'edge');
  assert.deepEqual(progress.filter(p => p.done).map(p => p.id), ['shape', 'dimensions', 'material']);
  assert.equal(progress.find(p => p.id === 'options').done, false);
  assert.equal(progress.find(p => p.id === 'review').done, false);
});

test('buildProgress carries human-readable labels from STEP_LABELS', () => {
  const progress = StepEngine.buildProgress('podokonnik', 'dimensions');
  assert.equal(progress.find(p => p.id === 'dimensions').label, 'Размеры');
  assert.equal(progress.find(p => p.id === 'review').label, 'Проверка');
});

test('buildProgress on an unknown product returns an empty list, not a throw', () => {
  assert.deepEqual(StepEngine.buildProgress('unknown-product', null), []);
});

test('different PRODUCT_STEPS sets behave independently -- kitchen and podokonnik never leak steps into each other', () => {
  const kitchenSteps = StepEngine.getSteps('stoleshnitsa_kuhnya');
  const sillSteps = StepEngine.getSteps('podokonnik');
  assert.equal(kitchenSteps.includes('shape'), true);
  assert.equal(sillSteps.includes('shape'), false);
  assert.equal(kitchenSteps.length, 7);
  assert.equal(sillSteps.length, 5);
});
