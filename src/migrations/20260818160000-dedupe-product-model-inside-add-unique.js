module.exports = {
  async up(queryInterface) {
    // Aniq dublikatlarni o'chiramiz: bir xil (product_model_id, sap_name,
    // in_model_name) uchligiga ega qatorlardan eng kichik id'lisi qoladi.
    // DIQQAT: bu faqat UCHALA maydon ham bir xil bo'lganda o'chiradi.
    // Masalan "ДКСп 500х300х350" ikki qatori bir xil in_model_name'ga ega,
    // lekin sap_name har xil (500х300 va 600х300) — ular boshqa SAP variant,
    // shuning uchun TEGILMAYDI.
    await queryInterface.sequelize.query(`
      DELETE FROM "product-model-inside" AS a
      USING "product-model-inside" AS b
      WHERE a.product_model_id = b.product_model_id
        AND a.sap_name = b.sap_name
        AND a.in_model_name = b.in_model_name
        AND a.id > b.id
    `);

    // Kelajakda takrorlanmasligi uchun UNIQUE cheklov.
    // in_model_name yolg'iz UNIQUE qilinmadi — yuqoridagi ДКСп misolidek
    // haqiqiy variantlar bir xil in_model_name bilan yashashi mumkin.
    await queryInterface.addConstraint('product-model-inside', {
      fields: ['product_model_id', 'sap_name', 'in_model_name'],
      type: 'unique',
      name: 'product_model_inside_unique_variant',
    });
  },
  async down(queryInterface) {
    await queryInterface.removeConstraint(
      'product-model-inside',
      'product_model_inside_unique_variant',
    );
  },
};
