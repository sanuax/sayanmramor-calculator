const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const SoftHyphen = require('../soft-hyphen.js');

const show = (s) => s.split(SoftHyphen.SHY).join('-');

test('long card words get soft hyphens at syllable breaks (2026-11-16, the owner: no «Художественна / я»)', () => {
  assert.equal(show(SoftHyphen.word('Крупноформатные')), 'Круп-но-фор-мат-ные');
  assert.equal(show(SoftHyphen.word('Художественная')), 'Ху-до-жес-твен-ная');
  assert.equal(show(SoftHyphen.word('Интегрированная')), 'Ин-тег-ри-ро-ван-ная');
  assert.equal(show(SoftHyphen.word('Диагональная')), 'Диа-го-наль-ная');
});

test('short words, й/ь/ъ and the edges stay whole', () => {
  assert.equal(SoftHyphen.word('раскладка'), 'раскладка', 'under twelve letters: as is');
  for (const w of ['Крупноформатные', 'Художественная', 'Интегрированная', 'Диагональная', 'Декоративный', 'подступенками', 'Наименование']) {
    const parts = SoftHyphen.word(w).split(SoftHyphen.SHY);
    assert.equal(parts.join(''), w, w + ': the letters unchanged');
    parts.forEach((p) => assert.ok(p.length >= 2, w + ': ' + p));
    parts.slice(1).forEach((p) => assert.ok(!/^[йьъ]/i.test(p), w + ': no part starts with й/ь/ъ'));
  }
  assert.equal(show(SoftHyphen.text('Г-образная, 45°')), 'Г-образная, 45°', 'a hyphen of its own and numbers untouched');
});

test('the configurator loads soft-hyphen.js and keeps the cards hyphenated', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'sayanmramor-calculator.html'), 'utf8');
  assert.match(html, /<script src="soft-hyphen\.js(\?v=[0-9a-f]+)?"><\/script>/);
  assert.match(html, /SoftHyphen\.watch\(document\)/);
});
