'use strict';

// Receipts now keep their original number across edits (see
// BillPaymentRevision for the edit trail instead) — this column is no
// longer written to.
module.exports = {
  up: async (queryInterface) => {
    await queryInterface.removeColumn('bill_payments', 'supersedesReceiptNumber');
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('bill_payments', 'supersedesReceiptNumber', {
      type: Sequelize.STRING(30),
      allowNull: true,
    });
  },
};
