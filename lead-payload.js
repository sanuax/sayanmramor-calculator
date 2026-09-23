// lead-payload.js
//
// Contact validation + the structured request payload for a future
// backend/CRM. Pure functions only: no DOM, no network. The payload is
// built from ResultModel's configuration/pricing objects (the same ones the
// Result screen renders), so it is plain JSON by construction -- no DOM
// nodes, Three.js objects, functions or circular references can get in.
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.LeadPayload = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {

  const SCHEMA_VERSION = 1;
  const NAME_MAX = 100;
  const COMMENT_MAX = 1000;

  // Basic, forgiving normalisation to +<digits>: accepts the usual Russian
  // spellings (8 916 ..., +7 (916) ..., 9161234567) and plain international
  // numbers with a leading +. Not a full numbering-plan validator.
  function normalizePhone(raw) {
    const s = String(raw == null ? '' : raw).trim();
    if (!s || /[^\d\s()+\-.]/.test(s)) return null;
    const hasPlus = s.charAt(0) === '+';
    const digits = s.replace(/\D/g, '');
    if (!hasPlus && digits.length === 11 && digits.charAt(0) === '8') return '+7' + digits.slice(1);
    if (!hasPlus && digits.length === 10) return '+7' + digits;
    if (digits.length >= 10 && digits.length <= 15) return '+' + digits;
    return null;
  }

  function validateContact(input) {
    const name = String((input && input.name) || '').trim();
    const phoneRaw = String((input && input.phone) || '').trim();
    const comment = String((input && input.comment) || '').trim();
    const errors = {};

    if (!name) errors.name = 'Укажите имя';
    else if (name.length > NAME_MAX) errors.name = 'Имя слишком длинное';

    const phone = normalizePhone(phoneRaw);
    if (!phoneRaw) errors.phone = 'Укажите телефон';
    else if (!phone) errors.phone = 'Проверьте номер телефона';

    if (comment.length > COMMENT_MAX) errors.comment = 'Комментарий слишком длинный';

    return {
      ok: Object.keys(errors).length === 0,
      errors,
      value: { name, phone, comment: comment || null },
    };
  }

  // configuration/pricing: ResultModel.buildConfiguration()/summarizePricing()
  // contact: validateContact(...).value
  function buildLeadPayload({ configuration, pricing, contact, createdAt }) {
    const c = configuration;
    return {
      schemaVersion: SCHEMA_VERSION,
      source: 'sayanmramor-calculator',
      createdAt: createdAt || null,
      product: { key: c.product.key, label: c.product.label },
      configuration: {
        type: c.type,
        shape: c.shape,
        dimensions: c.dimensions,
        material: c.material,
        edge: c.edge,
        riser: c.riser,
        additionalWorks: c.additionalWorks,
        options: c.options,
      },
      pricing: {
        status: pricing.status,
        currency: pricing.currency,
        total: pricing.total,
        breakdown: pricing.lines,
        nSlabs: pricing.nSlabs,
        reason: pricing.reason,
        pricesUpdatedAt: pricing.pricesUpdatedAt,
        preliminary: true,
      },
      contact: {
        name: contact.name,
        phone: contact.phone,
        comment: contact.comment,
      },
    };
  }

  return { SCHEMA_VERSION, normalizePhone, validateContact, buildLeadPayload };
});
