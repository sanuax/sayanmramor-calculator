// price-filter.js
//
// The stone price filter: «От» and «До» fields over a two-handled slider, as
// the old site had. One file, two copies -- the site's (js/price-filter.js)
// and the configurator's (price-filter.js) -- so neither loads the other's
// code; keep them the same.
//
// The price is the stone's lowest price per m2 among its slabs -- the one the
// configurator's card shows as «от … ₽/м²» -- so a card shown under the filter
// always carries a price inside it. Stone prices run from about 2 000 to
// 730 000 ₽/м², most of them under 50 000: the slider is logarithmic, so
// every part of it moves through a fair share of the stones.
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.PriceFilter = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {

  const STEPS = 1000;                       // the slider's positions
  const NB = String.fromCharCode(0xa0);     // no-break space: a price never breaks across lines

  // A price rounded to a step that suits its size.
  function roundNice(p) {
    const step = p < 100000 ? 100 : 1000;
    return Math.round(p / step) * step;
  }

  // The slider's ends: the cheapest and the dearest price, rounded outward.
  function bounds(prices) {
    const ok = prices.filter(p => typeof p === 'number' && Number.isFinite(p) && p > 0);
    if (!ok.length) return null;
    const lo = Math.min(...ok), hi = Math.max(...ok);
    const down = p => Math.floor(p / (p < 10000 ? 100 : 1000)) * (p < 10000 ? 100 : 1000);
    const up = p => Math.ceil(p / (p < 10000 ? 100 : 1000)) * (p < 10000 ? 100 : 1000);
    return { min: down(lo), max: Math.max(up(hi), down(lo) + 100) };
  }

  // Price <-> slider position (0..STEPS), on a logarithmic scale.
  function makeScale(min, max) {
    const a = Math.log(min), b = Math.log(max);
    const clamp = p => Math.min(max, Math.max(min, p));
    return {
      toPos: p => Math.round((Math.log(clamp(p)) - a) / (b - a) * STEPS),
      toPrice: pos => {
        if (pos <= 0) return min;
        if (pos >= STEPS) return max;
        return clamp(roundNice(Math.exp(a + (b - a) * pos / STEPS)));
      },
    };
  }

  function formatRub(n) {
    return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, NB);
  }

  // «730 тыс.», «2,1 тыс.», «900»
  function formatShort(n) {
    if (n < 1000) return String(Math.round(n));
    const k = n / 1000;
    const text = k < 10 ? (Math.round(k * 10) / 10).toString().replace('.', ',') : String(Math.round(k));
    return text + NB + 'тыс.';
  }

  // What a person typed -> a number, or null for an empty field («12 500», «12500 ₽» -> 12500).
  function parseRub(text) {
    const digits = String(text == null ? '' : text).replace(/[^\d]/g, '');
    return digits ? Number(digits) : null;
  }

  // The labels under the slider: its two ends, and between them round prices
  // (1, 2 and 5 of each order: 5 тыс., 10 тыс., 20 тыс. ...) where they fall on the
  // logarithmic scale -- at most `count` in all, none crowding another.
  function ticks(min, max, count) {
    const n = count || 5;
    const scale = makeScale(min, max);
    const at = p => scale.toPos(p) / STEPS;
    const inner = [];
    for (let order = 100; order <= max; order *= 10) {
      [1, 2, 5].forEach(k => { const p = k * order; if (p > min && p < max) inner.push(p); });
    }
    const gap = 0.7 / (n - 1);            // the least distance between two labels, of the slider's length
    const edge = 0.25;                    // and from an end, whose label stands inward of it
    const chosen = [];
    // From the even spots between the ends, the round price nearest to each.
    for (let i = 1; i < n - 1; i++) {
      const want = i / (n - 1);
      const best = inner
        .filter(p => at(p) >= edge && at(p) <= 1 - edge && chosen.every(q => Math.abs(at(q) - at(p)) >= gap))
        .sort((a, b) => Math.abs(at(a) - want) - Math.abs(at(b) - want))[0];
      if (best != null) chosen.push(best);
    }
    return [min].concat(chosen.sort((a, b) => a - b), [max]).map(p => ({ at: at(p), label: formatShort(p) }));
  }

  function isActive(range) {
    return !!range && (range.from != null || range.to != null);
  }

  // Whether a stone with this price passes; a stone without a price passes only an unset filter.
  function inRange(price, range) {
    if (!isActive(range)) return true;
    if (typeof price !== 'number' || !Number.isFinite(price)) return false;
    return (range.from == null || price >= range.from) && (range.to == null || price <= range.to);
  }

  // The filter's state in a few words, for a button: «от 10 тыс.», «до 50 тыс.», «10 тыс. – 50 тыс.».
  function summary(range) {
    if (!isActive(range)) return '';
    if (range.from != null && range.to != null) return formatShort(range.from) + ' – ' + formatShort(range.to);
    return range.from != null ? 'от ' + formatShort(range.from) : 'до ' + formatShort(range.to);
  }

  // The control itself. `container` gets the fields and the slider; onChange({ from, to })
  // is called as the handles move and when a field is left -- an end at its edge is null.
  function mount(container, { min, max, onChange, label }) {
    const doc = container.ownerDocument;
    const scale = makeScale(min, max);
    const el = (tag, cls) => { const e = doc.createElement(tag); if (cls) e.className = cls; return e; };

    const root = el('div', 'pf');
    root.setAttribute('role', 'group');
    root.setAttribute('aria-label', label || 'Цена, ₽/м²');
    const fields = el('div', 'pf-fields');
    const field = (cap, placeholder) => {
      const wrap = el('label', 'pf-field');
      const c = el('span', 'pf-cap'); c.textContent = cap;
      const input = el('input', 'pf-input');
      input.type = 'text'; input.inputMode = 'numeric'; input.autocomplete = 'off';
      input.placeholder = formatRub(placeholder);
      wrap.append(c, input);
      fields.appendChild(wrap);
      return input;
    };
    const fromInput = field('от', min);
    const toInput = field('до', max);

    const slider = el('div', 'pf-slider');
    const track = el('div', 'pf-track');
    const fill = el('div', 'pf-fill');
    track.appendChild(fill);
    const thumb = (aria) => {
      const r = el('input', 'pf-thumb');
      r.type = 'range'; r.min = '0'; r.max = String(STEPS); r.step = '1';
      r.setAttribute('aria-label', aria);
      return r;
    };
    const fromThumb = thumb('Цена от');
    const toThumb = thumb('Цена до');
    fromThumb.value = '0';
    toThumb.value = String(STEPS);
    const scaleRow = el('div', 'pf-ticks');
    scaleRow.setAttribute('aria-hidden', 'true');
    ticks(min, max).forEach(t => {
      const s = el('span', 'pf-tick');
      s.style.left = (t.at * 100) + '%';
      s.textContent = t.label;
      scaleRow.appendChild(s);
    });
    slider.append(track, fromThumb, toThumb, scaleRow);
    root.append(fields, slider);
    container.appendChild(root);

    let range = { from: null, to: null };

    function paint() {
      const a = Number(fromThumb.value), b = Number(toThumb.value);
      fill.style.left = (a / STEPS * 100) + '%';
      fill.style.right = (100 - b / STEPS * 100) + '%';
      fromThumb.setAttribute('aria-valuetext', formatRub(range.from == null ? min : range.from) + ' ₽');
      toThumb.setAttribute('aria-valuetext', formatRub(range.to == null ? max : range.to) + ' ₽');
      // The handle last moved stays on top, so two handles at one point can still part.
      root.classList.toggle('pf-from-on-top', a > STEPS / 2);
    }

    function set(next, from) {
      range = next;
      if (from !== 'fields') {
        fromInput.value = range.from == null ? '' : formatRub(range.from);
        toInput.value = range.to == null ? '' : formatRub(range.to);
      }
      if (from !== 'slider') {
        fromThumb.value = String(range.from == null ? 0 : scale.toPos(range.from));
        toThumb.value = String(range.to == null ? STEPS : scale.toPos(range.to));
      }
      paint();
      if (onChange) onChange({ from: range.from, to: range.to });
    }

    function fromSlider(moved) {
      let a = Number(fromThumb.value), b = Number(toThumb.value);
      if (a > b) { if (moved === fromThumb) a = b; else b = a; fromThumb.value = String(a); toThumb.value = String(b); }
      set({ from: a <= 0 ? null : scale.toPrice(a), to: b >= STEPS ? null : scale.toPrice(b) }, 'slider');
    }
    fromThumb.addEventListener('input', () => fromSlider(fromThumb));
    toThumb.addEventListener('input', () => fromSlider(toThumb));

    function fromFields() {
      let a = parseRub(fromInput.value), b = parseRub(toInput.value);
      if (a != null) a = Math.min(max, Math.max(min, a));
      if (b != null) b = Math.min(max, Math.max(min, b));
      if (a != null && b != null && a > b) [a, b] = [b, a];
      if (a === min) a = null;
      if (b === max) b = null;
      set({ from: a, to: b });
    }
    [fromInput, toInput].forEach(input => {
      input.addEventListener('change', fromFields);
      input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); fromFields(); } });
    });

    paint();
    return {
      get value() { return { from: range.from, to: range.to }; },
      reset() { range = { from: null, to: null }; fromInput.value = ''; toInput.value = ''; fromThumb.value = '0'; toThumb.value = String(STEPS); paint(); },
    };
  }

  return { STEPS, roundNice, bounds, makeScale, formatRub, formatShort, parseRub, ticks, isActive, inRange, summary, mount };
});
