module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('product_models', 'sap_name', {
      type: Sequelize.STRING,
      allowNull: true,
    });

    // Backfill: product_model_inside.in_model_name'ni product_models.name bilan
    // normallashtirib solishtirib (bo'sh joy, "-", "/", "_", "." olib tashlanadi,
    // katta harfga o'giriladi) mos kelgan sap_name'ni ko'chiradi.
    // id=129 chetlab o'tiladi -- ikkita product_models qatoriga (bittasi ortiqcha
    // bo'shliq bilan) bab-baravar mos keladi, qo'lda ko'rib chiqilishi kerak.
    await queryInterface.sequelize.query(`
      UPDATE product_models AS m
      SET    sap_name = i.sap_name
      FROM   "product-model-inside" AS i
      WHERE  regexp_replace(upper(i.in_model_name), '[\\s\\-/_.]', '', 'g')
           = regexp_replace(upper(m.name),          '[\\s\\-/_.]', '', 'g')
        AND  i.id <> 129
    `);
  },
  async down(queryInterface) {
    await queryInterface.removeColumn('product_models', 'sap_name');
  },
};
