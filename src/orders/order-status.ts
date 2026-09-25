// Buyurtma holatlari — YAGONA MANBA (topshiriq №14, 4-band).
//
// Ilgari `status` ixtiyoriy matn edi va bazada uch xil qiymat yig'ilgandi
// ("Yetkazilyapti", "Tolanmagan", "Done"). Adminkaga tanlash ro'yxatini
// qo'yish uchun qat'iy ro'yxat kerak edi.
//
// Ko'rinadigan matn BU YERDA YO'Q — adminka va sayt o'zi tarjima qiladi
// (uz/ru/en). Bu yerda faqat kod qiymati turadi.
export const ORDER_STATUSES = [
  'new', // yaratildi, to'lanmagan
  'quote_sent', // faqat KP so'rovida: sotuvchi KP yubordi (№21, 3-band)
  'paid', // to'landi, hali jo'natilmagan
  'packing', // kamida bitta do'kon yig'yapti (№38) — AVTOMATIK
  'ready', // hamma do'konlar yig'ib bo'ldi (№38) — AVTOMATIK
  'shipping', // yetkazilyapti
  'in_progress', // usta yo'lda yoki ishlayapti (№39) — AVTOMATIK
  'done', // xaridorga topshirildi
  'cancelled', // bekor qilindi
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

/**
 * Qo'lda qo'yib bo'lmaydigan holatlar (№38, 1-band; №39, 7-band): ular
 * yig'ish bosqichi, yetkazish va ishlardan AVTOMATIK kelib chiqadi.
 * `PATCH /orders/update/:id` va `POST /orders/create` da — 400.
 */
export const AUTO_ORDER_STATUSES: readonly string[] = ['packing', 'ready', 'in_progress'];

// Eski (o'zbekcha) qiymatlar — migratsiyagacha yozilgan mijozlar
// buzilmasligi uchun bir muddat qabul qilinadi va yangisiga aylantiriladi.
// Yangi integratsiyalar to'g'ridan-to'g'ri yuqoridagi ro'yxatdan
// foydalansin.
const ESKI_NOMLAR: Record<string, OrderStatus> = {
  Tolanmagan: 'new',
  Yetkazilyapti: 'shipping',
  Done: 'done',
};

/**
 * Kelgan holatni ro'yxatdagi qiymatga keltiradi.
 * Tanimasa `undefined` qaytadi — chaqiruvchi 400 beradi.
 */
export function normalizeOrderStatus(value: unknown): OrderStatus | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if ((ORDER_STATUSES as readonly string[]).includes(trimmed)) {
    return trimmed as OrderStatus;
  }
  return ESKI_NOMLAR[trimmed];
}

// Xato xabarida ham, Swagger'da ham bir xil ko'rinsin.
export const ORDER_STATUS_MESSAGE = `status faqat quyidagilardan biri bo'lishi mumkin: ${ORDER_STATUSES.join(
  ', ',
)}`;

// Buyurtma turi (topshiriq №21, 3-band). `quote` — narx so'rovi (KP): mijoz
// narxsiz mahsulot uchun tijorat taklifi so'raydi.
export const ORDER_KINDS = ['order', 'quote'] as const;
export type OrderKind = (typeof ORDER_KINDS)[number];
