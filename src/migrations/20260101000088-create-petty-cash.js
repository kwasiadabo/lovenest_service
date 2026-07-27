'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('petty_cash_funds', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      schoolId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'schools', key: 'id' },
        onDelete: 'CASCADE',
      },
      name: { type: Sequelize.STRING(100), allowNull: false, defaultValue: 'Petty Cash' },
      custodianStaffId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'staff', key: 'id' },
        onDelete: 'NO ACTION',
      },
      cashAccountId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'cash_accounts', key: 'id' },
        onDelete: 'NO ACTION',
        unique: true,
      },
      imprestFloatPesewas: { type: Sequelize.INTEGER, allowNull: false },
      isActive: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      createdByUserId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'NO ACTION',
      },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    // One fund per school — matches the confirmed "single fund" scope.
    await queryInterface.addIndex('petty_cash_funds', ['schoolId'], { unique: true });

    // Created before vouchers (below) so vouchers.replenishmentId can carry
    // an ordinary inline FK instead of a deferred addConstraint.
    await queryInterface.createTable('petty_cash_replenishments', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      schoolId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'schools', key: 'id' },
        onDelete: 'CASCADE',
      },
      pettyCashFundId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'petty_cash_funds', key: 'id' },
        onDelete: 'NO ACTION',
      },
      replenishmentDate: { type: Sequelize.DATEONLY, allowNull: false },
      sourceCashAccountId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'cash_accounts', key: 'id' },
        onDelete: 'NO ACTION',
      },
      totalAmountPesewas: { type: Sequelize.INTEGER, allowNull: false },
      reference: { type: Sequelize.STRING(100), allowNull: true },
      recordedByUserId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'NO ACTION',
      },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('petty_cash_replenishments', ['schoolId']);
    await queryInterface.addIndex('petty_cash_replenishments', ['pettyCashFundId']);

    await queryInterface.createTable('petty_cash_vouchers', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      schoolId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'schools', key: 'id' },
        onDelete: 'CASCADE',
      },
      pettyCashFundId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'petty_cash_funds', key: 'id' },
        onDelete: 'NO ACTION',
      },
      voucherNumber: { type: Sequelize.STRING(30), allowNull: false },
      voucherDate: { type: Sequelize.DATEONLY, allowNull: false },
      paidTo: { type: Sequelize.STRING(200), allowNull: false },
      purpose: { type: Sequelize.STRING(500), allowNull: false },
      expenseItemId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'expense_items', key: 'id' },
        onDelete: 'NO ACTION',
      },
      amountPesewas: { type: Sequelize.INTEGER, allowNull: false },
      recordedByUserId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'NO ACTION',
      },
      status: { type: Sequelize.ENUM('ACTIVE', 'VOIDED'), allowNull: false, defaultValue: 'ACTIVE' },
      reimbursedAt: { type: Sequelize.DATE, allowNull: true },
      // NO ACTION — replenishments and vouchers both cascade from School
      // independently; this FK just links a voucher to the replenishment
      // that reimbursed it.
      replenishmentId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'petty_cash_replenishments', key: 'id' },
        onDelete: 'NO ACTION',
      },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('petty_cash_vouchers', ['schoolId']);
    await queryInterface.addIndex('petty_cash_vouchers', ['pettyCashFundId']);
    await queryInterface.addIndex('petty_cash_vouchers', ['schoolId', 'voucherNumber'], { unique: true });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('petty_cash_vouchers');
    await queryInterface.dropTable('petty_cash_replenishments');
    await queryInterface.dropTable('petty_cash_funds');
  },
};
