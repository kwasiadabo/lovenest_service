'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('classes', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      schoolId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'schools', key: 'id' },
        onDelete: 'CASCADE',
      },
      levelId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'levels', key: 'id' },
        // NO ACTION, not CASCADE: schoolId's cascade already deletes a
        // school's classes directly, and SQL Server rejects a second cascade
        // path to the same root (schools -> levels -> classes).
        onDelete: 'NO ACTION',
      },
      name: { type: Sequelize.STRING(50), allowNull: false },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('classes', ['schoolId']);
    await queryInterface.addIndex('classes', ['schoolId', 'levelId', 'name'], { unique: true });
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('classes');
  },
};
