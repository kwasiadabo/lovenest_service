'use strict';

module.exports = {
  up: async (queryInterface) => {
    // Same ENUM->STRING switch as 20260101000033-add-arrears-bill-items.js:
    // the old ENUM('ENROLLED','WITHDRAWN') is a NVARCHAR + auto-named CHECK
    // constraint on SQL Server, which must be dropped before altering.
    const [checkConstraints] = await queryInterface.sequelize.query(`
      SELECT cc.name
      FROM sys.check_constraints cc
      WHERE cc.parent_object_id = OBJECT_ID('student_transport') AND cc.definition LIKE '%status%'
    `);
    for (const { name } of checkConstraints) {
      await queryInterface.sequelize.query(`ALTER TABLE [student_transport] DROP CONSTRAINT [${name}]`);
    }

    // changeColumn({ defaultValue }) emits a single ALTER COLUMN ... DEFAULT
    // statement, which isn't valid T-SQL — SQL Server requires the type/
    // null-ability change and the default to be two separate statements
    // (same footgun documented in 20260101000046-fix-exam-scores-status-
    // default.js). Do them by hand instead.
    await queryInterface.sequelize.query('ALTER TABLE [student_transport] ALTER COLUMN [status] VARCHAR(20) NOT NULL');
    await queryInterface.sequelize.query("ALTER TABLE [student_transport] ADD CONSTRAINT [DF_student_transport_status] DEFAULT 'PENDING_PAYMENT' FOR [status]");
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.sequelize.query('ALTER TABLE [student_transport] DROP CONSTRAINT [DF_student_transport_status]');
    await queryInterface.sequelize.query("UPDATE [student_transport] SET [status] = 'ENROLLED' WHERE [status] = 'PENDING_PAYMENT'");
    await queryInterface.changeColumn('student_transport', 'status', {
      type: Sequelize.ENUM('ENROLLED', 'WITHDRAWN'),
      allowNull: false,
      defaultValue: 'ENROLLED',
    });
  },
};
