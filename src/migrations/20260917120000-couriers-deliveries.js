'use strict';

// Topshiriq №22 — kuryerlar va yetkazib berish.
//
//   couriers              — kuryer profili (hisob — store_users, role = 'courier')
//   orders.*              — qabul qiluvchi, manzil tafsiloti, koordinata
//   deliveries            — har do'kon uchun alohida yetkazish
//   delivery_events       — holat o'zgarishlari tarixi (faqat qo'shiladi)
//   delivery_proofs       — topshirish/muvaffaqiyatsizlik rasmi (R2 sozlanmagan bo'lsa)
//   courier_locations     — yo'l tarixi (faqat faol yetkazish paytida, 30 kun)
//   device_tokens         — push (FCM) tokenlari
//   store_refresh_tokens  — mobil ilova sessiyasi (60 kun, rotatsiya)
//   cash_handovers        — kuryerdan qabul qilingan naqd pul
const VEHICLES = ['foot', 'bike', 'car', 'van', 'truck'];
const STATUSES = ['pending', 'assigned', 'accepted', 'picked_up', 'on_the_way', 'delivered', 'failed', 'returned', 'cancelled'];
const FAILURES = ['client_unreachable', 'client_refused', 'wrong_address', 'damaged', 'other'];
const list = (a) => a.map((x) => `'${x}'`).join(', ');

module.exports = {
  async up(queryInterface, Sequelize) {
    const t = await queryInterface.sequelize.transaction();
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction: t });
    const now = { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') };
    try {
      // ---------------------------------------------------------------- couriers
      await queryInterface.createTable('couriers', {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
        store_user_id: { type: Sequelize.INTEGER, allowNull: false, unique: true, references: { model: 'store_users', key: 'id' }, onDelete: 'RESTRICT' },
        // NULL — platforma kuryeri
        store_id: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'stores', key: 'id' }, onDelete: 'RESTRICT' },
        full_name: { type: Sequelize.STRING(150), allowNull: false },
        phone: { type: Sequelize.STRING(13), allowNull: false, unique: true },
        vehicle_type: { type: Sequelize.STRING(10), allowNull: false, defaultValue: 'car' },
        is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        is_online: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        last_lat: { type: Sequelize.DECIMAL(9, 6), allowNull: true },
        last_lng: { type: Sequelize.DECIMAL(9, 6), allowNull: true },
        last_seen_at: { type: Sequelize.DATE, allowNull: true },
        cash_reminded_at: { type: Sequelize.DATE, allowNull: true },
        created_at: now,
        updated_at: now,
      }, { transaction: t });
      await q(`ALTER TABLE couriers ADD CONSTRAINT couriers_vehicle_chk CHECK (vehicle_type IN (${list(VEHICLES)}))`);
      await q(`ALTER TABLE couriers ADD CONSTRAINT couriers_phone_chk CHECK (phone ~ '^\\+998[0-9]{9}$')`);
      await queryInterface.addIndex('couriers', ['store_id', 'is_active'], { name: 'couriers_store_active', transaction: t });

      // ---------------------------------------------------------------- orders
      await queryInterface.addColumn('orders', 'recipient_name', { type: Sequelize.STRING(150), allowNull: true }, { transaction: t });
      await queryInterface.addColumn('orders', 'recipient_phone', { type: Sequelize.STRING(13), allowNull: true }, { transaction: t });
      await queryInterface.addColumn('orders', 'address_details', { type: Sequelize.STRING(500), allowNull: true }, { transaction: t });
      await queryInterface.addColumn('orders', 'lat', { type: Sequelize.DECIMAL(9, 6), allowNull: true }, { transaction: t });
      await queryInterface.addColumn('orders', 'lng', { type: Sequelize.DECIMAL(9, 6), allowNull: true }, { transaction: t });

      // ---------------------------------------------------------------- deliveries
      await queryInterface.createTable('deliveries', {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
        order_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'orders', key: 'id' }, onDelete: 'RESTRICT' },
        store_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'stores', key: 'id' }, onDelete: 'RESTRICT' },
        courier_id: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'couriers', key: 'id' }, onDelete: 'RESTRICT' },
        status: { type: Sequelize.STRING(15), allowNull: false, defaultValue: 'pending' },
        provider: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'own' },
        required_vehicle: { type: Sequelize.STRING(10), allowNull: false, defaultValue: 'car' },
        pickup_address: { type: Sequelize.STRING(500), allowNull: true },
        pickup_lat: { type: Sequelize.DECIMAL(9, 6), allowNull: true },
        pickup_lng: { type: Sequelize.DECIMAL(9, 6), allowNull: true },
        dropoff_address: { type: Sequelize.STRING(500), allowNull: true },
        dropoff_lat: { type: Sequelize.DECIMAL(9, 6), allowNull: true },
        dropoff_lng: { type: Sequelize.DECIMAL(9, 6), allowNull: true },
        dropoff_details: { type: Sequelize.STRING(500), allowNull: true },
        recipient_name: { type: Sequelize.STRING(150), allowNull: true },
        recipient_phone: { type: Sequelize.STRING(13), allowNull: true },
        window_from: { type: Sequelize.DATE, allowNull: true },
        window_to: { type: Sequelize.DATE, allowNull: true },
        items: { type: Sequelize.ARRAY(Sequelize.INTEGER), allowNull: false, defaultValue: [] },
        cod_amount: { type: Sequelize.BIGINT, allowNull: false, defaultValue: 0 },
        cash_collected: { type: Sequelize.BIGINT, allowNull: true },
        delivery_fee: { type: Sequelize.BIGINT, allowNull: true },
        proof_photo_url: { type: Sequelize.STRING(500), allowNull: true },
        proof_code_hash: { type: Sequelize.STRING(64), allowNull: true },
        proof_code_attempts: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        proof_comment: { type: Sequelize.STRING(1000), allowNull: true },
        failure_reason: { type: Sequelize.STRING(30), allowNull: true },
        failure_comment: { type: Sequelize.STRING(1000), allowNull: true },
        assigned_at: { type: Sequelize.DATE, allowNull: true },
        accepted_at: { type: Sequelize.DATE, allowNull: true },
        picked_up_at: { type: Sequelize.DATE, allowNull: true },
        on_the_way_at: { type: Sequelize.DATE, allowNull: true },
        delivered_at: { type: Sequelize.DATE, allowNull: true },
        failed_at: { type: Sequelize.DATE, allowNull: true },
        returned_at: { type: Sequelize.DATE, allowNull: true },
        cancelled_at: { type: Sequelize.DATE, allowNull: true },
        created_at: now,
        updated_at: now,
      }, { transaction: t });
      await q(`ALTER TABLE deliveries ADD CONSTRAINT deliveries_status_chk CHECK (status IN (${list(STATUSES)}))`);
      await q(`ALTER TABLE deliveries ADD CONSTRAINT deliveries_vehicle_chk CHECK (required_vehicle IN (${list(VEHICLES)}))`);
      await q(`ALTER TABLE deliveries ADD CONSTRAINT deliveries_provider_chk CHECK (provider IN ('own'))`);
      await q(`ALTER TABLE deliveries ADD CONSTRAINT deliveries_failure_chk CHECK (failure_reason IS NULL OR failure_reason IN (${list(FAILURES)}))`);
      await q(`ALTER TABLE deliveries ADD CONSTRAINT deliveries_cod_chk CHECK (cod_amount >= 0 AND (cash_collected IS NULL OR cash_collected >= 0))`);
      // Bitta buyurtma + do'kon uchun bir vaqtda faqat bitta "tirik" yetkazish
      await q(`CREATE UNIQUE INDEX deliveries_order_store_live ON deliveries (order_id, store_id)
               WHERE status NOT IN ('delivered', 'returned', 'cancelled')`);
      await queryInterface.addIndex('deliveries', ['courier_id', 'status'], { name: 'deliveries_courier_status', transaction: t });
      await queryInterface.addIndex('deliveries', ['store_id', 'created_at'], { name: 'deliveries_store_created', transaction: t });
      await queryInterface.addIndex('deliveries', ['order_id'], { name: 'deliveries_order', transaction: t });

      // ---------------------------------------------------------------- delivery_events
      await queryInterface.createTable('delivery_events', {
        id: { type: Sequelize.BIGINT, autoIncrement: true, primaryKey: true },
        delivery_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'deliveries', key: 'id' }, onDelete: 'RESTRICT' },
        from_status: { type: Sequelize.STRING(15), allowNull: true },
        to_status: { type: Sequelize.STRING(15), allowNull: false },
        actor_type: { type: Sequelize.STRING(12), allowNull: false },
        actor_id: { type: Sequelize.INTEGER, allowNull: true },
        lat: { type: Sequelize.DECIMAL(9, 6), allowNull: true },
        lng: { type: Sequelize.DECIMAL(9, 6), allowNull: true },
        comment: { type: Sequelize.STRING(1000), allowNull: true },
        created_at: now,
      }, { transaction: t });
      await q(`ALTER TABLE delivery_events ADD CONSTRAINT delivery_events_actor_chk CHECK (actor_type IN ('superadmin', 'store', 'courier', 'system'))`);
      await queryInterface.addIndex('delivery_events', ['delivery_id', 'id'], { name: 'delivery_events_delivery', transaction: t });

      // ---------------------------------------------------------------- delivery_proofs
      await queryInterface.createTable('delivery_proofs', {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
        delivery_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'deliveries', key: 'id' }, onDelete: 'CASCADE' },
        kind: { type: Sequelize.STRING(10), allowNull: false },
        storage: { type: Sequelize.STRING(10), allowNull: false, defaultValue: 'db' },
        file_key: { type: Sequelize.STRING(200), allowNull: true },
        mime: { type: Sequelize.STRING(50), allowNull: false },
        size: { type: Sequelize.INTEGER, allowNull: false },
        data: { type: Sequelize.BLOB, allowNull: true },
        created_at: now,
      }, { transaction: t });
      await q(`ALTER TABLE delivery_proofs ADD CONSTRAINT delivery_proofs_kind_chk CHECK (kind IN ('delivered', 'failed'))`);

      // ---------------------------------------------------------------- courier_locations
      await queryInterface.createTable('courier_locations', {
        id: { type: Sequelize.BIGINT, autoIncrement: true, primaryKey: true },
        courier_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'couriers', key: 'id' }, onDelete: 'CASCADE' },
        delivery_id: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'deliveries', key: 'id' }, onDelete: 'SET NULL' },
        lat: { type: Sequelize.DECIMAL(9, 6), allowNull: false },
        lng: { type: Sequelize.DECIMAL(9, 6), allowNull: false },
        accuracy: { type: Sequelize.FLOAT, allowNull: true },
        created_at: now,
      }, { transaction: t });
      await queryInterface.addIndex('courier_locations', ['courier_id', 'created_at'], { name: 'courier_locations_courier_created', transaction: t });
      await queryInterface.addIndex('courier_locations', ['created_at'], { name: 'courier_locations_created', transaction: t });

      // ---------------------------------------------------------------- device_tokens
      await queryInterface.createTable('device_tokens', {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
        owner_type: { type: Sequelize.STRING(12), allowNull: false },
        owner_id: { type: Sequelize.INTEGER, allowNull: false },
        platform: { type: Sequelize.STRING(10), allowNull: false },
        token: { type: Sequelize.STRING(512), allowNull: false, unique: true },
        last_used_at: now,
        created_at: now,
      }, { transaction: t });
      await q(`ALTER TABLE device_tokens ADD CONSTRAINT device_tokens_owner_chk CHECK (owner_type IN ('store_user', 'user'))`);
      await q(`ALTER TABLE device_tokens ADD CONSTRAINT device_tokens_platform_chk CHECK (platform IN ('ios', 'android', 'web'))`);
      await queryInterface.addIndex('device_tokens', ['owner_type', 'owner_id'], { name: 'device_tokens_owner', transaction: t });

      // ---------------------------------------------------------------- store_refresh_tokens
      await queryInterface.createTable('store_refresh_tokens', {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
        store_user_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'store_users', key: 'id' }, onDelete: 'CASCADE' },
        token_hash: { type: Sequelize.STRING(64), allowNull: false, unique: true },
        token_version: { type: Sequelize.INTEGER, allowNull: false },
        expires_at: { type: Sequelize.DATE, allowNull: false },
        revoked_at: { type: Sequelize.DATE, allowNull: true },
        replaced_by_id: { type: Sequelize.INTEGER, allowNull: true },
        ip: { type: Sequelize.STRING(64), allowNull: true },
        user_agent: { type: Sequelize.STRING(500), allowNull: true },
        created_at: now,
      }, { transaction: t });
      await queryInterface.addIndex('store_refresh_tokens', ['store_user_id'], { name: 'store_refresh_tokens_user', transaction: t });

      // ---------------------------------------------------------------- cash_handovers
      await queryInterface.createTable('cash_handovers', {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
        courier_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'couriers', key: 'id' }, onDelete: 'RESTRICT' },
        amount: { type: Sequelize.BIGINT, allowNull: false },
        comment: { type: Sequelize.STRING(500), allowNull: true },
        received_by_store_user_id: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'store_users', key: 'id' }, onDelete: 'SET NULL' },
        received_by_login: { type: Sequelize.STRING(100), allowNull: true },
        created_at: now,
      }, { transaction: t });
      await q(`ALTER TABLE cash_handovers ADD CONSTRAINT cash_handovers_amount_chk CHECK (amount > 0)`);
      await queryInterface.addIndex('cash_handovers', ['courier_id', 'created_at'], { name: 'cash_handovers_courier', transaction: t });

      await t.commit();
    } catch (e) {
      await t.rollback();
      throw e;
    }
  },

  async down(queryInterface) {
    const t = await queryInterface.sequelize.transaction();
    try {
      for (const table of ['cash_handovers', 'store_refresh_tokens', 'device_tokens', 'courier_locations', 'delivery_proofs', 'delivery_events', 'deliveries']) {
        await queryInterface.dropTable(table, { transaction: t });
      }
      for (const c of ['lng', 'lat', 'address_details', 'recipient_phone', 'recipient_name']) {
        await queryInterface.removeColumn('orders', c, { transaction: t });
      }
      await queryInterface.dropTable('couriers', { transaction: t });
      await t.commit();
    } catch (e) {
      await t.rollback();
      throw e;
    }
  },
};
