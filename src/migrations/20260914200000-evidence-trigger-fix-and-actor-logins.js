'use strict';

// №16 tekshiruvi (topshiriq №15 bilan kelgan) — arizaga qaror chiqargan
// superadminni o'chirib bo'lmasdi: DELETE /store-users/delete/:id -> 500.
//
// SABAB — FK emas (ular `ON DELETE SET NULL`), `forbid_evidence_change()`
// trigger'ining o'zi. PL/pgSQL `IF TG_TABLE_NAME = 'offer_acceptances' AND
// (NEW.kind ...)` ifodasini QISQA TUTASHUVSIZ hisoblaydi: `seller_application_events`
// qatorida `kind` yo'q -> "record new has no field kind". Ya'ni ikkala jadvalda
// HAR QANDAY UPDATE yiqilardi — shu jumladan hisob o'chganda FK bajaradigan
// `SET actor_id = NULL`. Tuzatish: jadval nomi bo'yicha ICHMA-ICH IF.
//
// Qo'shimcha: hisob o'chsa ham tarixda "kim" qolishi uchun login MATNI
// saqlanadi (`actor_login`, `reviewed_by_login`, `store_user_login`).
// Bog'lanish ustunlari (`actor_id` va h.k.) faqat NULL ga tushishi mumkin —
// boshqa hisobga "ko'chirib" qo'yish taqiqlangan.

const FIXED_FUNCTION = `
  CREATE OR REPLACE FUNCTION forbid_evidence_change() RETURNS trigger AS $$
  BEGIN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION '% jadvalidagi yozuvni o''chirib bo''lmaydi (dalil)', TG_TABLE_NAME;
    END IF;

    IF TG_TABLE_NAME = 'offer_acceptances' THEN
      IF NEW.kind IS DISTINCT FROM OLD.kind OR
         NEW.version IS DISTINCT FROM OLD.version OR
         NEW.application_id IS DISTINCT FROM OLD.application_id OR
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
  $$ LANGUAGE plpgsql;
`;

// Qaytarish uchun — №16 dagi asl (xatoli) ko'rinish
const ORIGINAL_FUNCTION = `
  CREATE OR REPLACE FUNCTION forbid_evidence_change() RETURNS trigger AS $$
  BEGIN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION '% jadvalidagi yozuvni o''chirib bo''lmaydi (dalil)', TG_TABLE_NAME;
    END IF;
    IF TG_TABLE_NAME = 'offer_acceptances' AND (
         NEW.kind IS DISTINCT FROM OLD.kind OR
         NEW.version IS DISTINCT FROM OLD.version OR
         NEW.application_id IS DISTINCT FROM OLD.application_id OR
         NEW.accepted_at IS DISTINCT FROM OLD.accepted_at OR
         NEW.ip IS DISTINCT FROM OLD.ip OR
         NEW.user_agent IS DISTINCT FROM OLD.user_agent) THEN
      RAISE EXCEPTION 'offer_acceptances yozuvini tahrirlab bo''lmaydi (dalil)';
    END IF;
    IF TG_TABLE_NAME = 'seller_application_events' AND (
         NEW.application_id IS DISTINCT FROM OLD.application_id OR
         NEW.type IS DISTINCT FROM OLD.type OR
         NEW.message IS DISTINCT FROM OLD.message OR
         NEW.created_at IS DISTINCT FROM OLD.created_at) THEN
      RAISE EXCEPTION 'seller_application_events yozuvini tahrirlab bo''lmaydi (tarix)';
    END IF;
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;
`;

module.exports = {
  async up(queryInterface) {
    const q = queryInterface.sequelize;
    // Trigger vaqtincha o'chiriladi — shuning uchun HAMMASI bitta tranzaksiyada:
    // yarmida yiqilsa trigger o'chiq holda qolib ketmaydi.
    await q.transaction(async (transaction) => {
      const o = { transaction };
      await q.query(`ALTER TABLE seller_application_events ADD COLUMN actor_login TEXT`, o);
      await q.query(`ALTER TABLE seller_applications ADD COLUMN reviewed_by_login TEXT`, o);
      await q.query(`ALTER TABLE seller_applications ADD COLUMN store_user_login TEXT`, o);
      await q.query(`ALTER TABLE store_events ADD COLUMN actor_login TEXT`, o);

      // Mavjud yozuvlarni to'ldirish (hozircha bog'langan hisoblardan)
      await q.query(`ALTER TABLE seller_application_events DISABLE TRIGGER seller_application_events_immutable`, o);
      await q.query(`
        UPDATE seller_application_events e SET actor_login = su.login
        FROM store_users su WHERE su.id = e.actor_id`, o);
      await q.query(`ALTER TABLE seller_application_events ENABLE TRIGGER seller_application_events_immutable`, o);
      await q.query(`
        UPDATE seller_applications a SET reviewed_by_login = su.login
        FROM store_users su WHERE su.id = a.reviewed_by`, o);
      await q.query(`
        UPDATE seller_applications a SET store_user_login = su.login
        FROM store_users su WHERE su.id = a.store_user_id`, o);
      await q.query(`
        UPDATE store_events e SET actor_login = su.login
        FROM store_users su WHERE su.id = e.actor_id`, o);

      await q.query(FIXED_FUNCTION, o);
    });
  },

  async down(queryInterface) {
    const q = queryInterface.sequelize;
    await q.transaction(async (transaction) => {
      const o = { transaction };
      await q.query(ORIGINAL_FUNCTION, o);
      await q.query(`ALTER TABLE store_events DROP COLUMN actor_login`, o);
      await q.query(`ALTER TABLE seller_applications DROP COLUMN store_user_login`, o);
      await q.query(`ALTER TABLE seller_applications DROP COLUMN reviewed_by_login`, o);
      await q.query(`ALTER TABLE seller_application_events DISABLE TRIGGER seller_application_events_immutable`, o);
      await q.query(`ALTER TABLE seller_application_events DROP COLUMN actor_login`, o);
      await q.query(`ALTER TABLE seller_application_events ENABLE TRIGGER seller_application_events_immutable`, o);
    });
  },
};
