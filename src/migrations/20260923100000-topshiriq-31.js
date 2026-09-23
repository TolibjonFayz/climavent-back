'use strict';

// Topshiriq №31 — sotuvchiga push (CV Hamkor ilovasi).
//
// `store_users.lang` — bildirishnoma matni tili (`uz` | `ru` | `en`).
// Bo'sh bo'lsa o'zbekcha (topshiriqdagi qoida).
//
// DIQQAT: ustun Sequelize MODELIGA ATAYLAB qo'shilmaydi — e'lon qilinsa
// Sequelize uni har `SELECT` ga qo'shadi va migratsiyadan oldin deploy
// bo'lsa do'kon hisobiga tegadigan hamma so'rov yiqiladi. Til xom SQL
// bilan o'qiladi/yoziladi (`deliveries/store-push.ts`, `store_users.service`).
module.exports = {
  async up(queryInterface) {
    const t = await queryInterface.sequelize.transaction();
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction: t });
    try {
      await q(`ALTER TABLE store_users ADD COLUMN IF NOT EXISTS lang VARCHAR(5)`);
      await q(`ALTER TABLE store_users DROP CONSTRAINT IF EXISTS store_users_lang_chk`);
      await q(
        `ALTER TABLE store_users ADD CONSTRAINT store_users_lang_chk
           CHECK (lang IS NULL OR lang IN ('uz', 'ru', 'en'))`,
      );

      // Nofaol yoki o'chirilgan hisoblarning qurilma tokenlari qolmasin
      // (topshiriq №31, "Qoidalar" bo'limi). Mavjud yozuvlarni tozalaymiz;
      // bundan keyin buni `store_users.service` bajaradi.
      await q(
        `DELETE FROM device_tokens
           WHERE owner_type = 'store_user'
             AND owner_id NOT IN (SELECT id FROM store_users WHERE is_active)`,
      );
      await q(
        `DELETE FROM device_tokens
           WHERE owner_type = 'user'
             AND owner_id NOT IN (SELECT id FROM users WHERE is_active)`,
      );
      await t.commit();
    } catch (e) {
      await t.rollback();
      throw e;
    }
  },

  async down(queryInterface) {
    const t = await queryInterface.sequelize.transaction();
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction: t });
    try {
      await q(`ALTER TABLE store_users DROP CONSTRAINT IF EXISTS store_users_lang_chk`);
      await q(`ALTER TABLE store_users DROP COLUMN IF EXISTS lang`);
      await t.commit();
    } catch (e) {
      await t.rollback();
      throw e;
    }
  },
};
