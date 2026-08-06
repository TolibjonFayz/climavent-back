// Model nomlarini solishtirish uchun normallashtiradi: bo'sh joy, "-", "/",
// "_", "." olib tashlanadi, katta harfga o'giriladi. Masalan
// "ПВН 500-300/2" va "ПВН500-300-2" ikkalasi ham "ПВН5003002" bo'ladi.
export function normalizeModelName(name: string): string {
  return name.toUpperCase().replace(/[\s\-/_.]/g, '');
}
