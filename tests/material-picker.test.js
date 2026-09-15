const test = require('node:test');
const assert = require('node:assert/strict');
const MaterialPicker = require('../material-picker.js');

const stones = [
  { id: 'a', name: 'Bianco Carrara', hardness_category: 1, available: true,
    slabs: [{ price_per_m2_rub: 5000 }, { price_per_m2_rub: 4000 }] },
  { id: 'b', name: 'Absolute Black', hardness_category: 2, available: true,
    slabs: [{ price_per_m2_rub: 9000 }] },
  { id: 'c', name: 'Agate Moon', hardness_category: 3, available: false,
    slabs: [{ price_per_m2_rub: 12000 }] },
  { id: 'd', name: 'Delicato Brown', hardness_category: 1, available: false,
    slabs: [] },
];

test('minPricePerM2 returns the lowest price among a stone\'s slabs', () => {
  assert.equal(MaterialPicker.minPricePerM2(stones[0]), 4000);
});

test('minPricePerM2 returns null when there are no priced slabs', () => {
  assert.equal(MaterialPicker.minPricePerM2(stones[3]), null);
});

test('minPricePerM2 ignores null prices among the slabs', () => {
  const stone = { slabs: [{ price_per_m2_rub: null }, { price_per_m2_rub: 3000 }] };
  assert.equal(MaterialPicker.minPricePerM2(stone), 3000);
});

test('matchesSearch is case-insensitive substring match', () => {
  assert.equal(MaterialPicker.matchesSearch(stones[0], 'carra'), true);
  assert.equal(MaterialPicker.matchesSearch(stones[0], 'CARRARA'), true);
  assert.equal(MaterialPicker.matchesSearch(stones[0], 'xyz'), false);
});

test('matchesSearch with an empty query matches everything', () => {
  assert.equal(MaterialPicker.matchesSearch(stones[0], ''), true);
});

test('matchesHardnessFilter with no chips selected matches everything', () => {
  assert.equal(MaterialPicker.matchesHardnessFilter(stones[0], []), true);
});

test('matchesHardnessFilter matches any selected hardness (OR)', () => {
  assert.equal(MaterialPicker.matchesHardnessFilter(stones[0], [1, 3]), true);
  assert.equal(MaterialPicker.matchesHardnessFilter(stones[1], [1, 3]), false);
});

test('sortStones by name-asc sorts alphabetically A-Z', () => {
  const sorted = MaterialPicker.sortStones(stones, 'name-asc');
  assert.deepEqual(sorted.map(s => s.id), ['b', 'c', 'a', 'd']);
});

test('sortStones by name-desc sorts alphabetically Z-A', () => {
  const sorted = MaterialPicker.sortStones(stones, 'name-desc');
  assert.deepEqual(sorted.map(s => s.id), ['d', 'a', 'c', 'b']);
});

test('sortStones by price-asc sorts ascending with null prices last', () => {
  const sorted = MaterialPicker.sortStones(stones, 'price-asc');
  assert.deepEqual(sorted.map(s => s.id), ['a', 'b', 'c', 'd']);
});

test('sortStones by price-desc sorts descending with null prices still last', () => {
  const sorted = MaterialPicker.sortStones(stones, 'price-desc');
  assert.deepEqual(sorted.map(s => s.id), ['c', 'b', 'a', 'd']);
});

test('sortStones does not mutate the input array', () => {
  const copy = stones.slice();
  MaterialPicker.sortStones(stones, 'name-asc');
  assert.deepEqual(stones, copy);
});

test('matchesCategoryFilter with nothing selected matches everything', () => {
  assert.equal(MaterialPicker.matchesCategoryFilter({ category: 'marble' }, []), true);
});

test('matchesCategoryFilter matches any selected category (OR)', () => {
  assert.equal(MaterialPicker.matchesCategoryFilter({ category: 'marble' }, ['marble', 'granite']), true);
  assert.equal(MaterialPicker.matchesCategoryFilter({ category: 'onyx' }, ['marble', 'granite']), false);
});

test('matchesColorFilter with nothing selected matches everything', () => {
  assert.equal(MaterialPicker.matchesColorFilter({ colors: [{ segment: 'beige' }] }, []), true);
});

test('matchesColorFilter matches when any of the stone\'s colors is selected (OR)', () => {
  const stone = { colors: [{ segment: 'beige' }, { segment: 'white' }] };
  assert.equal(MaterialPicker.matchesColorFilter(stone, ['white']), true);
  assert.equal(MaterialPicker.matchesColorFilter(stone, ['black']), false);
});

test('matchesColorFilter treats a stone with no colors as matching nothing selected', () => {
  assert.equal(MaterialPicker.matchesColorFilter({}, ['beige']), false);
  assert.equal(MaterialPicker.matchesColorFilter({}, []), true);
});

test('filterAndSort combines search, hardness filter, and sort', () => {
  const result = MaterialPicker.filterAndSort(stones, {
    query: '', hardnesses: [1], sortKey: 'price-asc',
  });
  assert.deepEqual(result.map(s => s.id), ['a', 'd']);
});
