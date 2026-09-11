// API javobidan HECH QACHON chiqmasligi kerak bo'lgan maydonlar
// (topshiriq №13, 2-band).
//
// NEGA MODELDA `toJSON()` EMAS: Sequelize ichma-ich yuklangan obyektni
// (`include`) ota obyektning `get({ plain: true })` orqali serializatsiya
// qiladi va bola modelning `toJSON()` ini CHAQIRMAYDI. Ya'ni `User`
// modelida `toJSON()` bekor qilinsa ham, `cart/all` ichidagi `user` da
// `refresh_token` baribir chiqaverardi — va aynan shu joylarda chiqayotgan
// edi. `include: { all: true }` esa kod bazasida o'nlab joyda bor.
//
// Shuning uchun filtr JSON.stringify darajasida — Express'ning
// `json replacer` sozlamasi orqali. Har bir javob, har qanday chuqurlikda,
// qo'shimcha aylanishsiz tozalanadi; kelajakda yangi endpoint qo'shilsa
// ham avtomatik qamrab olinadi.
//
// DIQQAT: bu faqat JAVOBGA ta'sir qiladi. Serverning o'zi model orqali
// bu maydonlarni o'qishda davom etadi (masalan refresh token tekshiruvi
// `worker.refresh_token` ni o'qiydi) — u yerda hech narsa o'zgarmaydi.
export const SENSITIVE_RESPONSE_FIELDS: ReadonlySet<string> = new Set([
  // Mijozning refresh token hash'i (bcrypt). Tirik token emas, lekin
  // offlayn hujum uchun material va javobda qiladigan ishi yo'q.
  'refresh_token',
  'hashed_refresh_token',
  // Hisobni faollashtirish kaliti: `GET /users/activate/:link` aynan shu
  // qiymat bilan hisobni faollashtiradi. Javobda chiqsa, uni ko'rgan
  // istalgan odam begona hisobni faollashtira oladi.
  'unique_id',
  // Parol hash'lari. `store_users` o'z `toJSON()` ida allaqachon
  // chiqaradi — bu ikkinchi himoya qatlami.
  'password_hash',
  'hashed_password',
]);

/** `JSON.stringify` uchun replacer — maxfiy kalitlarni tashlab yuboradi. */
export function stripSensitiveFields(key: string, value: unknown): unknown {
  return SENSITIVE_RESPONSE_FIELDS.has(key) ? undefined : value;
}
