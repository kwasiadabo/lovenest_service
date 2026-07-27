'use strict';

// Splits "approved" (liability recognized) from "paid" (cash actually
// moved) — see accounting subsystem plan. Existing APPROVED rows predate
// this split and already carry paymentMethod/paymentReference/paidDate set
// at approval time, so they're backfilled straight to PAID (the old
// behavior was "approval IS payment") rather than left ambiguously UNPAID.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('expense_requests', 'paymentStatus', {
      type: Sequelize.ENUM('UNPAID', 'PAID'),
      allowNull: false,
      defaultValue: 'UNPAID',
    });
    await queryInterface.addColumn('expense_requests', 'cashAccountId', {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: 'cash_accounts', key: 'id' },
      onDelete: 'NO ACTION',
    });
    await queryInterface.sequelize.query(
      "UPDATE expense_requests SET paymentStatus = 'PAID' WHERE status = 'APPROVED'",
    );
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('expense_requests', 'cashAccountId');
    await queryInterface.removeColumn('expense_requests', 'paymentStatus');
  },
};
