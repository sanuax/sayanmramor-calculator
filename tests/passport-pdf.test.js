// tests/passport-pdf.test.js
//
// The passport PDF, drawn with the same vendor libraries the page loads.
// The text in the PDF is glyph ids (an embedded font), so what was written
// where is read from a jsPDF that records its text() calls per page.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { jsPDF } = require('../vendor/jspdf/jspdf.umd.min.js');
const qrcode = require('../vendor/qrcode/qrcode.js');
const PassportPdf = require('../passport-pdf.js');

const font = f => fs.readFileSync(path.join(__dirname, '..', 'vendor', 'fonts', f)).toString('base64');
const FONTS = { regular: font('Montserrat-Regular.ttf'), semibold: font('Montserrat-SemiBold.ttf'), display: font('Unbounded-Medium.ttf') };
// A 4 x 3 grey JPEG, made by a browser canvas the way the page makes its shots.
const PIXEL = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAADAAQDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAT/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAgP/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCIBIn/2Q==';

function recordingJsPDF() {
  const pages = [];
  const calls = [];
  // jsPDF puts its methods on each instance, so text() is wrapped there.
  class Recording extends jsPDF {
    constructor(options) {
      super(options);
      const text = this.text;
      this.text = (value, x, y, opts) => {
        const page = this.getCurrentPageInfo().pageNumber;
        (pages[page - 1] = pages[page - 1] || []).push([].concat(value).join(' '));
        calls.push({ value, x, y });
        return text.call(this, value, x, y, opts);
      };
    }
  }
  return { Recording, pages, calls };
}

function passportDoc(over) {
  return Object.assign({
    number: '261020-0173', dateText: '20.10.2026', title: 'Столешница на кухню',
    fileName: 'Паспорт - Столешница на кухню - 20.10.2026.pdf',
    shots: ['iso-eye-level', 'top', 'front'],
    stone: { name: 'Delicato Brown', meta: 'Мрамор · Оман', imagePath: 'data/images/delicato-brown.webp' },
    specs: [
      { key: 'shape', label: 'Форма', value: 'Прямая', detail: '' },
      { key: 'dimensions', label: 'Размер', value: '2400 × 650 мм', detail: 'длина × ширина · 1,56 м²' },
      { key: 'material', label: 'Материал', value: 'Delicato Brown', detail: 'Мрамор · Оман' },
      { key: 'edge', label: 'Кромка', value: 'Скос (фаска)', detail: '' },
    ],
    works: [{ key: 'cooktop', label: 'Вырез под варочную панель', detail: '1 шт.' }],
    note: null,
    specification: { sections: [
      { title: 'Камень', rows: [{ name: 'Слэб Delicato Brown, 3000 × 1800 мм', unit: 'шт.', qty: 1, priceRub: 44315, amountRub: 44315 }] },
      { title: 'Изготовление', rows: [{ name: 'Изготовление изделия', unit: 'м²', qty: 1.56, priceRub: 37500, amountRub: 58500 }] },
      { title: 'Монтаж', rows: [{ name: 'Монтаж', unit: 'м²', qty: 1.56, priceRub: 17500, amountRub: 27300 }] },
    ], totalRub: 130115 },
    pricesDateText: '15.09.2026',
    link: 'http://localhost:8010/sayanmramor-calculator/sayanmramor-calculator.html?product=stoleshnitsa_kuhnya&stone=delicato-brown&pv=1&length=2400',
  }, over);
}

const assets = over => Object.assign({ fonts: FONTS, shots: [PIXEL, PIXEL, PIXEL], stonePhoto: PIXEL }, over);
const pageCount = bytes => (Buffer.from(bytes).toString('latin1').match(/\/Type \/Page[^s]/g) || []).length;

test('a kitchen passport: a PDF of one page, under 3 MB, with the total', () => {
  const { Recording, pages } = recordingJsPDF();
  const bytes = PassportPdf.renderPassportPdf(passportDoc(), assets(), { jsPDF: Recording, qrcode });
  assert.ok(bytes instanceof Uint8Array);
  assert.equal(Buffer.from(bytes.slice(0, 4)).toString('latin1'), '%PDF');
  assert.equal(pageCount(bytes), 1);
  assert.ok(bytes.length < 3 * 1024 * 1024, bytes.length + ' bytes');
  const text = pages[0].join('\n');
  ['САЯНМРАМОР', 'Столешница на кухню', '261020-0173', 'Delicato Brown', 'Всего', 'Открыть 3D-модель', 'Цены на 15.09.2026'].forEach(s => assert.ok(text.includes(s), s));
  assert.ok(text.includes('130 115'), 'the total, grouped by thousands');
  assert.doesNotMatch(text, /—/);
});

test('a long specification goes on to a second page, the total there', () => {
  const rows = Array.from({ length: 16 }, (_, i) => ({ name: 'Позиция ' + (i + 1) + ' с длинным названием, которое переносится на вторую строку таблицы', unit: 'шт.', qty: 1, priceRub: 1000, amountRub: 1000 }));
  const doc = passportDoc({ specification: { sections: [{ title: 'Кромка и дополнительные работы', rows }], totalRub: 16000 } });
  const { Recording, pages } = recordingJsPDF();
  const bytes = PassportPdf.renderPassportPdf(doc, assets(), { jsPDF: Recording, qrcode });
  assert.equal(pageCount(bytes), 2);
  assert.ok(pages[1].join('\n').includes('Всего'));
  assert.ok(pages[1].join('\n').includes('САЯНМРАМОР'), 'the header again on page 2');
});

test('without shots and without the stone photo it still makes one page', () => {
  const bytes = PassportPdf.renderPassportPdf(passportDoc(), assets({ shots: [null, null, null], stonePhoto: null }), { jsPDF, qrcode });
  assert.equal(Buffer.from(bytes.slice(0, 4)).toString('latin1'), '%PDF');
  assert.equal(pageCount(bytes), 1);
});

test('a price for the manager: the line instead of the table', () => {
  const { Recording, pages } = recordingJsPDF();
  PassportPdf.renderPassportPdf(passportDoc({ specification: { manual: 'Стоимость рассчитает менеджер' } }), assets(), { jsPDF: Recording, qrcode });
  const text = pages.flat().join('\n');
  assert.ok(text.includes('Стоимость рассчитает менеджер'));
  assert.ok(!text.includes('Всего'));
});

test('a long parameter name wraps in its column instead of running into the value', () => {
  const doc = passportDoc({ specs: [{ key: 'fireplace.area', label: 'Площадь камня каминного портала с полкой', value: '2,20 м²', detail: '' }] });
  const { Recording, calls } = recordingJsPDF();
  PassportPdf.renderPassportPdf(doc, assets(), { jsPDF: Recording, qrcode });
  const label = calls.find(c => [].concat(c.value).join(' ') === 'Площадь камня каминного портала с полкой');
  assert.ok(Array.isArray(label.value) && label.value.length > 1, 'the label in two lines');
});

test('a long manager message wraps inside its box', () => {
  const message = 'Камень: ≈ 42 422 ₽. Стоимость изготовления, монтажа и полировки уточнит менеджер, когда получит размеры и фотографии объекта.';
  const { Recording, calls } = recordingJsPDF();
  PassportPdf.renderPassportPdf(passportDoc({ specification: { manual: message } }), assets(), { jsPDF: Recording, qrcode });
  const box = calls.find(c => [].concat(c.value).join(' ') === message);
  assert.ok(Array.isArray(box.value) && box.value.length > 1);
});

test('a staircase with six parameters and four table rows still fits one page, the QR code with it', () => {
  const doc = passportDoc({
    title: 'Лестница',
    specs: [
      { key: 'type', label: 'Тип', value: 'Винтовая, с подступенками', detail: '' },
      { key: 'dimensions', label: 'Размер лестницы', value: '2200 × 880 мм', detail: 'диаметр лестницы × ширина ступени' },
      { key: 'steps', label: 'Количество ступеней', value: '3 шт.', detail: '' },
      { key: 'shape.riser', label: 'Высота подступенка', value: '187 мм', detail: '' },
      { key: 'area', label: 'Площадь облицовки', value: '0,79 м²', detail: '' },
      { key: 'options', label: 'Опции', value: 'Дополнительная полировка, Монтаж на объекте', detail: '' },
    ],
    works: [],
    specification: { sections: [
      { title: 'Камень', rows: [{ name: 'Слэб Delicato Brown, 1960 × 1540 мм', unit: 'шт.', qty: 1, priceRub: 36662, amountRub: 36662 }] },
      { title: 'Изготовление', rows: [
        { name: 'Изготовление изделия', unit: 'м²', qty: 0.79, priceRub: 67500, amountRub: 53460 },
        { name: 'Полировка', unit: 'м²', qty: 0.79, priceRub: 32400, amountRub: 25661 },
      ] },
      { title: 'Монтаж', rows: [{ name: 'Монтаж', unit: 'м²', qty: 0.79, priceRub: 31500, amountRub: 24948 }] },
    ], totalRub: 140731 },
  });
  const bytes = PassportPdf.renderPassportPdf(doc, assets(), { jsPDF, qrcode });
  assert.equal(pageCount(bytes), 1);
});

test('a stone photo that came out empty degrades to the grey square, the passport still made', () => {
  const bytes = PassportPdf.renderPassportPdf(passportDoc(), assets({ stonePhoto: 'data:,' , shots: ['data:,', PIXEL, null] }), { jsPDF, qrcode });
  assert.equal(pageCount(bytes), 1);
});

test('the QR code: low error correction and 22 mm, so a long link still prints with readable modules', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'passport-pdf.js'), 'utf8');
  assert.match(src, /qrcode\(0, 'L'\)/);
  assert.match(src, /const qrSize = 22;/);
});
