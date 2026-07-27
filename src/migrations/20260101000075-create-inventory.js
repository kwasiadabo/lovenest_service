'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('inventory_items', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      schoolId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'schools', key: 'id' },
        onDelete: 'CASCADE',
      },
      name: { type: Sequelize.STRING(150), allowNull: false },
      category: {
        type: Sequelize.ENUM('UNIFORM', 'TEXTBOOK', 'STATIONERY', 'OTHER'),
        allowNull: false,
        defaultValue: 'OTHER',
      },
      unit: { type: Sequelize.STRING(30), allowNull: false, defaultValue: 'pcs' },
      currentStockQty: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      reorderLevel: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('inventory_items', ['schoolId']);
    await queryInterface.addIndex('inventory_items', ['schoolId', 'name'], { unique: true });

    await queryInterface.createTable('inventory_requests', {
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
      quantity: { type: Sequelize.INTEGER, allowNull: false },
      purpose: { type: Sequelize.STRING(500), allowNull: false },
      status: {
        type: Sequelize.ENUM('PENDING', 'APPROVED', 'REJECTED'),
        allowNull: false,
        defaultValue: 'PENDING',
      },
      requestedByUserId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'NO ACTION',
      },
      reviewedByUserId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'NO ACTION',
      },
      reviewedAt: { type: Sequelize.DATE, allowNull: true },
      rejectionReason: { type: Sequelize.STRING(500), allowNull: true },
      // Separate from `status` the same way ExpenseRequest separates
      // approval from payment — APPROVED only authorizes the request, stock
      // doesn't actually leave the store until issuedByUserId/issuedAt.
      fulfilmentStatus: {
        type: Sequelize.ENUM('UNFULFILLED', 'ISSUED'),
        allowNull: false,
        defaultValue: 'UNFULFILLED',
      },
      issuedAt: { type: Sequelize.DATE, allowNull: true },
      issuedByUserId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'NO ACTION',
      },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('inventory_requests', ['schoolId']);
    await queryInterface.addIndex('inventory_requests', ['inventoryItemId']);
    await queryInterface.addIndex('inventory_requests', ['status']);
    await queryInterface.addIndex('inventory_requests', ['requestedByUserId']);
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('inventory_requests');
    await queryInterface.dropTable('inventory_items');
  },
};
