'use strict';

// Topshiriq №33 — KP: har do'kon BO'LIMI alohida tayyor bo'ladi.
//
// `order_quote_sections` — buyurtma × do'kon. Bo'lim holati ("tayyor" /
// "narx kutilmoqda" / "muddat o'tdi") shu yerdagi vaqtlar va qatorlar
// narxidan hisoblanadi (`orders/quote-sections.ts`). Jadval faqat
// "qachon so'raldi, eslatma ketdimi, muddat o'tdimi, qachon tayyor bo'ldi,
// qabul qilindimi" degan faktlarni saqlaydi — push ikki marta ketmasin.
//
// `orders.parent_order_id` — xaridor tayyor qismni qabul qilganda narxi hali
// kelmagan bo'limlar yangi (davomi) KP buyurtmasiga ko'chadi (4-band).
//
// `stores.default_delivery_terms/_payment_terms` — yagona Climavent
// hujjatidagi shartlar (5-band).
//
// Mavjud ochiq KP lar uchun bo'limlar JIMGINA to'ldiriladi: 4 soatdan eski
// bo'lsa eslatma "yuborilgan", 24 soatdan eski bo'lsa muddati "o'tgan" deb
// belgilanadi — aks holda deploydan keyin eski buyurtmalar bo'yicha
// birdaniga push yog'ilardi.
module.exports = {
  async up(queryInterface) {
    const t = await queryInterface.sequelize.transaction();
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction: t });
    try {
      await q(`
        CREATE TABLE IF NOT EXISTS order_quote_sections (
          id               SERIAL PRIMARY KEY,
          order_id         INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
          store_id         INTEGER NOT NULL REFERENCES stores(id),
          requested_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
          reminded_at      TIMESTAMPTZ,
          timed_out_at     TIMESTAMPTZ,
          ready_at         TIMESTAMPTZ,
          accepted_at      TIMESTAMPTZ,
          accepted_version INTEGER,
          CONSTRAINT order_quote_sections_uq UNIQUE (order_id, store_id)
        )`);
      await q(`CREATE INDEX IF NOT EXISTS order_quote_sections_open_idx
                 ON order_quote_sections (requested_at) WHERE accepted_at IS NULL`);

      await q(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS parent_order_id INTEGER
                 REFERENCES orders(id) ON DELETE SET NULL`);
      await q(`CREATE INDEX IF NOT EXISTS orders_parent_order_id_idx ON orders (parent_order_id)
                 WHERE parent_order_id IS NOT NULL`);

      await q(`ALTER TABLE stores ADD COLUMN IF NOT EXISTS default_delivery_terms TEXT`);
      await q(`ALTER TABLE stores ADD COLUMN IF NOT EXISTS default_payment_terms TEXT`);

      // Ochiq KP larning bo'limlari (jim to'ldirish)
      await q(`
        INSERT INTO order_quote_sections (order_id, store_id, requested_at, reminded_at, timed_out_at, ready_at)
        SELECT x.order_id, x.store_id, x.requested_at,
               CASE WHEN NOT x.ready AND x.requested_at < now() - interval '4 hours' THEN now() END,
               CASE WHEN NOT x.ready AND x.requested_at < now() - interval '24 hours'
                    THEN x.requested_at + interval '24 hours' END,
               CASE WHEN x.ready THEN x.last_sent END
          FROM (
            SELECT o.id AS order_id, p.store_id, o."createdAt" AS requested_at,
                   (bool_and(i.price IS NOT NULL)
                     AND EXISTS (
                       SELECT 1 FROM order_quotes lq
                        WHERE lq.order_id = o.id AND lq.store_id = p.store_id
                          AND lq.version = (SELECT MAX(version) FROM order_quotes
                                             WHERE order_id = o.id AND store_id = p.store_id)
                          AND NOT jsonb_path_exists(lq.items, '$[*] ? (@.price == null)')
                     )) AS ready,
                   (SELECT MAX(sent_at) FROM order_quotes WHERE order_id = o.id AND store_id = p.store_id) AS last_sent
              FROM orders o
              JOIN "order-items" i ON i.order_id = o.id
              JOIN products p ON p.id = i.product_id
             WHERE o.kind = 'quote' AND o.status IN ('new', 'quote_sent') AND p.store_id IS NOT NULL
             GROUP BY o.id, p.store_id, o."createdAt"
          ) x
        ON CONFLICT (order_id, store_id) DO NOTHING`);
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
      await q(`DROP TABLE IF EXISTS order_quote_sections`);
      await q(`ALTER TABLE orders DROP COLUMN IF EXISTS parent_order_id`);
      await q(`ALTER TABLE stores DROP COLUMN IF EXISTS default_delivery_terms`);
      await q(`ALTER TABLE stores DROP COLUMN IF EXISTS default_payment_terms`);
      await t.commit();
    } catch (e) {
      await t.rollback();
      throw e;
    }
  },
};
