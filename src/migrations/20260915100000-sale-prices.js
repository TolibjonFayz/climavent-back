'use strict';

// Topshiriq №15 — aksiya narxi.
//
// Narx bazada IKKI joyda (dollarda): `product-model-inside.price` (SAP varianti)
// va `characteristics.price` (varianti yo'q model). Aksiya ham aynan shu ikki
// jadvalga qo'shiladi — "qaysi variant aksiyada" degan savolga javob bo'lishi uchun.
//
//   sale_price      NUMERIC(10,2) NULL — aksiya narxi (USD). NULL — aksiya yo'q
//   sale_starts_at  TIMESTAMPTZ   NULL — qachondan. NULL — darhol
//   sale_ends_at    TIMESTAMPTZ   NULL — qachongacha. NULL — olib tashlanguncha
//
// Asosiy narx TEGILMAYDI: aksiya tugashi bilan u o'z-o'zidan amal qila boshlaydi.
// Aksiya faolligi so'rov paytida SERVERDA hisoblanadi (`common/pricing/sale.ts`).
//
// `order-items.regular_price` — qator yozilgan paytdagi ASOSIY narx (so'm).
// "Aksiyada qancha chegirma berildi" hisobotini keyin tiklab bo'lmaydi —
// asosiy narx o'zgarib ketadi. Eski qatorlarda NULL.
const TABLES = ['product-model-inside', 'characteristics'];

module.exports = {
  async up(queryInterface, Sequelize) {
    const q = queryInterface.sequelize;
    await q.transaction(async (transaction) => {
      const o = { transaction };
      for (const table of TABLES) {
        await queryInterface.addColumn(table, 'sale_price', { type: Sequelize.DECIMAL(10, 2), allowNull: true }, o);
        await queryInterface.addColumn(table, 'sale_starts_at', { type: Sequelize.DATE, allowNull: true }, o);
        await queryInterface.addColumn(table, 'sale_ends_at', { type: Sequelize.DATE, allowNull: true }, o);
        const t = `"${table}"`;
        const prefix = table.replace(/-/g, '_');
        // Server tekshiruvi asosiy himoya; bu — bazaga to'g'ridan-to'g'ri yozilganda ham
        await q.query(
          `ALTER TABLE ${t} ADD CONSTRAINT ${prefix}_sale_price_positive CHECK (sale_price IS NULL OR sale_price > 0)`,
          o,
        );
        await q.query(
          `ALTER TABLE ${t} ADD CONSTRAINT ${prefix}_sale_dates_order
             CHECK (sale_starts_at IS NULL OR sale_ends_at IS NULL OR sale_ends_at > sale_starts_at)`,
          o,
        );
      }
      // `on_sale=true` filtri faqat aksiyasi borlarni ko'radi
      await q.query(
        `CREATE INDEX product_model_inside_on_sale_idx ON "product-model-inside" (product_model_id) WHERE sale_price IS NOT NULL`,
        o,
      );
      await q.query(
        `CREATE INDEX characteristics_on_sale_idx ON characteristics (product_id) WHERE sale_price IS NOT NULL`,
        o,
      );
      await queryInterface.addColumn('order-items', 'regular_price', { type: Sequelize.BIGINT, allowNull: true }, o);
    });
  },

  async down(queryInterface) {
    const q = queryInterface.sequelize;
    await q.transaction(async (transaction) => {
      const o = { transaction };
      await queryInterface.removeColumn('order-items', 'regular_price', o);
      await q.query(`DROP INDEX IF EXISTS characteristics_on_sale_idx`, o);
      await q.query(`DROP INDEX IF EXISTS product_model_inside_on_sale_idx`, o);
      for (const table of TABLES) {
        const prefix = table.replace(/-/g, '_');
        await q.query(`ALTER TABLE "${table}" DROP CONSTRAINT IF EXISTS ${prefix}_sale_dates_order`, o);
        await q.query(`ALTER TABLE "${table}" DROP CONSTRAINT IF EXISTS ${prefix}_sale_price_positive`, o);
        await queryInterface.removeColumn(table, 'sale_ends_at', o);
        await queryInterface.removeColumn(table, 'sale_starts_at', o);
        await queryInterface.removeColumn(table, 'sale_price', o);
      }
    });
  },
};
