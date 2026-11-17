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
  // Under the total (and as an asterisk on it): where the price is valid.
  const REGION_NOTE = '* Расчёт указан для объектов, находящихся в Москве и Московской области';

  // The result lines' own rounding (result-model.js, loaded before this).
  const ResultModel = (typeof module !== 'undefined' && module.exports)
    ? require('./result-model.js')
    : (typeof window !== 'undefined' ? window : globalThis).ResultModel;

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
    if (configuration.edge) {
      const length = configuration.edge.lengthM > 0 ? ', ' + configuration.edge.lengthM.toFixed(2).replace('.', ',') + ' м.п.' : '';
      parts.push('Кромка: ' + configuration.edge.label + length);
    }
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
    const miscRates = rates.misc || {};
    const area = pricingInputs && pricingInputs.mainAreaM2 ? areaShown(pricingInputs.mainAreaM2) : null;
    const perM2 = (rate, mult) => (typeof rate === 'number' && rate > 0 ? rate * (mult || 1) : null);
    const complexMult = pricingInputs && pricingInputs.complexEnabled ? rates.complexShapeMultiplier : 1;
    const stoneName = (configuration.material && configuration.material.name) || 'камня';
    // A stair's landings are at their own rates (STAIR-11): when one of them
    // differs from the type's, the work is not one rate x one area, and the
    // row shows the amount that was calculated with no rate per m2 on it.
    const landingRates = rates.landingRates;
    const mixed = (work, rateKey) => !!(landingRates && result.landing && result.landing[work] > 0 && landingRates[rateKey] !== rates[rateKey]);
    const perM2Of = (work, rateKey, mult) => (mixed(work, rateKey) ? null : perM2(rates[rateKey], mult));
    // The quantity a rate gives the row's sum (the lighting is counted on
    // the main area, the unloading on the area of all the stone).
    const qtyOf = (exact, rate) => (rate > 0 ? areaShown(exact / rate) : null);

    const stone = stoneRows(result, stoneName);
    // Every row after the stone takes the rounded amount of its line: the very
    // amounts of the Result's lines (ResultModel.summarizePricing).
    const totalRub = pricing.total;
    const worked = ResultModel.lineCandidates(result).filter(c => c.key !== 'stone' && typeof c.amount === 'number' && c.amount > 0);
    const rubles = ResultModel.roundToTotal(worked.map(c => c.amount), totalRub, stone.reduce((s, r) => s + Math.round(r.amount), 0));
    const amountOf = {};
    worked.forEach((c, i) => { amountOf[c.key] = rubles[i]; });
    const row = (key, name, unit, qty, priceRub) => ({ name, unit, qty, priceRub, amountRub: amountOf[key] });
    const seams = result.seams && result.seams.count > 0 ? result.seams : null;

    const sections = [
      { title: 'Камень', rows: stone.map(({ amount, ...r }) => Object.assign(r, { amountRub: Math.round(amount) })) },
      { title: 'Изготовление', rows: [
        row('fabrication', 'Изготовление изделия' + (pricingInputs && pricingInputs.complexEnabled ? ', сложная форма' : ''), 'м²', area, perM2Of('fabrication', 'fabricationRatePerM2', complexMult)),
        row('polish', 'Полировка', 'м²', area, perM2Of('polish', 'polishRatePerM2')),
        row('parts', 'Подступенки - работы', null, null, null),
      ] },
      { title: 'Монтаж', rows: [
        row('installation', 'Монтаж', 'м²', area, perM2Of('installation', 'installationRatePerM2')),
      ] },
      { title: 'Подсветка', rows: [
        row('lighting', 'Подсветка камня', 'м²', qtyOf(result.lighting, rates.lightingRatePerM2) || area, perM2(rates.lightingRatePerM2)),
      ] },
      { title: 'Кромка и дополнительные работы', rows: [
        row('seams', 'Швы (переполировка)', 'шт.', seams ? seams.count : null, seams && seams.amount > 0 ? seams.amount / seams.count : null),
        row('works', worksName(configuration), null, null, null),
      ] },
      { title: 'Прочее', rows: [
        row('measure', 'Замер', null, null, null),
        row('delivery', 'Доставка', null, null, null),
        row('unloading', 'Разгрузка и расходные материалы', 'м²', qtyOf(result.unloading, miscRates.perM2), perM2(miscRates.perM2)),
        row('minOrder', 'Доплата до минимального заказа', null, null, null),
      ] },
    ].map(s => ({ title: s.title, rows: s.rows.filter(r => r.amountRub > 0) })).filter(s => s.rows.length);
    return { sections, totalRub, note: REGION_NOTE };
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

  return { FLAT_PRODUCTS, PASSPORT_TITLES, passportNumber, passportFileName, pickShots, buildSpecification, buildPassport };
});
