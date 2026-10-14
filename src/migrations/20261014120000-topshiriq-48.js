'use strict';

// Topshiriq №48 — yetkazish: mijoz tomoni va №47 dagi bo'shliqlar.
//
// A1. Mijoz yetkazish narxiga javob bermasa: deliveries.fee_reminded_at (bitta
//     takroriy push), fee_status ga `expired`; settings delivery_fee_remind_minutes (60),
//     delivery_fee_expire_minutes (240).
// A2. Mijoz «O'zim olib ketaman» deydi: orders.delivery_preference (delivery|pickup),
//     orders.pickup_info (JSONB — yetkazish yaratilganda delivery_pickup_info ga ko'chadi).
//
// Eski backend bilan mos: faqat yangi ustun (default bilan) va kengaytirilgan CHECK.
// Yangi modellarda ustunlar e'lon qilingan — migratsiya OLDIN.

const SETTINGS = [
  ['delivery_fee_remind_minutes', '60', "Mijoz yetkazish narxiga shuncha daqiqada javob bermasa — takroriy push (№48)"],
  ['delivery_fee_expire_minutes', '240', "Shuncha daqiqada javob bo'lmasa — taklif muddati o'tadi, yetkazish do'konga qaytadi (№48)"],
];

module.exports = {
  async up(queryInterface) {
    const t = await queryInterface.sequelize.transaction();
    const q = (sql, replacements) => queryInterface.sequelize.query(sql, { transaction: t, replacements });
    try {
      // ================================================================ A1
      await q(`ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS fee_reminded_at TIMESTAMPTZ`);
      await q(`ALTER TABLE deliveries DROP CONSTRAINT IF EXISTS deliveries_fee_status_chk`);
      await q(`ALTER TABLE deliveries ADD CONSTRAINT deliveries_fee_status_chk
                 CHECK (fee_status IS NULL OR fee_status IN ('proposed', 'accepted', 'rejected', 'expired', 'paid'))`);
      await q(`CREATE INDEX IF NOT EXISTS deliveries_fee_proposed ON deliveries (fee_proposed_at) WHERE fee_status = 'proposed'`);
      for (const [key, value, description] of SETTINGS) {
        await q(
          `INSERT INTO settings (key, value, description, "createdAt", "updatedAt")
           SELECT :key, :value, :description, now(), now()
            WHERE NOT EXISTS (SELECT 1 FROM settings WHERE key = :key)`,
          { key, value, description },
        );
      }

      // ================================================================ A2
      await q(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_preference VARCHAR(10) NOT NULL DEFAULT 'delivery'`);
      await q(`ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_delivery_preference_chk`);
      await q(`ALTER TABLE orders ADD CONSTRAINT orders_delivery_preference_chk CHECK (delivery_preference IN ('delivery', 'pickup'))`);
      await q(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS pickup_info JSONB`);

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
      await q(`ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_delivery_preference_chk`);
      await q(`ALTER TABLE orders DROP COLUMN IF EXISTS pickup_info, DROP COLUMN IF EXISTS delivery_preference`);
      await q(`DELETE FROM settings WHERE key IN ('delivery_fee_remind_minutes', 'delivery_fee_expire_minutes')`);
      await q(`DROP INDEX IF EXISTS deliveries_fee_proposed`);
      // Eski CHECK `expired` ni bilmaydi — rad etilgan deb belgilanadi
      await q(`UPDATE deliveries SET fee_status = 'rejected' WHERE fee_status = 'expired'`);
      await q(`ALTER TABLE deliveries DROP CONSTRAINT IF EXISTS deliveries_fee_status_chk`);
      await q(`ALTER TABLE deliveries ADD CONSTRAINT deliveries_fee_status_chk
                 CHECK (fee_status IS NULL OR fee_status IN ('proposed', 'accepted', 'rejected', 'paid'))`);
      await q(`ALTER TABLE deliveries DROP COLUMN IF EXISTS fee_reminded_at`);
      await t.commit();
    } catch (e) {
      await t.rollback();
      throw e;
    }
  },
};
