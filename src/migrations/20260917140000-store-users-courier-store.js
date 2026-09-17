'use strict';

// Topshiriq №22: rol va do'kon mosligi — kuryer uchun store_id ixtiyoriy
// (NULL — platforma kuryeri, raqam — do'kon kuryeri).
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query('ALTER TABLE store_users DROP CONSTRAINT store_users_store_role_chk', { transaction });
      await queryInterface.sequelize.query(
        `ALTER TABLE store_users ADD CONSTRAINT store_users_store_role_chk CHECK (
           (role = 'superadmin' AND store_id IS NULL) OR
           (role = 'store_admin' AND store_id IS NOT NULL) OR
           role = 'courier')`,
        { transaction },
      );
    });
  },
  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query('ALTER TABLE store_users DROP CONSTRAINT store_users_store_role_chk', { transaction });
      await queryInterface.sequelize.query(
        `ALTER TABLE store_users ADD CONSTRAINT store_users_store_role_chk CHECK (
           (role = 'superadmin' AND store_id IS NULL) OR (role = 'store_admin' AND store_id IS NOT NULL))`,
        { transaction },
      );
    });
  },
};
