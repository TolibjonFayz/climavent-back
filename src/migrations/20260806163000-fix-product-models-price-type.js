module.exports = {
  async up(queryInterface) {
    // price hozir STRING: "0" (kiritilmagan), "." (buzuq qiymat, 2 ta) yoki
    // haqiqiy raqam. Tur o'zgartirilganda "0" va "." ikkalasi ham NULL'ga
    // aylanadi -- shu bilan "kiritilmagan" va "haqiqatan 0" ajratiladi.
    await queryInterface.sequelize.query(`
      ALTER TABLE product_models ALTER COLUMN price DROP NOT NULL
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE product_models
      ALTER COLUMN price TYPE integer
      USING (
        CASE
          WHEN price ~ '^[0-9]+$' AND price::numeric > 0 THEN price::integer
          ELSE NULL
        END
      )
    `);
  },
  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE product_models
      ALTER COLUMN price TYPE varchar
      USING COALESCE(price::text, '0')
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE product_models ALTER COLUMN price SET NOT NULL
    `);
  },
};
