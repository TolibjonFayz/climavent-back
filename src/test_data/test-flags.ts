import { QueryTypes, Sequelize } from 'sequelize';

/**
 * Xaridorning sinov raqami (topshiriq №43, 2.1). Alohida yengil fayl: users.service
 * ham chaqiradi — og'ir modullarni (jobs.service ...) import qilib sikl hosil qilmasin.
 */

/** `SMS_TEST_PHONES` -> raqamlar (otp.service `isTestPhone` bilan bir xil normallash). */
export function testPhoneList(): string[] {
  return String(process.env.SMS_TEST_PHONES || '')
    .split(',')
    .map((x) => x.trim().replace(/\D/g, ''))
    .filter(Boolean)
    .map((d) => (d.length === 9 ? `998${d}` : d));
}
const PHONE_DIGITS = `(CASE WHEN length(regexp_replace(COALESCE(u.phone_number, ''), '\\D', '', 'g')) = 9
                            THEN '998' || regexp_replace(u.phone_number, '\\D', '', 'g')
                            ELSE regexp_replace(COALESCE(u.phone_number, ''), '\\D', '', 'g') END)`;

/**
 * Xaridorlar: `SMS_TEST_PHONES` dagi raqam -> `is_test` (+ buyurtmalari).
 * Ilova ishga tushganda va yangi xaridor yaratilganda chaqiriladi. Env
 * o'zgarsa Railway restart yetadi. Faqat `true` qo'yadi — olib tashlamaydi.
 */
export async function syncTestPhones(sequelize: Sequelize, userIds?: number[]) {
  const phones = testPhoneList();
  if (!phones.length) return 0;
  const rows: any[] = await sequelize.query(
    `UPDATE users u SET is_test = true
      WHERE NOT u.is_test AND ${PHONE_DIGITS} IN (:phones) ${userIds?.length ? 'AND u.id IN (:ids)' : ''}
      RETURNING u.id`,
    { replacements: { phones, ids: userIds ?? [] }, type: QueryTypes.SELECT },
  );
  if (rows.length) {
    await sequelize.query(`UPDATE orders SET is_test = true WHERE NOT is_test AND user_id IN (:ids)`, {
      replacements: { ids: rows.map((r) => r.id) },
    });
  }
  return rows.length;
}

