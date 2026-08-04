'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('classes', 'feeBillingCycle', {
      type: Sequelize.ENUM('TERMLY', 'MONTHLY'),
      allowNull: false,
      defaultValue: 'TERMLY',
    });
  },

  down: async (queryInterface) => {
    // SQL Server won't drop a column that still has a CHECK constraint on it
    // (the ENUM's backing constraint) — same dance as
    // 20260101000081-add-transport-billing-fields.js.
    const [checkConstraints] = await queryInterface.sequelize.query(`
      SELECT cc.name
      FROM sys.check_constraints cc
      WHERE cc.parent_object_id = OBJECT_ID('classes') AND cc.definition LIKE '%feeBillingCycle%'
    `);
    for (const { name } of checkConstraints) {
      await queryInterface.sequelize.query(`ALTER TABLE [classes] DROP CONSTRAINT [${name}]`);
    }

    await queryInterface.removeColumn('classes', 'feeBillingCycle');
  },
};
