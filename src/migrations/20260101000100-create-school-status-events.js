'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('school_status_events', {
      id: {
        type: Sequelize.UUID, primaryKey: true, allowNull: false,
      },
      schoolId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'schools', key: 'id' },
        onDelete: 'CASCADE',
      },
      // NO ACTION, not CASCADE — schoolId already cascades from School.
      actorUserId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'NO ACTION',
      },
      action: { type: Sequelize.STRING(40), allowNull: false },
      previousStatus: { type: Sequelize.STRING(20), allowNull: true },
      newStatus: { type: Sequelize.STRING(20), allowNull: true },
      note: { type: Sequelize.STRING(300), allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('school_status_events', ['schoolId']);
    await queryInterface.addIndex('school_status_events', ['createdAt']);
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('school_status_events');
  },
};
