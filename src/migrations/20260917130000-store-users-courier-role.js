'use strict';

// Topshiriq №22, 1-band: kuryer — store_users dagi yangi rol.
// Kuryerda do'kon bo'lishi ham (do'kon kuryeri), bo'lmasligi ham (platforma kuryeri) mumkin.
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query('ALTER TABLE store_users DROP CONSTRAINT store_users_role_chk', { transaction });
      await queryInterface.sequelize.query(
        "ALTER TABLE store_users ADD CONSTRAINT store_users_role_chk CHECK (role IN ('superadmin', 'store_admin', 'courier'))",
        { transaction },
      );
    });
  },
  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query('ALTER TABLE store_users DROP CONSTRAINT store_users_role_chk', { transaction });
      await queryInterface.sequelize.query(
        "ALTER TABLE store_users ADD CONSTRAINT store_users_role_chk CHECK (role IN ('superadmin', 'store_admin'))",
        { transaction },
      );
    });
  },
};
