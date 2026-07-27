'use strict';

// Needed on the SSNIT and PAYE statutory returns handed to SSNIT/GRA
// alongside the actual filing (see payroll/service.js's statutoryReturnRows
// equivalent in PayrollRunsPage.jsx) — both nullable, same as the bank
// details migration: existing staff have neither on file yet, and a staff
// member missing either should still show up on the return, just with a
// blank cell, rather than block the migration or a payroll run.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('staff', 'ssnitNumber', { type: Sequelize.STRING(30), allowNull: true });
    await queryInterface.addColumn('staff', 'ghanaCardNumber', { type: Sequelize.STRING(30), allowNull: true });
  },
  down: async (queryInterface) => {
    await queryInterface.removeColumn('staff', 'ghanaCardNumber');
    await queryInterface.removeColumn('staff', 'ssnitNumber');
  },
};
