'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('inventory_stock_movements', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      schoolId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'schools', key: 'id' },
        onDelete: 'CASCADE',
      },
      inventoryItemId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'inventory_items', key: 'id' },
        onDelete: 'NO ACTION',
      },
      type: {
        type: Sequelize.ENUM('RESTOCK', 'ISSUE'),
        allowNull: false,
      },
      quantity: { type: Sequelize.INTEGER, allowNull: false },
      balanceAfter: { type: Sequelize.INTEGER, allowNull: false },
      inventoryRequestId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'inventory_requests', key: 'id' },
        onDelete: 'NO ACTION',
      },
      performedByUserId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'NO ACTION',
      },
      note: { type: Sequelize.STRING(500), allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('inventory_stock_movements', ['schoolId']);
    await queryInterface.addIndex('inventory_stock_movements', ['inventoryItemId', 'createdAt']);
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('inventory_stock_movements');
  },
};
