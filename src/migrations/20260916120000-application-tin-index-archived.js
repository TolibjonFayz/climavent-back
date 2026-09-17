'use strict';

// Topshiriq №19, 7-band: arxivga olingan ariza STIR ni band qilib turmasin.
// Qisman unique indeks ilgari faqat holatga qarardi — arxivlangan `pending`
// ariza shu STIR bilan yangi ariza topshirishni to'sib qo'yardi.
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query('DROP INDEX seller_applications_active_tin_uq', { transaction });
      await queryInterface.sequelize.query(
        `CREATE UNIQUE INDEX seller_applications_active_tin_uq ON seller_applications (tin)
         WHERE status IN ('pending', 'needs_info', 'approved') AND deleted_at IS NULL`,
        { transaction },
      );
    });
  },
  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query('DROP INDEX seller_applications_active_tin_uq', { transaction });
      await queryInterface.sequelize.query(
        `CREATE UNIQUE INDEX seller_applications_active_tin_uq ON seller_applications (tin)
         WHERE status IN ('pending', 'needs_info', 'approved')`,
        { transaction },
      );
    });
  },
};
