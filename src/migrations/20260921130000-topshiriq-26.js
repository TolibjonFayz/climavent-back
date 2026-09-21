'use strict';

// Topshiriq №26 — kuryer ishini "ishlaydi"dan "professional"ga olib chiqish.
//
//   offer_versions.kind += 'courier'   kuryer ofertasi (1-band)
//   couriers.*                         bandlik turi, STIR, guvohnoma toifalari,
//                                      hujjat tasdig'i, faol transport, GPS yo'nalishi
//   courier_vehicles                   "Mening transportim" (1a-band)
//   courier_vehicle_events             transport holati tarixi
//   courier_documents (+ _blobs)       pasport, guvohnoma, texpasport (1-band)
//   delivery_proofs.kind               pickup | delivery | failure | signature (2-, 3-band)
//   deliveries.*                       olib ketish tekshiruvi, imzo, "yetib keldim",
//                                      qavat/lift/yuk ko'taruvchi, to'lov usuli (2–4, 7, 10-band)
//   courier_rates                      yetkazish tarifi (6-band)
//   courier_payouts                    kuryer bilan hisob-kitob (6-band)
//   courier_shifts                     smena (8-band)
//   delivery_incidents                 shikast/avariya/o'g'irlik (9-band)
//   characteristics / product-model-inside  og'irlik va o'lcham (7-band)
const VEHICLES = ['foot', 'bike', 'car', 'van', 'truck'];
const EMPLOYMENT = ['employee', 'self_employed', 'ip', 'contractor'];
const VEHICLE_STATUSES = ['pending', 'approved', 'rejected', 'archived'];
const VEHICLE_OWNERS = ['own', 'rented', 'company'];
const DOC_TYPES = [
  'passport',
  'driver_license',
  'vehicle_registration',
  'self_employed_certificate',
  'contract',
  'other',
];
const PROOF_KINDS = ['pickup', 'delivery', 'failure', 'signature', 'incident', 'delivered', 'failed'];
const PAYMENT_METHODS = ['cash', 'card_terminal', 'payme', 'click'];
const INCIDENT_TYPES = ['damage', 'accident', 'theft', 'other'];
const list = (a) => a.map((x) => `'${x}'`).join(', ');

module.exports = {
  async up(queryInterface, Sequelize) {
    const t = await queryInterface.sequelize.transaction();
    const q = (sql, replacements) =>
      queryInterface.sequelize.query(sql, { transaction: t, replacements });
    const add = (table, name, spec) => queryInterface.addColumn(table, name, spec, { transaction: t });
    const now = { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') };
    try {
      // ================================================ 1-band: kuryer ofertasi
      await q(`ALTER TABLE offer_versions DROP CONSTRAINT IF EXISTS offer_versions_kind_chk`);
      await q(
        `ALTER TABLE offer_versions ADD CONSTRAINT offer_versions_kind_chk
           CHECK (kind IN ('seller', 'buyer', 'privacy', 'courier'))`,
      );

      // ================================================ 1-band: kuryer maydonlari
      await add('couriers', 'employment_type', { type: Sequelize.STRING(20), allowNull: true });
      await add('couriers', 'tin', { type: Sequelize.STRING(14), allowNull: true });
      // Haydovchilik guvohnomasi toifalari: ['B', 'C']
      await add('couriers', 'license_categories', {
        type: Sequelize.ARRAY(Sequelize.STRING(3)),
        allowNull: false,
        defaultValue: [],
      });
      await add('couriers', 'documents_verified_at', { type: Sequelize.DATE, allowNull: true });
      await add('couriers', 'verified_by', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'store_users', key: 'id' },
        onDelete: 'SET NULL',
      });
      // 5-band: GPS'dan kelgan yo'nalish va tezlik (ikki nuqtadan hisoblashdan aniqroq)
      await add('couriers', 'last_heading', { type: Sequelize.SMALLINT, allowNull: true });
      await add('couriers', 'last_speed', { type: Sequelize.FLOAT, allowNull: true });
      await q(
        `ALTER TABLE couriers ADD CONSTRAINT couriers_employment_chk
           CHECK (employment_type IS NULL OR employment_type IN (${list(EMPLOYMENT)}))`,
      );

      // ================================================ 1a-band: courier_vehicles
      await queryInterface.createTable(
        'courier_vehicles',
        {
          id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
          courier_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'couriers', key: 'id' }, onDelete: 'CASCADE' },
          vehicle_type: { type: Sequelize.STRING(10), allowNull: false },
          // `foot` / `bike` da bo'sh bo'lishi mumkin
          plate: { type: Sequelize.STRING(20), allowNull: true },
          model: { type: Sequelize.STRING(100), allowNull: true },
          color: { type: Sequelize.STRING(30), allowNull: true },
          capacity_kg: { type: Sequelize.INTEGER, allowNull: true },
          capacity_m3: { type: Sequelize.DECIMAL(8, 3), allowNull: true },
          owner: { type: Sequelize.STRING(10), allowNull: false, defaultValue: 'own' },
          status: { type: Sequelize.STRING(10), allowNull: false, defaultValue: 'pending' },
          reject_reason: { type: Sequelize.STRING(500), allowNull: true },
          verified_by: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'store_users', key: 'id' }, onDelete: 'SET NULL' },
          verified_at: { type: Sequelize.DATE, allowNull: true },
          created_at: now,
          updated_at: now,
        },
        { transaction: t },
      );
      await q(`ALTER TABLE courier_vehicles ADD CONSTRAINT courier_vehicles_type_chk CHECK (vehicle_type IN (${list(VEHICLES)}))`);
      await q(`ALTER TABLE courier_vehicles ADD CONSTRAINT courier_vehicles_status_chk CHECK (status IN (${list(VEHICLE_STATUSES)}))`);
      await q(`ALTER TABLE courier_vehicles ADD CONSTRAINT courier_vehicles_owner_chk CHECK (owner IN (${list(VEHICLE_OWNERS)}))`);
      // Davlat raqami FAOL yozuvlar orasida takrorlanmasin (arxivdagilar tegmaydi)
      await q(`CREATE UNIQUE INDEX courier_vehicles_plate_live ON courier_vehicles (upper(plate))
                 WHERE plate IS NOT NULL AND status <> 'archived'`);
      await q(`CREATE INDEX courier_vehicles_courier ON courier_vehicles (courier_id, status)`);

      await add('couriers', 'active_vehicle_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'courier_vehicles', key: 'id' },
        onDelete: 'SET NULL',
      });

      await queryInterface.createTable(
        'courier_vehicle_events',
        {
          id: { type: Sequelize.BIGINT, autoIncrement: true, primaryKey: true },
          vehicle_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'courier_vehicles', key: 'id' }, onDelete: 'CASCADE' },
          courier_id: { type: Sequelize.INTEGER, allowNull: false },
          from_status: { type: Sequelize.STRING(10), allowNull: true },
          to_status: { type: Sequelize.STRING(10), allowNull: false },
          actor_type: { type: Sequelize.STRING(12), allowNull: false },
          actor_id: { type: Sequelize.INTEGER, allowNull: true },
          comment: { type: Sequelize.STRING(500), allowNull: true },
          created_at: now,
        },
        { transaction: t },
      );
      await q(`CREATE INDEX courier_vehicle_events_vehicle ON courier_vehicle_events (vehicle_id, id)`);

      // ---- Ko'chirish: har bir mavjud kuryerga hozirgi transporti bilan
      // bitta `approved` yozuv va uni faol qilish (1a-band).
      await q(`
        INSERT INTO courier_vehicles (courier_id, vehicle_type, owner, status, verified_at, created_at, updated_at)
        SELECT c.id, c.vehicle_type, 'own', 'approved', now(), now(), now() FROM couriers c
      `);
      await q(`
        UPDATE couriers c SET active_vehicle_id = v.id
          FROM courier_vehicles v WHERE v.courier_id = c.id AND c.active_vehicle_id IS NULL
      `);

      // ================================================ 1-band: kuryer hujjatlari
      // Sotuvchi hujjatlari bilan bir xil qoida (№16): baytlar BAZADA,
      // faylga faqat server imzolagan 5 daqiqalik havola orqali kiriladi.
      await queryInterface.createTable(
        'courier_documents',
        {
          id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
          courier_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'couriers', key: 'id' }, onDelete: 'CASCADE' },
          // Texpasport qaysi transportniki (1a-band)
          vehicle_id: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'courier_vehicles', key: 'id' }, onDelete: 'SET NULL' },
          type: { type: Sequelize.STRING(30), allowNull: false },
          storage: { type: Sequelize.STRING(10), allowNull: false, defaultValue: 'db' },
          file_key: { type: Sequelize.STRING(200), allowNull: false },
          original_name: { type: Sequelize.TEXT, allowNull: false },
          mime: { type: Sequelize.STRING(50), allowNull: false },
          size: { type: Sequelize.INTEGER, allowNull: false },
          // Pasport skani ishdan ketgandan 30 kun keyin o'chiriladi (№16 qoidasi)
          deleted_at: { type: Sequelize.DATE, allowNull: true },
          uploaded_by: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'store_users', key: 'id' }, onDelete: 'SET NULL' },
          created_at: now,
        },
        { transaction: t },
      );
      await q(`ALTER TABLE courier_documents ADD CONSTRAINT courier_documents_type_chk CHECK (type IN (${list(DOC_TYPES)}))`);
      await q(`CREATE INDEX courier_documents_courier ON courier_documents (courier_id, type)`);
      await queryInterface.createTable(
        'courier_document_blobs',
        {
          document_id: { type: Sequelize.INTEGER, allowNull: false, primaryKey: true, references: { model: 'courier_documents', key: 'id' }, onDelete: 'CASCADE' },
          data: { type: Sequelize.BLOB, allowNull: false },
        },
        { transaction: t },
      );

      // ================================================ 2-, 3-band: isbot rasmlari
      await q(`ALTER TABLE delivery_proofs DROP CONSTRAINT IF EXISTS delivery_proofs_kind_chk`);
      await q(`ALTER TABLE delivery_proofs ADD CONSTRAINT delivery_proofs_kind_chk CHECK (kind IN (${list(PROOF_KINDS)}))`);

      // ================================================ 2–4, 7, 10-band: deliveries
      await add('deliveries', 'items_checked', { type: Sequelize.ARRAY(Sequelize.INTEGER), allowNull: false, defaultValue: [] });
      await add('deliveries', 'pickup_comment', { type: Sequelize.STRING(1000), allowNull: true });
      await add('deliveries', 'received_by_name', { type: Sequelize.STRING(120), allowNull: true });
      await add('deliveries', 'arrived_at', { type: Sequelize.DATE, allowNull: true });
      await add('deliveries', 'call_attempts', { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 });
      await add('deliveries', 'last_call_at', { type: Sequelize.DATE, allowNull: true });
      await add('deliveries', 'loaders_needed', { type: Sequelize.SMALLINT, allowNull: false, defaultValue: 0 });
      await add('deliveries', 'floor', { type: Sequelize.SMALLINT, allowNull: true });
      await add('deliveries', 'has_elevator', { type: Sequelize.BOOLEAN, allowNull: true });
      await add('deliveries', 'total_weight_kg', { type: Sequelize.DECIMAL(10, 2), allowNull: true });
      await add('deliveries', 'total_volume_m3', { type: Sequelize.DECIMAL(10, 3), allowNull: true });
      await add('deliveries', 'payment_method', { type: Sequelize.STRING(15), allowNull: true });
      await add('deliveries', 'fiscal_receipt_url', { type: Sequelize.STRING(500), allowNull: true });
      await add('deliveries', 'fiscal_sign', { type: Sequelize.STRING(100), allowNull: true });
      await q(
        `ALTER TABLE deliveries ADD CONSTRAINT deliveries_payment_method_chk
           CHECK (payment_method IS NULL OR payment_method IN (${list(PAYMENT_METHODS)}))`,
      );

      // ================================================ 6-band: tariflar va hisob-kitob
      await queryInterface.createTable(
        'courier_rates',
        {
          id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
          // NULL — platforma tarifi (do'kon o'zinikini qo'ymagan bo'lsa shu ishlaydi)
          store_id: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'stores', key: 'id' }, onDelete: 'CASCADE' },
          vehicle_type: { type: Sequelize.STRING(10), allowNull: false },
          base_fee: { type: Sequelize.BIGINT, allowNull: false, defaultValue: 0 },
          per_km: { type: Sequelize.BIGINT, allowNull: false, defaultValue: 0 },
          floor_fee: { type: Sequelize.BIGINT, allowNull: false, defaultValue: 0 },
          wait_fee_per_15min: { type: Sequelize.BIGINT, allowNull: false, defaultValue: 0 },
          is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
          created_at: now,
          updated_at: now,
        },
        { transaction: t },
      );
      await q(`ALTER TABLE courier_rates ADD CONSTRAINT courier_rates_type_chk CHECK (vehicle_type IN (${list(VEHICLES)}))`);
      // Bitta do'kon + transport uchun bitta tarif (platforma tarifi — store_id IS NULL)
      await q(`CREATE UNIQUE INDEX courier_rates_store_type ON courier_rates (COALESCE(store_id, 0), vehicle_type)`);

      await queryInterface.createTable(
        'courier_payouts',
        {
          id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
          courier_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'couriers', key: 'id' }, onDelete: 'RESTRICT' },
          amount: { type: Sequelize.BIGINT, allowNull: false },
          period_from: { type: Sequelize.DATEONLY, allowNull: true },
          period_to: { type: Sequelize.DATEONLY, allowNull: true },
          comment: { type: Sequelize.STRING(500), allowNull: true },
          paid_by: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'store_users', key: 'id' }, onDelete: 'SET NULL' },
          paid_by_login: { type: Sequelize.STRING(100), allowNull: true },
          created_at: now,
        },
        { transaction: t },
      );
      await q(`CREATE INDEX courier_payouts_courier ON courier_payouts (courier_id, created_at)`);

      // ================================================ 8-band: smena
      await queryInterface.createTable(
        'courier_shifts',
        {
          id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
          courier_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'couriers', key: 'id' }, onDelete: 'CASCADE' },
          vehicle_id: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'courier_vehicles', key: 'id' }, onDelete: 'SET NULL' },
          started_at: now,
          start_lat: { type: Sequelize.DECIMAL(9, 6), allowNull: true },
          start_lng: { type: Sequelize.DECIMAL(9, 6), allowNull: true },
          ended_at: { type: Sequelize.DATE, allowNull: true },
          end_lat: { type: Sequelize.DECIMAL(9, 6), allowNull: true },
          end_lng: { type: Sequelize.DECIMAL(9, 6), allowNull: true },
        },
        { transaction: t },
      );
      // Bitta kuryerda bir vaqtda faqat bitta OCHIQ smena
      await q(`CREATE UNIQUE INDEX courier_shifts_open ON courier_shifts (courier_id) WHERE ended_at IS NULL`);
      await q(`CREATE INDEX courier_shifts_courier ON courier_shifts (courier_id, started_at)`);

      // ================================================ 9-band: hodisalar
      await queryInterface.createTable(
        'delivery_incidents',
        {
          id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
          delivery_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'deliveries', key: 'id' }, onDelete: 'CASCADE' },
          courier_id: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'couriers', key: 'id' }, onDelete: 'SET NULL' },
          type: { type: Sequelize.STRING(10), allowNull: false },
          comment: { type: Sequelize.STRING(2000), allowNull: true },
          proof_ids: { type: Sequelize.ARRAY(Sequelize.INTEGER), allowNull: false, defaultValue: [] },
          created_at: now,
        },
        { transaction: t },
      );
      await q(`ALTER TABLE delivery_incidents ADD CONSTRAINT delivery_incidents_type_chk CHECK (type IN (${list(INCIDENT_TYPES)}))`);
      await q(`CREATE INDEX delivery_incidents_delivery ON delivery_incidents (delivery_id, id)`);

      // ================================================ 7-band: og'irlik va o'lcham
      // Katalogning yagona manbai — `characteristics` (model) va
      // `product-model-inside` (SAP varianti). Variantda qiymat bo'lsa u
      // ustunroq, bo'lmasa modelniki olinadi.
      for (const table of ['characteristics', '"product-model-inside"']) {
        await q(`ALTER TABLE ${table}
                   ADD COLUMN IF NOT EXISTS weight_kg NUMERIC(10,2),
                   ADD COLUMN IF NOT EXISTS length_cm INTEGER,
                   ADD COLUMN IF NOT EXISTS width_cm INTEGER,
                   ADD COLUMN IF NOT EXISTS height_cm INTEGER`);
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
      for (const table of ['characteristics', '"product-model-inside"']) {
        await q(`ALTER TABLE ${table}
                   DROP COLUMN IF EXISTS weight_kg,
                   DROP COLUMN IF EXISTS length_cm,
                   DROP COLUMN IF EXISTS width_cm,
                   DROP COLUMN IF EXISTS height_cm`);
      }
      await queryInterface.dropTable('delivery_incidents', { transaction: t });
      await queryInterface.dropTable('courier_shifts', { transaction: t });
      await queryInterface.dropTable('courier_payouts', { transaction: t });
      await queryInterface.dropTable('courier_rates', { transaction: t });
      await q(`ALTER TABLE deliveries DROP CONSTRAINT IF EXISTS deliveries_payment_method_chk`);
      for (const c of [
        'fiscal_sign', 'fiscal_receipt_url', 'payment_method', 'total_volume_m3', 'total_weight_kg',
        'has_elevator', 'floor', 'loaders_needed', 'last_call_at', 'call_attempts', 'arrived_at',
        'received_by_name', 'pickup_comment', 'items_checked',
      ]) {
        await queryInterface.removeColumn('deliveries', c, { transaction: t });
      }
      await q(`ALTER TABLE delivery_proofs DROP CONSTRAINT IF EXISTS delivery_proofs_kind_chk`);
      await q(`ALTER TABLE delivery_proofs ADD CONSTRAINT delivery_proofs_kind_chk CHECK (kind IN ('delivered', 'failed'))`);
      await queryInterface.dropTable('courier_document_blobs', { transaction: t });
      await queryInterface.dropTable('courier_documents', { transaction: t });
      await q(`ALTER TABLE couriers DROP COLUMN IF EXISTS active_vehicle_id`);
      await queryInterface.dropTable('courier_vehicle_events', { transaction: t });
      await queryInterface.dropTable('courier_vehicles', { transaction: t });
      await q(`ALTER TABLE couriers DROP CONSTRAINT IF EXISTS couriers_employment_chk`);
      for (const c of [
        'last_speed', 'last_heading', 'verified_by', 'documents_verified_at',
        'license_categories', 'tin', 'employment_type',
      ]) {
        await queryInterface.removeColumn('couriers', c, { transaction: t });
      }
      await q(`ALTER TABLE offer_versions DROP CONSTRAINT IF EXISTS offer_versions_kind_chk`);
      await q(`ALTER TABLE offer_versions ADD CONSTRAINT offer_versions_kind_chk CHECK (kind IN ('seller','buyer','privacy'))`);
      await t.commit();
    } catch (e) {
      await t.rollback();
      throw e;
    }
  },
};
