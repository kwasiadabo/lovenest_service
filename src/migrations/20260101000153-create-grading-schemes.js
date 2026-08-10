'use strict';

// Versioned config container for the new Ranking/Percentile/Stanine engine.
// Deliberately independent of the existing grade_bands/School.caWeight
// config — Grade calculation (CA+Exam, letter grade) stays untouched; this
// only governs the new relative-performance capabilities layered on top.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('grading_schemes', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      schoolId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'schools', key: 'id' },
        onDelete: 'CASCADE',
      },
      name: { type: Sequelize.STRING(120), allowNull: false },
      // null = applies to every level in the school.
      academicLevelId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'levels', key: 'id' },
        onDelete: 'NO ACTION',
      },
      version: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
      status: {
        type: Sequelize.ENUM('DRAFT', 'ACTIVE', 'ARCHIVED'),
        allowNull: false,
        defaultValue: 'DRAFT',
      },
      // Previous version this one replaces, so history stays traceable.
      supersedesSchemeId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'grading_schemes', key: 'id' },
        onDelete: 'NO ACTION',
      },
      effectiveAcademicYearId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'academic_years', key: 'id' },
        onDelete: 'NO ACTION',
      },
      rankingEnabled: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      rankingMethod: {
        type: Sequelize.ENUM('COMPETITION', 'DENSE', 'AVERAGE'),
        allowNull: false,
        defaultValue: 'COMPETITION',
      },
      percentileEnabled: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      // Off by default — schools must deliberately opt in to Stanine.
      stanineEnabled: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      stanineMinPopulation: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 30 },
      stanineDefaultReferenceScope: {
        type: Sequelize.ENUM('CLASS', 'STREAM', 'YEAR_GROUP', 'SCHOOL', 'ACADEMIC_LEVEL', 'CUSTOM_COHORT'),
        allowNull: false,
        defaultValue: 'YEAR_GROUP',
      },
      showPositionOnReportCard: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      showPercentileOnReportCard: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      showStanineOnReportCard: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      createdByStaffId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'staff', key: 'id' },
        onDelete: 'NO ACTION',
      },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('grading_schemes', ['schoolId']);
    await queryInterface.addIndex('grading_schemes', ['schoolId', 'academicLevelId', 'status']);
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('grading_schemes');
  },
};
