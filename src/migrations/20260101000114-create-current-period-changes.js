'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('current_period_changes', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      schoolId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'schools', key: 'id' },
        onDelete: 'CASCADE',
      },
      entityType: { type: Sequelize.ENUM('ACADEMIC_YEAR', 'TERM'), allowNull: false },
      previousCurrentId: { type: Sequelize.UUID, allowNull: true },
      previousCurrentLabel: { type: Sequelize.STRING(50), allowNull: true },
      newCurrentId: { type: Sequelize.UUID, allowNull: false },
      newCurrentLabel: { type: Sequelize.STRING(50), allowNull: false },
      changedByUserId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'NO ACTION',
      },
      reason: { type: Sequelize.STRING(500), allowNull: false },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('current_period_changes', ['schoolId']);
    await queryInterface.addIndex('current_period_changes', ['schoolId', 'entityType']);
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('current_period_changes');
  },
};
