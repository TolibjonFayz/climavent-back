module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('users', 'is_admin', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
  },
  async down(queryInterface) {
    await queryInterface.removeColumn('users', 'is_admin');
  },
};
