'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('transport_payments', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      schoolId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'schools', key: 'id' },
        onDelete: 'CASCADE',
      },
      transportInvoiceId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'transport_invoices', key: 'id' },
        onDelete: 'NO ACTION',
      },
      studentId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'students', key: 'id' },
        onDelete: 'NO ACTION',
      },
      amountPesewas: { type: Sequelize.INTEGER, allowNull: false },
      method: { type: Sequelize.ENUM('CASH', 'MOBILE_MONEY', 'BANK_TRANSFER', 'OTHER'), allowNull: false },
      reference: { type: Sequelize.STRING(100), allowNull: true },
      paidDate: { type: Sequelize.DATEONLY, allowNull: false },
      notes: { type: Sequelize.STRING(500), allowNull: true },
      recordedByUserId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'NO ACTION',
      },
      receiptNumber: { type: Sequelize.STRING(30), allowNull: false },
      lastEditedByUserId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'NO ACTION',
      },
      cashAccountId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'cash_accounts', key: 'id' },
        onDelete: 'NO ACTION',
      },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('transport_payments', ['schoolId']);
    await queryInterface.addIndex('transport_payments', ['transportInvoiceId']);
    await queryInterface.addIndex('transport_payments', ['studentId']);
    await queryInterface.addIndex('transport_payments', ['schoolId', 'receiptNumber'], { unique: true });

    await queryInterface.createTable('transport_payment_revisions', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      schoolId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'schools', key: 'id' },
        onDelete: 'CASCADE',
      },
      transportPaymentId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'transport_payments', key: 'id' },
        onDelete: 'NO ACTION',
      },
      changedByUserId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'NO ACTION',
      },
      reason: { type: Sequelize.STRING(500), allowNull: false },
      previousValues: { type: Sequelize.TEXT, allowNull: false },
      newValues: { type: Sequelize.TEXT, allowNull: false },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('transport_payment_revisions', ['schoolId']);
    await queryInterface.addIndex('transport_payment_revisions', ['transportPaymentId']);
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('transport_payment_revisions');
    await queryInterface.dropTable('transport_payments');
  },
};
