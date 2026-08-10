'use strict';

// The shared audit parent ("Calculation ID" / run) for one batch of
// ranking/percentile/Stanine results — ReferencePopulation, RankingResult,
// PercentileResult and StanineResult all FK back to a row here instead of
// each repeating triggeredBy/calculatedAt/schemeVersion themselves.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('result_calculations', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      schoolId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'schools', key: 'id' },
        onDelete: 'CASCADE',
      },
      gradingSchemeId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'grading_schemes', key: 'id' },
        onDelete: 'NO ACTION',
      },
      // Denormalized snapshot — survives later edits/new versions of the
      // scheme so this run's provenance never silently shifts.
      gradingSchemeVersion: { type: Sequelize.INTEGER, allowNull: false },
      academicYearId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'academic_years', key: 'id' },
        onDelete: 'NO ACTION',
      },
      termId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'terms', key: 'id' },
        onDelete: 'NO ACTION',
      },
      scopeType: {
        type: Sequelize.ENUM('SCHOOL', 'ACADEMIC_LEVEL', 'CLASS', 'SUBJECT', 'STUDENT'),
        allowNull: false,
      },
      scopeRefId: { type: Sequelize.UUID, allowNull: true },
      triggerType: {
        type: Sequelize.ENUM('MANUAL', 'RECALCULATION'),
        allowNull: false,
        defaultValue: 'MANUAL',
      },
      status: {
        type: Sequelize.ENUM('PENDING', 'RUNNING', 'COMPLETED', 'FAILED'),
        allowNull: false,
        defaultValue: 'PENDING',
      },
      triggeredByStaffId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'staff', key: 'id' },
        onDelete: 'NO ACTION',
      },
      startedAt: { type: Sequelize.DATE, allowNull: true },
      completedAt: { type: Sequelize.DATE, allowNull: true },
      studentsProcessed: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      errorMessage: { type: Sequelize.STRING(500), allowNull: true },
      supersedesCalculationId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'result_calculations', key: 'id' },
        onDelete: 'NO ACTION',
      },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('result_calculations', ['schoolId']);
    await queryInterface.addIndex('result_calculations', ['schoolId', 'termId', 'status']);
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('result_calculations');
  },
};
