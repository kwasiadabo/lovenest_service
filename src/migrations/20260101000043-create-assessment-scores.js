'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('assessment_scores', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      schoolId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'schools', key: 'id' },
        onDelete: 'CASCADE',
      },
      // NO ACTION, not CASCADE — assessment_items itself already cascades
      // from schools, so a CASCADE here would create a second cascade path
      // to the same root table (the same class of MSSQL rejection hit
      // earlier with message_recipients.batchId). Orphaned scores are
      // cleaned up explicitly in the service layer when an item is deleted.
      assessmentItemId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'assessment_items', key: 'id' },
        onDelete: 'NO ACTION',
      },
      studentId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'students', key: 'id' },
        onDelete: 'NO ACTION',
      },
      rawScore: { type: Sequelize.DECIMAL(6, 2), allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('assessment_scores', ['schoolId']);
    await queryInterface.addIndex('assessment_scores', ['assessmentItemId', 'studentId'], { unique: true });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('assessment_scores');
  },
};
