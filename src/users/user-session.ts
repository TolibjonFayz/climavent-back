import { User } from './model/user.model';

export interface UserRequester {
  id: number;
  is_active: boolean;
  is_admin: boolean;
  role: string;
  store_id: number | null;
  token_version: number;
}

/**
 * Sayt tokenidan (mijoz yoki sayt admini) so'rov egasini BAZA bo'yicha
 * aniqlaydi (topshiriq №19, 2-band).
 *
 * Ilgari `AdminGuard`, `UserGuard` va qolganlari faqat JWT IMZOSINI
 * tekshirardi. Ya'ni:
 *   - adminlikdan tushirilgan hisob token muddati tugaguncha admin bo'lib
 *     qolardi (`is_admin` tokendan o'qilardi);
 *   - o'chirilgan yoki nofaol qilingan foydalanuvchi ishlashda davom etardi;
 *   - parol/telefon almashtirilsa ham eski tokenlar yashardi.
 *
 * Do'kon hisoblarida bu №17 da tuzatilgan edi (`resolveStoreSession`) — bu
 * o'sha ishning sayt tomoni.
 *
 * `null` — tokenni rad etish kerak (chaqiruvchi 401 beradi).
 *
 * Model DI orqali emas, statik ishlatiladi: guard'lar ko'p modulda
 * qo'llanadi, har biriga `User` repozitoriysini qo'shish shart bo'lmasin.
 */
export async function resolveUserSession(payload: any): Promise<UserRequester | null> {
  const id = Number(payload?.id);
  if (!Number.isInteger(id) || id <= 0) return null;

  const user = await User.findByPk(id, {
    attributes: ['id', 'is_active', 'is_admin', 'role', 'store_id', 'token_version'],
  });
  if (!user) return null;
  // Tasdiqlanmagan (OTP kiritilmagan) yoki bloklangan hisob
  if (!user.is_active) return null;
  // Parol/telefon almashsa hisoblagich oshadi — eski tokenlar o'ladi.
  // Eski tokenlarda `tv` yo'q: 0 deb olinadi, ya'ni hozirgi sessiyalar buzilmaydi.
  if (Number(payload?.tv ?? 0) !== Number(user.token_version ?? 0)) return null;

  return {
    id: user.id,
    is_active: user.is_active,
    // TOKENDAN EMAS, bazadan: adminlikdan tushirilgan hisob darhol oddiy
    // foydalanuvchiga aylanadi.
    is_admin: !!user.is_admin,
    role: user.role,
    store_id: user.store_id ?? null,
    token_version: Number(user.token_version ?? 0),
  };
}

/**
 * Guard'lar `req.user` ni JWT payload'i deb ishlatadi (`id`, `is_admin`).
 * Bazadan olingan qiymatlar bilan bir xil shaklni saqlaymiz, ya'ni mavjud
 * kodni o'zgartirmasdan ishonchli qiymatga o'tkazamiz.
 */
export function sessionPayload(payload: any, session: UserRequester) {
  return { ...payload, id: session.id, is_active: session.is_active, is_admin: session.is_admin };
}
