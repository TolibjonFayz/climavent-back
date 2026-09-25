'use strict';

// Topshiriq №39 — xizmatlar (o'rnatish, tozalash, ta'mir) va ustalar.
//
//   stores: sells_products / sells_services (hamkor turi),
//           service_rating / service_reviews_count / jobs_done (hisoblagichlar);
//           (QQS belgisi `store_requisites.vat_payer` da №16 dan bor — takrorlanmaydi);
//   store_service_areas — xizmat hududi (viloyat, ixtiyoriy tuman);
//   couriers.skills — usta = kuryer jadvalidagi ko'nikmalar; vehicle_type ixtiyoriy;
//   service_categories (+ 6 ta tur), services, service_variants, service_product_links;
//   orders.region_code / district_code — xizmat hududini tekshirish uchun;
//   "order-items": item_type, service_id, service_variant_id, for_order_item_id,
//                  store_id (HAMMA qator uchun, trigger to'ldiradi), price_type,
//                  visit_fee_uzs; product_id endi NULL bo'lishi mumkin (xizmat qatori);
//   service_jobs (+ service_job_events) — yetkazishning egizagi;
//   service_reviews — ishga bitta baho;
//   courier_locations.job_id — ishga yo'lda yo'l tarixi.
//
// Eski backend bilan mos: faqat yangi jadval/ustunlar (DEFAULT bilan) va
// trigger. `product_id` NOT NULL olib tashlanadi — eski kod har doim uni
// yozadi. Shuning uchun migratsiya backenddan OLDIN ishlatiladi.
const CATEGORIES = [
  ['installation', "O'rnatish", 'Установка', 'Installation', 'build', 1],
  ['dismantling', 'Demontaj', 'Демонтаж', 'Dismantling', 'handyman', 2],
  ['cleaning', 'Tozalash', 'Чистка', 'Cleaning', 'cleaning_services', 3],
  ['refill', "Freon to'ldirish", 'Заправка фреоном', 'Refrigerant refill', 'ac_unit', 4],
  ['repair', "Diagnostika va ta'mir", 'Диагностика и ремонт', 'Diagnostics and repair', 'construction', 5],
  ['survey', "Loyiha va o'lchov", 'Проект и замер', 'Design and survey', 'straighten', 6],
];

module.exports = {
  async up(queryInterface) {
    const t = await queryInterface.sequelize.transaction();
    const q = (sql, replacements) => queryInterface.sequelize.query(sql, { transaction: t, replacements });
    try {
      // ---------------------------------------------------------------- 1. hamkor turi
      await q(`ALTER TABLE stores ADD COLUMN IF NOT EXISTS sells_products BOOLEAN NOT NULL DEFAULT true`);
      await q(`ALTER TABLE stores ADD COLUMN IF NOT EXISTS sells_services BOOLEAN NOT NULL DEFAULT false`);
      await q(`ALTER TABLE stores ADD COLUMN IF NOT EXISTS service_rating NUMERIC(3,2)`);
      await q(`ALTER TABLE stores ADD COLUMN IF NOT EXISTS service_reviews_count INTEGER NOT NULL DEFAULT 0`);
      await q(`ALTER TABLE stores ADD COLUMN IF NOT EXISTS jobs_done INTEGER NOT NULL DEFAULT 0`);
      await q(`ALTER TABLE stores DROP CONSTRAINT IF EXISTS stores_sells_something_chk`);
      await q(`ALTER TABLE stores ADD CONSTRAINT stores_sells_something_chk CHECK (sells_products OR sells_services)`);

      await q(`
        CREATE TABLE IF NOT EXISTS store_service_areas (
          id            SERIAL PRIMARY KEY,
          store_id      INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
          region_code   VARCHAR(40) NOT NULL,
          district_code VARCHAR(40),
          created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
        )`);
      await q(`CREATE UNIQUE INDEX IF NOT EXISTS store_service_areas_uq
                 ON store_service_areas (store_id, region_code, COALESCE(district_code, ''))`);
      await q(`CREATE INDEX IF NOT EXISTS store_service_areas_geo_idx ON store_service_areas (region_code, district_code)`);

      // ---------------------------------------------------------------- 2. usta
      await q(`ALTER TABLE couriers ADD COLUMN IF NOT EXISTS skills TEXT[] NOT NULL DEFAULT '{delivery}'`);
      await q(`ALTER TABLE couriers DROP CONSTRAINT IF EXISTS couriers_skills_chk`);
      await q(`ALTER TABLE couriers ADD CONSTRAINT couriers_skills_chk CHECK (cardinality(skills) > 0)`);
      await q(`ALTER TABLE couriers ALTER COLUMN vehicle_type DROP NOT NULL`);
      await q(`CREATE INDEX IF NOT EXISTS couriers_skills_idx ON couriers USING GIN (skills)`);

      // ---------------------------------------------------------------- 3. katalog
      await q(`
        CREATE TABLE IF NOT EXISTS service_categories (
          id         SERIAL PRIMARY KEY,
          key        VARCHAR(30) NOT NULL UNIQUE,
          name_uz    VARCHAR(120) NOT NULL,
          name_ru    VARCHAR(120),
          name_en    VARCHAR(120),
          icon       VARCHAR(60),
          sort       INTEGER NOT NULL DEFAULT 0,
          is_active  BOOLEAN NOT NULL DEFAULT true,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          CONSTRAINT service_categories_key_chk CHECK (key ~ '^[a-z][a-z0-9_]{1,29}$' AND key <> 'delivery')
        )`);
      for (const [key, uz, ru, en, icon, sort] of CATEGORIES) {
        await q(
          `INSERT INTO service_categories (key, name_uz, name_ru, name_en, icon, sort)
           VALUES (:key, :uz, :ru, :en, :icon, :sort) ON CONFLICT (key) DO NOTHING`,
          { key, uz, ru, en, icon, sort },
        );
      }

      await q(`
        CREATE TABLE IF NOT EXISTS services (
          id                 SERIAL PRIMARY KEY,
          store_id           INTEGER NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
          category_id        INTEGER NOT NULL REFERENCES service_categories(id) ON DELETE RESTRICT,
          name_uz            VARCHAR(200) NOT NULL,
          name_ru            VARCHAR(200),
          name_en            VARCHAR(200),
          description_uz     TEXT,
          description_ru     TEXT,
          description_en     TEXT,
          price_type         VARCHAR(10) NOT NULL DEFAULT 'fixed',
          unit               VARCHAR(10) NOT NULL DEFAULT 'piece',
          visit_fee_uzs      BIGINT,
          duration_minutes   INTEGER,
          warranty_months    INTEGER NOT NULL DEFAULT 0,
          photos             TEXT[] NOT NULL DEFAULT '{}',
          commission_percent NUMERIC(5,2),
          is_active          BOOLEAN NOT NULL DEFAULT true,
          sort               INTEGER NOT NULL DEFAULT 0,
          created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
          CONSTRAINT services_price_type_chk CHECK (price_type IN ('fixed', 'from', 'quote')),
          CONSTRAINT services_unit_chk CHECK (unit IN ('piece', 'm2', 'm', 'hour', 'visit')),
          CONSTRAINT services_visit_fee_chk CHECK (visit_fee_uzs IS NULL OR visit_fee_uzs >= 0),
          CONSTRAINT services_duration_chk CHECK (duration_minutes IS NULL OR duration_minutes > 0),
          CONSTRAINT services_warranty_chk CHECK (warranty_months >= 0 AND warranty_months <= 120),
          CONSTRAINT services_photos_chk CHECK (cardinality(photos) <= 10)
        )`);
      await q(`CREATE INDEX IF NOT EXISTS services_store_idx ON services (store_id)`);
      await q(`CREATE INDEX IF NOT EXISTS services_category_idx ON services (category_id) WHERE is_active`);

      await q(`
        CREATE TABLE IF NOT EXISTS service_variants (
          id         SERIAL PRIMARY KEY,
          service_id INTEGER NOT NULL REFERENCES services(id) ON DELETE CASCADE,
          name_uz    VARCHAR(200) NOT NULL,
          name_ru    VARCHAR(200),
          name_en    VARCHAR(200),
          price_uzs  BIGINT,
          sort       INTEGER NOT NULL DEFAULT 0,
          is_active  BOOLEAN NOT NULL DEFAULT true,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          CONSTRAINT service_variants_price_chk CHECK (price_uzs IS NULL OR price_uzs >= 0)
        )`);
      await q(`CREATE INDEX IF NOT EXISTS service_variants_service_idx ON service_variants (service_id)`);

      await q(`
        CREATE TABLE IF NOT EXISTS service_product_links (
          id          SERIAL PRIMARY KEY,
          service_id  INTEGER NOT NULL REFERENCES services(id) ON DELETE CASCADE,
          variant_id  INTEGER REFERENCES service_variants(id) ON DELETE CASCADE,
          category_id INTEGER REFERENCES category(id) ON DELETE CASCADE,
          product_id  INTEGER REFERENCES products(id) ON DELETE CASCADE,
          CONSTRAINT service_product_links_target_chk CHECK ((category_id IS NULL) <> (product_id IS NULL))
        )`);
      await q(`CREATE INDEX IF NOT EXISTS service_product_links_product_idx ON service_product_links (product_id)`);
      await q(`CREATE INDEX IF NOT EXISTS service_product_links_category_idx ON service_product_links (category_id)`);
      await q(`CREATE INDEX IF NOT EXISTS service_product_links_service_idx ON service_product_links (service_id)`);

      // ---------------------------------------------------------------- 4. buyurtma
      await q(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS region_code VARCHAR(40)`);
      await q(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS district_code VARCHAR(40)`);

      await q(`ALTER TABLE "order-items" ADD COLUMN IF NOT EXISTS item_type VARCHAR(10) NOT NULL DEFAULT 'product'`);
      await q(`ALTER TABLE "order-items" ADD COLUMN IF NOT EXISTS service_id INTEGER REFERENCES services(id) ON DELETE RESTRICT`);
      await q(`ALTER TABLE "order-items" ADD COLUMN IF NOT EXISTS service_variant_id INTEGER REFERENCES service_variants(id) ON DELETE SET NULL`);
      await q(`ALTER TABLE "order-items" ADD COLUMN IF NOT EXISTS for_order_item_id INTEGER REFERENCES "order-items"(id) ON DELETE SET NULL`);
      await q(`ALTER TABLE "order-items" ADD COLUMN IF NOT EXISTS store_id INTEGER`);
      await q(`ALTER TABLE "order-items" ADD COLUMN IF NOT EXISTS price_type VARCHAR(10)`);
      await q(`ALTER TABLE "order-items" ADD COLUMN IF NOT EXISTS visit_fee_uzs BIGINT`);
      await q(`ALTER TABLE "order-items" ALTER COLUMN product_id DROP NOT NULL`);
      await q(`ALTER TABLE "order-items" DROP CONSTRAINT IF EXISTS order_items_type_chk`);
      await q(`ALTER TABLE "order-items" ADD CONSTRAINT order_items_type_chk CHECK (
                 (item_type = 'product' AND product_id IS NOT NULL)
              OR (item_type = 'service' AND service_id IS NOT NULL AND product_id IS NULL))`);
      // Qator do'koni — HAMMA qator uchun: tovar qatorida mahsulotdan, xizmat
      // qatorida xizmatdan. Qator qaysi yo'l bilan yozilmasin (API, bot, xom SQL)
      // trigger to'ldiradi; kod endi do'konni shu ustundan oladi.
      await q(`UPDATE "order-items" i SET store_id = p.store_id FROM products p
                WHERE p.id = i.product_id AND i.store_id IS NULL`);
      await q(`
        CREATE OR REPLACE FUNCTION order_items_store_fill() RETURNS trigger AS $$
        BEGIN
          IF NEW.item_type = 'service' THEN
            NEW.store_id := (SELECT store_id FROM services WHERE id = NEW.service_id);
          ELSIF NEW.product_id IS NOT NULL THEN
            NEW.store_id := (SELECT store_id FROM products WHERE id = NEW.product_id);
          END IF;
          RETURN NEW;
        END $$ LANGUAGE plpgsql`);
      await q(`DROP TRIGGER IF EXISTS order_items_store_fill ON "order-items"`);
      await q(`CREATE TRIGGER order_items_store_fill
                 BEFORE INSERT OR UPDATE OF product_id, service_id, item_type, store_id ON "order-items"
                 FOR EACH ROW EXECUTE FUNCTION order_items_store_fill()`);
      await q(`CREATE INDEX IF NOT EXISTS order_items_store_idx ON "order-items" (store_id, order_id)`);

      // ---------------------------------------------------------------- 5. ish
      await q(`
        CREATE TABLE IF NOT EXISTS service_jobs (
          id                   SERIAL PRIMARY KEY,
          order_id             INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
          store_id             INTEGER NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
          worker_id            INTEGER REFERENCES couriers(id) ON DELETE SET NULL,
          delivery_id          INTEGER REFERENCES deliveries(id) ON DELETE SET NULL,
          parent_job_id        INTEGER REFERENCES service_jobs(id) ON DELETE SET NULL,
          status               VARCHAR(15) NOT NULL DEFAULT 'pending',
          items                INTEGER[] NOT NULL DEFAULT '{}',
          address              VARCHAR(500),
          lat                  NUMERIC(9,6),
          lng                  NUMERIC(9,6),
          address_details      VARCHAR(500),
          recipient_name       VARCHAR(150),
          recipient_phone      VARCHAR(13),
          comment              VARCHAR(2000),
          customer_photos      TEXT[] NOT NULL DEFAULT '{}',
          customer_from        TIMESTAMPTZ,
          customer_to          TIMESTAMPTZ,
          scheduled_from       TIMESTAMPTZ,
          scheduled_to         TIMESTAMPTZ,
          schedule_status      VARCHAR(12) NOT NULL DEFAULT 'proposed',
          quoted_amount        BIGINT,
          visit_fee_uzs        BIGINT,
          final_amount         BIGINT,
          final_amount_status  VARCHAR(10),
          final_amount_comment VARCHAR(1000),
          final_amount_photos  TEXT[] NOT NULL DEFAULT '{}',
          cod_amount           BIGINT NOT NULL DEFAULT 0,
          cod_before_price     BIGINT,
          cash_collected       BIGINT,
          photos_before        TEXT[] NOT NULL DEFAULT '{}',
          photos_after         TEXT[] NOT NULL DEFAULT '{}',
          proof_code_enc       VARCHAR(200),
          proof_code_attempts  INTEGER NOT NULL DEFAULT 0,
          proof_comment        VARCHAR(1000),
          failure_reason       VARCHAR(30),
          failure_comment      VARCHAR(1000),
          failure_photo        VARCHAR(500),
          warranty_until       TIMESTAMPTZ,
          commission_percent   NUMERIC(5,2),
          assigned_at          TIMESTAMPTZ,
          accepted_at          TIMESTAMPTZ,
          started_at           TIMESTAMPTZ,
          arrived_at           TIMESTAMPTZ,
          work_started_at      TIMESTAMPTZ,
          completed_at         TIMESTAMPTZ,
          failed_at            TIMESTAMPTZ,
          cancelled_at         TIMESTAMPTZ,
          created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
          CONSTRAINT service_jobs_status_chk CHECK (status IN
            ('pending', 'assigned', 'accepted', 'on_the_way', 'arrived', 'in_progress', 'completed', 'failed', 'cancelled')),
          CONSTRAINT service_jobs_schedule_chk CHECK (schedule_status IN ('proposed', 'confirmed', 'rescheduled')),
          CONSTRAINT service_jobs_final_chk CHECK (final_amount_status IS NULL OR final_amount_status IN ('pending', 'accepted', 'rejected')),
          CONSTRAINT service_jobs_failure_chk CHECK (failure_reason IS NULL OR failure_reason IN
            ('client_unreachable', 'client_refused', 'wrong_address', 'not_possible', 'other')),
          CONSTRAINT service_jobs_phone_chk CHECK (recipient_phone IS NULL OR recipient_phone ~ '^\\+998[0-9]{9}$'),
          CONSTRAINT service_jobs_money_chk CHECK (cod_amount >= 0 AND (final_amount IS NULL OR final_amount >= 0))
        )`);
      await q(`CREATE INDEX IF NOT EXISTS service_jobs_order_idx ON service_jobs (order_id)`);
      await q(`CREATE INDEX IF NOT EXISTS service_jobs_store_idx ON service_jobs (store_id, status)`);
      await q(`CREATE INDEX IF NOT EXISTS service_jobs_worker_idx ON service_jobs (worker_id, status)`);

      await q(`
        CREATE TABLE IF NOT EXISTS service_job_events (
          id          BIGSERIAL PRIMARY KEY,
          job_id      INTEGER NOT NULL REFERENCES service_jobs(id) ON DELETE CASCADE,
          from_status VARCHAR(15),
          to_status   VARCHAR(15) NOT NULL,
          event       VARCHAR(30),
          actor_type  VARCHAR(12) NOT NULL,
          actor_id    INTEGER,
          lat         NUMERIC(9,6),
          lng         NUMERIC(9,6),
          comment     VARCHAR(1000),
          created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
          CONSTRAINT service_job_events_actor_chk CHECK (actor_type IN ('customer', 'store', 'superadmin', 'courier', 'system'))
        )`);
      await q(`CREATE INDEX IF NOT EXISTS service_job_events_job_idx ON service_job_events (job_id)`);

      // ---------------------------------------------------------------- 6. baho
      await q(`
        CREATE TABLE IF NOT EXISTS service_reviews (
          id         SERIAL PRIMARY KEY,
          job_id     INTEGER NOT NULL UNIQUE REFERENCES service_jobs(id) ON DELETE CASCADE,
          order_id   INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
          store_id   INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
          user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          rating     SMALLINT NOT NULL,
          comment    VARCHAR(2000),
          is_hidden  BOOLEAN NOT NULL DEFAULT false,
          hidden_by  INTEGER,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          CONSTRAINT service_reviews_rating_chk CHECK (rating BETWEEN 1 AND 5)
        )`);
      await q(`CREATE INDEX IF NOT EXISTS service_reviews_store_idx ON service_reviews (store_id) WHERE NOT is_hidden`);

      await q(`ALTER TABLE courier_locations ADD COLUMN IF NOT EXISTS job_id INTEGER`);
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
      await q(`ALTER TABLE courier_locations DROP COLUMN IF EXISTS job_id`);
      await q(`DROP TABLE IF EXISTS service_reviews`);
      await q(`DROP TABLE IF EXISTS service_job_events`);
      await q(`DROP TABLE IF EXISTS service_jobs`);
      await q(`DROP TRIGGER IF EXISTS order_items_store_fill ON "order-items"`);
      await q(`DROP FUNCTION IF EXISTS order_items_store_fill()`);
      // Xizmat qatorlari eski sxemaga sig'maydi (product_id NOT NULL)
      await q(`DELETE FROM "order-items" WHERE item_type = 'service'`);
      await q(`ALTER TABLE "order-items" DROP CONSTRAINT IF EXISTS order_items_type_chk`);
      await q(`ALTER TABLE "order-items" ALTER COLUMN product_id SET NOT NULL`);
      for (const col of ['visit_fee_uzs', 'price_type', 'store_id', 'for_order_item_id', 'service_variant_id', 'service_id', 'item_type']) {
        await q(`ALTER TABLE "order-items" DROP COLUMN IF EXISTS ${col}`);
      }
      await q(`ALTER TABLE orders DROP COLUMN IF EXISTS district_code`);
      await q(`ALTER TABLE orders DROP COLUMN IF EXISTS region_code`);
      await q(`DROP TABLE IF EXISTS service_product_links`);
      await q(`DROP TABLE IF EXISTS service_variants`);
      await q(`DROP TABLE IF EXISTS services`);
      await q(`DROP TABLE IF EXISTS service_categories`);
      await q(`UPDATE couriers SET vehicle_type = 'car' WHERE vehicle_type IS NULL`);
      await q(`ALTER TABLE couriers ALTER COLUMN vehicle_type SET NOT NULL`);
      await q(`DROP INDEX IF EXISTS couriers_skills_idx`);
      await q(`ALTER TABLE couriers DROP CONSTRAINT IF EXISTS couriers_skills_chk`);
      await q(`ALTER TABLE couriers DROP COLUMN IF EXISTS skills`);
      await q(`DROP TABLE IF EXISTS store_service_areas`);
      await q(`ALTER TABLE stores DROP CONSTRAINT IF EXISTS stores_sells_something_chk`);
      for (const col of ['jobs_done', 'service_reviews_count', 'service_rating', 'sells_services', 'sells_products']) {
        await q(`ALTER TABLE stores DROP COLUMN IF EXISTS ${col}`);
      }
      await t.commit();
    } catch (e) {
      await t.rollback();
      throw e;
    }
  },
};
