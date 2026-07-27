'use strict';

// Lets a school compute the Exam Scores "classwork" figure automatically from
// the Classwork + Project item grids (assessment_items/assessment_scores)
// instead of a teacher retyping it by hand. MANUAL preserves today's
// behavior with zero migration-time impact on existing schools; COMPUTED
// blends the two item-type averages using classworkWeight/projectWeight
// (same 0-1, sum-to-1 convention as School.caWeight/examWeight).
module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Plain STRING, not Sequelize.ENUM — Sequelize's mssql dialect does not
    // reliably apply NOT NULL/DEFAULT when adding an ENUM column to an
    // existing table (confirmed: caWeight/examWeight's DECIMAL defaults
    // backfilled correctly in the same migration, this one didn't). Matches
    // School.status's existing STRING-with-app-level-validation convention
    // instead (see gradingSettings/service.js's CLASSWORK_SOURCE_MODES).
    await queryInterface.addColumn('schools', 'classworkSourceMode', {
      type: Sequelize.STRING(20), allowNull: false, defaultValue: 'MANUAL',
    });
    await queryInterface.addColumn('schools', 'classworkWeight', {
      type: Sequelize.DECIMAL(4, 3), allowNull: false, defaultValue: 0.5,
    });
    await queryInterface.addColumn('schools', 'projectWeight', {
      type: Sequelize.DECIMAL(4, 3), allowNull: false, defaultValue: 0.5,
    });
  },
  down: async (queryInterface) => {
    await queryInterface.removeColumn('schools', 'projectWeight');
    await queryInterface.removeColumn('schools', 'classworkWeight');
    await queryInterface.removeColumn('schools', 'classworkSourceMode');
  },
};
