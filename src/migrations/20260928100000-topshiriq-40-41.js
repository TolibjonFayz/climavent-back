'use strict';

// Topshiriqlar №40 va №41 — Climavent Pro: sinovga tayyorlik va kuryer/usta arizasi.
//
// №40:
//   courier_events            — kuryer tarixi (hujjat tasdig'i/bekor, arizadan yaratildi)
//   stores.lat / stores.lng   — do'kon (olib ketish) koordinatasi; yetkazishda pickup_* shundan
//   courier_documents.type    — + selfie, ip_certificate, skill_certificate (arizadan ko'chadi)
//   offer_versions            — kuryer ofertasi 1.0 (bo'lmasa), url — hamkor portali sahifasi
// №41:
//   couriers.service_areas    — [{ region_code, district_code? }] (3-savol: ustun tanlandi)
//   courier_applications (+ _documents, _document_blobs, _events)
//   offer_acceptances.courier_application_id (+ dalil trigger'i shu ustunni ham himoya qiladi)
//
// Eski backend bilan mos: faqat yangi jadval/ustunlar va kengaytirilgan CHECK.
// DIQQAT: joriy kuryer ofertasi e'lon qilingach, hamma kuryerlarning YOZISH amallari
// (№26 dagi oferta darvozasi) ofertani qabul qilguncha 409 qaytaradi — Pro ilovasi buni
// `offer_pending` bo'yicha ko'rsatadi.
const DOC_TYPES = [
  'passport',
  'driver_license',
  'vehicle_registration',
  'self_employed_certificate',
  'contract',
  'other',
  'selfie',
  'ip_certificate',
  'skill_certificate',
];
const OLD_DOC_TYPES = DOC_TYPES.slice(0, 6);

// Dalil trigger'i (№16, 15.09 tuzatilgan ko'rinishi) + yangi ustun. Jadval bo'yicha
// ICHMA-ICH IF — PL/pgSQL `AND` qisqa tutashmaydi (memory gotcha).
const evidenceFn = (withCourierApp) => `
  CREATE OR REPLACE FUNCTION forbid_evidence_change() RETURNS trigger AS $$
  BEGIN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION '% jadvalidagi yozuvni o''chirib bo''lmaydi (dalil)', TG_TABLE_NAME;
    END IF;

    IF TG_TABLE_NAME = 'offer_acceptances' THEN
      IF NEW.kind IS DISTINCT FROM OLD.kind OR
         NEW.version IS DISTINCT FROM OLD.version OR
         NEW.application_id IS DISTINCT FROM OLD.application_id OR
         ${withCourierApp ? 'NEW.courier_application_id IS DISTINCT FROM OLD.courier_application_id OR' : ''}
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
    END IF;

    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql`;

const COURIER_OFFER_URL = 'https://climavent-hamkor.vercel.app/oferta/kuryer';

module.exports = {
  async up(queryInterface) {
    const t = await queryInterface.sequelize.transaction();
    const q = (sql, replacements) => queryInterface.sequelize.query(sql, { transaction: t, replacements });
    try {
      // ================================================================ №40
      await q(`
        CREATE TABLE IF NOT EXISTS courier_events (
          id          BIGSERIAL PRIMARY KEY,
          courier_id  INTEGER NOT NULL REFERENCES couriers(id) ON DELETE CASCADE,
          event       VARCHAR(40) NOT NULL,
          actor_type  VARCHAR(12) NOT NULL,
          actor_id    INTEGER,
          actor_login VARCHAR(100),
          comment     VARCHAR(1000),
          created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        )`);
      await q(`CREATE INDEX IF NOT EXISTS courier_events_courier_idx ON courier_events (courier_id)`);

      await q(`ALTER TABLE stores ADD COLUMN IF NOT EXISTS lat NUMERIC(9,6)`);
      await q(`ALTER TABLE stores ADD COLUMN IF NOT EXISTS lng NUMERIC(9,6)`);

      await q(`ALTER TABLE courier_documents DROP CONSTRAINT IF EXISTS courier_documents_type_chk`);
      await q(`ALTER TABLE courier_documents ADD CONSTRAINT courier_documents_type_chk
                 CHECK (type IN (${DOC_TYPES.map((x) => `'${x}'`).join(', ')}))`);

      // Kuryer ofertasi (№26 da tur qo'shilgan, versiya e'lon qilinmagan edi).
      // Mavjud bo'lsa tegilmaydi.
      await q(
        `INSERT INTO offer_versions (kind, version, url, published_at, effective_at, is_current)
         SELECT 'courier', '1.0', :url, now(), now(), true
          WHERE NOT EXISTS (SELECT 1 FROM offer_versions WHERE kind = 'courier')`,
        { url: COURIER_OFFER_URL },
      );

      // ================================================================ №41
      await q(`ALTER TABLE couriers ADD COLUMN IF NOT EXISTS service_areas JSONB NOT NULL DEFAULT '[]'::jsonb`);

      await q(`
        CREATE TABLE IF NOT EXISTS courier_applications (
          id                 SERIAL PRIMARY KEY,
          status             VARCHAR(12) NOT NULL DEFAULT 'pending',
          full_name          VARCHAR(120) NOT NULL,
          phone              VARCHAR(13) NOT NULL,
          birth_date         DATE NOT NULL,
          skills             TEXT[] NOT NULL,
          regions            JSONB NOT NULL DEFAULT '[]'::jsonb,
          employment_type    VARCHAR(20) NOT NULL,
          tin                VARCHAR(14) NOT NULL,
          vehicle            JSONB,
          license_categories TEXT[] NOT NULL DEFAULT '{}',
          experience         VARCHAR(1000),
          comment            VARCHAR(1000),
          password_hash      TEXT NOT NULL,
          lang               VARCHAR(2),
          push_token         VARCHAR(512),
          push_platform      VARCHAR(10),
          public_token_hash  VARCHAR(64) NOT NULL UNIQUE,
          offer_version      TEXT NOT NULL,
          offer_accepted_at  TIMESTAMPTZ NOT NULL,
          offer_ip           TEXT,
          offer_user_agent   TEXT,
          info_request       VARCHAR(2000),
          missing_documents  TEXT[] NOT NULL DEFAULT '{}',
          reject_reason      VARCHAR(2000),
          admin_note         VARCHAR(2000),
          reviewed_by        INTEGER REFERENCES store_users(id) ON DELETE SET NULL,
          reviewed_by_login  VARCHAR(100),
          reviewed_at        TIMESTAMPTZ,
          courier_id         INTEGER REFERENCES couriers(id) ON DELETE SET NULL,
          store_user_id      INTEGER REFERENCES store_users(id) ON DELETE SET NULL,
          created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
          CONSTRAINT courier_applications_status_chk
            CHECK (status IN ('pending', 'needs_info', 'approved', 'rejected', 'withdrawn')),
          CONSTRAINT courier_applications_phone_chk CHECK (phone ~ '^\\+998[0-9]{9}$'),
          CONSTRAINT courier_applications_employment_chk CHECK (employment_type IN ('self_employed', 'ip')),
          CONSTRAINT courier_applications_tin_chk CHECK (tin ~ '^([0-9]{9}|[0-9]{14})$'),
          CONSTRAINT courier_applications_skills_chk CHECK (cardinality(skills) > 0),
          CONSTRAINT courier_applications_lang_chk CHECK (lang IS NULL OR lang IN ('uz', 'ru', 'en'))
        )`);
      // Bitta telefon — bitta ochiq (yoki tasdiqlangan) ariza. Poyga holatida ham.
      await q(`CREATE UNIQUE INDEX IF NOT EXISTS courier_applications_phone_active_uq
                 ON courier_applications (phone) WHERE status IN ('pending', 'needs_info', 'approved')`);
      await q(`CREATE INDEX IF NOT EXISTS courier_applications_status_idx ON courier_applications (status, created_at DESC)`);

      await q(`
        CREATE TABLE IF NOT EXISTS courier_application_documents (
          id                  SERIAL PRIMARY KEY,
          application_id      INTEGER REFERENCES courier_applications(id) ON DELETE CASCADE,
          type                VARCHAR(30) NOT NULL,
          storage             VARCHAR(10) NOT NULL DEFAULT 'db',
          file_key            VARCHAR(200) NOT NULL,
          original_name       TEXT NOT NULL,
          mime                VARCHAR(50) NOT NULL,
          size                INTEGER NOT NULL,
          courier_document_id INTEGER REFERENCES courier_documents(id) ON DELETE SET NULL,
          deleted_at          TIMESTAMPTZ,
          created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
          CONSTRAINT courier_application_documents_type_chk CHECK (type IN (
            'passport', 'selfie', 'driver_license', 'vehicle_registration',
            'self_employed_certificate', 'ip_certificate', 'skill_certificate'))
        )`);
      await q(`CREATE INDEX IF NOT EXISTS courier_application_documents_app_idx ON courier_application_documents (application_id)`);
      await q(`
        CREATE TABLE IF NOT EXISTS courier_application_document_blobs (
          document_id INTEGER PRIMARY KEY REFERENCES courier_application_documents(id) ON DELETE CASCADE,
          data        BYTEA NOT NULL
        )`);
      await q(`
        CREATE TABLE IF NOT EXISTS courier_application_events (
          id             BIGSERIAL PRIMARY KEY,
          application_id INTEGER NOT NULL REFERENCES courier_applications(id) ON DELETE CASCADE,
          type           VARCHAR(30) NOT NULL,
          actor_id       INTEGER REFERENCES store_users(id) ON DELETE SET NULL,
          actor_login    VARCHAR(100),
          message        VARCHAR(2000),
          created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
        )`);
      await q(`CREATE INDEX IF NOT EXISTS courier_application_events_app_idx ON courier_application_events (application_id)`);

      await q(`ALTER TABLE offer_acceptances ADD COLUMN IF NOT EXISTS courier_application_id INTEGER
                 REFERENCES courier_applications(id) ON DELETE RESTRICT`);
      await q(evidenceFn(true));
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
      await q(evidenceFn(false));
      await q(`ALTER TABLE offer_acceptances DISABLE TRIGGER offer_acceptances_immutable`);
      await q(`DELETE FROM offer_acceptances WHERE courier_application_id IS NOT NULL`);
      await q(`ALTER TABLE offer_acceptances ENABLE TRIGGER offer_acceptances_immutable`);
      await q(`ALTER TABLE offer_acceptances DROP COLUMN IF EXISTS courier_application_id`);
      await q(`DROP TABLE IF EXISTS courier_application_events`);
      await q(`DROP TABLE IF EXISTS courier_application_document_blobs`);
      await q(`DROP TABLE IF EXISTS courier_application_documents`);
      await q(`DROP TABLE IF EXISTS courier_applications`);
      await q(`ALTER TABLE couriers DROP COLUMN IF EXISTS service_areas`);
      await q(`DELETE FROM courier_document_blobs WHERE document_id IN
                 (SELECT id FROM courier_documents WHERE type IN ('selfie', 'ip_certificate', 'skill_certificate'))`);
      await q(`DELETE FROM courier_documents WHERE type IN ('selfie', 'ip_certificate', 'skill_certificate')`);
      await q(`ALTER TABLE courier_documents DROP CONSTRAINT IF EXISTS courier_documents_type_chk`);
      await q(`ALTER TABLE courier_documents ADD CONSTRAINT courier_documents_type_chk
                 CHECK (type IN (${OLD_DOC_TYPES.map((x) => `'${x}'`).join(', ')}))`);
      await q(`ALTER TABLE stores DROP COLUMN IF EXISTS lng`);
      await q(`ALTER TABLE stores DROP COLUMN IF EXISTS lat`);
      await q(`DROP TABLE IF EXISTS courier_events`);
      // Kuryer ofertasi QOLDIRILADI: unga qabul dalillari bog'langan bo'lishi mumkin.
      await t.commit();
    } catch (e) {
      await t.rollback();
      throw e;
    }
  },
};
