'use strict';

// Topshiriq №37 — narx valyutasi (USD | UZS).
//
//   stores.default_currency — yangi mahsulotning standart valyutasi;
//   products.currency       — HAQIQIY manba: shu mahsulotning barcha narxlari
//                             (modellar, SAP variantlari, aksiya) shu valyutada;
//   characteristics.currency, "product-model-inside".currency — mahsulotnikining
//                             NUSXASI. Uni FAQAT trigger'lar yozadi: qator qaysi
//                             yo'l bilan yaratilmasin (API, bot, xom SQL) valyuta
//                             mahsulotnikiga teng bo'ladi. Javobdagi har bir narx
//                             qatori shu tufayli o'z valyutasini biladi.
//
// Mavjud hamma narx USD bo'lib qoladi (DEFAULT) — hech narsa o'zgarmaydi.
// Valyuta almashtirilsa narxlar AYLANTIRILMAYDI (topshiriq: sotuvchi o'zi yozadi).
//
// Narx ustunlari NUMERIC(10,2) -> (14,2): so'mda 100 mln dan qimmat mahsulot bor
// (10,2 ning chegarasi 99 999 999.99). Aniqlik oshirilishi jadvalni qayta yozmaydi.
//
// Eski backend bilan mos: faqat yangi ustunlar (DEFAULT bilan) va trigger'lar —
// eski kod ularni bilmaydi va ishlashda davom etadi. Shuning uchun migratsiya
// backenddan OLDIN ishlatiladi.
const CUR = (col) => `${col} VARCHAR(3) NOT NULL DEFAULT 'USD'`;

module.exports = {
  async up(queryInterface) {
    const t = await queryInterface.sequelize.transaction();
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction: t });
    try {
      for (const [table, col] of [
        ['stores', 'default_currency'],
        ['products', 'currency'],
        ['characteristics', 'currency'],
        ['"product-model-inside"', 'currency'],
      ]) {
        const name = table.replace(/"/g, '').replace(/-/g, '_');
        await q(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${CUR(col)}`);
        await q(`ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS ${name}_${col}_chk`);
        await q(`ALTER TABLE ${table} ADD CONSTRAINT ${name}_${col}_chk CHECK (${col} IN ('USD', 'UZS'))`);
      }

      for (const table of ['characteristics', '"product-model-inside"']) {
        await q(`ALTER TABLE ${table} ALTER COLUMN price TYPE NUMERIC(14,2)`);
        await q(`ALTER TABLE ${table} ALTER COLUMN sale_price TYPE NUMERIC(14,2)`);
      }

      // ---- Nusxani yurituvchi trigger'lar
      // Model: yaratishda / mahsulotga ko'chirishda / valyutani qo'lda yozishga
      // urinishda — qiymat mahsulotdan olinadi.
      await q(`
        CREATE OR REPLACE FUNCTION characteristics_currency_sync() RETURNS trigger AS $$
        BEGIN
          NEW.currency := COALESCE((SELECT currency FROM products WHERE id = NEW.product_id), 'USD');
          RETURN NEW;
        END $$ LANGUAGE plpgsql`);
      await q(`DROP TRIGGER IF EXISTS characteristics_currency_sync ON characteristics`);
      await q(`CREATE TRIGGER characteristics_currency_sync
                 BEFORE INSERT OR UPDATE OF product_id, currency ON characteristics
                 FOR EACH ROW EXECUTE FUNCTION characteristics_currency_sync()`);

      // SAP varianti: modeldan.
      await q(`
        CREATE OR REPLACE FUNCTION pmi_currency_sync() RETURNS trigger AS $$
        BEGIN
          NEW.currency := COALESCE((SELECT currency FROM characteristics WHERE id = NEW.product_model_id), 'USD');
          RETURN NEW;
        END $$ LANGUAGE plpgsql`);
      await q(`DROP TRIGGER IF EXISTS pmi_currency_sync ON "product-model-inside"`);
      await q(`CREATE TRIGGER pmi_currency_sync
                 BEFORE INSERT OR UPDATE OF product_model_id, currency ON "product-model-inside"
                 FOR EACH ROW EXECUTE FUNCTION pmi_currency_sync()`);

      // Pastga tarqatish: mahsulot -> modellar -> variantlar.
      await q(`
        CREATE OR REPLACE FUNCTION products_currency_cascade() RETURNS trigger AS $$
        BEGIN
          UPDATE characteristics SET currency = NEW.currency
           WHERE product_id = NEW.id AND currency IS DISTINCT FROM NEW.currency;
          RETURN NULL;
        END $$ LANGUAGE plpgsql`);
      await q(`DROP TRIGGER IF EXISTS products_currency_cascade ON products`);
      await q(`CREATE TRIGGER products_currency_cascade
                 AFTER UPDATE OF currency ON products
                 FOR EACH ROW WHEN (OLD.currency IS DISTINCT FROM NEW.currency)
                 EXECUTE FUNCTION products_currency_cascade()`);

      await q(`
        CREATE OR REPLACE FUNCTION characteristics_currency_cascade() RETURNS trigger AS $$
        BEGIN
          UPDATE "product-model-inside" SET currency = NEW.currency
           WHERE product_model_id = NEW.id AND currency IS DISTINCT FROM NEW.currency;
          RETURN NULL;
        END $$ LANGUAGE plpgsql`);
      await q(`DROP TRIGGER IF EXISTS characteristics_currency_cascade ON characteristics`);
      await q(`CREATE TRIGGER characteristics_currency_cascade
                 AFTER INSERT OR UPDATE OF currency, product_id ON characteristics
                 FOR EACH ROW EXECUTE FUNCTION characteristics_currency_cascade()`);

      // Mavjud qatorlar allaqachon USD (DEFAULT); baribir tekislab qo'yamiz.
      await q(`UPDATE characteristics c SET currency = p.currency FROM products p
                WHERE p.id = c.product_id AND c.currency IS DISTINCT FROM p.currency`);
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
      // UZS narxli mahsulot bo'lsa `down` ularni USD deb qoldiradi — qiymatlar
      // so'mda bo'lgani uchun AVVAL ularni tekshirish kerak.
      const [[{ n }]] = await queryInterface.sequelize.query(
        `SELECT count(*)::int AS n FROM products WHERE currency = 'UZS'`,
        { transaction: t },
      );
      if (n > 0) throw new Error(`${n} ta mahsulot UZS da — down narxlarni buzadi, avval ularni ko'rib chiqing`);
      await q(`DROP TRIGGER IF EXISTS characteristics_currency_cascade ON characteristics`);
      await q(`DROP TRIGGER IF EXISTS products_currency_cascade ON products`);
      await q(`DROP TRIGGER IF EXISTS pmi_currency_sync ON "product-model-inside"`);
      await q(`DROP TRIGGER IF EXISTS characteristics_currency_sync ON characteristics`);
      await q(`DROP FUNCTION IF EXISTS characteristics_currency_cascade()`);
      await q(`DROP FUNCTION IF EXISTS products_currency_cascade()`);
      await q(`DROP FUNCTION IF EXISTS pmi_currency_sync()`);
      await q(`DROP FUNCTION IF EXISTS characteristics_currency_sync()`);
      await q(`ALTER TABLE "product-model-inside" DROP COLUMN IF EXISTS currency`);
      await q(`ALTER TABLE characteristics DROP COLUMN IF EXISTS currency`);
      await q(`ALTER TABLE products DROP COLUMN IF EXISTS currency`);
      await q(`ALTER TABLE stores DROP COLUMN IF EXISTS default_currency`);
      // NUMERIC(14,2) qoldiriladi: 10,2 ga qaytarish katta so'm narxlarini kesadi.
      await t.commit();
    } catch (e) {
      await t.rollback();
      throw e;
    }
  },
};
