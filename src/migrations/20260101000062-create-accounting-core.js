'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('accounts', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      schoolId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'schools', key: 'id' },
        onDelete: 'CASCADE',
      },
      code: { type: Sequelize.STRING(10), allowNull: false },
      name: { type: Sequelize.STRING(100), allowNull: false },
      type: {
        type: Sequelize.ENUM('ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE'),
        allowNull: false,
      },
      normalBalance: { type: Sequelize.ENUM('DEBIT', 'CREDIT'), allowNull: false },
      isContra: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      isCashAccount: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      isSystemAccount: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      isActive: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      // NO ACTION — SQL Server disallows a second cascade path from schools
      // to accounts (self-referencing parent already shares the same root).
      parentAccountId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'accounts', key: 'id' },
        onDelete: 'NO ACTION',
      },
      description: { type: Sequelize.STRING(500), allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('accounts', ['schoolId']);
    await queryInterface.addIndex('accounts', ['schoolId', 'code'], { unique: true });

    await queryInterface.createTable('journal_entries', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      schoolId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'schools', key: 'id' },
        onDelete: 'CASCADE',
      },
      entryNumber: { type: Sequelize.STRING(30), allowNull: false },
      entryDate: { type: Sequelize.DATEONLY, allowNull: false },
      description: { type: Sequelize.STRING(500), allowNull: false },
      sourceType: {
        type: Sequelize.ENUM(
          'BILL_CONFIRMATION', 'BILL_PAYMENT', 'ADMISSION_PAYMENT', 'LEVY_PAYMENT',
          'EXPENSE_APPROVAL', 'EXPENSE_PAYMENT', 'CASH_TRANSFER', 'PAYROLL_ACCRUAL',
          'PAYROLL_PAYMENT', 'STATUTORY_REMITTANCE', 'ASSET_PURCHASE', 'DEPRECIATION',
          'ASSET_DISPOSAL', 'MANUAL', 'OPENING_BALANCE', 'PERIOD_CLOSE',
        ),
        allowNull: false,
      },
      // Deliberately not a DB-level FK — sourceId is polymorphic across many
      // tables (Bill, BillPayment, LevyPayment, ExpenseRequest, PayrollRun,
      // FixedAsset, DepreciationEntry, CashTransfer, AcademicYear, or null
      // for MANUAL/OPENING_BALANCE), and must stay valid for drill-down even
      // after a source row (e.g. a deleted BillPayment) is gone.
      sourceId: { type: Sequelize.UUID, allowNull: true },
      status: { type: Sequelize.ENUM('POSTED', 'REVERSED'), allowNull: false, defaultValue: 'POSTED' },
      reversalOfEntryId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'journal_entries', key: 'id' },
        onDelete: 'NO ACTION',
      },
      academicYearId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'academic_years', key: 'id' },
        onDelete: 'NO ACTION',
      },
      termId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'terms', key: 'id' },
        onDelete: 'NO ACTION',
      },
      createdByUserId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'NO ACTION',
      },
      postedAt: { type: Sequelize.DATE, allowNull: false },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('journal_entries', ['schoolId']);
    await queryInterface.addIndex('journal_entries', ['schoolId', 'sourceType', 'sourceId']);
    await queryInterface.addIndex('journal_entries', ['schoolId', 'entryDate']);
    await queryInterface.addIndex('journal_entries', ['schoolId', 'entryNumber'], { unique: true });

    await queryInterface.createTable('journal_lines', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      schoolId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'schools', key: 'id' },
        onDelete: 'CASCADE',
      },
      journalEntryId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'journal_entries', key: 'id' },
        // NO ACTION, not CASCADE — schoolId already cascades from School
        // directly, and journal_entries.schoolId also cascades from School,
        // so a second cascade path through journalEntryId would give SQL
        // Server two cascade routes to the same root table. Journal entries
        // are never deleted in practice (see ledgerPoster.js — only
        // reversed), so no cascade behavior is lost in practice.
        onDelete: 'NO ACTION',
      },
      accountId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'accounts', key: 'id' },
        onDelete: 'NO ACTION',
      },
      debitPesewas: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      creditPesewas: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      description: { type: Sequelize.STRING(255), allowNull: true },
      studentId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'students', key: 'id' },
        onDelete: 'NO ACTION',
      },
      staffId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'staff', key: 'id' },
        onDelete: 'NO ACTION',
      },
      lineOrder: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('journal_lines', ['schoolId']);
    await queryInterface.addIndex('journal_lines', ['journalEntryId']);
    await queryInterface.addIndex('journal_lines', ['accountId']);
    await queryInterface.addIndex('journal_lines', ['studentId']);
    await queryInterface.addIndex('journal_lines', ['staffId']);

    await queryInterface.createTable('cash_accounts', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      schoolId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'schools', key: 'id' },
        onDelete: 'CASCADE',
      },
      name: { type: Sequelize.STRING(100), allowNull: false },
      accountId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'accounts', key: 'id' },
        onDelete: 'NO ACTION',
        unique: true,
      },
      kind: { type: Sequelize.ENUM('CASH', 'BANK', 'MOBILE_MONEY'), allowNull: false },
      bankName: { type: Sequelize.STRING(100), allowNull: true },
      accountNumber: { type: Sequelize.STRING(50), allowNull: true },
      openingBalancePesewas: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      isActive: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('cash_accounts', ['schoolId']);

    await queryInterface.createTable('cash_transfers', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      schoolId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'schools', key: 'id' },
        onDelete: 'CASCADE',
      },
      fromCashAccountId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'cash_accounts', key: 'id' },
        onDelete: 'NO ACTION',
      },
      toCashAccountId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'cash_accounts', key: 'id' },
        onDelete: 'NO ACTION',
      },
      amountPesewas: { type: Sequelize.INTEGER, allowNull: false },
      transferDate: { type: Sequelize.DATEONLY, allowNull: false },
      reference: { type: Sequelize.STRING(100), allowNull: true },
      notes: { type: Sequelize.STRING(500), allowNull: true },
      recordedByUserId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'NO ACTION',
      },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('cash_transfers', ['schoolId']);
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('cash_transfers');
    await queryInterface.dropTable('cash_accounts');
    await queryInterface.dropTable('journal_lines');
    await queryInterface.dropTable('journal_entries');
    await queryInterface.dropTable('accounts');
  },
};
