module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('products', 'sold_count', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });
  },
  async down(queryInterface) {
    await queryInterface.removeColumn('products', 'sold_count');
  },
};
