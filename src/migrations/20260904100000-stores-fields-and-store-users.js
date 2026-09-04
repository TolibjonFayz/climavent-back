'use strict';

// Topshiriq №10, 1 va 2-bandlar.
//  1) `stores` ga tavsif / logotip / aloqa maydonlari.
//  2) `store_users` — do'kon hisoblari ALOHIDA jadvalda.
//     `users` — xaridorlar jadvali (cart, likes, orders unga bog'langan),
//     do'kon adminini o'sha yerga qo'shish ikki xil narsani bir makonga
//     tiqish bo'lardi.
module.exports = {
  async up(queryInterface, Sequelize) {
    const text = { type: Sequelize.TEXT, allowNull: true };
    const str = { type: Sequelize.STRING, allowNull: true };

    for (const [col, def] of [
      ['description_uz', text],
      ['description_ru', text],
      ['description_en', text],
      ['logo_url', str],
      ['phone', str],
      ['email', str],
      ['address', str],
      ['telegram', str],
      ['website', str],
      ['color', { type: Sequelize.STRING(7), allowNull: true }],
      [
        'sort_order',
        { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      ],
    ]) {
      await queryInterface.addColumn('stores', col, def);
    }

    // slug sayt URL manzilida ishlatiladi — keyin o'zgartirish og'riqli,
    // shuning uchun format bazada ham qat'iy: kichik harf, a-z0-9-.
    await queryInterface.sequelize.query(`
      ALTER TABLE stores
        ADD CONSTRAINT stores_slug_format_chk
        CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE stores
        ADD CONSTRAINT stores_name_not_blank_chk
        CHECK (btrim(name) <> '')
    `);

    await queryInterface.createTable('store_users', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      // NULL = superadmin: barcha do'konlarni ko'radi va boshqaradi.
      store_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'stores', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      login: { type: Sequelize.STRING, allowNull: false, unique: true },
      // Ochiq parol HECH QACHON saqlanmaydi — faqat bcrypt hash.
      password_hash: { type: Sequelize.STRING, allowNull: false },
      full_name: { type: Sequelize.STRING, allowNull: true },
      role: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: 'store_admin',
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      last_login_at: { type: Sequelize.DATE, allowNull: true },
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

    await queryInterface.sequelize.query(`
      ALTER TABLE store_users
        ADD CONSTRAINT store_users_role_chk
        CHECK (role IN ('superadmin', 'store_admin'))
    `);
    // superadmin do'konga bog'lanmaydi, store_admin esa SHART bog'lansin —
    // aks holda "hech qaysi do'konga tegishli bo'lmagan admin" paydo bo'ladi.
    await queryInterface.sequelize.query(`
      ALTER TABLE store_users
        ADD CONSTRAINT store_users_store_role_chk
        CHECK (
          (role = 'superadmin' AND store_id IS NULL) OR
          (role = 'store_admin' AND store_id IS NOT NULL)
        )
    `);
    await queryInterface.addIndex('store_users', ['store_id'], {
      name: 'store_users_store_id_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('store_users');
    await queryInterface.sequelize.query(
      'ALTER TABLE stores DROP CONSTRAINT IF EXISTS stores_name_not_blank_chk',
    );
    await queryInterface.sequelize.query(
      'ALTER TABLE stores DROP CONSTRAINT IF EXISTS stores_slug_format_chk',
    );
    for (const col of [
      'sort_order',
      'color',
      'website',
      'telegram',
      'address',
      'email',
      'phone',
      'logo_url',
      'description_en',
      'description_ru',
      'description_uz',
    ]) {
      await queryInterface.removeColumn('stores', col);
    }
  },
};
