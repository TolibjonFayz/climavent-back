'use strict';

// `characteristics.price` INTEGER edi, `product-model-inside.price` esa
// NUMERIC(10,2). Natijada bir xil ma'nodagi ikki maydon turlicha ishlardi:
// modelga 123.45 yuborilsa Postgres xato berardi va u BadInputFilter
// orqali tushunarsiz 400 ga aylanardi ("So'rovdagi parametr formati
// noto'g'ri" — qaysi maydon ekani aytilmasdi).
//
// Endi ikkalasi ham NUMERIC(10,2). Mavjud 302 ta butun son qiymati
// o'zgarmaydi (123 -> 123.00, ya'ni ayni qiymat).
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn('characteristics', 'price', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: false,
    });
  },

  async down(queryInterface, Sequelize) {
    // Qaytarishda o'nlik qism yaxlitlanadi — bu ma'lumot yo'qotishi,
    // shuning uchun ataylab ROUND bilan aniq yozilgan.
    await queryInterface.sequelize.query(`
      ALTER TABLE characteristics
      ALTER COLUMN price TYPE INTEGER USING ROUND(price)
    `);
  },
};
