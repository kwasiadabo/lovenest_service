'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('admission_payment_items', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      schoolId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'schools', key: 'id' },
        onDelete: 'CASCADE',
      },
      // NO ACTION, not CASCADE — schoolId already cascades from School, and
      // SQL Server rejects a second cascade path to the same root table.
      admissionPaymentId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'admission_payments', key: 'id' },
        onDelete: 'NO ACTION',
      },
      feeTypeId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'fee_types', key: 'id' },
        onDelete: 'NO ACTION',
      },
      amountPesewas: { type: Sequelize.INTEGER, allowNull: false },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('admission_payment_items', ['schoolId']);
    await queryInterface.addIndex('admission_payment_items', ['admissionPaymentId']);
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('admission_payment_items');
  },
};
