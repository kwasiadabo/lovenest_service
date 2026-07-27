'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('levies', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      schoolId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'schools', key: 'id' },
        onDelete: 'CASCADE',
      },
      academicYearId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'academic_years', key: 'id' },
        onDelete: 'NO ACTION',
      },
      name: { type: Sequelize.STRING(100), allowNull: false },
      description: { type: Sequelize.STRING(500), allowNull: true },
      targetType: { type: Sequelize.ENUM('SCHOOL', 'CLASS'), allowNull: false },
      amountPesewas: { type: Sequelize.INTEGER, allowNull: false },
      startDate: { type: Sequelize.DATEONLY, allowNull: true },
      dueDate: { type: Sequelize.DATEONLY, allowNull: true },
      status: { type: Sequelize.ENUM('ACTIVE', 'CLOSED'), allowNull: false, defaultValue: 'ACTIVE' },
      createdByUserId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'NO ACTION',
      },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('levies', ['schoolId']);
    await queryInterface.addIndex('levies', ['academicYearId']);
    await queryInterface.addIndex('levies', ['status']);

    await queryInterface.createTable('levy_class_amounts', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      schoolId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'schools', key: 'id' },
        onDelete: 'CASCADE',
      },
      // NO ACTION, not CASCADE — schoolId already cascades from School, and
      // SQL Server rejects a second cascade path to the same root table
      // (same convention as bill_items.billId).
      levyId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'levies', key: 'id' },
        onDelete: 'NO ACTION',
      },
      classId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'classes', key: 'id' },
        onDelete: 'NO ACTION',
      },
      amountPesewas: { type: Sequelize.INTEGER, allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('levy_class_amounts', ['schoolId']);
    await queryInterface.addIndex('levy_class_amounts', ['levyId']);
    await queryInterface.addIndex('levy_class_amounts', ['classId']);
    await queryInterface.addIndex('levy_class_amounts', ['levyId', 'classId'], { unique: true });

    await queryInterface.createTable('levy_payments', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      schoolId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'schools', key: 'id' },
        onDelete: 'CASCADE',
      },
      levyId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'levies', key: 'id' },
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
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('levy_payments', ['schoolId']);
    await queryInterface.addIndex('levy_payments', ['levyId']);
    await queryInterface.addIndex('levy_payments', ['studentId']);
    await queryInterface.addIndex('levy_payments', ['schoolId', 'receiptNumber'], { unique: true });

    await queryInterface.createTable('levy_payment_revisions', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      schoolId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'schools', key: 'id' },
        onDelete: 'CASCADE',
      },
      levyPaymentId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'levy_payments', key: 'id' },
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
    await queryInterface.addIndex('levy_payment_revisions', ['schoolId']);
    await queryInterface.addIndex('levy_payment_revisions', ['levyPaymentId']);
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('levy_payment_revisions');
    await queryInterface.dropTable('levy_payments');
    await queryInterface.dropTable('levy_class_amounts');
    await queryInterface.dropTable('levies');
  },
};
