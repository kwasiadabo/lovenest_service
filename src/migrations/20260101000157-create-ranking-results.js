'use strict';

// Persisted, audited class/stream/year/subject/school ranking — parallel to
// (not a replacement for) reportCards/service.js's existing on-read
// getClassRanking/getSubjectStats, which keep driving today's report cards
// unchanged. This table exists so Stanine/Percentile have a stable,
// versioned rank to audit against, per the brief's traceability requirement.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('ranking_results', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      schoolId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'schools', key: 'id' },
        onDelete: 'CASCADE',
      },
      resultCalculationId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'result_calculations', key: 'id' },
        onDelete: 'NO ACTION',
      },
      studentId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'students', key: 'id' },
        onDelete: 'NO ACTION',
      },
      // null = overall/whole-card ranking, not a single subject.
      subjectId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'subjects', key: 'id' },
        onDelete: 'NO ACTION',
      },
      // Denormalized so "latest ranking for this student" can be queried
      // directly without joining back through result_calculations.
      termId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'terms', key: 'id' },
        onDelete: 'NO ACTION',
      },
      scope: {
        type: Sequelize.ENUM('CLASS', 'STREAM', 'YEAR_GROUP', 'SUBJECT', 'SCHOOL'),
        allowNull: false,
      },
      scopeRefId: { type: Sequelize.UUID, allowNull: true },
      // Snapshot of the scheme's setting at calculation time.
      rankingMethod: {
        type: Sequelize.ENUM('COMPETITION', 'DENSE', 'AVERAGE'),
        allowNull: false,
      },
      position: { type: Sequelize.INTEGER, allowNull: false },
      // Only populated when rankingMethod = AVERAGE.
      positionDecimal: { type: Sequelize.DECIMAL(6, 2), allowNull: true },
      tieGroupSize: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
      populationSize: { type: Sequelize.INTEGER, allowNull: false },
      rawScore: { type: Sequelize.DECIMAL(6, 2), allowNull: false },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('ranking_results', ['schoolId']);
    await queryInterface.addIndex('ranking_results', ['resultCalculationId']);
    await queryInterface.addIndex(
      'ranking_results',
      ['schoolId', 'studentId', 'subjectId', 'termId', 'scope'],
      { name: 'ranking_results_lookup' },
    );
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('ranking_results');
  },
};
