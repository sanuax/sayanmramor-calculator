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
  const GAP = 4;

  // One type scale (2026-10-20, the owner: «у заголовков одно, у основного
  // другое»): each step about 1.2 times the one below -- the small print,
  // the body, the headings -- and the product's name on top. Line height
  // 1.4 of the size, in mm.
  const TYPE = { title: 17, heading: 10, body: 8.5, small: 7 };
  const LH = size => size * 0.3528 * 1.4;

  // The views on one grid: three equal cells across the page (two views and
  // the stone's photograph, all of one size) under the main view, which is
  // one and a half cells high. The page captures the shots at these shapes.
  const CELL_W = (W - 2 * GAP) / 3;
  const CELL_H = CELL_W / 1.6;
  const MAIN_H = CELL_H * 1.5;
  const MAIN_RATIO = W / MAIN_H;
  const SMALL_RATIO = CELL_H / CELL_W;

  // The parameters' names column: «Количество ступеней» on one line.
  const LABEL_W = 38;
  // Between the parameters' rows, and above / below a table row's text.
  const ROW_PAD = 0.8;
  const CELL_PAD = 0.6;
  const QR = 22;
  const FOOT_H = QR + 4;
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

    // text(role, weight, color): role is a TYPE step; the display face only for the name and the title.
    const font = (role, weight, color) => {
      if (role === 'title' || weight === 'display') doc.setFont('Unbounded', 'normal');
      else doc.setFont('Montserrat', weight === 'bold' ? 'bold' : 'normal');
      doc.setFontSize(TYPE[role]);
      doc.setTextColor.apply(doc, color || INK);
    };
    const wrap = (text, width) => doc.splitTextToSize(String(text), width);
    const one = lines => (lines.length > 1 ? lines : lines[0]);
    let page = 1;
    let y = 0;

    function header() {
      font('heading', 'display');
      doc.text('САЯНМРАМОР', M, M + 3);
      font('small', 'normal', MUTED);
      doc.text('Паспорт № ' + passport.number + ' · ' + passport.dateText + (page > 1 ? ' · стр. ' + page : ''), PAGE_W - M, M + 3, { align: 'right' });
      doc.setDrawColor.apply(doc, LINE);
      doc.setLineWidth(0.3);
      doc.line(M, M + 6, PAGE_W - M, M + 6);
      y = M + 6 + GAP + 2;
    }
    function newPage() {
      doc.addPage();
      page += 1;
      header();
    }
    function image(dataUrl, x, top, w, h) {
      try {
        if (dataUrl && dataUrl.length > 30) {
          doc.addImage(dataUrl, 'JPEG', x, top, w, h, undefined, 'FAST');
          return;
        }
      } catch (err) { /* an unreadable picture: the grey cell below */ }
      doc.setFillColor.apply(doc, STONE);
      doc.rect(x, top, w, h, 'F');
    }
    function heading(text, x) {
      font('heading', 'bold');
      doc.text(text, x, y + LH(TYPE.heading) * 0.75);
    }

    header();
    font('title');
    doc.text(passport.title, M, y + LH(TYPE.title) * 0.7);
    y += LH(TYPE.title) + GAP;

    // The views and the stone, on the grid.
    const shots = assets.shots || [];
    const hasShots = shots.some(Boolean);
    if (hasShots) {
      image(shots[0], M, y, W, MAIN_H);
      y += MAIN_H + GAP;
    }
    const captionY = y + CELL_H + LH(TYPE.small);
    if (hasShots) {
      [1, 2].forEach((i, n) => {
        const x = M + n * (CELL_W + GAP);
        image(shots[i], x, y, CELL_W, CELL_H);
        font('small', 'normal', MUTED);
        doc.text(SHOT_LABELS[passport.shots[i]] || '', x, captionY);
      });
    }
    const stoneX = hasShots ? M + 2 * (CELL_W + GAP) : M;
    image(assets.stonePhoto, stoneX, y, CELL_W, CELL_H);
    let captionBottom = captionY;
    if (passport.stone) {
      font('body', 'bold');
      const name = wrap(passport.stone.name, CELL_W);
      doc.text(one(name), stoneX, captionY);
      if (passport.stone.meta) {
        font('small', 'normal', MUTED);
        captionBottom = captionY + (name.length - 1) * LH(TYPE.body) + LH(TYPE.small);
        doc.text(passport.stone.meta, stoneX, captionBottom);
      }
    }
    y = captionBottom + GAP + 2;

    // Sizes on the left, edge and works on the right.
    const halfW = (W - 2 * GAP) / 2;
    const rightX = M + halfW + 2 * GAP;
    heading('Размеры и параметры', M);
    heading('Кромка и работы', rightX);
    y += LH(TYPE.heading) + GAP / 2;
    const rowTop = y;
    let ly = y + LH(TYPE.body) * 0.75;
    // The stone has its own cell above, the edge stands with the works.
    (passport.specs || []).filter(s => s.key !== 'material' && s.key !== 'edge').forEach(s => {
      font('body', 'normal', MUTED);
      const label = wrap(s.label, LABEL_W - 2);
      doc.text(one(label), M, ly);
      font('body', 'bold');
      const value = wrap(s.value, halfW - LABEL_W);
      doc.text(one(value), M + LABEL_W, ly);
      let rowH = Math.max(label.length, value.length) * LH(TYPE.body);
      if (s.detail) {
        font('small', 'normal', MUTED);
        const lines = wrap(s.detail, halfW - LABEL_W);
        doc.text(lines, M + LABEL_W, ly + value.length * LH(TYPE.body) - 0.6);
        rowH = Math.max(rowH, value.length * LH(TYPE.body) + lines.length * LH(TYPE.small));
      }
      ly += rowH + ROW_PAD;
    });
    if (passport.note) {
      font('small', 'normal', MUTED);
      const lines = wrap(passport.note, halfW);
      doc.text(lines, M, ly);
      ly += lines.length * LH(TYPE.small) + ROW_PAD;
    }
    let ry = rowTop + LH(TYPE.body) * 0.75;
    const works = (passport.works || []).slice();
    const edge = (passport.specs || []).find(s => s.key === 'edge');
    if (edge) works.unshift({ label: 'Кромка: ' + edge.value, detail: edge.detail });
    if (!works.length) {
      font('body', 'normal', MUTED);
      doc.text('Без дополнительных работ', rightX, ry);
      ry += LH(TYPE.body) + ROW_PAD;
    }
    works.forEach(w => {
      font('body', 'normal');
      const lines = wrap(w.label, halfW - 18);
      doc.text(one(lines), rightX, ry);
      if (w.detail) {
        font('body', 'normal', MUTED);
        doc.text(w.detail, PAGE_W - M, ry, { align: 'right' });
      }
      ry += lines.length * LH(TYPE.body) + ROW_PAD;
    });
    y = Math.max(ly, ry) - LH(TYPE.body) * 0.75 + GAP + 2;

    // The specification. A table that does not fit flows on to the next page,
    // its last row and the total always with the foot (never the foot alone).
    const spec = passport.specification;
    const rowH = r => wrap(r.name, 90).length * LH(TYPE.body) + 2 * CELL_PAD;
    const sectionH = LH(TYPE.body) + 2 * CELL_PAD;
    const totalH = 8;
    if (y + LH(TYPE.heading) + GAP / 2 + 6 + sectionH + GAP > BOTTOM - FOOT_H) newPage();
    heading('Спецификация', M);
    y += LH(TYPE.heading) + GAP / 2;
    if (spec.manual) {
      font('heading', 'bold');
      const lines = wrap(spec.manual, W - 8);
      const boxH = lines.length * LH(TYPE.heading) + 6;
      doc.setDrawColor.apply(doc, LINE);
      doc.rect(M, y, W, boxH);
      doc.text(one(lines), M + 4, y + 3 + LH(TYPE.heading) * 0.75);
      y += boxH + GAP;
    } else {
      const cols = [
        { title: 'Наименование', x: M + 2 },
        { title: 'Ед.', x: M + 96 },
        { title: 'Кол-во', x: M + 124, align: 'right' },
        { title: 'Цена, ₽', x: M + 152, align: 'right' },
        { title: 'Сумма, ₽', x: PAGE_W - M - 2, align: 'right' },
      ];
      const tableHead = () => {
        doc.setFillColor(242, 241, 236);
        doc.rect(M, y, W, 6, 'F');
        font('small', 'bold', MUTED);
        cols.forEach(c => doc.text(c.title, c.x, y + 4, c.align ? { align: c.align } : undefined));
        y += 6;
      };
      const room = h => {
        if (y + h <= BOTTOM) return;
        newPage();
        tableHead();
      };
      tableHead();
      const lastRow = spec.sections[spec.sections.length - 1].rows.slice(-1)[0];
      spec.sections.forEach(section => {
        room(sectionH + rowH(section.rows[0]));
        font('body', 'bold');
        doc.text(section.title, cols[0].x, y + CELL_PAD + LH(TYPE.body) * 0.75);
        y += sectionH;
        section.rows.forEach(r => {
          font('body', 'normal');
          const lines = wrap(r.name, 90);
          const h = rowH(r);
          room(r === lastRow ? h + 1.5 + totalH + FOOT_H : h);
          const by = y + CELL_PAD + LH(TYPE.body) * 0.75;
          doc.text(one(lines), cols[0].x, by);
          doc.text(r.unit || '', cols[1].x, by);
          doc.text(qtyText(r.qty), cols[2].x, by, { align: 'right' });
          doc.text(r.priceRub ? rub(r.priceRub) : '', cols[3].x, by, { align: 'right' });
          doc.text(rub(r.amountRub), cols[4].x, by, { align: 'right' });
          y += h;
          doc.setDrawColor.apply(doc, LINE);
          doc.line(M, y, PAGE_W - M, y);
        });
      });
      room(totalH + 1.5);
      doc.setFillColor.apply(doc, ACCENT);
      doc.rect(M, y + 1.5, W, totalH, 'F');
      font('heading', 'bold', [255, 255, 255]);
      doc.text('Всего', M + 3, y + 1.5 + totalH / 2 + LH(TYPE.heading) * 0.25);
      doc.text(rub(spec.totalRub) + NBSP + '₽', PAGE_W - M - 3, y + 1.5 + totalH / 2 + LH(TYPE.heading) * 0.25, { align: 'right' });
      y += totalH + 1.5;
    }

    // The foot hangs at the page's bottom: the prices' date and the way back to the 3D model.
    if (y > BOTTOM - FOOT_H) newPage();
    const footTop = BOTTOM - QR;
    doc.setDrawColor.apply(doc, LINE);
    doc.line(M, footTop - GAP / 2, PAGE_W - M, footTop - GAP / 2);
    drawQr(doc, libs.qrcode, passport.link, M, footTop, QR);
    const textX = M + QR + 2 * GAP;
    const textW = W - QR - 2 * GAP;
    font('heading', 'bold');
    doc.textWithLink('Открыть 3D-модель', textX, footTop + LH(TYPE.heading) * 0.75, { url: passport.link });
    font('small', 'normal', MUTED);
    let fy = footTop + LH(TYPE.heading) + LH(TYPE.small) * 0.75 + 1;
    const how = wrap('Наведите камеру телефона на код или нажмите на ссылку: откроется калькулятор с этим изделием, его можно вращать.', textW);
    doc.text(how, textX, fy);
    fy += how.length * LH(TYPE.small) + 1.5;
    const priceNote = (passport.pricesDateText ? 'Цены на ' + passport.pricesDateText + '. ' : '') +
      'Цена предварительная. Доставку и окончательную стоимость рассчитает менеджер.';
    doc.text(wrap(priceNote, textW), textX, fy);

    return new Uint8Array(doc.output('arraybuffer'));
  }

  function drawQr(doc, qrcode, text, x, top, size) {
    // Low error correction: fewer, larger modules for a long link on paper.
    const qr = qrcode(0, 'L');
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

  return { TYPE, MAIN_RATIO, SMALL_RATIO, renderPassportPdf };
});
