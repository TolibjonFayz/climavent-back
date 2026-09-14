'use strict';

// Topshiriq №16 — sotuvchi o'zi ariza topshirishi.
//
// Jadvallar:
//   offer_versions                 oferta versiyalari
//   offer_acceptances              qabul qilinganining DALILI (faqat INSERT)
//   seller_applications            arizalar
//   seller_application_events      tarix (faqat INSERT)
//   seller_application_documents   hujjat metama'lumoti
//   seller_application_document_blobs  hujjat BAYTLARI (yopiq)
//   store_requisites               do'konning YOPIQ rekvizitlari
//   store_events                   do'kon bank rekvizitlari o'zgarishi tarixi
//
// NEGA REKVIZITLAR ALOHIDA JADVALDA (topshiriqda "stores ga ustun"):
// kod bazasida `include: { all: true }` 32 joyda bor va `Product`, `User`,
// `StoreUser` modellari `Store` ni TO'LIQ yuklaydi. Bank hisob raqami
// `stores` ga qo'shilsa, u `products/all` kabi OCHIQ javoblarga sizib
// chiqardi. Alohida jadvalga hech bir model avtomatik bog'lanmaydi —
// sizib chiqish tuzilishning o'zi bilan imkonsiz. Ochiq bo'lishi kerak
// bo'lgan ikkitasi (`legal_name`, `tin`) esa `stores` da.
//
// NEGA HUJJATLAR BAZADA (topshiriqda "masalan R2 private bucket"):
// hozirgi R2 bucket OMMAVIY (`R2_PUBLIC_URL`) — undagi har bir obyekt
// havola orqali ochiladi. Yopiq bucket Cloudflare'da alohida yaratilishi
// kerak. Baza esa tabiatan yopiq: fayl faqat server imzolagan 5 daqiqalik
// havola orqali beriladi. Hajm cheklangan (fayl ≤ 10 MB, pasportlar 30
// kundan keyin o'chiriladi, bog'lanmagan yuklamalar 24 soatda).
module.exports = {
  async up(queryInterface, Sequelize) {
    const { INTEGER, TEXT, BOOLEAN, DATE, DATEONLY, BLOB } = Sequelize;
    const now = { type: DATE, allowNull: false, defaultValue: Sequelize.fn('now') };

    // ------------------------------------------------------------ oferta
    await queryInterface.createTable('offer_versions', {
      id: { type: INTEGER, autoIncrement: true, primaryKey: true },
      kind: { type: TEXT, allowNull: false },
      version: { type: TEXT, allowNull: false },
      url: { type: TEXT, allowNull: false },
      published_at: now,
      effective_at: { type: DATE, allowNull: false },
      is_current: { type: BOOLEAN, allowNull: false, defaultValue: false },
      created_at: now,
      updated_at: now,
    });
    await queryInterface.sequelize.query(`
      ALTER TABLE offer_versions
        ADD CONSTRAINT offer_versions_kind_chk CHECK (kind IN ('seller','buyer','privacy')),
        ADD CONSTRAINT offer_versions_kind_version_uq UNIQUE (kind, version);
      -- Har bir tur uchun FAQAT BITTA joriy versiya
      CREATE UNIQUE INDEX offer_versions_one_current_idx
        ON offer_versions (kind) WHERE is_current;
    `);

    // ---------------------------------------------------------- arizalar
    await queryInterface.createTable('seller_applications', {
      id: { type: INTEGER, autoIncrement: true, primaryKey: true },
      status: { type: TEXT, allowNull: false, defaultValue: 'pending' },
      legal_form: { type: TEXT, allowNull: false },
      legal_name: { type: TEXT, allowNull: false },
      tin: { type: TEXT, allowNull: false },
      registered_at: { type: DATEONLY, allowNull: true },
      legal_address: { type: TEXT, allowNull: false },
      director_name: { type: TEXT, allowNull: false },
      director_position: { type: TEXT, allowNull: true },
      bank_name: { type: TEXT, allowNull: false },
      bank_account: { type: TEXT, allowNull: false },
      bank_mfo: { type: TEXT, allowNull: false },
      vat_payer: { type: BOOLEAN, allowNull: false, defaultValue: false },
      vat_code: { type: TEXT, allowNull: true },
      contact_name: { type: TEXT, allowNull: false },
      contact_phone: { type: TEXT, allowNull: false },
      contact_email: { type: TEXT, allowNull: false },
      store_name: { type: TEXT, allowNull: false },
      business_type: { type: TEXT, allowNull: false },
      categories: { type: TEXT, allowNull: false },
      brands: { type: TEXT, allowNull: true },
      warehouse_address: { type: TEXT, allowNull: true },
      delivery_regions: { type: TEXT, allowNull: true },
      comment: { type: TEXT, allowNull: true },
      offer_version: { type: TEXT, allowNull: false },
      offer_accepted_at: { type: DATE, allowNull: false },
      offer_ip: { type: TEXT, allowNull: true },
      offer_user_agent: { type: TEXT, allowNull: true },
      // Holat sahifasi tokenining SHA-256 xeshi. Tokenning o'zi faqat
      // javobda BIR MARTA qaytadi: baza sizib chiqsa ham undan foydalanib
      // arizani (bank rekvizitlarini!) o'zgartirib bo'lmaydi.
      public_token_hash: { type: TEXT, allowNull: false, unique: true },
      info_request: { type: TEXT, allowNull: true },
      reject_reason: { type: TEXT, allowNull: true },
      admin_note: { type: TEXT, allowNull: true },
      reviewed_by: {
        type: INTEGER,
        allowNull: true,
        references: { model: 'store_users', key: 'id' },
        onDelete: 'SET NULL',
      },
      reviewed_at: { type: DATE, allowNull: true },
      store_id: {
        type: INTEGER,
        allowNull: true,
        references: { model: 'stores', key: 'id' },
        onDelete: 'SET NULL',
      },
      store_user_id: {
        type: INTEGER,
        allowNull: true,
        references: { model: 'store_users', key: 'id' },
        onDelete: 'SET NULL',
      },
      created_at: now,
      updated_at: now,
    });
    await queryInterface.sequelize.query(`
      ALTER TABLE seller_applications
        ADD CONSTRAINT seller_applications_status_chk
          CHECK (status IN ('pending','needs_info','approved','rejected')),
        ADD CONSTRAINT seller_applications_legal_form_chk
          CHECK (legal_form IN ('llc','jsc','other_legal_entity','sole_proprietor')),
        ADD CONSTRAINT seller_applications_business_type_chk
          CHECK (business_type IN ('manufacturer','distributor','dealer','reseller'));
      -- Bitta STIR bilan faqat BITTA "tirik" ariza. Ikki so'rov bir vaqtda
      -- kelsa ham ikkinchisi bazaning o'zida to'xtaydi (409).
      CREATE UNIQUE INDEX seller_applications_active_tin_uq
        ON seller_applications (tin)
        WHERE status IN ('pending','needs_info','approved');
      CREATE INDEX seller_applications_status_idx
        ON seller_applications (status, created_at);
    `);

    // ------------------------------------------------------------- tarix
    await queryInterface.createTable('seller_application_events', {
      id: { type: INTEGER, autoIncrement: true, primaryKey: true },
      application_id: {
        type: INTEGER,
        allowNull: false,
        references: { model: 'seller_applications', key: 'id' },
        onDelete: 'RESTRICT',
      },
      type: { type: TEXT, allowNull: false },
      actor_id: {
        type: INTEGER,
        allowNull: true,
        references: { model: 'store_users', key: 'id' },
        onDelete: 'SET NULL',
      },
      message: { type: TEXT, allowNull: true },
      created_at: now,
    });
    await queryInterface.sequelize.query(`
      ALTER TABLE seller_application_events
        ADD CONSTRAINT seller_application_events_type_chk
          CHECK (type IN ('created','info_requested','resubmitted','approved',
                          'rejected','note','documents_purged'));
      CREATE INDEX seller_application_events_app_idx
        ON seller_application_events (application_id, created_at);
    `);

    // ---------------------------------------------------------- hujjatlar
    await queryInterface.createTable('seller_application_documents', {
      id: { type: INTEGER, autoIncrement: true, primaryKey: true },
      application_id: {
        type: INTEGER,
        allowNull: true, // yuklash paytida hali ariza yo'q
        references: { model: 'seller_applications', key: 'id' },
        onDelete: 'CASCADE',
      },
      type: { type: TEXT, allowNull: false },
      file_key: { type: TEXT, allowNull: false, unique: true },
      original_name: { type: TEXT, allowNull: false },
      mime: { type: TEXT, allowNull: false },
      size: { type: INTEGER, allowNull: false },
      created_at: now,
      deleted_at: { type: DATE, allowNull: true },
    });
    await queryInterface.sequelize.query(`
      ALTER TABLE seller_application_documents
        ADD CONSTRAINT seller_application_documents_type_chk
          CHECK (type IN ('registration_certificate','director_appointment','passport',
                          'power_of_attorney','dealer_authorization','certificate','other')),
        ADD CONSTRAINT seller_application_documents_mime_chk
          CHECK (mime IN ('application/pdf','image/jpeg','image/png')),
        ADD CONSTRAINT seller_application_documents_size_chk
          CHECK (size > 0 AND size <= 10485760);
      CREATE INDEX seller_application_documents_app_idx
        ON seller_application_documents (application_id);
      -- Bog'lanmagan yuklamalarni tozalash so'rovi uchun
      CREATE INDEX seller_application_documents_orphan_idx
        ON seller_application_documents (created_at) WHERE application_id IS NULL;
    `);

    // Baytlar ALOHIDA jadvalda: hujjatlar ro'yxatini o'qish hech qachon
    // megabaytlarni xotiraga tortmaydi, o'chirish esa bitta DELETE.
    await queryInterface.createTable('seller_application_document_blobs', {
      document_id: {
        type: INTEGER,
        primaryKey: true,
        references: { model: 'seller_application_documents', key: 'id' },
        onDelete: 'CASCADE',
      },
      data: { type: BLOB, allowNull: false },
    });

    // --------------------------------------------------- oferta dalili
    await queryInterface.createTable('offer_acceptances', {
      id: { type: INTEGER, autoIncrement: true, primaryKey: true },
      kind: { type: TEXT, allowNull: false },
      version: { type: TEXT, allowNull: false },
      application_id: {
        type: INTEGER,
        allowNull: true,
        references: { model: 'seller_applications', key: 'id' },
        onDelete: 'RESTRICT',
      },
      store_id: {
        type: INTEGER,
        allowNull: true,
        references: { model: 'stores', key: 'id' },
        onDelete: 'SET NULL',
      },
      store_user_id: {
        type: INTEGER,
        allowNull: true,
        references: { model: 'store_users', key: 'id' },
        onDelete: 'SET NULL',
      },
      user_id: {
        type: INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
      },
      accepted_at: now,
      ip: { type: TEXT, allowNull: true },
      user_agent: { type: TEXT, allowNull: true },
    });

    // Dalil O'CHIRILMAYDI va TAHRIRLANMAYDI (oferta, 3.6-band) — buni
    // ilova kodiga emas, BAZAGA topshiramiz: xato skript yoki qo'lda
    // yozilgan SQL ham uni o'zgartira olmaydi. `SET NULL` FK amallari
    // (bog'langan do'kon o'chirilsa) istisno — ular dalilning mazmunini
    // (tur, versiya, vaqt, IP) o'zgartirmaydi.
    //
    // Tarix jadvali (seller_application_events) ham shunday himoyalanadi.
    await queryInterface.sequelize.query(`
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

      CREATE TRIGGER offer_acceptances_immutable
        BEFORE UPDATE OR DELETE ON offer_acceptances
        FOR EACH ROW EXECUTE FUNCTION forbid_evidence_change();
      CREATE TRIGGER seller_application_events_immutable
        BEFORE UPDATE OR DELETE ON seller_application_events
        FOR EACH ROW EXECUTE FUNCTION forbid_evidence_change();
    `);

    // ------------------------------------------------ do'kon rekvizitlari
    // Ochiq: yuridik nom va STIR (elektron tijorat talabi bo'lishi mumkin).
    await queryInterface.addColumn('stores', 'legal_name', { type: TEXT, allowNull: true });
    await queryInterface.addColumn('stores', 'tin', { type: TEXT, allowNull: true });
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX stores_tin_uq ON stores (tin) WHERE tin IS NOT NULL;
    `);

    await queryInterface.createTable('store_requisites', {
      store_id: {
        type: INTEGER,
        primaryKey: true,
        references: { model: 'stores', key: 'id' },
        onDelete: 'CASCADE',
      },
      legal_form: { type: TEXT, allowNull: true },
      legal_address: { type: TEXT, allowNull: true },
      director_name: { type: TEXT, allowNull: true },
      bank_name: { type: TEXT, allowNull: true },
      bank_account: { type: TEXT, allowNull: true },
      bank_mfo: { type: TEXT, allowNull: true },
      vat_payer: { type: BOOLEAN, allowNull: true },
      vat_code: { type: TEXT, allowNull: true },
      business_type: { type: TEXT, allowNull: true },
      application_id: {
        type: INTEGER,
        allowNull: true,
        references: { model: 'seller_applications', key: 'id' },
        onDelete: 'SET NULL',
      },
      created_at: now,
      updated_at: now,
    });

    await queryInterface.createTable('store_events', {
      id: { type: INTEGER, autoIncrement: true, primaryKey: true },
      store_id: {
        type: INTEGER,
        allowNull: false,
        references: { model: 'stores', key: 'id' },
        onDelete: 'CASCADE',
      },
      type: { type: TEXT, allowNull: false },
      actor_id: {
        type: INTEGER,
        allowNull: true,
        references: { model: 'store_users', key: 'id' },
        onDelete: 'SET NULL',
      },
      message: { type: TEXT, allowNull: true },
      created_at: now,
    });

    // ------------------------------------------- parolsiz hisob va token
    // Tasdiqlangan sotuvchining hisobi PAROLSIZ ochiladi — parolni u o'zi
    // bir martalik havola orqali o'rnatadi. Parolsiz hisob bilan kirib
    // bo'lmaydi (login buni alohida tekshiradi).
    await queryInterface.changeColumn('store_users', 'password_hash', {
      type: Sequelize.STRING,
      allowNull: true,
    });
    await queryInterface.addColumn('store_users', 'password_setup_token_hash', {
      type: TEXT,
      allowNull: true,
      unique: true,
    });
    await queryInterface.addColumn('store_users', 'password_setup_expires_at', {
      type: DATE,
      allowNull: true,
    });

    // ------------------------------------------ joriy sotuvchi ofertasi
    // Sayt formasi `offer_version` ni shu bilan solishtiradi. Versiya va
    // sanani huquqshunos tasdiqlagach yangilash kerak.
    await queryInterface.sequelize.query(`
      INSERT INTO offer_versions (kind, version, url, published_at, effective_at, is_current)
      VALUES ('seller', '1.0', 'https://climavent.uz/oferta/sotuvchi', now(), now(), true);
    `);
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('store_users', 'password_setup_expires_at');
    await queryInterface.removeColumn('store_users', 'password_setup_token_hash');
    await queryInterface.sequelize.query(
      `DELETE FROM store_users WHERE password_hash IS NULL`,
    );
    await queryInterface.changeColumn('store_users', 'password_hash', {
      type: 'VARCHAR(255)',
      allowNull: false,
    });
    await queryInterface.dropTable('store_events');
    await queryInterface.dropTable('store_requisites');
    await queryInterface.sequelize.query(`DROP INDEX IF EXISTS stores_tin_uq`);
    await queryInterface.removeColumn('stores', 'tin');
    await queryInterface.removeColumn('stores', 'legal_name');
    await queryInterface.dropTable('offer_acceptances');
    await queryInterface.dropTable('seller_application_document_blobs');
    await queryInterface.dropTable('seller_application_documents');
    await queryInterface.dropTable('seller_application_events');
    await queryInterface.dropTable('seller_applications');
    await queryInterface.dropTable('offer_versions');
    await queryInterface.sequelize.query(`DROP FUNCTION IF EXISTS forbid_evidence_change()`);
  },
};
