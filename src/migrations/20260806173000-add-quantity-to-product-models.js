module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('product_models', 'quantity', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
  },
  async down(queryInterface) {
    await queryInterface.removeColumn('product_models', 'quantity');
  },
};
