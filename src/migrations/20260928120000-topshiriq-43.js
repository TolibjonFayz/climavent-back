'use strict';

// Topshiriq №43, 2-band — sinov ma'lumotlarini belgilash va tozalash.
//
//   users / stores / store_users / couriers / orders . is_test  (boolean, default false)
//   admin_audit                — superadmin amallari jurnali (faqat INSERT, trigger bilan)
//   is_test avtomatik qoidalari (BEFORE/AFTER trigger'lar):
//     store_users  — login `zz-` bilan boshlansa
//     couriers     — hisobi (store_users) is_test bo'lsa
//     stores       — slug yoki nomi `zz-` bilan boshlansa
//     orders       — xaridori is_test; qatori is_test do'konga tegishli; biriktirilgan
//                    kuryeri (deliveries) yoki ustasi (service_jobs) is_test bo'lsa
//   users (xaridor) — telefon `SMS_TEST_PHONES` da. Bu env'da, trigger'da emas:
//                    ilova ishga tushganda va yangi xaridor yaratilganda qo'yiladi
//                    (test-data.service `syncTestPhones`). Bu migratsiya ham env
//                    bo'lsa bir marta qo'llaydi.
//
//   forbid_evidence_change — dalil jadvallari (offer_acceptances, seller_application_events)
//     endi FAQAT tozalash tranzaksiyasida (`SET LOCAL climavent.test_purge = 'on'`)
//     o'chiriladi. Oddiy DELETE avvalgidek taqiqlangan. DDL (DISABLE TRIGGER) kerak emas —
//     jadval qulflanmaydi. admin_audit ni hech qanday holatda o'zgartirib/o'chirib bo'lmaydi.
//
// Eski backend bilan mos: faqat yangi ustun (default bilan) va jadval. Lekin YANGI backend
// modellarida `is_test` e'lon qilingan — migratsiya backenddan OLDIN ishlatilsin.

const TABLES = ['users', 'stores', 'store_users', 'couriers', 'orders'];

const evidenceFn = (withPurge) => `
  CREATE OR REPLACE FUNCTION forbid_evidence_change() RETURNS trigger AS $$
  BEGIN
    IF TG_OP = 'DELETE' THEN
      ${
        withPurge
          ? `IF TG_TABLE_NAME <> 'admin_audit' AND current_setting('climavent.test_purge', true) = 'on' THEN
        RETURN OLD;
      END IF;`
          : ''
      }
      RAISE EXCEPTION '% jadvalidagi yozuvni o''chirib bo''lmaydi (dalil)', TG_TABLE_NAME;
    END IF;

    IF TG_TABLE_NAME = 'offer_acceptances' THEN
      IF NEW.kind IS DISTINCT FROM OLD.kind OR
         NEW.version IS DISTINCT FROM OLD.version OR
         NEW.application_id IS DISTINCT FROM OLD.application_id OR
         NEW.courier_application_id IS DISTINCT FROM OLD.courier_application_id OR
         (NEW.user_id IS DISTINCT FROM OLD.user_id AND NEW.user_id IS NOT NULL) OR
         NEW.accepted_at IS DISTINCT FROM OLD.accepted_at OR
         NEW.ip IS DISTINCT FROM OLD.ip OR
         NEW.user_agent IS DISTINCT FROM OLD.user_agent OR
         (NEW.store_id IS DISTINCT FROM OLD.store_id AND NEW.store_id IS NOT NULL) OR
         (NEW.store_user_id IS DISTINCT FROM OLD.store_user_id AND NEW.store_user_id IS NOT NULL) THEN
        RAISE EXCEPTION 'offer_acceptances yozuvini tahrirlab bo''lmaydi (dalil)';
      END IF;

    ELSIF TG_TABLE_NAME = 'seller_application_events' THEN
      IF NEW.application_id IS DISTINCT FROM OLD.application_id OR
         NEW.type IS DISTINCT FROM OLD.type OR
         NEW.message IS DISTINCT FROM OLD.message OR
         NEW.actor_login IS DISTINCT FROM OLD.actor_login OR
         NEW.created_at IS DISTINCT FROM OLD.created_at OR
         (NEW.actor_id IS DISTINCT FROM OLD.actor_id AND NEW.actor_id IS NOT NULL) THEN
        RAISE EXCEPTION 'seller_application_events yozuvini tahrirlab bo''lmaydi (tarix)';
      END IF;
    ${
      withPurge
        ? `
    ELSIF TG_TABLE_NAME = 'admin_audit' THEN
      RAISE EXCEPTION 'admin_audit yozuvini tahrirlab bo''lmaydi (jurnal)';`
        : ''
    }
    END IF;

    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql`;

// Trigger funksiyalari. Jadval bo'yicha alohida funksiya — PL/pgSQL `AND` qisqa
// tutashmaydi, boshqa jadvalda "record new has no field" bo'lmasin (memory gotcha).
const FUNCTIONS = [
  `CREATE OR REPLACE FUNCTION test_flag_store_user() RETURNS trigger AS $$
   BEGIN
     IF NEW.login ILIKE 'zz-%' THEN NEW.is_test := true; END IF;
     RETURN NEW;
   END; $$ LANGUAGE plpgsql`,
  `CREATE OR REPLACE FUNCTION test_flag_store() RETURNS trigger AS $$
   BEGIN
     IF NEW.slug ILIKE 'zz-%' OR NEW.name ILIKE 'zz-%' THEN NEW.is_test := true; END IF;
     RETURN NEW;
   END; $$ LANGUAGE plpgsql`,
  `CREATE OR REPLACE FUNCTION test_flag_courier() RETURNS trigger AS $$
   BEGIN
     IF NOT NEW.is_test AND EXISTS (SELECT 1 FROM store_users WHERE id = NEW.store_user_id AND is_test) THEN
       NEW.is_test := true;
     END IF;
     RETURN NEW;
   END; $$ LANGUAGE plpgsql`,
  `CREATE OR REPLACE FUNCTION test_flag_order() RETURNS trigger AS $$
   BEGIN
     IF NOT NEW.is_test AND EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id AND is_test) THEN
       NEW.is_test := true;
     END IF;
     RETURN NEW;
   END; $$ LANGUAGE plpgsql`,
  // AFTER: qator do'koni `order_items_store_fill` (BEFORE) dan keyin ma'lum bo'ladi
  `CREATE OR REPLACE FUNCTION test_flag_order_from_item() RETURNS trigger AS $$
   BEGIN
     IF NEW.store_id IS NOT NULL AND EXISTS (SELECT 1 FROM stores WHERE id = NEW.store_id AND is_test) THEN
       UPDATE orders SET is_test = true WHERE id = NEW.order_id AND NOT is_test;
     END IF;
     RETURN NULL;
   END; $$ LANGUAGE plpgsql`,
  `CREATE OR REPLACE FUNCTION test_flag_order_from_delivery() RETURNS trigger AS $$
   BEGIN
     IF NEW.courier_id IS NOT NULL AND EXISTS (SELECT 1 FROM couriers WHERE id = NEW.courier_id AND is_test) THEN
       UPDATE orders SET is_test = true WHERE id = NEW.order_id AND NOT is_test;
     END IF;
     RETURN NULL;
   END; $$ LANGUAGE plpgsql`,
  `CREATE OR REPLACE FUNCTION test_flag_order_from_job() RETURNS trigger AS $$
   BEGIN
     IF NEW.worker_id IS NOT NULL AND EXISTS (SELECT 1 FROM couriers WHERE id = NEW.worker_id AND is_test) THEN
       UPDATE orders SET is_test = true WHERE id = NEW.order_id AND NOT is_test;
     END IF;
     RETURN NULL;
   END; $$ LANGUAGE plpgsql`,
];

const TRIGGERS = [
  ['store_users', 'store_users_test_flag', 'BEFORE INSERT OR UPDATE OF login', 'test_flag_store_user'],
  ['stores', 'stores_test_flag', 'BEFORE INSERT OR UPDATE OF slug, name', 'test_flag_store'],
  ['couriers', 'couriers_test_flag', 'BEFORE INSERT', 'test_flag_courier'],
  ['orders', 'orders_test_flag', 'BEFORE INSERT', 'test_flag_order'],
  ['"order-items"', 'order_items_test_flag', 'AFTER INSERT OR UPDATE OF store_id', 'test_flag_order_from_item'],
  ['deliveries', 'deliveries_test_flag', 'AFTER INSERT OR UPDATE OF courier_id', 'test_flag_order_from_delivery'],
  ['service_jobs', 'service_jobs_test_flag', 'AFTER INSERT OR UPDATE OF worker_id', 'test_flag_order_from_job'],
];

/** `SMS_TEST_PHONES` -> ['998901234567', ...] (otp.service `isTestPhone` bilan bir xil normallash). */
function testPhones() {
  return String(process.env.SMS_TEST_PHONES || '')
    .split(',')
    .map((x) => x.trim().replace(/\D/g, ''))
    .filter(Boolean)
    .map((d) => (d.length === 9 ? `998${d}` : d));
}

module.exports = {
  async up(queryInterface) {
    const t = await queryInterface.sequelize.transaction();
    const q = (sql, replacements) => queryInterface.sequelize.query(sql, { transaction: t, replacements });
    try {
      for (const tb of TABLES) {
        await q(`ALTER TABLE ${tb} ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT false`);
        await q(`CREATE INDEX IF NOT EXISTS ${tb}_is_test_idx ON ${tb} (id) WHERE is_test`);
      }

      await q(`
        CREATE TABLE IF NOT EXISTS admin_audit (
          id          BIGSERIAL PRIMARY KEY,
          actor_type  VARCHAR(12) NOT NULL,
          actor_id    INTEGER,
          actor_login VARCHAR(100),
          action      VARCHAR(40) NOT NULL,
          details     JSONB NOT NULL DEFAULT '{}'::jsonb,
          ip          VARCHAR(64),
          created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        )`);
      await q(`CREATE INDEX IF NOT EXISTS admin_audit_created_idx ON admin_audit (created_at DESC)`);
      await q(evidenceFn(true));
      await q(`DROP TRIGGER IF EXISTS admin_audit_immutable ON admin_audit`);
      await q(`CREATE TRIGGER admin_audit_immutable BEFORE UPDATE OR DELETE ON admin_audit
                 FOR EACH ROW EXECUTE FUNCTION forbid_evidence_change()`);

      for (const fn of FUNCTIONS) await q(fn);
      for (const [table, name, when, fn] of TRIGGERS) {
        await q(`DROP TRIGGER IF EXISTS ${name} ON ${table}`);
        await q(`CREATE TRIGGER ${name} ${when} ON ${table} FOR EACH ROW EXECUTE FUNCTION ${fn}()`);
      }

      // ---- Mavjud yozuvlarga qoidalar bir marta
      await q(`UPDATE store_users SET is_test = true WHERE login ILIKE 'zz-%' AND NOT is_test`);
      await q(`UPDATE stores SET is_test = true WHERE (slug ILIKE 'zz-%' OR name ILIKE 'zz-%') AND NOT is_test`);
      await q(`UPDATE couriers c SET is_test = true FROM store_users u
                WHERE u.id = c.store_user_id AND u.is_test AND NOT c.is_test`);
      const phones = testPhones();
      if (phones.length) {
        await q(
          `UPDATE users SET is_test = true
            WHERE NOT is_test AND regexp_replace(COALESCE(phone_number, ''), '\\D', '', 'g') IN (:phones)`,
          { phones },
        );
      }
      await q(`
        UPDATE orders o SET is_test = true
         WHERE NOT o.is_test AND (
               EXISTS (SELECT 1 FROM users u WHERE u.id = o.user_id AND u.is_test)
            OR EXISTS (SELECT 1 FROM "order-items" i JOIN stores s ON s.id = i.store_id WHERE i.order_id = o.id AND s.is_test)
            OR EXISTS (SELECT 1 FROM deliveries d JOIN couriers c ON c.id = d.courier_id WHERE d.order_id = o.id AND c.is_test)
            OR EXISTS (SELECT 1 FROM service_jobs j JOIN couriers c ON c.id = j.worker_id WHERE j.order_id = o.id AND c.is_test))`);
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
      for (const [table, name] of TRIGGERS) await q(`DROP TRIGGER IF EXISTS ${name} ON ${table}`);
      for (const [, , , fn] of TRIGGERS) await q(`DROP FUNCTION IF EXISTS ${fn}()`);
      await q(`DROP TRIGGER IF EXISTS admin_audit_immutable ON admin_audit`);
      await q(evidenceFn(false));
      await q(`DROP TABLE IF EXISTS admin_audit`);
      for (const tb of TABLES) {
        await q(`DROP INDEX IF EXISTS ${tb}_is_test_idx`);
        await q(`ALTER TABLE ${tb} DROP COLUMN IF EXISTS is_test`);
      }
      await t.commit();
    } catch (e) {
      await t.rollback();
      throw e;
    }
  },
};
