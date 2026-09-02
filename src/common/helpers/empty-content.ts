// Bo'sh kontent maydonlarini yagona ko'rinishga keltiradi.
//
// Muammo: bir xil ma'nodagi juft maydonlar turlicha qaytardi —
//   sizes     (TEXT)  -> null
//   sizesJson (JSONB) -> {}
// Mijoz kodida bu jimgina xato beradi: `Boolean({})` — `true`, ya'ni
// bo'sh bo'lim "to'ldirilgan" deb hisoblanadi.
//
// Endi ikkalasi ham bo'sh bo'lsa `null` qaytaradi.
export const emptyToNull = <T>(value: T): T | null => {
  if (value === null || value === undefined) return null;

  if (typeof value === 'string') {
    const trimmed = value.trim();
    // '""' — JSONB ichida saqlangan bo'sh satr
    return trimmed === '' || trimmed === '""' ? null : value;
  }

  if (Array.isArray(value)) {
    return value.length === 0 ? null : value;
  }

  if (typeof value === 'object') {
    return Object.keys(value as object).length === 0 ? null : value;
  }

  return value;
};
