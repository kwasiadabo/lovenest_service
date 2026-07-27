'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('vehicles', 'termlyFeePesewas', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
    await queryInterface.addColumn('vehicles', 'monthlyFeePesewas', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
    await queryInterface.addColumn('student_transport', 'billingCycle', {
      type: Sequelize.ENUM('TERMLY', 'MONTHLY'),
      allowNull: false,
      defaultValue: 'TERMLY',
    });
  },

  down: async (queryInterface) => {
    // SQL Server won't drop a column that still has a CHECK constraint on it
    // (the ENUM's backing constraint) — same dance as
    // 20260101000033-add-arrears-bill-items.js, find it by definition since
    // Sequelize auto-names it.
    const [checkConstraints] = await queryInterface.sequelize.query(`
      SELECT cc.name
      FROM sys.check_constraints cc
      WHERE cc.parent_object_id = OBJECT_ID('student_transport') AND cc.definition LIKE '%billingCycle%'
    `);
    for (const { name } of checkConstraints) {
      await queryInterface.sequelize.query(`ALTER TABLE [student_transport] DROP CONSTRAINT [${name}]`);
    }

    await queryInterface.removeColumn('student_transport', 'billingCycle');
    await queryInterface.removeColumn('vehicles', 'monthlyFeePesewas');
    await queryInterface.removeColumn('vehicles', 'termlyFeePesewas');
  },
};
