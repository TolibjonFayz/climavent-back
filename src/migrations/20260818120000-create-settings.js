module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('settings', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      key: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true,
      },
      value: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      description: {
        type: Sequelize.STRING,
        allowNull: true,
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

    // Dollar kursi. Narxlar bazada USD da (product-model-inside.price),
    // saytda so'mga shu kurs bilan o'giriladi.
    await queryInterface.bulkInsert('settings', [
      {
        key: 'usd_rate',
        value: '12000',
        description: "Dollar kursi (1 USD necha so'm)",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
  },
  async down(queryInterface) {
    await queryInterface.dropTable('settings');
  },
};
