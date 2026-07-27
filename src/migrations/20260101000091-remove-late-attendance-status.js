'use strict';

// Removes LATE from attendance status — schools now mark Present/Absent
// only. The CHECK constraint enforcing the enum was auto-named by SQL
// Server at table-creation time (see the original create-attendance-records
// migration's Sequelize.ENUM), so its exact name isn't known/portable across
// deployments — it's looked up dynamically here, same pattern as
// 20260101000072-combine-staff-teacher-positions.js.
module.exports = {
  up: async (queryInterface) => {
    // The old constraint must be dropped before the backfill below — it
    // still requires LATE to be a valid value until it's replaced, so
    // updating existing LATE rows away from it first would itself violate
    // the constraint... the correct order is: drop constraint, backfill,
    // then add the narrowed constraint (matches the staff-position precedent).
    await queryInterface.sequelize.query(`
      DECLARE @constraintName NVARCHAR(200);
      SELECT @constraintName = cc.name
      FROM sys.check_constraints cc
      INNER JOIN sys.columns col ON col.object_id = cc.parent_object_id AND col.column_id = cc.parent_column_id
      WHERE cc.parent_object_id = OBJECT_ID('attendance_records') AND col.name = 'status';
      IF @constraintName IS NOT NULL
        EXEC('ALTER TABLE attendance_records DROP CONSTRAINT [' + @constraintName + ']');
    `);
    // A late arrival still means the student attended — backfilled to
    // PRESENT rather than ABSENT so historical attendance rates aren't
    // retroactively worsened for students who simply showed up late.
    await queryInterface.sequelize.query(
      "UPDATE attendance_records SET status = 'PRESENT' WHERE status = 'LATE'",
    );
    await queryInterface.sequelize.query(`
      ALTER TABLE attendance_records ADD CONSTRAINT CK_attendance_records_status
        CHECK (status IN (N'PRESENT', N'ABSENT'))
    `);
  },

  down: async (queryInterface) => {
    await queryInterface.sequelize.query('ALTER TABLE attendance_records DROP CONSTRAINT CK_attendance_records_status');
    await queryInterface.sequelize.query(`
      ALTER TABLE attendance_records ADD CONSTRAINT CK_attendance_records_status
        CHECK (status IN (N'PRESENT', N'ABSENT', N'LATE'))
    `);
    // Lossy: a row backfilled from LATE to PRESENT can't be distinguished
    // from a row that was always PRESENT — this down migration restores the
    // constraint only, not the original LATE marks.
  },
};
