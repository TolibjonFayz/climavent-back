'use strict';

// Topshiriq №38 — "yig'ilyapti / yig'ildi" holatlari va ilova ichida kuzatish.
//
//   order_store_progress — yig'ish holati BUYURTMA x DO'KON darajasida
//                          (bitta buyurtmada bir nechta do'kon bo'lishi mumkin);
//   order_events.store_id — qaysi do'kon qismi haqida (null — butun buyurtma);
//   order_events.actor_type — `courier` qo'shildi (avval kuryer `system` deb yozilardi).
//
// Yozuv buyurtmaga do'konning birinchi TOVAR qatori tushganda trigger bilan
// yaratiladi (`waiting`) — qator qaysi yo'l bilan qo'shilmasin (sayt, bot,
// KP davomiga ko'chirish). Eski buyurtmalarda yozuv yo'q: kod ularni `waiting`
// deb hisoblaydi, backfill shart emas.
//
// Eski backend bilan mos: faqat yangi jadval, yangi ustun va kengaytirilgan
// CHECK. Shuning uchun migratsiya backenddan OLDIN ishlatiladi.
module.exports = {
  async up(queryInterface) {
    const t = await queryInterface.sequelize.transaction();
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction: t });
    try {
      await q(`
        CREATE TABLE IF NOT EXISTS order_store_progress (
          id          SERIAL PRIMARY KEY,
          order_id    INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
          store_id    INTEGER NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
          stage       VARCHAR(10) NOT NULL DEFAULT 'waiting',
          packing_at  TIMESTAMPTZ,
          ready_at    TIMESTAMPTZ,
          updated_by  INTEGER REFERENCES store_users(id) ON DELETE SET NULL,
          created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
          CONSTRAINT order_store_progress_uq UNIQUE (order_id, store_id),
          CONSTRAINT order_store_progress_stage_chk CHECK (stage IN ('waiting', 'packing', 'ready'))
        )`);
      await q(`CREATE INDEX IF NOT EXISTS order_store_progress_store_idx ON order_store_progress (store_id, stage)`);

      await q(`
        CREATE OR REPLACE FUNCTION order_store_progress_seed() RETURNS trigger AS $$
        BEGIN
          IF NEW.product_id IS NOT NULL THEN
            INSERT INTO order_store_progress (order_id, store_id)
            SELECT NEW.order_id, p.store_id FROM products p
             WHERE p.id = NEW.product_id AND p.store_id IS NOT NULL
            ON CONFLICT (order_id, store_id) DO NOTHING;
          END IF;
          RETURN NEW;
        END $$ LANGUAGE plpgsql`);
      await q(`DROP TRIGGER IF EXISTS order_store_progress_seed ON "order-items"`);
      await q(`CREATE TRIGGER order_store_progress_seed
                 AFTER INSERT OR UPDATE OF order_id, product_id ON "order-items"
                 FOR EACH ROW EXECUTE FUNCTION order_store_progress_seed()`);

      await q(`ALTER TABLE order_events ADD COLUMN IF NOT EXISTS store_id INTEGER`);
      await q(`ALTER TABLE order_events DROP CONSTRAINT IF EXISTS order_events_actor_chk`);
      await q(`ALTER TABLE order_events ADD CONSTRAINT order_events_actor_chk
                 CHECK (actor_type IN ('customer', 'store', 'superadmin', 'courier', 'system'))`);
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
      await q(`DROP TRIGGER IF EXISTS order_store_progress_seed ON "order-items"`);
      await q(`DROP FUNCTION IF EXISTS order_store_progress_seed()`);
      await q(`DROP TABLE IF EXISTS order_store_progress`);
      await q(`UPDATE order_events SET actor_type = 'system' WHERE actor_type = 'courier'`);
      await q(`ALTER TABLE order_events DROP CONSTRAINT IF EXISTS order_events_actor_chk`);
      await q(`ALTER TABLE order_events ADD CONSTRAINT order_events_actor_chk
                 CHECK (actor_type IN ('customer', 'store', 'superadmin', 'system'))`);
      await q(`ALTER TABLE order_events DROP COLUMN IF EXISTS store_id`);
      await t.commit();
    } catch (e) {
      await t.rollback();
      throw e;
    }
  },
};
