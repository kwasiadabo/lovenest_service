'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('transport_invoices', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      schoolId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'schools', key: 'id' },
        onDelete: 'CASCADE',
      },
      studentTransportId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'student_transport', key: 'id' },
        onDelete: 'NO ACTION',
      },
      studentId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'students', key: 'id' },
        onDelete: 'NO ACTION',
      },
      vehicleId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'vehicles', key: 'id' },
        onDelete: 'NO ACTION',
      },
      billingCycle: { type: Sequelize.ENUM('TERMLY', 'MONTHLY'), allowNull: false },
      termId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'terms', key: 'id' },
        onDelete: 'NO ACTION',
      },
      periodMonth: { type: Sequelize.INTEGER, allowNull: true },
      periodYear: { type: Sequelize.INTEGER, allowNull: true },
      periodKey: { type: Sequelize.STRING(40), allowNull: false },
      periodLabel: { type: Sequelize.STRING(60), allowNull: false },
      dueDate: { type: Sequelize.DATEONLY, allowNull: false },
      amountPesewas: { type: Sequelize.INTEGER, allowNull: false },
      createdByUserId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'NO ACTION',
      },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('transport_invoices', ['schoolId']);
    await queryInterface.addIndex('transport_invoices', ['studentId']);
    await queryInterface.addIndex('transport_invoices', ['termId']);
    await queryInterface.addIndex('transport_invoices', ['studentTransportId', 'periodKey'], { unique: true });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('transport_invoices');
  },
};
