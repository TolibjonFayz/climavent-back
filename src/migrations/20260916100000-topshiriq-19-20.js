'use strict';

// Topshiriqlar №19 va №20 — baza tomoni.
//
//   1. `users.token_version`     — sayt admini/mijoz tokenini bekor qilish (№19, 2-band)
//   2. `banner.is_active/link/sort_order` (№19, 5-band)
//   3. `setting_events`          — kurs kim/qachon/qayerdan o'zgargani (№19, 3-band)
//   4. `otp.otp_hash`            — SMS kodi ochiq saqlanmasin (№19, 8-band)
//   5. `seller_application_documents.storage` — fayl qayerda (baza yoki R2) (№20, 1-band)
//   6. `seller_applications.deleted_at` — arizani arxivga olish (№19, 7-band)
module.exports = {
  async up(queryInterface, Sequelize) {
    const t = await queryInterface.sequelize.transaction();
    try {
      // 1 — mijoz va sayt admini tokeni uchun versiya hisoblagichi
      await queryInterface.addColumn(
        'users',
        'token_version',
        { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        { transaction: t },
      );

      // 2 — banner maydonlari
      await queryInterface.addColumn(
        'banner',
        'is_active',
        { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        { transaction: t },
      );
      await queryInterface.addColumn(
        'banner',
        'link',
        { type: Sequelize.STRING(500), allowNull: true },
        { transaction: t },
      );
      await queryInterface.addColumn(
        'banner',
        'sort_order',
        { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        { transaction: t },
      );
      // Mavjud tartib `orderid` da — yangi ustunga ko'chiramiz, sayt tartibi
      // o'zgarmasin.
      await queryInterface.sequelize.query(
        'UPDATE banner SET sort_order = COALESCE(orderid, 0)',
        { transaction: t },
      );

      // 3 — sozlama o'zgarishlari tarixi (faqat qo'shiladi)
      await queryInterface.createTable(
        'setting_events',
        {
          id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
          key: { type: Sequelize.STRING(100), allowNull: false },
          old_value: { type: Sequelize.STRING(100), allowNull: true },
          new_value: { type: Sequelize.STRING(100), allowNull: false },
          // 'auto' — cron (Markaziy bank), 'manual' — adminka/bot
          source: { type: Sequelize.STRING(20), allowNull: false },
          actor: { type: Sequelize.STRING(200), allowNull: true },
          ip: { type: Sequelize.STRING(64), allowNull: true },
          note: { type: Sequelize.STRING(300), allowNull: true },
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
          },
        },
        { transaction: t },
      );
      await queryInterface.addIndex('setting_events', ['key', 'created_at'], {
        name: 'setting_events_key_created_at',
        transaction: t,
      });

      // 4 — OTP xeshi. Eski ustun NULL bo'la oladigan qilinadi: yangi kodlar
      // faqat xesh sifatida yoziladi, deploy paytida yo'lda qolgan eski
      // kodlar esa hamon tekshiriladi.
      await queryInterface.addColumn(
        'otp',
        'otp_hash',
        { type: Sequelize.STRING(64), allowNull: true },
        { transaction: t },
      );
      await queryInterface.changeColumn(
        'otp',
        'otp',
        { type: Sequelize.STRING, allowNull: true },
        { transaction: t },
      );

      // 5 — hujjat qayerda saqlanadi
      await queryInterface.addColumn(
        'seller_application_documents',
        'storage',
        { type: Sequelize.STRING(10), allowNull: false, defaultValue: 'db' },
        { transaction: t },
      );

      // 6 — arizani arxivga olish. Qatorning O'ZI o'chirilmaydi: unga
      // bog'langan dalil yozuvlari (`seller_application_events`,
      // `offer_acceptances`) baza trigger'i bilan himoyalangan va ularning
      // `application_id` si o'zgarmas. Ariza ro'yxatdan yo'qoladi, fayllari
      // esa DARHOL o'chiriladi.
      await queryInterface.addColumn(
        'seller_applications',
        'deleted_at',
        { type: Sequelize.DATE, allowNull: true },
        { transaction: t },
      );

      await t.commit();
    } catch (e) {
      await t.rollback();
      throw e;
    }
  },

  async down(queryInterface) {
    const t = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.removeColumn('seller_applications', 'deleted_at', { transaction: t });
      await queryInterface.removeColumn('seller_application_documents', 'storage', { transaction: t });
      await queryInterface.removeColumn('otp', 'otp_hash', { transaction: t });
      await queryInterface.dropTable('setting_events', { transaction: t });
      await queryInterface.removeColumn('banner', 'sort_order', { transaction: t });
      await queryInterface.removeColumn('banner', 'link', { transaction: t });
      await queryInterface.removeColumn('banner', 'is_active', { transaction: t });
      await queryInterface.removeColumn('users', 'token_version', { transaction: t });
      await t.commit();
    } catch (e) {
      await t.rollback();
      throw e;
    }
  },
};
