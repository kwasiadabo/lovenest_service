'use strict';

// A grading scheme's performance-band labels (e.g. 80-100 "Excellent"),
// deliberately independent of grade_bands' letter grades — a school can
// change its grade scale without changing performance descriptions, and
// vice versa. Same contiguous-0-to-100 validation spirit as GradeBand,
// enforced app-side in the future grading-engine service, not here.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('performance_levels', {
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
      minScore: { type: Sequelize.INTEGER, allowNull: false },
      maxScore: { type: Sequelize.INTEGER, allowNull: false },
      label: { type: Sequelize.STRING(50), allowNull: false },
      sortOrder: { type: Sequelize.INTEGER, allowNull: false },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('performance_levels', ['schoolId']);
    await queryInterface.addIndex('performance_levels', ['gradingSchemeId']);
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('performance_levels');
  },
};
