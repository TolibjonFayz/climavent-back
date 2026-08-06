module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('product_models', 'currency', {
      type: Sequelize.STRING,
      allowNull: true,
      defaultValue: 'UZS',
    });
    await queryInterface.addColumn('product_models', 'price_updated_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addColumn('product_models', 'price_valid_until', {
      type: Sequelize.DATE,
      allowNull: true,
    });
    // Narxi allaqachon bor 24 ta model uchun ham boshlang'ich vaqt belgilanadi
    await queryInterface.sequelize.query(`
      UPDATE product_models SET price_updated_at = now(), currency = 'UZS' WHERE price IS NOT NULL
    `);
  },
  async down(queryInterface) {
    await queryInterface.removeColumn('product_models', 'currency');
    await queryInterface.removeColumn('product_models', 'price_updated_at');
    await queryInterface.removeColumn('product_models', 'price_valid_until');
  },
};
