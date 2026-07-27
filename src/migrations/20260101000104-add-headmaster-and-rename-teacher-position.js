'use strict';

// Adds 'Headmaster'/'Assistant Headmaster' as distinct position options
// (some schools use this title instead of 'Headteacher') and renames
// 'Class/Subject Teacher' (see 20260101000072-combine-staff-teacher-positions.js)
// to the simpler 'Teacher'. Same "look up the auto-named CHECK constraint,
// drop it, backfill, recreate" pattern as that earlier migration, since SQL
// Server doesn't let you ALTER a CHECK constraint's list in place.
module.exports = {
  up: async (queryInterface) => {
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
      "UPDATE staff SET position = 'Teacher' WHERE position = 'Class/Subject Teacher'",
    );
    await queryInterface.sequelize.query(`
      ALTER TABLE staff ADD CONSTRAINT CK_staff_position CHECK (position IN (
        N'Headteacher', N'Headmaster', N'Assistant Headteacher', N'Assistant Headmaster', N'Teacher',
        N'Administrator', N'Accountant', N'Secretary', N'Librarian', N'Store Keeper', N'Cleaner',
        N'Security', N'Cook', N'Driver', N'Nurse', N'Other'
      ))
    `);
  },

  down: async (queryInterface) => {
    await queryInterface.sequelize.query('ALTER TABLE staff DROP CONSTRAINT CK_staff_position');
    // Lossy: rows on the new 'Headmaster'/'Assistant Headmaster' values have
    // no equivalent in the old list — mapped to the closest defined option
    // ('Headteacher'/'Assistant Headteacher') rather than left invalid.
    await queryInterface.sequelize.query(
      "UPDATE staff SET position = 'Headteacher' WHERE position = 'Headmaster'",
    );
    await queryInterface.sequelize.query(
      "UPDATE staff SET position = 'Assistant Headteacher' WHERE position = 'Assistant Headmaster'",
    );
    await queryInterface.sequelize.query(
      "UPDATE staff SET position = 'Class/Subject Teacher' WHERE position = 'Teacher'",
    );
    await queryInterface.sequelize.query(`
      ALTER TABLE staff ADD CONSTRAINT CK_staff_position CHECK (position IN (
        N'Headteacher', N'Assistant Headteacher', N'Class/Subject Teacher', N'Administrator',
        N'Accountant', N'Secretary', N'Librarian', N'Store Keeper', N'Cleaner', N'Security',
        N'Cook', N'Driver', N'Nurse', N'Other'
      ))
    `);
  },
};
