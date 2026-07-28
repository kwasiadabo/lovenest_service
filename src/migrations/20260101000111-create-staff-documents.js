'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('staff_documents', {
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
      // convention as payroll's staffId reference).
      staffId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'staff', key: 'id' },
        onDelete: 'NO ACTION',
      },
      documentType: { type: Sequelize.ENUM('CONTRACT', 'ID', 'CERTIFICATE', 'OTHER'), allowNull: false },
      title: { type: Sequelize.STRING, allowNull: false },
      fileUrl: { type: Sequelize.STRING, allowNull: false },
      issueDate: { type: Sequelize.DATEONLY, allowNull: true },
      expiryDate: { type: Sequelize.DATEONLY, allowNull: true },
      notes: { type: Sequelize.STRING(500), allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('staff_documents', ['schoolId']);
    await queryInterface.addIndex('staff_documents', ['schoolId', 'staffId']);
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('staff_documents');
  },
};
