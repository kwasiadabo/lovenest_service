'use strict';

// One row per student per subject (or overall, when subjectId is null) per
// ResultCalculation run. stanine is null (with isInsufficientPopulation =
// true) whenever the reference population is below the scheme's configured
// minimum — never a misleading value. See the grading-engine architecture
// notes for the percentile-to-stanine band table used to derive this
// (norm-referenced, never keyed to a fixed raw percentage).
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('stanine_results', {
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
      stanine: { type: Sequelize.INTEGER, allowNull: true },
      isInsufficientPopulation: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      minimumRequiredPopulation: { type: Sequelize.INTEGER, allowNull: false },
      rawScore: { type: Sequelize.DECIMAL(6, 2), allowNull: false },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('stanine_results', ['schoolId']);
    await queryInterface.addIndex('stanine_results', ['resultCalculationId']);
    await queryInterface.addIndex(
      'stanine_results',
      ['schoolId', 'studentId', 'subjectId', 'termId'],
      { name: 'stanine_results_lookup' },
    );
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('stanine_results');
  },
};
