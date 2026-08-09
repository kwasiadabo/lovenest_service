'use strict';

// Re-adds LATE as a valid attendance status — the school now wants Late
// tracked separately from Present (with its own reason), reversing
// 20260101000091-remove-late-attendance-status.js's earlier removal. That
// migration explicitly named the constraint CK_attendance_records_status
// when it added it, so — unlike 91's own dynamic lookup for the original
// auto-generated constraint — the name here is known and can be dropped
// directly. This is forward-only: unlike 91, there's no backfill, since
// widening the allowed set can't strand any existing data.
module.exports = {
  up: async (queryInterface) => {
    await queryInterface.sequelize.query('ALTER TABLE attendance_records DROP CONSTRAINT CK_attendance_records_status');
    await queryInterface.sequelize.query(`
      ALTER TABLE attendance_records ADD CONSTRAINT CK_attendance_records_status
        CHECK (status IN (N'PRESENT', N'ABSENT', N'LATE'))
    `);
  },

  down: async (queryInterface) => {
    // Same lossy caveat as 91's own down migration: any LATE rows created
    // while this constraint was active would need to be dealt with before
    // re-narrowing, which this down migration deliberately does not do
    // (rolling back is expected to happen before real LATE data exists).
    await queryInterface.sequelize.query('ALTER TABLE attendance_records DROP CONSTRAINT CK_attendance_records_status');
    await queryInterface.sequelize.query(`
      ALTER TABLE attendance_records ADD CONSTRAINT CK_attendance_records_status
        CHECK (status IN (N'PRESENT', N'ABSENT'))
    `);
  },
};
