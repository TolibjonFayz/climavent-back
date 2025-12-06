'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('products', 'sizesJson', {
      type: Sequelize.JSONB,
      allowNull: false,
      defaultValue: {},
    });

    await queryInterface.addColumn('products', 'opisaniyaJson', {
      type: Sequelize.JSONB,
      allowNull: false,
      defaultValue: {},
    });

    await queryInterface.addColumn('products', 'naznacheniyaJson', {
      type: Sequelize.JSONB,
      allowNull: false,
      defaultValue: {},
    });

    await queryInterface.addColumn('products', 'markirovkaJson', {
      type: Sequelize.JSONB,
      allowNull: false,
      defaultValue: {},
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('products', 'sizesJson');
    await queryInterface.removeColumn('products', 'opisaniyaJson');
    await queryInterface.removeColumn('products', 'naznacheniyaJson');
    await queryInterface.removeColumn('products', 'markirovkaJson');
  },
};
