'use strict';

// Topshiriq №11, 2- va 3-bandlar.
//
// 2-band — mahsulot darajasidagi uchta hisoblagich. `views` va
// `sold_count` allaqachon shu uslubda ishlaydi, bular ularning yoniga
// tushadi. Maqsad: adminka analitikasi savat/layk/sharh sonini bilishi
// uchun butun `cart-items` yoki `likes` jadvalini tortib, o'zi
// sanamasin — savat jadvali eng tez o'sadiganlaridan biri.
//
// SEMANTIKA — ikki xil, ataylab:
//
//   cart_count    KUMULYATIV: "necha marta savatga solingan".
//                 Savat tozalansa yoki buyurtma berilsa kamaymaydi.
//                 Sababi: `views -> savat -> sotuv` voronkasi uchun
//                 uchala raqam ham bir xil turdagi bo'lishi shart
//                 (`views` va `sold_count` ham kumulyativ), ustiga
//                 `characteristics.cart_count` allaqachon shunday
//                 ishlaydi — ikkisi bir nomda turli narsani anglatsa
//                 bu tuzoq bo'lardi.
//
//   likes_count   JORIY: hozir nechta layk/sharh bor. Layk olib
//   reviews_count tashlansa kamayadi — chunki bu obyektlar mavjudligi
//                 haqidagi fakt, hodisa emas.
//
// Shu sababli backfill ham har xil: likes/reviews mavjud qatorlardan
// sanaladi, cart_count esa 0 dan boshlanadi (kumulyativ hisoblagichni
// joriy savat holatidan "tiklab" bo'lmaydi — o'tmishdagi qo'shishlar
// yozib olinmagan).
//
// 3-band — `order-items.product_model_id` (FK -> characteristics.id).
// Matnli `product_model` SAQLANIB QOLADI: model o'chirilsa ham
// buyurtmada nima sotilgani ko'rinib tursin.
module.exports = {
  async up(queryInterface, Sequelize) {
    const counter = {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    };

    await queryInterface.addColumn('products', 'cart_count', counter);
    await queryInterface.addColumn('products', 'likes_count', counter);
    await queryInterface.addColumn('products', 'reviews_count', counter);

    // Joriy hisoblagichlarni mavjud ma'lumotdan tiklaymiz.
    await queryInterface.sequelize.query(`
      UPDATE products p
      SET    likes_count = COALESCE(l.n, 0)
      FROM   (SELECT product_id, COUNT(*)::int AS n FROM likes GROUP BY product_id) l
      WHERE  l.product_id = p.id
    `);

    await queryInterface.sequelize.query(`
      UPDATE products p
      SET    reviews_count = COALESCE(r.n, 0)
      FROM   (SELECT product_id, COUNT(*)::int AS n FROM reviews GROUP BY product_id) r
      WHERE  r.product_id = p.id
    `);

    // 3-band. NULL bo'lishi mumkin: eski 40 ta qator bog'lanmagan holda
    // qoladi (nomlar noaniq — 282 ta nomdan 17 tasi takrorlanadi, ya'ni
    // avtomatik bog'lash xato natija berardi). Model o'chirilsa
    // bog'lanish uziladi, matnli nom esa qoladi.
    await queryInterface.addColumn('order-items', 'product_model_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'characteristics', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });

    await queryInterface.addIndex('order-items', ['product_model_id'], {
      name: 'order_items_product_model_id_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex(
      'order-items',
      'order_items_product_model_id_idx',
    );
    await queryInterface.removeColumn('order-items', 'product_model_id');
    await queryInterface.removeColumn('products', 'reviews_count');
    await queryInterface.removeColumn('products', 'likes_count');
    await queryInterface.removeColumn('products', 'cart_count');
  },
};
