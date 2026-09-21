'use strict';

// Topshiriq №24 — mijoz kuryerni kuzatadi.
//
// `deliveries.tracking_token_hash` avvalgi migratsiyada (20260919100000)
// qo'shilgan. Bu yerda faqat tarix uchun `event` ustuni:
//
// "Kuzatish havolasi yaratildi" holat O'ZGARISHI emas — `to_status` ga
// `tracking_link_created` deb yozib bo'lmaydi (ustun 15 belgi va u yerda
// yetkazish holatlari turadi). Shuning uchun alohida `event` ustuni:
// `NULL` — oddiy holat o'tishi, aks holda — hodisa nomi.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('delivery_events', 'event', {
      type: Sequelize.STRING(30),
      allowNull: true,
    });
    // Mijoz sahifasi qadamlarni faqat holat o'tishlaridan yig'adi.
    await queryInterface.addIndex('delivery_events', ['delivery_id', 'to_status'], {
      name: 'delivery_events_delivery_status',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('delivery_events', 'delivery_events_delivery_status');
    await queryInterface.removeColumn('delivery_events', 'event');
  },
};
