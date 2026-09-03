'use strict';

// Mahsulotni o'chirishda 500 xato chiqardi:
//   "violates foreign key constraint product_images_product_id_fkey"
// Sabab: products'ga ishora qiluvchi FK'larning aksariyati NO ACTION edi,
// ya'ni bola yozuvlar o'chirishni bloklardi.
//
// QAROR: mahsulotga BOG'LIQ va usiz ma'nosi yo'q yozuvlar CASCADE bilan
// birga o'chadi. `order-items` esa ATAYLAB tegilmaydi — u SAVDO TARIXI,
// uni jimgina o'chirish daromad hisobotini buzadi. Buyurtmada qatnashgan
// mahsulotni o'chirish servis darajasida aniq xabar bilan bloklanadi.
const CASCADE_FKS = [
  { table: 'product_images', constraint: 'product_images_product_id_fkey' },
  { table: 'likes', constraint: 'likes_product_id_fkey' },
  { table: 'cart_item', constraint: 'cart_item_product_id_fkey' },
  {
    table: 'selected_to_checkout',
    constraint: 'selected_to_checkout_product_id_fkey',
  },
  { table: 'banner', constraint: 'banner_product_id_fkey' },
];

module.exports = {
  async up(queryInterface) {
    for (const { table, constraint } of CASCADE_FKS) {
      await queryInterface.sequelize.query(`
        ALTER TABLE "${table}" DROP CONSTRAINT "${constraint}";
        ALTER TABLE "${table}"
          ADD CONSTRAINT "${constraint}"
          FOREIGN KEY (product_id) REFERENCES products(id)
          ON UPDATE CASCADE ON DELETE CASCADE;
      `);
    }
  },

  async down(queryInterface) {
    for (const { table, constraint } of CASCADE_FKS) {
      await queryInterface.sequelize.query(`
        ALTER TABLE "${table}" DROP CONSTRAINT "${constraint}";
        ALTER TABLE "${table}"
          ADD CONSTRAINT "${constraint}"
          FOREIGN KEY (product_id) REFERENCES products(id);
      `);
    }
  },
};
