'use strict';

// Topshiriq №13, 4-band — buyurtmada narx.
//
// O'LCHANGAN HOLAT (topshiriq aytganidan farqli sabab):
//   narx 0 bo'lgan 39 ta buyurtma qatoridan 37 tasida katalogda UMUMAN
//   narx yo'q ("so'rov bo'yicha" modellar). Ya'ni narx "nusxalanmagan"
//   emas — nusxalaydigan narx yo'q edi va noma'lum narx `0` sifatida
//   yozilgan. 0 esa haqiqiy summadan farqlanmaydi.
//
// Shu migratsiya:
//
// 1) `order-items.price` va `orders.totalAmount` — NULL bo'la oladi.
//    NULL = "narx yozilmagan / kelishiladi". Endi 0 hech qachon "narx yo'q"
//    degan ma'noda yozilmaydi.
//
// 2) BIGINT ga kengaytirish ALOHIDA migratsiyada (20260911110000) —
//    sababi o'sha faylda.
//
// 3) `order-items.product_model_inside_id` — aynan qaysi SAP varianti
//    sotilgani. 111 ta modelda bir nechta variant bor va narxi farq qiladi
//    (РВН: 64 variant, $12—$97) — variantsiz server to'g'ri narxni bila
//    olmaydi.
//
// 4) `selected_to_checkout` ga `characteristic_id` va
//    `product_model_inside_id`. Savatdan buyurtmagacha yo'l shu jadval
//    orqali o'tadi va variant id'lari aynan shu yerda yo'qolardi.
//
// ESKI QATORLAR TEGILMAYDI (topshiriqda so'ralganidek): eski 0 lar 0
// bo'lib qoladi, adminka ularni "narx yozilmagan" deb ko'rsatadi.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn('order-items', 'price', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
    await queryInterface.changeColumn('orders', 'totalAmount', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });

    await queryInterface.addColumn('order-items', 'product_model_inside_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'product-model-inside', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });
    await queryInterface.addIndex('order-items', ['product_model_inside_id'], {
      name: 'order_items_product_model_inside_id_idx',
    });

    await queryInterface.addColumn('selected_to_checkout', 'characteristic_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'characteristics', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });
    await queryInterface.addColumn(
      'selected_to_checkout',
      'product_model_inside_id',
      {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'product-model-inside', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
    );
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn(
      'selected_to_checkout',
      'product_model_inside_id',
    );
    await queryInterface.removeColumn('selected_to_checkout', 'characteristic_id');
    await queryInterface.removeIndex(
      'order-items',
      'order_items_product_model_inside_id_idx',
    );
    await queryInterface.removeColumn('order-items', 'product_model_inside_id');

    // NOT NULL ga qaytishdan oldin NULL larni 0 qilamiz — aks holda
    // constraint qo'yib bo'lmaydi.
    await queryInterface.sequelize.query(
      `UPDATE orders SET "totalAmount" = 0 WHERE "totalAmount" IS NULL`,
    );
    await queryInterface.sequelize.query(
      `UPDATE "order-items" SET price = 0 WHERE price IS NULL`,
    );
    await queryInterface.changeColumn('orders', 'totalAmount', {
      type: Sequelize.INTEGER,
      allowNull: false,
    });
    await queryInterface.changeColumn('order-items', 'price', {
      type: Sequelize.INTEGER,
      allowNull: false,
    });
  },
};
