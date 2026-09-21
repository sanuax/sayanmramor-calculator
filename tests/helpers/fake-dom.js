// tests/helpers/fake-dom.js
function createFakeDoc(values) {
  values = values || {};
  return {
    getElementById(id) {
      const entry = values[id];
      return {
        value: entry && entry.value !== undefined ? entry.value : '',
        checked: entry && entry.checked !== undefined ? entry.checked : false,
      };
    },
  };
}

module.exports = { createFakeDoc };
