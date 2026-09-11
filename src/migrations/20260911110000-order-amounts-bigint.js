'use strict';

// Topshiriq №13, 4-band — buyurtma narxi va summasi BIGINT ga.
//
// NEGA KERAK: INTEGER chegarasi ~2.15 mlrd so'm. Katalogdagi JV-65 bitta
// dona 148 692 000 so'm — ya'ni 15 donalik buyurtma summasi sig'masdi va
// yozish "integer out of range" bilan 500 berardi. Summa endi serverda
// hisoblangani uchun (ilgari brauzer 0 yuborardi) bu haqiqiy xavfga
// aylandi.
//
// NEGA ALOHIDA FAYL VA DEPLOYDAN KEYIN: PostgreSQL BIGINT ni satr qilib
// qaytaradi. Yangi backend model getter'i orqali uni songa aylantiradi,
// ESKI backendda esa bunday getter yo'q — u `"148692000"` (satr)
// qaytarardi va adminkadagi qo'shish `+` satrlarni ulab yuborardi.
// Shuning uchun tartib: yangi backend deploy -> keyin shu migratsiya.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn('order-items', 'price', {
      type: Sequelize.BIGINT,
      allowNull: true,
    });
    await queryInterface.changeColumn('orders', 'totalAmount', {
      type: Sequelize.BIGINT,
      allowNull: true,
    });
  },

  // Toraytirish chegaradan oshgan qiymat bo'lsa YIQILADI — ataylab:
  // jimgina kesib yuborib summani buzgandan ko'ra to'xtagan yaxshi.
  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn('orders', 'totalAmount', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
    await queryInterface.changeColumn('order-items', 'price', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
  },
};
