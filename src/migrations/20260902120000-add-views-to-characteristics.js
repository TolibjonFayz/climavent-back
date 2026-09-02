'use strict';

// Har bir model (characteristic) necha marta TANLANGANINI sanaymiz.
// Faqat foydalanuvchi mahsulot sahifasida modelni O'ZI bosganda oshadi —
// sahifa ochilishida avto-tanlanadigan (eng arzon) model sanalmaydi,
// aks holda eng arzon model doim "eng ommabop" bo'lib ko'rinardi.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('characteristics', 'views', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('characteristics', 'views');
  },
};
