'use strict';

// Uch narsa uchun:
//  1) Dashboard statistikasi — model (characteristic) va SAP varianti
//     (product-model-inside) necha marta savatga solingan.
//  2) SAP variantining ko'rish hisoblagichi (characteristics.views kabi).
//  3) Savatda AYNAN QAYSI SAP varianti tanlangani. Ilgari cart_item'da
//     faqat `product_model` MATNI bor edi — qaysi variant ekani noma'lum
//     edi. 302 modeldan 111 tasida bir nechta variant bor va narxi
//     sezilarli farq qiladi (masalan РВН: 64 variant, $12—$97).
//
// Hisoblagichlar ATAYLAB alohida ustun (cart_item'dan hisoblanmaydi):
// savat tozalansa yoki buyurtma berilsa, cart_item o'chadi — statistika
// esa tarixiy bo'lib qolishi kerak.
module.exports = {
  async up(queryInterface, Sequelize) {
    const counter = {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    };

    await queryInterface.addColumn('characteristics', 'cart_count', counter);
    await queryInterface.addColumn('product-model-inside', 'views', counter);
    await queryInterface.addColumn(
      'product-model-inside',
      'cart_count',
      counter,
    );

    // Savatdagi qator qaysi SAP variantiga tegishli.
    // NULL bo'lishi mumkin: 150 ta modelda umuman inside yo'q, ustiga
    // eski savat qatorlari ham bog'lanmagan holda qoladi.
    await queryInterface.addColumn('cart_item', 'product_model_inside_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'product-model-inside', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });

    // Model (characteristic) bilan haqiqiy bog'lanish — statistikani
    // matn solishtirmasdan, id bo'yicha yig'ish uchun.
    await queryInterface.addColumn('cart_item', 'characteristic_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'characteristics', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });

    // Mavjud savat qatorlarini nomi bo'yicha modelga bog'lab qo'yamiz
    // (normallashtirilgan solishtirish — bo'shliq/defis farqi bo'lishi mumkin).
    await queryInterface.sequelize.query(`
      UPDATE cart_item ci
      SET    characteristic_id = ch.id
      FROM   characteristics ch
      WHERE  ch.product_id = ci.product_id
        AND  regexp_replace(upper(ch.title), '[[:space:]/_.-]', '', 'g')
           = regexp_replace(upper(ci.product_model), '[[:space:]/_.-]', '', 'g')
        AND  ci.characteristic_id IS NULL
    `);

    await queryInterface.addIndex('cart_item', ['characteristic_id'], {
      name: 'cart_item_characteristic_id_idx',
    });
    await queryInterface.addIndex('cart_item', ['product_model_inside_id'], {
      name: 'cart_item_product_model_inside_id_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex(
      'cart_item',
      'cart_item_product_model_inside_id_idx',
    );
    await queryInterface.removeIndex(
      'cart_item',
      'cart_item_characteristic_id_idx',
    );
    await queryInterface.removeColumn('cart_item', 'characteristic_id');
    await queryInterface.removeColumn('cart_item', 'product_model_inside_id');
    await queryInterface.removeColumn('product-model-inside', 'cart_count');
    await queryInterface.removeColumn('product-model-inside', 'views');
    await queryInterface.removeColumn('characteristics', 'cart_count');
  },
};
