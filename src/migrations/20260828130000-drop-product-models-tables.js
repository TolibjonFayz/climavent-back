'use strict';

// product_models va product_model_info jadvallari o'chirilyapti.
// Kerakli ma'lumot (airflow_m3h, pressure_pa) allaqachon characteristics'ga
// ko'chirilgan (20260828120000 migratsiya). SAP nomlari product_model_inside'da,
// narx (USD) o'sha yerda. To'liq zaxira nusxa:
//   product_models_backup_2026-08-28.json (1482 qator)
//   product_model_info_backup_2026-08-28.json (9706 qator)
// FK: product_model_info.product_model_id -> product_models.id, shuning uchun
// avval product_model_info, keyin product_models o'chiriladi.
module.exports = {
  async up(queryInterface) {
    await queryInterface.dropTable('product_model_info');
    await queryInterface.dropTable('product_models');
  },

  // down faqat bo'sh sxemani qaytadan yaratadi. Ma'lumotni yuqoridagi
  // JSON backup fayllardan tiklash kerak.
  async down(queryInterface, Sequelize) {
    await queryInterface.createTable('product_models', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      name: { type: Sequelize.STRING, allowNull: false },
      price: { type: Sequelize.INTEGER, allowNull: true },
      product_id: { type: Sequelize.INTEGER, allowNull: false },
      sap_name: { type: Sequelize.STRING, allowNull: true },
      currency: {
        type: Sequelize.STRING,
        allowNull: true,
        defaultValue: 'UZS',
      },
      price_updated_at: { type: Sequelize.DATE, allowNull: true },
      price_valid_until: { type: Sequelize.DATE, allowNull: true },
      quantity: { type: Sequelize.INTEGER, allowNull: true },
      airflow_m3h: { type: Sequelize.INTEGER, allowNull: true },
      pressure_pa: { type: Sequelize.INTEGER, allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });

    await queryInterface.createTable('product_model_info', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      info: { type: Sequelize.STRING, allowNull: false },
      product_model_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'product_models', key: 'id' },
        onDelete: 'CASCADE',
      },
      product_model_header_id: { type: Sequelize.INTEGER, allowNull: false },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
  },
};
