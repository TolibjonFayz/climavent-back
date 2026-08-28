module.exports = {
  async up(queryInterface, Sequelize) {
    // airflow/pressure endi characteristics'da yashaydi (product_models
    // o'chirilyapti). Nom bo'yicha (title == product_models.name,
    // normallashtirilib) ko'chiriladi.
    await queryInterface.addColumn('characteristics', 'airflow_m3h', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
    await queryInterface.addColumn('characteristics', 'pressure_pa', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });

    await queryInterface.sequelize.query(`
      UPDATE characteristics AS c
      SET    airflow_m3h = m.airflow_m3h,
             pressure_pa = m.pressure_pa
      FROM   product_models AS m
      WHERE  regexp_replace(upper(c.title), '[\\s\\-/_.]', '', 'g')
           = regexp_replace(upper(m.name),  '[\\s\\-/_.]', '', 'g')
        AND  (m.airflow_m3h IS NOT NULL OR m.pressure_pa IS NOT NULL)
    `);
  },
  async down(queryInterface) {
    await queryInterface.removeColumn('characteristics', 'airflow_m3h');
    await queryInterface.removeColumn('characteristics', 'pressure_pa');
  },
};
