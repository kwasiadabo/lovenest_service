'use strict';

// Nullable everywhere: historical rows predate the concept of "which named
// cash/bank/mobile-money account received this" (they only ever had a
// `method` enum), and the opening-balance backfill script (see the
// accounting rollout plan) is what reconciles them — new writes are
// required (by each module's validators) to always supply one going
// forward.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    const column = {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: 'cash_accounts', key: 'id' },
      onDelete: 'NO ACTION',
    };
    await queryInterface.addColumn('bill_payments', 'cashAccountId', column);
    await queryInterface.addColumn('levy_payments', 'cashAccountId', column);
    await queryInterface.addColumn('admission_payments', 'cashAccountId', column);
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('bill_payments', 'cashAccountId');
    await queryInterface.removeColumn('levy_payments', 'cashAccountId');
    await queryInterface.removeColumn('admission_payments', 'cashAccountId');
  },
};
