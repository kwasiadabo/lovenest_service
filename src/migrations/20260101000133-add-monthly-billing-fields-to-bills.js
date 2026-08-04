'use strict';

// Adds a monthly billing path alongside the existing termly one (see
// models/bill.js and models/class.js#feeBillingCycle). A bill is now keyed
// by periodKey (the termId for TERMLY, "YYYY-MM" for MONTHLY) instead of
// termId directly, mirroring transport_invoices
// (20260101000084-create-transport-invoices.js). Existing rows are all
// TERMLY and get backfilled from their current term/academic year.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('bills', 'billingCycle', {
      type: Sequelize.ENUM('TERMLY', 'MONTHLY'),
      allowNull: false,
      defaultValue: 'TERMLY',
    });
    await queryInterface.addColumn('bills', 'periodMonth', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
    await queryInterface.addColumn('bills', 'periodYear', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
    // Nullable for now — backfilled below, then tightened to NOT NULL.
    await queryInterface.addColumn('bills', 'periodKey', {
      type: Sequelize.STRING(40),
      allowNull: true,
    });
    await queryInterface.addColumn('bills', 'periodLabel', {
      type: Sequelize.STRING(60),
      allowNull: true,
    });
    await queryInterface.addColumn('bills', 'dueDate', {
      type: Sequelize.DATEONLY,
      allowNull: true,
    });

    await queryInterface.sequelize.query(`
      UPDATE b
      SET periodKey = CONVERT(VARCHAR(40), b.termId),
          periodLabel = t.name + ' (' + ay.name + ')',
          dueDate = t.startDate
      FROM [bills] b
      JOIN [terms] t ON t.id = b.termId
      JOIN [academic_years] ay ON ay.id = t.academicYearId
    `);

    await queryInterface.sequelize.query('ALTER TABLE [bills] ALTER COLUMN [periodKey] VARCHAR(40) NOT NULL');
    await queryInterface.sequelize.query('ALTER TABLE [bills] ALTER COLUMN [periodLabel] VARCHAR(60) NOT NULL');
    await queryInterface.sequelize.query('ALTER TABLE [bills] ALTER COLUMN [dueDate] DATE NOT NULL');

    // termId is only set for TERMLY bills now — MONTHLY bills carry
    // periodMonth/periodYear instead (same split as transport_invoices).
    await queryInterface.changeColumn('bills', 'termId', {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: 'terms', key: 'id' },
      onDelete: 'NO ACTION',
    });

    await queryInterface.removeIndex('bills', ['studentId', 'termId']);
    await queryInterface.addIndex('bills', ['studentId', 'periodKey'], { unique: true });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeIndex('bills', ['studentId', 'periodKey']);
    await queryInterface.addIndex('bills', ['studentId', 'termId'], { unique: true });

    await queryInterface.changeColumn('bills', 'termId', {
      type: Sequelize.UUID,
      allowNull: false,
      references: { model: 'terms', key: 'id' },
      onDelete: 'NO ACTION',
    });

    await queryInterface.removeColumn('bills', 'dueDate');
    await queryInterface.removeColumn('bills', 'periodLabel');
    await queryInterface.removeColumn('bills', 'periodKey');
    await queryInterface.removeColumn('bills', 'periodYear');
    await queryInterface.removeColumn('bills', 'periodMonth');

    const [checkConstraints] = await queryInterface.sequelize.query(`
      SELECT cc.name
      FROM sys.check_constraints cc
      WHERE cc.parent_object_id = OBJECT_ID('bills') AND cc.definition LIKE '%billingCycle%'
    `);
    for (const { name } of checkConstraints) {
      await queryInterface.sequelize.query(`ALTER TABLE [bills] DROP CONSTRAINT [${name}]`);
    }
    await queryInterface.removeColumn('bills', 'billingCycle');
  },
};
