'use strict';

// Topshiriq №19, 4- va 7-band: arizaga yangi hodisa turlari.
//   notified       — qaror/qabul haqida sotuvchiga xat ketdi
//   notify_failed  — xat yuborilmadi (sabab matnda)
//   deleted        — ariza arxivga olindi, fayllari o'chirildi
const OLD = ['created', 'info_requested', 'resubmitted', 'approved', 'rejected', 'note', 'documents_purged'];
const NEW = [...OLD, 'notified', 'notify_failed', 'deleted'];
const chk = (list) =>
  `ALTER TABLE seller_application_events ADD CONSTRAINT seller_application_events_type_chk CHECK (type IN (${list.map((t) => `'${t}'`).join(', ')}))`;

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query('ALTER TABLE seller_application_events DROP CONSTRAINT seller_application_events_type_chk', { transaction });
      await queryInterface.sequelize.query(chk(NEW), { transaction });
    });
  },
  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query('ALTER TABLE seller_application_events DROP CONSTRAINT seller_application_events_type_chk', { transaction });
      await queryInterface.sequelize.query(chk(OLD), { transaction });
    });
  },
};
