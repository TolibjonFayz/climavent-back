'use strict';

// Topshiriq №17, 3-band — o'chirilgan yoki nofaol hisob tokeni ishlashda davom etardi.
//
// Guard endi har so'rovda hisobni bazadan tekshiradi (bor, faol, rol). Bu ustun
// esa PAROL almashganda eski tokenlarni bekor qilish uchun: tokenga `tv`
// yoziladi, parol o'zgarsa hisoblagich oshadi va eski tokenlar 401 oladi.
// Mavjud tokenlarda `tv` yo'q — 0 deb hisoblanadi, ya'ni ular hozir buzilmaydi.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('store_users', 'token_version', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('store_users', 'token_version');
  },
};
