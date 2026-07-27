'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('levels', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      schoolId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'schools', key: 'id' },
        onDelete: 'CASCADE',
      },
      name: { type: Sequelize.STRING(50), allowNull: false },
      category: {
        type: Sequelize.ENUM('NURSERY', 'KG', 'PRIMARY', 'JHS'),
        allowNull: false,
      },
      sequenceOrder: { type: Sequelize.INTEGER, allowNull: false },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('levels', ['schoolId']);
    await queryInterface.addIndex('levels', ['schoolId', 'name'], { unique: true });
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('levels');
  },
};
