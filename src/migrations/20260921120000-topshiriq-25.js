'use strict';

// Topshiriq №25 — KP oqimi: so'rovdan qabul qilingan buyurtmagacha.
//
//   cart_item.price       — narxsiz mahsulot ham savatga tushadi (NULL)
//   order_quotes          — sotuvchi yuborgan KP versiyalari (nizo uchun o'zgarmas)
//   order_events          — buyurtmaning butun yo'li (yaratildi, holat, KP, yetkazish)
//   orders.quote_*        — qabul qilingan versiya va rad etish sababi
module.exports = {
  async up(queryInterface, Sequelize) {
    const t = await queryInterface.sequelize.transaction();
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction: t });
    const now = { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') };
    try {
      // ------------------------------------------------------------- savat
      // Narxsiz model ham savatga tushadi: KP so'rovi endi alohida oqim
      // emas, savatning bir yo'li (1-band).
      await q('ALTER TABLE cart_item ALTER COLUMN price DROP NOT NULL');

      // ------------------------------------------------------------- order_quotes
      await queryInterface.createTable(
        'order_quotes',
        {
          id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
          order_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'orders', key: 'id' }, onDelete: 'CASCADE' },
          store_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'stores', key: 'id' }, onDelete: 'RESTRICT' },
          // Har yuborish — yangi versiya; eskisi O'ZGARMAYDI (nizo dalili)
          version: { type: Sequelize.INTEGER, allowNull: false },
          // [{ order_item_id, name, model, quantity, price }]
          items: { type: Sequelize.JSONB, allowNull: false },
          valid_until: { type: Sequelize.DATEONLY, allowNull: false },
          delivery_terms: { type: Sequelize.STRING(500), allowNull: true },
          payment_terms: { type: Sequelize.STRING(500), allowNull: true },
          note: { type: Sequelize.TEXT, allowNull: true },
          sent_by: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'store_users', key: 'id' }, onDelete: 'SET NULL' },
          sent_at: now,
        },
        { transaction: t },
      );
      await q('CREATE UNIQUE INDEX order_quotes_order_store_version ON order_quotes (order_id, store_id, version)');
      await q('CREATE INDEX order_quotes_order ON order_quotes (order_id, id)');

      // ------------------------------------------------------------- order_events
      // №19 dagi savol: buyurtma holati tarixi. KP oqimi uchun kerak bo'ldi —
      // "kim KP yubordi, mijoz qachon qabul qildi" savoliga javob shu yerda.
      await queryInterface.createTable(
        'order_events',
        {
          id: { type: Sequelize.BIGINT, autoIncrement: true, primaryKey: true },
          order_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'orders', key: 'id' }, onDelete: 'CASCADE' },
          from_status: { type: Sequelize.STRING(20), allowNull: true },
          to_status: { type: Sequelize.STRING(20), allowNull: true },
          event: { type: Sequelize.STRING(30), allowNull: false },
          actor_type: { type: Sequelize.STRING(12), allowNull: false },
          actor_id: { type: Sequelize.INTEGER, allowNull: true },
          note: { type: Sequelize.STRING(1000), allowNull: true },
          created_at: now,
        },
        { transaction: t },
      );
      await q(
        `ALTER TABLE order_events ADD CONSTRAINT order_events_actor_chk
           CHECK (actor_type IN ('customer', 'store', 'superadmin', 'system'))`,
      );
      await q('CREATE INDEX order_events_order ON order_events (order_id, id)');

      // ------------------------------------------------------------- orders
      await queryInterface.addColumn('orders', 'quote_accepted_at', { type: Sequelize.DATE, allowNull: true }, { transaction: t });
      await queryInterface.addColumn('orders', 'quote_accepted_version', { type: Sequelize.INTEGER, allowNull: true }, { transaction: t });
      await queryInterface.addColumn('orders', 'quote_reject_reason', { type: Sequelize.STRING(500), allowNull: true }, { transaction: t });

      await t.commit();
    } catch (e) {
      await t.rollback();
      throw e;
    }
  },

  async down(queryInterface) {
    const t = await queryInterface.sequelize.transaction();
    try {
      for (const c of ['quote_reject_reason', 'quote_accepted_version', 'quote_accepted_at']) {
        await queryInterface.removeColumn('orders', c, { transaction: t });
      }
      await queryInterface.dropTable('order_events', { transaction: t });
      await queryInterface.dropTable('order_quotes', { transaction: t });
      // Narxsiz qatorlar bo'lsa NOT NULL ni tiklab bo'lmaydi — ular 0 ga
      // aylantiriladi (orqaga qaytish faqat favqulodda holat uchun).
      await queryInterface.sequelize.query('UPDATE cart_item SET price = 0 WHERE price IS NULL', { transaction: t });
      await queryInterface.sequelize.query('ALTER TABLE cart_item ALTER COLUMN price SET NOT NULL', { transaction: t });
      await t.commit();
    } catch (e) {
      await t.rollback();
      throw e;
    }
  },
};
