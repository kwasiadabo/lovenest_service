'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('subjects', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      schoolId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'schools', key: 'id' },
        onDelete: 'CASCADE',
      },
      name: { type: Sequelize.STRING(100), allowNull: false },
      code: { type: Sequelize.STRING(20), allowNull: false },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('subjects', ['schoolId']);
    await queryInterface.addIndex('subjects', ['schoolId', 'name'], { unique: true });
    await queryInterface.addIndex('subjects', ['schoolId', 'code'], { unique: true });
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('subjects');
  },
};
