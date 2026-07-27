'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('expense_items', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      schoolId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'schools', key: 'id' },
        onDelete: 'CASCADE',
      },
      name: { type: Sequelize.STRING(100), allowNull: false },
      category: {
        type: Sequelize.ENUM('UTILITIES', 'SUPPLIES', 'MAINTENANCE', 'TRANSPORT', 'SALARIES', 'OTHER'),
        allowNull: false,
        defaultValue: 'OTHER',
      },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('expense_items', ['schoolId']);
    await queryInterface.addIndex('expense_items', ['schoolId', 'name'], { unique: true });

    await queryInterface.createTable('expense_requests', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      schoolId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'schools', key: 'id' },
        onDelete: 'CASCADE',
      },
      // NO ACTION, not CASCADE — schoolId already cascades from School, and
      // SQL Server rejects a second cascade path to the same root table
      // (same convention as bill_items.billId / levy_class_amounts.levyId).
      expenseItemId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'expense_items', key: 'id' },
        onDelete: 'NO ACTION',
      },
      amountPesewas: { type: Sequelize.INTEGER, allowNull: false },
      description: { type: Sequelize.STRING(500), allowNull: false },
      expenseDate: { type: Sequelize.DATEONLY, allowNull: false },
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
      paymentMethod: {
        type: Sequelize.ENUM('CASH', 'MOBILE_MONEY', 'BANK_TRANSFER', 'OTHER'),
        allowNull: true,
      },
      paymentReference: { type: Sequelize.STRING(100), allowNull: true },
      paidDate: { type: Sequelize.DATEONLY, allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('expense_requests', ['schoolId']);
    await queryInterface.addIndex('expense_requests', ['expenseItemId']);
    await queryInterface.addIndex('expense_requests', ['status']);
    await queryInterface.addIndex('expense_requests', ['requestedByUserId']);
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('expense_requests');
    await queryInterface.dropTable('expense_items');
  },
};
