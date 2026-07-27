'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('bank_transactions', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      schoolId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'schools', key: 'id' },
        onDelete: 'CASCADE',
      },
      cashAccountId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'cash_accounts', key: 'id' },
        onDelete: 'NO ACTION',
      },
      type: { type: Sequelize.ENUM('DEPOSIT', 'WITHDRAWAL'), allowNull: false },
      amountPesewas: { type: Sequelize.INTEGER, allowNull: false },
      transactionDate: { type: Sequelize.DATEONLY, allowNull: false },
      // The other side of the posting — e.g. Cash on Hand for a cash
      // deposit, an Income account for a grant, an Expense account for a
      // bank charge withdrawal. Never another isCashAccount account — that
      // movement belongs in Cash Transfers instead (see service.js).
      contraAccountId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'accounts', key: 'id' },
        onDelete: 'NO ACTION',
      },
      counterparty: { type: Sequelize.STRING(150), allowNull: true },
      reference: { type: Sequelize.STRING(100), allowNull: true },
      notes: { type: Sequelize.STRING(500), allowNull: true },
      status: { type: Sequelize.ENUM('ACTIVE', 'VOIDED'), allowNull: false, defaultValue: 'ACTIVE' },
      recordedByUserId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'NO ACTION',
      },
      voidedByUserId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'NO ACTION',
      },
      voidedAt: { type: Sequelize.DATE, allowNull: true },
      voidReason: { type: Sequelize.STRING(500), allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('bank_transactions', ['schoolId']);
    await queryInterface.addIndex('bank_transactions', ['cashAccountId']);

    await queryInterface.createTable('bank_reconciliations', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      schoolId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'schools', key: 'id' },
        onDelete: 'CASCADE',
      },
      cashAccountId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'cash_accounts', key: 'id' },
        onDelete: 'NO ACTION',
      },
      statementDate: { type: Sequelize.DATEONLY, allowNull: false },
      statementEndingBalancePesewas: { type: Sequelize.INTEGER, allowNull: false },
      status: { type: Sequelize.ENUM('IN_PROGRESS', 'COMPLETED'), allowNull: false, defaultValue: 'IN_PROGRESS' },
      // Snapshot of the book balance as of statementDate, taken only when
      // the reconciliation completes — not read again after that, mirrors
      // CashAccount.openingBalancePesewas's "recognized once" convention.
      bookBalancePesewas: { type: Sequelize.INTEGER, allowNull: true },
      notes: { type: Sequelize.STRING(500), allowNull: true },
      preparedByUserId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'NO ACTION',
      },
      completedByUserId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'NO ACTION',
      },
      completedAt: { type: Sequelize.DATE, allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('bank_reconciliations', ['schoolId']);
    await queryInterface.addIndex('bank_reconciliations', ['cashAccountId']);

    // Nullable/additive only — every other module posting to journal_lines
    // is unaffected. reconciledAt is only ever set once, at the moment a
    // reconciliation completes (see accounting/service.js#completeBankReconciliation).
    // bankReconciliationId also doubles as the "tentatively selected under
    // this in-progress reconciliation" pointer before completion.
    await queryInterface.addColumn('journal_lines', 'reconciledAt', { type: Sequelize.DATE, allowNull: true });
    await queryInterface.addColumn('journal_lines', 'bankReconciliationId', {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: 'bank_reconciliations', key: 'id' },
      onDelete: 'NO ACTION',
    });
    await queryInterface.addIndex('journal_lines', ['bankReconciliationId']);
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('journal_lines', 'bankReconciliationId');
    await queryInterface.removeColumn('journal_lines', 'reconciledAt');
    await queryInterface.dropTable('bank_reconciliations');
    await queryInterface.dropTable('bank_transactions');
  },
};
