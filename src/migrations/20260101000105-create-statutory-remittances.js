'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('statutory_remittances', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      schoolId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'schools', key: 'id' },
        onDelete: 'CASCADE',
      },
      payrollRunId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'payroll_runs', key: 'id' },
        onDelete: 'NO ACTION',
      },
      type: { type: Sequelize.ENUM('PAYE', 'SSNIT'), allowNull: false },
      amountPesewas: { type: Sequelize.INTEGER, allowNull: false },
      remittanceDate: { type: Sequelize.DATEONLY, allowNull: false },
      cashAccountId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'cash_accounts', key: 'id' },
        onDelete: 'NO ACTION',
      },
      description: { type: Sequelize.STRING(255), allowNull: true },
      journalEntryId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'journal_entries', key: 'id' },
        onDelete: 'NO ACTION',
      },
      createdByUserId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'NO ACTION',
      },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('statutory_remittances', ['schoolId']);
    await queryInterface.addIndex('statutory_remittances', ['payrollRunId']);
    // One remittance per type per payroll run — the actual duplicate guard,
    // enforced at the DB level in addition to the app-level check in
    // payroll/service.js#recordStatutoryRemittance.
    await queryInterface.addIndex('statutory_remittances', ['schoolId', 'payrollRunId', 'type'], {
      unique: true,
      name: 'statutory_remittances_school_run_type_unique',
    });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('statutory_remittances');
  },
};
