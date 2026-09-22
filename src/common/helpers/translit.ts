/**
 * KIRILL <-> LOTIN (topshiriq №29, 2-band).
 *
 * Katalogda nom uch tilda saqlanadi, lekin model nomlari aralash yoziladi:
 * `name_ru` da "Вентилятор ВЦ 4-75", `name_uz` da "Ventilyator VTs 4-75",
 * SAP nomida esa lotincha kod. Rus tilidagi xaridor "вент" deb yozsa,
 * lotincha yozilgan nomlar topilmasdi va qidiruv 0 natija berardi.
 *
 * Shuning uchun har bir so'z uchun UCHTA variant qidiriladi: yozilganidek,
 * kirilldan lotinga va lotindan kirillga o'girilgani. Bu maqsad uchun
 * transliteratsiyaning "to'g'ri"ligi shart emas — muhimi qidiruv ikki
 * yozuvda ham bir joyga tushishi.
 */

const CYR_TO_LAT: Array<[string, string]> = [
  ['ё', 'yo'], ['ж', 'j'], ['ц', 'ts'], ['ч', 'ch'], ['ш', 'sh'], ['щ', 'sh'],
  ['ю', 'yu'], ['я', 'ya'], ['х', 'x'], ['ъ', ''], ['ь', ''],
  ['а', 'a'], ['б', 'b'], ['в', 'v'], ['г', 'g'], ['д', 'd'], ['е', 'e'],
  ['з', 'z'], ['и', 'i'], ['й', 'y'], ['к', 'k'], ['л', 'l'], ['м', 'm'],
  ['н', 'n'], ['о', 'o'], ['п', 'p'], ['р', 'r'], ['с', 's'], ['т', 't'],
  ['у', 'u'], ['ф', 'f'], ['ы', 'i'], ['э', 'e'],
  // O'zbek kirilli
  ['ў', 'o'], ['қ', 'q'], ['ғ', 'g'], ['ҳ', 'h'],
];

// Ko'p harfli birikmalar OLDIN almashtiriladi ("sh" -> "ш", keyin "s" -> "с").
const LAT_TO_CYR: Array<[string, string]> = [
  ['yo', 'ё'], ['yu', 'ю'], ['ya', 'я'], ['ch', 'ч'], ['sh', 'ш'], ['ts', 'ц'],
  ["o'", 'ў'], ["g'", 'г'], ['gh', 'г'], ['kh', 'х'], ['zh', 'ж'],
  ['a', 'а'], ['b', 'б'], ['v', 'в'], ['w', 'в'], ['g', 'г'], ['d', 'д'],
  ['e', 'е'], ['j', 'ж'], ['z', 'з'], ['i', 'и'], ['y', 'й'], ['k', 'к'],
  ['q', 'к'], ['l', 'л'], ['m', 'м'], ['n', 'н'], ['o', 'о'], ['p', 'п'],
  ['r', 'р'], ['s', 'с'], ['t', 'т'], ['u', 'у'], ['f', 'ф'], ['x', 'х'],
  ['h', 'х'], ['c', 'к'],
];

function replaceAll(text: string, pairs: Array<[string, string]>): string {
  let out = '';
  let i = 0;
  const lower = text.toLowerCase();
  outer: while (i < lower.length) {
    for (const [from, to] of pairs) {
      if (from && lower.startsWith(from, i)) {
        out += to;
        i += from.length;
        continue outer;
      }
    }
    out += lower[i];
    i += 1;
  }
  return out;
}

/** "Вентилятор" -> "ventilyator" */
export const cyrillicToLatin = (text: string) => replaceAll(text, CYR_TO_LAT);

/** "vts" -> "вц" */
export const latinToCyrillic = (text: string) => replaceAll(text, LAT_TO_CYR);

const hasCyrillic = (text: string) => /[Ѐ-ӿ]/.test(text);
const hasLatin = (text: string) => /[a-z]/i.test(text);

/**
 * So'zning qidirishga yaroqli variantlari (takrorlanmaydigan, bo'shsiz).
 * Faqat kerakli yo'nalishda o'giriladi: sof raqamli kod ("4-75", "150")
 * o'zgarmaydi.
 */
export function searchVariants(word: string): string[] {
  const base = word.toLowerCase();
  const out = new Set<string>([base]);
  if (hasCyrillic(base)) out.add(cyrillicToLatin(base));
  if (hasLatin(base)) out.add(latinToCyrillic(base));
  return [...out].filter((w) => w.length > 0);
}
