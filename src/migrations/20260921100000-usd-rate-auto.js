'use strict';

// Topshiriq №27 — dollar kursini avtomatik yangilash faqat YOQILGANDA.
//
// 17.09 da kunlik cron kursni 12 000 -> 11 797,46 qildi va saytdagi hamma
// so'm narxlari o'zgardi. Egasi kurs o'zidan-o'zi o'zgarmasligini so'radi,
// shuning uchun avtomatik yangilash endi galochkaga bog'liq.
//
// STANDART QIYMAT — `false`: migratsiyadan keyin cron JIM turadi.
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `INSERT INTO settings (key, value, description, "createdAt", "updatedAt")
       VALUES ('usd_rate_auto', 'false', 'Kursni har kuni avtomatik yangilash (topshiriq №27)', now(), now())
       ON CONFLICT (key) DO NOTHING`,
    );
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`DELETE FROM settings WHERE key = 'usd_rate_auto'`);
  },
};
