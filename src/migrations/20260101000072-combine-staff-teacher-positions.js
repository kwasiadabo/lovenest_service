'use strict';

// Combines the two separate "Class Teacher" / "Subject Teacher" position
// options into one "Class/Subject Teacher" value. The CHECK constraint
// enforcing the enum was auto-named by SQL Server at table-creation time
// (see the original create-staff migration's Sequelize.ENUM), so its exact
// name isn't known/portable across deployments — it's looked up dynamically
// here rather than hardcoded, then dropped and recreated with the new list.
module.exports = {
  up: async (queryInterface) => {
    // The old constraint must be dropped before the backfill below — it
    // doesn't allow 'Class/Subject Teacher' yet, so updating rows into that
    // value while it's still in place is itself a constraint violation.
    await queryInterface.sequelize.query(`
      DECLARE @constraintName NVARCHAR(200);
      SELECT @constraintName = cc.name
      FROM sys.check_constraints cc
      INNER JOIN sys.columns col ON col.object_id = cc.parent_object_id AND col.column_id = cc.parent_column_id
      WHERE cc.parent_object_id = OBJECT_ID('staff') AND col.name = 'position';
      IF @constraintName IS NOT NULL
        EXEC('ALTER TABLE staff DROP CONSTRAINT [' + @constraintName + ']');
    `);
    await queryInterface.sequelize.query(
      "UPDATE staff SET position = 'Class/Subject Teacher' WHERE position IN ('Class Teacher', 'Subject Teacher')",
    );
    await queryInterface.sequelize.query(`
      ALTER TABLE staff ADD CONSTRAINT CK_staff_position CHECK (position IN (
        N'Headteacher', N'Assistant Headteacher', N'Class/Subject Teacher', N'Administrator',
        N'Accountant', N'Secretary', N'Librarian', N'Store Keeper', N'Cleaner', N'Security',
        N'Cook', N'Driver', N'Nurse', N'Other'
      ))
    `);
  },

  down: async (queryInterface) => {
    await queryInterface.sequelize.query('ALTER TABLE staff DROP CONSTRAINT CK_staff_position');
    await queryInterface.sequelize.query(`
      ALTER TABLE staff ADD CONSTRAINT CK_staff_position CHECK (position IN (
        N'Headteacher', N'Assistant Headteacher', N'Class Teacher', N'Subject Teacher', N'Administrator',
        N'Accountant', N'Secretary', N'Librarian', N'Store Keeper', N'Cleaner', N'Security',
        N'Cook', N'Driver', N'Nurse', N'Other'
      ))
    `);
    // Lossy: a row merged into 'Class/Subject Teacher' can't be split back
    // into whichever of the two it originally was — mapped to 'Class
    // Teacher' as a defined, not silently broken, fallback.
    await queryInterface.sequelize.query(
      "UPDATE staff SET position = 'Class Teacher' WHERE position = 'Class/Subject Teacher'",
    );
  },
};
