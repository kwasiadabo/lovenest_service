'use strict';

// A school's grading scale (score range -> grade letter -> remark), e.g.
// 0-39 E/Emerging ... 90-100 A+/Excellent. Rows are only persisted once a
// school customizes its scale — see gradingSettings/service.js's
// DEFAULT_GRADE_BANDS fallback for schools with none saved yet.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('grade_bands', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      schoolId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'schools', key: 'id' },
        onDelete: 'CASCADE',
      },
      minScore: { type: Sequelize.INTEGER, allowNull: false },
      maxScore: { type: Sequelize.INTEGER, allowNull: false },
      grade: { type: Sequelize.STRING(5), allowNull: false },
      remark: { type: Sequelize.STRING(50), allowNull: false },
      sortOrder: { type: Sequelize.INTEGER, allowNull: false },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('grade_bands', ['schoolId']);
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('grade_bands');
  },
};
