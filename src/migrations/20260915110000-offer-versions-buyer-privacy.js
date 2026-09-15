'use strict';

// Topshiriq №18, 1-band — hujjatlarning 1.0 versiyasi 15.09.2026 da e'lon qilindi.
//
//   seller  1.0 — faqat `effective_at` (versiya raqami o'zgarmaydi: ochiq
//                 formalar `1.0` bilan yuboradi)
//   buyer   1.0 — foydalanish shartlari, /foydalanish-shartlari
//   privacy 1.0 — maxfiylik siyosati, /maxfiylik
const EFFECTIVE = '2026-09-15T00:00:00+05:00';
const PREV_SELLER_EFFECTIVE = '2026-09-14T07:24:53Z';

module.exports = {
  async up(queryInterface) {
    const q = queryInterface.sequelize;
    await q.transaction(async (transaction) => {
      const o = { transaction, replacements: { eff: EFFECTIVE } };
      await q.query(
        `UPDATE offer_versions SET effective_at = :eff, updated_at = now()
          WHERE kind = 'seller' AND version = '1.0'`,
        o,
      );
      await q.query(
        `INSERT INTO offer_versions (kind, version, url, published_at, effective_at, is_current, created_at, updated_at)
         VALUES
           ('buyer',   '1.0', 'https://climavent.uz/foydalanish-shartlari', :eff, :eff, true, now(), now()),
           ('privacy', '1.0', 'https://climavent.uz/maxfiylik',             :eff, :eff, true, now(), now())
         ON CONFLICT (kind, version) DO NOTHING`,
        o,
      );
    });
  },

  async down(queryInterface) {
    const q = queryInterface.sequelize;
    await q.transaction(async (transaction) => {
      await q.query(`DELETE FROM offer_versions WHERE kind IN ('buyer', 'privacy') AND version = '1.0'`, { transaction });
      await q.query(
        `UPDATE offer_versions SET effective_at = :prev WHERE kind = 'seller' AND version = '1.0'`,
        { transaction, replacements: { prev: PREV_SELLER_EFFECTIVE } },
      );
    });
  },
};
