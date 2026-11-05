import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { QueryTypes } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';

/**
 * Umumiy fayl omborlaridagi (R2 ommaviy bucket, Cloudinary) obyektlarga
 * do'kon admini faqat O'Z do'koniga tegishli bo'lsa tega olsin
 * (xavfsizlik auditi 2026-11-05, 1- va 3-topilma).
 *
 * Ilgari `PUT /r2/r2-update`, `DELETE /r2/r2-object` va
 * `DELETE /images/upload-image` istalgan do'kon tokeni bilan ISTALGAN
 * kalitni yozar/o'chirardi: A do'koni B do'konining mahsulot tavsifini
 * almashtirishi (sahifasini buzishi) yoki rasmlarini o'chirishi mumkin edi.
 *
 * Qoida: obyektga havola qilgan yozuvlar topiladi. Birortasi BOSHQA do'konga
 * (yoki do'konsiz umumiy narsaga: banner, kategoriya ikonkasi, mijoz rasmi)
 * tegishli bo'lsa — 403. Hech qayerda havola qilinmagan obyekt (yangi
 * yuklangan, hali saqlanmagan) — ruxsat: aks holda adminkaning "yukla →
 * saqla" oqimi buziladi. `storeId === null` — superadmin / servis kaliti /
 * eski admin tokeni, cheklovsiz (javob shakli va xatti-harakat o'zgarmaydi).
 */

/** R2 tavsif kaliti: yangi `climavent/<uuid>.json` yoki eski `<uuid>`. */
export const R2_KEY_RE = /^(climavent\/)?[0-9a-fA-F-]{36}(\.json)?$/;

export function normalizeR2Key(key: unknown): string {
  const k = String(key ?? '').trim();
  if (!R2_KEY_RE.test(k)) throw new BadRequestException("Kalit shakli noto'g'ri");
  return k;
}

const FORBIDDEN = "Bu fayl boshqa do'konga tegishli";

export async function assertR2KeyOwned(db: Sequelize, key: string, storeId: number | null) {
  if (storeId === null) return;
  // Havola bazada `${R2_PUBLIC_URL}/${key}` (ba'zan `?v=...` bilan) ko'rinishida.
  // Kalitda `%`/`_` bo'lmaydi (R2_KEY_RE) — LIKE shabloni xavfsiz.
  const rows: { store_id: number | null }[] = await db.query(
    `SELECT p.store_id FROM products p
      WHERE p.opisaniya LIKE ANY (ARRAY[:a, :b]) OR p.naznacheniya LIKE ANY (ARRAY[:a, :b])
         OR p.markirovka LIKE ANY (ARRAY[:a, :b]) OR p.sizes LIKE ANY (ARRAY[:a, :b])
     UNION
     SELECT p.store_id FROM characteristics c JOIN products p ON p.id = c.product_id
      WHERE c.content LIKE ANY (ARRAY[:a, :b])`,
    { replacements: { a: `%/${key}`, b: `%/${key}?%` }, type: QueryTypes.SELECT },
  );
  if (rows.some((r) => Number(r.store_id) !== Number(storeId))) throw new ForbiddenException(FORBIDDEN);
}

export async function assertCloudinaryOwned(db: Sequelize, publicId: string, storeId: number | null) {
  if (storeId === null) return;
  const pid = String(publicId ?? '').trim();
  // Havolada public_id ba'zan URL-kodlangan (kirill nomlar) holda turadi
  const enc = encodeURI(pid);
  const has = (col: string) => `(strpos(${col}, :p) > 0 OR strpos(${col}, :e) > 0)`;
  const arr = (col: string) => has(`array_to_string(${col}, ' ')`);
  // owner = NULL — do'konga tegishli bo'lmagan umumiy obyekt (faqat superadmin)
  const rows: { owner: number | null }[] = await db.query(
    `SELECT p.store_id AS owner FROM product_images i JOIN products p ON p.id = i.product_id WHERE ${has('i.image_link')}
     UNION ALL SELECT s.id FROM stores s WHERE ${has('s.logo_url')}
     UNION ALL SELECT sv.store_id FROM services sv WHERE ${arr('sv.photos')}
     UNION ALL SELECT NULL FROM banner b WHERE ${has(`concat_ws(' ', b.img_url, b.image_desktop_uz, b.image_desktop_ru,
           b.image_desktop_en, b.image_mobile_uz, b.image_mobile_ru, b.image_mobile_en)`)}
     UNION ALL SELECT NULL FROM service_categories sc WHERE ${has('sc.icon')}
     UNION ALL SELECT NULL FROM users u WHERE ${has('u.image_url')}
     UNION ALL SELECT NULL FROM deliveries d WHERE ${has(`concat_ws(' ', d.proof_photo_url, d.fiscal_receipt_url)`)}
     UNION ALL SELECT NULL FROM service_jobs j WHERE ${has(`concat_ws(' ', j.failure_photo,
           array_to_string(j.customer_photos, ' '), array_to_string(j.final_amount_photos, ' '),
           array_to_string(j.photos_before, ' '), array_to_string(j.photos_after, ' '))`)}
     LIMIT 50`,
    { replacements: { p: pid, e: enc }, type: QueryTypes.SELECT },
  );
  if (rows.some((r) => r.owner === null || Number(r.owner) !== Number(storeId))) {
    throw new ForbiddenException(FORBIDDEN);
  }
}
