// Do'kon nomidan URL slug yasash: "Air Cool O'zbekiston" -> "air-cool-ozbekiston",
// "Вентсистемы" -> "ventsistemy". Natija `stores.slug` CHECK constraint'iga
// mos: ^[a-z0-9]+(-[a-z0-9]+)*$

const CYRILLIC: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', ғ: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'j',
  з: 'z', и: 'i', й: 'y', к: 'k', қ: 'q', л: 'l', м: 'm', н: 'n', о: 'o',
  п: 'p', р: 'r', с: 's', т: 't', у: 'u', ў: 'o', ф: 'f', х: 'x', ҳ: 'h',
  ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sh', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu',
  я: 'ya',
};

export function slugify(input: string): string {
  const s = String(input || '')
    .toLowerCase()
    .split('')
    .map((ch) => (ch in CYRILLIC ? CYRILLIC[ch] : ch))
    .join('')
    // o', g' va boshqa apostroflar — shunchaki olib tashlanadi
    .replace(/['`’ʻʼ‘]/g, '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
    .replace(/-+$/g, '');
  return s || 'dokon';
}
