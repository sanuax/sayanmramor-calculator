// soft-hyphen.js -- soft hyphens (U+00AD) in long Russian words of the option cards, so a word
// wider than its card breaks with a hyphen in any browser. CSS `hyphens: auto` needs the
// browser's own dictionary, and where there is none (some webviews, the desktop app's pane)
// «Художественная» fell back to «Художественна / я» (the owner, 2026-11-16).
//
// Simple syllable rules, enough for card titles: a break may stand before a consonant that is
// followed by a vowel (V-CV: Кру-по), or between two consonants before a vowel (VC-CV: Круп-но);
// never right before й/ь/ъ, never with fewer than two letters on a side, and each side keeps a
// vowel. Only the cards' text on screen changes: names in the result, the letter and the passport
// come from the data, not from these nodes.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SoftHyphen = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const SHY = '\u00AD';
  const VOWELS = 'аеёиоуыэюяАЕЁИОУЫЭЮЯ';
  const NO_START = 'йьъЙЬЪ';
  const MIN_WORD = 12;   // «раскладка» fits a card on its own line: only longer words
  const isVowel = (c) => VOWELS.indexOf(c) >= 0;

  // Between two vowels: no consonant -- no break (Диа); one -- before it (по-ла);
  // more -- after the first one (под-сту, Круп-но), й/ь/ъ staying with the letter before (наль-ная).
  function word(w) {
    if (w.length < MIN_WORD) return w;
    const vowels = [];
    for (let i = 0; i < w.length; i++) if (isVowel(w[i])) vowels.push(i);
    let out = '';
    let last = 0;
    for (let k = 0; k + 1 < vowels.length; k++) {
      const a = vowels[k], b = vowels[k + 1];
      const cluster = b - a - 1;
      if (cluster === 0) continue;
      let at = cluster === 1 ? a + 1 : a + 2;
      while (at < b && NO_START.indexOf(w[at]) >= 0) at++;
      if (at >= b + 1 || at - last < 2 || w.length - at < 2) continue;
      out += w.slice(last, at) + SHY;
      last = at;
    }
    return out + w.slice(last);
  }

  // Every run of Cyrillic letters in a text.
  function text(s) {
    return String(s).replace(/[А-Яа-яЁё]+/g, word);
  }

  // The cards' title and note nodes under `scope`, each once.
  function cards(scope) {
    const nodes = (scope || document).querySelectorAll('.pick-card .pc-title, .pick-card .pc-desc');
    nodes.forEach((el) => {
      if (el.children.length || el.dataset.shy === el.textContent) return;
      const t = text(el.textContent);
      el.textContent = t;
      el.dataset.shy = t;
    });
  }

  // Cards are drawn and redrawn as products and steps change: keep them hyphenated.
  function watch(doc) {
    cards(doc);
    let queued = false;
    new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; cards(doc); });
    }).observe(doc.body, { childList: true, subtree: true });
  }

  return { SHY, word, text, cards, watch };
});
