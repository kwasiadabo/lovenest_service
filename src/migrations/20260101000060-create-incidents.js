'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('incidents', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      schoolId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'schools', key: 'id' },
        onDelete: 'CASCADE',
      },
      subjectType: { type: Sequelize.STRING(10), allowNull: false },
      // Exactly one of studentId/staffId is set, matching subjectType — enforced
      // at the service layer (see incidents/service.js), not a DB constraint.
      studentId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'students', key: 'id' },
        onDelete: 'NO ACTION',
      },
      staffId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'staff', key: 'id' },
        onDelete: 'NO ACTION',
      },
      incidentDate: { type: Sequelize.DATEONLY, allowNull: false },
      category: { type: Sequelize.STRING(30), allowNull: false },
      severity: { type: Sequelize.STRING(10), allowNull: false, defaultValue: 'MINOR' },
      description: { type: Sequelize.STRING(2000), allowNull: false },
      reportedByUserId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'NO ACTION',
      },
      status: { type: Sequelize.STRING(10), allowNull: false, defaultValue: 'OPEN' },
      actionType: { type: Sequelize.STRING(30), allowNull: true },
      actionDate: { type: Sequelize.DATEONLY, allowNull: true },
      actionDetails: { type: Sequelize.STRING(500), allowNull: true },
      actionStatus: { type: Sequelize.STRING(10), allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('incidents', ['schoolId']);
    await queryInterface.addIndex('incidents', ['schoolId', 'studentId']);
    await queryInterface.addIndex('incidents', ['schoolId', 'staffId']);
    await queryInterface.addIndex('incidents', ['schoolId', 'status']);
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('incidents');
  },
};
