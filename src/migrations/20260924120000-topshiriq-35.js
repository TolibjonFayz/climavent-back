'use strict';

// Topshiriq №35 — do'kon xodimlari va rollar.
//
// Xodim — `store_users` dagi yangi rol `store_staff` (kuryer №22 dagi kabi):
// kirish, `token_version`, kirish jurnali, mobil sessiya — hammasi mavjud
// mexanizm. Nimaga ruxsati borligi — `store_roles.permissions` (do'konning
// o'zi yaratadigan rol).
//
// `store_role_id` ON DELETE RESTRICT: rolda xodim bo'lsa rol o'chmaydi (API 409).
module.exports = {
  async up(queryInterface) {
    const t = await queryInterface.sequelize.transaction();
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction: t });
    try {
      await q(`
        CREATE TABLE IF NOT EXISTS store_roles (
          id          SERIAL PRIMARY KEY,
          store_id    INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
          name        VARCHAR(60) NOT NULL,
          permissions TEXT[] NOT NULL,
          created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
          CONSTRAINT store_roles_permissions_chk CHECK (cardinality(permissions) > 0),
          CONSTRAINT store_roles_name_chk CHECK (char_length(btrim(name)) BETWEEN 2 AND 60)
        )`);
      await q(`CREATE UNIQUE INDEX IF NOT EXISTS store_roles_store_name_uq ON store_roles (store_id, lower(btrim(name)))`);

      await q(`ALTER TABLE store_users ADD COLUMN IF NOT EXISTS store_role_id INTEGER
                 REFERENCES store_roles(id) ON DELETE RESTRICT`);
      await q(`ALTER TABLE store_users ADD COLUMN IF NOT EXISTS phone VARCHAR(13)`);
      await q(`CREATE INDEX IF NOT EXISTS store_users_store_role_id_idx ON store_users (store_role_id)
                 WHERE store_role_id IS NOT NULL`);

      await q(`ALTER TABLE store_users DROP CONSTRAINT IF EXISTS store_users_role_chk`);
      await q(`ALTER TABLE store_users ADD CONSTRAINT store_users_role_chk
                 CHECK (role IN ('superadmin', 'store_admin', 'courier', 'store_staff'))`);
      await q(`ALTER TABLE store_users DROP CONSTRAINT IF EXISTS store_users_store_role_chk`);
      await q(`ALTER TABLE store_users ADD CONSTRAINT store_users_store_role_chk CHECK (
                 (role = 'superadmin' AND store_id IS NULL) OR
                 (role = 'store_admin' AND store_id IS NOT NULL) OR
                 (role = 'store_staff' AND store_id IS NOT NULL) OR
                 role = 'courier')`);
      await q(`ALTER TABLE store_users DROP CONSTRAINT IF EXISTS store_users_phone_chk`);
      await q(`ALTER TABLE store_users ADD CONSTRAINT store_users_phone_chk
                 CHECK (phone IS NULL OR phone ~ '^\\+998[0-9]{9}$')`);
      await t.commit();
    } catch (e) {
      await t.rollback();
      throw e;
    }
  },

  async down(queryInterface) {
    const t = await queryInterface.sequelize.transaction();
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction: t });
    try {
      await q(`DELETE FROM store_users WHERE role = 'store_staff'`);
      await q(`ALTER TABLE store_users DROP CONSTRAINT IF EXISTS store_users_phone_chk`);
      await q(`ALTER TABLE store_users DROP CONSTRAINT IF EXISTS store_users_role_chk`);
      await q(`ALTER TABLE store_users ADD CONSTRAINT store_users_role_chk
                 CHECK (role IN ('superadmin', 'store_admin', 'courier'))`);
      await q(`ALTER TABLE store_users DROP CONSTRAINT IF EXISTS store_users_store_role_chk`);
      await q(`ALTER TABLE store_users ADD CONSTRAINT store_users_store_role_chk CHECK (
                 (role = 'superadmin' AND store_id IS NULL) OR
                 (role = 'store_admin' AND store_id IS NOT NULL) OR
                 role = 'courier')`);
      await q(`ALTER TABLE store_users DROP COLUMN IF EXISTS store_role_id`);
      await q(`ALTER TABLE store_users DROP COLUMN IF EXISTS phone`);
      await q(`DROP TABLE IF EXISTS store_roles`);
      await t.commit();
    } catch (e) {
      await t.rollback();
      throw e;
    }
  },
};
