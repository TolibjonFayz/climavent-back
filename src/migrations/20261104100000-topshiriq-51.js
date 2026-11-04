'use strict';

// Topshiriq №51 — katalog so'rovlari uchun FK indekslari.
//
// `products/all` endi har jadvalni bitta `WHERE <fk> IN (...)` so'rovi bilan
// o'qiydi (src/products/catalog-plain.ts). Bu FK ustunlarida umumiy indeks
// yo'q edi:
//   - characteristics.product_id — faqat qisman (`WHERE sale_price IS NOT NULL`);
//   - product_images.product_id, reviews.product_id — umuman yo'q.
// "product-model-inside".product_model_id — `product_model_inside_unique_variant`
// indeksining birinchi ustuni, alohida indeks shart emas.
// products.store_id — `products_store_id_idx` bor.
//
// Hozir jadvallar kichik (400 / 177 / 1 qator), lekin `products/one/:id` va
// mahsulot o'chirishdagi CASCADE ham shu indekslardan foydalanadi.
//
// Kod bu migratsiyaga BOG'LIQ EMAS — deploy tartibi muhim emas.
module.exports = {
  async up(queryInterface) {
    const q = (sql) => queryInterface.sequelize.query(sql);
    await q(`CREATE INDEX IF NOT EXISTS characteristics_product_id_idx ON characteristics (product_id)`);
    await q(`CREATE INDEX IF NOT EXISTS product_images_product_id_idx ON product_images (product_id)`);
    await q(`CREATE INDEX IF NOT EXISTS reviews_product_id_idx ON reviews (product_id)`);
  },

  async down(queryInterface) {
    const q = (sql) => queryInterface.sequelize.query(sql);
    await q(`DROP INDEX IF EXISTS reviews_product_id_idx`);
    await q(`DROP INDEX IF EXISTS product_images_product_id_idx`);
    await q(`DROP INDEX IF EXISTS characteristics_product_id_idx`);
  },
};
