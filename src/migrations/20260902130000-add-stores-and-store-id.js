'use strict';

// Ko'p do'kon (multi-store) uchun asos.
// Hozirgacha do'kon `products.producer` matni orqali ajratilardi — bu
// vaqtinchalik konvensiya edi, haqiqiy izolyatsiya emas. Endi alohida
// `stores` jadvali va FK bor.
//
// Backfill: har bir noyob `producer` uchun do'kon yaratiladi va mahsulotlar
// o'shanga bog'lanadi. `producer` ustuni O'CHIRILMAYDI — mavjud kod va
// adminka hali undan foydalanadi (topshiriqda "ustun turlari va nomlari
// o'zgartirilmasin" deyilgan).
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('stores', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      name: { type: Sequelize.STRING, allowNull: false, unique: true },
      slug: { type: Sequelize.STRING, allowNull: false, unique: true },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('now'),
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('now'),
      },
    });

    // Mavjud producer'lardan do'konlar yasaymiz
    await queryInterface.sequelize.query(`
      INSERT INTO stores (name, slug, is_active, "createdAt", "updatedAt")
      SELECT DISTINCT
             producer,
             lower(regexp_replace(producer, '[^a-zA-Z0-9]+', '-', 'g')),
             true, now(), now()
      FROM   products
      WHERE  producer IS NOT NULL AND btrim(producer) <> ''
      ON CONFLICT (name) DO NOTHING
    `);

    // products.store_id
    await queryInterface.addColumn('products', 'store_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'stores', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });
    await queryInterface.sequelize.query(`
      UPDATE products p SET store_id = s.id
      FROM   stores s
      WHERE  s.name = p.producer AND p.store_id IS NULL
    `);
    await queryInterface.addIndex('products', ['store_id'], {
      name: 'products_store_id_idx',
    });

    // users.store_id — do'kon xodimi qaysi do'konga tegishli
    await queryInterface.addColumn('users', 'store_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'stores', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });

    // users.role — mavjud `is_admin` bekor qilinmaydi, u holicha qoladi.
    // Yangi maydon kengroq: 'customer' | 'store_admin' | 'admin'
    await queryInterface.addColumn('users', 'role', {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: 'customer',
    });
    await queryInterface.sequelize.query(`
      UPDATE users SET role = 'admin' WHERE is_admin = true
    `);
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('users', 'role');
    await queryInterface.removeColumn('users', 'store_id');
    await queryInterface.removeIndex('products', 'products_store_id_idx');
    await queryInterface.removeColumn('products', 'store_id');
    await queryInterface.dropTable('stores');
  },
};
