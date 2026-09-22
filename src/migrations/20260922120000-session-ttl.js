'use strict';

// Sayt sessiyasi 6 OY (relizdan oldingi so'rov).
//
// `user_refresh_tokens` bitta jadval, lekin muddat mijozga qarab farq qiladi:
//   sayt   — 180 kun (6 oy), sirpanuvchi;
//   mobil  — 90 kun (topshiriq №29, 3-band), sirpanuvchi.
//
// Muddat SATRNING O'ZIDA saqlanadi (`ttl_days`), chunki yangilashda
// (rotatsiya) yangi tokenga xuddi shu muddat qo'yilishi kerak — aks holda
// saytda kirgan odam 90 kundan keyin chiqib ketardi.
module.exports = {
  async up(queryInterface, Sequelize) {
    const t = await queryInterface.sequelize.transaction();
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction: t });
    try {
      await q(
        `ALTER TABLE user_refresh_tokens
           ADD COLUMN IF NOT EXISTS ttl_days INTEGER NOT NULL DEFAULT 180`,
      );
      // Mavjud (mobil) sessiyalar 90 kunda qoladi
      await q(
        `UPDATE user_refresh_tokens SET ttl_days = 90
          WHERE expires_at < now() + interval '120 days'`,
      );
      await t.commit();
    } catch (e) {
      await t.rollback();
      throw e;
    }
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      'ALTER TABLE user_refresh_tokens DROP COLUMN IF EXISTS ttl_days',
    );
  },
};
