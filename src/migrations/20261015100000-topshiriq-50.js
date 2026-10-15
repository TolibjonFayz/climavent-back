'use strict';

// Topshiriq №50 — chatda xabarga javob berish (reply).
//
// chat_messages.reply_to_id — shu suhbatdagi xabar (tekshiruv kodda). Asl xabar
// o'chsa (sinov tozalashi, №43) javob qoladi, `reply_to_id` NULL bo'ladi.
//
// Eski backend bilan mos: faqat yangi nullable ustun. Yangi backend SQL da shu
// ustunni o'qiydi — migratsiya OLDIN.
module.exports = {
  async up(queryInterface) {
    const t = await queryInterface.sequelize.transaction();
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction: t });
    try {
      await q(`ALTER TABLE chat_messages
                 ADD COLUMN IF NOT EXISTS reply_to_id INTEGER REFERENCES chat_messages(id) ON DELETE SET NULL`);
      // FK ON DELETE SET NULL asl xabar o'chganda javoblarni shu indeks bilan topadi
      await q(`CREATE INDEX IF NOT EXISTS chat_messages_reply_to_idx ON chat_messages (reply_to_id) WHERE reply_to_id IS NOT NULL`);
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
      await q(`DROP INDEX IF EXISTS chat_messages_reply_to_idx`);
      await q(`ALTER TABLE chat_messages DROP COLUMN IF EXISTS reply_to_id`);
      await t.commit();
    } catch (e) {
      await t.rollback();
      throw e;
    }
  },
};
