// passport-model.js
//
// The product passport's content (docs/superpowers/specs/2026-10-20-product-passport-design.md):
// built from the same configuration / pricing the Result screen shows and
// from the price calculation itself (Pricing.calculatePrice), as a plain
// object passport-pdf.js draws. No DOM, no network -- later the same object
// goes with the request to the manager.
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.PassportModel = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {

  const PASSPORT_TITLES = {
    lestnitsa: 'Лестница',
    panno: 'Панно',
    podokonnik: 'Подоконник',
    pol: 'Пол',
    stena: 'Стена',
    fasad: 'Фасад',
    stoleshnitsa_vannaya: 'Столешница в ванную',
    stoleshnitsa_kuhnya: 'Столешница на кухню',
    stupeni: 'Ступени',
    kaminy: 'Камин',
  };
  const MANUAL_TEXT = 'Стоимость рассчитает менеджер';

  // A flat product seen from the side is a thin line -- no such shot.
  const FLAT_PRODUCTS = ['panno', 'pol', 'stena', 'fasad'];
  const EXTRA_SHOTS = ['top', 'front', 'side', 'iso'];

  const pad = (n, width) => String(n).padStart(width, '0');

  function dateText(date) {
    return pad(date.getDate(), 2) + '.' + pad(date.getMonth() + 1, 2) + '.' + date.getFullYear();
  }

  function passportNumber(date, random4) {
    return pad(date.getFullYear() % 100, 2) + pad(date.getMonth() + 1, 2) + pad(date.getDate(), 2) + '-' + pad(random4, 4);
  }

  function passportFileName(title, date) {
    return 'Паспорт - ' + title + ' - ' + dateText(date) + '.pdf';
  }

  function pickShots(productKey, defaultPreset) {
    const others = EXTRA_SHOTS.filter(p => p !== defaultPreset && !(p === 'side' && FLAT_PRODUCTS.includes(productKey)));
    return [defaultPreset].concat(others.slice(0, 2));
  }

  // '2026-09-15T23:53:23+03:00' -> '15.09.2026' (the catalog's own date, no time zone shift).
  function isoDateText(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
    return m ? m[3] + '.' + m[2] + '.' + m[1] : null;
  }

  const money = v => (typeof v === 'number' && v > 0 ? v : 0);
  // The area as precisely as rate x area gives the row's sum (0,792 m², not 0,79).
  const areaShown = m2 => Math.round(m2 * 10000) / 10000;

  function stoneRows(result, stoneName) {
    const groups = [];
    (result.matchedSlabs || []).forEach(slab => {
      const same = groups.find(g => g.slab.width_cm === slab.width_cm && g.slab.length_cm === slab.length_cm && g.slab.price_total_rub === slab.price_total_rub);
      if (same) same.count += 1;
      else groups.push({ slab, count: 1 });
    });
    return groups.map(({ slab, count }) => ({
      name: 'Слэб ' + stoneName + ', ' + slab.width_cm * 10 + ' × ' + slab.length_cm * 10 + ' мм',
      unit: 'шт.', qty: count, priceRub: slab.price_total_rub, amount: slab.price_total_rub * count,
    }));
  }

  function worksName(configuration) {
    const parts = [];
    if (configuration.edge) parts.push('Кромка: ' + configuration.edge.label);
    (configuration.additionalWorks || []).forEach(w => {
      parts.push(w.label + (w.quantity ? ' ' + w.quantity + ' ' + w.unit : ''));
    });
    return parts.length ? parts.join('; ') : 'Кромка и дополнительные работы';
  }

  // The table: only what the calculation priced; every row rounded, and the
  // rounding left over goes to the largest row so the rows add up to the
  // total shown on the Result screen exactly.
  function buildSpecification({ result, pricing, pricingInputs, configuration }) {
    if (!pricing || pricing.status !== 'ok' || !result || result.total === null || result.total === undefined) {
      return { manual: (pricing && pricing.status !== 'ok' && pricing.message) || MANUAL_TEXT };
    }
    const rates = (pricingInputs && pricingInputs.rates) || {};
    const area = pricingInputs && pricingInputs.mainAreaM2 ? areaShown(pricingInputs.mainAreaM2) : null;
    const perM2 = (rate, mult) => (typeof rate === 'number' && rate > 0 ? rate * (mult || 1) : null);
    const complexMult = pricingInputs && pricingInputs.complexEnabled ? rates.complexShapeMultiplier : 1;
    const stoneName = (configuration.material && configuration.material.name) || 'камня';

    const sections = [
      { title: 'Камень', rows: stoneRows(result, stoneName) },
      { title: 'Изготовление', rows: [
        { name: 'Изготовление изделия' + (pricingInputs && pricingInputs.complexEnabled ? ', сложная форма' : ''), unit: 'м²', qty: area, priceRub: perM2(rates.fabricationRatePerM2, complexMult), amount: money(result.fabrication) },
        { name: 'Полировка', unit: 'м²', qty: area, priceRub: perM2(rates.polishRatePerM2), amount: money(result.polish) },
        { name: 'Подступенки - работы', unit: null, qty: null, priceRub: null, amount: money(result.groupWork) },
      ] },
      { title: 'Монтаж', rows: [
        { name: 'Монтаж', unit: 'м²', qty: area, priceRub: perM2(rates.installationRatePerM2), amount: money(result.installation) },
      ] },
      { title: 'Кромка и дополнительные работы', rows: [
        { name: worksName(configuration), unit: null, qty: null, priceRub: null, amount: money(result.extras) + money(result.catalogExtras) },
      ] },
      { title: 'Прочее', rows: [
        { name: 'Прочие работы', unit: null, qty: null, priceRub: null, amount: money(result.misc) },
      ] },
    ].map(s => ({ title: s.title, rows: s.rows.filter(r => r.amount > 0) })).filter(s => s.rows.length);

    // Largest remainder: the rubles the rounding lost or gained go, one each,
    // to the rows whose exact sums were closest to rounding the other way --
    // never to a whole-ruble row (a slab: price x quantity stays exact).
    const totalRub = pricing.total;
    const rows = [];
    sections.forEach(s => s.rows.forEach(r => { r.amountRub = Math.round(r.amount); rows.push(r); }));
    let left = totalRub - rows.reduce((sum, r) => sum + r.amountRub, 0);
    const step = Math.sign(left);
    const candidates = rows.filter(r => r.amount !== Math.round(r.amount))
      .sort((a, b) => step * ((b.amount - b.amountRub) - (a.amount - a.amountRub)));
    for (let i = 0; left !== 0 && candidates.length; i = (i + 1) % candidates.length) {
      candidates[i].amountRub += step;
      left -= step;
    }
    rows.forEach(r => { delete r.amount; });
    return { sections, totalRub };
  }

  function buildPassport({ configuration, pricing, result, pricingInputs, view, stone, createdAt, random4, link, defaultPreset }) {
    const productKey = configuration.product.key;
    const title = PASSPORT_TITLES[productKey] || configuration.product.label;
    const meta = stone ? [stone.category_label_ru, stone.countries && stone.countries[0] && stone.countries[0].label_ru].filter(Boolean).join(' · ') : '';
    return {
      number: passportNumber(createdAt, random4),
      dateText: dateText(createdAt),
      title,
      fileName: passportFileName(title, createdAt),
      shots: pickShots(productKey, defaultPreset),
      stone: stone ? { name: stone.name, meta, imagePath: stone.image ? 'data/' + stone.image : null } : null,
      specs: view.specs,
      works: view.works,
      note: view.note,
      specification: buildSpecification({ result, pricing, pricingInputs, configuration }),
      pricesDateText: isoDateText(pricing && pricing.pricesUpdatedAt),
      link,
    };
  }

  return { FLAT_PRODUCTS, passportNumber, passportFileName, pickShots, buildSpecification, buildPassport };
});
