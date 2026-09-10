'use strict';

// Topshiriq №14 — uch narsa.
//
// 6-band: `products.is_active`. Hozir mahsulotni saytdan yashirishning
// yagona yo'li butun do'konni nofaol qilish edi. O'chirish esa noto'g'ri —
// buyurtmalar tarixi mahsulotga bog'langan.
//
// 3-band: `reviews.is_hidden`. Spam/haqorat sharhni O'CHIRISH o'rniga
// yashirish: xato bilan o'chirilgan sharhni qaytarib bo'lmaydi,
// yashirilganini esa istalgan payt qaytarish mumkin.
//
// 4-band: buyurtma holatlari qat'iy ro'yxatga ko'chiriladi.
//   Tolanmagan    -> new
//   Yetkazilyapti -> shipping
//   Done          -> done
// Yangi ro'yxat: new | paid | shipping | done | cancelled
//
// DIQQAT — DEPLOY TARTIBI: bu migratsiya buyurtma holatlarining
// QIYMATINI o'zgartiradi, sayt esa ularni solishtiradi
// ("Tolanmagan" bo'lsa to'lov tugmasi va h.k.). Shuning uchun AVVAL
// eski va yangi qiymatni ham tushunadigan frontend deploy qilinsin,
// KEYIN shu migratsiya ishga tushirilsin. Aks holda to'lov tugmasi
// vaqtincha yo'qoladi.
//
// DB darajasida CHECK constraint ATAYLAB qo'yilmadi: yagona yozuvchi —
// API, u yerda `@IsIn` bilan tekshiriladi va tushunarli 400 qaytadi.
// CHECK bo'lsa e'tibordan chetda qolgan yo'l 500 berardi.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('products', 'is_active', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    });

    await queryInterface.addColumn('reviews', 'is_hidden', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });

    // Ommaviy ro'yxatlar shu ikki ustun bo'yicha filtrlanadi.
    await queryInterface.addIndex('products', ['is_active'], {
      name: 'products_is_active_idx',
    });
    await queryInterface.addIndex('reviews', ['is_hidden'], {
      name: 'reviews_is_hidden_idx',
    });

    // Holatlarni ko'chiramiz. Ro'yxatda yo'q qiymat qolib ketmasligi
    // uchun oxirida tekshiramiz.
    await queryInterface.sequelize.query(`
      UPDATE orders SET status = CASE status
        WHEN 'Tolanmagan'    THEN 'new'
        WHEN 'Yetkazilyapti' THEN 'shipping'
        WHEN 'Done'          THEN 'done'
        ELSE status
      END
    `);

    const [qolgan] = await queryInterface.sequelize.query(`
      SELECT DISTINCT status FROM orders
      WHERE status NOT IN ('new','paid','shipping','done','cancelled')
    `);
    if (qolgan.length) {
      // Ko'chirilmagan qiymat qolsa — to'xtaymiz. Jimgina o'tkazib
      // yuborilsa, adminkadagi ro'yxat bilan baza mos kelmay qolardi.
      throw new Error(
        "Ro'yxatga tushmagan buyurtma holatlari qoldi: " +
          qolgan.map((r) => r.status).join(', '),
      );
    }
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      UPDATE orders SET status = CASE status
        WHEN 'new'      THEN 'Tolanmagan'
        WHEN 'shipping' THEN 'Yetkazilyapti'
        WHEN 'done'     THEN 'Done'
        ELSE status
      END
    `);
    await queryInterface.removeIndex('reviews', 'reviews_is_hidden_idx');
    await queryInterface.removeIndex('products', 'products_is_active_idx');
    await queryInterface.removeColumn('reviews', 'is_hidden');
    await queryInterface.removeColumn('products', 'is_active');
  },
};
