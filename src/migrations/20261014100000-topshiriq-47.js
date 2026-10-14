'use strict';

// Topshiriq №47 — yetkazish: mashinani avtomatik tanlash, alohida to'lov,
// mijozning o'z mashinasi.
//
// 1. Tovar o'lchami: characteristics / "product-model-inside" . packages,
//    needs_crane, stackable (weight_kg va L/W/H №26 dan bor). Hammasi NULL —
//    variantda bo'sh bo'lsa modelniki, u ham bo'sh bo'lsa standart
//    (packages 1, needs_crane false, stackable true).
// 2. Mashina sinfi: courier_vehicles.vehicle_class, deliveries.vehicle_class
//    (+ needs_crane). NULL — eski yozuv, sinf `vehicle_type` dan olinadi.
// 5. Tariflar sinf bo'yicha: courier_rates.vehicle_class, kalit endi
//    (do'kon, sinf). Mavjud qatorlar eng yaqin sinfga ko'chadi: car -> car,
//    van -> damas, truck -> truck_3t. Qolgan sinflar tarifini superadmin kiritadi.
// 6.1 Yangi do'kon: delivery_modes standarti {self,platform,pickup}.
// 7. Mijoz o'z mashinasini yuboradi: delivery_pickup_info (bitta yetkazishga
//    bitta yozuv) + deliveries.vehicle_plate_actual. delivery_events.actor_type
//    ga `customer` qo'shiladi.
// 8. Yetkazish to'lovi: deliveries.fee_payer (store|customer), fee_status,
//    fee_cash / fee_cash_collected (cod dan ALOHIDA), fee_invoice_required.
//
// Eski backend bilan mos: faqat yangi ustun/jadval (default bilan) va
// kengaytirilgan CHECK. Yangi modellarda ustunlar e'lon qilingan — migratsiya OLDIN.

const CLASSES = ['car', 'damas', 'gazel', 'truck_3t', 'truck_10t', 'truck_20t', 'crane'];
const list = (xs) => xs.map((x) => `'${x}'`).join(', ');
const CATALOG = ['characteristics', '"product-model-inside"'];

module.exports = {
  async up(queryInterface) {
    const t = await queryInterface.sequelize.transaction();
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction: t });
    try {
      // ================================================================ 1. o'lcham
      for (const table of CATALOG) {
        await q(`ALTER TABLE ${table}
                   ADD COLUMN IF NOT EXISTS packages SMALLINT,
                   ADD COLUMN IF NOT EXISTS needs_crane BOOLEAN,
                   ADD COLUMN IF NOT EXISTS stackable BOOLEAN`);
        const name = table.replace(/"/g, '').replace(/-/g, '_');
        await q(`ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS ${name}_packages_chk`);
        await q(`ALTER TABLE ${table} ADD CONSTRAINT ${name}_packages_chk CHECK (packages IS NULL OR packages BETWEEN 1 AND 50)`);
      }

      // ================================================================ 2. sinflar
      await q(`ALTER TABLE courier_vehicles ADD COLUMN IF NOT EXISTS vehicle_class VARCHAR(10)`);
      await q(`ALTER TABLE courier_vehicles DROP CONSTRAINT IF EXISTS courier_vehicles_class_chk`);
      await q(`ALTER TABLE courier_vehicles ADD CONSTRAINT courier_vehicles_class_chk CHECK (vehicle_class IS NULL OR vehicle_class IN (${list(CLASSES)}))`);

      await q(`ALTER TABLE deliveries
                 ADD COLUMN IF NOT EXISTS vehicle_class VARCHAR(10),
                 ADD COLUMN IF NOT EXISTS needs_crane BOOLEAN NOT NULL DEFAULT false,
                 ADD COLUMN IF NOT EXISTS vehicle_plate_actual VARCHAR(20),
                 ADD COLUMN IF NOT EXISTS fee_payer VARCHAR(10) NOT NULL DEFAULT 'store',
                 ADD COLUMN IF NOT EXISTS fee_status VARCHAR(10),
                 ADD COLUMN IF NOT EXISTS fee_proposed_at TIMESTAMPTZ,
                 ADD COLUMN IF NOT EXISTS fee_responded_at TIMESTAMPTZ,
                 ADD COLUMN IF NOT EXISTS fee_cash BIGINT,
                 ADD COLUMN IF NOT EXISTS fee_cash_collected BIGINT,
                 ADD COLUMN IF NOT EXISTS fee_invoice_required BOOLEAN NOT NULL DEFAULT false`);
      await q(`ALTER TABLE deliveries DROP CONSTRAINT IF EXISTS deliveries_class_chk`);
      await q(`ALTER TABLE deliveries ADD CONSTRAINT deliveries_class_chk CHECK (vehicle_class IS NULL OR vehicle_class IN (${list(CLASSES)}))`);
      await q(`ALTER TABLE deliveries DROP CONSTRAINT IF EXISTS deliveries_fee_payer_chk`);
      await q(`ALTER TABLE deliveries ADD CONSTRAINT deliveries_fee_payer_chk CHECK (fee_payer IN ('store', 'customer'))`);
      await q(`ALTER TABLE deliveries DROP CONSTRAINT IF EXISTS deliveries_fee_status_chk`);
      await q(`ALTER TABLE deliveries ADD CONSTRAINT deliveries_fee_status_chk
                 CHECK (fee_status IS NULL OR fee_status IN ('proposed', 'accepted', 'rejected', 'paid'))`);
      await q(`ALTER TABLE deliveries DROP CONSTRAINT IF EXISTS deliveries_fee_cash_chk`);
      await q(`ALTER TABLE deliveries ADD CONSTRAINT deliveries_fee_cash_chk
                 CHECK ((fee_cash IS NULL OR fee_cash >= 0) AND (fee_cash_collected IS NULL OR fee_cash_collected >= 0))`);

      // ================================================================ 5. tariflar
      await q(`ALTER TABLE courier_rates ADD COLUMN IF NOT EXISTS vehicle_class VARCHAR(10)`);
      await q(`ALTER TABLE courier_rates DROP CONSTRAINT IF EXISTS courier_rates_class_chk`);
      await q(`ALTER TABLE courier_rates ADD CONSTRAINT courier_rates_class_chk CHECK (vehicle_class IS NULL OR vehicle_class IN (${list(CLASSES)}))`);
      await q(`UPDATE courier_rates SET vehicle_class = CASE vehicle_type
                 WHEN 'car' THEN 'car' WHEN 'van' THEN 'damas' WHEN 'truck' THEN 'truck_3t' END
               WHERE vehicle_class IS NULL`);
      await q(`DROP INDEX IF EXISTS courier_rates_store_type`);
      await q(`CREATE UNIQUE INDEX IF NOT EXISTS courier_rates_store_class ON courier_rates (COALESCE(store_id, 0), COALESCE(vehicle_class, vehicle_type))`);

      // ================================================================ 6.1 do'kon standarti
      await q(`ALTER TABLE stores ALTER COLUMN delivery_modes SET DEFAULT '{self,platform,pickup}'`);

      // ================================================================ 7. mijoz mashinasi
      await q(`
        CREATE TABLE IF NOT EXISTS delivery_pickup_info (
          delivery_id      INTEGER PRIMARY KEY REFERENCES deliveries(id) ON DELETE CASCADE,
          user_id          INTEGER NOT NULL,
          driver_name      VARCHAR(120) NOT NULL,
          driver_phone     VARCHAR(13) NOT NULL,
          vehicle_plate    VARCHAR(20) NOT NULL,
          vehicle_class    VARCHAR(10) CHECK (vehicle_class IS NULL OR vehicle_class IN (${list(CLASSES)})),
          arrive_from      TIMESTAMPTZ NOT NULL,
          arrive_to        TIMESTAMPTZ NOT NULL,
          poa_number       VARCHAR(60),
          poa_document_id  INTEGER,
          created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
          CONSTRAINT delivery_pickup_info_window_chk CHECK (arrive_to > arrive_from)
        )`);
      await q(`ALTER TABLE delivery_events DROP CONSTRAINT IF EXISTS delivery_events_actor_chk`);
      await q(`ALTER TABLE delivery_events ADD CONSTRAINT delivery_events_actor_chk
                 CHECK (actor_type IN ('superadmin', 'store', 'courier', 'system', 'customer'))`);

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
      await q(`DELETE FROM delivery_events WHERE actor_type = 'customer'`);
      await q(`ALTER TABLE delivery_events DROP CONSTRAINT IF EXISTS delivery_events_actor_chk`);
      await q(`ALTER TABLE delivery_events ADD CONSTRAINT delivery_events_actor_chk
                 CHECK (actor_type IN ('superadmin', 'store', 'courier', 'system'))`);
      await q(`DROP TABLE IF EXISTS delivery_pickup_info`);
      await q(`ALTER TABLE stores ALTER COLUMN delivery_modes SET DEFAULT '{self}'`);
      await q(`DROP INDEX IF EXISTS courier_rates_store_class`);
      // Sinfga bo'lingan tariflardan har turga bittasi qoladi (eng kichik sinf)
      await q(`DELETE FROM courier_rates r USING courier_rates k
                WHERE COALESCE(r.store_id, 0) = COALESCE(k.store_id, 0) AND r.vehicle_type = k.vehicle_type AND r.id > k.id`);
      await q(`CREATE UNIQUE INDEX IF NOT EXISTS courier_rates_store_type ON courier_rates (COALESCE(store_id, 0), vehicle_type)`);
      await q(`ALTER TABLE courier_rates DROP CONSTRAINT IF EXISTS courier_rates_class_chk`);
      await q(`ALTER TABLE courier_rates DROP COLUMN IF EXISTS vehicle_class`);
      for (const c of ['deliveries_class_chk', 'deliveries_fee_payer_chk', 'deliveries_fee_status_chk', 'deliveries_fee_cash_chk']) {
        await q(`ALTER TABLE deliveries DROP CONSTRAINT IF EXISTS ${c}`);
      }
      await q(`ALTER TABLE deliveries
                 DROP COLUMN IF EXISTS vehicle_class,
                 DROP COLUMN IF EXISTS needs_crane,
                 DROP COLUMN IF EXISTS vehicle_plate_actual,
                 DROP COLUMN IF EXISTS fee_payer,
                 DROP COLUMN IF EXISTS fee_status,
                 DROP COLUMN IF EXISTS fee_proposed_at,
                 DROP COLUMN IF EXISTS fee_responded_at,
                 DROP COLUMN IF EXISTS fee_cash,
                 DROP COLUMN IF EXISTS fee_cash_collected,
                 DROP COLUMN IF EXISTS fee_invoice_required`);
      await q(`ALTER TABLE courier_vehicles DROP CONSTRAINT IF EXISTS courier_vehicles_class_chk`);
      await q(`ALTER TABLE courier_vehicles DROP COLUMN IF EXISTS vehicle_class`);
      for (const table of CATALOG) {
        const name = table.replace(/"/g, '').replace(/-/g, '_');
        await q(`ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS ${name}_packages_chk`);
        await q(`ALTER TABLE ${table} DROP COLUMN IF EXISTS packages, DROP COLUMN IF EXISTS needs_crane, DROP COLUMN IF EXISTS stackable`);
      }
      await t.commit();
    } catch (e) {
      await t.rollback();
      throw e;
    }
  },
};
