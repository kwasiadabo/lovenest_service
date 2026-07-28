'use strict';

// Migration ...110 specified allowNull:false + defaultValue on Staff.status
// via queryInterface.addColumn, but MSSQL silently added the column as
// nullable with no DEFAULT constraint instead of enforcing either — same
// failure mode already hit once before and documented in
// 20260101000046-fix-exam-scores-status-default.js. Every pre-existing
// staff row was left with status = NULL rather than 'ACTIVE'. This
// backfills those rows and then applies the constraints directly via raw
// DDL, which MSSQL does honor. The CHECK constraint restricting status to
// ACTIVE/SEPARATED already exists from migration ...110 and is untouched
// here.
//
// ALTER COLUMN on MSSQL fails if any index depends on the column, so the
// ['schoolId','status'] index from migration ...110 has to be dropped and
// recreated around the ALTER.
module.exports = {
  up: async (queryInterface) => {
    await queryInterface.sequelize.query("UPDATE staff SET status = 'ACTIVE' WHERE status IS NULL");
    await queryInterface.removeIndex('staff', ['schoolId', 'status']);
    await queryInterface.sequelize.query('ALTER TABLE staff ALTER COLUMN status VARCHAR(255) NOT NULL');
    await queryInterface.sequelize.query("ALTER TABLE staff ADD CONSTRAINT DF_staff_status DEFAULT 'ACTIVE' FOR status");
    await queryInterface.addIndex('staff', ['schoolId', 'status']);
  },

  down: async (queryInterface) => {
    await queryInterface.removeIndex('staff', ['schoolId', 'status']);
    await queryInterface.sequelize.query('ALTER TABLE staff DROP CONSTRAINT DF_staff_status');
    await queryInterface.sequelize.query('ALTER TABLE staff ALTER COLUMN status VARCHAR(255) NULL');
    await queryInterface.addIndex('staff', ['schoolId', 'status']);
  },
};
