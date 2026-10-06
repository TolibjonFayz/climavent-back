'use strict';

// Banner — FAQAT RASM (2026-10-06).
//
// Bosh sahifa banneri endi tayyor rasm: matn, tugma va mahsulot dizaynerning
// o'zi chizgan rasm ichida. Matn rasmda bo'lgani uchun har til uchun alohida
// rasm (uz majburiy, ru/en bo'lmasa uz ko'rsatiladi) va telefon uchun
// ixtiyoriy alohida (tikroq) rasm:
//   image_desktop_uz/ru/en — 11:4 (masalan 1760×640)
//   image_mobile_uz/ru/en  — 4:3  (masalan 800×600), bo'lmasa desktop rasmi
//
// Eski maydonlar (title_*, text_*, img_url, product_id) endi IXTIYORIY:
// title_* rasmning `alt` matni sifatida qoladi. Eski backend/adminka bilan mos —
// faqat yangi ustunlar qo'shiladi va NOT NULL olib tashlanadi.

const COLS = ['image_desktop_uz', 'image_desktop_ru', 'image_desktop_en', 'image_mobile_uz', 'image_mobile_ru', 'image_mobile_en'];
const OPTIONAL = ['title_uz', 'title_ru', 'title_en', 'text_uz', 'text_ru', 'text_en', 'img_url', 'product_id'];

module.exports = {
  async up(queryInterface) {
    const t = await queryInterface.sequelize.transaction();
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction: t });
    try {
      for (const c of COLS) {
        await q(`ALTER TABLE banner ADD COLUMN IF NOT EXISTS ${c} VARCHAR(500)`);
      }
      for (const c of OPTIONAL) {
        await q(`ALTER TABLE banner ALTER COLUMN ${c} DROP NOT NULL`);
      }
      await t.commit();
    } catch (e) {
      await t.rollback();
      throw e;
    }
  },

  async down(queryInterface) {
    const t = await queryInterface.sequelize.transaction();
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction: t });
    try {
      for (const c of COLS) {
        await q(`ALTER TABLE banner DROP COLUMN IF EXISTS ${c}`);
      }
      // NOT NULL qaytarilmaydi: faqat-rasmli bannerlarda bu maydonlar bo'sh
      await t.commit();
    } catch (e) {
      await t.rollback();
      throw e;
    }
  },
};
