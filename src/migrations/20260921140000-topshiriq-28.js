'use strict';

// Topshiriq №28 — KP saytda darhol chiqadi.
//
// `orders.source` — KP qayerdan kelgani:
//   `site_kp` — mijoz savatdan o'zi chiqargan (sotuvchi kutilmaydi),
//   `manual`  — adminka yoki bot yaratgan,
//   NULL      — eski yozuvlar.
//
// Bu savdo varonkasi uchun kerak: saytda chiqarilgan har bir KP adminkada
// ko'rinishi va «nechtasi buyurtmaga aylandi» deb sanalishi kerak.
module.exports = {
  async up(queryInterface, Sequelize) {
    const t = await queryInterface.sequelize.transaction();
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction: t });
    try {
      await queryInterface.addColumn(
        'orders',
        'source',
        { type: Sequelize.STRING(20), allowNull: true },
        { transaction: t },
      );
      await q(
        `ALTER TABLE orders ADD CONSTRAINT orders_source_chk
           CHECK (source IS NULL OR source IN ('site_kp', 'manual'))`,
      );
      await q(`CREATE INDEX orders_kind_source ON orders (kind, source)`);

      // Saytda darhol chiqqan KP da narxsiz qator `price: null` bo'ladi —
      // `order_quotes.items` JSONB, sxema o'zgarishi shart emas.
      await t.commit();
    } catch (e) {
      await t.rollback();
      throw e;
    }
  },

  async down(queryInterface) {
    const t = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.sequelize.query('DROP INDEX IF EXISTS orders_kind_source', { transaction: t });
      await queryInterface.sequelize.query('ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_source_chk', { transaction: t });
      await queryInterface.removeColumn('orders', 'source', { transaction: t });
      await t.commit();
    } catch (e) {
      await t.rollback();
      throw e;
    }
  },
};
