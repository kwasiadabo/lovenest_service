'use strict';

// One row per scope+subject cohort touched by a ResultCalculation run —
// caches the distribution stats (mean/stdDev) that PercentileResult and
// StanineResult rows for that cohort are derived from, so the same
// distribution isn't recomputed per student.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('reference_populations', {
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
      scope: {
        type: Sequelize.ENUM('CLASS', 'STREAM', 'YEAR_GROUP', 'SCHOOL', 'ACADEMIC_LEVEL', 'CUSTOM_COHORT'),
        allowNull: false,
      },
      // e.g. classId; null for SCHOOL scope.
      scopeRefId: { type: Sequelize.UUID, allowNull: true },
      // null = overall/whole-card population, not a single subject.
      subjectId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'subjects', key: 'id' },
        onDelete: 'NO ACTION',
      },
      termId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'terms', key: 'id' },
        onDelete: 'NO ACTION',
      },
      populationSize: { type: Sequelize.INTEGER, allowNull: false },
      meanScore: { type: Sequelize.DECIMAL(6, 2), allowNull: false },
      stdDevScore: { type: Sequelize.DECIMAL(6, 2), allowNull: false },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('reference_populations', ['schoolId']);
    await queryInterface.addIndex('reference_populations', ['resultCalculationId']);
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('reference_populations');
  },
};
