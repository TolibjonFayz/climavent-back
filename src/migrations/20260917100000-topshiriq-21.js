'use strict';

// Topshiriq №21.
//   1. `store_user_logins` — do'kon hisoblari kirish jurnali (2-band)
//   2. `orders.kind/comment/company_name/company_tin` — KP so'rovi (3-band)
const EVENTS = ['login_success', 'login_failed', 'password_changed', 'password_change_failed', 'password_set', 'logout'];

module.exports = {
  async up(queryInterface, Sequelize) {
    const t = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.createTable(
        'store_user_logins',
        {
          id: { type: Sequelize.BIGINT, autoIncrement: true, primaryKey: true },
          // Hisob o'chirilsa jurnal qoladi, bog'lanish NULL bo'ladi
          store_user_id: {
            type: Sequelize.INTEGER,
            allowNull: true,
            references: { model: 'store_users', key: 'id' },
            onDelete: 'SET NULL',
          },
          // Kiritilgan login (mavjud bo'lmasa ham). PAROL HECH QACHON yozilmaydi.
          login: { type: Sequelize.STRING(100), allowNull: true },
          event: { type: Sequelize.STRING(30), allowNull: false },
          ip: { type: Sequelize.STRING(64), allowNull: true },
          user_agent: { type: Sequelize.STRING(500), allowNull: true },
          created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        },
        { transaction: t },
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE store_user_logins ADD CONSTRAINT store_user_logins_event_chk CHECK (event IN (${EVENTS.map((e) => `'${e}'`).join(', ')}))`,
        { transaction: t },
      );
      await queryInterface.addIndex('store_user_logins', ['store_user_id', 'created_at'], { name: 'store_user_logins_user_created', transaction: t });
      await queryInterface.addIndex('store_user_logins', ['created_at'], { name: 'store_user_logins_created', transaction: t });

      await queryInterface.addColumn('orders', 'kind', { type: Sequelize.STRING(10), allowNull: false, defaultValue: 'order' }, { transaction: t });
      await queryInterface.sequelize.query(`ALTER TABLE orders ADD CONSTRAINT orders_kind_chk CHECK (kind IN ('order', 'quote'))`, { transaction: t });
      await queryInterface.addColumn('orders', 'comment', { type: Sequelize.TEXT, allowNull: true }, { transaction: t });
      await queryInterface.addColumn('orders', 'company_name', { type: Sequelize.STRING(255), allowNull: true }, { transaction: t });
      await queryInterface.addColumn('orders', 'company_tin', { type: Sequelize.STRING(9), allowNull: true }, { transaction: t });
      await queryInterface.addIndex('orders', ['kind', 'createdAt'], { name: 'orders_kind_created', transaction: t });
      await t.commit();
    } catch (e) {
      await t.rollback();
      throw e;
    }
  },

  async down(queryInterface) {
    const t = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.removeIndex('orders', 'orders_kind_created', { transaction: t });
      for (const c of ['company_tin', 'company_name', 'comment']) await queryInterface.removeColumn('orders', c, { transaction: t });
      await queryInterface.sequelize.query('ALTER TABLE orders DROP CONSTRAINT orders_kind_chk', { transaction: t });
      await queryInterface.removeColumn('orders', 'kind', { transaction: t });
      await queryInterface.dropTable('store_user_logins', { transaction: t });
      await t.commit();
    } catch (e) {
      await t.rollback();
      throw e;
    }
  },
};
