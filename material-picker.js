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

  function matchesCountryFilter(stone, selected) {
    if (!selected || selected.length === 0) return true;
    return (stone.countries || []).some(c => selected.includes(c.segment));
  }

  function matchesCategoryFilter(stone, selected) {
    if (!selected || selected.length === 0) return true;
    return selected.includes(stone.category);
  }

  function matchesColorFilter(stone, selected) {
    if (!selected || selected.length === 0) return true;
    return (stone.colors || []).some(c => selected.includes(c.segment));
  }

  function sortStones(stones, sortKey) {
    const copy = stones.slice();
    const [field, direction] = (sortKey || 'name-asc').split('-');
    const mult = direction === 'desc' ? -1 : 1;
    if (field === 'price') {
      copy.sort((a, b) => {
        const pa = minPricePerM2(a);
        const pb = minPricePerM2(b);
        // Null prices always sort last, regardless of direction -- "no
        // price data" isn't a value that should jump to the front just
        // because the sort reversed.
        if (pa === null && pb === null) return a.name.localeCompare(b.name, 'ru');
        if (pa === null) return 1;
        if (pb === null) return -1;
        if (pa !== pb) return (pa - pb) * mult;
        return a.name.localeCompare(b.name, 'ru');
      });
    } else {
      copy.sort((a, b) => a.name.localeCompare(b.name, 'ru') * mult);
    }
    return copy;
  }

  function filterAndSort(stones, { query, countries, categories, colors, sortKey }) {
    const filtered = stones.filter(s =>
      matchesSearch(s, query)
      && matchesCountryFilter(s, countries)
      && matchesCategoryFilter(s, categories)
      && matchesColorFilter(s, colors)
    );
    return sortStones(filtered, sortKey);
  }

  // Whether the "Сбросить" affordance (filter-row button and empty-state
  // action) should be shown/enabled -- true the moment any search text or
  // any filter selection exists, regardless of whether it actually excludes
  // anything yet.
  function hasActiveFilters({ query, countries, categories, colors }) {
    return !!query
      || (countries && countries.length > 0)
      || (categories && categories.length > 0)
      || (colors && colors.length > 0);
  }

  const BATCH_SIZE = 40;

  // One reusable "dropdown with checkboxes inside" component backs all
  // three filters (country/type/color) -- each gets its own instance, but
  // the open/close/label-count behavior is shared instead of duplicated
  // per filter.
  function createFilterDropdown({ dropdownEl, label, options, onChange, registerCloser }) {
    const btn = dropdownEl.querySelector('.filter-dropdown-btn');
    const panel = dropdownEl.querySelector('.filter-dropdown-panel');

    const labelSpan = document.createElement('span');
    labelSpan.className = 'filter-dropdown-label';
    const caret = document.createElement('span');
    caret.className = 'caret';
    caret.setAttribute('aria-hidden', 'true');
    caret.textContent = '▾';
    btn.appendChild(labelSpan);
    btn.appendChild(caret);

    options.forEach(opt => {
      const optionEl = document.createElement('label');
      optionEl.className = 'filter-option';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = opt.value;
      checkbox.addEventListener('change', () => {
        updateLabel();
        onChange(getSelected());
      });
      const text = document.createElement('span');
      text.textContent = opt.text;
      optionEl.appendChild(checkbox);
      optionEl.appendChild(text);
      panel.appendChild(optionEl);
    });

    function getSelected() {
      return Array.from(panel.querySelectorAll('input:checked')).map(i => i.value);
    }

    function updateLabel() {
      const count = getSelected().length;
      labelSpan.textContent = count > 0 ? label + ' (' + count + ')' : label;
      btn.classList.toggle('active', count > 0);
    }
    updateLabel();

    function closePanel() {
      panel.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
    }
    function openPanel() {
      panel.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
    }
    registerCloser(closePanel);

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const wasOpen = !panel.hidden;
      registerCloser.closeAll();
      if (!wasOpen) openPanel();
    });
    panel.addEventListener('click', (e) => e.stopPropagation());

    function reset() {
      panel.querySelectorAll('input').forEach(i => { i.checked = false; });
      updateLabel();
      closePanel();
    }

    return { getSelected, reset, closePanel };
  }

  // "1 материал" / "2 материала" / "5 материалов" -- same irregular-plural
  // shape as the existing pluralizeSlabs() in sayanmramor-calculator.html,
  // kept local here since this module has no shared string-utils import.
  function pluralizeMaterials(n) {
    const mod10 = n % 10, mod100 = n % 100;
    let word;
    if (mod10 === 1 && mod100 !== 11) word = 'материал';
    else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) word = 'материала';
    else word = 'материалов';
    return n + ' ' + word;
  }

  function init({ stones, onSelect }) {
    const overlay = document.getElementById('pickerOverlay');
    const searchInput = document.getElementById('pickerSearch');
    const closeBtn = document.getElementById('pickerClose');
    const sortButtons = Array.from(document.querySelectorAll('#pickerSort .sort-btn'));
    const results = document.getElementById('pickerResults');
    const grid = document.getElementById('pickerGrid');
    const sentinel = document.getElementById('pickerSentinel');
    const emptyMessage = document.getElementById('pickerEmpty');
    const metaEl = document.getElementById('pickerMeta');
    const resetFiltersBtn = document.getElementById('pickerResetFilters');
    const emptyResetBtn = document.getElementById('pickerEmptyReset');
    const lightboxOverlay = document.getElementById('lightboxOverlay');
    const lightboxClose = document.getElementById('lightboxClose');
    const lightboxImg = document.getElementById('lightboxImg');

    const SORT_LABELS = {
      'name-asc': 'A-Z', 'name-desc': 'Z-A',
      'price-asc': 'Цена ↑', 'price-desc': 'Цена ↓',
    };

    let currentQuery = '';
    let currentCountries = [];
    let currentCategories = [];
    let currentColors = [];
    let currentSortKey = 'name-asc';
    let filteredList = [];
    let renderedCount = 0;
    let isLoadingBatch = false;

    const dropdownClosers = [];
    function registerCloser(closer) {
      dropdownClosers.push(closer);
    }
    registerCloser.closeAll = () => dropdownClosers.forEach(c => c());
    document.addEventListener('click', () => registerCloser.closeAll());

    function uniqueOptionsFrom(items, getValue, getText) {
      const byValue = new Map();
      items.forEach(item => {
        const value = getValue(item);
        const text = getText(item);
        if (value && text && !byValue.has(value)) byValue.set(value, text);
      });
      return Array.from(byValue, ([value, text]) => ({ value, text }))
        .sort((a, b) => a.text.localeCompare(b.text, 'ru'));
    }

    const countryDropdown = createFilterDropdown({
      dropdownEl: document.querySelector('[data-filter="country"]'),
      label: 'Страна',
      options: uniqueOptionsFrom(
        stones.flatMap(s => s.countries || []), c => c.segment, c => c.label_ru
      ),
      onChange: (values) => { currentCountries = values; resetAndRender(); },
      registerCloser,
    });
    const categoryDropdown = createFilterDropdown({
      dropdownEl: document.querySelector('[data-filter="category"]'),
      label: 'Тип',
      options: uniqueOptionsFrom(stones, s => s.category, s => s.category_label_ru),
      onChange: (values) => { currentCategories = values; resetAndRender(); },
      registerCloser,
    });
    const colorDropdown = createFilterDropdown({
      dropdownEl: document.querySelector('[data-filter="color"]'),
      label: 'Цвет',
      options: uniqueOptionsFrom(
        stones.flatMap(s => s.colors || []), c => c.segment, c => c.label_ru
      ),
      onChange: (values) => { currentColors = values; resetAndRender(); },
      registerCloser,
    });

    function buildCard(stone) {
      const card = document.createElement('div');
      card.className = 'stone-card';
      card.dataset.id = stone.id;

      const imageWrap = document.createElement('div');
      imageWrap.className = 'stone-card-image';

      const img = document.createElement('img');
      img.loading = 'lazy';
      img.alt = '';
      img.src = stone.image ? 'data/' + stone.image : '';
      img.addEventListener('error', () => {
        imageWrap.classList.add('image-broken');
        img.remove();
      });
      img.addEventListener('click', (e) => {
        e.stopPropagation();
        lightboxImg.src = img.src;
        lightboxOverlay.hidden = false;
      });
      imageWrap.appendChild(img);

      if (stone.available === false) {
        const badge = document.createElement('span');
        badge.className = 'badge-oos';
        badge.textContent = 'Нет в наличии';
        imageWrap.appendChild(badge);
      }

      const name = document.createElement('div');
      name.className = 'stone-card-name';
      name.textContent = stone.name;

      card.appendChild(imageWrap);
      card.appendChild(name);

      if (stone.category_label_ru) {
        const type = document.createElement('div');
        type.className = 'stone-card-type';
        type.textContent = stone.category_label_ru;
        card.appendChild(type);
      }

      const price = stone.available !== false ? minPricePerM2(stone) : null;
      if (price !== null) {
        const priceEl = document.createElement('div');
        priceEl.className = 'stone-card-price';
        priceEl.textContent = 'от ' + Math.round(price).toLocaleString('ru-RU') + ' ₽/м²';
        card.appendChild(priceEl);
      }

      card.addEventListener('click', () => {
        onSelect(stone.id);
        close();
      });
      return card;
    }

    function renderNextBatch() {
      if (isLoadingBatch) return;
      isLoadingBatch = true;
      const nextSlice = filteredList.slice(renderedCount, renderedCount + BATCH_SIZE);
      nextSlice.forEach(stone => grid.appendChild(buildCard(stone)));
      renderedCount += nextSlice.length;
      sentinel.hidden = renderedCount >= filteredList.length;
      isLoadingBatch = false;
    }

    function resetAllFilters() {
      currentQuery = '';
      searchInput.value = '';
      currentCountries = []; countryDropdown.reset();
      currentCategories = []; categoryDropdown.reset();
      currentColors = []; colorDropdown.reset();
      resetAndRender();
    }

    function resetAndRender() {
      filteredList = filterAndSort(stones, {
        query: currentQuery, countries: currentCountries,
        categories: currentCategories, colors: currentColors,
        sortKey: currentSortKey,
      });
      grid.innerHTML = '';
      renderedCount = 0;
      emptyMessage.hidden = filteredList.length > 0;
      sentinel.hidden = filteredList.length === 0;
      // A real, computed count -- not shown at all while a search/filter
      // combination has wiped out every result (the empty state already
      // explains that; a "0 материалов" line next to it would be noise).
      metaEl.textContent = filteredList.length > 0 ? pluralizeMaterials(filteredList.length) : '';
      resetFiltersBtn.hidden = !hasActiveFilters({
        query: currentQuery, countries: currentCountries, categories: currentCategories, colors: currentColors,
      });
      results.scrollTop = 0;
      renderNextBatch();
    }

    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) renderNextBatch();
    });
    observer.observe(sentinel);

    searchInput.addEventListener('input', () => {
      currentQuery = searchInput.value.trim();
      resetAndRender();
    });

    resetFiltersBtn.addEventListener('click', resetAllFilters);
    emptyResetBtn.addEventListener('click', resetAllFilters);

    function applySortButtonLabels() {
      sortButtons.forEach(btn => {
        btn.textContent = SORT_LABELS[btn.dataset.sortField + '-' + btn.dataset.sortDir];
      });
    }
    applySortButtonLabels();

    sortButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const wasActive = btn.classList.contains('active');
        if (wasActive) {
          // Same button clicked again -- flip its direction.
          btn.dataset.sortDir = btn.dataset.sortDir === 'asc' ? 'desc' : 'asc';
        } else {
          // Switching to the other field always starts at its default
          // (ascending) direction rather than remembering the last one.
          sortButtons.forEach(b => { if (b !== btn) b.dataset.sortDir = 'asc'; });
          sortButtons.forEach(b => b.classList.toggle('active', b === btn));
        }
        applySortButtonLabels();
        currentSortKey = btn.dataset.sortField + '-' + btn.dataset.sortDir;
        resetAndRender();
      });
    });

    function closeLightbox() {
      lightboxOverlay.hidden = true;
      lightboxImg.src = '';
    }
    lightboxClose.addEventListener('click', closeLightbox);
    lightboxOverlay.addEventListener('click', (e) => {
      if (e.target === lightboxOverlay) closeLightbox();
    });

    function close() {
      overlay.hidden = true;
    }
    closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });
    const filterPanels = Array.from(document.querySelectorAll('.filter-dropdown-panel'));
    function anyDropdownOpen() {
      return filterPanels.some(p => !p.hidden);
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (!lightboxOverlay.hidden) { closeLightbox(); return; }
        if (anyDropdownOpen()) { registerCloser.closeAll(); return; }
        if (!overlay.hidden) close();
      }
    });

    function open() {
      currentQuery = '';
      currentCountries = [];
      currentCategories = [];
      currentColors = [];
      currentSortKey = 'name-asc';
      searchInput.value = '';
      countryDropdown.reset();
      categoryDropdown.reset();
      colorDropdown.reset();
      sortButtons.forEach(b => {
        b.dataset.sortDir = 'asc';
        b.classList.toggle('active', b.dataset.sortField === 'name');
      });
      applySortButtonLabels();
      resetAndRender();
      overlay.hidden = false;
      searchInput.focus();
    }

    return { open, close };
  }

  return {
    minPricePerM2, matchesSearch, matchesCountryFilter, matchesCategoryFilter, matchesColorFilter,
    sortStones, filterAndSort, hasActiveFilters, pluralizeMaterials, init,
  };
});
