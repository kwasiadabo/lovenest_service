'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('issue_messages', {
      id: {
        type: Sequelize.UUID, primaryKey: true, allowNull: false,
      },
      schoolId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'schools', key: 'id' },
        onDelete: 'CASCADE',
      },
      // NO ACTION, not CASCADE — schoolId already cascades from School, and
      // SQL Server rejects a second cascade path to the same root table.
      issueId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'issues', key: 'id' },
        onDelete: 'NO ACTION',
      },
      authorUserId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'NO ACTION',
      },
      authorRole: { type: Sequelize.ENUM('PARENT', 'STAFF'), allowNull: false },
      body: { type: Sequelize.TEXT, allowNull: false },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('issue_messages', ['schoolId']);
    await queryInterface.addIndex('issue_messages', ['schoolId', 'issueId']);
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('issue_messages');
  },
};
