module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('otp', 'attempts', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });
  },
  async down(queryInterface) {
    await queryInterface.removeColumn('otp', 'attempts');
  },
};
