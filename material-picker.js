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

  const BATCH_SIZE = 40;

  function init({ stones, onSelect }) {
    const overlay = document.getElementById('pickerOverlay');
    const searchInput = document.getElementById('pickerSearch');
    const closeBtn = document.getElementById('pickerClose');
    const chips = Array.from(document.querySelectorAll('#pickerChips .chip'));
    const sortButtons = Array.from(document.querySelectorAll('#pickerSort .sort-btn'));
    const results = document.getElementById('pickerResults');
    const grid = document.getElementById('pickerGrid');
    const sentinel = document.getElementById('pickerSentinel');
    const emptyMessage = document.getElementById('pickerEmpty');
    const lightboxOverlay = document.getElementById('lightboxOverlay');
    const lightboxClose = document.getElementById('lightboxClose');
    const lightboxImg = document.getElementById('lightboxImg');

    let currentQuery = '';
    let currentHardnesses = [];
    let currentSortKey = 'name';
    let filteredList = [];
    let renderedCount = 0;
    let isLoadingBatch = false;

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

      const price = minPricePerM2(stone);
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

    function resetAndRender() {
      filteredList = filterAndSort(stones, {
        query: currentQuery, hardnesses: currentHardnesses, sortKey: currentSortKey,
      });
      grid.innerHTML = '';
      renderedCount = 0;
      emptyMessage.hidden = filteredList.length > 0;
      sentinel.hidden = filteredList.length === 0;
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

    chips.forEach(chip => {
      chip.addEventListener('click', () => {
        chip.classList.toggle('active');
        currentHardnesses = chips
          .filter(c => c.classList.contains('active'))
          .map(c => Number(c.dataset.hardness));
        resetAndRender();
      });
    });

    sortButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        currentSortKey = btn.dataset.sort;
        sortButtons.forEach(b => b.classList.toggle('active', b === btn));
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
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (!lightboxOverlay.hidden) { closeLightbox(); return; }
        if (!overlay.hidden) close();
      }
    });

    function open() {
      currentQuery = '';
      currentHardnesses = [];
      currentSortKey = 'name';
      searchInput.value = '';
      chips.forEach(c => c.classList.remove('active'));
      sortButtons.forEach(b => b.classList.toggle('active', b.dataset.sort === 'name'));
      resetAndRender();
      overlay.hidden = false;
      searchInput.focus();
    }

    return { open, close };
  }

  return { minPricePerM2, matchesSearch, matchesHardnessFilter, sortStones, filterAndSort, init };
});
