'use strict';

// The previous migration (...045) specified allowNull:false + defaultValue
// on `status` via queryInterface.addColumn, but MSSQL silently added the
// column as nullable with no DEFAULT constraint instead of enforcing either
// — every pre-existing row was left with status = NULL rather than 'DRAFT'.
// This backfills those rows and then applies the constraints directly via
// raw DDL, which MSSQL does honor.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.sequelize.query("UPDATE exam_scores SET status = 'DRAFT' WHERE status IS NULL");
    await queryInterface.sequelize.query('ALTER TABLE exam_scores ALTER COLUMN status VARCHAR(255) NOT NULL');
    await queryInterface.sequelize.query("ALTER TABLE exam_scores ADD CONSTRAINT DF_exam_scores_status DEFAULT 'DRAFT' FOR status");
  },

  down: async (queryInterface) => {
    await queryInterface.sequelize.query('ALTER TABLE exam_scores DROP CONSTRAINT DF_exam_scores_status');
    await queryInterface.sequelize.query('ALTER TABLE exam_scores ALTER COLUMN status VARCHAR(255) NULL');
  },
};
