'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('newsletters', {
      id: {
        type: Sequelize.UUID, primaryKey: true, allowNull: false,
      },
      schoolId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'schools', key: 'id' },
        onDelete: 'CASCADE',
      },
      title: { type: Sequelize.STRING(150), allowNull: false },
      body: { type: Sequelize.TEXT, allowNull: false },
      publishedAt: { type: Sequelize.DATE, allowNull: false },
      // NO ACTION, not CASCADE — schoolId already cascades from School (same
      // convention as announcements.createdByUserId).
      createdByUserId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'NO ACTION',
      },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('newsletters', ['schoolId']);
    await queryInterface.addIndex('newsletters', ['publishedAt']);
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('newsletters');
  },
};
