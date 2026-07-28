'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('staff_appraisals', {
      id: {
        type: Sequelize.UUID, primaryKey: true, allowNull: false,
      },
      schoolId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'schools', key: 'id' },
        onDelete: 'CASCADE',
      },
      // NO ACTION, not CASCADE — schoolId already cascades from School (same
      // convention as staff_documents.staffId).
      staffId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'staff', key: 'id' },
        onDelete: 'NO ACTION',
      },
      reviewerStaffId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'staff', key: 'id' },
        onDelete: 'NO ACTION',
      },
      reviewDate: { type: Sequelize.DATEONLY, allowNull: false },
      rating: { type: Sequelize.ENUM('BEGINNING', 'DEVELOPING', 'PROFICIENT', 'EXCELLING'), allowNull: false },
      comments: { type: Sequelize.STRING(2000), allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('staff_appraisals', ['schoolId']);
    await queryInterface.addIndex('staff_appraisals', ['schoolId', 'staffId']);
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('staff_appraisals');
  },
};
