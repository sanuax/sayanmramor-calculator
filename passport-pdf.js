// passport-pdf.js
//
// Draws the product passport (passport-model.js) as an A4 PDF, layout A from
// the owner's choice (2026-10-20): the header, the product's main view, two
// more views beside the stone, the sizes and works, the specification table
// with the total, and the link to the 3D model with its QR code. A table
// that does not fit goes on to a second page with the header again.
// The libraries come in as arguments (vendor/jspdf, vendor/qrcode): the page
// loads them only when the client asks for a passport.
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.PassportPdf = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {

  // The calculator's palette (sayanmramor-calculator.html :root).
  const INK = [28, 29, 27];
  const MUTED = [99, 100, 91];
  const LINE = [220, 216, 207];
  const STONE = [214, 209, 198];
  const ACCENT = [42, 84, 70];

  const PAGE_W = 210;
  const PAGE_H = 297;
  const M = 14;
  const W = PAGE_W - 2 * M;
  const BOTTOM = PAGE_H - M;
  const FOOT_H = 26;

  const SHOT_LABELS = { top: 'сверху', front: 'спереди', side: 'сбоку', iso: 'изометрия' };
  const NBSP = ' ';

  const rub = n => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  const qtyText = q => (q === null || q === undefined ? '' : String(q).replace('.', ','));

  function renderPassportPdf(passport, assets, libs) {
    const doc = new libs.jsPDF({ unit: 'mm', format: 'a4', compress: true });
    doc.addFileToVFS('Montserrat-Regular.ttf', assets.fonts.regular);
    doc.addFont('Montserrat-Regular.ttf', 'Montserrat', 'normal');
    doc.addFileToVFS('Montserrat-SemiBold.ttf', assets.fonts.semibold);
    doc.addFont('Montserrat-SemiBold.ttf', 'Montserrat', 'bold');
    doc.addFileToVFS('Unbounded-Medium.ttf', assets.fonts.display);
    doc.addFont('Unbounded-Medium.ttf', 'Unbounded', 'normal');
    doc.setProperties({ title: passport.fileName.replace(/\.pdf$/, ''), creator: 'Саянмрамор' });

    const font = (family, style, size, color) => {
      doc.setFont(family, style);
      doc.setFontSize(size);
      doc.setTextColor.apply(doc, color || INK);
    };
    let page = 1;
    let y = 0;

    function header() {
      font('Unbounded', 'normal', 10);
      doc.text('САЯНМРАМОР', M, M + 3);
      font('Montserrat', 'normal', 8, MUTED);
      doc.text('Паспорт № ' + passport.number + ' · ' + passport.dateText + (page > 1 ? ' · стр. ' + page : ''), PAGE_W - M, M + 3, { align: 'right' });
      doc.setDrawColor.apply(doc, LINE);
      doc.setLineWidth(0.3);
      doc.line(M, M + 6, PAGE_W - M, M + 6);
      y = M + 12;
    }
    function newPage() {
      doc.addPage();
      page += 1;
      header();
    }
    function image(dataUrl, x, top, w, h) {
      if (dataUrl) doc.addImage(dataUrl, 'JPEG', x, top, w, h, undefined, 'FAST');
      else {
        doc.setFillColor.apply(doc, STONE);
        doc.rect(x, top, w, h, 'F');
      }
    }
    function blockTitle(text, x, top) {
      font('Montserrat', 'bold', 7, MUTED);
      doc.text(text.toUpperCase(), x, top);
    }

    header();
    font('Unbounded', 'normal', 17);
    doc.text(passport.title, M, y + 4);
    y += 10;

    // The views: the product's own large, two more beside the stone.
    const shots = assets.shots || [];
    const hasShots = shots.some(Boolean);
    if (hasShots) {
      image(shots[0], M, y, W, W / 2.6);
      y += W / 2.6 + 4;
    }
    const colW = (W - 8) / 3;
    const smallH = colW * 0.66;
    const bandTop = y;
    if (hasShots) {
      [1, 2].forEach((i, n) => {
        const x = M + n * (colW + 4);
        image(shots[i], x, y, colW, smallH);
        font('Montserrat', 'normal', 7, MUTED);
        doc.text(SHOT_LABELS[passport.shots[i]] || '', x, y + smallH + 3.5);
      });
    }
    // The stone: its photograph and name.
    const stoneX = hasShots ? M + 2 * (colW + 4) : M;
    blockTitle('Камень', stoneX, bandTop + 2.5);
    image(assets.stonePhoto, stoneX, bandTop + 5, 22, 22);
    if (passport.stone) {
      font('Montserrat', 'bold', 9.5);
      doc.text(doc.splitTextToSize(passport.stone.name, colW - 25), stoneX + 25, bandTop + 9);
      font('Montserrat', 'normal', 7.5, MUTED);
      doc.text(doc.splitTextToSize(passport.stone.meta || '', colW - 25), stoneX + 25, bandTop + 18);
    }
    y = bandTop + Math.max(hasShots ? smallH + 10 : 0, 30);

    // Sizes on the left, edge and works on the right.
    const halfW = (W - 8) / 2;
    const rightX = M + halfW + 8;
    blockTitle('Размеры и параметры', M, y);
    blockTitle('Кромка и работы', rightX, y);
    let ly = y + 5;
    // The stone has its own block above, the edge stands with the works.
    (passport.specs || []).filter(s => s.key !== 'material' && s.key !== 'edge').forEach(s => {
      font('Montserrat', 'normal', 8, MUTED);
      doc.text(s.label, M, ly);
      font('Montserrat', 'bold', 8.5);
      const value = s.value + (s.detail ? '  ' : '');
      doc.text(value, M + 34, ly);
      if (s.detail) {
        font('Montserrat', 'normal', 7, MUTED);
        const lines = doc.splitTextToSize(s.detail, halfW - 36);
        ly += 3.6;
        doc.text(lines, M + 34, ly);
        ly += (lines.length - 1) * 3.2;
      }
      ly += 5;
    });
    let ry = y + 5;
    const works = (passport.works || []).slice();
    const edge = (passport.specs || []).find(s => s.key === 'edge');
    if (edge) works.unshift({ label: 'Кромка: ' + edge.value, detail: edge.detail });
    if (!works.length) {
      font('Montserrat', 'normal', 8.5, MUTED);
      doc.text('Без дополнительных работ', rightX, ry);
      ry += 5;
    }
    works.forEach(w => {
      font('Montserrat', 'normal', 8.5);
      const lines = doc.splitTextToSize(w.label, halfW - 18);
      doc.text(lines, rightX, ry);
      if (w.detail) {
        font('Montserrat', 'normal', 8, MUTED);
        doc.text(w.detail, PAGE_W - M, ry, { align: 'right' });
      }
      ry += lines.length * 4 + 1.5;
    });
    if (passport.note) {
      font('Montserrat', 'normal', 7, MUTED);
      const lines = doc.splitTextToSize(passport.note, halfW);
      doc.text(lines, M, ly);
      ly += lines.length * 3.2 + 1;
    }
    y = Math.max(ly, ry) + 3;

    // The specification.
    const spec = passport.specification;
    blockTitle('Спецификация', M, y);
    y += 3;
    if (spec.manual) {
      doc.setDrawColor.apply(doc, LINE);
      doc.rect(M, y, W, 11);
      font('Montserrat', 'bold', 10);
      doc.text(spec.manual, M + 4, y + 7);
      y += 15;
    } else {
      const cols = [
        { title: 'Наименование', x: M + 2, w: 90 },
        { title: 'Ед.', x: M + 96, w: 10 },
        { title: 'Кол-во', x: M + 124, align: 'right' },
        { title: 'Цена, ₽', x: M + 152, align: 'right' },
        { title: 'Сумма, ₽', x: PAGE_W - M - 2, align: 'right' },
      ];
      const tableHead = () => {
        doc.setFillColor(242, 241, 236);
        doc.rect(M, y, W, 6, 'F');
        font('Montserrat', 'bold', 7.5, MUTED);
        cols.forEach(c => doc.text(c.title, c.x, y + 4.1, c.align ? { align: c.align } : undefined));
        y += 6;
      };
      const room = h => {
        if (y + h <= BOTTOM) return;
        newPage();
        tableHead();
      };
      tableHead();
      spec.sections.forEach(section => {
        room(6);
        font('Montserrat', 'bold', 8);
        doc.text(section.title.toUpperCase(), M + 2, y + 4.2);
        y += 6;
        section.rows.forEach(r => {
          font('Montserrat', 'normal', 8);
          const lines = doc.splitTextToSize(r.name, cols[0].w);
          const h = lines.length * 3.6 + 2.6;
          room(h);
          doc.text(lines, cols[0].x, y + 3.8);
          doc.text(r.unit || '', cols[1].x, y + 3.8);
          doc.text(qtyText(r.qty), cols[2].x, y + 3.8, { align: 'right' });
          doc.text(r.priceRub ? rub(r.priceRub) : '', cols[3].x, y + 3.8, { align: 'right' });
          doc.text(rub(r.amountRub), cols[4].x, y + 3.8, { align: 'right' });
          y += h;
          doc.setDrawColor.apply(doc, LINE);
          doc.line(M, y, PAGE_W - M, y);
        });
      });
      room(10);
      doc.setFillColor.apply(doc, ACCENT);
      doc.rect(M, y + 1.5, W, 8, 'F');
      font('Montserrat', 'bold', 10, [255, 255, 255]);
      doc.text('Всего', M + 3, y + 7);
      doc.text(rub(spec.totalRub) + NBSP + '₽', PAGE_W - M - 3, y + 7, { align: 'right' });
      y += 12;
    }

    // The foot: the prices' date and the way back to the 3D model.
    if (y + FOOT_H > BOTTOM) newPage();
    const footTop = BOTTOM - FOOT_H + 4;
    doc.setDrawColor.apply(doc, LINE);
    doc.line(M, footTop - 3, PAGE_W - M, footTop - 3);
    const qrSize = 22;
    drawQr(doc, libs.qrcode, passport.link, M, footTop, qrSize);
    font('Montserrat', 'bold', 9.5);
    doc.textWithLink('Открыть 3D-модель', M + qrSize + 5, footTop + 5, { url: passport.link });
    font('Montserrat', 'normal', 7.5, MUTED);
    doc.text(doc.splitTextToSize('Наведите камеру телефона на код или нажмите на ссылку: откроется калькулятор с этим изделием, его можно вращать.', W - qrSize - 5), M + qrSize + 5, footTop + 10);
    const priceNote = (passport.pricesDateText ? 'Цены на ' + passport.pricesDateText + '. ' : '') +
      'Цена предварительная. Доставку и окончательную стоимость рассчитает менеджер.';
    doc.text(doc.splitTextToSize(priceNote, W - qrSize - 5), M + qrSize + 5, footTop + 18);

    return new Uint8Array(doc.output('arraybuffer'));
  }

  function drawQr(doc, qrcode, text, x, top, size) {
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    const count = qr.getModuleCount();
    const cell = size / count;
    doc.setFillColor.apply(doc, INK);
    for (let r = 0; r < count; r++) {
      for (let c = 0; c < count; c++) {
        if (qr.isDark(r, c)) doc.rect(x + c * cell, top + r * cell, cell + 0.01, cell + 0.01, 'F');
      }
    }
  }

  return { renderPassportPdf };
});
