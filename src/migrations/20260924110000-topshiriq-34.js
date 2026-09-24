'use strict';

// Topshiriq №34 — ilova ichida xaridor ↔ do'kon chati.
//
// Bitta xaridor + bitta do'kon = BITTA suhbat (UNIQUE). Qaysi mahsulot
// haqida ekani — xabarning o'zida (`product_id`).
//
// `client_msg_id` — ilova beradigan uuid: internet uzilib qayta yuborilsa
// ikkinchi yozuv ochilmaydi (UNIQUE (chat_id, client_msg_id)).
//
// "Matn yoki mahsulot bo'lishi shart" qoidasi BAZADA CHECK EMAS, kodda:
// mahsulot o'chirilsa `product_id` NULL bo'ladi (ON DELETE SET NULL) va
// CHECK eski xabarni o'chirishga to'sqinlik qilardi.
module.exports = {
  async up(queryInterface) {
    const t = await queryInterface.sequelize.transaction();
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction: t });
    try {
      await q(`
        CREATE TABLE IF NOT EXISTS chats (
          id                  SERIAL PRIMARY KEY,
          client_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          store_id            INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
          created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
          client_last_read_id INTEGER NOT NULL DEFAULT 0,
          store_last_read_id  INTEGER NOT NULL DEFAULT 0,
          CONSTRAINT chats_client_store_uq UNIQUE (client_id, store_id)
        )`);
      await q(`CREATE INDEX IF NOT EXISTS chats_store_updated_idx ON chats (store_id, updated_at DESC)`);
      await q(`CREATE INDEX IF NOT EXISTS chats_client_updated_idx ON chats (client_id, updated_at DESC)`);

      await q(`
        CREATE TABLE IF NOT EXISTS chat_messages (
          id             SERIAL PRIMARY KEY,
          chat_id        INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
          sender         VARCHAR(6) NOT NULL CHECK (sender IN ('client', 'store')),
          sender_user_id INTEGER,
          text           VARCHAR(2000),
          product_id     INTEGER REFERENCES products(id) ON DELETE SET NULL,
          client_msg_id  UUID,
          created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
          CONSTRAINT chat_messages_client_msg_uq UNIQUE (chat_id, client_msg_id)
        )`);
      await q(`CREATE INDEX IF NOT EXISTS chat_messages_chat_id_idx ON chat_messages (chat_id, id DESC)`);
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
      await q(`DROP TABLE IF EXISTS chat_messages`);
      await q(`DROP TABLE IF EXISTS chats`);
      await t.commit();
    } catch (e) {
      await t.rollback();
      throw e;
    }
  },
};
