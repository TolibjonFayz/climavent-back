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
  'paid', // to'landi, hali jo'natilmagan
  'shipping', // yetkazilyapti
  'done', // xaridorga topshirildi
  'cancelled', // bekor qilindi
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

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
