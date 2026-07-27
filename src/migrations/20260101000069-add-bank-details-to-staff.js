'use strict';

// Needed to generate a salary advice (bank transfer instruction) grouped by
// bank once payroll is paid — see modules/payroll, StatutoryReturns' sibling
// report. All nullable: existing staff have none of this on file yet, and a
// staff member missing bank details should show up as "no bank on file" in
// the report rather than block the migration or the payroll run itself.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('staff', 'bankName', { type: Sequelize.STRING(100), allowNull: true });
    await queryInterface.addColumn('staff', 'bankBranch', { type: Sequelize.STRING(100), allowNull: true });
    await queryInterface.addColumn('staff', 'bankAccountNumber', { type: Sequelize.STRING(50), allowNull: true });
    await queryInterface.addColumn('staff', 'bankAccountName', { type: Sequelize.STRING(150), allowNull: true });
  },
  down: async (queryInterface) => {
    await queryInterface.removeColumn('staff', 'bankAccountName');
    await queryInterface.removeColumn('staff', 'bankAccountNumber');
    await queryInterface.removeColumn('staff', 'bankBranch');
    await queryInterface.removeColumn('staff', 'bankName');
  },
};
