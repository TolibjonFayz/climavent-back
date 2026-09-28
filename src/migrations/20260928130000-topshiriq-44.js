'use strict';

// Topshiriq №44 — brigadalar, ishonch darajalari, yetkazishni ommaga chiqarish.
//
// 1. Brigadalar:
//    crews, crew_members (bitta usta — bitta faol brigada), crew_invites (taklif havolasi)
//    courier_applications.applicant_type / crew / crew_invite_id; a'zo arizasida
//      employment_type va tin ixtiyoriy (qisqa ariza: shaxsiy + pasport + selfi)
//    service_jobs.crew_id (boshliq = worker_id), service_jobs.performer_id (yo'lga
//      chiqqan ijrochi — mijozga shu ko'rinadi), service_job_workers (boshliq tanlagan ijrochilar)
// 2. Ishonch: couriers/crews . trust_level, verified_skills, top_revoked_at, rating,
//    reviews_count, jobs_done; `top` shartlari `settings` da (sozlanadi).
// 3. Yetkazish: stores.delivery_modes; deliveries.mode ('self'|'platform'|'pickup'),
//    yangi holat `open`, published_at / opened_at / publish_radius_km / publish_note /
//    open_warned_at, payout_status, proof_code_enc (do'kon/olib ketish kodi — mijoz
//    ilovada ko'radi); courier_rates.loader_fee.
//
// Eski backend bilan mos: faqat yangi jadval/ustun (default bilan) va kengaytirilgan
// CHECK. Yangi backend modellarida yangi ustunlar e'lon qilingan — migratsiya OLDIN.

const DELIVERY_STATUSES = ['pending', 'open', 'assigned', 'accepted', 'picked_up', 'on_the_way', 'delivered', 'failed', 'returned', 'cancelled'];
const OLD_DELIVERY_STATUSES = DELIVERY_STATUSES.filter((s) => s !== 'open');
const list = (xs) => xs.map((x) => `'${x}'`).join(', ');

const SETTINGS = [
  ['trust_top_min_rating', '4.8', "`top` ishonch darajasi: eng kam reyting (№44)"],
  ['trust_top_min_jobs', '20', '`top`: eng kam yakunlangan ish soni'],
  ['trust_top_max_warranty_share', '0.05', '`top`: oxirgi 90 kunda kafolat murojaati ulushi (0..1)'],
  ['trust_top_max_cancel_share', '0.05', '`top`: oxirgi 90 kunda bekor qilish (rad etish) ulushi (0..1)'],
  ['open_delivery_radius_km', '10', "Ochiq yetkazish: boshlang'ich radius (km)"],
  ['open_delivery_expand_minutes', '10', 'Ochiq yetkazish: har shuncha daqiqada radius 2 barobar'],
  ['open_delivery_max_radius_km', '40', 'Ochiq yetkazish: eng katta radius (km)'],
  ['open_delivery_warn_minutes', '30', "Ochiq yetkazish: shuncha daqiqada olinmasa — do'kon va superadminga ogohlantirish"],
];

module.exports = {
  async up(queryInterface) {
    const t = await queryInterface.sequelize.transaction();
    const q = (sql, replacements) => queryInterface.sequelize.query(sql, { transaction: t, replacements });
    try {
      // ================================================================ 2. ishonch (couriers)
      await q(`ALTER TABLE couriers ADD COLUMN IF NOT EXISTS trust_level VARCHAR(10) NOT NULL DEFAULT 'none'`);
      await q(`ALTER TABLE couriers ADD COLUMN IF NOT EXISTS verified_skills TEXT[] NOT NULL DEFAULT '{}'`);
      await q(`ALTER TABLE couriers ADD COLUMN IF NOT EXISTS top_revoked_at TIMESTAMPTZ`);
      await q(`ALTER TABLE couriers ADD COLUMN IF NOT EXISTS rating NUMERIC(3,2)`);
      await q(`ALTER TABLE couriers ADD COLUMN IF NOT EXISTS reviews_count INTEGER NOT NULL DEFAULT 0`);
      await q(`ALTER TABLE couriers ADD COLUMN IF NOT EXISTS jobs_done INTEGER NOT NULL DEFAULT 0`);
      await q(`ALTER TABLE couriers DROP CONSTRAINT IF EXISTS couriers_trust_chk`);
      await q(`ALTER TABLE couriers ADD CONSTRAINT couriers_trust_chk CHECK (trust_level IN ('none', 'documents', 'skills', 'top'))`);
      // Mavjud kuryerlar: hujjati tasdiqlangan — `documents`
      await q(`UPDATE couriers SET trust_level = 'documents' WHERE documents_verified_at IS NOT NULL AND trust_level = 'none'`);

      // ================================================================ 1. brigadalar
      await q(`
        CREATE TABLE IF NOT EXISTS crews (
          id                SERIAL PRIMARY KEY,
          name              VARCHAR(80) NOT NULL,
          leader_courier_id INTEGER NOT NULL REFERENCES couriers(id) ON DELETE RESTRICT,
          store_id          INTEGER REFERENCES stores(id) ON DELETE RESTRICT,
          skills            TEXT[] NOT NULL DEFAULT '{}',
          service_areas     JSONB NOT NULL DEFAULT '[]'::jsonb,
          members_count     INTEGER NOT NULL DEFAULT 1,
          is_active         BOOLEAN NOT NULL DEFAULT true,
          trust_level       VARCHAR(10) NOT NULL DEFAULT 'none',
          verified_skills   TEXT[] NOT NULL DEFAULT '{}',
          top_revoked_at    TIMESTAMPTZ,
          rating            NUMERIC(3,2),
          reviews_count     INTEGER NOT NULL DEFAULT 0,
          jobs_done         INTEGER NOT NULL DEFAULT 0,
          created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
          CONSTRAINT crews_name_chk CHECK (char_length(trim(name)) BETWEEN 3 AND 80),
          CONSTRAINT crews_members_count_chk CHECK (members_count BETWEEN 1 AND 50),
          CONSTRAINT crews_trust_chk CHECK (trust_level IN ('none', 'documents', 'skills', 'top'))
        )`);
      await q(`CREATE INDEX IF NOT EXISTS crews_store_idx ON crews (store_id)`);
      await q(`CREATE UNIQUE INDEX IF NOT EXISTS crews_leader_active_uq ON crews (leader_courier_id) WHERE is_active`);

      await q(`
        CREATE TABLE IF NOT EXISTS crew_members (
          id         SERIAL PRIMARY KEY,
          crew_id    INTEGER NOT NULL REFERENCES crews(id) ON DELETE CASCADE,
          courier_id INTEGER NOT NULL REFERENCES couriers(id) ON DELETE CASCADE,
          role       VARCHAR(10) NOT NULL DEFAULT 'member',
          joined_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
          left_at    TIMESTAMPTZ,
          CONSTRAINT crew_members_role_chk CHECK (role IN ('leader', 'member'))
        )`);
      // Bitta usta bir vaqtda faqat bitta faol brigadada (poyga holatida ham)
      await q(`CREATE UNIQUE INDEX IF NOT EXISTS crew_members_active_uq ON crew_members (courier_id) WHERE left_at IS NULL`);
      await q(`CREATE INDEX IF NOT EXISTS crew_members_crew_idx ON crew_members (crew_id)`);

      await q(`
        CREATE TABLE IF NOT EXISTS crew_invites (
          id             SERIAL PRIMARY KEY,
          crew_id        INTEGER NOT NULL REFERENCES crews(id) ON DELETE CASCADE,
          token_hash     VARCHAR(64) NOT NULL UNIQUE,
          full_name      VARCHAR(120) NOT NULL,
          phone          VARCHAR(13) NOT NULL,
          created_by     INTEGER REFERENCES couriers(id) ON DELETE SET NULL,
          expires_at     TIMESTAMPTZ NOT NULL,
          application_id INTEGER REFERENCES courier_applications(id) ON DELETE SET NULL,
          accepted_at    TIMESTAMPTZ,
          revoked_at     TIMESTAMPTZ,
          created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
          CONSTRAINT crew_invites_phone_chk CHECK (phone ~ '^\\+998[0-9]{9}$')
        )`);
      await q(`CREATE INDEX IF NOT EXISTS crew_invites_crew_idx ON crew_invites (crew_id)`);

      await q(`ALTER TABLE courier_applications ADD COLUMN IF NOT EXISTS applicant_type VARCHAR(12) NOT NULL DEFAULT 'individual'`);
      await q(`ALTER TABLE courier_applications ADD COLUMN IF NOT EXISTS crew JSONB`);
      await q(`ALTER TABLE courier_applications ADD COLUMN IF NOT EXISTS crew_invite_id INTEGER REFERENCES crew_invites(id) ON DELETE SET NULL`);
      await q(`ALTER TABLE courier_applications DROP CONSTRAINT IF EXISTS courier_applications_applicant_chk`);
      await q(`ALTER TABLE courier_applications ADD CONSTRAINT courier_applications_applicant_chk
                 CHECK (applicant_type IN ('individual', 'crew', 'crew_member'))`);
      // A'zo arizasi qisqa: bandlik turi va STIR/JShShIR ixtiyoriy (faqat taklif bilan)
      await q(`ALTER TABLE courier_applications ALTER COLUMN employment_type DROP NOT NULL`);
      await q(`ALTER TABLE courier_applications ALTER COLUMN tin DROP NOT NULL`);
      await q(`ALTER TABLE courier_applications DROP CONSTRAINT IF EXISTS courier_applications_short_chk`);
      await q(`ALTER TABLE courier_applications ADD CONSTRAINT courier_applications_short_chk
                 CHECK (crew_invite_id IS NOT NULL OR applicant_type = 'crew_member' OR (employment_type IS NOT NULL AND tin IS NOT NULL))`);

      await q(`ALTER TABLE service_jobs ADD COLUMN IF NOT EXISTS crew_id INTEGER REFERENCES crews(id) ON DELETE SET NULL`);
      await q(`ALTER TABLE service_jobs ADD COLUMN IF NOT EXISTS performer_id INTEGER REFERENCES couriers(id) ON DELETE SET NULL`);
      await q(`CREATE INDEX IF NOT EXISTS service_jobs_crew_idx ON service_jobs (crew_id, status)`);
      await q(`
        CREATE TABLE IF NOT EXISTS service_job_workers (
          job_id     INTEGER NOT NULL REFERENCES service_jobs(id) ON DELETE CASCADE,
          courier_id INTEGER NOT NULL REFERENCES couriers(id) ON DELETE CASCADE,
          added_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
          PRIMARY KEY (job_id, courier_id)
        )`);
      await q(`CREATE INDEX IF NOT EXISTS service_job_workers_courier_idx ON service_job_workers (courier_id)`);

      // ================================================================ 3. yetkazish
      await q(`ALTER TABLE stores ADD COLUMN IF NOT EXISTS delivery_modes TEXT[] NOT NULL DEFAULT '{self}'`);
      await q(`ALTER TABLE stores DROP CONSTRAINT IF EXISTS stores_delivery_modes_chk`);
      await q(`ALTER TABLE stores ADD CONSTRAINT stores_delivery_modes_chk
                 CHECK (cardinality(delivery_modes) > 0 AND delivery_modes <@ ARRAY['self', 'platform', 'pickup']::text[])`);

      await q(`ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS mode VARCHAR(10) NOT NULL DEFAULT 'self'`);
      await q(`ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ`);
      await q(`ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS opened_at TIMESTAMPTZ`);
      await q(`ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS publish_radius_km NUMERIC(6,2)`);
      await q(`ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS publish_note VARCHAR(1000)`);
      await q(`ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS open_warned_at TIMESTAMPTZ`);
      await q(`ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS payout_status VARCHAR(10)`);
      await q(`ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS proof_code_enc VARCHAR(200)`);
      await q(`ALTER TABLE deliveries DROP CONSTRAINT IF EXISTS deliveries_mode_chk`);
      await q(`ALTER TABLE deliveries ADD CONSTRAINT deliveries_mode_chk CHECK (mode IN ('self', 'platform', 'pickup'))`);
      await q(`ALTER TABLE deliveries DROP CONSTRAINT IF EXISTS deliveries_payout_chk`);
      await q(`ALTER TABLE deliveries ADD CONSTRAINT deliveries_payout_chk CHECK (payout_status IS NULL OR payout_status IN ('pending', 'paid'))`);
      await q(`ALTER TABLE deliveries DROP CONSTRAINT IF EXISTS deliveries_status_chk`);
      await q(`ALTER TABLE deliveries ADD CONSTRAINT deliveries_status_chk CHECK (status IN (${list(DELIVERY_STATUSES)}))`);
      await q(`CREATE INDEX IF NOT EXISTS deliveries_open_idx ON deliveries (opened_at) WHERE status = 'open'`);

      await q(`ALTER TABLE courier_rates ADD COLUMN IF NOT EXISTS loader_fee BIGINT NOT NULL DEFAULT 0`);

      for (const [key, value, description] of SETTINGS) {
        await q(
          `INSERT INTO settings (key, value, description, "createdAt", "updatedAt")
           SELECT :key, :value, :description, now(), now()
            WHERE NOT EXISTS (SELECT 1 FROM settings WHERE key = :key)`,
          { key, value, description },
        );
      }
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
      await q(`DELETE FROM settings WHERE key IN (${list(SETTINGS.map((s) => s[0]))})`);
      await q(`ALTER TABLE courier_rates DROP COLUMN IF EXISTS loader_fee`);
      // `open` holatdagilar — pending ga (eski backend `open` ni bilmaydi)
      await q(`UPDATE deliveries SET status = 'pending' WHERE status = 'open'`);
      await q(`ALTER TABLE deliveries DROP CONSTRAINT IF EXISTS deliveries_status_chk`);
      await q(`ALTER TABLE deliveries ADD CONSTRAINT deliveries_status_chk CHECK (status IN (${list(OLD_DELIVERY_STATUSES)}))`);
      await q(`DROP INDEX IF EXISTS deliveries_open_idx`);
      for (const c of ['mode', 'published_at', 'opened_at', 'publish_radius_km', 'publish_note', 'open_warned_at', 'payout_status', 'proof_code_enc']) {
        await q(`ALTER TABLE deliveries DROP COLUMN IF EXISTS ${c}`);
      }
      await q(`ALTER TABLE stores DROP COLUMN IF EXISTS delivery_modes`);
      await q(`DROP TABLE IF EXISTS service_job_workers`);
      await q(`ALTER TABLE service_jobs DROP COLUMN IF EXISTS performer_id`);
      await q(`ALTER TABLE service_jobs DROP COLUMN IF EXISTS crew_id`);
      await q(`ALTER TABLE courier_applications DROP CONSTRAINT IF EXISTS courier_applications_short_chk`);
      await q(`ALTER TABLE courier_applications DROP CONSTRAINT IF EXISTS courier_applications_applicant_chk`);
      await q(`ALTER TABLE courier_applications DROP COLUMN IF EXISTS crew_invite_id`);
      await q(`ALTER TABLE courier_applications DROP COLUMN IF EXISTS crew`);
      await q(`ALTER TABLE courier_applications DROP COLUMN IF EXISTS applicant_type`);
      // employment_type/tin NOT NULL qaytmaydi: a'zo arizalarida bo'sh qiymat bo'lishi mumkin
      await q(`DROP TABLE IF EXISTS crew_invites`);
      await q(`DROP TABLE IF EXISTS crew_members`);
      await q(`DROP TABLE IF EXISTS crews`);
      await q(`ALTER TABLE couriers DROP CONSTRAINT IF EXISTS couriers_trust_chk`);
      for (const c of ['trust_level', 'verified_skills', 'top_revoked_at', 'rating', 'reviews_count', 'jobs_done']) {
        await q(`ALTER TABLE couriers DROP COLUMN IF EXISTS ${c}`);
      }
      await t.commit();
    } catch (e) {
      await t.rollback();
      throw e;
    }
  },
};
