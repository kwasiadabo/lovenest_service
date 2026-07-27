'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Same ENUM->STRING switch as 20260101000009-add-billing-to-schools.js:
    // the old ENUM('STANDARD','SPECIAL') is a NVARCHAR + auto-named CHECK
    // constraint on SQL Server, which must be dropped before altering.
    const [checkConstraints] = await queryInterface.sequelize.query(`
      SELECT cc.name
      FROM sys.check_constraints cc
      WHERE cc.parent_object_id = OBJECT_ID('bill_items') AND cc.definition LIKE '%source%'
    `);
    for (const { name } of checkConstraints) {
      await queryInterface.sequelize.query(`ALTER TABLE [bill_items] DROP CONSTRAINT [${name}]`);
    }

    await queryInterface.changeColumn('bill_items', 'source', {
      type: Sequelize.STRING(20),
      allowNull: false,
    });

    // Arrears items carry no FeeType — they represent a student's prior
    // outstanding balance, not a configured fee.
    await queryInterface.changeColumn('bill_items', 'feeTypeId', {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: 'fee_types', key: 'id' },
      onDelete: 'NO ACTION',
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.sequelize.query('DELETE FROM [bill_items] WHERE [feeTypeId] IS NULL');
    await queryInterface.changeColumn('bill_items', 'feeTypeId', {
      type: Sequelize.UUID,
      allowNull: false,
      references: { model: 'fee_types', key: 'id' },
      onDelete: 'NO ACTION',
    });
    await queryInterface.changeColumn('bill_items', 'source', {
      type: Sequelize.ENUM('STANDARD', 'SPECIAL'),
      allowNull: false,
      defaultValue: 'STANDARD',
    });
  },
};
