module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('product_models', 'airflow_m3h', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
    await queryInterface.addColumn('product_models', 'pressure_pa', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
  },
  async down(queryInterface) {
    await queryInterface.removeColumn('product_models', 'airflow_m3h');
    await queryInterface.removeColumn('product_models', 'pressure_pa');
  },
};
