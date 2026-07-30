module.exports = {
  async up(queryInterface) {
    await queryInterface.removeColumn('products', 'price');
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.addColumn('products', 'price', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
  },
};
