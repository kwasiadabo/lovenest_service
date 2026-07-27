'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('bills', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      schoolId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'schools', key: 'id' },
        onDelete: 'CASCADE',
      },
      // NO ACTION, not CASCADE — schoolId already cascades from School, and
      // SQL Server rejects a second cascade path to the same root table.
      studentId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'students', key: 'id' },
        onDelete: 'NO ACTION',
      },
      academicYearId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'academic_years', key: 'id' },
        onDelete: 'NO ACTION',
      },
      termId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'terms', key: 'id' },
        onDelete: 'NO ACTION',
      },
      status: { type: Sequelize.ENUM('PROVISIONAL', 'CONFIRMED'), allowNull: false, defaultValue: 'PROVISIONAL' },
      totalPesewas: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      confirmedByUserId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'NO ACTION',
      },
      confirmedAt: { type: Sequelize.DATE, allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('bills', ['schoolId']);
    await queryInterface.addIndex('bills', ['studentId']);
    await queryInterface.addIndex('bills', ['termId']);
    await queryInterface.addIndex('bills', ['status']);
    await queryInterface.addIndex('bills', ['studentId', 'termId'], { unique: true });

    await queryInterface.createTable('bill_items', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      schoolId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'schools', key: 'id' },
        onDelete: 'CASCADE',
      },
      billId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'bills', key: 'id' },
        onDelete: 'NO ACTION',
      },
      feeTypeId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'fee_types', key: 'id' },
        onDelete: 'NO ACTION',
      },
      amountPesewas: { type: Sequelize.INTEGER, allowNull: false },
      source: { type: Sequelize.ENUM('STANDARD', 'SPECIAL'), allowNull: false, defaultValue: 'STANDARD' },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('bill_items', ['schoolId']);
    await queryInterface.addIndex('bill_items', ['billId']);
    await queryInterface.addIndex('bill_items', ['feeTypeId']);

    await queryInterface.createTable('bill_payments', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      schoolId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'schools', key: 'id' },
        onDelete: 'CASCADE',
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
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('bill_payments', ['schoolId']);
    await queryInterface.addIndex('bill_payments', ['studentId']);
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('bill_payments');
    await queryInterface.dropTable('bill_items');
    await queryInterface.dropTable('bills');
  },
};
