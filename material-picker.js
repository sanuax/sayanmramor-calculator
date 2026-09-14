(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.MaterialPicker = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {

  function minPricePerM2(stone) {
    const prices = (stone.slabs || [])
      .map(s => s.price_per_m2_rub)
      .filter(p => p !== null && p !== undefined);
    if (prices.length === 0) return null;
    return Math.min(...prices);
  }

  function matchesSearch(stone, query) {
    if (!query) return true;
    return stone.name.toLowerCase().includes(query.toLowerCase());
  }

  function matchesHardnessFilter(stone, selectedHardnesses) {
    if (!selectedHardnesses || selectedHardnesses.length === 0) return true;
    return selectedHardnesses.includes(stone.hardness_category);
  }

  function sortStones(stones, sortKey) {
    const copy = stones.slice();
    if (sortKey === 'price') {
      copy.sort((a, b) => {
        const pa = minPricePerM2(a);
        const pb = minPricePerM2(b);
        if (pa === null && pb === null) return a.name.localeCompare(b.name, 'ru');
        if (pa === null) return 1;
        if (pb === null) return -1;
        if (pa !== pb) return pa - pb;
        return a.name.localeCompare(b.name, 'ru');
      });
    } else {
      copy.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    }
    return copy;
  }

  function filterAndSort(stones, { query, hardnesses, sortKey }) {
    const filtered = stones.filter(s => matchesSearch(s, query) && matchesHardnessFilter(s, hardnesses));
    return sortStones(filtered, sortKey);
  }

  return { minPricePerM2, matchesSearch, matchesHardnessFilter, sortStones, filterAndSort };
});
