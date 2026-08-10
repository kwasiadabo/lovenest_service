'use strict';

// One row per student per subject (or overall, when subjectId is null) per
// ResultCalculation run. percentile uses the mean/mid-rank formula:
// (countBelow + 0.5*countEqual) / populationSize * 100 — not the same
// number as raw percentage, see the grading-engine architecture notes.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('percentile_results', {
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
      referencePopulationId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'reference_populations', key: 'id' },
        onDelete: 'NO ACTION',
      },
      studentId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'students', key: 'id' },
        onDelete: 'NO ACTION',
      },
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
      percentile: { type: Sequelize.DECIMAL(5, 2), allowNull: false },
      rawScore: { type: Sequelize.DECIMAL(6, 2), allowNull: false },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('percentile_results', ['schoolId']);
    await queryInterface.addIndex('percentile_results', ['resultCalculationId']);
    await queryInterface.addIndex(
      'percentile_results',
      ['schoolId', 'studentId', 'subjectId', 'termId'],
      { name: 'percentile_results_lookup' },
    );
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('percentile_results');
  },
};
