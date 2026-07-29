'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // The old ENUM('SCHOOL','CLASS') is implemented on SQL Server as a
    // NVARCHAR + an auto-named CHECK constraint, which must be dropped
    // before the column can be altered — same pattern as
    // 20260101000009-add-billing-to-schools.js. Switched to a plain string
    // so a new 'STUDENT' target type can be added without another
    // ENUM-altering migration.
    const [checkConstraints] = await queryInterface.sequelize.query(`
      SELECT cc.name
      FROM sys.check_constraints cc
      WHERE cc.parent_object_id = OBJECT_ID('levies') AND cc.definition LIKE '%targetType%'
    `);
    for (const { name } of checkConstraints) {
      await queryInterface.sequelize.query(`ALTER TABLE [levies] DROP CONSTRAINT [${name}]`);
    }

    await queryInterface.changeColumn('levies', 'targetType', {
      type: Sequelize.STRING(20),
      allowNull: false,
    });
  },
  down: async (queryInterface, Sequelize) => {
    await queryInterface.changeColumn('levies', 'targetType', {
      type: Sequelize.ENUM('SCHOOL', 'CLASS'),
      allowNull: false,
    });
  },
};
