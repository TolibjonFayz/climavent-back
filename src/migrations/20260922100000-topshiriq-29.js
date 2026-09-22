'use strict';

// Topshiriq №29 — xaridor mobil ilovasi.
//
// 1) `user_refresh_tokens` — xaridorning mobil sessiyasi (3-band).
//    `store_refresh_tokens` ning aynan o'zi, ikki qo'shimcha ustun bilan:
//    `replaced_at` va `replacement_enc` — 30 soniyalik "imtiyoz oynasi"
//    (tarmoq uzilib javob yetib bormasa, xuddi o'sha juftlik qaytadi).
//    Tokenning o'zi saqlanmaydi — faqat SHA-256 xeshi.
//
// 2) `users.lang` — push va SMS matni tili (4-band). Bo'sh bo'lsa `uz`.
//
// 3) Kategoriyalarda `category_id = id` bo'lgan yozuvlarni tozalash
//    (5-band): #34 va #35 o'zini o'ziga ota qilib qo'ygan, daraxt quradigan
//    kod cheksiz aylanib qolishi mumkin. Qayta paydo bo'lmasligi uchun
//    CHECK qo'yiladi (API darajasida ham 400 qaytadi).
module.exports = {
  async up(queryInterface, Sequelize) {
    const t = await queryInterface.sequelize.transaction();
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction: t });
    try {
      // IDEMPOTENT: ilova `sequelize.sync()` bilan ishlaydi (app.module'da
      // `synchronize` ko'rsatilmagan), ya'ni yangi jadvalni deploy paytida
      // SYNC ning o'zi yaratib qo'yishi mumkin. Unda `createTable` "already
      // exists" bilan yiqilardi va butun migratsiya o'tmasdi.
      const jadvallar = await queryInterface.showAllTables();
      const bor = jadvallar.map((x) => String(x).toLowerCase());
      // Sync yaratgan jadvalda FK, indekslar va standart qiymatlar
      // bo'lmaydi, shuning uchun uni to'g'ri sxema bilan qayta yaratamiz.
      // Ichidagi sessiyalar yo'qoladi — mobil foydalanuvchilar qaytadan
      // kirishi kerak bo'ladi (funksiya yangi, hozircha qator yo'q).
      if (bor.includes('user_refresh_tokens')) {
        await q(`DROP TABLE user_refresh_tokens`);
      }
      await queryInterface.createTable(
        'user_refresh_tokens',
        {
          id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
          user_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: { model: 'users', key: 'id' },
            onDelete: 'CASCADE',
          },
          token_hash: { type: Sequelize.STRING(64), allowNull: false, unique: true },
          token_version: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
          expires_at: { type: Sequelize.DATE, allowNull: false },
          revoked_at: { type: Sequelize.DATE, allowNull: true },
          replaced_by_id: { type: Sequelize.INTEGER, allowNull: true },
          replaced_at: { type: Sequelize.DATE, allowNull: true },
          replacement_enc: { type: Sequelize.TEXT, allowNull: true },
          last_used_at: { type: Sequelize.DATE, allowNull: true },
          ip: { type: Sequelize.STRING(64), allowNull: true },
          user_agent: { type: Sequelize.STRING(500), allowNull: true },
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('now()'),
          },
        },
        { transaction: t },
      );
      await q(
        `CREATE INDEX IF NOT EXISTS user_refresh_tokens_user ON user_refresh_tokens (user_id, revoked_at)`,
      );
      // Muddati o'tgan yozuvlarni tozalash uchun
      await q(
        `CREATE INDEX IF NOT EXISTS user_refresh_tokens_expires ON user_refresh_tokens (expires_at)`,
      );

      // --- 2) Til
      await q(`ALTER TABLE users ADD COLUMN IF NOT EXISTS lang VARCHAR(5)`);
      await q(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_lang_chk`);
      await q(
        `ALTER TABLE users ADD CONSTRAINT users_lang_chk
           CHECK (lang IS NULL OR lang IN ('uz', 'ru', 'en'))`,
      );

      // --- 3) O'zini o'ziga ota qilgan kategoriyalar
      await q(`UPDATE category SET category_id = NULL WHERE category_id = id`);
      await q(`ALTER TABLE category DROP CONSTRAINT IF EXISTS category_not_self_parent`);
      await q(
        `ALTER TABLE category ADD CONSTRAINT category_not_self_parent
           CHECK (category_id IS NULL OR category_id <> id)`,
      );

      // --- 4) Telefon raqam YAGONA bo'lsin (xavfsizlik tekshiruvi).
      //
      // `users.phone_number` da hech qanday unikal cheklov yo'q edi, profil
      // tahrirlashda esa raqamni ALMASHTIRISH mumkin (SMS tasdig'isiz).
      // Ya'ni ikki hisob bir xil raqamga ega bo'lib qolishi mumkin va
      // `loginUser` ning `findOne` i qaysi qatorni topishi tasodifga
      // qolardi — bu hisobni egallab olish yo'li.
      //
      // Indeks QISMIY: faqat to'g'ri formatdagi raqamlar uchun. Shu bilan
      // sinov yozuvlari (`zz-...`) va eski nostandart qiymatlar
      // migratsiyani to'xtatmaydi.
      await q(
        `CREATE UNIQUE INDEX IF NOT EXISTS users_phone_number_unique
           ON users (phone_number)
         WHERE phone_number ~ '^[+]998[0-9]{9}$'`,
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
      await q(`DROP INDEX IF EXISTS users_phone_number_unique`);
      await q(`ALTER TABLE category DROP CONSTRAINT IF EXISTS category_not_self_parent`);
      await q(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_lang_chk`);
      await q(`ALTER TABLE users DROP COLUMN IF EXISTS lang`);
      await queryInterface.dropTable('user_refresh_tokens', { transaction: t });
      await t.commit();
    } catch (e) {
      await t.rollback();
      throw e;
    }
  },
};
