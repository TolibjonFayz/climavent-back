module.exports = {
  async up(queryInterface, Sequelize) {
    // DIQQAT: bu ustun narxi DOLLARDA (USD).
    // product_models.price va characteristics.price esa SO'MDA (UZS).
    // NULL = "narx kiritilmagan" (DEFAULT ataylab qo'yilmagan: 0 "bepul"
    // degan ma'noni beradi, "kiritilmagan" degan ma'noni emas).
    await queryInterface.addColumn('product-model-inside', 'price', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
    });

    await queryInterface.sequelize.query(`
      COMMENT ON COLUMN "product-model-inside"."price" IS
      'Narx, USD. Diqqat: product_models.price va characteristics.price — SO''MDA.'
    `);
  },
  async down(queryInterface) {
    await queryInterface.removeColumn('product-model-inside', 'price');
  },
};
