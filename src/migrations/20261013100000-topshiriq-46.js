'use strict';

// Topshiriq №46 — chatda fayl yuborish.
//
// Fayl avval yuklanadi (`message_id` NULL), keyin xabarga bog'lanadi.
// 24 soat ichida bog'lanmagani fon ishi bilan o'chiriladi (`ChatFilesJobs`).
//
// Saqlash: `R2_DOCS_BUCKET` (yopiq bucket) sozlangan bo'lsa — R2
// (`chat/<chat_id>/<uuid>`), aks holda `chat_attachment_blobs` (bazada).
// Asl nom faqat shu jadvalda. HEIC JPEG ga aylantiriladi va asl HEIC
// SAQLANMAYDI: unda EXIF/GPS bor, uni beradigan endpoint esa yo'q.
//
// Xabar o'chirilsa (hozir yo'q) yoki suhbat o'chirilsa — fayl yozuvi ham
// (CASCADE). R2 obyektini esa kod o'chiradi (test-data purge, fon ishi).
module.exports = {
  async up(queryInterface) {
    const t = await queryInterface.sequelize.transaction();
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction: t });
    try {
      await q(`
        CREATE TABLE IF NOT EXISTS chat_attachments (
          id               SERIAL PRIMARY KEY,
          chat_id          INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
          message_id       INTEGER REFERENCES chat_messages(id) ON DELETE CASCADE,
          uploader_side    VARCHAR(6) NOT NULL CHECK (uploader_side IN ('client', 'store')),
          uploader_user_id INTEGER NOT NULL,
          kind             VARCHAR(5) NOT NULL CHECK (kind IN ('image', 'video', 'audio', 'file')),
          name             VARCHAR(255) NOT NULL,
          mime             VARCHAR(127) NOT NULL,
          size             INTEGER NOT NULL CHECK (size >= 0),
          width            INTEGER,
          height           INTEGER,
          storage          VARCHAR(2) NOT NULL CHECK (storage IN ('r2', 'db')),
          file_key         VARCHAR(200),
          thumb_key        VARCHAR(200),
          has_thumb        BOOLEAN NOT NULL DEFAULT false,
          created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
          CONSTRAINT chat_attachments_r2_key_chk CHECK (storage <> 'r2' OR file_key IS NOT NULL)
        )`);
      await q(`CREATE INDEX IF NOT EXISTS chat_attachments_message_idx ON chat_attachments (message_id) WHERE message_id IS NOT NULL`);
      await q(`CREATE INDEX IF NOT EXISTS chat_attachments_orphan_idx ON chat_attachments (created_at) WHERE message_id IS NULL`);
      // Kunlik hajm cheklovi (500 MB) shu indeks bilan hisoblanadi
      await q(`CREATE INDEX IF NOT EXISTS chat_attachments_uploader_idx
                 ON chat_attachments (uploader_side, uploader_user_id, created_at DESC)`);

      await q(`
        CREATE TABLE IF NOT EXISTS chat_attachment_blobs (
          attachment_id INTEGER NOT NULL REFERENCES chat_attachments(id) ON DELETE CASCADE,
          variant       VARCHAR(6) NOT NULL CHECK (variant IN ('file', 'thumb')),
          data          BYTEA NOT NULL,
          PRIMARY KEY (attachment_id, variant)
        )`);
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
      await q(`DROP TABLE IF EXISTS chat_attachment_blobs`);
      await q(`DROP TABLE IF EXISTS chat_attachments`);
      await t.commit();
    } catch (e) {
      await t.rollback();
      throw e;
    }
  },
};
