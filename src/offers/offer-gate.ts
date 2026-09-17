import { ConflictException } from '@nestjs/common';
import { Op } from 'sequelize';
import { OfferVersion } from './model/offer-version.model';
import { OfferAcceptance } from './model/offer-acceptance.model';

/** Tasdiqlashning O'ZI va kirish/chiqish — hech qachon to'silmaydi. */
const ALWAYS_ALLOWED = [/^\/api\/offers\/accept$/, /^\/api\/store-auth\//];

const WRITE_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

/**
 * Ofertaning YANGI versiyasini tasdiqlamaguncha yozishni to'sish
 * (topshiriq №20, 2-band; oferta 12.3).
 *
 * Nega guard emas, oddiy funksiya: tekshiruv bir necha guard'da kerak
 * (`StoreAuthGuard`, `CustomerOrBackofficeGuard`) va ular ko'p modulda
 * ishlatiladi — har biriga `ConsentService` ni DI orqali ulash kerak
 * bo'lmasin. Shuning uchun modellar `resolveStoreSession` kabi statik
 * ishlatiladi.
 *
 * Qoida:
 *   - faqat DO'KON ADMINI uchun (superadmin va servis kaliti maydoncha
 *     xodimi, sotuvchi emas);
 *   - faqat YOZISH (POST/PATCH/PUT/DELETE) — o'qish ishlayveradi, aks holda
 *     sotuvchi o'z ma'lumotini ko'ra olmay qolardi;
 *   - javob 409 va `error: 'offer_acceptance_required'` — adminka shu belgi
 *     bo'yicha tasdiqlash oynasini ochadi.
 */
export async function assertOfferAccepted(
  req: any,
  storeUserId?: number | null,
  storeId?: number | null,
): Promise<void> {
  // Favqulodda o'chirish: adminkadagi tasdiqlash oynasi ishlamay qolsa
  // sotuvchilar ishsiz qolmasin. Signal (`offer_pending`) baribir qaytadi.
  if (process.env.OFFER_GATE_DISABLED === 'true') return;
  if (!WRITE_METHODS.has(String(req?.method || '').toUpperCase())) return;
  if (!storeUserId) return; // servis kaliti — hisob yo'q
  const path = String(req?.originalUrl || req?.url || '').split('?')[0];
  if (ALWAYS_ALLOWED.some((r) => r.test(path))) return;

  const offer = await OfferVersion.findOne({
    where: { kind: 'seller', is_current: true },
    attributes: ['version', 'url'],
  });
  // Joriy oferta e'lon qilinmagan bo'lsa hech kimni to'smaymiz.
  if (!offer) return;

  const or: any[] = [{ store_user_id: storeUserId }];
  if (storeId) or.push({ store_id: storeId });
  const accepted = await OfferAcceptance.findOne({
    where: { kind: 'seller', version: offer.version, [Op.or]: or },
    attributes: ['id'],
  });
  if (accepted) return;

  throw new ConflictException({
    statusCode: 409,
    error: 'offer_acceptance_required',
    message:
      "Oferta yangilandi — davom etish uchun yangi versiyani tasdiqlang",
    offer_pending: { kind: 'seller', version: offer.version, url: offer.url },
  });
}
